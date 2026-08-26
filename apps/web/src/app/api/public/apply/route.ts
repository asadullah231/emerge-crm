import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  candidates,
  jobs,
  notes,
  publicJobPostings,
  withWorkspace
} from "@emerge/db";
import { humanId, nextCounter } from "@/server/counters";
import { db } from "@/server/db";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { ensureDefaultStatuses, entryStatusForStage } from "@/server/routers/applications";
import { emitWebhook } from "@/server/webhooks";

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  jobId: z.string().uuid(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(255),
  phone: z.string().trim().max(60).optional(),
  note: z.string().trim().max(2000).optional()
});

/**
 * Public, no-login application from the careers page (M19, Zoho
 * Web-to-Candidate parity). Only jobs explicitly published are accepted.
 * Candidates dedupe by email; the application lands in Screening with
 * source=careersite. Rate-limited per ip.
 */
export async function POST(req: Request) {
  if (!rateLimit(`apply:${clientIp(req)}`, 5, 60_000)) {
    return Response.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]!.message : "Invalid request";
    return Response.json({ error: message }, { status: 400 });
  }

  // The job must be published for this workspace (owner connection lookup).
  const [posting] = await db
    .select({ id: publicJobPostings.id })
    .from(publicJobPostings)
    .where(
      and(
        eq(publicJobPostings.jobId, body.jobId),
        eq(publicJobPostings.workspaceId, body.workspaceId)
      )
    );
  if (!posting)
    return Response.json({ error: "This job is not accepting applications" }, { status: 404 });

  try {
    const result = await withWorkspace(db, body.workspaceId, async (tx) => {
      const [job] = await tx
        .select({ id: jobs.id, title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.id, body.jobId), isNull(jobs.deletedAt)));
      if (!job) return { error: "This job is not accepting applications" as const };

      await ensureDefaultStatuses(tx, body.workspaceId);
      const email = body.email.toLowerCase();

      let [candidate] = await tx
        .select({
          id: candidates.id,
          humanId: candidates.humanId,
          isBlocked: candidates.isBlocked
        })
        .from(candidates)
        .where(and(eq(candidates.email, email), isNull(candidates.deletedAt)));
      // Blocklist (M20): a blocked candidate cannot apply; keep the reason generic.
      if (candidate?.isBlocked) {
        return { error: "Could not save your application" as const };
      }
      let candidateCreated = false;
      if (!candidate) {
        const next = await nextCounter(tx, body.workspaceId, "candidate");
        [candidate] = await tx
          .insert(candidates)
          .values({
            workspaceId: body.workspaceId,
            humanId: humanId("CAND", next),
            firstName: body.firstName ?? null,
            lastName: body.lastName,
            email,
            phone: body.phone ?? null,
            source: "careersite"
          })
          .returning({
            id: candidates.id,
            humanId: candidates.humanId,
            isBlocked: candidates.isBlocked
          });
        candidateCreated = true;
      }
      if (!candidate) return { error: "Could not save your application" as const };

      const [existing] = await tx
        .select({ id: applications.id, deletedAt: applications.deletedAt })
        .from(applications)
        .where(and(eq(applications.candidateId, candidate.id), eq(applications.jobId, job.id)));
      if (existing && !existing.deletedAt) {
        return { error: "You have already applied for this job" as const };
      }

      const entryStatus = await entryStatusForStage(tx, "screening");
      const nextApp = await nextCounter(tx, body.workspaceId, "application");
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId: body.workspaceId,
          humanId: humanId("APP", nextApp),
          candidateId: candidate.id,
          jobId: job.id,
          stage: "screening",
          statusKey: entryStatus,
          source: "careersite",
          stageEnteredAt: new Date()
        })
        .returning({ id: applications.id });
      if (!application) return { error: "Could not save your application" as const };

      await tx.insert(applicationStatusHistory).values({
        workspaceId: body.workspaceId,
        applicationId: application.id,
        toStatusKey: entryStatus,
        toStage: "screening",
        actorUserId: null,
        note: "Applied via careers page"
      });

      if (body.note) {
        await tx.insert(notes).values({
          workspaceId: body.workspaceId,
          entityType: "application",
          entityId: application.id,
          authorId: null,
          body: `Careers page application note:\n${body.note}`
        });
      }

      if (candidateCreated) {
        await emitWebhook(tx, body.workspaceId, "candidate.created", {
          candidateId: candidate.id,
          humanId: candidate.humanId,
          name: [body.firstName, body.lastName].filter(Boolean).join(" "),
          via: "careersite",
          jobId: job.id
        });
      }
      return { ok: true as const };
    });

    if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[careers apply] failed:", err);
    return Response.json({ error: "Could not save your application" }, { status: 500 });
  }
}
