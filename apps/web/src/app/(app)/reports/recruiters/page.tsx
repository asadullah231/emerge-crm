"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form";
import {
  DAY_MS,
  ReportCard as Card,
  ReportWindowPicker,
  ReportsTabs,
  TD,
  TH,
  fmtDate,
  pct,
  useReportWindow,
  weekStart
} from "@/components/reports-shared";
import { CHART, DayBars, PeopleBars, StatGrid, StatTile } from "@/components/report-charts";
import { STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { trpc } from "@/lib/trpc/client";

// Weekly KPI targets (Mo's spec): 3 shortlisted + 2 submitted per recruiter.
const TARGET_SHORTLISTED = 3;
const TARGET_SUBMITTED = 2;

function candidateName(first: string | null, last: string): string {
  return [first, last].filter(Boolean).join(" ");
}

function rag(shortlisted: number, submitted: number): "green" | "amber" | "red" {
  const hits =
    (shortlisted >= TARGET_SHORTLISTED ? 1 : 0) + (submitted >= TARGET_SUBMITTED ? 1 : 0);
  return hits === 2 ? "green" : hits === 1 ? "amber" : "red";
}

const RAG_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500"
};

export default function RecruiterReportPage() {
  const reportWindow = useReportWindow();
  const { from, to } = reportWindow;
  const [selected, setSelected] = useState<{
    userId: string | null;
    userName: string;
    toStage: ApplicationStageKey;
  } | null>(null);

  const overview = trpc.recruiterReports.overview.useQuery({ from, to });
  const daily = trpc.recruiterReports.dailyActivity.useQuery({ from, to });
  const list = trpc.recruiterReports.changeList.useQuery(
    {
      from,
      to,
      toStage: selected?.toStage ?? "shortlisted",
      userId: selected?.userId ?? undefined
    },
    { enabled: Boolean(selected) }
  );

  const [dailyUser, setDailyUser] = useState<string>("team");

  const data = overview.data;
  const activeRows =
    data?.rows.filter(
      (r) =>
        r.active || r.week.shortlisted + r.week.submitted + r.week.interview + r.week.rejected > 0
    ) ?? [];

  const weekdays = useMemo(() => {
    // Mon-Fri of the selected window's first week (daily activity is a weekly view).
    const start = weekStart(from);
    return [0, 1, 2, 3, 4].map((i) => new Date(start.getTime() + i * DAY_MS));
  }, [from]);

  const dailyByKey = useMemo(() => {
    const m = new Map<string, NonNullable<typeof daily.data>[number]>();
    for (const row of daily.data ?? []) m.set(`${row.userId}|${row.day}`, row);
    return m;
  }, [daily.data]);

  const openList = (userId: string | null, userName: string, toStage: ApplicationStageKey) =>
    setSelected({ userId, userName, toStage });

  const CountButton = ({
    value,
    userId,
    userName,
    toStage
  }: {
    value: number;
    userId: string | null;
    userName: string;
    toStage: ApplicationStageKey;
  }) => (
    <button
      type="button"
      onClick={() => openList(userId, userName, toStage)}
      className="rounded px-1.5 py-0.5 tabular-nums text-[var(--accent)] hover:bg-[var(--accent)]/10"
      title={`View ${STAGE_LABELS[toStage].toLowerCase()} list`}
    >
      {value}
    </button>
  );

  return (
    <div className="space-y-4">
      <ReportsTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Recruiter report</h1>
          <p className="text-sm text-[var(--muted)]">
            {fmtDate(from)} - {fmtDate(to)} - counts follow the date each status change happened
          </p>
        </div>
        <ReportWindowPicker window={reportWindow} />
      </div>

      <FormError message={overview.error?.message ?? daily.error?.message ?? list.error?.message} />
      {overview.isLoading ? <p className="text-sm text-[var(--muted)]">Loading report...</p> : null}

      {data ? (
        <>
          <StatGrid>
            <StatTile
              label="Shortlisted"
              value={data.totals.week.shortlisted}
              color={CHART.teal}
              sublabel={`team target ${TARGET_SHORTLISTED} per recruiter`}
              onClick={() => openList(null, "Team", "shortlisted")}
            />
            <StatTile
              label="Submitted"
              value={data.totals.week.submitted}
              color={CHART.blue}
              sublabel={`team target ${TARGET_SUBMITTED} per recruiter`}
              onClick={() => openList(null, "Team", "submitted")}
            />
            <StatTile
              label="Interviews"
              value={data.totals.week.interview}
              color={CHART.amber}
              sublabel="booked in this window"
              onClick={() => openList(null, "Team", "interview")}
            />
            <StatTile
              label="Rejected"
              value={data.totals.week.rejected}
              color="#ef4444"
              status
              sublabel="click for who and why"
              onClick={() => openList(null, "Team", "rejected")}
            />
          </StatGrid>

          <Card title="Who did what (click a recruiter for their submissions)">
            <PeopleBars
              rows={activeRows
                .filter((r) => r.week.shortlisted + r.week.submitted > 0)
                .sort((a, b) => b.week.submitted - a.week.submitted)
                .map((r) => ({
                  key: r.userId,
                  name: r.name,
                  values: [r.week.shortlisted, r.week.submitted]
                }))}
              series={[
                { label: "Shortlisted", color: CHART.teal },
                { label: "Submitted", color: CHART.blue }
              ]}
              onRowClick={(key) => {
                const row = activeRows.find((r) => r.userId === key);
                if (row) openList(row.userId, row.name, "submitted");
              }}
            />
          </Card>

          <Card
            title={`Weekly scoreboard (target: ${TARGET_SHORTLISTED} shortlisted / ${TARGET_SUBMITTED} submitted)`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Recruiter</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Shortlisted</th>
                    <th className={TH}>Submitted</th>
                    <th className={TH}>Interviews</th>
                    <th className={TH}>Rejected</th>
                    <th className={TH}>Shortlist to submission</th>
                    <th className={TH}>Same, rolling 4 weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((r) => {
                    const status = rag(r.week.shortlisted, r.week.submitted);
                    return (
                      <tr key={r.userId} className="border-b border-[var(--border)]/60">
                        <td className={TD}>
                          {r.name}
                          {!r.active ? (
                            <span className="ml-1 text-xs text-[var(--muted)]">(former)</span>
                          ) : null}
                        </td>
                        <td className={TD}>
                          <span className="flex items-center gap-1.5 text-xs capitalize">
                            <span className={`h-2.5 w-2.5 rounded-full ${RAG_DOT[status]}`} />
                            {status}
                          </span>
                        </td>
                        <td className={TD}>
                          <CountButton
                            value={r.week.shortlisted}
                            userId={r.userId}
                            userName={r.name}
                            toStage="shortlisted"
                          />
                        </td>
                        <td className={TD}>
                          <CountButton
                            value={r.week.submitted}
                            userId={r.userId}
                            userName={r.name}
                            toStage="submitted"
                          />
                        </td>
                        <td className={TD}>
                          <CountButton
                            value={r.week.interview}
                            userId={r.userId}
                            userName={r.name}
                            toStage="interview"
                          />
                        </td>
                        <td className={TD}>
                          <CountButton
                            value={r.week.rejected}
                            userId={r.userId}
                            userName={r.name}
                            toStage="rejected"
                          />
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          {pct(r.week.submitted, r.week.shortlisted)}
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          {pct(r.rolling4w.submitted, r.rolling4w.shortlisted)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td className={TD}>Team total</td>
                    <td className={TD} />
                    <td className={TD}>
                      <CountButton
                        value={data.totals.week.shortlisted}
                        userId={null}
                        userName="Team"
                        toStage="shortlisted"
                      />
                    </td>
                    <td className={TD}>
                      <CountButton
                        value={data.totals.week.submitted}
                        userId={null}
                        userName="Team"
                        toStage="submitted"
                      />
                    </td>
                    <td className={TD}>
                      <CountButton
                        value={data.totals.week.interview}
                        userId={null}
                        userName="Team"
                        toStage="interview"
                      />
                    </td>
                    <td className={TD}>
                      <CountButton
                        value={data.totals.week.rejected}
                        userId={null}
                        userName="Team"
                        toStage="rejected"
                      />
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {pct(data.totals.week.submitted, data.totals.week.shortlisted)}
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {pct(data.totals.rolling4w.submitted, data.totals.rolling4w.shortlisted)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {selected ? (
            <Card
              title={`${STAGE_LABELS[selected.toStage]} - ${selected.userName} (${fmtDate(from)} - ${fmtDate(to)})`}
              right={
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              }
            >
              {list.isLoading ? (
                <p className="text-sm text-[var(--muted)]">Loading list...</p>
              ) : (list.data ?? []).length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nothing in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className={TH}>Candidate</th>
                        <th className={TH}>Job</th>
                        <th className={TH}>Client</th>
                        <th className={TH}>By</th>
                        <th className={TH}>Date</th>
                        {selected.toStage === "rejected" ? (
                          <th className={TH}>Rejected by</th>
                        ) : null}
                        {selected.toStage === "rejected" ? <th className={TH}>Feedback</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {(list.data ?? []).map((row) => (
                        <tr key={row.id} className="border-b border-[var(--border)]/60">
                          <td className={TD}>
                            <Link
                              href={`/candidates/${row.candidateId}`}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {candidateName(row.candidateFirstName, row.candidateLastName)}
                            </Link>
                          </td>
                          <td className={TD}>
                            <Link href={`/jobs/${row.jobId}`} className="hover:underline">
                              {row.jobTitle}
                            </Link>
                          </td>
                          <td className={TD}>{row.companyName}</td>
                          <td className={TD}>{row.actorName ?? "-"}</td>
                          <td className={`${TD} whitespace-nowrap`}>{fmtDate(row.createdAt)}</td>
                          {selected.toStage === "rejected" ? (
                            <td className={`${TD} capitalize`}>
                              {row.rejectedBy === "client"
                                ? "The client"
                                : row.rejectedBy === "us"
                                  ? "Us"
                                  : "-"}
                            </td>
                          ) : null}
                          {selected.toStage === "rejected" ? (
                            <td className={`${TD} max-w-[320px]`}>
                              {row.note ?? row.rejectionReason ?? "-"}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top rejection reasons (last 4 weeks)">
              {data.teamTopRejectionReasons.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No rejection feedback recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-1">
                    {data.teamTopRejectionReasons.map((r) => (
                      <li
                        key={r.reason}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate" title={r.reason}>
                          {r.reason}
                        </span>
                        <span className="tabular-nums text-[var(--muted)]">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-1 border-t border-[var(--border)] pt-2">
                    {data.rows
                      .filter((r) => r.topRejectionReasons.length > 0)
                      .map((r) => (
                        <p key={r.userId} className="text-xs text-[var(--muted)]">
                          <span className="font-medium text-[var(--foreground)]">{r.name}:</span>{" "}
                          {r.topRejectionReasons.map((x) => `${x.reason} (${x.count})`).join(" - ")}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Downstream results (submissions made in this window)">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Recruiter</th>
                    <th className={TH}>Submitted</th>
                    <th className={TH}>Reached interview</th>
                    <th className={TH}>Reached offer</th>
                    <th className={TH}>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows
                    .filter((r) => r.downstream.submitted > 0)
                    .map((r) => (
                      <tr key={r.userId} className="border-b border-[var(--border)]/60">
                        <td className={TD}>{r.name}</td>
                        <td className={`${TD} tabular-nums`}>{r.downstream.submitted}</td>
                        <td className={`${TD} tabular-nums`}>
                          {r.downstream.interview} (
                          {pct(r.downstream.interview, r.downstream.submitted)})
                        </td>
                        <td className={`${TD} tabular-nums`}>{r.downstream.offered}</td>
                        <td className={`${TD} tabular-nums`}>{r.downstream.hired}</td>
                      </tr>
                    ))}
                  {activeRows.every((r) => r.downstream.submitted === 0) ? (
                    <tr>
                      <td colSpan={5} className={`${TD} text-[var(--muted)]`}>
                        No submissions in this window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Card>
          </div>

          <Card
            title="Daily activity (Mon-Fri)"
            right={
              <select
                value={dailyUser}
                onChange={(e) => setDailyUser(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
              >
                <option value="team">Whole team</option>
                {data.rows
                  .filter((r) => r.active)
                  .map((r) => (
                    <option key={r.userId} value={r.userId}>
                      {r.name}
                    </option>
                  ))}
              </select>
            }
          >
            <div className="mb-4">
              <DayBars
                groups={weekdays.map((d) => {
                  const row = dailyByKey.get(`${dailyUser}|${d.toISOString().slice(0, 10)}`);
                  return {
                    label: d.toLocaleDateString(undefined, { weekday: "short" }),
                    values: [
                      row?.candidatesAdded ?? 0,
                      (row?.calls ?? 0) + (row?.meetings ?? 0),
                      row?.statusChanges ?? 0,
                      row?.tasksDone ?? 0
                    ]
                  };
                })}
                series={[
                  { label: "Candidates added", color: CHART.blue },
                  { label: "Calls + meetings", color: CHART.teal },
                  { label: "Status changes", color: CHART.amber },
                  { label: "Tasks done", color: CHART.purple }
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Activity</th>
                    {weekdays.map((d) => (
                      <th key={d.toISOString()} className={TH}>
                        {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["candidatesAdded", "Candidates added"],
                      ["calls", "Calls logged"],
                      ["meetings", "Meetings logged"],
                      ["statusChanges", "Status changes"],
                      ["tasksDone", "Tasks completed"]
                    ] as const
                  ).map(([field, label]) => (
                    <tr key={field} className="border-b border-[var(--border)]/60">
                      <td className={TD}>{label}</td>
                      {weekdays.map((d) => {
                        const key = `${dailyUser}|${d.toISOString().slice(0, 10)}`;
                        const row = dailyByKey.get(key);
                        const value = row ? row[field] : 0;
                        return (
                          <td
                            key={d.toISOString()}
                            className={`${TD} tabular-nums ${value === 0 ? "text-[var(--muted)]" : ""}`}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Calls and meetings come from notes logged with kind Call / Meeting - log every call or
              InMail as a note to see it here.
            </p>
          </Card>

          <Card title="Sourcing health">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-[var(--border)] p-3">
                <p className="text-xs text-[var(--muted)]">
                  Avg. days to first shortlist (last 4 weeks)
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data.sourcing.avgDaysToFirstShortlist ?? "-"}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  from {data.sourcing.firstShortlistSample} job
                  {data.sourcing.firstShortlistSample === 1 ? "" : "s"}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] p-3 md:col-span-2">
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Shortlists per week (team, last 4 weeks)
                </p>
                <div className="flex items-end gap-3">
                  {data.sourcing.weeklyShortlistTrend.map((w) => {
                    const max = Math.max(
                      1,
                      ...data.sourcing.weeklyShortlistTrend.map((x) => x.count)
                    );
                    return (
                      <div key={w.weekStart} className="flex flex-col items-center gap-1">
                        <span className="text-xs tabular-nums">{w.count}</span>
                        <div
                          className="w-10 rounded-t bg-[var(--accent)]/70"
                          style={{ height: `${Math.max(4, (w.count / max) * 64)}px` }}
                        />
                        <span className="text-[10px] text-[var(--muted)]">
                          {fmtDate(w.weekStart)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-[var(--muted)]">
                Open jobs with no shortlist yet ({data.sourcing.zeroShortlistJobs.length})
              </p>
              {data.sourcing.zeroShortlistJobs.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Every open job has at least one shortlisted candidate.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className={TH}>Job</th>
                        <th className={TH}>Client</th>
                        <th className={TH}>Days live</th>
                        <th className={TH}>Recruiters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sourcing.zeroShortlistJobs.map((j) => (
                        <tr key={j.id} className="border-b border-[var(--border)]/60">
                          <td className={TD}>
                            <Link
                              href={`/jobs/${j.id}`}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {j.title}
                            </Link>
                          </td>
                          <td className={TD}>{j.companyName}</td>
                          <td
                            className={`${TD} tabular-nums ${j.daysOpen >= 30 ? "text-red-500" : ""}`}
                          >
                            {j.daysOpen}
                          </td>
                          <td className={TD}>{j.recruiters.join(", ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
