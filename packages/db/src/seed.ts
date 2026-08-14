/**
 * Performance seed: creates a throwaway workspace with 1,000 companies and
 * 10,000 contacts so list pages can be exercised at production-like volume.
 *
 *   export DATABASE_URL=... && pnpm --filter @emerge/db seed
 *
 * Every run creates a fresh "Perf Seed" workspace; drop it by deleting the
 * workspace row (tenant rows cascade).
 */
import {
  createDb,
  applicationStatusHistory,
  applicationStatuses,
  applications,
  candidates,
  companies,
  contacts,
  counters,
  jobs,
  memberships,
  users,
  workspaces
} from "./index";

const COMPANY_COUNT = 1_000;
const CONTACT_COUNT = 10_000;
const CANDIDATE_COUNT = 10_000;
const JOB_COUNT = 500;
const BATCH = 1_000;

const FIRST = [
  "Anna",
  "Ben",
  "Clara",
  "David",
  "Eva",
  "Felix",
  "Greta",
  "Hans",
  "Iris",
  "Jonas",
  "Katrin",
  "Lukas",
  "Mia",
  "Nico",
  "Olga",
  "Paul",
  "Quinn",
  "Rosa",
  "Stefan",
  "Tara"
];
const LAST = [
  "Mueller",
  "Schmidt",
  "Schneider",
  "Fischer",
  "Weber",
  "Meyer",
  "Wagner",
  "Becker",
  "Schulz",
  "Hoffmann",
  "Koch",
  "Bauer",
  "Richter",
  "Klein",
  "Wolf",
  "Neumann",
  "Braun",
  "Krueger",
  "Hofmann",
  "Lange"
];
const COMPANY_A = [
  "Alpine",
  "Nord",
  "Delta",
  "Vertex",
  "Prime",
  "Atlas",
  "Nova",
  "Summit",
  "Core",
  "Bright",
  "Swift",
  "Solid",
  "Metro",
  "Global",
  "First",
  "United",
  "Central",
  "Modern",
  "Digital",
  "Rapid"
];
const COMPANY_B = [
  "Consulting",
  "Engineering",
  "Logistics",
  "Systems",
  "Manufacturing",
  "Solutions",
  "Partners",
  "Industries",
  "Automotive",
  "Technologies",
  "Group",
  "Services",
  "Dynamics",
  "Works",
  "Labs",
  "Holdings",
  "Media",
  "Energy",
  "Capital",
  "Networks"
];
const INDUSTRIES = [
  "Automotive",
  "Consulting",
  "Manufacturing",
  "Logistics",
  "Software",
  "Energy",
  "Finance",
  "Healthcare",
  "Retail",
  "Construction"
];
const CITIES = [
  "Munich, Germany",
  "Stuttgart, Germany",
  "Berlin, Germany",
  "Vienna, Austria",
  "Zurich, Switzerland",
  "Hamburg, Germany",
  "Frankfurt, Germany",
  "London, UK",
  "Amsterdam, Netherlands",
  "Paris, France"
];
const TITLES = [
  "Head of HR",
  "Talent Acquisition Manager",
  "HR Business Partner",
  "Managing Director",
  "Recruiting Lead",
  "People Operations Manager",
  "CEO",
  "COO",
  "Engineering Manager",
  "Plant Manager"
];
const STATUSES = ["prospect", "active", "dormant"] as const;
const JOB_TITLES = [
  "Process Engineer",
  "Mechanical Design Engineer",
  "Project Manager",
  "Production Supervisor",
  "Quality Manager",
  "Automation Engineer",
  "Maintenance Technician",
  "Plant Manager",
  "Supply Chain Analyst",
  "Electrical Engineer",
  "R&D Chemist",
  "Site Manager"
];
const JOB_STATUSES = ["open", "on_hold", "filled", "cancelled", "inactive"] as const;
const EMPLOYMENT = ["permanent", "contract", "temporary"] as const;
const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
const APPLICATION_COUNT = 800;
// The 13 seeded application statuses (key, label, stage, order, entry, terminal).
// Kept in sync with apps/web/src/lib/applications.ts (that module is web-only).
const APP_STATUSES = [
  {
    key: "associated",
    label: "Associated",
    stage: "screening",
    sortOrder: 1,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "in_review",
    label: "In Review",
    stage: "screening",
    sortOrder: 2,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "submitted_to_client",
    label: "Submitted to client",
    stage: "submitted",
    sortOrder: 3,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "approved_by_client",
    label: "Approved by client",
    stage: "submitted",
    sortOrder: 4,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "interview_to_be_scheduled",
    label: "Interview to be scheduled",
    stage: "interview",
    sortOrder: 5,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "interview_scheduled",
    label: "Interview scheduled",
    stage: "interview",
    sortOrder: 6,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "interview_in_progress",
    label: "Interview in progress",
    stage: "interview",
    sortOrder: 7,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "offer_made",
    label: "Offer made",
    stage: "offered",
    sortOrder: 8,
    isEntry: true,
    isTerminal: false
  },
  { key: "hired", label: "Hired", stage: "hired", sortOrder: 9, isEntry: true, isTerminal: true },
  {
    key: "unqualified",
    label: "Unqualified",
    stage: "rejected",
    sortOrder: 10,
    isEntry: false,
    isTerminal: true
  },
  {
    key: "rejected_by_client",
    label: "Rejected by client",
    stage: "rejected",
    sortOrder: 11,
    isEntry: false,
    isTerminal: true
  },
  {
    key: "rejected",
    label: "Rejected",
    stage: "rejected",
    sortOrder: 12,
    isEntry: true,
    isTerminal: true
  },
  {
    key: "archived",
    label: "Archived",
    stage: "archived",
    sortOrder: 13,
    isEntry: true,
    isTerminal: true
  }
] as const;

