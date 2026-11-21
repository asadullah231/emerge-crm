"use client";

/*
 * Cards that bring the Reports section onto the dashboard (Asad, 21 Nov 2026):
 * monthly pacing, rejection reasons, daily activity and the account-manager
 * scoreboard. They reuse the existing report queries, so the numbers match
 * the report pages exactly.
 */

import Link from "next/link";
import { useMemo } from "react";
import { CHART } from "@/components/report-charts";
import { weekStart } from "@/components/reports-shared";
import { trpc } from "@/lib/trpc/client";
import { clientRange, type CardInstance, type DatePreset } from "./card-registry";
import { CardEmpty, GroupedColumns, RankChart } from "./mini-charts";

const REFRESH = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;

/** Card date window: its configured preset, else the card's natural default. */
function useWindow(card: CardInstance, fallback: DatePreset) {
  const preset = card.filter?.datePreset ?? fallback;
  return useMemo(() => {
    const r = clientRange(preset);
    return { from: r.from ?? new Date(2000, 0, 1), to: r.to ?? new Date(), preset };
  }, [preset]);
}

function Loading() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="h-8 animate-pulse rounded bg-[var(--border)]/60" />
      <div className="flex-1 animate-pulse rounded bg-[var(--border)]/40" />
    </div>
  );
}

/* Monthly pacing ------------------------------------------------------------ */

function PaceRow({
  label,
  actual,
  target,
  expected,
  format = (n: number) => String(n)
}: {
  label: string;
  actual: number;
  target: number | null;
  expected: number | null;
  format?: (n: number) => string;
}) {
  const pct = target ? Math.min(1, actual / target) : 0;
  const onPace = target != null && expected != null ? actual >= expected : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--foreground)]">{label}</span>
        <span className="tabular-nums text-[var(--muted)]">
          <span className="text-sm font-semibold text-[var(--foreground)]">{format(actual)}</span>
          {target != null ? ` / ${format(target)}` : ""}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]/60">
        <div
          className="h-2 rounded-full"
          style={{
            width: `${Math.max(target ? 2 : 0, pct * 100)}%`,
            background: onPace === false ? "#ef4444" : CHART.teal
          }}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
        {target == null
          ? "No target set"
          : onPace
            ? "On pace"
            : `Behind, ${format(Math.ceil(expected ?? 0))} expected by today`}
      </p>
    </div>
  );
}

export function MonthlyPacing() {
  const q = trpc.overviewReports.pacing.useQuery(undefined, REFRESH);
  if (q.isLoading) return <Loading />;
  const d = q.data;
  if (!d) return <CardEmpty>Could not load monthly pacing.</CardEmpty>;
  const share = d.month.day / d.month.days;
  const exp = (t: number | null) => (t == null ? null : t * share);
  const rev = d.actual.revenue[0];
  const money = (n: number) =>
    rev
      ? new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: rev.currency,
          maximumFractionDigits: 0
        }).format(n)
      : String(n);
  const noTargets =
    d.targets.placements == null && d.targets.submissions == null && d.targets.revenue == null;
  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
          <span>
            Day {d.month.day} of {d.month.days}
          </span>
          <span>{Math.round(share * 100)}% of the month gone</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--border)]/60">
          <div
            className="h-1.5 rounded-full bg-[var(--brand-primary)]"
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>
      <PaceRow
        label="Hires"
        actual={d.actual.hires}
        target={d.targets.placements}
        expected={exp(d.targets.placements)}
      />
      <PaceRow
        label="Submissions"
        actual={d.actual.submissions}
        target={d.targets.submissions}
        expected={exp(d.targets.submissions)}
      />
      <PaceRow
        label="Revenue"
        actual={rev?.amount ?? 0}
        target={d.targets.revenue}
        expected={exp(d.targets.revenue)}
        format={money}
      />
      {noTargets ? (
        <p className="text-[11px] text-[var(--muted)]">
          Set monthly targets in{" "}
          <Link href="/settings/workspace" className="text-[var(--accent)] hover:underline">
            Settings, Workspace
          </Link>{" "}
          to see if the team is on pace.
        </p>
      ) : null}
    </div>
  );
}

/* Rejection reasons --------------------------------------------------------- */

export function RejectionReasons() {
  const win = useMemo(() => ({ from: weekStart(new Date()), to: new Date() }), []);
  const q = trpc.recruiterReports.overview.useQuery(win, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = (q.data?.teamTopRejectionReasons ?? []).map((r) => ({
    label: r.reason,
    count: r.count
  }));
  if (rows.length === 0)
    return <CardEmpty>No rejections with a reason in the last 4 weeks.</CardEmpty>;
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <div className="flex h-full flex-col gap-1">
      <p className="text-xs text-[var(--muted)]">
        Top reasons, last 4 weeks ·{" "}
        <span className="font-semibold text-[var(--foreground)]">{total}</span> rejections
      </p>
      <div className="min-h-0 flex-1">
        <RankChart rows={rows} color="#ef4444" name="Rejections" />
      </div>
    </div>
  );
}

