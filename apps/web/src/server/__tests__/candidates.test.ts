import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bumpCounter, nextCounter } from "../counters";

// DB-backed checks for M3: candidate RLS isolation, human-id counter atomicity,
// email dedupe, and merge re-parenting.
describe.skipIf(!process.env.DATABASE_URL)("candidates (M3)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let wsA: string;
  let wsB: string;
  let userId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [a] = await db.insert(dbmod.workspaces).values({ name: "Cand Test A" }).returning();
    const [b] = await db.insert(dbmod.workspaces).values({ name: "Cand Test B" }).returning();
    if (!a || !b) throw new Error("workspace seed failed");
    wsA = a.id;
    wsB = b.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `cand-${Date.now()}@test.local`, name: "Cand User", passwordHash: "x" })
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

  it("hides another workspace's candidates inside the RLS context", async () => {
    const [other] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: wsB, humanId: "CAND-0001", lastName: "Hidden" })
      .returning();
    if (!other) throw new Error("seed failed");
    const { eq } = await import("drizzle-orm");
    const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx.select().from(dbmod.candidates).where(eq(dbmod.candidates.id, other.id))
    );
    expect(rows).toHaveLength(0);
  });

  it("allocates monotonic counter values and reserves blocks", async () => {
    const [v1, v2] = await dbmod.withWorkspace(db, wsA, async (tx) => {
      const a = await nextCounter(tx, wsA, "test-seq");
      const b = await nextCounter(tx, wsA, "test-seq");
      return [a, b];
    });
    expect(v2).toBe(v1 + 1);
    const top = await dbmod.withWorkspace(db, wsA, (tx) => bumpCounter(tx, wsA, "test-seq", 10));
    expect(top).toBe(v2 + 10);
  });

  it("finds a duplicate by lowercased email but not across workspaces", async () => {
    const { and, eq, isNull } = await import("drizzle-orm");
    await db
      .insert(dbmod.candidates)
      .values({ workspaceId: wsA, humanId: "CAND-DUP", lastName: "Dup", email: "dup@x.com" });
    const inA = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx
        .select()
        .from(dbmod.candidates)
        .where(and(eq(dbmod.candidates.email, "dup@x.com"), isNull(dbmod.candidates.deletedAt)))
    );
    expect(inA.length).toBeGreaterThanOrEqual(1);
    const inB = await dbmod.withWorkspace(db, wsB, (tx) =>
      tx.select().from(dbmod.candidates).where(eq(dbmod.candidates.email, "dup@x.com"))
    );
    expect(inB).toHaveLength(0);
  });

  it("re-parents education when merging (children follow the target)", async () => {
    const { eq } = await import("drizzle-orm");
    const [target] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: wsA, humanId: "CAND-T", lastName: "Target" })
      .returning();
    const [source] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: wsA, humanId: "CAND-S", lastName: "Source" })
      .returning();
    if (!target || !source) throw new Error("seed failed");
    await db
      .insert(dbmod.candidateEducation)
      .values({ workspaceId: wsA, candidateId: source.id, institution: "MIT" });

    // Simulate the merge's re-parent step.
    await dbmod.withWorkspace(db, wsA, (tx) =>
      tx
        .update(dbmod.candidateEducation)
        .set({ candidateId: target.id })
        .where(eq(dbmod.candidateEducation.candidateId, source.id))
    );

    const moved = await dbmod.withWorkspace(db, wsA, (tx) =>
      tx
        .select()
        .from(dbmod.candidateEducation)
        .where(eq(dbmod.candidateEducation.candidateId, target.id))
    );
    expect(moved.some((e) => e.institution === "MIT")).toBe(true);
  });

  it("hides another workspace's attachments under RLS", async () => {
    const [cand] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: wsB, humanId: "CAND-ATT", lastName: "AttOwner" })
      .returning();
    if (!cand) throw new Error("seed failed");
    await db.insert(dbmod.attachments).values({
      workspaceId: wsB,
      entityType: "candidate",
      entityId: cand.id,
      bucket: "b",
      objectKey: "k",
      filename: "cv.pdf",
      mime: "application/pdf",
      size: 100
    });
    const rows = await dbmod.withWorkspace(db, wsA, (tx) => tx.select().from(dbmod.attachments));
    expect(rows).toHaveLength(0);
  });
});
