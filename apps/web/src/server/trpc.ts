import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { withWorkspace, type Database, type WorkspaceRole } from "@emerge/db";
import type { SessionInfo } from "./auth/sessions";

export type TRPCContext = {
  db: Database;
  session: SessionInfo | null;
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a valid session cookie. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

const ROLE_RANK: Record<WorkspaceRole, number> = { readonly: 0, recruiter: 1, admin: 2 };

export function roleAtLeast(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Runs the procedure inside a workspace-scoped RLS transaction (ctx.tx).
 * Also the global write gate: read-only members cannot call any mutation.
 * A failed procedure rethrows so the transaction rolls back.
 */
export const workspaceProcedure = protectedProcedure.use(async ({ ctx, type, next }) => {
  const session = ctx.session;
  if (type === "mutation" && !roleAtLeast(session.role, "recruiter")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Read-only members cannot make changes" });
  }
  return withWorkspace(ctx.db, session.workspaceId, async (tx) => {
    const result = await next({
      ctx: { ...ctx, tx, workspaceId: session.workspaceId, role: session.role }
    });
    if (!result.ok) throw result.error;
    return result;
  });
});

/** Workspace administration: members, settings, audit log. */
export const adminProcedure = workspaceProcedure.use(({ ctx, next }) => {
  if (!roleAtLeast(ctx.role, "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
  }
  return next();
});
