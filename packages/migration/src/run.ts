/**
 * The importer: pulls raw records from a SnapshotSet, transforms + validates
 * them, and (unless dry-run) bulk-writes them through external_refs using
 * chunked multi-value INSERTs. All writes for one entity happen in a single
 * workspace RLS transaction. Every write is logged in import_records so the
 * run is queryable, resumable, and rollback-able. On dry-run: zero DB writes,
 * everything else runs so failures surface.
 *
 * Why bulk: VPS latency is ~340 ms per round-trip. Per-row inserts push
 * 3,500 rows × 5 RTs = 16 h. Bulk (200-row chunks × 3 stmts) fits in minutes.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  applications,
  applicationStatuses,
  candidateEducation,
  candidateExperience,
  candidates,
  companies,
  contacts,
  counters,
  externalRefs,
  importRuns,
  jobs,
  notes as notesTable,
  type Database,
  type Transaction
} from "@emerge/db";
import { withWorkspace } from "@emerge/db";

import type { EntityStats, EntityType, ImportMode } from "./types.js";
import { readJsonlSync, snapshotSet } from "./snapshot.js";
import {
  transformApplication,
  transformCandidate,
  transformCompany,
  transformContact,
  transformEducation,
  transformExperience,
  transformJob,
  transformNote
} from "./transform/index.js";
import { validate } from "./validate.js";
import { indexUserMap, type UserMapFile } from "./userMap.js";
import {
  APPLICATION_STATUS_MAP,
  UNKNOWN_APPLICATION_STATUS,
  mapApplicationStatus
} from "./maps.js";
import { sha256 } from "./transform/util.js";
import { bulkInsert, existingExternalIds } from "./bulk.js";

export interface RunOptions {
  db: Database;
  workspaceId: string;
  snapshotDir: string;
  userMap: UserMapFile;
  mode: ImportMode;
  only?: EntityType[];
  actorUserId?: string;
}

export interface RunResult {
  runId: string | null;
  mode: ImportMode;
  stats: Record<EntityType, EntityStats>;
  perEntityIssues: Record<EntityType, { failed: number; skipped: number; notes: string[] }>;
  applicationStatusTally: Record<string, number>;
  unmappedApplicationStatuses: Record<string, number>;
  duplicateCompanyNames: Array<{ name: string; count: number }>;
  candidatesWithoutEmail: number;
}

const ORDER: EntityType[] = [
  "company",
  "contact",
  "candidate",
  "candidate_education",
  "candidate_experience",
  "job",
  "application",
  "note"
];

const EMPTY_STATS = (): EntityStats => ({
  fetched: 0,
  created: 0,
  updated: 0,
  linked: 0,
  skipped: 0,
  failed: 0
});

export async function runImport(opts: RunOptions): Promise<RunResult> {
  const snap = snapshotSet(opts.snapshotDir);
  const isDry = opts.mode === "dry_run";
  const stats = Object.fromEntries(ORDER.map((k) => [k, EMPTY_STATS()])) as Record<
    EntityType,
    EntityStats
  >;
  const perEntityIssues = Object.fromEntries(
    ORDER.map((k) => [k, { failed: 0, skipped: 0, notes: [] as string[] }])
  ) as RunResult["perEntityIssues"];
  const applicationStatusTally: Record<string, number> = {};
  const unmappedApplicationStatuses: Record<string, number> = {};
  const companyNameCounts = new Map<string, number>();
  let candidatesWithoutEmail = 0;

  const userIdx = indexUserMap(opts.userMap);
  void userIdx;

  // Load snapshots (small enough for our data volumes: ~3.5k rows total).
  const rawUsers = readJsonlSync<Record<string, unknown>>(snap.users);
  void rawUsers;
  const rawClients = readJsonlSync<Record<string, unknown>>(snap.clients);
  const rawContacts = readJsonlSync<Record<string, unknown>>(snap.contacts);
  const rawCandidates = readJsonlSync<Record<string, unknown>>(snap.candidates);
  const rawJobs = readJsonlSync<Record<string, unknown>>(snap.jobs);
  const rawApplications = readJsonlSync<Record<string, unknown>>(snap.applications);
  const rawNotes = readJsonlSync<Record<string, unknown>>(snap.notes);

  // Transform + validate every record first (pure, safe for dry-run).
  const companies_ = rawClients.map(transformCompany);
  const contacts_ = rawContacts.map(transformContact);
  const candidates_ = rawCandidates.map(transformCandidate);
  const educations_ = rawCandidates.flatMap((r) =>
    transformEducation(String(r.id), (r as Record<string, unknown>).Educational_Details)
  );
  const experiences_ = rawCandidates.flatMap((r) =>
    transformExperience(String(r.id), (r as Record<string, unknown>).Experience_Details)
  );
  stats.company.fetched = rawClients.length;
  stats.contact.fetched = rawContacts.length;
  stats.candidate.fetched = rawCandidates.length;
  stats.candidate_education.fetched = educations_.length;
  stats.candidate_experience.fetched = experiences_.length;
  const jobs_ = rawJobs.map(transformJob);
  stats.job.fetched = rawJobs.length;
  const applications_ = rawApplications.map(transformApplication);
  stats.application.fetched = rawApplications.length;
  const notes_ = rawNotes.map(transformNote);
  stats.note.fetched = rawNotes.length;

  // Stats collection (runs regardless of dry/import).
  for (const c of companies_) {
    const key = c.shape.name.toLowerCase();
    companyNameCounts.set(key, (companyNameCounts.get(key) ?? 0) + 1);
  }
  for (const c of candidates_) if (!c.shape.email) candidatesWithoutEmail++;
  for (const a of applications_) {
    const raw = rawApplications.find((r) => String(r.id) === a.externalId);
    const status = String(raw?.Application_Status ?? "");
    applicationStatusTally[status] = (applicationStatusTally[status] ?? 0) + 1;
    const resolved = mapApplicationStatus(status);
    if (resolved.statusKey === UNKNOWN_APPLICATION_STATUS.statusKey && status)
      unmappedApplicationStatuses[status] = (unmappedApplicationStatuses[status] ?? 0) + 1;
  }
  void APPLICATION_STATUS_MAP;

  const duplicateCompanyNames = Array.from(companyNameCounts.entries())
    .filter(([, n]) => n > 1)
    .map(([name, count]) => ({ name, count }));

  const only = new Set<EntityType>(opts.only ?? ORDER);

  if (isDry) {
    for (const [ent, arr] of [
      ["company", companies_],
      ["contact", contacts_],
      ["candidate", candidates_],
      ["job", jobs_],
      ["application", applications_],
      ["note", notes_]
    ] as const) {
      if (!only.has(ent)) continue;
      for (const t of arr) {
        const v = validate(t as never);
        if (!v.ok) {
          stats[ent].failed++;
          perEntityIssues[ent].notes.push(v.errors[0] ?? "validation failed");
        } else {
          stats[ent].created++;
        }
      }
    }
    return {
      runId: null,
      mode: opts.mode,
      stats,
      perEntityIssues,
      applicationStatusTally,
      unmappedApplicationStatuses,
      duplicateCompanyNames,
      candidatesWithoutEmail
    };
  }

  // Real import from here on.
  const runId = await createRunRow(
    opts.db,
    opts.workspaceId,
    opts.mode,
    opts.snapshotDir,
    opts.actorUserId
  );
  const refCache = new Map<string, string>();

  const runOne = <T>(fn: (tx: Transaction) => Promise<T>) =>
    withWorkspace(opts.db, opts.workspaceId, fn);

  if (only.has("company"))
    await runOne((tx) =>
      importCompanies(
        tx,
        runId,
        opts.workspaceId,
        companies_,
        stats.company,
        perEntityIssues.company,
        refCache
      )
    );
  if (only.has("contact"))
    await runOne((tx) =>
      importContacts(
        tx,
        runId,
        opts.workspaceId,
        contacts_,
        stats.contact,
        perEntityIssues.contact,
        refCache
      )
    );
  if (only.has("candidate"))
    await runOne((tx) =>
      importCandidates(
        tx,
        runId,
        opts.workspaceId,
        candidates_,
        stats.candidate,
        perEntityIssues.candidate,
        refCache
      )
    );
  if (only.has("candidate_education"))
    await runOne((tx) =>
      importEducations(
        tx,
        runId,
        opts.workspaceId,
        educations_,
        stats.candidate_education,
        perEntityIssues.candidate_education,
        refCache
      )
    );
  if (only.has("candidate_experience"))
    await runOne((tx) =>
      importExperiences(
        tx,
        runId,
        opts.workspaceId,
        experiences_,
        stats.candidate_experience,
        perEntityIssues.candidate_experience,
        refCache
      )
    );
  if (only.has("job"))
    await runOne((tx) =>
      importJobs(tx, runId, opts.workspaceId, jobs_, stats.job, perEntityIssues.job, refCache)
    );
  if (only.has("application")) {
    await runOne((tx) => ensureStatusDictionary(tx, opts.workspaceId));
    await runOne((tx) =>
      importApplications(
        tx,
        runId,
        opts.workspaceId,
        applications_,
        stats.application,
        perEntityIssues.application,
        refCache
      )
    );
  }
  if (only.has("note"))
    await runOne((tx) =>
      importNotes(tx, runId, opts.workspaceId, notes_, stats.note, perEntityIssues.note, refCache)
    );

  await finishRunRow(opts.db, runId, stats);

  return {
    runId,
    mode: opts.mode,
    stats,
    perEntityIssues,
    applicationStatusTally,
    unmappedApplicationStatuses,
    duplicateCompanyNames,
    candidatesWithoutEmail
  };
}

// ---------------------------------------------------------------------------
// Import-run bookkeeping
// ---------------------------------------------------------------------------

async function createRunRow(
  db: Database,
  workspaceId: string,
  mode: ImportMode,
  snapshotDir: string,
  actorUserId?: string
): Promise<string> {
  const [row] = await withWorkspace(db, workspaceId, async (tx) =>
    tx
      .insert(importRuns)
      .values({ workspaceId, mode, snapshotDir, createdBy: actorUserId ?? null })
      .returning({ id: importRuns.id })
  );
  if (!row) throw new Error("failed to create import_runs row");
  return row.id;
}

async function finishRunRow(db: Database, runId: string, stats: Record<string, EntityStats>) {
  const [existing] = await db
    .select({ workspaceId: importRuns.workspaceId })
    .from(importRuns)
    .where(eq(importRuns.id, runId));
  if (!existing) return;
  await withWorkspace(db, existing.workspaceId, async (tx) => {
    await tx
      .update(importRuns)
      .set({ status: "completed", finishedAt: new Date(), stats })
      .where(eq(importRuns.id, runId));
  });
}

// ---------------------------------------------------------------------------
// Per-entity importers (all bulk)
// ---------------------------------------------------------------------------

async function reserveHumanIds(
  tx: Transaction,
  workspaceId: string,
  entityType: string,
  count: number
): Promise<number> {
  if (count === 0) return 0;
  const [row] = await tx
    .insert(counters)
    .values({ workspaceId, entityType, value: count })
    .onConflictDoUpdate({
      target: [counters.workspaceId, counters.entityType],
      set: { value: sql`${counters.value} + ${count}` }
    })
    .returning({ value: counters.value });
  return row!.value;
}

function humanIdFor(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

async function importCompanies(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformCompany>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "company");
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformCompany>["shape"];
    hash: string;
    passthrough: Record<string, unknown>;
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      refCache.set(
        `company:${t.externalId}`,
        refCache.get(`company:${t.externalId}`) ?? "__existing__"
      );
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      issues.notes.push(v.errors[0] ?? "validation failed");
      continue;
    }
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256(t.shape),
      passthrough: t.passthrough
    });
  }
  await bulkInsert(tx, {
    tableName: "companies",
    workspaceId,
    runId,
    entityType: "company",
    rows: eligible,
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      return {
        workspace_id: workspaceId,
        name: r.shape.name,
        website: r.shape.website,
        domain: r.shape.domain,
        industry: r.shape.industry,
        phone: r.shape.phone,
        description: r.shape.description,
        custom_fields: { zoho: e.passthrough }
      };
    }
  });
  stats.created += eligible.length;
  // Refresh cache for existing rows (unknown internal id — leave placeholder; children re-lookup as needed).
  for (const t of batch) {
    if (existing.has(t.externalId) && refCache.get(`company:${t.externalId}`) === "__existing__") {
      const [row] = await tx
        .select({ id: externalRefs.internalId })
        .from(externalRefs)
        .where(
          and(
            eq(externalRefs.workspaceId, workspaceId),
            eq(externalRefs.source, "zoho"),
            eq(externalRefs.entityType, "company"),
            eq(externalRefs.externalId, t.externalId)
          )
        );
      if (row) refCache.set(`company:${t.externalId}`, row.id);
    }
  }
  void companies;
}

async function importContacts(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformContact>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "contact");
  await primeCache(tx, workspaceId, "company", refCache);
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformContact>["shape"];
    hash: string;
    extra: Record<string, unknown>;
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      issues.notes.push(v.errors[0] ?? "validation failed");
      continue;
    }
    const companyRef = t.parentRefs.find((r) => r.role === "company");
    const companyId = companyRef
      ? (refCache.get(`company:${companyRef.externalId}`) ?? null)
      : null;
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256({ shape: t.shape, companyId }),
      extra: { company_id: companyId, custom_fields: { zoho: t.passthrough } }
    });
  }
  await bulkInsert(tx, {
    tableName: "contacts",
    workspaceId,
    runId,
    entityType: "contact",
    rows: eligible.map((e) => ({ externalId: e.externalId, shape: e.shape, hash: e.hash })),
    refCache,
    shapeToColumns: (r, _id) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      return {
        workspace_id: workspaceId,
        first_name: r.shape.firstName,
        last_name: r.shape.lastName,
        title: r.shape.title,
        email: r.shape.email,
        secondary_email: r.shape.secondaryEmail,
        work_phone: r.shape.workPhone,
        mobile: r.shape.mobile,
        linkedin_url: r.shape.linkedin,
        is_primary: r.shape.isPrimary,
        ...e.extra
      };
    }
  });
  stats.created += eligible.length;
  void contacts;
}

async function importCandidates(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformCandidate>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "candidate");
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformCandidate>["shape"];
    hash: string;
    passthrough: Record<string, unknown>;
    source: "parser" | "manual" | "import" | "referral" | "api";
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      continue;
    }
    const source = (["parser", "manual", "import", "referral", "api"] as const).includes(
      t.shape.source as never
    )
      ? (t.shape.source as "parser" | "manual" | "import" | "referral" | "api")
      : "import";
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256(t.shape),
      passthrough: t.passthrough,
      source
    });
  }
  const nextHi = await reserveHumanIds(tx, workspaceId, "candidate", eligible.length);
  const firstHi = nextHi - eligible.length + 1;
  await bulkInsert(tx, {
    tableName: "candidates",
    workspaceId,
    runId,
    entityType: "candidate",
    rows: eligible,
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      const salaryText =
        r.shape.currentSalary != null || r.shape.expectedSalary != null
          ? [
              r.shape.currentSalary ? `Current: ${r.shape.currentSalary}` : null,
              r.shape.expectedSalary ? `Expected: ${r.shape.expectedSalary}` : null
            ]
              .filter(Boolean)
              .join(" | ")
          : null;
      return {
        workspace_id: workspaceId,
        first_name: r.shape.firstName,
        last_name: r.shape.lastName,
        title: r.shape.currentTitle,
        current_employer: r.shape.currentEmployer,
        email: r.shape.email,
        secondary_email: r.shape.secondaryEmail,
        phone: r.shape.phone,
        mobile: r.shape.mobile,
        city: r.shape.city,
        country: r.shape.country,
        linkedin_url: r.shape.linkedin,
        website_url: r.shape.website,
        skills: r.shape.skills,
        experience_years: r.shape.experienceYears,
        salary_text: salaryText,
        source: e.source,
        custom_fields: { zoho: e.passthrough }
      };
    },
    extraPerRow: (_r, i) => ({ human_id: humanIdFor("CAND", firstHi + i) })
  });
  stats.created += eligible.length;
  void candidates;
}

async function importEducations(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformEducation>,
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "candidate_education");
  await primeCache(tx, workspaceId, "candidate", refCache);
  const eligible: typeof batch = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const candRef = t.parentRefs.find((r) => r.role === "candidate");
    const parent = candRef ? refCache.get(`candidate:${candRef.externalId}`) : null;
    if (!parent) {
      stats.skipped++;
      issues.skipped++;
      continue;
    }
    eligible.push(t);
  }
  if (!eligible.length) return;
  await bulkInsert(tx, {
    tableName: "candidate_education",
    workspaceId,
    runId,
    entityType: "candidate_education",
    rows: eligible.map((e) => ({
      externalId: e.externalId,
      shape: e.shape,
      hash: sha256(e.shape)
    })),
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      const parent = refCache.get(`candidate:${e.parentRefs[0]!.externalId}`)!;
      const startYear = r.shape.startMonth ? Number(r.shape.startMonth.slice(0, 4)) : null;
      const endYear = r.shape.endMonth ? Number(r.shape.endMonth.slice(0, 4)) : null;
      return {
        workspace_id: workspaceId,
        candidate_id: parent,
        institution: r.shape.institute,
        degree: r.shape.degree,
        field_of_study: r.shape.major,
        start_year: Number.isFinite(startYear) ? startYear : null,
        end_year: Number.isFinite(endYear) ? endYear : null,
        sort_order: r.shape.sortOrder
      };
    }
  });
  stats.created += eligible.length;
  void candidateEducation;
}

async function importExperiences(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformExperience>,
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "candidate_experience");
  await primeCache(tx, workspaceId, "candidate", refCache);
  const eligible: typeof batch = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const parent = refCache.get(`candidate:${t.parentRefs[0]!.externalId}`);
    if (!parent) {
      stats.skipped++;
      issues.skipped++;
      continue;
    }
    eligible.push(t);
  }
  if (!eligible.length) return;
  await bulkInsert(tx, {
    tableName: "candidate_experience",
    workspaceId,
    runId,
    entityType: "candidate_experience",
    rows: eligible.map((e) => ({
      externalId: e.externalId,
      shape: e.shape,
      hash: sha256(e.shape)
    })),
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      const parent = refCache.get(`candidate:${e.parentRefs[0]!.externalId}`)!;
      return {
        workspace_id: workspaceId,
        candidate_id: parent,
        title: r.shape.title,
        company: r.shape.company,
        summary: r.shape.summary,
        start_date: r.shape.startMonth,
        end_date: r.shape.endMonth,
        is_current: r.shape.isCurrent,
        sort_order: r.shape.sortOrder
      };
    }
  });
  stats.created += eligible.length;
  void candidateExperience;
}

async function importJobs(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformJob>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "job");
  await primeCache(tx, workspaceId, "company", refCache);
  await primeCache(tx, workspaceId, "contact", refCache);
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformJob>["shape"];
    hash: string;
    companyId: string;
    contactId: string | null;
    passthrough: Record<string, unknown>;
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      continue;
    }
    const companyRef = t.parentRefs.find((r) => r.role === "company")!;
    const companyId = refCache.get(`company:${companyRef.externalId}`);
    if (!companyId) {
      stats.skipped++;
      issues.skipped++;
      issues.notes.push(`job ${t.externalId}: company ${companyRef.externalId} not imported`);
      continue;
    }
    const contactRef = t.parentRefs.find((r) => r.role === "contact");
    const contactId = contactRef
      ? (refCache.get(`contact:${contactRef.externalId}`) ?? null)
      : null;
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256(t.shape),
      companyId,
      contactId,
      passthrough: t.passthrough
    });
  }
  const nextHi = await reserveHumanIds(tx, workspaceId, "job", eligible.length);
  const firstHi = nextHi - eligible.length + 1;
  await bulkInsert(tx, {
    tableName: "jobs",
    workspaceId,
    runId,
    entityType: "job",
    rows: eligible,
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      const status = (["open", "on_hold", "filled", "cancelled", "inactive"] as const).includes(
        r.shape.status as never
      )
        ? (r.shape.status as "open" | "on_hold" | "filled" | "cancelled" | "inactive")
        : "open";
      const workMode = r.shape.workMode === "remote" ? "remote" : "onsite";
      const location =
        [r.shape.city, r.shape.state, r.shape.country].filter(Boolean).join(", ") || null;
      return {
        workspace_id: workspaceId,
        title: r.shape.title,
        company_id: e.companyId,
        hiring_contact_id: e.contactId,
        status,
        work_mode: workMode,
        location,
        description: r.shape.description,
        positions: r.shape.positions ?? 1,
        salary_text: r.shape.salaryText,
        custom_fields: { zoho: e.passthrough }
      };
    },
    extraPerRow: (_r, i) => ({ human_id: humanIdFor("JOB", firstHi + i) })
  });
  stats.created += eligible.length;
  void jobs;
}

async function ensureStatusDictionary(tx: Transaction, workspaceId: string) {
  const rows: Array<{
    workspaceId: string;
    key: string;
    label: string;
    stage: "screening" | "submitted" | "interview" | "offered" | "hired" | "rejected" | "archived";
    sortOrder: number;
  }> = [];
  let i = 0;
  for (const [, m] of Object.entries(APPLICATION_STATUS_MAP)) {
    rows.push({ workspaceId, key: m.statusKey, label: m.label, stage: m.stage, sortOrder: i++ });
  }
  rows.push({
    workspaceId,
    key: UNKNOWN_APPLICATION_STATUS.statusKey,
    label: UNKNOWN_APPLICATION_STATUS.label,
    stage: UNKNOWN_APPLICATION_STATUS.stage,
    sortOrder: 999
  });
  await tx.insert(applicationStatuses).values(rows).onConflictDoNothing();
}

async function importApplications(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformApplication>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "application");
  await primeCache(tx, workspaceId, "candidate", refCache);
  await primeCache(tx, workspaceId, "job", refCache);
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformApplication>["shape"];
    hash: string;
    candidateId: string;
    jobId: string;
    passthrough: Record<string, unknown>;
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      continue;
    }
    const candRef = t.parentRefs.find((r) => r.role === "candidate")!;
    const jobRef = t.parentRefs.find((r) => r.role === "job")!;
    const candidateId = refCache.get(`candidate:${candRef.externalId}`);
    const jobId = refCache.get(`job:${jobRef.externalId}`);
    if (!candidateId || !jobId) {
      stats.skipped++;
      issues.skipped++;
      continue;
    }
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256(t.shape),
      candidateId,
      jobId,
      passthrough: t.passthrough
    });
  }
  const nextHi = await reserveHumanIds(tx, workspaceId, "application", eligible.length);
  const firstHi = nextHi - eligible.length + 1;
  await bulkInsert(tx, {
    tableName: "applications",
    workspaceId,
    runId,
    entityType: "application",
    rows: eligible,
    refCache,
    chunkSize: 100,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      const stage = (
        ["screening", "submitted", "interview", "offered", "hired", "rejected", "archived"] as const
      ).includes(r.shape.stage as never)
        ? (r.shape.stage as
            "screening" | "submitted" | "interview" | "offered" | "hired" | "rejected" | "archived")
        : "archived";
      return {
        workspace_id: workspaceId,
        candidate_id: e.candidateId,
        job_id: e.jobId,
        stage,
        status_key: r.shape.statusKey,
        rating: r.shape.rating,
        source: r.shape.source,
        custom_fields: { zoho: e.passthrough }
      };
    },
    extraPerRow: (_r, i) => ({ human_id: humanIdFor("APP", firstHi + i) })
  });
  stats.created += eligible.length;
  void applications;
}

async function importNotes(
  tx: Transaction,
  runId: string,
  workspaceId: string,
  batch: ReturnType<typeof transformNote>[],
  stats: EntityStats,
  issues: { failed: number; skipped: number; notes: string[] },
  refCache: Map<string, string>
) {
  const existing = await existingExternalIds(tx, workspaceId, "note");
  await Promise.all([
    primeCache(tx, workspaceId, "candidate", refCache),
    primeCache(tx, workspaceId, "job", refCache),
    primeCache(tx, workspaceId, "company", refCache),
    primeCache(tx, workspaceId, "contact", refCache),
    primeCache(tx, workspaceId, "application", refCache)
  ]);
  const eligible: Array<{
    externalId: string;
    shape: ReturnType<typeof transformNote>["shape"];
    hash: string;
    entityType: string;
    entityId: string;
  }> = [];
  for (const t of batch) {
    if (existing.has(t.externalId)) {
      stats.skipped++;
      continue;
    }
    const v = validate(t as never);
    if (!v.ok) {
      stats.failed++;
      issues.failed++;
      continue;
    }
    const parentRef = t.parentRefs.find((r) => r.role === "parent")!;
    const entityId = refCache.get(`${parentRef.entityType}:${parentRef.externalId}`);
    if (!entityId) {
      stats.skipped++;
      issues.skipped++;
      continue;
    }
    eligible.push({
      externalId: t.externalId,
      shape: t.shape,
      hash: sha256({ body: t.shape.body, entityId, entityType: parentRef.entityType }),
      entityType: parentRef.entityType,
      entityId
    });
  }
  await bulkInsert(tx, {
    tableName: "notes",
    workspaceId,
    runId,
    entityType: "note",
    rows: eligible.map((e) => ({ externalId: e.externalId, shape: e.shape, hash: e.hash })),
    refCache,
    shapeToColumns: (r) => {
      const e = eligible.find((x) => x.externalId === r.externalId)!;
      return {
        workspace_id: workspaceId,
        entity_type: e.entityType,
        entity_id: e.entityId,
        author_id: null,
        body: r.shape.body
      };
    }
  });
  stats.created += eligible.length;
  void notesTable;
}

// ---------------------------------------------------------------------------
// Ref cache priming
// ---------------------------------------------------------------------------

async function primeCache(
  tx: Transaction,
  workspaceId: string,
  entityType: EntityType,
  refCache: Map<string, string>
) {
  const rows = await tx
    .select({ externalId: externalRefs.externalId, internalId: externalRefs.internalId })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.workspaceId, workspaceId),
        eq(externalRefs.source, "zoho"),
        eq(externalRefs.entityType, entityType)
      )
    );
  for (const r of rows) refCache.set(`${entityType}:${r.externalId}`, r.internalId);
}
