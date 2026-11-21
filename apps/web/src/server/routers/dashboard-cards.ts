import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  min,
  sql,
  type SQL
} from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  candidates,
  companies,
  contacts,
  jobEmploymentType,
  jobs,
  placements,
  submissions,
  userDashboards,
  users
} from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

/*
 * Bullhorn-style dashboard cards (Training video 1.2). Every card takes the
 * same filter shape, mirroring Bullhorn's Configure Card dialog: a user scope
 * (all / mine / picked users), a date preset and card-specific "other" filters.
 * Job-based cards scope users by job owner ("My Jobs"), like Bullhorn.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const DATE_PRESETS = [
  "all",
  "7d",
  "30d",
  "90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year"
] as const;

export const cardFilterSchema = z
  .object({
    scope: z.enum(["all", "mine", "users"]).optional(),
    userIds: z.array(z.string().uuid()).max(25).optional(),
    datePreset: z.enum(DATE_PRESETS).optional(),
    companyId: z.string().uuid().optional(),
    industry: z.string().max(120).optional(),
    employmentType: z.enum(jobEmploymentType.enumValues).optional(),
    skill: z.string().max(80).optional(),
    source: z.string().max(80).optional(),
    granularity: z.enum(["week", "month", "year"]).optional()
  })
  .strict();

export type CardFilter = z.infer<typeof cardFilterSchema>;

const cardInstanceSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.string().min(1).max(40),
    size: z.enum(["s", "m", "l"]),
    title: z.string().max(60).optional(),
    view: z.enum(["chart", "list"]).optional(),
    filter: cardFilterSchema.optional()
  })
  .strict();

const filterInput = z.object({ filter: cardFilterSchema.optional() });

type Ctx = { session: { user: { id: string } } };

/** Owner ids the user scope resolves to; undefined = everyone. */
function ownerIds(ctx: Ctx, f?: CardFilter): string[] | undefined {
  if (f?.scope === "mine") return [ctx.session.user.id];
  if (f?.scope === "users" && f.userIds && f.userIds.length > 0) return f.userIds;
  return undefined;
}

/** [from, to) window for a preset; both undefined for "all". */
export function presetRange(preset: CardFilter["datePreset"], now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  switch (preset) {
    case "7d":
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: undefined };
    case "30d":
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: undefined };
    case "90d":
      return { from: new Date(now.getTime() - 90 * DAY_MS), to: undefined };
    case "this_month":
      return { from: new Date(y, m, 1), to: undefined };
    case "last_month":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case "this_quarter":
      return { from: new Date(y, q, 1), to: undefined };
    case "last_quarter":
      return { from: new Date(y, q - 3, 1), to: new Date(y, q, 1) };
    case "this_year":
      return { from: new Date(y, 0, 1), to: undefined };
    case "last_year":
      return { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1) };
    default:
      return { from: undefined, to: undefined };
  }
}

type Gran = "week" | "month" | "year";

