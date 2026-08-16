import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleInboundReply } from "@/server/email-inbound";
import {
  applyMergeFields,
  makeThreadToken,
  mergeFieldsUsed,
  parseThreadToken,
  replyToAddress
} from "@/server/email-render";
import { appRouter } from "../routers/_app";
import { createCallerFactory, type TRPCContext } from "../trpc";
import type { SessionInfo } from "../auth/sessions";

// Pure unit checks: merge fields + reply-to thread token (no DB / Redis).
describe("email merge + threading (M13)", () => {
  it("substitutes known merge fields and blanks unknown ones", () => {
    const out = applyMergeFields("Hi {{candidate.firstName}} re {{job.title}} / {{missing}}", {
      "candidate.firstName": "Sam",
      "job.title": "Engineer"
    });
    expect(out).toBe("Hi Sam re Engineer / ");
  });

  it("lists the merge fields a template uses", () => {
    expect(mergeFieldsUsed("{{a.b}} x {{c.d}} {{a.b}}").sort()).toEqual(["a.b", "c.d"]);
  });

  it("round-trips a reply-to thread token", () => {
    const token = makeThreadToken();
    const addr = replyToAddress(token);
    expect(parseThreadToken([addr])).toBe(token);
    expect(parseThreadToken(['"Sam" <' + addr + ">"])).toBe(token);
    expect(parseThreadToken(["someone@else.com"])).toBeNull();
  });
});

const DB_TIMEOUT = 45_000;
describe.skipIf(!process.env.DATABASE_URL)("emails (M13, DB)", () => {
  const createCaller = createCallerFactory(appRouter);
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let ws: string;
  let userId: string;
  let candWithEmail: string;
  let candNoEmail: string;
  let templateId: string;

  function caller() {
    const session: SessionInfo = {
      sessionId: "00000000-0000-0000-0000-000000000000",
      workspaceId: ws,
      role: "admin",
      user: { id: userId, email: "m13@test.local", name: "M13", avatarUrl: null, timezone: "UTC" },
      expiresAt: new Date(Date.now() + 60_000)
    };
    return createCaller({ db, session } satisfies TRPCContext);
  }

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [w] = await db.insert(dbmod.workspaces).values({ name: "M13 Test" }).returning();
    ws = w!.id;
    const [user] = await db
      .insert(dbmod.users)
      .values({ email: `m13-${Date.now()}@test.local`, name: "M13", passwordHash: "x" })
      .returning();
    userId = user!.id;
    await db.insert(dbmod.memberships).values({ workspaceId: ws, userId, role: "admin" });
    const [c1] = await db
      .insert(dbmod.candidates)
      .values({
        workspaceId: ws,
        humanId: "CAND-M13a",
        firstName: "Sam",
        lastName: "Rivera",
        email: "sam@example.com"
      })
      .returning();
    candWithEmail = c1!.id;
    const [c2] = await db
      .insert(dbmod.candidates)
      .values({ workspaceId: ws, humanId: "CAND-M13b", firstName: "No", lastName: "Email" })
      .returning();
    candNoEmail = c2!.id;
    const api = caller();
    const t = await api.emailTemplates.create({
      name: "Intro",
      subject: "Hi {{candidate.firstName}}",
      bodyHtml: "Hello {{candidate.firstName}}, quick note about a role."
    });
    templateId = t.id;
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(eq(dbmod.workspaces.id, ws));
    await db.delete(dbmod.users).where(eq(dbmod.users.id, userId));
    await db.close();
    // Close the BullMQ email queue so vitest can exit cleanly.
    const g = globalThis as { emailQueue?: { close(): Promise<void> } };
    await g.emailQueue?.close();
  }, DB_TIMEOUT);

  it(
    "sends from a record, logs a queued row with merged subject, and threads an inbound reply",
    async () => {
      const { eq } = await import("drizzle-orm");
      const api = caller();
      const { id } = await api.emails.send({
        entityType: "candidate",
        entityId: candWithEmail,
        subject: "Hi {{candidate.firstName}}",
        body: "Hello {{candidate.firstName}}"
      });

      const thread = await api.emails.byRecord({
        entityType: "candidate",
        entityId: candWithEmail
      });
      expect(thread).toHaveLength(1);
      expect(thread[0]!.subject).toBe("Hi Sam");
      expect(thread[0]!.direction).toBe("outbound");
      expect(thread[0]!.status).toBe("queued");

      // Pull the outbound row's thread token, then simulate a candidate reply.
      const [row] = await db.select().from(dbmod.emails).where(eq(dbmod.emails.id, id));
      expect(row!.threadToken).toBeTruthy();
      const result = await handleInboundReply({
        from: "sam@example.com",
        to: [replyToAddress(row!.threadToken!)],
        subject: "Re: Hi Sam",
        text: "Sounds good, tell me more.",
        messageId: "<reply-1@example.com>"
      });
      expect(result).toEqual({ entityType: "candidate", entityId: candWithEmail });

      const after = await api.emails.byRecord({
        entityType: "candidate",
        entityId: candWithEmail
      });
      expect(after).toHaveLength(2);
      expect(after.some((m) => m.direction === "inbound")).toBe(true);

      const [orig] = await db.select().from(dbmod.emails).where(eq(dbmod.emails.id, id));
      expect(orig!.repliedAt).not.toBeNull();

      const notes = await db
        .select()
        .from(dbmod.notifications)
        .where(eq(dbmod.notifications.recipientId, userId));
      expect(notes.some((n) => n.kind === "email_reply")).toBe(true);
    },
    DB_TIMEOUT
  );

  it(
    "mail-merges a template, personalising each and skipping records without an email",
    async () => {
      const api = caller();
      const res = await api.emails.sendBulk({
        entityType: "candidate",
        entityIds: [candWithEmail, candNoEmail],
        templateId
      });
      expect(res.sent).toBe(1);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0]!.entityId).toBe(candNoEmail);
    },
    DB_TIMEOUT
  );
});
