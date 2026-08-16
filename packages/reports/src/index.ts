/**
 * Agency report aggregates (M14). Pure read-side computations over the M5 status
 * history + M10 submissions + M12 placements. Each report returns a tabular
 * shape ({columns, rows}) so the same result renders in the UI, exports to CSV,
 * and emails as an attachment without a second code path.
 *
 * Every function takes an explicit workspaceId and filters by it, so it works
 * both under the RLS-scoped request tx and on the worker's owner connection
 * (which bypasses RLS and sweeps one workspace at a time).
 */
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  companies,
  jobs,
  placements,
  submissions,
  users,
  type Database,
  type Transaction
} from "@emerge/db";

const DAY_MS = 86_400_000;
type Runner = Database | Transaction;

export const REPORT_KEYS = [
  "funnel",
  "submissionsBySourcer",
  "timeInStage",
  "timeToFirstSubmission",
  "clientHealth",
  "leaderboard"
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_LABELS: Record<ReportKey, string> = {
  funnel: "Pipeline funnel + conversion",
  submissionsBySourcer: "Submissions per sourcer",
  timeInStage: "Average time in stage",
  timeToFirstSubmission: "Time to first submission",
  clientHealth: "Client health",
  leaderboard: "Recruiter leaderboard"
};

export const reportFilters = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  /** Application owner / sourcer. */
  userId: z.string().uuid().optional(),
  /** Client company. */
  companyId: z.string().uuid().optional()
});
export type ReportFilters = z.infer<typeof reportFilters>;

export type ReportTable = {
  key: ReportKey;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};

const FUNNEL_STAGES = ["screening", "submitted", "interview", "offered", "hired"] as const;
const STAGE_LABEL: Record<string, string> = {
  screening: "Screening",
  submitted: "Submitted",
  interview: "Interview",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
  archived: "Archived"
};
const STAGE_INDEX: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s, i]));

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

/** Applications in scope: the workspace, undeleted, within the date + owner + client filters. */
async function scopedApplications(db: Runner, ws: string, f: ReportFilters) {
  const conds = [eq(applications.workspaceId, ws), isNull(applications.deletedAt)];
  if (f.from) conds.push(gte(applications.createdAt, f.from));
  if (f.to) conds.push(lte(applications.createdAt, f.to));
  if (f.userId) conds.push(eq(applications.ownerId, f.userId));
  if (f.companyId) conds.push(eq(jobs.companyId, f.companyId));
  return db
    .select({
      id: applications.id,
      stage: applications.stage,
      ownerId: applications.ownerId,
      jobId: applications.jobId,
      companyId: jobs.companyId,
      createdAt: applications.createdAt
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(...conds));
}

/** Every history transition for a set of applications, ordered per application. */
async function historyFor(db: Runner, ws: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      applicationId: applicationStatusHistory.applicationId,
      fromStage: applicationStatusHistory.fromStage,
      toStage: applicationStatusHistory.toStage,
      createdAt: applicationStatusHistory.createdAt
    })
    .from(applicationStatusHistory)
    .where(
      and(
        eq(applicationStatusHistory.workspaceId, ws),
        inArray(applicationStatusHistory.applicationId, ids)
      )
    )
    .orderBy(applicationStatusHistory.applicationId, applicationStatusHistory.createdAt);
}

export async function runFunnel(db: Runner, ws: string, f: ReportFilters): Promise<ReportTable> {
  const apps = await scopedApplications(db, ws, f);
  const ids = apps.map((a) => a.id);

  const currentCount: Record<string, number> = {};
  for (const s of [...FUNNEL_STAGES, "rejected", "archived"]) currentCount[s] = 0;
  for (const a of apps) currentCount[a.stage] = (currentCount[a.stage] ?? 0) + 1;

  // Furthest linear stage each application reached (rejected/archived keep the
  // screening baseline unless history shows they got further first).
  const reachedIdx = new Map<string, number>();
  for (const a of apps) reachedIdx.set(a.id, STAGE_INDEX[a.stage] ?? 0);
  for (const h of await historyFor(db, ws, ids)) {
    const i = STAGE_INDEX[h.toStage];
    if (i == null) continue;
    if (i > (reachedIdx.get(h.applicationId) ?? 0)) reachedIdx.set(h.applicationId, i);
  }
  const reached = FUNNEL_STAGES.map((_, i) => {
    let c = 0;
    for (const idx of reachedIdx.values()) if (idx >= i) c++;
    return c;
  });

  const rows = FUNNEL_STAGES.map((s, i) => {
    const step = i === 0 ? 100 : reached[i - 1] ? (reached[i]! / reached[i - 1]!) * 100 : 0;
    const top = reached[0] ? (reached[i]! / reached[0]!) * 100 : 0;
    return [STAGE_LABEL[s]!, currentCount[s] ?? 0, reached[i]!, round1(step), round1(top)];
  });
  return {
    key: "funnel",
    title: REPORT_LABELS.funnel,
    columns: ["Stage", "In stage now", "Ever reached", "From previous %", "From top %"],
    rows
  };
}

