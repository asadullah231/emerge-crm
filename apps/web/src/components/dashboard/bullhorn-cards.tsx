"use client";

/*
 * Bodies of the Bullhorn-style dashboard cards (Training 1.2). Each reads its
 * own per-card filter and live data from the dashboardCards router.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHART } from "@/components/report-charts";
import { trpc } from "@/lib/trpc/client";
import { viewOf, type CardInstance, type CardType } from "./card-registry";
import {
  BarList,
  bucketLabel,
  CardEmpty,
  CountTable,
  Donut,
  foldSlices,
  fmtPct,
  GranularitySwitch,
  LineChart,
  PieChart
} from "./mini-charts";

const REFRESH = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CardBodyProps = {
  card: CardInstance;
  onPatch: (patch: Partial<CardInstance>) => void;
};

export const BULLHORN_TYPES: CardType[] = [
  "success-rates",
  "response-times",
  "jobs-without-coverage",
  "starts",
  "jobs-by-skill",
  "jobs-by-age",
  "jobs-by-industry",
  "jobs-over-time",
  "placements-over-time",
  "companies-by-status",
  "companies-by-open-jobs",
  "companies-by-placements",
  "companies-over-time",
  "contacts-by-owner",
  "contacts-over-time",
  "candidates-by-owner",
  "candidates-by-source",
  "candidates-over-time"
];

export function BullhornCardBody({ card, onPatch }: CardBodyProps) {
  switch (card.type) {
    case "success-rates":
      return <SuccessRates card={card} onPatch={onPatch} />;
    case "response-times":
      return <ResponseTimes card={card} onPatch={onPatch} />;
    case "jobs-without-coverage":
      return <JobsWithoutCoverage card={card} />;
    case "starts":
      return <Starts card={card} />;
    case "jobs-by-skill":
      return <JobsBySkill card={card} />;
    case "jobs-by-age":
      return <JobsByAge card={card} />;
    case "jobs-by-industry":
      return <JobsByIndustry card={card} />;
    case "jobs-over-time":
      return <OverTime card={card} onPatch={onPatch} entity="jobs" />;
    case "placements-over-time":
      return <OverTime card={card} onPatch={onPatch} entity="placements" />;
    case "companies-by-status":
      return <CompaniesByStatus card={card} />;
    case "companies-by-open-jobs":
      return <CompaniesRanked card={card} by="open-jobs" />;
    case "companies-by-placements":
      return <CompaniesRanked card={card} by="placements" />;
    case "companies-over-time":
      return <OverTime card={card} onPatch={onPatch} entity="companies" />;
    case "contacts-by-owner":
      return <ByOwner card={card} entity="contacts" />;
    case "contacts-over-time":
      return <OverTime card={card} onPatch={onPatch} entity="contacts" />;
    case "candidates-by-owner":
      return <ByOwner card={card} entity="candidates" />;
    case "candidates-by-source":
      return <CandidatesBySource card={card} />;
    case "candidates-over-time":
      return <OverTime card={card} onPatch={onPatch} entity="candidates" />;
    default:
      return null;
  }
}

function Loading() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-[var(--border)]/60" />
      ))}
    </div>
  );
}

/* Success Rates ------------------------------------------------------------- */

function SuccessRates({ card, onPatch }: CardBodyProps) {
  const g = card.filter?.granularity ?? "month";
  const q = trpc.dashboardCards.successRates.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const d = q.data;
  if (!d) return <CardEmpty>Could not load success rates.</CardEmpty>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-md bg-[var(--background)] py-2">
        <Donut
          value={d.fillRatio}
          color={CHART.teal}
          label="Fill ratio"
          sub={`${d.filled} of ${d.closed} closed jobs`}
        />
        <Donut
          value={d.hitRatio}
          color={CHART.blue}
          label="Hit ratio"
          sub={`${d.placed} hires / ${d.submitted} subs`}
        />
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Historic fill ratio
        </p>
        <LineChart
          area
          height={110}
          series={[
            {
              label: "Fill ratio",
              color: CHART.teal,
              values: d.history.map((h) => (h.closed ? h.ratio * 100 : null))
            }
          ]}
          xLabels={d.history.map((h) => bucketLabel(h.start, g))}
          format={(v) => `${Math.round(v)}%`}
        />
        <GranularitySwitch
          value={g}
          onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
        />
      </div>
    </div>
  );
}