/** Start of the bucket containing `d`. Weeks start Monday. */
export function bucketStart(d: Date, g: Gran): Date {
  if (g === "year") return new Date(d.getFullYear(), 0, 1);
  if (g === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** The last `n` bucket starts, oldest first. */
export function lastBuckets(g: Gran, n: number, now = new Date()): Date[] {
  const out: Date[] = [];
  let cur = bucketStart(now, g);
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    if (g === "year") cur = new Date(cur.getFullYear() - 1, 0, 1);
    else if (g === "month") cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
    else cur = new Date(cur.getTime() - 7 * DAY_MS);
  }
  return out;
}

const BUCKET_COUNT: Record<Gran, number> = { week: 12, month: 12, year: 5 };

/** Shared job predicate: not deleted + owner + other job filters. */
function jobWhere(ctx: Ctx, f?: CardFilter, extra?: SQL): SQL | undefined {
  const owners = ownerIds(ctx, f);
  return and(
    isNull(jobs.deletedAt),
    owners ? inArray(jobs.ownerId, owners) : undefined,
    f?.companyId ? eq(jobs.companyId, f.companyId) : undefined,
    f?.industry ? eq(jobs.industry, f.industry) : undefined,
    f?.employmentType ? eq(jobs.employmentType, f.employmentType) : undefined,
    f?.skill ? ilike(jobs.requiredSkills, `%${f.skill}%`) : undefined,
    extra
  );
}

function dateWhere(col: Parameters<typeof gte>[0], f?: CardFilter): SQL | undefined {
  const { from, to } = presetRange(f?.datePreset);
  return and(from ? gte(col, from) : undefined, to ? lt(col, to) : undefined);
}

const CLOSED = ["filled", "cancelled", "inactive", "declined"] as const;

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function days(from: Date, to: Date | null | undefined): number | null {
  if (!to) return null;
  const d = (to.getTime() - from.getTime()) / DAY_MS;
  return d >= 0 ? d : null;
}

export const dashboardCardsRouter = router({
  /** The signed-in user's saved card layout for one dashboard (null = default). */
  layout: workspaceProcedure
    .input(z.object({ key: z.string().min(1).max(40) }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .select({ cards: userDashboards.cards, updatedAt: userDashboards.updatedAt })
        .from(userDashboards)
        .where(
          and(
            eq(userDashboards.userId, ctx.session.user.id),
            eq(userDashboards.dashboardKey, input.key)
          )
        );
      if (!row) return null;
      const parsed = z.array(cardInstanceSchema).safeParse(row.cards);
      return parsed.success ? parsed.data : null;
    }),

  saveLayout: workspaceProcedure
    .input(z.object({ key: z.string().min(1).max(40), cards: z.array(cardInstanceSchema).max(40) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx
        .insert(userDashboards)
        .values({
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          dashboardKey: input.key,
          cards: input.cards
        })
        .onConflictDoUpdate({
          target: [userDashboards.workspaceId, userDashboards.userId, userDashboards.dashboardKey],
          set: { cards: input.cards, updatedAt: new Date() }
        });
      return { ok: true };
    }),

  /**
   * Success Rates: fill ratio (filled / closed jobs) and hit ratio (placements /
   * submissions), plus the historic fill ratio per week, month or year.
   */
  successRates: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const g: Gran = f?.granularity ?? "month";
    const buckets = lastBuckets(g, BUCKET_COUNT[g]);
    const historyFrom = buckets[0]!;

    const closedRows = await ctx.tx
      .select({ status: jobs.status, closedAt: jobs.closedAt })
      .from(jobs)
      .where(jobWhere(ctx, f, and(inArray(jobs.status, [...CLOSED]), isNotNull(jobs.closedAt))));

    const { from, to } = presetRange(f?.datePreset);
    const inRange = (d: Date) => (!from || d >= from) && (!to || d < to);
    const scoped = closedRows.filter((r) => r.closedAt && inRange(r.closedAt));
    const filled = scoped.filter((r) => r.status === "filled").length;

    const [subs, places] = await Promise.all([
      ctx.tx
        .select({ c: count() })
        .from(submissions)
        .innerJoin(jobs, eq(jobs.id, submissions.jobId))
        .where(and(jobWhere(ctx, f), dateWhere(submissions.sentAt, f))),
      ctx.tx
        .select({ c: count() })
        .from(placements)
        .innerJoin(jobs, eq(jobs.id, placements.jobId))
        .where(and(jobWhere(ctx, f), dateWhere(placements.createdAt, f)))
    ]);
    const submitted = Number(subs[0]?.c ?? 0);
    const placed = Number(places[0]?.c ?? 0);

    const history = buckets.map((start, i) => {
      const end = buckets[i + 1];
      const rows = closedRows.filter(
        (r) => r.closedAt && r.closedAt >= start && (!end || r.closedAt < end)
      );
      const fil = rows.filter((r) => r.status === "filled").length;
      return {
        start,
        closed: rows.length,
        filled: fil,
        ratio: rows.length ? fil / rows.length : 0
      };
    });

    return {
      fillRatio: scoped.length ? filled / scoped.length : null,
      filled,
      closed: scoped.length,
      hitRatio: submitted ? placed / submitted : null,
      placed,
      submitted,
      granularity: g,
      history: history.filter((h) => h.start >= historyFrom)
    };
  }),

  /**
   * Response Times: average days from a job opening to its first candidate
   * activity, first client submission and first placement, plus history.
   */
  responseTimes: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const g: Gran = f?.granularity ?? "month";
    const buckets = lastBuckets(g, BUCKET_COUNT[g]);
    const { from, to } = presetRange(f?.datePreset);
    const windowFrom = from && from < buckets[0]! ? from : buckets[0]!;

    const opened = sql<Date>`coalesce(${jobs.openedAt}, ${jobs.createdAt})`;
    const jobRows = await ctx.tx
      .select({ id: jobs.id, openedAt: opened })
      .from(jobs)
      .where(jobWhere(ctx, f, gte(opened, windowFrom)));
    const ids = jobRows.map((j) => j.id);
    if (ids.length === 0) {
      return {
        toActivity: null,
        toSubmission: null,
        toFill: null,
        granularity: g,
        history: buckets.map((start) => ({
          start,
          toActivity: null,
          toSubmission: null,
          toFill: null
        }))
      };
    }

    const [firstApp, firstSub, firstPlace] = await Promise.all([
      ctx.tx
        .select({ jobId: applications.jobId, at: min(applications.createdAt) })
        .from(applications)
        .where(and(inArray(applications.jobId, ids), isNull(applications.deletedAt)))
        .groupBy(applications.jobId),
      ctx.tx
        .select({ jobId: submissions.jobId, at: min(submissions.sentAt) })
        .from(submissions)
        .where(inArray(submissions.jobId, ids))
        .groupBy(submissions.jobId),
      ctx.tx
        .select({ jobId: placements.jobId, at: min(placements.createdAt) })
        .from(placements)
        .where(inArray(placements.jobId, ids))
        .groupBy(placements.jobId)
    ]);
    const toMap = (rows: { jobId: string | null; at: Date | null }[]) =>
      new Map(rows.filter((r) => r.jobId).map((r) => [r.jobId as string, r.at]));
    const app = toMap(firstApp);
    const sub = toMap(firstSub);
    const place = toMap(firstPlace);

    type Row = { openedAt: Date; act: number | null; sub: number | null; fill: number | null };
    const rows: Row[] = jobRows.map((j) => {
      const o = new Date(j.openedAt);
      return {
        openedAt: o,
        act: days(o, app.get(j.id)),
        sub: days(o, sub.get(j.id)),
        fill: days(o, place.get(j.id))
      };
    });
    const pick = (list: Row[], k: "act" | "sub" | "fill") =>
      avg(list.map((r) => r[k]).filter((v): v is number => v != null));

    const scoped = rows.filter((r) => (!from || r.openedAt >= from) && (!to || r.openedAt < to));
    return {
      toActivity: pick(scoped, "act"),
      toSubmission: pick(scoped, "sub"),
      toFill: pick(scoped, "fill"),
      granularity: g,
      history: buckets.map((start, i) => {
        const end = buckets[i + 1];
        const inB = rows.filter((r) => r.openedAt >= start && (!end || r.openedAt < end));
        return {
          start,
          toActivity: pick(inB, "act"),
          toSubmission: pick(inB, "sub"),
          toFill: pick(inB, "fill")
        };
      })
    };
  }),

  /** Open jobs with no candidates at all: owned but not worked. */
  jobsWithoutCoverage: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const noApps = sql`not exists (select 1 from ${applications} a where a.job_id = ${jobs.id} and a.deleted_at is null)`;
    const rows = await ctx.tx
      .select({
        id: jobs.id,
        humanId: jobs.humanId,
        title: jobs.title,
        companyName: companies.name,
        ownerId: jobs.ownerId,
        ownerName: users.name,
        openedAt: sql<Date>`coalesce(${jobs.openedAt}, ${jobs.createdAt})`
      })
      .from(jobs)
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(users, eq(users.id, jobs.ownerId))
      .where(jobWhere(ctx, f, and(eq(jobs.status, "open"), noApps, dateWhere(jobs.createdAt, f))))
      .orderBy(asc(sql`coalesce(${jobs.openedAt}, ${jobs.createdAt})`))
      .limit(50);
    return rows.map((r) => ({ ...r, openedAt: new Date(r.openedAt) }));
  }),

  /** Jobs grouped by each comma-separated required skill. */
  jobsBySkill: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const rows = await ctx.tx
      .select({ skills: jobs.requiredSkills, status: jobs.status, positions: jobs.positions })
      .from(jobs)
      .where(jobWhere(ctx, f, and(isNotNull(jobs.requiredSkills), dateWhere(jobs.createdAt, f))));
    const map = new Map<
      string,
      { label: string; jobs: number; open: number; roles: number; filled: number; closed: number }
    >();
    for (const r of rows) {
      const parts = (r.skills ?? "")
        .split(/[,;\n|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 60);
      for (const label of new Set(parts.map((p) => p))) {
        const key = label.toLowerCase();
        const cur = map.get(key) ?? { label, jobs: 0, open: 0, roles: 0, filled: 0, closed: 0 };
        cur.jobs++;
        if (r.status === "open") cur.open++;
        cur.roles += r.positions ?? 1;
        if ((CLOSED as readonly string[]).includes(r.status)) cur.closed++;
        if (r.status === "filled") cur.filled++;
        map.set(key, cur);
      }
    }
    return [...map.values()]
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 12)
      .map((s) => ({ ...s, fillRate: s.closed ? s.filled / s.closed : null }));
  }),

  /** Placements starting in a given month (the Starts tab of Starts & Ends). */
  starts: workspaceProcedure
    .input(
      filterInput.extend({
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(0).max(11)
      })
    )
    .query(async ({ ctx, input }) => {
      const f = input.filter;
      const first = `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`;
      const next = new Date(input.year, input.month + 1, 1);
      const last = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      const rows = await ctx.tx
        .select({
          id: placements.id,
          startDate: placements.startDate,
          applicationId: placements.applicationId,
          candidateId: candidates.id,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          jobTitle: jobs.title,
          companyName: companies.name
        })
        .from(placements)
        .innerJoin(jobs, eq(jobs.id, placements.jobId))
        .innerJoin(candidates, eq(candidates.id, placements.candidateId))
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .where(
          and(
            jobWhere(ctx, f),
            sql`${placements.startDate} >= ${first}::date and ${placements.startDate} < ${last}::date`
          )
        )
        .orderBy(asc(placements.startDate));
      return rows;
    }),

  /** Open jobs bucketed by days since opening. */
  jobsByAge: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const rows = await ctx.tx
      .select({ openedAt: sql<Date>`coalesce(${jobs.openedAt}, ${jobs.createdAt})` })
      .from(jobs)
      .where(jobWhere(ctx, f, eq(jobs.status, "open")));
    const now = Date.now();
    const defs = [
      { label: "0 to 7 days", max: 7 },
      { label: "8 to 30 days", max: 30 },
      { label: "31 to 60 days", max: 60 },
      { label: "61 to 90 days", max: 90 },
      { label: "Over 90 days", max: Infinity }
    ];
    const out = defs.map((d) => ({ label: d.label, count: 0 }));
    for (const r of rows) {
      const age = (now - new Date(r.openedAt).getTime()) / DAY_MS;
      const i = defs.findIndex((d) => age <= d.max);
      out[i === -1 ? defs.length - 1 : i]!.count++;
    }
    return out;
  }),

  /** Open jobs grouped by industry (Bullhorn: Jobs by Business Sector). */
  jobsByIndustry: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const label = sql<string>`coalesce(nullif(trim(${jobs.industry}), ''), 'Not set')`;
    const rows = await ctx.tx
      .select({ label, count: count() })
      .from(jobs)
      .where(jobWhere(ctx, f, and(eq(jobs.status, "open"), dateWhere(jobs.createdAt, f))))
      .groupBy(label)
      .orderBy(desc(count()))
      .limit(12);
    return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  }),

  /** Companies grouped by status. */
  companiesByStatus: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const owners = ownerIds(ctx, f);
    const rows = await ctx.tx
      .select({ status: companies.status, count: count() })
      .from(companies)
      .where(
        and(
          isNull(companies.deletedAt),
          owners ? inArray(companies.ownerId, owners) : undefined,
          f?.industry ? eq(companies.industry, f.industry) : undefined,
          f?.source ? eq(companies.source, f.source) : undefined,
          dateWhere(companies.createdAt, f)
        )
      )
      .groupBy(companies.status)
      .orderBy(desc(count()));
    return rows.map((r) => ({ label: r.status, count: Number(r.count) }));
  }),

  /** Companies ranked by open jobs. */
  companiesByOpenJobs: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const rows = await ctx.tx
      .select({ id: companies.id, label: companies.name, count: count() })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(jobWhere(ctx, f, and(eq(jobs.status, "open"), isNull(companies.deletedAt))))
      .groupBy(companies.id, companies.name)
      .orderBy(desc(count()))
      .limit(12);
    return rows.map((r) => ({ id: r.id, label: r.label, count: Number(r.count) }));
  }),

  /** Companies ranked by placements in the date window. */
  companiesByPlacements: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const rows = await ctx.tx
      .select({ id: companies.id, label: companies.name, count: count() })
      .from(placements)
      .innerJoin(jobs, eq(jobs.id, placements.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(jobWhere(ctx, f), dateWhere(placements.createdAt, f)))
      .groupBy(companies.id, companies.name)
      .orderBy(desc(count()))
      .limit(12);
    return rows.map((r) => ({ id: r.id, label: r.label, count: Number(r.count) }));
  }),

  /** Records grouped by owner (Bullhorn: X by Consultant). */
  byOwner: workspaceProcedure
    .input(filterInput.extend({ entity: z.enum(["contacts", "candidates", "jobs"]) }))
    .query(async ({ ctx, input }) => {
      const f = input.filter;
      const owners = ownerIds(ctx, f);
      const t =
        input.entity === "contacts" ? contacts : input.entity === "candidates" ? candidates : jobs;
      const label = sql<string>`coalesce(${users.name}, 'Unassigned')`;
      const rows = await ctx.tx
        .select({ label, count: count() })
        .from(t)
        .leftJoin(users, eq(users.id, t.ownerId))
        .where(
          and(
            isNull(t.deletedAt),
            owners ? inArray(t.ownerId, owners) : undefined,
            input.entity === "candidates" && f?.source
              ? sql`${candidates.source}::text = ${f.source}`
              : undefined,
            dateWhere(t.createdAt, f)
          )
        )
        .groupBy(label)
        .orderBy(desc(count()))
        .limit(15);
      return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
    }),

  /** Candidates grouped by source. */
  candidatesBySource: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const f = input.filter;
    const owners = ownerIds(ctx, f);
    const label = sql<string>`coalesce(nullif(trim(${candidates.source}::text), ''), 'Not set')`;
    const rows = await ctx.tx
      .select({ label, count: count() })
      .from(candidates)
      .where(
        and(
          isNull(candidates.deletedAt),
          owners ? inArray(candidates.ownerId, owners) : undefined,
          dateWhere(candidates.createdAt, f)
        )
      )
      .groupBy(label)
      .orderBy(desc(count()))
      .limit(12);
    return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  }),

  /** New records per week / month / year (Bullhorn: X over Time). */
  overTime: workspaceProcedure
    .input(
      filterInput.extend({
        entity: z.enum(["companies", "contacts", "candidates", "jobs", "placements"])
      })
    )
    .query(async ({ ctx, input }) => {
      const f = input.filter;
      const g: Gran = f?.granularity ?? "month";
      const buckets = lastBuckets(g, BUCKET_COUNT[g]);
      const since = buckets[0]!;
      const owners = ownerIds(ctx, f);
      let dates: Date[] = [];
      if (input.entity === "jobs") {
        const r = await ctx.tx
          .select({ at: jobs.createdAt })
          .from(jobs)
          .where(jobWhere(ctx, f, gte(jobs.createdAt, since)));
        dates = r.map((x) => x.at);
      } else if (input.entity === "placements") {
        const r = await ctx.tx
          .select({ at: placements.createdAt })
          .from(placements)
          .innerJoin(jobs, eq(jobs.id, placements.jobId))
          .where(and(jobWhere(ctx, f), gte(placements.createdAt, since)));
        dates = r.map((x) => x.at);
      } else {
        const t =
          input.entity === "companies"
            ? companies
            : input.entity === "contacts"
              ? contacts
              : candidates;
        const r = await ctx.tx
          .select({ at: t.createdAt })
          .from(t)
          .where(
            and(
              isNull(t.deletedAt),
              owners ? inArray(t.ownerId, owners) : undefined,
              gte(t.createdAt, since)
            )
          );
        dates = r.map((x) => x.at);
      }
      const counts = buckets.map(() => 0);
      for (const d of dates) {
        const s = bucketStart(d, g).getTime();
        const i = buckets.findIndex((b) => b.getTime() === s);
        if (i >= 0) counts[i]!++;
      }
      return { granularity: g, points: buckets.map((start, i) => ({ start, count: counts[i]! })) };
    }),

  /** Newest records with their age (Bullhorn: Contacts over Time list view). */
  newest: workspaceProcedure
    .input(filterInput.extend({ entity: z.enum(["companies", "contacts", "candidates"]) }))
    .query(async ({ ctx, input }) => {
      const f = input.filter;
      const owners = ownerIds(ctx, f);
      if (input.entity === "companies") {
        const r = await ctx.tx
          .select({
            id: companies.id,
            name: companies.name,
            sub: companies.status,
            createdAt: companies.createdAt
          })
          .from(companies)
          .where(
            and(
              isNull(companies.deletedAt),
              owners ? inArray(companies.ownerId, owners) : undefined
            )
          )
          .orderBy(desc(companies.createdAt))
          .limit(10);
        return r.map((x) => ({ ...x, sub: x.sub as string | null }));
      }
      const t = input.entity === "contacts" ? contacts : candidates;
      const r = await ctx.tx
        .select({
          id: t.id,
          first: t.firstName,
          last: t.lastName,
          sub: t.title,
          createdAt: t.createdAt
        })
        .from(t)
        .where(and(isNull(t.deletedAt), owners ? inArray(t.ownerId, owners) : undefined))
        .orderBy(desc(t.createdAt))
        .limit(10);
      return r.map((x) => ({
        id: x.id,
        name: [x.first, x.last].filter(Boolean).join(" ") || "Unnamed",
        sub: x.sub,
        createdAt: x.createdAt
      }));
    })
});
