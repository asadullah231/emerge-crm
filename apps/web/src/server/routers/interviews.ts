import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  candidates,
  contacts,
  interviewFeedback,
  interviewParticipants,
  interviewStatus,
  interviewType,
  interviews,
  jobs,
  users,
  type Transaction
} from "@emerge/db";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { router, workspaceProcedure } from "../trpc";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Insert the interviewer/contact participant rows for one interview. */
async function insertParticipants(
  tx: Transaction,
  workspaceId: string,
  interviewId: string,
  userIds: string[],
  contactIds: string[]
) {
  const rows = [
    ...userIds.map((userId) => ({ workspaceId, interviewId, userId, contactId: null })),
    ...contactIds.map((contactId) => ({ workspaceId, interviewId, userId: null, contactId }))
  ];
  if (rows.length > 0) await tx.insert(interviewParticipants).values(rows);
}

/** Participants (internal + external) for one interview, with display fields. */
async function loadParticipants(tx: Transaction, interviewId: string) {
  return tx
    .select({
      id: interviewParticipants.id,
      userId: interviewParticipants.userId,
      contactId: interviewParticipants.contactId,
      role: interviewParticipants.role,
      userName: users.name,
      userEmail: users.email,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email
    })
    .from(interviewParticipants)
    .leftJoin(users, eq(users.id, interviewParticipants.userId))
    .leftJoin(contacts, eq(contacts.id, interviewParticipants.contactId))
    .where(eq(interviewParticipants.interviewId, interviewId));
}

