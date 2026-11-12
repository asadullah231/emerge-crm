import { and, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import {
  applicationStatusHistory,
  applicationStatuses,
  applications,
  candidates,
  companies,
  interviews,
  jobRecruiters,
  jobs,
  memberships,
  notes,
  placements,
  tasks,
  users,
  workspaces,
  type Transaction
} from "@emerge/db";
import {
  APPLICATION_STAGES,
  defaultEntryStatus,
  type ApplicationStageKey
} from "@/lib/applications";
import { writeAudit } from "./audit";
import { humanId, nextCounter } from "./counters";
import { ensureDefaultStatuses } from "./routers/applications";
import { emitWebhook } from "./webhooks";

/**
 * MCP tool layer: lets Claude (claude.ai custom connector / Claude Desktop)
 * operate the CRM over the public-API key infrastructure. Every handler runs
 * inside the key's workspace RLS transaction; the acting user is the key's
 * creator, so history/notes/tasks carry a real name.
 */

export type McpCtx = {
  tx: Transaction;
  workspaceId: string;
  /** The user who created the API key; null for legacy keys. */
  actorId: string | null;
};

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (ctx: McpCtx, args: Record<string, unknown>) => Promise<unknown>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ") || "(no name)";
}

function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

async function resolveCandidate(ctx: McpCtx, ref: string) {
  const where = UUID_RX.test(ref)
    ? eq(candidates.id, ref)
    : eq(candidates.humanId, ref.toUpperCase());
  const [row] = await ctx.tx
    .select()
    .from(candidates)
    .where(and(where, isNull(candidates.deletedAt)))
    .limit(1);
  return row;
}

async function resolveJob(ctx: McpCtx, ref: string) {
  const where = UUID_RX.test(ref) ? eq(jobs.id, ref) : eq(jobs.humanId, ref.toUpperCase());
  const [row] = await ctx.tx
    .select({ id: jobs.id, humanId: jobs.humanId, title: jobs.title, status: jobs.status })
    .from(jobs)
    .where(and(where, isNull(jobs.deletedAt)))
    .limit(1);
  return row;
}

async function entryStatusFor(ctx: McpCtx, stage: ApplicationStageKey): Promise<string> {
  const [row] = await ctx.tx
    .select({ key: applicationStatuses.key })
    .from(applicationStatuses)
    .where(and(eq(applicationStatuses.stage, stage), eq(applicationStatuses.isEntry, true)))
    .limit(1);
  return row?.key ?? defaultEntryStatus(stage);
}

