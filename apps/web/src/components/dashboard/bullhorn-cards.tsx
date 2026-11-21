"use client";

/*
 * Bodies of the Bullhorn-style dashboard cards (Training 1.2). Each reads its
 * own per-card filter and live data from the dashboardCards router.
 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHART } from "@/components/report-charts";
import { trpc } from "@/lib/trpc/client";
import { viewOf, type CardInstance, type CardType } from "./card-registry";
import {
  bucketLabel,
  CardEmpty,
  ColumnChart,
  CountTable,
  DonutChart,
  foldSlices,
  fmtPct,
  Gauge,
  GranularitySwitch,
  RankChart,
  TimeChart
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
    <div className="flex h-full flex-col gap-2">
      <div className="h-10 animate-pulse rounded bg-[var(--border)]/60" />
      <div className="flex-1 animate-pulse rounded bg-[var(--border)]/40" />
    </div>
  );
}

/** Small uppercase caption with an optional control on the right. */
function Caption({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {children}
      </p>
      {right}
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
  const data = d.history.map((h) => ({
    x: bucketLabel(h.start, g),
    fill: h.closed ? Math.round(h.ratio * 1000) / 10 : null
  }));
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Gauge
          value={d.fillRatio}
          color={CHART.teal}
          label="Fill ratio"
          sub={`${d.filled} filled of ${d.closed} closed`}
        />
        <Gauge
          value={d.hitRatio}
          color={CHART.blue}
          label="Hit ratio"
          sub={`${d.placed} hired of ${d.submitted} submitted`}
        />
      </div>
      <Caption
        right={
          <GranularitySwitch
            value={g}
            onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
          />
        }
      >
        Historic fill ratio
      </Caption>
      <div className="min-h-0 flex-1">
        <TimeChart
          area
          data={data}
          series={[{ key: "fill", label: "Fill ratio", color: CHART.teal }]}
          format={(v) => `${v}%`}
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
      key: "toActivity" as const,
      label: "To first candidate",
      value: d.toActivity,
      color: CHART.amber
    },
    {
      key: "toSubmission" as const,
      label: "To send CVs",
      value: d.toSubmission,
      color: CHART.blue
    },
    { key: "toFill" as const, label: "To fill", value: d.toFill, color: CHART.purple }
  ];
  const data = d.history.map((h) => ({
    x: bucketLabel(h.start, g),
    toActivity: h.toActivity,
    toSubmission: h.toSubmission,
    toFill: h.toFill
  }));
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div key={m.key} className="rounded-md bg-[var(--background)] px-2 py-1.5">
            <p className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ background: m.color }}
              />
              <span className="truncate">{m.label}</span>
            </p>
            <p className="text-base font-semibold tabular-nums text-[var(--foreground)]">
              {m.value == null ? "-" : m.value}
              {m.value == null ? null : (
                <span className="ml-0.5 text-[11px] font-normal text-[var(--muted)]">days</span>
              )}
            </p>
          </div>
        ))}
      </div>
      <Caption
        right={
          <GranularitySwitch
            value={g}
            onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
          />
        }
      >
        Average days by opening date
      </Caption>
      <div className="min-h-0 flex-1">
        <TimeChart
          data={data}
          series={metrics.map((m) => ({ key: m.key, label: m.label, color: m.color }))}
          format={(v) => `${v}d`}
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
  const act = (jobId: string, title: string, v: string) => {
    if (v.startsWith("owner:")) assign.mutate({ ids: [jobId], ownerId: v.slice(6) });
    else if (v.startsWith("status:")) {
      const s = v.slice(7) as "on_hold" | "cancelled" | "inactive";
      if (window.confirm(`Change "${title}" to ${s.replace("_", " ")}?`)) {
        close.mutate({ id: jobId, status: s });
      }
    }
  };
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--muted)]">
        <span className="text-base font-semibold text-[var(--foreground)]">{rows.length}</span> open{" "}
        {rows.length === 1 ? "job has" : "jobs have"} no candidates
      </p>
      {err ? <p className="mb-1 text-xs text-red-600">{err}</p> : null}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((j) => {
          const age = Math.floor((Date.now() - new Date(j.openedAt).getTime()) / DAY_MS);
          return (
            <li key={j.id} className="flex items-center gap-2 py-1.5">
              <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-[13px] font-medium text-[var(--foreground)]">
                  {j.title}
                </span>
                <span className="block truncate text-[11px] text-[var(--muted)]">
                  {j.companyName ?? j.humanId} · {j.ownerName ?? "Unassigned"} · {age}d
                </span>
              </Link>
              <select
                aria-label={`Assign or close ${j.title}`}
                className="w-[74px] shrink-0 rounded border border-[var(--border)] bg-[var(--card)] px-1 py-0.5 text-[11px]"
                value=""
                disabled={assign.isPending || close.isPending}
                onChange={(e) => act(j.id, j.title, e.target.value)}
              >
                <option value="">Action</option>
                <optgroup label="Assign to">
                  {(members.data ?? []).map((m) => (
                    <option key={m.userId} value={`owner:${m.userId}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Close as">
                  <option value="status:on_hold">On hold</option>
                  <option value="status:cancelled">Cancelled</option>
                  <option value="status:inactive">Inactive</option>
                </optgroup>
              </select>
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
  const list = q.data ?? [];
  return (
    <div className="flex gap-3">
      <div className="w-[56%] shrink-0">
        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded p-0.5 hover:bg-[var(--background)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium">
            {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded p-0.5 hover:bg-[var(--background)]"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-[var(--muted)]">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {cells.map((d, i) =>
            d == null ? (
              <span key={`e${i}`} />
            ) : (
              <span
                key={d}
                className={`flex h-6 items-center justify-center rounded text-[11px] ${
                  isToday(d) ? "ring-1 ring-[var(--brand-secondary)]" : ""
                } ${byDay.get(d) ? "bg-[var(--brand-secondary)] font-semibold text-white" : "text-[var(--foreground)]"}`}
                title={byDay.get(d) ? `${byDay.get(d)} start(s)` : undefined}
              >
                {d}
              </span>
            )
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Caption>Starting ({list.length})</Caption>
        {q.isLoading ? null : list.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            No placement start dates this month. They come from placement records.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-[var(--border)]">
            {list.map((r) => (
              <li key={r.id}>
                <Link
                  href={
                    r.applicationId
                      ? `/applications/${r.applicationId}`
                      : `/candidates/${r.candidateId}`
                  }
                  className="block py-1 hover:bg-[var(--background)]"
                >
                  <span className="block truncate text-xs font-medium text-[var(--foreground)]">
                    {[r.firstName, r.lastName].filter(Boolean).join(" ") || "Candidate"}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--muted)]">
                    {r.startDate
                      ? new Date(`${r.startDate}T00:00:00`).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short"
                        })
                      : ""}{" "}
                    · {r.companyName ?? r.jobTitle}
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
            <tr key={r.label} className="border-b border-[var(--border)]/50 last:border-0">
              <td className="py-1.5 pr-2 text-[var(--foreground)]">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{r.jobs}</td>
              <td className="py-1.5 text-right tabular-nums">{r.open}</td>
              <td className="py-1.5 text-right tabular-nums">{r.roles}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtPct(r.fillRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <DonutChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.jobs })))} />;
}

/* Grouped cards ------------------------------------------------------------- */

function JobsByAge({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.jobsByAge.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const short: Record<string, string> = {
    "0 to 7 days": "0-7d",
    "8 to 30 days": "8-30d",
    "31 to 60 days": "31-60d",
    "61 to 90 days": "61-90d",
    "Over 90 days": "90d+"
  };
  const rows = (q.data ?? []).map((r) => ({ label: short[r.label] ?? r.label, count: r.count }));
  const total = rows.reduce((a, r) => a + r.count, 0);
  if (total === 0) return <CardEmpty>No open jobs.</CardEmpty>;
  return (
    <div className="flex h-full flex-col gap-1">
      <p className="text-xs text-[var(--muted)]">
        <span className="text-base font-semibold text-[var(--foreground)]">{total}</span> open jobs
        by days since opening
      </p>
      <div className="min-h-0 flex-1">
        <ColumnChart rows={rows} name="Open jobs" />
      </div>
    </div>
  );
}

function JobsByIndustry({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.jobsByIndustry.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <CardEmpty>No open jobs.</CardEmpty>;
  return viewOf(card) === "list" ? (
    <CountTable rows={rows} head={["Business sector", "Open jobs"]} />
  ) : (
    <DonutChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
  );
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).replace(/_/g, " ") : s);

function CompaniesByStatus({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.companiesByStatus.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []).map((r) => ({
    label: cap(r.label),
    count: r.count,
    href: "/companies"
  }));
  if (rows.length === 0) return <CardEmpty>No companies yet.</CardEmpty>;
  return viewOf(card) === "chart" ? (
    <DonutChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
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
  const unit = by === "open-jobs" ? "Open jobs" : "Hires";
  if (rows.length === 0)
    return (
      <CardEmpty>{by === "open-jobs" ? "No open jobs." : "No hires in this period."}</CardEmpty>
    );
  return viewOf(card) === "chart" ? (
    <RankChart rows={rows} color={by === "open-jobs" ? CHART.blue : CHART.teal} name={unit} />
  ) : (
    <CountTable rows={rows} head={["Company", unit]} />
  );
}

function ByOwner({ card, entity }: { card: CardInstance; entity: "contacts" | "candidates" }) {
  const q = trpc.dashboardCards.byOwner.useQuery({ filter: card.filter, entity }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <CardEmpty>No records yet.</CardEmpty>;
  return viewOf(card) === "chart" ? (
    <RankChart
      rows={rows}
      color={CHART.teal}
      name={entity === "contacts" ? "Contacts" : "Candidates"}
    />
  ) : (
    <CountTable rows={rows} head={["Consultant", "Number"]} />
  );
}

function CandidatesBySource({ card }: { card: CardInstance }) {
  const q = trpc.dashboardCards.candidatesBySource.useQuery({ filter: card.filter }, REFRESH);
  if (q.isLoading) return <Loading />;
  const rows = (q.data ?? []).map((r) => ({ label: cap(r.label), count: r.count }));
  if (rows.length === 0) return <CardEmpty>No candidates yet.</CardEmpty>;
  return viewOf(card) === "list" ? (
    <CountTable rows={rows} head={["Source", "Candidates"]} />
  ) : (
    <DonutChart slices={foldSlices(rows.map((r) => ({ label: r.label, value: r.count })))} />
  );
}

/* X over Time --------------------------------------------------------------- */

const NEWEST: Partial<Record<string, "companies" | "contacts" | "candidates">> = {
  companies: "companies",
  contacts: "contacts",
  candidates: "candidates"
};

const OVER_TIME_LABEL: Record<string, string> = {
  companies: "New companies",
  contacts: "New contacts",
  candidates: "New candidates",
  jobs: "New jobs",
  placements: "Hires"
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
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th className="pb-1.5 font-medium">Name</th>
            <th className="pb-1.5 font-medium">{entity === "companies" ? "Status" : "Title"}</th>
            <th className="w-14 pb-1.5 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--border)]/50 last:border-0">
              <td className="truncate py-1.5 pr-2">
                <Link href={`${base}/${r.id}`} className="text-[var(--accent)] hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="truncate py-1.5 pr-2 text-[var(--muted)]">{cap(r.sub ?? "")}</td>
              <td className="py-1.5 text-right tabular-nums text-[var(--muted)]">
                {Math.max(0, Math.floor((Date.now() - new Date(r.createdAt).getTime()) / DAY_MS))}d
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
  const data = pts.map((p) => ({ x: bucketLabel(p.start, g), n: p.count }));
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          <span className="text-base font-semibold tabular-nums text-[var(--foreground)]">
            {total}
          </span>{" "}
          in the last {pts.length} {g}s
        </p>
        <GranularitySwitch
          value={g}
          onChange={(v) => onPatch({ filter: { ...card.filter, granularity: v } })}
        />
      </div>
      <div className="min-h-0 flex-1">
        <TimeChart
          area
          data={data}
          series={[{ key: "n", label: OVER_TIME_LABEL[entity] ?? "New", color: CHART.blue }]}
        />
      </div>
    </div>
  );
}