// Deterministic PRNG so repeated runs produce comparable data shapes.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const db = createDb();
  const rand = mulberry32(42);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;

  const started = Date.now();
  const [ws] = await db
    .insert(workspaces)
    .values({ name: `Perf Seed ${new Date().toISOString().slice(0, 16)}` })
    .returning();
  if (!ws) throw new Error("workspace insert failed");

  const [owner] = await db
    .insert(users)
    .values({
      email: `perf-seed-${Date.now()}@test.local`,
      name: "Perf Seed Admin",
      passwordHash: "not-a-login"
    })
    .returning();
  if (!owner) throw new Error("user insert failed");
  await db.insert(memberships).values({ workspaceId: ws.id, userId: owner.id, role: "admin" });

  const companyIds: string[] = [];
  for (let offset = 0; offset < COMPANY_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, COMPANY_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      const name = `${pick(COMPANY_A)} ${pick(COMPANY_B)} ${n}`;
      const domain = `${name.toLowerCase().replace(/\s+/g, "-")}.example.com`;
      return {
        workspaceId: ws.id,
        name,
        website: `https://${domain}`,
        domain,
        industry: pick(INDUSTRIES),
        location: pick(CITIES),
        status: pick(STATUSES),
        ownerId: owner.id
      };
    });
    const rows = await db.insert(companies).values(values).returning({ id: companies.id });
    companyIds.push(...rows.map((r) => r.id));
    console.log(`companies: ${companyIds.length}/${COMPANY_COUNT}`);
  }

  let contactCount = 0;
  for (let offset = 0; offset < CONTACT_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, CONTACT_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      const firstName = pick(FIRST);
      const lastName = pick(LAST);
      return {
        workspaceId: ws.id,
        firstName,
        lastName,
        title: pick(TITLES),
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${n}@seed.example.com`,
        // ~10% independent contacts, mirroring real data where some contacts
        // are not attached to a client yet.
        companyId: rand() < 0.1 ? null : pick(companyIds),
        ownerId: owner.id
      };
    });
    await db.insert(contacts).values(values);
    contactCount += values.length;
    console.log(`contacts: ${contactCount}/${CONTACT_COUNT}`);
  }

  let candidateCount = 0;
  const candidateIds: string[] = [];
  const sources = ["parser", "manual", "import", "referral"] as const;
  for (let offset = 0; offset < CANDIDATE_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, CANDIDATE_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      const firstName = pick(FIRST);
      const lastName = pick(LAST);
      return {
        workspaceId: ws.id,
        humanId: `CAND-${String(n + 1).padStart(5, "0")}`,
        firstName,
        lastName,
        title: pick(TITLES),
        currentEmployer: `${pick(COMPANY_A)} ${pick(COMPANY_B)}`,
        // ~30% have no email, mirroring the real Zoho data (parser gaps).
        email:
          rand() < 0.3
            ? null
            : `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${n}@cand.example.com`,
        city: pick(CITIES).split(",")[0] ?? null,
        country: pick(CITIES).split(", ")[1] ?? null,
        experienceYears: Math.floor(rand() * 25),
        // Parser-heavy intake, mirroring the audit (72% parser).
        source: rand() < 0.72 ? "parser" : pick(sources),
        ownerId: owner.id
      };
    });
    const rows = await db.insert(candidates).values(values).returning({ id: candidates.id });
    // Keep a bounded sample of ids for seeding applications.
    if (candidateIds.length < 3000) candidateIds.push(...rows.map((r) => r.id));
    candidateCount += values.length;
    console.log(`candidates: ${candidateCount}/${CANDIDATE_COUNT}`);
  }
  // Advance the human-id counter past the seeded block.
  await db
    .insert(counters)
    .values({ workspaceId: ws.id, entityType: "candidate", value: candidateCount });

  let jobCount = 0;
  const jobIds: string[] = [];
  for (let offset = 0; offset < JOB_COUNT; offset += BATCH) {
    const values = Array.from({ length: Math.min(BATCH, JOB_COUNT - offset) }, (_, i) => {
      const n = offset + i;
      // Open-heavy distribution, mirroring a live desk.
      const status = rand() < 0.55 ? "open" : pick(JOB_STATUSES);
      return {
        workspaceId: ws.id,
        humanId: `JOB-${String(n + 1).padStart(4, "0")}`,
        title: pick(JOB_TITLES),
        companyId: pick(companyIds),
        ownerId: owner.id,
        status,
        employmentType: pick(EMPLOYMENT),
        workMode: pick(WORK_MODES),
        location: pick(CITIES),
        positions: 1 + Math.floor(rand() * 3)
      };
    });
    const rows = await db.insert(jobs).values(values).returning({ id: jobs.id });
    jobIds.push(...rows.map((r) => r.id));
    jobCount += values.length;
    console.log(`jobs: ${jobCount}/${JOB_COUNT}`);
  }
  await db.insert(counters).values({ workspaceId: ws.id, entityType: "job", value: jobCount });

  // Seed the application status dictionary + a pipeline of applications.
  await db.insert(applicationStatuses).values(
    APP_STATUSES.map((s) => ({
      workspaceId: ws.id,
      key: s.key,
      label: s.label,
      stage: s.stage,
      sortOrder: s.sortOrder,
      isEntry: s.isEntry,
      isTerminal: s.isTerminal
    }))
  );
  const entryFor = (stage: string) =>
    APP_STATUSES.find((s) => s.stage === stage && s.isEntry)?.key ?? "associated";
  // Weighted stage mix: most applications sit early in the funnel.
  const stageMix = [
    "screening",
    "screening",
    "screening",
    "submitted",
    "submitted",
    "interview",
    "interview",
    "offered",
    "hired",
    "rejected",
    "rejected",
    "archived"
  ] as const;
  let appCount = 0;
  const seenPairs = new Set<string>();
  for (let offset = 0; offset < APPLICATION_COUNT && candidateIds.length > 0; offset += BATCH) {
    const batch: (typeof applications.$inferInsert)[] = [];
    const historyBatch: (typeof applicationStatusHistory.$inferInsert)[] = [];
    for (let i = 0; i < BATCH && offset + i < APPLICATION_COUNT; i++) {
      const candidateId = pick(candidateIds);
      const jobId = pick(jobIds);
      const key = `${candidateId}:${jobId}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const stage = pick(stageMix);
      const statusKey = entryFor(stage);
      const n = appCount + batch.length + 1;
      const id = crypto.randomUUID();
      batch.push({
        id,
        workspaceId: ws.id,
        humanId: `APP-${String(n).padStart(4, "0")}`,
        candidateId,
        jobId,
        stage,
        statusKey,
        ownerId: owner.id
      });
      historyBatch.push({
        workspaceId: ws.id,
        applicationId: id,
        toStatusKey: statusKey,
        toStage: stage,
        actorUserId: owner.id
      });
    }
    if (batch.length > 0) {
      await db.insert(applications).values(batch);
      await db.insert(applicationStatusHistory).values(historyBatch);
      appCount += batch.length;
    }
    console.log(`applications: ${appCount}/${APPLICATION_COUNT}`);
  }
  await db
    .insert(counters)
    .values({ workspaceId: ws.id, entityType: "application", value: appCount });

  console.log(
    `Seeded workspace "${ws.name}" (${ws.id}) with ${companyIds.length} companies, ` +
      `${contactCount} contacts, ${candidateCount} candidates, ${jobCount} jobs and ` +
      `${appCount} applications in ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
