"use client";

import { useState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form";
import { ReportCard, ReportsTabs, TD, TH } from "@/components/reports-shared";
import { CHART, Legend } from "@/components/report-charts";
import { trpc } from "@/lib/trpc/client";

const REFRESH_MS = 30_000;

function fmtMoney(parts: { currency: string; amount: number }[]): string {
  if (parts.length === 0) return "0";
  return parts.map((p) => `${p.amount.toLocaleString()} ${p.currency}`).join(" + ");
}

/**
 * One pacing tile: month-to-date value vs the monthly target, colored by
 * whether the month is on pace (progress >= share of the month elapsed).
 */
function PaceTile({
  label,
  value,
  valueLabel,
  target,
  monthShare,
  meaning,
  href
}: {
  label: string;
  value: number;
  valueLabel?: string;
  target: number | null;
  monthShare: number;
  meaning: string;
  href?: string;
}) {
  const progress = target ? value / target : null;
  const onPace = progress !== null ? progress >= monthShare : null;
  const barColor = onPace === null ? CHART.blue : onPace ? CHART.teal : "#ef4444";
  const body = (
    <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {valueLabel ?? value.toLocaleString()}
        {target ? (
          <span className="ml-1 text-base font-normal text-[var(--muted)]">
            / {target.toLocaleString()}
          </span>
        ) : null}
      </p>
      {target ? (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div
              className="h-full rounded-full"
              style={{
                backgroundColor: barColor,
                width: `${Math.min(100, Math.round((progress ?? 0) * 100))}%`
              }}
            />
          </div>
          <p className="mt-1 text-xs" style={{ color: onPace ? CHART.teal : "#ef4444" }}>
            {onPace ? "On pace" : "⚠ Behind pace"} ({Math.round((progress ?? 0) * 100)}% done,{" "}
            {Math.round(monthShare * 100)}% of month gone)
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">No target set (Settings &gt; Workspace)</p>
      )}
      <p className="mt-1 text-xs text-[var(--muted)]">{meaning}</p>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl transition hover:opacity-90 hover:ring-2 hover:ring-[var(--brand-primary)]/40"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export default function ReportsOverviewPage() {
  const pacing = trpc.overviewReports.pacing.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true
  });
  const bd = trpc.dashboard.bdSnapshot.useQuery(undefined, { refetchInterval: REFRESH_MS });
  const [showMore, setShowMore] = useState(false);

  const data = pacing.data;
  const monthShare = data ? data.month.day / data.month.days : 0;
  const monthName = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <ReportsTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Overview - {monthName}</h1>
          <p className="text-sm text-[var(--muted)]">
            {data
              ? `Day ${data.month.day} of ${data.month.days} - ${data.openJobs} open positions on the desk`
              : "Loading..."}
          </p>
        </div>
        <Link
          href="/settings/workspace"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Edit targets
        </Link>
      </div>

      <FormError message={pacing.error?.message} />

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PaceTile
              label="Placements"
              value={data.actual.placements}
              target={data.targets.placements}
              monthShare={monthShare}
              meaning="Hires completed this month"
            />
            <PaceTile
              label="Revenue"
              value={data.actual.revenue.reduce((a, r) => a + r.amount, 0)}
              valueLabel={fmtMoney(data.actual.revenue)}
              target={data.targets.revenue}
              monthShare={monthShare}
              meaning="Fees from this month's placements"
            />
            <PaceTile
              label="Submissions"
              value={data.actual.submissions}
              target={data.targets.submissions}
              monthShare={monthShare}
              meaning="CVs sent to clients - drives placements"
              href="/reports/recruiters"
            />
            <PaceTile
              label="BD replies"
              value={bd.data?.repliesMonth ?? 0}
              target={data.targets.bdReplies}
              monthShare={monthShare}
              meaning={
                bd.data
                  ? `New-business replies (${bd.data.sentMonth.toLocaleString()} emails sent)`
                  : "New-business replies this month"
              }
              href="/bd/replies"
            />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
            <span className="whitespace-nowrap text-xs text-[var(--muted)]">
              Month: day {data.month.day} of {data.month.days}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
              <div
                className="h-full rounded-full"
                style={{ backgroundColor: CHART.blue, width: `${Math.round(monthShare * 100)}%` }}
              />
            </div>
            <span className="text-xs text-[var(--muted)]">
              bars ahead of {Math.round(monthShare * 100)}% are on pace
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="text-sm text-[var(--accent)] hover:underline"
          >
            {showMore ? "Hide details" : "More info: trends, recruiters, clients"}
          </button>

          {showMore ? (
            <>
              <ReportCard title="Last 6 months">
                <Legend
                  items={[
                    { label: "Submissions", color: CHART.blue },
                    { label: "Placements", color: CHART.purple }
                  ]}
                />
                <div className="flex items-end gap-4" style={{ height: 140 }}>
                  {data.months.map((m) => {
                    const max = Math.max(1, ...data.months.map((x) => x.submissions));
                    const maxP = Math.max(1, ...data.months.map((x) => x.placements));
                    return (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="flex w-full items-end justify-center gap-1"
                          style={{ height: 110 }}
                        >
                          <span
                            className="w-4 rounded-t"
                            title={`${m.month}: ${m.submissions} submissions`}
                            style={{
                              backgroundColor: CHART.blue,
                              height: `${(m.submissions / max) * 100}%`,
                              minHeight: m.submissions > 0 ? 3 : 1
                            }}
                          />
                          <span
                            className="w-4 rounded-t"
                            title={`${m.month}: ${m.placements} placements`}
                            style={{
                              backgroundColor: CHART.purple,
                              height: `${(m.placements / maxP) * 100}%`,
                              minHeight: m.placements > 0 ? 3 : 1
                            }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-[var(--muted)]">
                          {m.month.slice(5)} ({m.submissions}/{m.placements})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ReportCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <ReportCard title="Recruiters this month (placements / submissions)">
                  {data.perRecruiter.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No activity yet this month.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className={TH}>Recruiter</th>
                          <th className={TH}>Placements</th>
                          <th className={TH}>Submissions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.perRecruiter.map((r) => (
                          <tr key={r.name} className="border-b border-[var(--border)]/60">
                            <td className={TD}>{r.name}</td>
                            <td className={`${TD} tabular-nums`}>{r.placements}</td>
                            <td className={`${TD} tabular-nums`}>{r.submissions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ReportCard>
                <ReportCard title="Clients this month (by placements)">
                  {data.topClients.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No placements yet this month.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className={TH}>Client</th>
                          <th className={TH}>Placements</th>
                          <th className={TH}>Fees</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topClients.map((c) => (
                          <tr key={c.name} className="border-b border-[var(--border)]/60">
                            <td className={TD}>{c.name}</td>
                            <td className={`${TD} tabular-nums`}>{c.placements}</td>
                            <td className={`${TD} tabular-nums`}>{c.fees.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ReportCard>
              </div>
            </>
          ) : null}
        </>
      ) : pacing.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading overview...</p>
      ) : null}
    </div>
  );
}
