"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FormError } from "@/components/form";
import {
  ReportCard,
  ReportWindowPicker,
  ReportsTabs,
  TD,
  TH,
  fmtDate,
  useReportWindow
} from "@/components/reports-shared";
import { trpc } from "@/lib/trpc/client";

type ListKind = "clients" | "jobs" | "terms" | "placements";

const LIST_TITLES: Record<ListKind, string> = {
  clients: "New clients",
  jobs: "Jobs opened",
  terms: "Terms signed",
  placements: "Placements"
};

function fmtMoney(sums: Map<string, number>): string {
  if (sums.size === 0) return "-";
  return [...sums.entries()]
    .map(([currency, amount]) => `${amount.toLocaleString()} ${currency}`)
    .join(" + ");
}

export default function AmReportPage() {
  const window = useReportWindow();
  const { from, to } = window;
  const overview = trpc.amReports.overview.useQuery({ from, to });
  const [selected, setSelected] = useState<{ amId: string | null; kind: ListKind } | null>(null);

  const data = overview.data;

  const rows = useMemo(() => {
    if (!data) return [];
    type Row = {
      userId: string | null;
      name: string;
      newClients: number;
      newJobs: number;
      termsSigned: number;
      meetings: number;
      placements: number;
      revenue: Map<string, number>;
    };
    const byId = new Map<string | null, Row>();
    const nameOf = new Map<string, string>(data.members.map((m) => [m.userId, m.name]));
    const row = (userId: string | null): Row => {
      const existing = byId.get(userId);
      if (existing) return existing;
      const created: Row = {
        userId,
        name: userId ? (nameOf.get(userId) ?? "Former member") : "Unassigned",
        newClients: 0,
        newJobs: 0,
        termsSigned: 0,
        meetings: 0,
        placements: 0,
        revenue: new Map()
      };
      byId.set(userId, created);
      return created;
    };
    for (const c of data.newClients) row(c.ownerId).newClients += 1;
    for (const j of data.newJobs) row(j.ownerId).newJobs += 1;
    for (const t of data.termsSigned) row(t.ownerId).termsSigned += 1;
    for (const m of data.meetingRows) {
      if (m.authorId) row(m.authorId).meetings += 1;
    }
    for (const p of data.placementRows) {
      const r = row(p.amId);
      r.placements += 1;
      if (p.feeAmount) {
        const cur = p.currency ?? "GBP";
        r.revenue.set(cur, (r.revenue.get(cur) ?? 0) + p.feeAmount);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.userId === null ? 1 : b.userId === null ? -1 : a.name.localeCompare(b.name)
    );
  }, [data]);

  const totals = useMemo(() => {
    const revenue = new Map<string, number>();
    for (const r of rows) {
      for (const [cur, amount] of r.revenue) revenue.set(cur, (revenue.get(cur) ?? 0) + amount);
    }
    return {
      newClients: rows.reduce((a, r) => a + r.newClients, 0),
      newJobs: rows.reduce((a, r) => a + r.newJobs, 0),
      termsSigned: rows.reduce((a, r) => a + r.termsSigned, 0),
      meetings: rows.reduce((a, r) => a + r.meetings, 0),
      placements: rows.reduce((a, r) => a + r.placements, 0),
      revenue
    };
  }, [rows]);

  const selectedName = selected
    ? selected.amId === null
      ? "Team"
      : (rows.find((r) => r.userId === selected.amId)?.name ?? "")
    : "";

  const CountButton = ({
    value,
    amId,
    kind
  }: {
    value: number;
    amId: string | null;
    kind: ListKind;
  }) => (
    <button
      type="button"
      onClick={() => setSelected({ amId, kind })}
      className="rounded px-1.5 py-0.5 tabular-nums text-[var(--accent)] hover:bg-[var(--accent)]/10"
      title={`View ${LIST_TITLES[kind].toLowerCase()} list`}
    >
      {value}
    </button>
  );

  const matchesAm = (ownerId: string | null) =>
    !selected || selected.amId === null || ownerId === selected.amId;

  return (
    <div className="space-y-4">
      <ReportsTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Account manager report</h1>
          <p className="text-sm text-[var(--muted)]">
            {fmtDate(from)} - {fmtDate(to)} - clients and jobs count toward their owner
          </p>
        </div>
        <ReportWindowPicker window={window} />
      </div>

      <FormError message={overview.error?.message} />
      {overview.isLoading ? <p className="text-sm text-[var(--muted)]">Loading report...</p> : null}

      {data ? (
        <>
          <ReportCard title="Weekly scoreboard">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className={TH}>Account manager</th>
                    <th className={TH}>New clients</th>
                    <th className={TH}>Jobs opened</th>
                    <th className={TH}>Terms signed</th>
                    <th className={TH}>Meetings logged</th>
                    <th className={TH}>Placements</th>
                    <th className={TH}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.userId ?? "unassigned"}
                      className="border-b border-[var(--border)]/60"
                    >
                      <td className={TD}>{r.name}</td>
                      <td className={TD}>
                        <CountButton value={r.newClients} amId={r.userId} kind="clients" />
                      </td>
                      <td className={TD}>
                        <CountButton value={r.newJobs} amId={r.userId} kind="jobs" />
                      </td>
                      <td className={TD}>
                        <CountButton value={r.termsSigned} amId={r.userId} kind="terms" />
                      </td>
                      <td className={`${TD} tabular-nums`}>{r.meetings}</td>
                      <td className={TD}>
                        <CountButton value={r.placements} amId={r.userId} kind="placements" />
                      </td>
                      <td className={`${TD} tabular-nums`}>{fmtMoney(r.revenue)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`${TD} text-[var(--muted)]`}>
                        No account-manager activity in this window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="font-medium">
                    <td className={TD}>Team total</td>
                    <td className={TD}>
                      <CountButton value={totals.newClients} amId={null} kind="clients" />
                    </td>
                    <td className={TD}>
                      <CountButton value={totals.newJobs} amId={null} kind="jobs" />
                    </td>
                    <td className={TD}>
                      <CountButton value={totals.termsSigned} amId={null} kind="terms" />
                    </td>
                    <td className={`${TD} tabular-nums`}>{totals.meetings}</td>
                    <td className={TD}>
                      <CountButton value={totals.placements} amId={null} kind="placements" />
                    </td>
                    <td className={`${TD} tabular-nums`}>{fmtMoney(totals.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Meetings come from notes logged with kind Meeting. Terms signed uses the new Terms
              signed date on the client record.
            </p>
          </ReportCard>

          {selected ? (
            <ReportCard
              title={`${LIST_TITLES[selected.kind]} - ${selectedName} (${fmtDate(from)} - ${fmtDate(to)})`}
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
              {selected.kind === "clients" ? (
                <ListTable
                  headers={["Client", "Source", "Added"]}
                  rows={data.newClients.filter((c) => matchesAm(c.ownerId))}
                  renderRow={(c) => (
                    <tr key={c.id} className="border-b border-[var(--border)]/60">
                      <td className={TD}>
                        <Link
                          href={`/companies/${c.id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className={TD}>{c.source ?? "-"}</td>
                      <td className={`${TD} whitespace-nowrap`}>{fmtDate(c.createdAt)}</td>
                    </tr>
                  )}
                />
              ) : null}
              {selected.kind === "jobs" ? (
                <ListTable
                  headers={["Job", "Client", "Opened"]}
                  rows={data.newJobs.filter((j) => matchesAm(j.ownerId))}
                  renderRow={(j) => (
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
                      <td className={`${TD} whitespace-nowrap`}>{fmtDate(j.openedAt)}</td>
                    </tr>
                  )}
                />
              ) : null}
              {selected.kind === "terms" ? (
                <ListTable
                  headers={["Client", "Terms signed"]}
                  rows={data.termsSigned.filter((t) => matchesAm(t.ownerId))}
                  renderRow={(t) => (
                    <tr key={t.id} className="border-b border-[var(--border)]/60">
                      <td className={TD}>
                        <Link
                          href={`/companies/${t.id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {t.termsSignedAt ? fmtDate(t.termsSignedAt) : "-"}
                      </td>
                    </tr>
                  )}
                />
              ) : null}
              {selected.kind === "placements" ? (
                <ListTable
                  headers={["Candidate", "Job", "Client", "Fee", "Date"]}
                  rows={data.placementRows.filter((p) => matchesAm(p.amId))}
                  renderRow={(p) => (
                    <tr key={p.id} className="border-b border-[var(--border)]/60">
                      <td className={TD}>
                        {[p.candidateFirstName, p.candidateLastName].filter(Boolean).join(" ")}
                      </td>
                      <td className={TD}>
                        <Link href={`/jobs/${p.jobId}`} className="hover:underline">
                          {p.jobTitle}
                        </Link>
                      </td>
                      <td className={TD}>{p.companyName}</td>
                      <td className={`${TD} tabular-nums`}>
                        {p.feeAmount ? `${p.feeAmount.toLocaleString()} ${p.currency ?? ""}` : "-"}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{fmtDate(p.createdAt)}</td>
                    </tr>
                  )}
                />
              ) : null}
            </ReportCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ListTable<T>({
  headers,
  rows,
  renderRow
}: {
  headers: string[];
  rows: T[];
  renderRow: (row: T) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Nothing in this window.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {headers.map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
