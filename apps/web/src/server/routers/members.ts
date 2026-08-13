import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { invitations, memberships, sessions, users, workspaces } from "@emerge/db";
import { writeAudit } from "../audit";
import { setSessionCookie } from "../auth/cookies";
import { hashPassword } from "../auth/passwords";
import { createSession, invalidateSession } from "../auth/sessions";
import { generateToken, hashToken } from "../auth/tokens";
import { enqueueEmail } from "../email";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  workspaceProcedure
} from "../trpc";

const roleSchema = z.enum(["admin", "recruiter", "readonly"]);
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function acceptUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/accept-invite?token=${token}`;
}

/** Load a live (pending, unexpired) invitation by raw token, on the owner connection. */
async function findLiveInvitation(db: typeof import("../db").db, token: string) {
  const [invite] = await db
    .select({
      id: invitations.id,
      workspaceId: invitations.workspaceId,
      email: invitations.email,
      role: invitations.role,
      workspaceName: workspaces.name
    })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date())
      )
    )
    .limit(1);
  return invite;
}

/** Attach a user to a workspace: create the membership or revive a deactivated one. */
async function upsertMembership(
  db: typeof import("../db").db,
  userId: string,
  workspaceId: string,
  role: "admin" | "recruiter" | "readonly",
  inviteId: string
) {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
      .limit(1);
    if (existing && !existing.deactivatedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "You are already a member" });
    }
    if (existing) {
      await tx
        .update(memberships)
        .set({ role, deactivatedAt: null })
        .where(eq(memberships.id, existing.id));
    } else {
      await tx.insert(memberships).values({ workspaceId, userId, role });
    }
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, inviteId));
  });
}

export const membersRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select({
        membershipId: memberships.id,
        role: memberships.role,
        deactivatedAt: memberships.deactivatedAt,
        joinedAt: memberships.createdAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, ctx.workspaceId))
      .orderBy(memberships.createdAt);
  }),

  pendingInvitations: adminProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.workspaceId, ctx.workspaceId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date())
        )
      )
      .orderBy(invitations.createdAt);
  }),

  invite: adminProcedure
    .input(z.object({ email: emailSchema, role: roleSchema }))
    .mutation(async ({ ctx, input }) => {
      const [existingMember] = await ctx.tx
        .select({ deactivatedAt: memberships.deactivatedAt })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(users.email, input.email)))
        .limit(1);
      if (existingMember && !existingMember.deactivatedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This person is already a member of the workspace"
        });
      }

      const [pending] = await ctx.tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.workspaceId, ctx.workspaceId),
            eq(invitations.email, input.email),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, new Date())
          )
        )
        .limit(1);
      if (pending) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invitation for this email is already pending"
        });
      }

      const token = generateToken();
      await ctx.tx.insert(invitations).values({
        workspaceId: ctx.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: ctx.session.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS)
      });

      const [workspace] = await ctx.tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, ctx.workspaceId))
        .limit(1);

      await enqueueEmail({
        type: "invitation",
        to: input.email,
        workspaceName: workspace?.name ?? "your workspace",
        inviterName: ctx.session.user.name,
        acceptUrl: acceptUrl(token)
      });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.invited",
        targetType: "invitation",
        targetId: input.email,
        meta: { role: input.role }
      });
      // Returned once so the admin can hand the link over directly.
      return { acceptUrl: acceptUrl(token) };
    }),

  revokeInvitation: adminProcedure
    .input(z.object({ invitationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [invite] = await ctx.tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, input.invitationId), isNull(invitations.acceptedAt)))
        .returning({ email: invitations.email });
      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.invitation_revoked",
        targetType: "invitation",
        targetId: invite.email
      });
      return { ok: true };
    }),

  changeRole: adminProcedure
    .input(z.object({ membershipId: z.string().uuid(), role: roleSchema }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.tx
        .select()
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      if (target.role === "admin" && input.role !== "admin") {
        const admins = await ctx.tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              eq(memberships.workspaceId, ctx.workspaceId),
              eq(memberships.role, "admin"),
              isNull(memberships.deactivatedAt)
            )
          );
        if (admins.length <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A workspace needs at least one admin"
          });
        }
      }

      await ctx.tx
        .update(memberships)
        .set({ role: input.role })
        .where(eq(memberships.id, input.membershipId));
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.role_changed",
        targetType: "membership",
        targetId: input.membershipId,
        meta: { role: input.role }
      });
      return { ok: true };
    }),

  deactivate: adminProcedure
    .input(z.object({ membershipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.tx
        .select()
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      if (target.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate yourself" });
      }

      await ctx.tx
        .update(memberships)
        .set({ deactivatedAt: new Date() })
        .where(eq(memberships.id, input.membershipId));
      // Access ends immediately: kill this user's sessions for this workspace.
      await ctx.tx
        .delete(sessions)
        .where(and(eq(sessions.userId, target.userId), eq(sessions.workspaceId, ctx.workspaceId)));
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.deactivated",
        targetType: "membership",
        targetId: input.membershipId
      });
      return { ok: true };
    }),

  reactivate: adminProcedure
    .input(z.object({ membershipId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.tx
        .update(memberships)
        .set({ deactivatedAt: null })
        .where(eq(memberships.id, input.membershipId))
        .returning({ id: memberships.id });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.reactivated",
        targetType: "membership",
        targetId: input.membershipId
      });
      return { ok: true };
    }),

  // ---- invitation accept flow (no workspace context yet) ----

  invitationInfo: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const invite = await findLiveInvitation(ctx.db, input.token);
      if (!invite) return null;
      const [account] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invite.email))
        .limit(1);
      return {
        workspaceName: invite.workspaceName,
        email: invite.email,
        role: invite.role,
        accountExists: Boolean(account)
      };
    }),

  acceptInvitationExisting: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const invite = await findLiveInvitation(ctx.db, input.token);
      if (!invite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is invalid or has expired"
        });
      }
      if (invite.email !== ctx.session.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This invitation was sent to ${invite.email}. Sign in with that account to accept it.`
        });
      }

      await upsertMembership(
        ctx.db,
        ctx.session.user.id,
        invite.workspaceId,
        invite.role,
        invite.id
      );

      // Switch the session over to the new workspace.
      await invalidateSession(ctx.session.sessionId);
      const { token: sessionToken, expiresAt } = await createSession(
        ctx.session.user.id,
        invite.workspaceId
      );
      await setSessionCookie(sessionToken, expiresAt);
      await writeAudit({
        workspaceId: invite.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "member.invitation_accepted",
        targetType: "membership",
        targetId: ctx.session.user.id,
        meta: { role: invite.role }
      });
      return { workspaceId: invite.workspaceId };
    }),

  acceptInvitationSignup: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        name: z.string().trim().min(1, "Name is required").max(200),
        password: z.string().min(8, "Password must be at least 8 characters")
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invite = await findLiveInvitation(ctx.db, input.token);
      if (!invite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation is invalid or has expired"
        });
      }
      const [existing] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invite.email))
        .limit(1);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists. Sign in to accept the invitation."
        });
      }

      const passwordHash = await hashPassword(input.password);
      const [user] = await ctx.db
        .insert(users)
        .values({ email: invite.email, name: input.name, passwordHash })
        .returning();
      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Signup failed" });
      }
      await upsertMembership(ctx.db, user.id, invite.workspaceId, invite.role, invite.id);

      const { token: sessionToken, expiresAt } = await createSession(user.id, invite.workspaceId);
      await setSessionCookie(sessionToken, expiresAt);
      await writeAudit({
        workspaceId: invite.workspaceId,
        actorUserId: user.id,
        action: "member.invitation_accepted",
        targetType: "membership",
        targetId: user.id,
        meta: { role: invite.role, signup: true }
      });
      return { workspaceId: invite.workspaceId };
    })
});
