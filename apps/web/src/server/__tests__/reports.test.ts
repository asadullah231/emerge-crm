import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../routers/_app";
import { createCallerFactory, type TRPCContext } from "../trpc";
import type { SessionInfo } from "../auth/sessions";

type Table = { key: string; title: string; columns: string[]; rows: (string | number | null)[][] };

const cellAt = (t: Table, first: string, header: string) => {
  const ci = t.columns.indexOf(header);
  const row = t.rows.find((r) => r[0] === first);
  return row ? row[ci] : undefined;
};
const columnSum = (t: Table, header: string) => {
  const ci = t.columns.indexOf(header);
  return t.rows.reduce((s, r) => s + (Number(r[ci]) || 0), 0);
};

const DB_TIMEOUT = 45_000;
describe.skipIf(!process.env.DATABASE_URL)("reports (M14, DB)", () => {
  const createCaller = createCallerFactory(appRouter);
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let userId: string;
  let companyId: string;

  function caller() {
    const session: SessionInfo = {
      sessionId: "00000000-0000-0000-0000-000000000000",
      workspaceId: ws,
      role: "admin",
      user: {
        id: userId,
        email: "m14@test.local",
        name: "M14 AM",
        avatarUrl: null,
        timezone: "UTC"
      },
      expiresAt: new Date(Date.now() + 60_000)
    };
    return createCaller({ db, session } satisfies TRPCContext);
  }

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "M14 Test" }).returning();
    ws = w!.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `m14-${Date.now()}@test.local`, name: "M14 AM", passwordHash: "x" })
      .returning();
    userId = user!.id;
    await db.insert(dbmod.memberships).values({ workspaceId: ws, userId, role: "admin" });
    const [company] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: ws, name: "M14 Client" })
      .returning();
    companyId = company!.id;
    const [job] = await db
      .insert(dbmod.jobs)
      .values({
        workspaceId: ws,
        humanId: "JOB-M14",
        title: "Engineer",
        companyId,
        ownerId: userId
      })
      .returning();
    const jobId = job!.id;

    // Three applications with distinct furthest stages.
    const mkApp = async (human: string, stage: "screening" | "submitted" | "hired") => {
      const [cand] = await db
        .insert(dbmod.candidates)
        .values({ workspaceId: ws, humanId: `CAND-${human}`, lastName: "Cand" })
        .returning();
      const [app] = await db
        .insert(dbmod.applications)
        .values({
          workspaceId: ws,
          humanId: human,
          candidateId: cand!.id,
          jobId,
          ownerId: userId,
          stage,
          statusKey: stage
        })
        .returning();
      return { appId: app!.id, candId: cand!.id };
    };
    const a1 = await mkApp("APP-M14a", "submitted"); // reached submitted
    const a2 = await mkApp("APP-M14b", "hired"); // reached all the way to hired
    await mkApp("APP-M14c", "screening"); // baseline only

    const hist = (appId: string, from: string | null, to: string) => ({
      workspaceId: ws,
      applicationId: appId,
      fromStage: from as never,
      toStage: to as never,
      fromStatusKey: from,
      toStatusKey: to
    });
    await db
      .insert(dbmod.applicationStatusHistory)
      .values([
        hist(a1.appId, "screening", "submitted"),
        hist(a2.appId, "screening", "submitted"),
        hist(a2.appId, "submitted", "interview"),
        hist(a2.appId, "interview", "offered"),
        hist(a2.appId, "offered", "hired")
      ]);

    // Two submissions by the owner (for a1 and a2).
    const sub = (appId: string) => ({
      workspaceId: ws,
      humanId: `SUB-${appId.slice(0, 6)}`,
      batchId: randomUUID(),
      applicationId: appId,
      jobId,
      companyId,
      tokenHash: randomUUID(),
      sentById: userId
    });
    await db.insert(dbmod.submissions).values([sub(a1.appId), sub(a2.appId)]);

    // One placement (the hire) with a fee, placed by the owner.
    await db.insert(dbmod.placements).values({
      workspaceId: ws,
      humanId: "PLACE-M14",
      applicationId: a2.appId,
      jobId,
      candidateId: a2.candId,
      feeAmount: 5000,
      currency: "GBP",
      placedById: userId
    });
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, ws));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  }, DB_TIMEOUT);

  it("funnel reconciles with the current-stage counts and shows cumulative reach", async () => {
    const t = (await caller().reports.run({ key: "funnel", filters: {} })) as Table;
    // "In stage now" must sum to the total application count (kanban reconciliation).
    expect(columnSum(t, "In stage now")).toBe(3);
    expect(cellAt(t, "Screening", "Ever reached")).toBe(3);
    expect(cellAt(t, "Submitted", "Ever reached")).toBe(2);
    expect(cellAt(t, "Hired", "Ever reached")).toBe(1);
  });

  it("submissions-per-sourcer matches the submission log", async () => {
    const t = (await caller().reports.run({ key: "submissionsBySourcer", filters: {} })) as Table;
    expect(cellAt(t, "M14 AM", "Submissions")).toBe(2);
  });

  it("time-to-first-submission counts only applications that were submitted", async () => {
    const t = (await caller().reports.run({ key: "timeToFirstSubmission", filters: {} })) as Table;
    expect(cellAt(t, "Applications with a submission", "Value")).toBe(2);
  });

  it("leaderboard rolls up reached stages, hires and placement fees per owner", async () => {
    const t = (await caller().reports.run({ key: "leaderboard", filters: {} })) as Table;
    expect(cellAt(t, "M14 AM", "Submissions")).toBe(2);
    expect(cellAt(t, "M14 AM", "Hires")).toBe(1);
    expect(cellAt(t, "M14 AM", "Placement fees")).toBe(5000);
  });

  it("creating a schedule computes a future next run", async () => {
    const s = await caller().reportSchedules.create({
      name: "Weekly funnel",
      reportKey: "funnel",
      filters: {},
      cadence: "weekly",
      recipients: ["boss@agency.com"],
      hourUtc: 7,
      dayOfWeek: 1,
      active: true
    });
    expect(s.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(s.recipients).toEqual(["boss@agency.com"]);
  });
});
