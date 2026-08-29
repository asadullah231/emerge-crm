/**
 * One-shot parse confirmation (UP-01/UP-02): when a parse job is flagged
 * auto_confirm, the worker creates the candidate straight after parsing, so
 * an upload lands in Candidates with no manual review step. Ambiguous results
 * (missing last name, duplicate email) are left in status=parsed so they show
 * up in the Needs review list instead of creating junk records.
 */
import { sql, and, eq, isNull, or } from "drizzle-orm";
import {
  applicationStatuses,
  applicationStatusHistory,
  applications,
  attachments,
  auditLog,
  candidateEducation,
  candidateExperience,
  candidates,
  counters,
  jobs,
  parseJobs,
  withWorkspace,
  type Transaction
} from "@emerge/db";
import { parsedResumeSchema } from "@emerge/core";

type Db = Parameters<typeof withWorkspace>[0];

function lower(v: string | null | undefined): string | null {
  return v ? v.toLowerCase() : null;
}

/** Same atomic counter allocation the web app uses (apps/web/src/server/counters.ts). */
async function nextCounter(
  tx: Transaction,
  workspaceId: string,
  entityType: string
): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ workspaceId, entityType, value: 1 })
    .onConflictDoUpdate({
      target: [counters.workspaceId, counters.entityType],
      set: { value: sql`${counters.value} + 1` }
    })
    .returning({ value: counters.value });
  if (!row) throw new Error("counter allocation failed");
  return row.value;
}

function humanId(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

/**
 * Try to confirm the freshly parsed job automatically. Returns "confirmed"
 * when a candidate was created, or "review" (with a reason) when the result
 * needs a human. Failures are the caller's to log; the row simply stays in
 * status=parsed, which is the safe fallback.
 */
export async function tryAutoConfirm(
  db: Db,
  workspaceId: string,
  parseJobId: string
): Promise<{ outcome: "confirmed"; candidateId: string } | { outcome: "review"; reason: string }> {
  return withWorkspace(db, workspaceId, async (tx) => {
    const [pj] = await tx.select().from(parseJobs).where(eq(parseJobs.id, parseJobId));
    if (!pj || pj.status !== "parsed") return { outcome: "review", reason: "not in parsed state" };

    const parsed = parsedResumeSchema.safeParse(pj.parsed);
    if (!parsed.success) return { outcome: "review", reason: "unreadable parse result" };
    const c = parsed.data;
    if (!c.lastName || !c.lastName.trim()) {
      return { outcome: "review", reason: "missing last name" };
    }

    const email = lower(c.email);
    if (email) {
      const [dupe] = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            isNull(candidates.deletedAt),
            or(eq(candidates.email, email), eq(candidates.secondaryEmail, email))
          )
        )
        .limit(1);
      if (dupe) return { outcome: "review", reason: "duplicate email" };
    }

    const next = await nextCounter(tx, workspaceId, "candidate");
    const [cand] = await tx
      .insert(candidates)
      .values({
        workspaceId,
        humanId: humanId("CAND", next),
        firstName: c.firstName,
        lastName: c.lastName.trim(),
        title: c.title,
        currentEmployer: c.currentEmployer,
        email,
        secondaryEmail: lower(c.secondaryEmail),
        phone: c.phone,
        mobile: c.mobile,
        city: c.city,
        country: c.country,
        linkedinUrl: c.linkedinUrl,
        websiteUrl: c.websiteUrl,
        skills: c.skills,
        experienceYears: c.experienceYears,
        source: "parser",
        ownerId: pj.uploadedById
      })
      .returning();
    if (!cand) throw new Error("candidate insert failed");

    if (c.education.length) {
      await tx.insert(candidateEducation).values(
        c.education.map((e, i) => ({
          workspaceId,
          candidateId: cand.id,
          institution: e.institution,
          degree: e.degree,
          fieldOfStudy: e.fieldOfStudy,
          startYear: e.startYear,
          endYear: e.endYear,
          sortOrder: i
        }))
      );
    }
    if (c.experience.length) {
      await tx.insert(candidateExperience).values(
        c.experience.map((e, i) => ({
          workspaceId,
          candidateId: cand.id,
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          isCurrent: e.isCurrent,
          summary: e.summary,
          sortOrder: i
        }))
      );
    }

    // Re-link the uploaded CV to the new candidate (same S3 object).
    await tx.insert(attachments).values({
      workspaceId,
      entityType: "candidate",
      entityId: cand.id,
      kind: "cv",
      bucket: pj.bucket,
      objectKey: pj.objectKey,
      filename: pj.filename,
      mime: pj.mime,
      size: pj.size,
      uploadedById: pj.uploadedById
    });

    // Straight onto the requested job's pipeline (UP-02).
    if (pj.jobId) {
      const [job] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.id, pj.jobId), isNull(jobs.deletedAt)));
      if (job) {
        const [entry] = await tx
          .select({ key: applicationStatuses.key })
          .from(applicationStatuses)
          .where(
            and(eq(applicationStatuses.stage, "screening"), eq(applicationStatuses.isEntry, true))
          )
          .limit(1);
        const entryStatus = entry?.key ?? "associated";
        const nextApp = await nextCounter(tx, workspaceId, "application");
        const [app] = await tx
          .insert(applications)
          .values({
            workspaceId,
            humanId: humanId("APP", nextApp),
            candidateId: cand.id,
            jobId: job.id,
            stage: "screening",
            statusKey: entryStatus,
            ownerId: pj.uploadedById,
            source: "parser",
            stageEnteredAt: new Date()
          })
          .returning({ id: applications.id, humanId: applications.humanId });
        if (app) {
          await tx.insert(applicationStatusHistory).values({
            workspaceId,
            applicationId: app.id,
            toStatusKey: entryStatus,
            toStage: "screening",
            actorUserId: pj.uploadedById
          });
          await tx.insert(auditLog).values({
            workspaceId,
            actorUserId: pj.uploadedById,
            action: "application.created",
            targetType: "application",
            targetId: app.id,
            meta: { humanId: app.humanId, via: "parser_auto" }
          });
        }
      }
    }

    await tx
      .update(parseJobs)
      .set({
        status: "confirmed",
        candidateId: cand.id,
        confirmedById: pj.uploadedById,
        updatedAt: new Date()
      })
      .where(eq(parseJobs.id, parseJobId));

    await tx.insert(auditLog).values({
      workspaceId,
      actorUserId: pj.uploadedById,
      action: "candidate.created",
      targetType: "candidate",
      targetId: cand.id,
      meta: {
        humanId: cand.humanId,
        name: [cand.firstName, cand.lastName].filter(Boolean).join(" "),
        via: "parser_auto"
      }
    });

    return { outcome: "confirmed", candidateId: cand.id };
  });
}
