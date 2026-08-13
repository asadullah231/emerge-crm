import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Proves workspace isolation at the SQL level: inside workspace A's RLS
// context, workspace B's rows are invisible even when queried by primary key.
describe.skipIf(!process.env.DATABASE_URL)("row level security isolation", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let wsA: string;
  let wsB: string;
  let userId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [a] = await db.insert(dbmod.workspaces).values({ name: "RLS Test A" }).returning();
    const [b] = await db.insert(dbmod.workspaces).values({ name: "RLS Test B" }).returning();
    if (!a || !b) throw new Error("workspace seed failed");
    wsA = a.id;
    wsB = b.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `rls-${Date.now()}@test.local`, name: "RLS User", passwordHash: "x" })
      .returning();
    if (!user) throw new Error("user seed failed");
    userId = user.id;
    await db.insert(dbmod.memberships).values([
      { workspaceId: wsA, userId, role: "admin" },
      { workspaceId: wsB, userId, role: "admin" }
    ]);
  });

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(inArray(dbmod.workspaces.id, [wsA, wsB]));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  });

  it("hides workspace B rows inside workspace A context, even by primary key", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select().from(dbmod.workspaces).where(eq(dbmod.workspaces.id, wsB))
    );
    expect(rows).toHaveLength(0);
  });

  it("shows only the current workspace in an unfiltered select", async () => {
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select({ id: dbmod.workspaces.id }).from(dbmod.workspaces)
    );
    expect(rows.map((r) => r.id)).toEqual([wsA]);
  });

  it("hides workspace B memberships inside workspace A context", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select().from(dbmod.memberships).where(eq(dbmod.memberships.workspaceId, wsB))
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects writes tagged with another workspace (WITH CHECK)", async () => {
    await expect(
      dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .insert(dbmod.auditLog)
          .values({ workspaceId: wsB, actorUserId: userId, action: "rls.test" })
      )
    ).rejects.toThrow();
  });

  it("sees no rows at all without a workspace context", async () => {
    const rows = await db.transaction(async (tx) => {
      const { sql } = await import("drizzle-orm");
      await tx.execute(sql`set local role emerge_app`);
      return tx.select({ id: dbmod.workspaces.id }).from(dbmod.workspaces);
    });
    expect(rows).toHaveLength(0);
  });
});
