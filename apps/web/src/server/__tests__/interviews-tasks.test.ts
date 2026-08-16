import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIcs } from "@/server/ics";
import { appRouter } from "../routers/_app";
import { createCallerFactory, type TRPCContext } from "../trpc";
import type { SessionInfo } from "../auth/sessions";

// Unit checks for the ICS builder (no DB needed).
describe("ICS builder (M11)", () => {
  const ics = buildIcs({
    uid: "u1@emerge",
    start: new Date("2026-03-01T09:00:00Z"),
    durationMins: 30,
    summary: "Screen, Jane",
    location: "Zoom",
    organizer: { email: "org@test.local", name: "Org" },
    attendees: [{ email: "a@test.local", name: "A" }],
    status: "CONFIRMED",
    sequence: 2,
    stamp: new Date("2026-02-01T00:00:00Z")
  });

  it("emits a VEVENT with UTC start/end", () => {
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:u1@emerge");
    expect(ics).toContain("DTSTART:20260301T090000Z");
    expect(ics).toContain("DTEND:20260301T093000Z");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("escapes text and formats attendees", () => {
    expect(ics).toContain("SUMMARY:Screen\\, Jane");
    expect(ics).toContain("ATTENDEE;CN=A;RSVP=TRUE:mailto:a@test.local");
    expect(ics).toContain("ORGANIZER;CN=Org:mailto:org@test.local");
    expect(ics).toContain("STATUS:CONFIRMED");
  });
});

const DB_TIMEOUT = 45_000;
describe.skipIf(!process.env.DATABASE_URL)("interviews + tasks (M11, DB)", () => {
  const createCaller = createCallerFactory(appRouter);
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let userId: string;
  let appId: string;

  function caller() {
    const session: SessionInfo = {
      sessionId: "00000000-0000-0000-0000-000000000000",
      workspaceId: ws,
      role: "admin",
      user: { id: userId, email: "m11@test.local", name: "M11", avatarUrl: null, timezone: "UTC" },
      expiresAt: new Date(Date.now() + 60_000)
    };
    return createCaller({ db, session } satisfies TRPCContext);
  }

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "M11 Test" }).returning();
    ws = w!.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `m11-${Date.now()}@test.local`, name: "M11", passwordHash: "x" })
      .returning();
    userId = user!.id;
    await db.insert(dbmod.memberships).values({ workspaceId: ws, userId, role: "admin" });
    const [company] = await db
      .insert(dbmod.companies)
      .values({ workspaceId: ws, name: "M11 Client" })
      .returning();
    const [job] = await db
      .insert(dbmod.jobs)
      .values({ workspaceId: ws, humanId: "JOB-M1", title: "Role", companyId: company!.id })
      .returning();
    const [cand] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: ws, humanId: "CAND-M1", lastName: "Cand" })
      .returning();
    const [app] = await db
      .insert(dbmod.applications)
      .values({
        workspaceId: ws,
        humanId: "APP-M1",
        candidateId: cand!.id,
        jobId: job!.id,
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
    "schedules an interview with participants and syncs feedback aggregate",
    async () => {
      const api = caller();
      const iv = await api.interviews.schedule({
        applicationId: appId,
        type: "client",
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        durationMins: 45,
        interviewerUserIds: [userId],
        contactIds: []
      });
      expect(iv.humanId).toMatch(/^INT-\d{4}$/);
      expect(iv.status).toBe("scheduled");

      const byApp = await api.interviews.byApplication({ applicationId: appId });
      expect(byApp).toHaveLength(1);
      expect(byApp[0]!.participants.length).toBe(1);

      await api.interviewFeedback.submit({
        interviewId: iv.id,
        rating: 4,
        recommendation: "yes",
        comments: "Solid"
      });
      const score = await api.interviewFeedback.forApplication({ applicationId: appId });
      expect(score.aggregate.count).toBe(1);
      expect(score.aggregate.avgRating).toBe(4);

      // Cancelling bumps the ICS sequence and sets the status.
      const cancelled = await api.interviews.setStatus({
        id: iv.id,
        status: "cancelled",
        cancellationReason: "Client rescheduled"
      });
      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.sequence).toBe(1);
    },
    DB_TIMEOUT
  );

  it(
    "creates a task, lists it on the record and completes it",
    async () => {
      const api = caller();
      const task = await api.tasks.create({
        subject: "Call the candidate",
        entityType: "application",
        entityId: appId,
        dueAt: new Date(Date.now() - 1000) // already overdue
      });
      const onRecord = await api.tasks.byEntity({ entityType: "application", entityId: appId });
      expect(onRecord.some((t) => t.id === task.id)).toBe(true);

      const mineOpen = await api.tasks.mine({ includeDone: false });
      expect(mineOpen.some((t) => t.id === task.id)).toBe(true);

      const done = await api.tasks.setDone({ id: task.id, done: true });
      expect(done.status).toBe("done");
      expect(done.completedAt).not.toBeNull();

      const mineAfter = await api.tasks.mine({ includeDone: false });
      expect(mineAfter.some((t) => t.id === task.id)).toBe(false);
    },
    DB_TIMEOUT
  );
});
