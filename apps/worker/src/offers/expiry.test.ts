import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expireOverdueOffers } from "./expiry";

const DB_TIMEOUT = 45_000;

// The expiry cron flips sent-and-overdue offers to expired. DB-gated, matching
// the web suite: runs only where DATABASE_URL is set (CI).
describe.skipIf(!process.env.DATABASE_URL)("offer expiry cron (M12, DB)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let appId: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "M12 Expiry Test" }).returning();
    ws = w!.id;
    const [company] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: ws, name: "M12 Client" })
      .returning();
    const [job] = await db
      .insert(dbmod.jobs)
      .values({ workspaceId: ws, humanId: "JOB-E1", title: "Role", companyId: company!.id })
      .returning();
    const [cand] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: ws, humanId: "CAND-E1", lastName: "Cand" })
      .returning();
    const [app] = await db
      .insert(dbmod.applications)
      .values({
        workspaceId: ws,
        humanId: "APP-E1",
        candidateId: cand!.id,
        jobId: job!.id,
        stage: "offered",
        statusKey: "offer_made"
      })
      .returning();
    appId = app!.id;
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, ws));
    await db.close();
  }, DB_TIMEOUT);

  it(
    "expires only sent offers past their expiry and is idempotent",
    async () => {
      const { eq } = await import("drizzle-orm");
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const [overdue] = await db
        .insert(dbmod.offers)
        .values({
          workspaceId: ws,
          humanId: "OFFER-E1",
          applicationId: appId,
          status: "sent",
          expiresAt: past
        })
        .returning();
      const [fresh] = await db
        .insert(dbmod.offers)
        .values({
          workspaceId: ws,
          humanId: "OFFER-E2",
          applicationId: appId,
          status: "sent",
          expiresAt: future
        })
        .returning();
      const [noExpiry] = await db
        .insert(dbmod.offers)
        .values({
          workspaceId: ws,
          humanId: "OFFER-E3",
          applicationId: appId,
          status: "sent",
          expiresAt: null
        })
        .returning();

      const n = await expireOverdueOffers(db);
      expect(n).toBe(1);

      const [after1] = await db.select().from(dbmod.offers).where(eq(dbmod.offers.id, overdue!.id));
      expect(after1!.status).toBe("expired");
      const [after2] = await db.select().from(dbmod.offers).where(eq(dbmod.offers.id, fresh!.id));
      expect(after2!.status).toBe("sent");
      const [after3] = await db
        .select()
        .from(dbmod.offers)
        .where(eq(dbmod.offers.id, noExpiry!.id));
      expect(after3!.status).toBe("sent");

      // A status-history row + audit row were written for the expired offer.
      const history = await db
        .select()
        .from(dbmod.offerStatusHistory)
        .where(eq(dbmod.offerStatusHistory.offerId, overdue!.id));
      expect(history.some((h) => h.toStatus === "expired")).toBe(true);

      // Second sweep finds nothing new (idempotent).
      const n2 = await expireOverdueOffers(db);
      expect(n2).toBe(0);
    },
    DB_TIMEOUT
  );
});
