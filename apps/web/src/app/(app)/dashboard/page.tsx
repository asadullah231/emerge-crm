"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { type ApplicationStageKey } from "@/lib/applications";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Overview = RouterOutputs["dashboard"]["overview"];

/** Auto-refresh cadence so the dashboard reflects CRM changes without a reload. */
const REFRESH_MS = 30_000;

export default function DashboardPage() {
  const me = trpc.auth.me.useQuery();
  const overview = trpc.dashboard.overview.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true
  });
  const activity = trpc.timeline.feed.useQuery(
    { limit: 8 },
    { refetchInterval: REFRESH_MS, refetchOnWindowFocus: true }
  );

  const data = overview.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Live overview of your recruitment desk
            {me.data?.workspace?.name ? ` (${me.data.workspace.name})` : ""}.
          </p>
        </div>
        <RefreshBadge
          isFetching={overview.isFetching}
          updatedAt={overview.dataUpdatedAt}
          error={!!overview.error}
        />
      </div>

      {overview.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          Could not load the dashboard: {overview.error.message}
        </div>
      ) : null}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Active Jobs"
          value={data?.kpis.activeJobs}
          href="/jobs"
          loading={overview.isLoading}
        />
        <Kpi
          label="Candidates"
          value={data?.kpis.totalCandidates}
          href="/candidates"
          loading={overview.isLoading}
        />
        <Kpi
          label="Applications"
          value={data?.kpis.totalApplications}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <Kpi
          label="Submitted"
          value={data?.kpis.submitted}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <Kpi
          label="In Interview"
          value={data?.kpis.interview}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <Kpi
          label="Offers"
          value={data?.kpis.offered}
          href="/pipeline"
          loading={overview.isLoading}
        />
        <Kpi
          label="Hires"
          value={data?.kpis.hired}
          href="/pipeline"
          tone="positive"
          loading={overview.isLoading}
        />
        <Kpi
          label="Rejected"
          value={data?.kpis.rejected}
          href="/pipeline"
          tone="negative"
          loading={overview.isLoading}
        />
        <Kpi
          label="Time to Hire"
          value={data?.kpis.timeToHireDays}
          unit="d"
          emptyHint="No hires yet"
          loading={overview.isLoading}
        />
        <Kpi
          label="Time to Fill"
          value={data?.kpis.timeToFillDays}
          unit="d"
          emptyHint="No fills yet"
          loading={overview.isLoading}
        />
      </div>

      {/* Pipeline */}
      <Panel
        title="Recruitment Pipeline"
        action={<PanelLink href="/pipeline">Open board</PanelLink>}
      >
        {data && data.kpis.totalApplications === 0 ? (
          <Empty>
            No applications in the pipeline yet. Associate a candidate with a job to start.
          </Empty>
        ) : (
          <PipelineBars pipeline={data?.pipeline} loading={overview.isLoading} />
        )}
      </Panel>

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

      {/* Trends + recruiter performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Candidate & Application Trends" subtitle="New records per week">
          <Trends trends={data?.trends} loading={overview.isLoading} />
        </Panel>
        <Panel title="Recruiter Performance" subtitle="By application owner">
          <Recruiters rows={data?.recruiterPerformance} loading={overview.isLoading} />
        </Panel>
      </div>

      {/* Activity + upcoming (future modules) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Recent Activity">
          <Activity events={activity.data} loading={activity.isLoading} />
        </Panel>
        <Panel title="Upcoming Interviews">
          <Empty>Interview scheduling arrives in a later milestone. Nothing to show yet.</Empty>
        </Panel>
        <Panel title="Tasks & Follow-ups">
          <Empty>Tasks and follow-ups arrive in a later milestone. Nothing to show yet.</Empty>
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* --------------------------------------------------------------------------- */

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

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--muted)]">{children}</p>;
}

