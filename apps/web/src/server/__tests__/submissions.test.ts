import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_STATUSES } from "@/lib/applications";
import {
  applyVerdict,
  hashToken,
  isExpired,
  makeShareToken,
  setApplicationStatus,
  VERDICT_STATUS
} from "@/server/submissions";

// Unit checks: token hashing + expiry logic + verdict mapping (no DB needed).
describe("submission helpers (M10)", () => {
  it("hashes tokens deterministically and distinctly", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makeShareToken returns a token whose hash matches", () => {
    const { token, tokenHash } = makeShareToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashToken(token)).toBe(tokenHash);
  });

  it("treats archived or past-expiry links as expired", () => {
    expect(isExpired({ status: "archived", expiresAt: null })).toBe(true);
    expect(isExpired({ status: "submitted", expiresAt: new Date(Date.now() - 1000) })).toBe(true);
    expect(isExpired({ status: "submitted", expiresAt: new Date(Date.now() + 60_000) })).toBe(
      false
    );
    expect(isExpired({ status: "submitted", expiresAt: null })).toBe(false);
  });

  it("maps verdicts to the right application status", () => {
    expect(VERDICT_STATUS.approved.statusKey).toBe("approved_by_client");
    expect(VERDICT_STATUS.rejected.statusKey).toBe("rejected_by_client");
  });
});

const DB_TIMEOUT = 45_000;
describe.skipIf(!process.env.DATABASE_URL)("submissions (M10, DB)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let userId: string;
  let jobId: string;
  let companyId: string;
  let appId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "Sub Test" }).returning();
    if (!w) throw new Error("workspace seed failed");
    ws = w.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `sub-${Date.now()}@test.local`, name: "Sub User", passwordHash: "x" })
      .returning();
    if (!user) throw new Error("user seed failed");
    userId = user.id;
    await db.insert(dbmod.memberships).values({ workspaceId: ws, userId, role: "admin" });
    const [company] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: ws, name: "Sub Client" })
      .returning();
    companyId = company!.id;
    const [job] = await db
      .insert(dbmod.jobs)
      .values({ workspaceId: ws, humanId: "JOB-S1", title: "Role", companyId })
      .returning();
    jobId = job!.id;
    const [cand] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: ws, humanId: "CAND-S1", lastName: "Cand" })
      .returning();
    await db
      .insert(dbmod.applicationStatuses)
      .values(DEFAULT_APPLICATION_STATUSES.map((s) => ({ ...s, workspaceId: ws })))
      .onConflictDoNothing({
        target: [dbmod.applicationStatuses.workspaceId, dbmod.applicationStatuses.key]
      });
    const [app] = await db
      .insert(dbmod.applications)
      .values({
        workspaceId: ws,
        humanId: "APP-S1",
        candidateId: cand!.id,
        jobId,
        ownerId: userId,
        stage: "screening",
        statusKey: "associated"
      })
      .returning();
    appId = app!.id;
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, ws));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  }, DB_TIMEOUT);

  it(
    "setApplicationStatus moves the application and writes history",
    async () => {
      const { eq } = await import("drizzle-orm");
      await dbmod.withWorkspace(db, ws, (tx) =>
        setApplicationStatus(tx, {
          workspaceId: ws,
          applicationId: appId,
          statusKey: "submitted_to_client",
          actorUserId: userId,
          note: "Submitted to client"
        })
      );
      const [app] = await db
        .select()
        .from(dbmod.applications)
        .where(eq(dbmod.applications.id, appId));
      expect(app?.statusKey).toBe("submitted_to_client");
      expect(app?.stage).toBe("submitted");
    },
    DB_TIMEOUT
  );

  it(
    "applyVerdict approved writes back status + notifies the owner",
    async () => {
      const { and, eq } = await import("drizzle-orm");
      const { token, tokenHash } = makeShareToken();
      const [sub] = await db
        .insert(dbmod.submissions)
        .values({
          workspaceId: ws,
          humanId: "SUB-S1",
          batchId: crypto.randomUUID(),
          applicationId: appId,
          jobId,
          companyId,
          tokenHash,
          sentById: userId
        })
        .returning();

      const result = await dbmod.withWorkspace(db, ws, (tx) =>
        applyVerdict(tx, {
          workspaceId: ws,
          submissionId: sub!.id,
          tokenHash: hashToken(token),
          verdict: "approved",
          comment: "Looks great"
        })
      );
      expect(result?.applicationId).toBe(appId);

      const [row] = await db
        .select()
        .from(dbmod.submissions)
        .where(eq(dbmod.submissions.id, sub!.id));
      expect(row?.status).toBe("approved");
      expect(row?.clientComment).toBe("Looks great");
      expect(row?.verdictAt).not.toBeNull();

      const [app] = await db
        .select()
        .from(dbmod.applications)
        .where(eq(dbmod.applications.id, appId));
      expect(app?.statusKey).toBe("approved_by_client");

      const notes = await db
        .select()
        .from(dbmod.notifications)
        .where(
          and(
            eq(dbmod.notifications.recipientId, userId),
            eq(dbmod.notifications.kind, "submission_verdict")
          )
        );
      expect(notes.length).toBeGreaterThanOrEqual(1);

      // A second verdict on a decided submission is a no-op.
      const again = await dbmod.withWorkspace(db, ws, (tx) =>
        applyVerdict(tx, {
          workspaceId: ws,
          submissionId: sub!.id,
          tokenHash: hashToken(token),
          verdict: "rejected",
          comment: null
        })
      );
      expect(again).toBeNull();
    },
    DB_TIMEOUT
  );

  it(
    "applyVerdict on an expired link is a no-op",
    async () => {
      const { token, tokenHash } = makeShareToken();
      const [sub] = await db
        .insert(dbmod.submissions)
        .values({
          workspaceId: ws,
          humanId: "SUB-S2",
          batchId: crypto.randomUUID(),
          applicationId: appId,
          jobId,
          companyId,
          tokenHash,
          sentById: userId,
          expiresAt: new Date(Date.now() - 1000)
        })
        .returning();
      const result = await dbmod.withWorkspace(db, ws, (tx) =>
        applyVerdict(tx, {
          workspaceId: ws,
          submissionId: sub!.id,
          tokenHash: hashToken(token),
          verdict: "approved",
          comment: null
        })
      );
      expect(result).toBeNull();
    },
    DB_TIMEOUT
  );
});
