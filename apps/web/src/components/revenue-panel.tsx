"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/form";
import { formatMoney } from "@/lib/offers";
import { trpc } from "@/lib/trpc/client";

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className={
          tone === "good"
            ? "text-lg font-semibold text-green-600"
            : tone === "warn"
              ? "text-lg font-semibold text-amber-600"
              : "text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

/** Expected vs actual revenue for one job, with the target editor + placements. */
export function JobRevenuePanel({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const summary = trpc.revenue.forJob.useQuery({ jobId });
  const placements = trpc.placements.byJob.useQuery({ jobId });
  const [editing, setEditing] = useState(false);
  const [perPos, setPerPos] = useState("");
  const [currency, setCurrency] = useState("GBP");

  const data = summary.data;
  useEffect(() => {
    if (data) {
      setPerPos(data.revenuePerPosition != null ? String(data.revenuePerPosition) : "");
      setCurrency(data.currency ?? "GBP");
    }
  }, [data]);

  const setTarget = trpc.revenue.setTarget.useMutation({
    onSuccess: () => {
      setEditing(false);
      utils.revenue.forJob.invalidate({ jobId });
    }
  });

  if (!data) return <p className="text-sm text-[var(--muted)]">No revenue data.</p>;
  const rows = placements.data ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Expected" value={formatMoney(data.expected, data.currency)} />
        <Tile label="Actual" value={formatMoney(data.actual, data.currency)} tone="good" />
        <Tile
          label="Missed"
          value={formatMoney(data.missed, data.currency)}
          tone={data.missed > 0 ? "warn" : undefined}
        />
        <Tile label="Placements" value={String(data.placementsCount)} />
      </div>

      <p className="text-xs text-[var(--muted)]">
        {data.positions} position{data.positions === 1 ? "" : "s"} ·{" "}
        {data.revenuePerPosition != null
          ? `${formatMoney(data.revenuePerPosition, data.currency)} per position`
          : "no revenue target set"}
        {canWrite ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="ml-2 text-[var(--accent)] hover:underline"
          >
            {editing ? "Cancel" : "Set target"}
          </button>
        ) : null}
      </p>

      {editing ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <label className="text-xs text-[var(--muted)]">
            Revenue per position
            <input
              type="number"
              min={0}
              value={perPos}
              onChange={(e) => setPerPos(e.target.value)}
              className="mt-1 w-40 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Currency
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 w-24 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
            />
          </label>
          <Button
            className="px-3 py-1.5"
            disabled={setTarget.isPending}
            onClick={() =>
              setTarget.mutate({
                jobId,
                revenuePerPosition: perPos ? parseInt(perPos, 10) : null,
                currency: currency.trim() || null
              })
            }
          >
            {setTarget.isPending ? "Saving..." : "Save target"}
          </Button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-1">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              <span>
                {p.candidateFirstName} {p.candidateLastName} · {p.humanId}
              </span>
              <span className="text-[var(--muted)]">
                {formatMoney(p.feeAmount, p.currency)}
                {p.startDate ? ` · ${p.startDate}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Client-level revenue rollup: totals + per-job breakdown for one company. */
export function ClientRevenuePanel({ companyId }: { companyId: string }) {
  const summary = trpc.revenue.summary.useQuery({ companyId });
  const data = summary.data;
  if (!data) return <p className="text-sm text-[var(--muted)]">No revenue data.</p>;
  if (data.byJob.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No revenue targets or placements yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Expected" value={formatMoney(data.totals.expected)} />
        <Tile label="Actual" value={formatMoney(data.totals.actual)} tone="good" />
        <Tile
          label="Missed"
          value={formatMoney(data.totals.missed)}
          tone={data.totals.missed > 0 ? "warn" : undefined}
        />
        <Tile label="Placements" value={String(data.totals.placementsCount)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--muted)]">
              <th className="py-1 pr-3 font-medium">Job</th>
              <th className="py-1 pr-3 font-medium">Expected</th>
              <th className="py-1 pr-3 font-medium">Actual</th>
              <th className="py-1 font-medium">Placements</th>
            </tr>
          </thead>
          <tbody>
            {data.byJob.map((j) => (
              <tr key={j.jobId} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-3">{j.jobTitle}</td>
                <td className="py-1.5 pr-3">{formatMoney(j.expected, j.currency)}</td>
                <td className="py-1.5 pr-3 text-green-600">{formatMoney(j.actual, j.currency)}</td>
                <td className="py-1.5">{j.placementsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