export const MCP_TOOLS: ToolDef[] = [
  {
    name: "find_candidates",
    description:
      "Search candidates by name, email, job title or employer. Returns id, CAND number, name and headline details.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, title or employer to search for" },
        limit: { type: "number", description: "Max results (default 10, max 25)" }
      },
      required: ["query"]
    },
    handler: async (ctx, args) => {
      const q = `%${str(args.query)}%`;
      const limit = Math.min(25, Math.max(1, num(args.limit, 10)));
      return ctx.tx
        .select({
          id: candidates.id,
          humanId: candidates.humanId,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email,
          title: candidates.title,
          currentEmployer: candidates.currentEmployer,
          city: candidates.city
        })
        .from(candidates)
        .where(
          and(
            isNull(candidates.deletedAt),
            or(
              ilike(sql`${candidates.firstName} || ' ' || ${candidates.lastName}`, q),
              ilike(candidates.lastName, q),
              ilike(candidates.email, q),
              ilike(candidates.title, q),
              ilike(candidates.currentEmployer, q)
            )
          )
        )
        .orderBy(desc(candidates.createdAt))
        .limit(limit);
    }
  },
  {
    name: "get_candidate",
    description:
      "Full candidate record by id or CAND number: profile, every application with its pipeline stage, and the latest notes.",
    inputSchema: {
      type: "object",
      properties: {
        candidate: {
          type: "string",
          description: "Candidate id (uuid) or CAND number like CAND-1234"
        }
      },
      required: ["candidate"]
    },
    handler: async (ctx, args) => {
      const cand = await resolveCandidate(ctx, str(args.candidate));
      if (!cand) throw new Error("Candidate not found");
      const [apps, lastNotes] = await Promise.all([
        ctx.tx
          .select({
            applicationId: applications.id,
            stage: applications.stage,
            status: applications.statusKey,
            jobTitle: jobs.title,
            jobHumanId: jobs.humanId,
            client: companies.name,
            since: applications.stageEnteredAt
          })
          .from(applications)
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .leftJoin(companies, eq(companies.id, jobs.companyId))
          .where(and(eq(applications.candidateId, cand.id), isNull(applications.deletedAt))),
        ctx.tx
          .select({
            kind: notes.kind,
            body: notes.body,
            author: users.name,
            createdAt: notes.createdAt
          })
          .from(notes)
          .leftJoin(users, eq(users.id, notes.authorId))
          .where(
            and(
              eq(notes.entityType, "candidate"),
              eq(notes.entityId, cand.id),
              isNull(notes.deletedAt)
            )
          )
          .orderBy(desc(notes.createdAt))
          .limit(5)
      ]);
      return {
        id: cand.id,
        humanId: cand.humanId,
        name: fullName(cand.firstName, cand.lastName),
        email: cand.email,
        phone: cand.phone,
        title: cand.title,
        currentEmployer: cand.currentEmployer,
        city: cand.city,
        country: cand.country,
        skills: cand.skills?.slice(0, 500) ?? null,
        applications: apps,
        recentNotes: lastNotes.map((n) => ({ ...n, body: n.body.slice(0, 300) }))
      };
    }
  },
  {
    name: "create_candidate",
    description: "Create a new candidate. Only lastName is required.",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        title: { type: "string", description: "Current job title" },
        currentEmployer: { type: "string" },
        city: { type: "string" },
        country: { type: "string" },
        skills: { type: "string", description: "Comma-separated skills" }
      },
      required: ["lastName"]
    },
    handler: async (ctx, args) => {
      const lastName = str(args.lastName);
      if (!lastName) throw new Error("lastName is required");
      const next = await nextCounter(ctx.tx, ctx.workspaceId, "candidate");
      const [row] = await ctx.tx
        .insert(candidates)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("CAND", next),
          firstName: str(args.firstName) || null,
          lastName,
          email: str(args.email).toLowerCase() || null,
          phone: str(args.phone) || null,
          title: str(args.title) || null,
          currentEmployer: str(args.currentEmployer) || null,
          city: str(args.city) || null,
          country: str(args.country) || null,
          skills: str(args.skills) || null,
          source: "api"
        })
        .returning({
          id: candidates.id,
          humanId: candidates.humanId,
          lastName: candidates.lastName
        });
      if (row) {
        await emitWebhook(ctx.tx, ctx.workspaceId, "candidate.created", {
          candidateId: row.id,
          humanId: row.humanId,
          via: "mcp"
        });
      }
      return row;
    }
  },
  {
    name: "find_jobs",
    description:
      "Search job openings by title or client name. Status defaults to open; pass status 'any' for all.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Job title or client name (empty = newest first)" },
        status: {
          type: "string",
          description: "open (default), on_hold, filled, cancelled, inactive or any"
        },
        limit: { type: "number", description: "Max results (default 10, max 25)" }
      }
    },
    handler: async (ctx, args) => {
      const q = str(args.query);
      const status = str(args.status) || "open";
      const allowed = ["open", "on_hold", "filled", "cancelled", "inactive", "any"];
      if (!allowed.includes(status)) {
        throw new Error(`status must be one of: ${allowed.join(", ")}`);
      }
      const limit = Math.min(25, Math.max(1, num(args.limit, 10)));
      const rows = await ctx.tx
        .select({
          id: jobs.id,
          humanId: jobs.humanId,
          title: jobs.title,
          client: companies.name,
          status: jobs.status,
          openedAt: jobs.openedAt
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .where(
          and(
            isNull(jobs.deletedAt),
            status === "any" ? undefined : sql`${jobs.status} = ${status}`,
            q ? or(ilike(jobs.title, `%${q}%`), ilike(companies.name, `%${q}%`)) : undefined
          )
        )
        .orderBy(desc(jobs.openedAt))
        .limit(limit);
      return rows.map((r) => ({
        ...r,
        daysLive: Math.floor((Date.now() - r.openedAt.getTime()) / DAY_MS)
      }));
    }
  },
  {
    name: "get_job",
    description:
      "Full job opening by id or JOB number: details, assigned recruiters, and the live pipeline (every candidate with their stage).",
    inputSchema: {
      type: "object",
      properties: {
        job: { type: "string", description: "Job id (uuid) or JOB number like JOB-0112" }
      },
      required: ["job"]
    },
    handler: async (ctx, args) => {
      const job = await resolveJob(ctx, str(args.job));
      if (!job) throw new Error("Job not found");
      const [detail] = await ctx.tx
        .select({
          title: jobs.title,
          status: jobs.status,
          client: companies.name,
          location: jobs.location,
          openedAt: jobs.openedAt,
          owner: users.name
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(users, eq(users.id, jobs.ownerId))
        .where(eq(jobs.id, job.id));
      const [pipeline, recruiters] = await Promise.all([
        ctx.tx
          .select({
            applicationId: applications.id,
            stage: applications.stage,
            status: applications.statusKey,
            candidateId: candidates.id,
            candidateHumanId: candidates.humanId,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            since: applications.stageEnteredAt
          })
          .from(applications)
          .innerJoin(candidates, eq(candidates.id, applications.candidateId))
          .where(and(eq(applications.jobId, job.id), isNull(applications.deletedAt)))
          .orderBy(desc(applications.stageEnteredAt))
          .limit(60),
        ctx.tx
          .select({ name: users.name })
          .from(jobRecruiters)
          .innerJoin(users, eq(users.id, jobRecruiters.userId))
          .where(eq(jobRecruiters.jobId, job.id))
      ]);
      const byStage: Record<string, { candidate: string; applicationId: string }[]> = {};
      for (const p of pipeline) {
        const list = (byStage[p.stage] ??= []);
        list.push({
          candidate: `${fullName(p.firstName, p.lastName)} (${p.candidateHumanId})`,
          applicationId: p.applicationId
        });
      }
      return {
        id: job.id,
        humanId: job.humanId,
        ...detail,
        daysLive: detail ? Math.floor((Date.now() - detail.openedAt.getTime()) / DAY_MS) : null,
        recruiters: recruiters.map((r) => r.name),
        pipeline: byStage
      };
    }
  },
  {
    name: "move_candidate_stage",
    description:
      "Move a candidate's application to another pipeline stage (screening, shortlisted, submitted, interview, offered, hired, rejected, archived). Pass the applicationId from get_job/get_candidate, or candidate + job references. For rejections, always give rejectionReason and rejectedBy (us or client).",
    inputSchema: {
      type: "object",
      properties: {
        applicationId: { type: "string", description: "Application id (preferred)" },
        candidate: { type: "string", description: "Candidate id or CAND number (with job)" },
        job: { type: "string", description: "Job id or JOB number (with candidate)" },
        stage: { type: "string", description: APPLICATION_STAGES.join(", ") },
        note: { type: "string", description: "Optional note recorded with the change" },
        rejectionReason: { type: "string", description: "Why rejected (rejected stage only)" },
        rejectedBy: { type: "string", description: "us or client (rejected stage only)" }
      },
      required: ["stage"]
    },
    handler: async (ctx, args) => {
      const stage = str(args.stage) as ApplicationStageKey;
      if (!APPLICATION_STAGES.includes(stage)) {
        throw new Error(`stage must be one of: ${APPLICATION_STAGES.join(", ")}`);
      }
      let appId = str(args.applicationId);
      if (!appId) {
        const candRef = str(args.candidate);
        const jobRef = str(args.job);
        if (!candRef || !jobRef) throw new Error("Pass applicationId, or candidate + job");
        const [cand, job] = await Promise.all([
          resolveCandidate(ctx, candRef),
          resolveJob(ctx, jobRef)
        ]);
        if (!cand) throw new Error("Candidate not found");
        if (!job) throw new Error("Job not found");
        const [app] = await ctx.tx
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.candidateId, cand.id),
              eq(applications.jobId, job.id),
              isNull(applications.deletedAt)
            )
          )
          .limit(1);
        if (!app) throw new Error("This candidate has no application on that job");
        appId = app.id;
      }

      await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
      const [current] = await ctx.tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, appId), isNull(applications.deletedAt)));
      if (!current) throw new Error("Application not found");
      if (current.stage === stage) {
        return { ok: true, unchanged: true, stage, humanId: current.humanId };
      }

      const note = str(args.note) || null;
      const rejectionReason = stage === "rejected" ? str(args.rejectionReason) || null : null;
      const rejectedByRaw = str(args.rejectedBy);
      const rejectedBy =
        stage === "rejected" && (rejectedByRaw === "us" || rejectedByRaw === "client")
          ? rejectedByRaw
          : null;
      const entryStatus = await entryStatusFor(ctx, stage);

      await ctx.tx
        .update(applications)
        .set({
          stage,
          statusKey: entryStatus,
          rejectionReason,
          rejectedBy,
          stageEnteredAt: new Date()
        })
        .where(eq(applications.id, appId));
      await ctx.tx.insert(applicationStatusHistory).values({
        workspaceId: ctx.workspaceId,
        applicationId: appId,
        fromStatusKey: current.statusKey,
        toStatusKey: entryStatus,
        fromStage: current.stage,
        toStage: stage,
        actorUserId: ctx.actorId,
        note: [rejectionReason, note].filter(Boolean).join(" — ") || null
      });
      if (note) {
        await ctx.tx.insert(notes).values({
          workspaceId: ctx.workspaceId,
          entityType: "application",
          entityId: appId,
          authorId: ctx.actorId,
          kind: "note",
          body: note
        });
      }
      if (ctx.actorId) {
        await writeAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorId,
          action: "application.stage_changed",
          targetType: "application",
          targetId: appId,
          meta: { from: current.stage, to: stage, via: "mcp" }
        });
      }
      await emitWebhook(ctx.tx, ctx.workspaceId, "application.status_changed", {
        applicationId: appId,
        humanId: current.humanId,
        fromStage: current.stage,
        toStage: stage,
        via: "mcp"
      });
      return { ok: true, application: current.humanId, from: current.stage, to: stage };
    }
  },
  {
    name: "add_note",
    description:
      "Add a note to a candidate, job, company or application. Use kind 'call' or 'meeting' to log calls and meetings (they count in the activity reports).",
    inputSchema: {
      type: "object",
      properties: {
        entityType: { type: "string", description: "candidate, job, company or application" },
        entityId: { type: "string", description: "The record's id (uuid)" },
        body: { type: "string" },
        kind: { type: "string", description: "note (default), call or meeting" }
      },
      required: ["entityType", "entityId", "body"]
    },
    handler: async (ctx, args) => {
      const entityType = str(args.entityType);
      const entityId = str(args.entityId);
      const body = str(args.body);
      const kind = (str(args.kind) || "note") as "note" | "call" | "meeting";
      if (!["candidate", "job", "company", "application"].includes(entityType)) {
        throw new Error("entityType must be candidate, job, company or application");
      }
      if (!UUID_RX.test(entityId)) throw new Error("entityId must be a uuid (use the find tools)");
      if (!body) throw new Error("body is required");
      if (!["note", "call", "meeting"].includes(kind)) {
        throw new Error("kind must be note, call or meeting");
      }
      const [row] = await ctx.tx
        .insert(notes)
        .values({
          workspaceId: ctx.workspaceId,
          entityType,
          entityId,
          authorId: ctx.actorId,
          kind,
          body
        })
        .returning({ id: notes.id, createdAt: notes.createdAt });
      return { ok: true, noteId: row?.id, kind };
    }
  },
  {
    name: "create_task",
    description: "Create a task, optionally assigned to a team member by email with a due date.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        description: { type: "string" },
        dueAt: { type: "string", description: "ISO date or date-time, e.g. 2026-11-14" },
        assigneeEmail: { type: "string", description: "Team member's email" }
      },
      required: ["subject"]
    },
    handler: async (ctx, args) => {
      const subject = str(args.subject);
      if (!subject) throw new Error("subject is required");
      let assigneeId: string | null = null;
      const email = str(args.assigneeEmail).toLowerCase();
      if (email) {
        const [member] = await ctx.tx
          .select({ userId: memberships.userId })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(and(eq(users.email, email), isNull(memberships.deactivatedAt)))
          .limit(1);
        if (!member) throw new Error(`No active team member with email ${email}`);
        assigneeId = member.userId;
      }
      const dueRaw = str(args.dueAt);
      const dueAt = dueRaw ? new Date(dueRaw) : null;
      if (dueRaw && Number.isNaN(dueAt?.getTime())) throw new Error("dueAt is not a valid date");
      const [row] = await ctx.tx
        .insert(tasks)
        .values({
          workspaceId: ctx.workspaceId,
          subject,
          description: str(args.description) || null,
          dueAt,
          assigneeId,
          createdById: ctx.actorId
        })
        .returning({ id: tasks.id });
      return { ok: true, taskId: row?.id, assigned: email || "unassigned", dueAt };
    }
  },
  {
    name: "report_today",
    description:
      "What needs attention today: interviews scheduled today, overdue tasks, and submissions waiting 3+ days on a client response.",
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(now);
      dayEnd.setHours(23, 59, 59, 999);
      const staleBefore = new Date(now.getTime() - 3 * DAY_MS);
      const [ivs, overdue, waiting] = await Promise.all([
        ctx.tx
          .select({
            scheduledAt: interviews.scheduledAt,
            type: interviews.type,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            jobTitle: jobs.title
          })
          .from(interviews)
          .innerJoin(applications, eq(applications.id, interviews.applicationId))
          .innerJoin(candidates, eq(candidates.id, applications.candidateId))
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .where(
            and(
              eq(interviews.status, "scheduled"),
              gte(interviews.scheduledAt, dayStart),
              lte(interviews.scheduledAt, dayEnd)
            )
          ),
        ctx.tx
          .select({ subject: tasks.subject, dueAt: tasks.dueAt, assignee: users.name })
          .from(tasks)
          .leftJoin(users, eq(users.id, tasks.assigneeId))
          .where(and(sql`${tasks.status} <> 'done'`, lte(tasks.dueAt, now)))
          .orderBy(tasks.dueAt)
          .limit(10),
        ctx.tx
          .select({ c: sql<number>`count(*)` })
          .from(applications)
          .where(
            and(
              isNull(applications.deletedAt),
              eq(applications.stage, "submitted"),
              lte(applications.stageEnteredAt, staleBefore)
            )
          )
      ]);
      return {
        interviewsToday: ivs.map((i) => ({
          time: i.scheduledAt,
          candidate: fullName(i.firstName, i.lastName),
          job: i.jobTitle,
          type: i.type
        })),
        overdueTasks: overdue,
        submissionsWaitingOnClient3d: Number(waiting[0]?.c ?? 0)
      };
    }
  },
  {
    name: "report_week",
    description:
      "This week's recruiter scoreboard: shortlisted, submitted, interviews and rejections per recruiter plus team totals (targets: 3 shortlisted / 2 submitted each).",
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => {
      const since = weekStart(new Date());
      const rows = await ctx.tx
        .select({
          actor: users.name,
          stage: applicationStatusHistory.toStage,
          c: sql<number>`count(*)`
        })
        .from(applicationStatusHistory)
        .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
        .where(gte(applicationStatusHistory.createdAt, since))
        .groupBy(users.name, applicationStatusHistory.toStage);
      const per = new Map<string, Record<string, number>>();
      const totals: Record<string, number> = {};
      for (const r of rows) {
        if (!["shortlisted", "submitted", "interview", "rejected"].includes(r.stage)) continue;
        const name = r.actor ?? "Unknown";
        const entry = per.get(name) ?? {};
        entry[r.stage] = (entry[r.stage] ?? 0) + Number(r.c);
        per.set(name, entry);
        totals[r.stage] = (totals[r.stage] ?? 0) + Number(r.c);
      }
      return {
        weekStart: since,
        targetsPerRecruiter: { shortlisted: 3, submitted: 2 },
        recruiters: [...per.entries()]
          .map(([name, v]) => ({ name, counts: v }))
          .sort((a, b) => (b.counts.submitted ?? 0) - (a.counts.submitted ?? 0)),
        teamTotals: totals
      };
    }
  },
  {
    name: "report_month",
    description:
      "Month-to-date pacing against the monthly targets set in Settings > Workspace: placements, revenue, submissions, plus open-job count.",
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const [targets, placed, subs, openJobs] = await Promise.all([
        ctx.tx
          .select({
            placements: workspaces.monthlyTargetPlacements,
            submissions: workspaces.monthlyTargetSubmissions,
            revenue: workspaces.monthlyTargetRevenue,
            bdReplies: workspaces.monthlyTargetBdReplies
          })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId)),
        ctx.tx
          .select({ feeAmount: placements.feeAmount, currency: placements.currency })
          .from(placements)
          .where(gte(placements.createdAt, monthStart)),
        ctx.tx
          .select({ c: sql<number>`count(*)` })
          .from(applicationStatusHistory)
          .where(
            and(
              eq(applicationStatusHistory.toStage, "submitted"),
              gte(applicationStatusHistory.createdAt, monthStart)
            )
          ),
        ctx.tx
          .select({ c: sql<number>`count(*)` })
          .from(jobs)
          .where(and(isNull(jobs.deletedAt), eq(jobs.status, "open")))
      ]);
      const revenue = new Map<string, number>();
      for (const p of placed) {
        if (p.feeAmount) {
          const cur = p.currency ?? "GBP";
          revenue.set(cur, (revenue.get(cur) ?? 0) + p.feeAmount);
        }
      }
      return {
        month: {
          day: now.getDate(),
          days: daysInMonth,
          elapsedPct: Math.round((now.getDate() / daysInMonth) * 100)
        },
        targets: targets[0] ?? null,
        actual: {
          placements: placed.length,
          revenue: [...revenue.entries()].map(([currency, amount]) => ({ currency, amount })),
          submissions: Number(subs[0]?.c ?? 0)
        },
        openJobs: Number(openJobs[0]?.c ?? 0)
      };
    }
  },
  {
    name: "find_companies",
    description: "Search clients (companies) by name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", description: "Max results (default 10, max 25)" }
      },
      required: ["query"]
    },
    handler: async (ctx, args) => {
      const q = `%${str(args.query)}%`;
      const limit = Math.min(25, Math.max(1, num(args.limit, 10)));
      return ctx.tx
        .select({
          id: companies.id,
          name: companies.name,
          owner: users.name,
          termsSignedAt: companies.termsSignedAt
        })
        .from(companies)
        .leftJoin(users, eq(users.id, companies.ownerId))
        .where(and(isNull(companies.deletedAt), ilike(companies.name, q)))
        .orderBy(companies.name)
        .limit(limit);
    }
  }
];

export async function callMcpTool(
  ctx: McpCtx,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(ctx, args);
}
