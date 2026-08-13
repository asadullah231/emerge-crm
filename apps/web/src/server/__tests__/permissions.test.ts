import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { WorkspaceRole } from "@emerge/db";
import {
  adminProcedure,
  createCallerFactory,
  roleAtLeast,
  router,
  workspaceProcedure,
  type TRPCContext
} from "../trpc";
import type { SessionInfo } from "../auth/sessions";

describe("roleAtLeast", () => {
  it("orders readonly < recruiter < admin", () => {
    expect(roleAtLeast("admin", "readonly")).toBe(true);
    expect(roleAtLeast("admin", "recruiter")).toBe(true);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("recruiter", "readonly")).toBe(true);
    expect(roleAtLeast("recruiter", "recruiter")).toBe(true);
    expect(roleAtLeast("recruiter", "admin")).toBe(false);
    expect(roleAtLeast("readonly", "readonly")).toBe(true);
    expect(roleAtLeast("readonly", "recruiter")).toBe(false);
    expect(roleAtLeast("readonly", "admin")).toBe(false);
  });
});

// The matrix below exercises the REAL middlewares against a real database
// (workspaceProcedure opens an RLS transaction). Runs in CI; skipped locally
// when no DATABASE_URL is configured.
describe.skipIf(!process.env.DATABASE_URL)("permission matrix (3 roles x operations)", () => {
  const testRouter = router({
    read: workspaceProcedure.query(() => "read-ok"),
    write: workspaceProcedure.mutation(() => "write-ok"),
    administer: adminProcedure.mutation(() => "admin-ok")
  });
  const createCaller = createCallerFactory(testRouter);

  let db: import("@emerge/db").Database;
  let workspaceId: string;

  function callerFor(role: WorkspaceRole) {
    const session: SessionInfo = {
      sessionId: "00000000-0000-0000-0000-000000000000",
      workspaceId,
      role,
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: `${role}@test.local`,
        name: role,
        avatarUrl: null,
        timezone: "UTC"
      },
      expiresAt: new Date(Date.now() + 60_000)
    };
    return createCaller({ db, session } satisfies TRPCContext);
  }

  beforeAll(async () => {
    const { createDb, workspaces } = await import("@emerge/db");
    db = createDb();
    const [ws] = await db
      .insert(workspaces)
      .values({ name: "Permission Matrix Test" })
      .returning();
    if (!ws) throw new Error("workspace insert failed");
    workspaceId = ws.id;
  });

  afterAll(async () => {
    const { workspaces } = await import("@emerge/db");
    const { eq } = await import("drizzle-orm");
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.close();
  });

  it("lets every role read", async () => {
    await expect(callerFor("readonly").read()).resolves.toBe("read-ok");
    await expect(callerFor("recruiter").read()).resolves.toBe("read-ok");
    await expect(callerFor("admin").read()).resolves.toBe("read-ok");
  });

  it("blocks readonly from every mutation with FORBIDDEN", async () => {
    const caller = callerFor("readonly");
    await expect(caller.write()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.administer()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets recruiter write but not administer", async () => {
    const caller = callerFor("recruiter");
    await expect(caller.write()).resolves.toBe("write-ok");
    await expect(caller.administer()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets admin do everything", async () => {
    const caller = callerFor("admin");
    await expect(caller.write()).resolves.toBe("write-ok");
    await expect(caller.administer()).resolves.toBe("admin-ok");
  });

  it("rejects missing sessions with UNAUTHORIZED", async () => {
    const caller = createCaller({ db, session: null });
    await expect(caller.read()).rejects.toSatisfy(
      (e) => e instanceof TRPCError && e.code === "UNAUTHORIZED"
    );
  });
});
