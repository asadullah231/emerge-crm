import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { trashCutoff } from "../list-query";

// DB-backed checks for the M2 tables: RLS isolation, soft-delete retention
// window semantics, primary-contact scoping and tag uniqueness.
describe.skipIf(!process.env.DATABASE_URL)("companies and contacts (M2)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let wsA: string;
  let wsB: string;
  let userId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [a] = await db.insert(dbmod.workspaces).values({ name: "M2 Test A" }).returning();
    const [b] = await db.insert(dbmod.workspaces).values({ name: "M2 Test B" }).returning();
    if (!a || !b) throw new Error("workspace seed failed");
    wsA = a.id;
    wsB = b.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `m2-${Date.now()}@test.local`, name: "M2 User", passwordHash: "x" })
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

  it("hides companies of another workspace inside the RLS context", async () => {
    const [other] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: wsB, name: "B Corp" })
      .returning();
    if (!other) throw new Error("seed failed");
    const { eq } = await import("drizzle-orm");
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select().from(dbmod.companies).where(eq(dbmod.companies.id, other.id))
    );
    expect(rows).toHaveLength(0);
  });

  it("hides contacts of another workspace inside the RLS context", async () => {
    const [other] = await db
      .insert(dbmod.contacts)
      .values({ workspaceId: wsB, lastName: "Hidden" })
      .returning();
    if (!other) throw new Error("seed failed");
    const { eq } = await import("drizzle-orm");
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select().from(dbmod.contacts).where(eq(dbmod.contacts.id, other.id))
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects inserting a company tagged with another workspace (WITH CHECK)", async () => {
    await expect(
      dbmod.withWorkspace(db, wsA, (tx) =>
        tx.insert(dbmod.companies).values({ workspaceId: wsB, name: "Smuggled" })
      )
    ).rejects.toThrow();
  });

  it("keeps rows deleted longer than the retention window out of the restore filter", async () => {
    const { and, eq, gte, isNotNull } = await import("drizzle-orm");
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const [expired] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: wsA, name: "Expired Trash", deletedAt: old })
      .returning();
    const [restorable] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: wsA, name: "Fresh Trash", deletedAt: recent })
      .returning();
    if (!expired || !restorable) throw new Error("seed failed");

    const restoreWindow = (id: string) =>
      dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .select({ id: dbmod.companies.id })
          .from(dbmod.companies)
          .where(
            and(
              eq(dbmod.companies.id, id),
              isNotNull(dbmod.companies.deletedAt),
              gte(dbmod.companies.deletedAt, trashCutoff())
            )
          )
      );
    expect(await restoreWindow(expired.id)).toHaveLength(0);
    expect(await restoreWindow(restorable.id)).toHaveLength(1);
  });

  it("enforces unique tag names per workspace but not across workspaces", async () => {
    await db.insert(dbmod.tags).values({ workspaceId: wsA, name: "vip" });
    await expect(db.insert(dbmod.tags).values({ workspaceId: wsA, name: "vip" })).rejects.toThrow();
    await expect(
      db.insert(dbmod.tags).values({ workspaceId: wsB, name: "vip" })
    ).resolves.toBeDefined();
  });

  it("allows contacts without a company (independent contacts)", async () => {
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx
        .insert(dbmod.contacts)
        .values({ workspaceId: wsA, lastName: "Freelance", companyId: null })
        .returning()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.companyId).toBeNull();
  });
});
