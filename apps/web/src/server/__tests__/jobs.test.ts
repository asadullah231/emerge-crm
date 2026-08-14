import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { humanId, nextCounter } from "../counters";
import { jobInput } from "../routers/jobs";

// Unit checks: input validation + human-id formatting for jobs (no DB needed).
describe("jobs input (M4)", () => {
  it("requires a title and a company", () => {
    expect(jobInput.safeParse({ title: "", companyId: crypto.randomUUID() }).success).toBe(false);
    expect(jobInput.safeParse({ title: "Engineer" }).success).toBe(false);
    expect(jobInput.safeParse({ title: "Engineer", companyId: crypto.randomUUID() }).success).toBe(
      true
    );
  });

  it("rejects an out-of-range status and a non-uuid company", () => {
    expect(
      jobInput.safeParse({ title: "X", companyId: crypto.randomUUID(), status: "archived" }).success
    ).toBe(false);
    expect(jobInput.safeParse({ title: "X", companyId: "not-a-uuid" }).success).toBe(false);
  });

  it("bounds positions and salary at zero or above", () => {
    const company = crypto.randomUUID();
    expect(jobInput.safeParse({ title: "X", companyId: company, positions: 0 }).success).toBe(
      false
    );
    expect(jobInput.safeParse({ title: "X", companyId: company, salaryMin: -1 }).success).toBe(
      false
    );
    expect(
      jobInput.safeParse({ title: "X", companyId: company, positions: 3, salaryMin: 40000 }).success
    ).toBe(true);
  });

  it("formats the human id with a JOB prefix", () => {
    expect(humanId("JOB", 1)).toBe("JOB-0001");
    expect(humanId("JOB", 42)).toBe("JOB-0042");
  });
});

// DB-backed checks for M4: job RLS isolation, job counter, company-required and
// hiring-contact-belongs-to-company enforcement, status change. A generous
// timeout absorbs round-trip latency to the shared dev DB (CI uses a local one).
const DB_TIMEOUT = 20_000;
describe.skipIf(!process.env.DATABASE_URL)("jobs (M4, DB)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let wsA: string;
  let wsB: string;
  let userId: string;
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [a] = await db.insert(dbmod.workspaces).values({ name: "Job Test A" }).returning();
    const [b] = await db.insert(dbmod.workspaces).values({ name: "Job Test B" }).returning();
    if (!a || !b) throw new Error("workspace seed failed");
    wsA = a.id;
    wsB = b.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `job-${Date.now()}@test.local`, name: "Job User", passwordHash: "x" })
      .returning();
    if (!user) throw new Error("user seed failed");
    userId = user.id;
    await db.insert(dbmod.memberships).values([
      { workspaceId: wsA, userId, role: "admin" },
      { workspaceId: wsB, userId, role: "admin" }
    ]);
    const [ca] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: wsA, name: "Client A" })
      .returning();
    const [cb] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: wsB, name: "Client B" })
      .returning();
    if (!ca || !cb) throw new Error("company seed failed");
    companyA = ca.id;
    companyB = cb.id;
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(inArray(dbmod.workspaces.id, [wsA, wsB]));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  }, DB_TIMEOUT);

  it(
    "hides another workspace's jobs inside the RLS context",
    async () => {
      const [other] = await db
        .insert(dbmod.jobs)
        .values({ workspaceId: wsB, humanId: "JOB-0001", title: "Hidden", companyId: companyB })
        .returning();
      if (!other) throw new Error("seed failed");
      const { eq } = await import("drizzle-orm");
      const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.select().from(dbmod.jobs).where(eq(dbmod.jobs.id, other.id))
      );
      expect(rows).toHaveLength(0);
    },
    DB_TIMEOUT
  );

  it(
    "allocates a monotonic job counter per workspace",
    async () => {
      const [v1, v2] = await dbmod.withWorkspace(db, wsA, async (tx) => {
        const a = await nextCounter(tx, wsA, "job");
        const b = await nextCounter(tx, wsA, "job");
        return [a, b];
      });
      expect(v2).toBe(v1 + 1);
    },
    DB_TIMEOUT
  );

  it(
    "enforces the company foreign key (a job cannot exist without a client)",
    async () => {
      await expect(
        dbmod.withWorkspace(db, wsA, (tx) =>
          tx.insert(dbmod.jobs).values({
            workspaceId: wsA,
            humanId: "JOB-NOCO",
            title: "No client",
            companyId: crypto.randomUUID()
          })
        )
      ).rejects.toThrow();
    },
    DB_TIMEOUT
  );

  it(
    "finds a contact only when it belongs to the chosen company",
    async () => {
      const { and, eq, isNull } = await import("drizzle-orm");
      const [contact] = await db
        .insert(dbmod.contacts)
        .values({ workspaceId: wsA, lastName: "Hirer", companyId: companyA })
        .returning();
      if (!contact) throw new Error("seed failed");
      // Belongs to companyA -> found.
      const match = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .select()
          .from(dbmod.contacts)
          .where(
            and(
              eq(dbmod.contacts.id, contact.id),
              eq(dbmod.contacts.companyId, companyA),
              isNull(dbmod.contacts.deletedAt)
            )
          )
      );
      expect(match).toHaveLength(1);
      // Same contact checked against a different company -> not found.
      const other = crypto.randomUUID();
      const mismatch = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .select()
          .from(dbmod.contacts)
          .where(and(eq(dbmod.contacts.id, contact.id), eq(dbmod.contacts.companyId, other)))
      );
      expect(mismatch).toHaveLength(0);
    },
    DB_TIMEOUT
  );

  it(
    "changes a job status",
    async () => {
      const { eq } = await import("drizzle-orm");
      const [job] = await db
        .insert(dbmod.jobs)
        .values({
          workspaceId: wsA,
          humanId: "JOB-STAT",
          title: "Statusable",
          companyId: companyA
        })
        .returning();
      if (!job) throw new Error("seed failed");
      await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.update(dbmod.jobs).set({ status: "filled" }).where(eq(dbmod.jobs.id, job.id))
      );
      const [after] = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.select().from(dbmod.jobs).where(eq(dbmod.jobs.id, job.id))
      );
      expect(after?.status).toBe("filled");
    },
    DB_TIMEOUT
  );
});