function Kpi({
  label,
  value,
  href,
  unit,
  tone = "default",
  emptyHint,
  loading
}: {
  label: string;
  value: number | null | undefined;
  href?: string;
  unit?: string;
  tone?: "default" | "positive" | "negative";
  emptyHint?: string;
  loading?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-green-600"
      : tone === "negative"
        ? "text-red-600"
        : "text-[var(--brand-primary)]";

  const body = (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary-soft)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="mt-2">
        {loading ? (
          <span className="inline-block h-7 w-12 animate-pulse rounded bg-[var(--border)]" />
        ) : value == null ? (
          <span className="text-sm text-[var(--muted)]">{emptyHint ?? "-"}</span>
        ) : (
          <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
            {value.toLocaleString()}
            {unit ? (
              <span className="ml-0.5 text-base font-medium text-[var(--muted)]">{unit}</span>
            ) : null}
          </span>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} aria-label={label} className="block">
      {body}
    </Link>
  ) : (
    body
  );
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

function PipelineBars({
  pipeline,
  loading
}: {
  pipeline?: Overview["pipeline"];
  loading?: boolean;
}) {
  if (loading || !pipeline) {
    return <div className="h-40 animate-pulse rounded-lg bg-[var(--border)]" />;
  }
  const max = Math.max(1, ...pipeline.map((p) => p.count));
  return (
    <div className="space-y-2">
      {pipeline.map((p) => (
        <Link
          key={p.stage}
          href="/pipeline"
          className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-[var(--background)]"
        >
          <span className="w-24 shrink-0 text-sm text-[var(--foreground)]">{p.label}</span>
          <span className="relative h-6 flex-1 overflow-hidden rounded bg-[var(--background)]">
            <span
              className={`absolute inset-y-0 left-0 rounded ${stageBar(p.stage)}`}
              style={{ width: `${Math.max(p.count === 0 ? 0 : 4, (p.count / max) * 100)}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {p.count.toLocaleString()}
          </span>
        </Link>
      ))}
    </div>
  );
}

function stageBar(stage: ApplicationStageKey): string {
  switch (stage) {
    case "hired":
      return "bg-green-500/70";
    case "rejected":
      return "bg-red-500/60";
    case "archived":
      return "bg-[var(--muted)]/40";
    case "interview":
    case "offered":
      return "bg-[var(--brand-primary)]/70";
    default:
      return "bg-[var(--brand-secondary)]/70";
  }
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

function Trends({ trends, loading }: { trends?: Overview["trends"]; loading?: boolean }) {
  const hasData = useMemo(
    () => (trends ?? []).some((t) => t.candidates > 0 || t.applications > 0),
    [trends]
  );
  if (loading || !trends)
    return <div className="h-40 animate-pulse rounded-lg bg-[var(--border)]" />;
  if (!hasData) return <Empty>Not enough data yet. Trends appear as records are added.</Empty>;

  const max = Math.max(1, ...trends.map((t) => Math.max(t.candidates, t.applications)));
  const W = 640;
  const H = 160;
  const pad = 8;
  const n = trends.length;
  const groupW = (W - pad * 2) / n;
  const barW = Math.max(3, groupW / 2 - 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
        <Legend color="var(--brand-secondary)" label="Candidates" />
        <Legend color="var(--brand-primary)" label="Applications" />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Weekly candidate and application trends"
      >
        {trends.map((t, i) => {
          const x = pad + i * groupW;
          const ch = (t.candidates / max) * (H - 24);
          const ah = (t.applications / max) * (H - 24);
          return (
            <g key={t.weekStart.toISOString()}>
              <rect
                x={x}
                y={H - 16 - ch}
                width={barW}
                height={ch}
                rx={2}
                fill="var(--brand-secondary)"
              />
              <rect
                x={x + barW + 3}
                y={H - 16 - ah}
                width={barW}
                height={ah}
                rx={2}
                fill="var(--brand-primary)"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--muted)]">
        <span>{shortDate(trends[0]!.weekStart)}</span>
        <span>{shortDate(trends[trends.length - 1]!.weekStart)}</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Recruiters({
  rows,
  loading
}: {
  rows?: Overview["recruiterPerformance"];
  loading?: boolean;
}) {
  if (loading) return <RowsSkeleton />;
  if (!rows || rows.length === 0) return <Empty>No owned applications yet.</Empty>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--muted)]">
          <th className="pb-2 font-medium">Recruiter</th>
          <th className="pb-2 text-right font-medium">Total</th>
          <th className="pb-2 text-right font-medium">Submitted</th>
          <th className="pb-2 text-right font-medium">Interview</th>
          <th className="pb-2 text-right font-medium">Hired</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">
        {rows.map((r) => (
          <tr key={r.userId}>
            <td className="py-2 font-medium text-[var(--foreground)]">{r.name}</td>
            <td className="py-2 text-right tabular-nums">{r.total}</td>
            <td className="py-2 text-right tabular-nums text-[var(--muted)]">{r.submitted}</td>
            <td className="py-2 text-right tabular-nums text-[var(--muted)]">{r.interview}</td>
            <td className="py-2 text-right font-semibold tabular-nums text-green-600">{r.hired}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
