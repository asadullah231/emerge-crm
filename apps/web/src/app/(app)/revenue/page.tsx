"use client";

import Link from "next/link";
import { FormError } from "@/components/form";
import { formatMoney } from "@/lib/offers";
import { trpc } from "@/lib/trpc/client";

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={
          tone === "good"
            ? "text-2xl font-semibold text-green-600"
            : tone === "warn"
              ? "text-2xl font-semibold text-amber-600"
              : "text-2xl font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function RollupTable({
  title,
  rows
}: {
  title: string;
  rows: {
    key: string | null;
    label: string | null;
    expected: number;
    actual: number;
    placementsCount: number;
    jobs: number;
  }[];
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Actual</th>
                <th className="px-3 py-2 font-medium">Placements</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key ?? "none"} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.label ?? "Unassigned"}</td>
                  <td className="px-3 py-2">{formatMoney(r.expected)}</td>
                  <td className="px-3 py-2 text-green-600">{formatMoney(r.actual)}</td>
                  <td className="px-3 py-2">{r.placementsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RevenuePage() {
  const summary = trpc.revenue.summary.useQuery();
  const recent = trpc.revenue.recentPlacements.useQuery({ limit: 20 });
  const data = summary.data;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Revenue</h1>
        <p className="text-sm text-[var(--muted)]">
          Expected fees vs realised placement revenue, per client and per account manager.
        </p>
      </div>
      <FormError message={summary.error?.message} />

      {summary.isLoading || !data ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Expected" value={formatMoney(data.totals.expected)} />
            <Tile label="Actual" value={formatMoney(data.totals.actual)} tone="good" />
            <Tile
              label="Missed"
              value={formatMoney(data.totals.missed)}
              tone={data.totals.missed > 0 ? "warn" : undefined}
            />
            <Tile label="Placements" value={String(data.totals.placementsCount)} />
          </div>

          <RollupTable title="By client" rows={data.byClient} />
          <RollupTable title="By account manager" rows={data.byOwner} />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">Recent placements</h2>
            {(recent.data ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No placements yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
                {(recent.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/jobs/${p.jobId}`}
                        className="font-medium text-[var(--accent)] hover:underline"
                      >
                        {p.jobTitle ?? "Job"}
                      </Link>
                      <span className="ml-2 text-sm text-[var(--muted)]">
                        {p.humanId}
                        {p.placedByName ? ` · ${p.placedByName}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm">
                      {formatMoney(p.feeAmount, p.currency)}
                      {p.startDate ? (
                        <span className="ml-2 text-[var(--muted)]">starts {p.startDate}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
