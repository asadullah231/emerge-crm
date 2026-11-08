"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form";
import {
  ReportCard,
  ReportsTabs,
  STALE_DAYS_LIVE,
  STALE_DAYS_SUBMISSION,
  TD,
  TH,
  fmtDate,
  isPositionFlagged
} from "@/components/reports-shared";
import { BucketBars, CHART, StatGrid, StatTile } from "@/components/report-charts";
import { trpc } from "@/lib/trpc/client";

export default function PositionTrackerPage() {
  const positions = trpc.positionReports.list.useQuery();
  const [amFilter, setAmFilter] = useState<string>("all");
  // ?flagged=1 (dashboard's red-flag tile) opens the page pre-filtered.
  const [flaggedOnly, setFlaggedOnly] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("flagged") === "1"
  );

  const ams = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of positions.data ?? []) {
      if (p.ownerId && p.ownerName) m.set(p.ownerId, p.ownerName);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [positions.data]);

  const isFlagged = isPositionFlagged;

  const rows = (positions.data ?? []).filter(
    (p) => (amFilter === "all" || p.ownerId === amFilter) && (!flaggedOnly || isFlagged(p))
  );

  const flaggedCount = (positions.data ?? []).filter(isFlagged).length;

  return (
    <div className="space-y-4">
      <ReportsTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Position tracker</h1>
          <p className="text-sm text-[var(--muted)]">
            Every live position, longest-running first. Red rows need attention: {STALE_DAYS_LIVE}+
            days live without a placement, or {STALE_DAYS_SUBMISSION}+ days without a submission.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={amFilter}
            onChange={(e) => setAmFilter(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          >
            <option value="all">All account managers</option>
            {ams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFlaggedOnly((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              flaggedOnly
                ? "border-red-500 bg-red-500/10 text-red-500"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Red flags ({flaggedCount})
          </button>
        </div>
      </div>

      <FormError message={positions.error?.message} />
      {positions.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading positions...</p>
      ) : null}

      {positions.data ? (
        <>
          <StatGrid>
            <StatTile
              label="Live positions"
              value={positions.data.length}
              color={CHART.blue}
              sublabel="open jobs right now"
            />
            <StatTile
              label="Red flags"
              value={flaggedCount}
              color="#ef4444"
              status
              sublabel="need attention"
              onClick={() => setFlaggedOnly(true)}
            />
            <StatTile
              label="Never submitted"
              value={positions.data.filter((p) => p.daysSinceLastSubmission === null).length}
              color={CHART.amber}
              sublabel="no CV sent to the client yet"
            />
            <StatTile
              label="With placements"
              value={positions.data.filter((p) => p.placements > 0).length}
              color={CHART.teal}
              sublabel="at least one hire made"
            />
          </StatGrid>

          <ReportCard title="How long positions have been live">
            <BucketBars
              color={CHART.blue}
              buckets={[
                ["0-7 days", (p: { daysLive: number }) => p.daysLive <= 7],
                ["8-14 days", (p: { daysLive: number }) => p.daysLive > 7 && p.daysLive <= 14],
                ["15-30 days", (p: { daysLive: number }) => p.daysLive > 14 && p.daysLive <= 30],
                ["31-60 days", (p: { daysLive: number }) => p.daysLive > 30 && p.daysLive <= 60],
                ["60+ days", (p: { daysLive: number }) => p.daysLive > 60]
              ].map(([label, test]) => ({
                label: label as string,
                count: positions.data.filter(test as (p: { daysLive: number }) => boolean).length
              }))}
            />
          </ReportCard>

          <ReportCard title={`Live positions (${rows.length})`}>
            {rows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No live positions match this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className={TH}>Job</th>
                      <th className={TH}>Client</th>
                      <th className={TH}>AM</th>
                      <th className={TH}>Recruiters</th>
                      <th className={TH}>Days live</th>
                      <th className={TH}>Shortlisted</th>
                      <th className={TH}>Submitted</th>
                      <th className={TH}>Rejected</th>
                      <th className={TH}>Interviews</th>
                      <th className={TH}>Offers</th>
                      <th className={TH}>Last submission</th>
                      <th className={TH}>Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const flagged = isFlagged(p);
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-[var(--border)]/60 ${
                            flagged ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className={TD}>
                            <Link
                              href={`/jobs/${p.id}`}
                              className="font-medium text-[var(--accent)] hover:underline"
                            >
                              {p.title}
                            </Link>
                            {p.placements > 0 ? (
                              <span className="ml-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600">
                                {p.placements} placed
                              </span>
                            ) : null}
                          </td>
                          <td className={TD}>{p.companyName}</td>
                          <td className={TD}>{p.ownerName ?? "-"}</td>
                          <td
                            className={`${TD} max-w-[200px] truncate`}
                            title={p.recruiters.join(", ")}
                          >
                            {p.recruiters.join(", ") || "-"}
                          </td>
                          <td
                            className={`${TD} tabular-nums ${
                              p.daysLive >= STALE_DAYS_LIVE && p.placements === 0
                                ? "font-medium text-red-500"
                                : ""
                            }`}
                          >
                            {p.daysLive}
                          </td>
                          <td className={`${TD} tabular-nums`}>{p.shortlisted}</td>
                          <td className={`${TD} tabular-nums`}>{p.submitted}</td>
                          <td className={`${TD} tabular-nums`}>{p.rejected}</td>
                          <td className={`${TD} tabular-nums`}>{p.interviews}</td>
                          <td className={`${TD} tabular-nums`}>{p.offers}</td>
                          <td
                            className={`${TD} tabular-nums ${
                              (p.daysSinceLastSubmission ?? p.daysLive) >= STALE_DAYS_SUBMISSION
                                ? "font-medium text-red-500"
                                : ""
                            }`}
                          >
                            {p.daysSinceLastSubmission === null
                              ? "never"
                              : p.daysSinceLastSubmission === 0
                                ? "today"
                                : `${p.daysSinceLastSubmission}d ago`}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            {p.lastActivityAt ? fmtDate(p.lastActivityAt) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ReportCard>
        </>
      ) : null}
    </div>
  );
}
