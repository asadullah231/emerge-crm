"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  BigNumber,
  FunnelChart,
  MultiTrendChart,
  type TrendSeries
} from "@/components/dashboard-charts";
import { PipelineView } from "@/components/pipeline-view";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Overview = RouterOutputs["dashboard"]["overview"];

/** Auto-refresh cadence so the dashboard reflects CRM changes without a reload. */
const REFRESH_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Date-range presets. `days` null = all time; `weeks` drives the trend window. */
const RANGES = [
  { key: "all", label: "All time", days: null, weeks: 12 },
  { key: "7", label: "Last 7 days", days: 7, weeks: 4 },
  { key: "30", label: "Last 30 days", days: 30, weeks: 6 },
  { key: "90", label: "Last 90 days", days: 90, weeks: 13 },
  { key: "180", label: "Last 6 months", days: 180, weeks: 26 }
] as const;

const TREND_SERIES: TrendSeries[] = [
  { key: "candidates", label: "Candidates", color: "var(--brand-secondary)" },
  { key: "applications", label: "Applications", color: "var(--brand-primary)" },
  { key: "interviews", label: "Interviews", color: "#f59e0b" },
  { key: "jobs", label: "Jobs opened", color: "#a1a1aa" }
];

export default function DashboardPage() {
  const me = trpc.auth.me.useQuery();
  const members = trpc.members.list.useQuery();

  const [rangeKey, setRangeKey] = useState<string>("all");
  const [ownerId, setOwnerId] = useState<string>("");
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
  const from = useMemo(
    () => (range.days == null ? undefined : new Date(Date.now() - range.days * DAY_MS)),
    [range.days]
  );

  const filters = useMemo(
    () => ({
      from,
      ownerId: ownerId || undefined,
      trendWeeks: range.weeks
    }),
    [from, ownerId, range.weeks]
  );

  const overview = trpc.dashboard.overview.useQuery(filters, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true
  });
  const activity = trpc.timeline.feed.useQuery(
    { limit: 8 },
    { refetchInterval: REFRESH_MS, refetchOnWindowFocus: true }
  );
  const drill = trpc.dashboard.applicationsByStage.useQuery(
    {
      stage: (activeStage ?? "screening") as "screening",
      from,
      ownerId: ownerId || undefined,
      limit: 20
    },
    { enabled: activeStage != null }
  );

  const data = overview.data;
  const filtersActive = rangeKey !== "all" || ownerId !== "";
  const ownerName = members.data?.find((m) => m.userId === ownerId)?.name;

  const exportCsv = () => {
    if (!data) return;
    const k = data.kpis;
    const rows: { metric: string; value: number | string }[] = [
      { metric: "Active Jobs", value: k.activeJobs },
      { metric: "Candidates", value: k.totalCandidates },
      { metric: "Applications", value: k.totalApplications },
      { metric: "Submissions", value: k.submissions },
      { metric: "Interviews", value: k.interviews },
      { metric: "Offers", value: k.offers },
      { metric: "Hires", value: k.hires },
      { metric: "Rejections", value: k.rejected },
      { metric: "Time to Hire (days)", value: k.timeToHireDays ?? "" },
      { metric: "Time to Fill (days)", value: k.timeToFillDays ?? "" },
      ...data.funnel.map((f) => ({ metric: `Funnel · ${f.label}`, value: f.count }))
    ];
    const cols: CsvColumn<(typeof rows)[number]>[] = [
      { label: "Metric", value: (r) => r.metric },
      { label: "Value", value: (r) => r.value }
    ];
    downloadCsv("dashboard.csv", toCsv(rows, cols));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Live overview of your recruitment desk
            {me.data?.workspace?.name ? ` (${me.data.workspace.name})` : ""}.
          </p>
        </div>
        {/* Filter + actions toolbar, inlined into the header to avoid a wide empty bar */}
        <div className="flex flex-col items-end gap-2">
          <RefreshBadge
            isFetching={overview.isFetching}
            updatedAt={overview.dataUpdatedAt}
            error={!!overview.error}
          />
          <div className="flex flex-wrap items-end justify-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Date range
              <select
                value={rangeKey}
                onChange={(e) => setRangeKey(e.target.value)}
                className={selectClass}
              >
                {RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Recruiter
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectClass}
              >
                <option value="">Everyone</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setRangeKey("all");
                  setOwnerId("");
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--background)]"
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {overview.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          Could not load the dashboard: {overview.error.message}
        </div>
      ) : null}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BigNumber
          label="Active Jobs"
          value={data?.kpis.activeJobs}
          href="/jobs"
          sublabel={data ? `${data.kpis.totalJobs} total` : undefined}
          loading={overview.isLoading}
        />
        <BigNumber
          label="Candidates"
          value={data?.kpis.totalCandidates}
          href="/candidates"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Applications"
          value={data?.kpis.totalApplications}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Submissions"
          value={data?.kpis.submissions}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Interviews"
          value={data?.kpis.interviews}
          href="/interviews"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Offers"
          value={data?.kpis.offers}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Hires"
          value={data?.kpis.hires}
          href="/reports"
          tone="positive"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Rejections"
          value={data?.kpis.rejected}
          href="/pipeline"
          tone="negative"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Time to Hire"
          value={data?.kpis.timeToHireDays}
          unit="d"
          emptyHint="No hires yet"
          loading={overview.isLoading}
        />
        <BigNumber
          label="Time to Fill"
          value={data?.kpis.timeToFillDays}
          unit="d"
          emptyHint="No fills yet"
          loading={overview.isLoading}
        />
      </div>

      {/* Funnel + trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recruitment Funnel"
          subtitle="Applications that ever reached each stage · click a stage to drill in"
          action={<PanelLink href="/pipeline">Open board</PanelLink>}
        >
          {data && data.kpis.totalApplications === 0 ? (
            <Empty>
              No applications in the pipeline yet. Associate a candidate with a job to start.
            </Empty>
          ) : (
            <FunnelChart
              data={data?.funnel}
              activeStage={activeStage}
              onSelect={(s) => setActiveStage((cur) => (cur === s ? null : s))}
              loading={overview.isLoading}
            />
          )}
          {activeStage ? (
            <StageDrill
              label={data?.funnel.find((f) => f.stage === activeStage)?.label ?? activeStage}
              rows={drill.data}
              loading={drill.isLoading}
              onClose={() => setActiveStage(null)}
            />
          ) : null}
        </Panel>
        <Panel
          title="Trends"
          subtitle="New records per week"
          action={ownerName ? <FilterTag>{ownerName}</FilterTag> : undefined}
        >
          <MultiTrendChart data={data?.trends} series={TREND_SERIES} loading={overview.isLoading} />
        </Panel>
      </div>

      {/* Zoho-style pipeline matrix (job x stage) */}
      <PipelineView />

      {/* Recruiter performance + upcoming interviews */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recruiter Performance" subtitle="By application owner · click to filter">
          <Recruiters
            rows={data?.recruiterPerformance}
            loading={overview.isLoading}
            activeOwner={ownerId}
            onSelect={(id) => setOwnerId((cur) => (cur === id ? "" : id))}
          />
        </Panel>
        <Panel
          title="Upcoming Interviews"
          subtitle="Next 14 days"
          action={<PanelLink href="/interviews">View all</PanelLink>}
        >
          <UpcomingInterviews rows={data?.upcomingInterviews} loading={overview.isLoading} />
        </Panel>
      </div>

      {/* Recents */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recent Candidates"
          action={<PanelLink href="/candidates">View all</PanelLink>}
        >
          <RecentCandidates rows={data?.recentCandidates} loading={overview.isLoading} />
        </Panel>
        <Panel title="Recent Job Openings" action={<PanelLink href="/jobs">View all</PanelLink>}>
          <RecentJobs rows={data?.recentJobs} loading={overview.isLoading} />
        </Panel>
      </div>

      {/* Tasks + activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tasks & Follow-ups" action={<PanelLink href="/tasks">View all</PanelLink>}>
          <OpenTasks rows={data?.openTasks} loading={overview.isLoading} />
        </Panel>
        <Panel title="Recent Activity" action={<PanelLink href="/activity">View all</PanelLink>}>
          <Activity events={activity.data} loading={activity.isLoading} />
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* --------------------------------------------------------------------------- */

const selectClass =
  "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)]";

function Panel({
  title,
  subtitle,
  action,
  children
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
          {subtitle ? <p className="text-xs text-[var(--muted)]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-[var(--accent)] hover:underline">
      {children}
    </Link>
  );
}

function FilterTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--brand-secondary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--brand-secondary)]">
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;
}

function RefreshBadge({
  isFetching,
  updatedAt,
  error
}: {
  isFetching: boolean;
  updatedAt: number;
  error: boolean;
}) {
  const label = error
    ? "Update failed"
    : isFetching
      ? "Updating..."
      : updatedAt
        ? `Updated ${relativeTime(new Date(updatedAt))}`
        : "";
  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          error ? "bg-red-500" : "bg-[var(--brand-secondary)]"
        } ${isFetching ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}

type DrillRow = RouterOutputs["dashboard"]["applicationsByStage"][number];

function StageDrill({
  label,
  rows,
  loading,
  onClose
}: {
  label: string;
  rows?: DrillRow[];
  loading?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--foreground)]">In {label}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Close drill-down"
        >
          Close
        </button>
      </div>
      {loading ? (
        <RowsSkeleton />
      ) : !rows || rows.length === 0 ? (
        <Empty>No applications in this stage for the current filters.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/applications/${r.id}`}
                className="flex items-center justify-between gap-3 py-1.5 hover:bg-[var(--card)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--foreground)]">
                    {[r.candidateFirstName, r.candidateLastName].filter(Boolean).join(" ") ||
                      r.candidateHumanId}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">{r.jobTitle}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {r.ownerName ?? "Unassigned"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Recruiters({
  rows,
  loading,
  activeOwner,
  onSelect
}: {
  rows?: Overview["recruiterPerformance"];
  loading?: boolean;
  activeOwner: string;
  onSelect: (userId: string) => void;
}) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0) return <Empty>No owned applications yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted)]">
            <th className="pb-2 font-medium">Recruiter</th>
            <th className="pb-2 text-right font-medium">Total</th>
            <th className="pb-2 text-right font-medium">Submitted</th>
            <th className="pb-2 text-right font-medium">Interview</th>
            <th className="pb-2 text-right font-medium">Offered</th>
            <th className="pb-2 text-right font-medium">Hired</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((r) => {
            const active = activeOwner === r.userId;
            return (
              <tr
                key={r.userId}
                onClick={() => onSelect(r.userId)}
                className={`cursor-pointer ${
                  active ? "bg-[var(--brand-primary-soft)]" : "hover:bg-[var(--background)]"
                }`}
              >
                <td className="py-2 font-medium text-[var(--foreground)]">{r.name}</td>
                <td className="py-2 text-right tabular-nums">{r.total}</td>
                <td className="py-2 text-right tabular-nums text-[var(--muted)]">{r.submitted}</td>
                <td className="py-2 text-right tabular-nums text-[var(--muted)]">{r.interview}</td>
                <td className="py-2 text-right tabular-nums text-[var(--muted)]">{r.offered}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-green-600">
                  {r.hired}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingInterviews({
  rows,
  loading
}: {
  rows?: Overview["upcomingInterviews"];
  loading?: boolean;
}) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0)
    return <Empty>No interviews scheduled in the next 14 days.</Empty>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((iv) => (
        <li key={iv.id}>
          <Link
            href={`/applications/${iv.applicationId}`}
            className="flex items-center justify-between gap-3 py-2 hover:bg-[var(--background)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                {[iv.candidateFirstName, iv.candidateLastName].filter(Boolean).join(" ") ||
                  iv.humanId}
              </span>
              <span className="block truncate text-xs text-[var(--muted)]">
                {iv.jobTitle} · {iv.type}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs text-[var(--muted)]">
              {dateTime(iv.scheduledAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OpenTasks({ rows, loading }: { rows?: Overview["openTasks"]; loading?: boolean }) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0) return <Empty>No open tasks. You are all caught up.</Empty>;
  const now = Date.now();
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((t) => {
        const overdue = t.dueAt ? new Date(t.dueAt).getTime() < now : false;
        return (
          <li key={t.id}>
            <Link
              href="/tasks"
              className="flex items-center justify-between gap-3 py-2 hover:bg-[var(--background)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                  {t.subject}
                </span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {t.assigneeName ?? "Unassigned"}
                </span>
              </span>
              <span
                className={`shrink-0 text-right text-xs ${
                  overdue ? "font-medium text-red-600" : "text-[var(--muted)]"
                }`}
              >
                {t.dueAt
                  ? (overdue ? "Overdue · " : "") + shortDate(new Date(t.dueAt))
                  : "No due date"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RecentCandidates({
  rows,
  loading
}: {
  rows?: Overview["recentCandidates"];
  loading?: boolean;
}) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0) return <Empty>No candidates yet.</Empty>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((c) => (
        <li key={c.id}>
          <Link
            href={`/candidates/${c.id}`}
            className="flex items-center justify-between gap-3 py-2 hover:bg-[var(--background)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.humanId}
              </span>
              <span className="block truncate text-xs text-[var(--muted)]">
                {c.title ?? c.humanId}
              </span>
            </span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {relativeTime(c.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentJobs({ rows, loading }: { rows?: Overview["recentJobs"]; loading?: boolean }) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0) return <Empty>No job openings yet.</Empty>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((j) => (
        <li key={j.id}>
          <Link
            href={`/jobs/${j.id}`}
            className="flex items-center justify-between gap-3 py-2 hover:bg-[var(--background)]"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                {j.title}
              </span>
              <span className="block truncate text-xs text-[var(--muted)]">
                {j.companyName ?? j.humanId}
              </span>
            </span>
            <JobStatusBadge status={j.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-[var(--brand-secondary-soft)] text-[var(--brand-secondary)]",
    on_hold: "bg-amber-500/10 text-amber-600",
    filled: "bg-green-500/10 text-green-600",
    cancelled: "bg-red-500/10 text-red-600",
    inactive: "bg-[var(--muted)]/10 text-[var(--muted)]"
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        map[status] ?? "bg-[var(--muted)]/10 text-[var(--muted)]"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

type ActivityEvent = RouterOutputs["timeline"]["feed"][number];

function Activity({ events, loading }: { events?: ActivityEvent[]; loading?: boolean }) {
  if (loading) return <RowsSkeleton />;
  if (!events || events.length === 0) return <Empty>No recent activity.</Empty>;
  return (
    <ul className="space-y-3">
      {events.map((e) => {
        const href = recordHref(e.entityType, e.entityId);
        const text = (
          <>
            <span className="font-medium text-[var(--foreground)]">{e.actorName ?? "Someone"}</span>{" "}
            <span className="text-[var(--muted)]">{activityVerb(e)}</span>
          </>
        );
        return (
          <li key={`${e.kind}-${e.id}`} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-secondary)]" />
            <span className="min-w-0 flex-1">
              {href ? (
                <Link href={href} className="hover:underline">
                  {text}
                </Link>
              ) : (
                text
              )}
              <span className="block text-xs text-[var(--muted)]">{relativeTime(e.createdAt)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function activityVerb(e: ActivityEvent): string {
  if (e.kind === "note") return "added a note";
  if (e.action) return e.action.replace(/\./g, " ").replace(/_/g, " ");
  return "made an update";
}

function recordHref(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, string> = {
    candidate: "/candidates",
    job: "/jobs",
    company: "/companies",
    contact: "/contacts",
    application: "/applications"
  };
  const base = map[entityType];
  return base ? `${base}/${entityId}` : null;
}

function RowsSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-[var(--border)]" />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Date helpers                                                                */
/* --------------------------------------------------------------------------- */

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return shortDate(date);
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function dateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