/* Response Times ------------------------------------------------------------ */

function ResponseTimes({ card, onPatch }: CardBodyProps) {
  const g = card.filter?.granularity ?? "month";
  const q = trpc.dashboardCards.responseTimes.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const d = q.data;
  if (!d) return <CardEmpty>Could not load response times.</CardEmpty>;
  const metrics = [
    {
      label: "Time to first candidate",
      value: d.toActivity,
      color: CHART.amber,
      key: "toActivity" as const
    },
    {
      label: "Time to send CVs",
      value: d.toSubmission,
      color: CHART.blue,
      key: "toSubmission" as const
    },
    { label: "Time to fill", value: d.toFill, color: CHART.purple, key: "toFill" as const }
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 rounded-md bg-[var(--background)] p-2">
        {metrics.map((m) => (
          <div key={m.label}>
            <p className="flex items-start gap-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--muted)]">
              <span
                className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ background: m.color }}
              />
              {m.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {m.value == null ? "-" : `${m.value} days`}
            </p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Historic
        </p>
        <LineChart
          height={110}
          series={metrics.map((m) => ({
            label: m.label,
            color: m.color,
            values: d.history.map((h) => h[m.key])
          }))}
          xLabels={d.history.map((h) => bucketLabel(h.start, g))}
          format={(v) => `${v}d`}
        />
        <GranularitySwitch
          value={g}
          onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
        />
      </div>
    </div>
  );
}

/* Jobs without Coverage ----------------------------------------------------- */

function JobsWithoutCoverage({ card }: { card: CardInstance }) {
  const utils = trpc.useUtils();
  const q = trpc.dashboardCards.jobsWithoutCoverage.useQuery({ filter: card.filter }, REFRESH);
  const members = trpc.members.list.useQuery();
  const [err, setErr] = useState<string | null>(null);
  const done = async () => {
    setErr(null);
    await utils.dashboardCards.invalidate();
  };
  const assign = trpc.jobs.bulkReassignOwner.useMutation({
    onSuccess: done,
    onError: (e) => setErr(e.message)
  });
  const close = trpc.jobs.changeStatus.useMutation({
    onSuccess: done,
    onError: (e) => setErr(e.message)
  });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <CardEmpty>Every open job has at least one candidate.</CardEmpty>;
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--muted)]">
        <span className="font-semibold text-[var(--foreground)]">{rows.length}</span> open{" "}
        {rows.length === 1 ? "job has" : "jobs have"} no candidates yet. Assign or close them.
      </p>
      {err ? <p className="mb-2 text-xs text-red-600">{err}</p> : null}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((j) => {
          const age = Math.floor((Date.now() - new Date(j.openedAt).getTime()) / DAY_MS);
          return (
            <li key={j.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/jobs/${j.id}`} className="min-w-0 hover:underline">
                  <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                    {j.title}
                  </span>
                  <span className="block truncate text-xs text-[var(--muted)]">
                    {j.companyName ?? j.humanId} · {j.ownerName ?? "Unassigned"}
                  </span>
                </Link>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{age}d</span>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <select
                  aria-label={`Assign ${j.title}`}
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-xs"
                  value=""
                  disabled={assign.isPending}
                  onChange={(e) =>
                    e.target.value && assign.mutate({ ids: [j.id], ownerId: e.target.value })
                  }
                >
                  <option value="">Assign to...</option>
                  {(members.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Close ${j.title}`}
                  className="rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-xs"
                  value=""
                  disabled={close.isPending}
                  onChange={(e) => {
                    const s = e.target.value as "on_hold" | "cancelled" | "inactive" | "";
                    if (s && window.confirm(`Change "${j.title}" to ${s.replace("_", " ")}?`)) {
                      close.mutate({ id: j.id, status: s });
                    }
                  }}
                >
                  <option value="">Close...</option>
                  <option value="on_hold">On hold</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Starts (calendar) --------------------------------------------------------- */

function Starts({ card }: { card: CardInstance }) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const q = trpc.dashboardCards.starts.useQuery({ filter: card.filter, ...ym }, REFRESH);
  const byDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of q.data ?? []) {
      if (!r.startDate) continue;
      const d = Number(String(r.startDate).slice(8, 10));
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [q.data]);
  const first = new Date(ym.year, ym.month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(ym.year, ym.month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  const isToday = (d: number) =>
    d === now.getDate() && ym.month === now.getMonth() && ym.year === now.getFullYear();
  const shift = (delta: number) =>
    setYm((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded p-1 hover:bg-[var(--background)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-28 text-center text-sm font-medium">
            {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded p-1 hover:bg-[var(--background)]"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() })}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          Today
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--muted)]">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <span key={`e${i}`} />
          ) : (
            <span
              key={d}
              className={`flex h-7 flex-col items-center justify-center rounded border text-[11px] ${
                isToday(d) ? "border-[var(--brand-secondary)]" : "border-[var(--border)]"
              } ${byDay.get(d) ? "bg-[var(--brand-secondary-soft)] font-semibold text-[var(--brand-secondary)]" : "text-[var(--foreground)]"}`}
              title={byDay.get(d) ? `${byDay.get(d)} start(s)` : undefined}
            >
              {d}
            </span>
          )
        )}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Placements starting ({q.data?.length ?? 0})
        </p>
        {q.isLoading ? (
          <Loading />
        ) : (q.data ?? []).length === 0 ? (
          <CardEmpty>
            No placement start dates this month. Start dates come from placement records.
          </CardEmpty>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {(q.data ?? []).map((r) => (
              <li key={r.id}>
                <Link
                  href={
                    r.applicationId
                      ? `/applications/${r.applicationId}`
                      : `/candidates/${r.candidateId}`
                  }
                  className="flex items-center justify-between gap-2 py-1.5 hover:bg-[var(--background)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                      {[r.firstName, r.lastName].filter(Boolean).join(" ") || "Candidate"}
                    </span>
                    <span className="block truncate text-xs text-[var(--muted)]">
                      {r.jobTitle}
                      {r.companyName ? ` · ${r.companyName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {r.startDate
                      ? new Date(`${r.startDate}T00:00:00`).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short"
                        })
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* Jobs by Required Skills --------------------------------------------------- */

function JobsBySkill({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.jobsBySkill.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0)
    return (
      <CardEmpty>
        No jobs have required skills filled in yet. Add skills on the job page to use this card.
      </CardEmpty>
    );
  if (viewOf(card) === "list") {
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th className="pb-1.5 font-medium">Required skill</th>
            <th className="pb-1.5 text-right font-medium">Jobs</th>
            <th className="pb-1.5 text-right font-medium">Open</th>
            <th className="pb-1.5 text-right font-medium">Roles</th>
            <th className="pb-1.5 text-right font-medium">Fill rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1 pr-2 text-[var(--foreground)]">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{r.jobs}</td>
              <td className="py-1 text-right tabular-nums">{r.open}</td>
              <td className="py-1 text-right tabular-nums">{r.roles}</td>
              <td className="py-1 text-right tabular-nums">{fmtPct(r.fillRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <PieChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.jobs })))} />;
}

/* Simple grouped cards ------------------------------------------------------ */

function JobsByAge({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.jobsByAge.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.every((r) => r.count === 0)) return <CardEmpty>No open jobs.</CardEmpty>;
  return <BarList rows={rows} color={CHART.blue} unit="jobs" />;
}

function JobsByIndustry({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.jobsByIndustry.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <CardEmpty>No open jobs.</CardEmpty>;
  return viewOf(card) === "list" ? (
    <CountTable rows={rows} head={["Business sector", "Open jobs"]} />
  ) : (
    <PieChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
  );
}

function CompaniesByStatus({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.companiesByStatus.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []).map((r) => ({
    label: r.label[0]!.toUpperCase() + r.label.slice(1),
    count: r.count,
    href: "/companies"
  }));
  if (rows.length === 0) return <CardEmpty>No companies yet.</CardEmpty>;
  return viewOf(card) === "chart" ? (
    <PieChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
  ) : (
    <CountTable rows={rows} head={["Status", "Number"]} />
  );
}

function CompaniesRanked({ card, by }: { card: CardInstance; by: "open-jobs" | "placements" }) {
  const open = trpc.dashboardCards.companiesByOpenJobs.useQuery(
    { filter: card.filter },
    { ...REFRESH, enabled: by === "open-jobs" }
  );
  const placed = trpc.dashboardCards.companiesByPlacements.useQuery(
    { filter: card.filter },
    { ...REFRESH, enabled: by === "placements" }
  );
  const q = by === "open-jobs" ? open : placed;
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []).map((r) => ({
    label: r.label,
    count: r.count,
    href: `/companies/${r.id}`
  }));
  if (rows.length === 0)
    return (
      <CardEmpty>{by === "open-jobs" ? "No open jobs." : "No hires in this period."}</CardEmpty>
    );
  return (
    <CountTable rows={rows} head={["Company", by === "open-jobs" ? "Open jobs" : "Placements"]} />
  );
}

function ByOwner({ card, entity }: { card: CardInstance; entity: "contacts" | "candidates" }) {
  const q = trpc.dashboardCards.byOwner.useQuery({ filter: card.filter, entity }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <CardEmpty>No records yet.</CardEmpty>;
  return viewOf(card) === "chart" ? (
    <BarList rows={rows} color={CHART.teal} />
  ) : (
    <CountTable rows={rows} head={["Consultant", "Number"]} />
  );
}

function CandidatesBySource({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.candidatesBySource.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []).map((r) => ({
    label: r.label[0]!.toUpperCase() + r.label.slice(1),
    count: r.count
  }));
  if (rows.length === 0) return <CardEmpty>No candidates yet.</CardEmpty>;
  return viewOf(card) === "list" ? (
    <CountTable rows={rows} head={["Source", "Candidates"]} />
  ) : (
    <PieChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
  );
}

/* X over Time --------------------------------------------------------------- */

const NEWEST: Partial<Record<string, "companies" | "contacts" | "candidates">> = {
  companies: "companies",
  contacts: "contacts",
  candidates: "candidates"
};

function OverTime({
  card,
  onPatch,
  entity
}: CardBodyProps & { entity: "companies" | "contacts" | "candidates" | "jobs" | "placements" }) {
  const g = card.filter?.granularity ?? "month";
  const newestEntity = NEWEST[entity];
  const listMode = viewOf(card) === "list" && newestEntity != null;
  const series = trpc.dashboardCards.overTime.useQuery(
    { filter: card.filter, entity },
    { ...REFRESH, enabled: !listMode }
  );
  const newest = trpc.dashboardCards.newest.useQuery(
    { filter: card.filter, entity: newestEntity ?? "companies" },
    { ...REFRESH, enabled: listMode }
  );
  if (listMode) {
    if (newest.isLoading) return <Loading />;
    const rows = newest.data ?? [];
    if (rows.length === 0) return <CardEmpty>No records yet.</CardEmpty>;
    const base =
      entity === "companies" ? "/companies" : entity === "contacts" ? "/contacts" : "/candidates";
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th className="pb-1.5 font-medium">Name</th>
            <th className="pb-1.5 font-medium">{entity === "companies" ? "Status" : "Title"}</th>
            <th className="pb-1.5 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="max-w-0 truncate py-1 pr-2">
                <Link href={`${base}/${r.id}`} className="text-[var(--accent)] hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="max-w-0 truncate py-1 pr-2 text-[var(--muted)]">{r.sub ?? ""}</td>
              <td className="py-1 text-right tabular-nums text-[var(--muted)]">
                {Math.max(0, Math.floor((Date.now() - new Date(r.createdAt).getTime()) / DAY_MS))}{" "}
                days
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (series.isLoading) return <Loading />;
  const pts = series.data?.points ?? [];
  const total = pts.reduce((a, p) => a + p.count, 0);
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--muted)]">
        <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">{total}</span>{" "}
        in the last {pts.length} {g}s
      </p>
      <LineChart
        height={120}
        series={[{ label: "New", color: CHART.blue, values: pts.map((p) => p.count) }]}
        xLabels={pts.map((p) => bucketLabel(p.start, g))}
      />
      <GranularitySwitch
        value={g}
        onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
      />
    </div>
  );
}