export const interviewsRouter = router({
  byApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .select()
        .from(interviews)
        .where(eq(interviews.applicationId, input.applicationId))
        .orderBy(desc(interviews.scheduledAt));
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const [parts, feedback] = await Promise.all([
        ctx.tx
          .select({
            interviewId: interviewParticipants.interviewId,
            userId: interviewParticipants.userId,
            contactId: interviewParticipants.contactId,
            userName: users.name,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName
          })
          .from(interviewParticipants)
          .leftJoin(users, eq(users.id, interviewParticipants.userId))
          .leftJoin(contacts, eq(contacts.id, interviewParticipants.contactId))
          .where(inArray(interviewParticipants.interviewId, ids)),
        ctx.tx
          .select({
            interviewId: interviewFeedback.interviewId,
            rating: interviewFeedback.rating,
            recommendation: interviewFeedback.recommendation
          })
          .from(interviewFeedback)
          .where(inArray(interviewFeedback.interviewId, ids))
      ]);
      return rows.map((r) => {
        const fb = feedback.filter((f) => f.interviewId === r.id);
        const avg = fb.length > 0 ? fb.reduce((s, f) => s + f.rating, 0) / fb.length : null;
        return {
          ...r,
          participants: parts
            .filter((p) => p.interviewId === r.id)
            .map((p) => ({
              userId: p.userId,
              contactId: p.contactId,
              name: p.userName ?? [p.contactFirstName, p.contactLastName].filter(Boolean).join(" ")
            })),
          feedbackCount: fb.length,
          avgRating: avg
        };
      });
    }),

  /** All interviews across a job's applications (job record related list, M17c). */
  byJob: workspaceProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: interviews.id,
          humanId: interviews.humanId,
          applicationId: interviews.applicationId,
          type: interviews.type,
          status: interviews.status,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(eq(applications.jobId, input.jobId))
        .orderBy(desc(interviews.scheduledAt));
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .select({
          id: interviews.id,
          humanId: interviews.humanId,
          applicationId: interviews.applicationId,
          type: interviews.type,
          status: interviews.status,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          location: interviews.location,
          meetingLink: interviews.meetingLink,
          notes: interviews.notes,
          cancellationReason: interviews.cancellationReason,
          organizerId: interviews.organizerId,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          jobTitle: jobs.title
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(eq(interviews.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      const participants = await loadParticipants(ctx.tx, row.id);
      return { ...row, participants };
    }),

  /** Interviews I organize or attend, from `days` ago onward (My Interviews). */
  mine: workspaceProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(14) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const until = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
      const mineIds = await ctx.tx
        .select({ interviewId: interviewParticipants.interviewId })
        .from(interviewParticipants)
        .where(eq(interviewParticipants.userId, ctx.session.user.id));
      const idList = mineIds.map((m) => m.interviewId);
      return ctx.tx
        .select({
          id: interviews.id,
          humanId: interviews.humanId,
          applicationId: interviews.applicationId,
          type: interviews.type,
          status: interviews.status,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          meetingLink: interviews.meetingLink,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          jobTitle: jobs.title
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(
          and(
            gte(interviews.scheduledAt, since),
            lte(interviews.scheduledAt, until),
            or(
              eq(interviews.organizerId, ctx.session.user.id),
              idList.length > 0 ? inArray(interviews.id, idList) : undefined
            )
          )
        )
        .orderBy(asc(interviews.scheduledAt))
        .limit(200);
    }),

  schedule: workspaceProcedure
    .input(
      z.object({
        applicationId: z.string().uuid(),
        type: z.enum(interviewType.enumValues).default("screen"),
        scheduledAt: z.date(),
        durationMins: z.number().int().min(5).max(600).default(30),
        location: optionalText(255),
        meetingLink: optionalText(500),
        notes: optionalText(5000),
        interviewerUserIds: z.array(z.string().uuid()).max(20).default([]),
        contactIds: z.array(z.string().uuid()).max(20).default([]),
        organizerId: z.string().uuid().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [app] = await ctx.tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, input.applicationId));
      if (!app) throw new TRPCError({ code: "BAD_REQUEST", message: "Application not found" });

      const next = await nextCounter(ctx.tx, ctx.workspaceId, "interview");
      const [created] = await ctx.tx
        .insert(interviews)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("INT", next),
          applicationId: input.applicationId,
          type: input.type,
          scheduledAt: input.scheduledAt,
          durationMins: input.durationMins,
          location: input.location ?? null,
          meetingLink: input.meetingLink ?? null,
          notes: input.notes ?? null,
          organizerId: input.organizerId ?? ctx.session.user.id,
          createdById: ctx.session.user.id
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await insertParticipants(
        ctx.tx,
        ctx.workspaceId,
        created.id,
        input.interviewerUserIds,
        input.contactIds
      );
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "interview.scheduled",
        targetType: "application",
        targetId: input.applicationId,
        meta: { interviewId: created.id, humanId: created.humanId, type: created.type }
      });
      return created;
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          type: z.enum(interviewType.enumValues).optional(),
          scheduledAt: z.date().optional(),
          durationMins: z.number().int().min(5).max(600).optional(),
          location: optionalText(255),
          meetingLink: optionalText(500),
          notes: optionalText(5000),
          interviewerUserIds: z.array(z.string().uuid()).max(20).optional(),
          contactIds: z.array(z.string().uuid()).max(20).optional()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.tx.select().from(interviews).where(eq(interviews.id, input.id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });

      const timeChanged =
        input.patch.scheduledAt !== undefined &&
        input.patch.scheduledAt.getTime() !== current.scheduledAt.getTime();
      const { interviewerUserIds, contactIds, ...fields } = input.patch;
      const [updated] = await ctx.tx
        .update(interviews)
        .set({
          ...fields,
          sequence: timeChanged ? current.sequence + 1 : current.sequence
        })
        .where(eq(interviews.id, input.id))
        .returning();

      if (interviewerUserIds !== undefined || contactIds !== undefined) {
        await ctx.tx
          .delete(interviewParticipants)
          .where(eq(interviewParticipants.interviewId, input.id));
        await insertParticipants(
          ctx.tx,
          ctx.workspaceId,
          input.id,
          interviewerUserIds ?? [],
          contactIds ?? []
        );
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: timeChanged ? "interview.rescheduled" : "interview.updated",
        targetType: "application",
        targetId: current.applicationId,
        meta: { interviewId: input.id }
      });
      return updated;
    }),

  setStatus: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(interviewStatus.enumValues),
        cancellationReason: optionalText(500)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.tx.select().from(interviews).where(eq(interviews.id, input.id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      const cancelled = input.status === "cancelled";
      const [updated] = await ctx.tx
        .update(interviews)
        .set({
          status: input.status,
          cancellationReason: cancelled ? (input.cancellationReason ?? null) : null,
          sequence: cancelled ? current.sequence + 1 : current.sequence
        })
        .where(eq(interviews.id, input.id))
        .returning();
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: `interview.${input.status}`,
        targetType: "application",
        targetId: current.applicationId,
        meta: { interviewId: input.id }
      });
      return updated;
    })
});
