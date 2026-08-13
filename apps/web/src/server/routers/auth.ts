import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { memberships, passwordResetTokens, users, workspaces } from "@emerge/db";
import { writeAudit } from "../audit";
import { clearSessionCookie, setSessionCookie } from "../auth/cookies";
import { hashPassword, verifyPassword } from "../auth/passwords";
import { createSession, invalidateSession, invalidateUserSessions } from "../auth/sessions";
import { generateToken, hashToken } from "../auth/tokens";
import { enqueueEmail } from "../email";
import { protectedProcedure, publicProcedure, router } from "../trpc";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name is required").max(200),
        email: emailSchema,
        password: passwordSchema,
        workspaceName: z.string().trim().min(1, "Workspace name is required").max(200)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists"
        });
      }

      const passwordHash = await hashPassword(input.password);
      const created = await ctx.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, name: input.name, passwordHash })
          .returning();
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: input.workspaceName })
          .returning();
        if (!user || !workspace) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Signup failed" });
        }
        await tx
          .insert(memberships)
          .values({ userId: user.id, workspaceId: workspace.id, role: "admin" });
        return { user, workspace };
      });

      await writeAudit({
        workspaceId: created.workspace.id,
        actorUserId: created.user.id,
        action: "auth.signup",
        targetType: "user",
        targetId: created.user.id
      });

      const { token, expiresAt } = await createSession(created.user.id, created.workspace.id);
      await setSessionCookie(token, expiresAt);
      return { userId: created.user.id, workspaceId: created.workspace.id };
    }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1, "Password is required") }))
    .mutation(async ({ ctx, input }) => {
      const invalid = () =>
        new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
        await writeAudit({ action: "auth.login_failed", meta: { email: input.email } });
        throw invalid();
      }

      const [membership] = await ctx.db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), isNull(memberships.deactivatedAt)))
        .orderBy(desc(memberships.createdAt))
        .limit(1);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account has no active workspace"
        });
      }

      const { token, expiresAt } = await createSession(user.id, membership.workspaceId);
      await setSessionCookie(token, expiresAt);
      await writeAudit({
        workspaceId: membership.workspaceId,
        actorUserId: user.id,
        action: "auth.login",
        targetType: "user",
        targetId: user.id
      });
      return { userId: user.id, workspaceId: membership.workspaceId };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await invalidateSession(ctx.session.sessionId);
    await clearSessionCookie();
    await writeAudit({
      workspaceId: ctx.session.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "auth.logout",
      targetType: "user",
      targetId: ctx.session.user.id
    });
    return { ok: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [workspace] = await ctx.db
      .select({ id: workspaces.id, name: workspaces.name, logoUrl: workspaces.logoUrl })
      .from(workspaces)
      .where(eq(workspaces.id, ctx.session.workspaceId))
      .limit(1);
    return { user: ctx.session.user, role: ctx.session.role, workspace };
  }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      // Same response either way: no account enumeration.
      if (user) {
        const token = generateToken();
        await ctx.db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
        });
        await enqueueEmail({
          type: "password-reset",
          to: user.email,
          resetUrl: appUrl(`/reset-password?token=${token}`)
        });
        await writeAudit({
          actorUserId: user.id,
          action: "auth.password_reset_requested",
          targetType: "user",
          targetId: user.id
        });
      }
      return { ok: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(1), password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const [reset] = await ctx.db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, hashToken(input.token)))
        .limit(1);
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link is invalid or has expired"
        });
      }

      const passwordHash = await hashPassword(input.password);
      await ctx.db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, reset.id));
      });
      await invalidateUserSessions(reset.userId);
      await writeAudit({
        actorUserId: reset.userId,
        action: "auth.password_reset",
        targetType: "user",
        targetId: reset.userId
      });
      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200).optional(),
        timezone: z.string().trim().min(1).max(100).optional(),
        avatarUrl: z.string().trim().url().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set(input)
        .where(eq(users.id, ctx.session.user.id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
          timezone: users.timezone
        });
      await writeAudit({
        workspaceId: ctx.session.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "user.profile_updated",
        targetType: "user",
        targetId: ctx.session.user.id
      });
      return updated;
    })
});
