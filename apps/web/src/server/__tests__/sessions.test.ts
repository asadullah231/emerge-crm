import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Session lifecycle against the real database (CI); skipped without DATABASE_URL.
describe.skipIf(!process.env.DATABASE_URL)("session lifecycle", () => {
  let dbmod: typeof import("@emerge/db");
  let sessionsSvc: typeof import("../auth/sessions");
  let db: import("@emerge/db").Database;
  let userId: string;
  let workspaceId: string;
  let membershipId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    sessionsSvc = await import("../auth/sessions");
    // The service module uses the shared singleton; reuse it so cleanup closes one pool.
    db = (await import("../db")).db;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `sessions-${Date.now()}@test.local`, name: "Session User", passwordHash: "x" })
      .returning();
    const [ws] = await db.insert(dbmod.workspaces).values({ name: "Session Test WS" }).returning();
    if (!user || !ws) throw new Error("seed failed");
    userId = user.id;
    workspaceId = ws.id;
    const [membership] = await db
      .insert(dbmod.memberships)
      .values({ userId, workspaceId, role: "recruiter" })
      .returning();
    if (!membership) throw new Error("membership seed failed");
    membershipId = membership.id;
  });

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, workspaceId));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  });

  it("creates and validates a session, DB-backed", async () => {
    const { token } = await sessionsSvc.createSession(userId, workspaceId);
    const info = await sessionsSvc.validateSessionToken(token);
    expect(info).not.toBeNull();
    expect(info?.user.id).toBe(userId);
    expect(info?.workspaceId).toBe(workspaceId);
    expect(info?.role).toBe("recruiter");
  });

  it("rejects unknown tokens", async () => {
    expect(await sessionsSvc.validateSessionToken("not-a-real-token")).toBeNull();
  });

  it("rejects and deletes expired sessions", async () => {
    const { token } = await sessionsSvc.createSession(userId, workspaceId);
    const { eq } = await import("drizzle-orm");
    const { hashToken } = await import("../auth/tokens");
    await db
      .update(dbmod.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(dbmod.sessions.tokenHash, hashToken(token)));
    expect(await sessionsSvc.validateSessionToken(token)).toBeNull();
    const rows = await db
      .select()
      .from(dbmod.sessions)
      .where(eq(dbmod.sessions.tokenHash, hashToken(token)));
    expect(rows).toHaveLength(0);
  });

  it("rejects sessions after the membership is deactivated", async () => {
    const { eq } = await import("drizzle-orm");
    const { token } = await sessionsSvc.createSession(userId, workspaceId);
    await db
      .update(dbmod.memberships)
      .set({ deactivatedAt: new Date() })
      .where(eq(dbmod.memberships.id, membershipId));
    expect(await sessionsSvc.validateSessionToken(token)).toBeNull();
    await db
      .update(dbmod.memberships)
      .set({ deactivatedAt: null })
      .where(eq(dbmod.memberships.id, membershipId));
  });

  it("invalidates every session for a user", async () => {
    const { token } = await sessionsSvc.createSession(userId, workspaceId);
    await sessionsSvc.invalidateUserSessions(userId);
    expect(await sessionsSvc.validateSessionToken(token)).toBeNull();
  });
});