export async function runSubmissionsBySourcer(
  db: Runner,
  ws: string,
  f: ReportFilters
): Promise<ReportTable> {
  const conds = [eq(submissions.workspaceId, ws)];
  if (f.from) conds.push(gte(submissions.sentAt, f.from));
  if (f.to) conds.push(lte(submissions.sentAt, f.to));
  if (f.userId) conds.push(eq(submissions.sentById, f.userId));
  if (f.companyId) conds.push(eq(submissions.companyId, f.companyId));

  const raw = await db
    .select({
      name: users.name,
      total: sql<number>`count(*)`,
      weeks: sql<number>`count(distinct date_trunc('week', ${submissions.sentAt}))`
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.sentById))
    .where(and(...conds))
    .groupBy(users.name);

  const rows = raw
    .map((r) => {
      const total = Number(r.total);
      const weeks = Number(r.weeks);
      return [r.name ?? "Unassigned", total, weeks, round1(total / Math.max(weeks, 1))];
    })
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  return {
    key: "submissionsBySourcer",
    title: REPORT_LABELS.submissionsBySourcer,
    columns: ["Sourcer", "Submissions", "Weeks active", "Avg / week"],
    rows
  };
}

export async function runTimeInStage(
  db: Runner,
  ws: string,
  f: ReportFilters
): Promise<ReportTable> {
  const apps = await scopedApplications(db, ws, f);
  const createdAt = new Map(apps.map((a) => [a.id, a.createdAt.getTime()]));
  const hist = await historyFor(
    db,
    ws,
    apps.map((a) => a.id)
  );

  const byApp = new Map<string, { fromStage: string | null; toStage: string; at: number }[]>();
  for (const h of hist) {
    const arr = byApp.get(h.applicationId) ?? [];
    arr.push({ fromStage: h.fromStage, toStage: h.toStage, at: new Date(h.createdAt).getTime() });
    byApp.set(h.applicationId, arr);
  }

  const durations: Record<string, number[]> = {};
  for (const a of apps) {
    const trans = byApp.get(a.id) ?? [];
    let prevStage = trans[0]?.fromStage ?? "screening";
    let prevAt = createdAt.get(a.id)!;
    for (const t of trans) {
      const dur = (t.at - prevAt) / DAY_MS;
      if (dur >= 0) (durations[prevStage] ??= []).push(dur);
      prevStage = t.toStage;
      prevAt = t.at;
    }
    // The current (open) stage has no exit yet, so it is not counted.
  }

  const rows = [...FUNNEL_STAGES, "rejected", "archived"]
    .filter((s) => durations[s]?.length)
    .map((s) => [STAGE_LABEL[s]!, round1(avg(durations[s]!)), durations[s]!.length]);
  return {
    key: "timeInStage",
    title: REPORT_LABELS.timeInStage,
    columns: ["Stage", "Avg days", "Samples"],
    rows
  };
}

