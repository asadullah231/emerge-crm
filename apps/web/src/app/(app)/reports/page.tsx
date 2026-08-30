"use client";

import { useMemo, useState } from "react";
import { cn } from "@emerge/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { Button } from "@/components/form";
import { ReportScheduleModal } from "@/components/report-schedule-modal";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import type { ReportFilters, ReportTable } from "@/lib/reports";
import { trpc } from "@/lib/trpc/client";

const inputClass =
  "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)]";

type Row = (string | number | null)[];

/** Funnel reports get a simple bar viz keyed on the "Ever reached" column. */
function FunnelBars({ table }: { table: ReportTable }) {
  const reachedIdx = table.columns.indexOf("Ever reached");
  if (reachedIdx < 0) return null;
  const max = Math.max(1, ...table.rows.map((r) => Number(r[reachedIdx]) || 0));
  return (
    <div className="space-y-1.5">
      {table.rows.map((r, i) => {
        const reached = Number(r[reachedIdx]) || 0;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-[var(--muted)]">{r[0]}</span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-[var(--background)]">
              <div
                className="flex h-full items-center rounded bg-[var(--accent)] px-2 text-xs font-medium text-white"
                style={{ width: `${(reached / max) * 100}%` }}
              >
                {reached}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportTableView({ table }: { table: ReportTable }) {
  if (table.rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No data for this report and filter set.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            {table.columns.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)]">
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-1.5">
                  {cell == null ? <span className="text-[var(--muted)]">—</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExistingSchedules() {
  const utils = trpc.useUtils();
  const schedules = trpc.reportSchedules.list.useQuery();
  const remove = trpc.reportSchedules.remove.useMutation({
    onSuccess: () => utils.reportSchedules.list.invalidate()
  });
  const setActive = trpc.reportSchedules.setActive.useMutation({
    onSuccess: () => utils.reportSchedules.list.invalidate()
  });
  const rows = schedules.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Scheduled deliveries</h2>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {s.name}
                {!s.active ? (
                  <span className="ml-2 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--muted)]">
                    paused
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {s.cadence} · {s.recipients.length} recipient{s.recipients.length === 1 ? "" : "s"}{" "}
                · next {new Date(s.nextRunAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={setActive.isPending}
                onClick={() => setActive.mutate({ id: s.id, active: !s.active })}
                className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                {s.active ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete schedule "${s.name}"?`)) remove.mutate({ id: s.id });
                }}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReportsPage() {
  // Reports + Activity share one page (client request 29 Aug); /activity
  // redirects here with ?tab=activity.
  const [tab, setTab] = useState<"reports" | "activity">(() => {
    if (typeof window === "undefined") return "reports";
    return new URLSearchParams(window.location.search).get("tab") === "activity"
      ? "activity"
      : "reports";
  });
  const [reportKey, setReportKey] = useState("funnel");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const catalog = trpc.reports.catalog.useQuery();
  const members = trpc.members.list.useQuery();
  const companies = trpc.companies.list.useQuery({ page: 1, pageSize: 200 });

  const filters: ReportFilters = useMemo(
    () => ({
      from: from ? new Date(from + "T00:00:00Z") : undefined,
      to: to ? new Date(to + "T23:59:59Z") : undefined,
      userId: userId || undefined,
      companyId: companyId || undefined
    }),
    [from, to, userId, companyId]
  );

  const report = trpc.reports.run.useQuery({
    key: reportKey as "funnel",
    filters
  });

  const label = catalog.data?.find((r) => r.key === reportKey)?.label ?? reportKey;

  const exportCsv = () => {
    const t = report.data;
    if (!t) return;
    const columns: CsvColumn<Row>[] = t.columns.map((c, i) => ({
      label: c,
      value: (row: Row) => row[i] ?? ""
    }));
    downloadCsv(`${reportKey}.csv`, toCsv(t.rows, columns));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Reports</h1>
          <p className="text-sm text-[var(--muted)]">
            {tab === "reports"
              ? "Agency KPIs over your live pipeline. Filter, export, or schedule an emailed CSV."
              : "Recent activity across your workspace."}
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["reports", "activity"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "activity" ? (
        <div className="mx-auto max-w-3xl">
          <ActivityFeed />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Report
              <select
                value={reportKey}
                onChange={(e) => setReportKey(e.target.value)}
                className={inputClass}
              >
                {(catalog.data ?? []).map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Owner
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className={inputClass}
              >
                <option value="">Everyone</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              Client
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className={inputClass}
              >
                <option value="">All clients</option>
                {(companies.data?.rows ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                className="px-3 py-1.5"
                disabled={!report.data}
                onClick={exportCsv}
              >
                Export CSV
              </Button>
              <Button className="px-3 py-1.5" onClick={() => setScheduling(true)}>
                Schedule
              </Button>
            </div>
          </div>

          <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold">{label}</h2>
            {report.isPending ? (
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            ) : report.data ? (
              <>
                {report.data.key === "funnel" ? <FunnelBars table={report.data} /> : null}
                <ReportTableView table={report.data} />
              </>
            ) : (
              <p className="text-sm text-red-600">
                {report.error?.message ?? "Failed to load report."}
              </p>
            )}
          </section>

          <ExistingSchedules />

          <ReportScheduleModal
            open={scheduling}
            onClose={() => setScheduling(false)}
            reportKey={reportKey}
            reportLabel={label}
            filters={filters}
            onSaved={() => setScheduling(false)}
          />
        </>
      )}
    </div>
  );
}