/* Daily activity ------------------------------------------------------------ */

const ACTIVITY = [
  { key: "added", label: "Candidates added", color: CHART.blue },
  { key: "calls", label: "Calls and meetings", color: CHART.teal },
  { key: "moves", label: "Status changes", color: CHART.amber },
  { key: "tasks", label: "Tasks done", color: CHART.purple }
] as const;

export function DailyActivity({ card }: { card: CardInstance }) {
  const fallbackWeek = useMemo(() => weekStart(new Date()), []);
  const preset = card.filter?.datePreset;
  const range = useMemo(() => {
    if (!preset || preset === "all") return { from: fallbackWeek, to: new Date() };
    const r = clientRange(preset);
    return { from: r.from ?? fallbackWeek, to: r.to ?? new Date() };
  }, [preset, fallbackWeek]);
  const q = trpc.recruiterReports.dailyActivity.useQuery(range, REFRESH);
  const data = useMemo(() => {
    const byDay = new Map<string, { added: number; calls: number; moves: number; tasks: number }>();
    for (const r of q.data ?? []) {
      if (!r.day) continue;
      const cur = byDay.get(r.day) ?? { added: 0, calls: 0, moves: 0, tasks: 0 };
      cur.added += r.candidatesAdded;
      cur.calls += r.calls + r.meetings;
      cur.moves += r.statusChanges;
      cur.tasks += r.tasksDone;
      byDay.set(r.day, cur);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({
        x: new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric"
        }),
        ...v
      }));
  }, [q.data]);
  if (q.isLoading) return <Loading />;
  if (data.length === 0) return <CardEmpty>No activity logged in this period yet.</CardEmpty>;
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
        {ACTIVITY.map((a) => (
          <span key={a.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.color }} />
            {a.label}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <GroupedColumns
          data={data}
          series={ACTIVITY.map((a) => ({ key: a.key, label: a.label, color: a.color }))}
        />
      </div>
    </div>
  );
}

/* Account-manager scoreboard ------------------------------------------------ */

export function AmScoreboard({ card }: { card: CardInstance }) {
  const win = useWindow(card, "this_month");
  const q = trpc.amReports.overview.useQuery({ from: win.from, to: win.to }, REFRESH);
  const rows = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const names = new Map(d.members.map((m) => [m.userId, m.name]));
    type Row = {
      id: string;
      name: string;
      clients: number;
      jobs: number;
      terms: number;
      meetings: number;
      placements: number;
    };
    const map = new Map<string, Row>();
    const row = (id: string | null) => {
      const key = id ?? "none";
      const cur =
        map.get(key) ??
        ({
          id: key,
          name: id ? (names.get(id) ?? "Former member") : "Unassigned",
          clients: 0,
          jobs: 0,
          terms: 0,
          meetings: 0,
          placements: 0
        } satisfies Row);
      map.set(key, cur);
      return cur;
    };
    for (const c of d.newClients) row(c.ownerId).clients++;
    for (const j of d.newJobs) row(j.ownerId).jobs++;
    for (const t of d.termsSigned) row(t.ownerId).terms++;
    for (const m of d.meetingRows) if (m.authorId) row(m.authorId).meetings++;
    for (const p of d.placementRows) row(p.amId).placements++;
    return [...map.values()]
      .filter((r) => r.clients + r.jobs + r.terms + r.meetings + r.placements > 0)
      .sort((a, b) => b.jobs + b.clients - (a.jobs + a.clients));
  }, [q.data]);
  if (q.isLoading) return <Loading />;
  if (rows.length === 0) return <CardEmpty>No account-manager activity in this period.</CardEmpty>;
  const cell = "py-1.5 text-right tabular-nums";
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
          <th className="pb-1.5 font-medium">Account manager</th>
          <th className="pb-1.5 text-right font-medium">Clients</th>
          <th className="pb-1.5 text-right font-medium">Jobs</th>
          <th className="pb-1.5 text-right font-medium">Terms</th>
          <th className="pb-1.5 text-right font-medium">Meetings</th>
          <th className="pb-1.5 text-right font-medium">Placements</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--border)]/50 last:border-0">
            <td className="max-w-0 truncate py-1.5 pr-2 text-[var(--foreground)]">{r.name}</td>
            <td className={cell}>{r.clients}</td>
            <td className={cell}>{r.jobs}</td>
            <td className={cell}>{r.terms}</td>
            <td className={cell}>{r.meetings}</td>
            <td className={`${cell} font-semibold`}>{r.placements}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