export async function runTimeToFirstSubmission(
  db: Runner,
  ws: string,
  f: ReportFilters
): Promise<ReportTable> {
  const apps = await scopedApplications(db, ws, f);
  const createdAt = new Map(apps.map((a) => [a.id, a.createdAt.getTime()]));
  const ids = apps.map((a) => a.id);

  const firstSub = new Map<string, number>();
  if (ids.length) {
    const subs = await db
      .select({
        applicationId: submissions.applicationId,
        firstAt: sql<string>`min(${submissions.sentAt})`
      })
      .from(submissions)
      .where(and(eq(submissions.workspaceId, ws), inArray(submissions.applicationId, ids)))
      .groupBy(submissions.applicationId);
    for (const s of subs)
      if (s.firstAt) firstSub.set(s.applicationId, new Date(s.firstAt).getTime());
  }

  const days: number[] = [];
  for (const [id, created] of createdAt) {
    const sub = firstSub.get(id);
    if (sub == null) continue;
    const d = (sub - created) / DAY_MS;
    if (d >= 0) days.push(d);
  }
  return {
    key: "timeToFirstSubmission",
    title: REPORT_LABELS.timeToFirstSubmission,
    columns: ["Metric", "Value"],
    rows: [
      ["Applications with a submission", days.length],
      ["Avg days to first submission", round1(avg(days))],
      ["Median days", round1(median(days))]
    ]
  };
}

export async function runClientHealth(
  db: Runner,
  ws: string,
  f: ReportFilters
): Promise<ReportTable> {
  const jobConds = [eq(jobs.workspaceId, ws), isNull(jobs.deletedAt)];
  if (f.companyId) jobConds.push(eq(jobs.companyId, f.companyId));
  const jobRows = await db
    .select({
      companyId: jobs.companyId,
      companyName: companies.name,
      openJobs: sql<number>`count(*) filter (where ${jobs.status} = 'open')`
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(...jobConds))
    .groupBy(jobs.companyId, companies.name);

  const appConds = [
    eq(applications.workspaceId, ws),
    isNull(applications.deletedAt),
    inArray(applications.stage, ["screening", "submitted", "interview", "offered"])
  ];
  if (f.companyId) appConds.push(eq(jobs.companyId, f.companyId));
  const activeRows = await db
    .select({ companyId: jobs.companyId, c: sql<number>`count(*)` })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(...appConds))
    .groupBy(jobs.companyId);
  const activeBy = new Map(activeRows.map((r) => [r.companyId, Number(r.c)]));

  const subConds = [eq(submissions.workspaceId, ws)];
  if (f.companyId) subConds.push(eq(submissions.companyId, f.companyId));
  const lastSubRows = await db
    .select({ companyId: submissions.companyId, last: sql<string>`max(${submissions.sentAt})` })
    .from(submissions)
    .where(and(...subConds))
    .groupBy(submissions.companyId);
  const lastSubBy = new Map(lastSubRows.map((r) => [r.companyId, r.last]));

  const placeConds = [eq(placements.workspaceId, ws)];
  if (f.from) placeConds.push(gte(placements.createdAt, f.from));
  if (f.to) placeConds.push(lte(placements.createdAt, f.to));
  if (f.companyId) placeConds.push(eq(jobs.companyId, f.companyId));
  const hireRows = await db
    .select({ companyId: jobs.companyId, c: sql<number>`count(*)` })
    .from(placements)
    .innerJoin(jobs, eq(jobs.id, placements.jobId))
    .where(and(...placeConds))
    .groupBy(jobs.companyId);
  const hiresBy = new Map(hireRows.map((r) => [r.companyId, Number(r.c)]));

  const rows = jobRows
    .filter((r) => r.companyId)
    .map((r) => {
      const last = lastSubBy.get(r.companyId);
      return [
        r.companyName ?? "Unknown",
        Number(r.openJobs),
        activeBy.get(r.companyId) ?? 0,
        last ? new Date(last).toISOString().slice(0, 10) : null,
        hiresBy.get(r.companyId) ?? 0
      ];
    })
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  return {
    key: "clientHealth",
    title: REPORT_LABELS.clientHealth,
    columns: ["Client", "Open jobs", "Active apps", "Last submission", "Hires"],
    rows
  };
}

type OwnerTally = {
  submitted: number;
  interview: number;
  offered: number;
  hired: number;
  fees: number;
};
const emptyTally = (): OwnerTally => ({
  submitted: 0,
  interview: 0,
  offered: 0,
  hired: 0,
  fees: 0
});

