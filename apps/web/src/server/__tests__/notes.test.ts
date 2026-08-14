import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_NOTE_TEMPLATES, mentionIdsInBody } from "@/lib/notes";
import { relativeTime } from "@/lib/time";

// Unit checks (no DB): mention filtering, templates, relative time.
describe("notes helpers (M6)", () => {
  const alice = { userId: "u-alice", name: "Alice" };
  const bob = { userId: "u-bob", name: "Bob" };

  it("keeps only mentions still present in the body", () => {
    expect(mentionIdsInBody("hey @Alice look", [alice, bob])).toEqual(["u-alice"]);
    expect(mentionIdsInBody("nobody here", [alice, bob])).toEqual([]);
  });

  it("dedupes repeated mentions of the same person", () => {
    expect(mentionIdsInBody("@Alice and @Alice", [alice])).toEqual(["u-alice"]);
  });

  it("ships a default screening-call template", () => {
    expect(DEFAULT_NOTE_TEMPLATES.some((t) => /screening/i.test(t.name))).toBe(true);
  });

  it("formats recent times compactly", () => {
    expect(relativeTime(new Date())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 2 * 3600_000))).toBe("2h");
  });
});

// DB-backed checks for M6: notes/notifications RLS, mention fan-out, unread flow.
const DB_TIMEOUT = 20_000;
describe.skipIf(!process.env.DATABASE_URL)("notes + notifications (M6, DB)", () => {
  let db: import("@emerge/db").Database;
  let dbmod: typeof import("@emerge/db");
  let wsA: string;
  let wsB: string;
  let author: string;
  let mentioned: string;

  beforeAll(async () => {
    dbmod = await import("@emerge/db");
    db = dbmod.createDb();
    const [a] = await db.insert(dbmod.workspaces).values({ name: "Notes Test A" }).returning();
    const [b] = await db.insert(dbmod.workspaces).values({ name: "Notes Test B" }).returning();
    if (!a || !b) throw new Error("workspace seed failed");
    wsA = a.id;
    wsB = b.id;
    const [u1] = await db
      .insert(dbmod.users)
      .values({ email: `author-${Date.now()}@test.local`, name: "Author", passwordHash: "x" })
      .returning();
    const [u2] = await db
      .insert(dbmod.users)
      .values({ email: `mention-${Date.now()}@test.local`, name: "Mentioned", passwordHash: "x" })
      .returning();
    if (!u1 || !u2) throw new Error("user seed failed");
    author = u1.id;
    mentioned = u2.id;
    await db.insert(dbmod.memberships).values([
      { workspaceId: wsA, userId: author, role: "recruiter" },
      { workspaceId: wsA, userId: mentioned, role: "recruiter" }
    ]);
  }, DB_TIMEOUT);

  afterAll(async () => {
    const { inArray } = await import("drizzle-orm");
    await db.delete(dbmod.workspaces).where(inArray(dbmod.workspaces.id, [wsA, wsB]));
    await db.delete(dbmod.users).where(inArray(dbmod.users.id, [author, mentioned]));
    await db.close();
  }, DB_TIMEOUT);

  it(
    "hides another workspace's notes under RLS",
    async () => {
      const [note] = await db
        .insert(dbmod.notes)
        .values({
          workspaceId: wsB,
          entityType: "candidate",
          entityId: crypto.randomUUID(),
          authorId: author,
          body: "secret"
        })
        .returning();
      if (!note) throw new Error("seed failed");
      const { eq } = await import("drizzle-orm");
      const rows = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.select().from(dbmod.notes).where(eq(dbmod.notes.id, note.id))
      );
      expect(rows).toHaveLength(0);
    },
    DB_TIMEOUT
  );

  it(
    "fans a mention out to a notification for the mentioned user only",
    async () => {
      const entityId = crypto.randomUUID();
      const result = await dbmod.withWorkspace(db, wsA, async (tx) => {
        const [note] = await tx
          .insert(dbmod.notes)
          .values({
            workspaceId: wsA,
            entityType: "candidate",
            entityId,
            authorId: author,
            body: "ping @Mentioned"
          })
          .returning();
        await tx
          .insert(dbmod.noteMentions)
          .values({ workspaceId: wsA, noteId: note!.id, userId: mentioned });
        await tx.insert(dbmod.notifications).values({
          workspaceId: wsA,
          recipientId: mentioned,
          kind: "mention",
          actorId: author,
          entityType: "candidate",
          entityId,
          noteId: note!.id
        });
        return note!.id;
      });
      expect(result).toBeTruthy();

      const { and, eq, isNull } = await import("drizzle-orm");
      const forMentioned = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .select()
          .from(dbmod.notifications)
          .where(
            and(eq(dbmod.notifications.recipientId, mentioned), isNull(dbmod.notifications.readAt))
          )
      );
      expect(forMentioned.length).toBeGreaterThanOrEqual(1);

      const forAuthor = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.select().from(dbmod.notifications).where(eq(dbmod.notifications.recipientId, author))
      );
      expect(forAuthor).toHaveLength(0);
    },
    DB_TIMEOUT
  );

  it(
    "marks a notification read",
    async () => {
      const { and, eq, isNull } = await import("drizzle-orm");
      const [notif] = await db
        .insert(dbmod.notifications)
        .values({
          workspaceId: wsA,
          recipientId: mentioned,
          kind: "mention",
          entityType: "candidate",
          entityId: crypto.randomUUID()
        })
        .returning();
      if (!notif) throw new Error("seed failed");
      await dbmod.withWorkspace(db, wsA, (tx) =>
        tx
          .update(dbmod.notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(dbmod.notifications.id, notif.id),
              eq(dbmod.notifications.recipientId, mentioned),
              isNull(dbmod.notifications.readAt)
            )
          )
      );
      const [after] = await dbmod.withWorkspace(db, wsA, (tx) =>
        tx.select().from(dbmod.notifications).where(eq(dbmod.notifications.id, notif.id))
      );
      expect(after?.readAt).not.toBeNull();
    },
    DB_TIMEOUT
  );
});
