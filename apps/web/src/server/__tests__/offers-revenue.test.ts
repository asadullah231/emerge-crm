import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OFFER_APP_STATUS,
  OFFER_TRANSITIONS,
  canTransitionOffer,
  isOfferOverdue
} from "@/server/offers";
import { appRouter } from "../routers/_app";
import { createCallerFactory, type TRPCContext } from "../trpc";
import type { SessionInfo } from "../auth/sessions";

// Pure unit checks for the offer state machine (no DB).
describe("offer state machine (M12)", () => {
  it("allows only valid transitions", () => {
    expect(canTransitionOffer("draft", "sent")).toBe(true);
    expect(canTransitionOffer("draft", "withdrawn")).toBe(true);
    expect(canTransitionOffer("sent", "accepted")).toBe(true);
    expect(canTransitionOffer("sent", "declined")).toBe(true);
    expect(canTransitionOffer("sent", "expired")).toBe(true);
    // Terminal + illegal jumps are rejected.
    expect(canTransitionOffer("draft", "accepted")).toBe(false);
    expect(canTransitionOffer("accepted", "sent")).toBe(false);
    expect(canTransitionOffer("declined", "accepted")).toBe(false);
    expect(OFFER_TRANSITIONS.expired).toEqual([]);
  });

  it("maps resolution statuses to application statuses", () => {
    expect(OFFER_APP_STATUS.sent).toBe("offer_made");
    expect(OFFER_APP_STATUS.accepted).toBe("offer_accepted");
    expect(OFFER_APP_STATUS.declined).toBe("offer_declined");
    expect(OFFER_APP_STATUS.withdrawn).toBe("offer_withdrawn");
    // Expiry deliberately leaves the application status alone.
    expect(OFFER_APP_STATUS.expired).toBeUndefined();
  });

  it("flags overdue only for sent offers past expiry", () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    expect(isOfferOverdue({ status: "sent", expiresAt: past })).toBe(true);
    expect(isOfferOverdue({ status: "sent", expiresAt: future })).toBe(false);
    expect(isOfferOverdue({ status: "sent", expiresAt: null })).toBe(false);
    expect(isOfferOverdue({ status: "draft", expiresAt: past })).toBe(false);
  });
});