export async function runLeaderboard(
  db: Runner,
  ws: string,
  f: ReportFilters
): Promise<ReportTable> {
  const apps = await scopedApplications(db, ws, f);
  const ids = apps.map((a) => a.id);

  const reached = new Map<string, Set<string>>();
  for (const h of await historyFor(db, ws, ids)) {
    const set = reached.get(h.applicationId) ?? new Set<string>();
    set.add(h.toStage);
    reached.set(h.applicationId, set);
  }

  const byOwner = new Map<string | null, OwnerTally>();
  const tally = (o: string | null) => {
    const e = byOwner.get(o) ?? emptyTally();
    byOwner.set(o, e);
    return e;
  };
  for (const a of apps) {
    const set = reached.get(a.id) ?? new Set<string>();
    set.add(a.stage);
    const e = tally(a.ownerId);
    if (set.has("submitted")) e.submitted++;
    if (set.has("interview")) e.interview++;
    if (set.has("offered")) e.offered++;
    if (set.has("hired")) e.hired++;
  }

  const placeConds = [eq(placements.workspaceId, ws)];
  if (f.from) placeConds.push(gte(placements.createdAt, f.from));
  if (f.to) placeConds.push(lte(placements.createdAt, f.to));
  if (f.userId) placeConds.push(eq(placements.placedById, f.userId));
  const placeRows = await db
    .select({
      placedById: placements.placedById,
      fees: sql<number>`coalesce(sum(${placements.feeAmount}), 0)`
    })
    .from(placements)
    .where(and(...placeConds))
    .groupBy(placements.placedById);
  for (const p of placeRows) tally(p.placedById).fees += Number(p.fees);

  const ownerIds = [...byOwner.keys()].filter((x): x is string => !!x);
  const nameBy = new Map<string, string>();
  if (ownerIds.length) {
    const us = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, ownerIds));
    for (const u of us) nameBy.set(u.id, u.name);
  }

  const rows = [...byOwner.entries()]
    .map(([o, e]) => [
      o ? (nameBy.get(o) ?? "Unknown") : "Unassigned",
      e.submitted,
      e.interview,
      e.offered,
      e.hired,
      e.fees
    ])
    .sort((a, b) => (b[4] as number) - (a[4] as number) || (b[5] as number) - (a[5] as number));
  return {
    key: "leaderboard",
    title: REPORT_LABELS.leaderboard,
    columns: ["User", "Submissions", "Interviews", "Offers", "Hires", "Placement fees"],
    rows
  };
}

const RUNNERS: Record<
  ReportKey,
  (db: Runner, ws: string, f: ReportFilters) => Promise<ReportTable>
> = {
  funnel: runFunnel,
  submissionsBySourcer: runSubmissionsBySourcer,
  timeInStage: runTimeInStage,
  timeToFirstSubmission: runTimeToFirstSubmission,
  clientHealth: runClientHealth,
  leaderboard: runLeaderboard
};

export function runReport(
  db: Runner,
  ws: string,
  key: ReportKey,
  f: ReportFilters
): Promise<ReportTable> {
  return RUNNERS[key](db, ws, f);
}

/** RFC 4180 CSV of a report table (used by the scheduled email attachment). */
export function reportToCsv(t: ReportTable): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map(esc).join(","), ...t.rows.map((r) => r.map(esc).join(","))];
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Scheduling math (shared by the reportSchedules router and the delivery
// worker). Everything is computed in UTC so it is stable across machines.
// ---------------------------------------------------------------------------

export const REPORT_CADENCES = ["daily", "weekly", "monthly"] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

/** The next UTC send time strictly after `from` for a cadence + time-of-day. */
export function computeNextRun(
  cadence: ReportCadence,
  opts: { hourUtc: number; dayOfWeek?: number | null; dayOfMonth?: number | null },
  from: Date
): Date {
  const hour = Math.min(Math.max(Math.trunc(opts.hourUtc), 0), 23);
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);

  if (cadence === "daily") {
    if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (cadence === "weekly") {
    const target = (((opts.dayOfWeek ?? 1) % 7) + 7) % 7;
    let delta = (target - next.getUTCDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }
  // monthly: clamp to 28 so every month has the day.
  const dom = Math.min(Math.max(opts.dayOfMonth ?? 1, 1), 28);
  next.setUTCDate(dom);
  if (next <= from) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(dom);
  }
  return next;
}