const DB_TIMEOUT = 45_000;
describe.skipIf(!process.env.DATABASE_URL)("offers + placements + revenue (M12, DB)", () => {
  const createCaller = createCallerFactory(appRouter);
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let userId: string;
  let companyId: string;
  let jobId: string;
  let appId: string;
  let appId2: string;

  function caller() {
    const session: SessionInfo = {
      sessionId: "00000000-0000-0000-0000-000000000000",
      workspaceId: ws,
      role: "admin",
      user: { id: userId, email: "m12@test.local", name: "M12", avatarUrl: null, timezone: "UTC" },
      expiresAt: new Date(Date.now() + 60_000)
    };
    return createCaller({ db, session } satisfies TRPCContext);
  }

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "M12 Test" }).returning();
    ws = w!.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `m12-${Date.now()}@test.local`, name: "M12 AM", passwordHash: "x" })
      .returning();
    userId = user!.id;
    await db.insert(dbmod.memberships).values({ workspaceId: ws, userId, role: "admin" });
    const [company] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: ws, name: "M12 Client" })
      .returning();
    companyId = company!.id;
    const [job] = await db
      .insert(dbmod.jobs)
      .values({
        workspaceId: ws,
        humanId: "JOB-M12",
        title: "Process Engineer",
        companyId,
        ownerId: userId,
        positions: 2
      })
      .returning();
    jobId = job!.id;
    const mkApp = async (human: string, candHuman: string) => {
      const [cand] = await db
        .insert(dbmod.candidates)
        .values({ workspaceId: ws, humanId: candHuman, lastName: "Cand" })
        .returning();
      const [app] = await db
        .insert(dbmod.applications)
        .values({
          workspaceId: ws,
          humanId: human,
          candidateId: cand!.id,
          jobId,
          ownerId: userId,
          stage: "interview",
          statusKey: "interview_scheduled"
        })
        .returning();
      return app!.id;
    };
    appId = await mkApp("APP-M12a", "CAND-M12a");
    appId2 = await mkApp("APP-M12b", "CAND-M12b");
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, ws));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
  }, DB_TIMEOUT);

  it(
    "runs the offer lifecycle create -> send -> accept -> placement and rolls up revenue",
    async () => {
      const api = caller();
      const offer = await api.offers.create({
        applicationId: appId,
        salaryAmount: 52000,
        currency: "GBP",
        startDate: "2026-10-01",
        note: "Standard offer"
      });
      expect(offer.humanId).toMatch(/^OFFER-\d{4}$/);
      expect(offer.status).toBe("draft");

      await api.offers.send({ id: offer.id, expiresInDays: 7 });
      let appNow = await api.applications.get({ id: appId });
      expect(appNow.statusKey).toBe("offer_made");
      expect(appNow.stage).toBe("offered");

      await api.offers.accept({ id: offer.id });
      appNow = await api.applications.get({ id: appId });
      expect(appNow.statusKey).toBe("offer_accepted");

      // Record the placement (marks the hire) and set the job revenue target.
      await api.revenue.setTarget({ jobId, revenuePerPosition: 8000, currency: "GBP" });
      const placement = await api.placements.create({
        applicationId: appId,
        offerId: offer.id,
        feeAmount: 8500,
        currency: "GBP",
        startDate: "2026-10-01"
      });
      expect(placement.humanId).toMatch(/^PLC-\d{4}$/);

      appNow = await api.applications.get({ id: appId });
      expect(appNow.statusKey).toBe("hired");
      expect(appNow.stage).toBe("hired");

      // A second placement on the same application is blocked.
      await expect(
        api.placements.create({ applicationId: appId, feeAmount: 100 })
      ).rejects.toThrow();

      const jobRevenue = await api.revenue.forJob({ jobId });
      expect(jobRevenue?.expected).toBe(16000); // 8000 x 2 positions
      expect(jobRevenue?.actual).toBe(8500);
      expect(jobRevenue?.missed).toBe(7500);
      expect(jobRevenue?.placementsCount).toBe(1);

      const summary = await api.revenue.summary();
      const jobRow = summary.byJob.find((j) => j.jobId === jobId);
      expect(jobRow?.actual).toBe(8500);
      const clientRow = summary.byClient.find((c) => c.key === companyId);
      expect(clientRow?.actual).toBe(8500);
      const ownerRow = summary.byOwner.find((o) => o.key === userId);
      expect(ownerRow?.actual).toBe(8500);
      expect(summary.totals.actual).toBeGreaterThanOrEqual(8500);
    },
    DB_TIMEOUT
  );

  it(
    "withdraw and decline move the application to terminal offer statuses",
    async () => {
      const api = caller();
      // Withdraw a draft offer -> application offer_withdrawn.
      const draft = await api.offers.create({ applicationId: appId2, salaryAmount: 40000 });
      await api.offers.withdraw({ id: draft.id, reason: "Budget pulled" });
      let appNow = await api.applications.get({ id: appId2 });
      expect(appNow.statusKey).toBe("offer_withdrawn");
      expect(appNow.stage).toBe("rejected");

      // A fresh sent offer can then be declined.
      const sent = await api.offers.create({ applicationId: appId2, salaryAmount: 41000 });
      await api.offers.send({ id: sent.id });
      await api.offers.decline({ id: sent.id, reason: "Accepted elsewhere" });
      appNow = await api.applications.get({ id: appId2 });
      expect(appNow.statusKey).toBe("offer_declined");

      // Illegal transition (accept a declined offer) is rejected.
      await expect(api.offers.accept({ id: sent.id })).rejects.toThrow();
    },
    DB_TIMEOUT
  );
});
