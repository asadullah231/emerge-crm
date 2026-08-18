"use client";

/**
 * Dashboard chart primitives, styled on the EmergeTech light theme (navy +
 * teal, neutral surfaces). Superset-inspired: big-number KPI tiles, a clickable
 * conversion funnel, and a multi-series trend chart with a hover tooltip and a
 * legend that toggles series. All pure presentational client components - they
 * take plain arrays and callbacks, no data fetching.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";

/* --------------------------------------------------------------------------- */
/* Big-number KPI tile                                                         */
/* --------------------------------------------------------------------------- */

export type KpiTone = "default" | "positive" | "negative" | "warning";

export function BigNumber({
  label,
  value,
  unit,
  href,
  tone = "default",
  sublabel,
  emptyHint,
  loading
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  href?: string;
  tone?: KpiTone;
  sublabel?: string;
  emptyHint?: string;
  loading?: boolean;
}) {
  const toneClass =
    tone === "positive"
      ? "text-green-600"
      : tone === "negative"
        ? "text-red-600"
        : tone === "warning"
          ? "text-amber-600"
          : "text-[var(--brand-primary)]";

  const body = (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--brand-primary-soft)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="mt-2">
        {loading ? (
          <span className="inline-block h-7 w-14 animate-pulse rounded bg-[var(--border)]" />
        ) : value == null ? (
          <span className="text-sm text-[var(--muted)]">{emptyHint ?? "-"}</span>
        ) : (
          <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
            {value.toLocaleString()}
            {unit ? (
              <span className="ml-0.5 text-base font-medium text-[var(--muted)]">{unit}</span>
            ) : null}
          </span>
        )}
        {sublabel && !loading ? (
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{sublabel}</p>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} aria-label={label} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/* --------------------------------------------------------------------------- */
/* Conversion funnel                                                           */
/* --------------------------------------------------------------------------- */

export type FunnelDatum = {
  stage: string;
  label: string;
  count: number;
  conversion: number | null;
};

export function FunnelChart({
  data,
  activeStage,
  onSelect,
  loading
}: {
  data?: FunnelDatum[];
  activeStage?: string | null;
  onSelect?: (stage: string) => void;
  loading?: boolean;
}) {
  if (loading || !data) {
    return <div className="h-48 animate-pulse rounded-lg bg-[var(--border)]" />;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const top = data[0]?.count ?? 0;

  return (
    <div className="space-y-1.5">
      {data.map((d) => {
        const active = activeStage === d.stage;
        const overall = top === 0 ? 0 : Math.round((d.count / top) * 100);
        return (
          <button
            key={d.stage}
            type="button"
            onClick={() => onSelect?.(d.stage)}
            aria-pressed={active}
            title={`${d.label}: ${d.count.toLocaleString()} (${overall}% of top of funnel)`}
            className={`flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--brand-primary-soft)] ${
              active ? "bg-[var(--brand-primary-soft)] ring-1 ring-[var(--brand-primary)]/40" : ""
            }`}
          >
            <span className="w-20 shrink-0 text-sm text-[var(--foreground)]">{d.label}</span>
            <span className="relative h-7 flex-1 overflow-hidden rounded bg-[var(--background)]">
              <span
                className="absolute inset-y-0 left-0 flex items-center rounded bg-[var(--brand-primary)]/80 px-2 text-xs font-semibold text-white transition-all"
                style={{ width: `${Math.max(d.count === 0 ? 0 : 6, (d.count / max) * 100)}%` }}
              >
                {d.count > 0 ? d.count.toLocaleString() : ""}
              </span>
            </span>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
              {d.conversion == null ? (
                <span className="text-[var(--brand-secondary)]">top</span>
              ) : (
                <span title="Conversion from previous stage">
                  {Math.round(d.conversion * 100)}%
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Multi-series trend chart                                                    */
/* --------------------------------------------------------------------------- */

export type TrendSeries = { key: string; label: string; color: string };
export type TrendPoint = { weekStart: Date } & Record<string, number | Date>;

export function MultiTrendChart({
  data,
  series,
  loading
}: {
  data?: TrendPoint[];
  series: TrendSeries[];
  loading?: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<number | null>(null);

  if (loading || !data) {
    return <div className="h-48 animate-pulse rounded-lg bg-[var(--border)]" />;
  }

  const visible = series.filter((s) => !hidden.has(s.key));
  const n = data.length;
  const hasData = visible.some((s) => data.some((d) => (d[s.key] as number) > 0));

  const W = 640;
  const H = 180;
  const padY = 12;
  const max = Math.max(1, ...data.flatMap((d) => visible.map((s) => (d[s.key] as number) ?? 0)));
  const xAt = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v: number) => padY + (1 - v / max) * (H - padY * 2);

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      {/* Legend (click to toggle a series) */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {series.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 transition-opacity ${
                off ? "opacity-40" : ""
              }`}
              title={off ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[var(--muted)]">{s.label}</span>
            </button>
          );
        })}
      </div>

      {!hasData ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">
          Not enough data yet. Trends appear as records are added.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-44 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Weekly recruitment trends"
          >
            {/* baseline */}
            <line
              x1={0}
              y1={H - padY}
              x2={W}
              y2={H - padY}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* active week guide */}
            {active != null ? (
              <line
                x1={xAt(active)}
                y1={padY}
                x2={xAt(active)}
                y2={H - padY}
                stroke="var(--muted)"
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {visible.map((s) => {
              const points = data.map((d, i) => `${xAt(i)},${yAt((d[s.key] as number) ?? 0)}`);
              return (
                <polyline
                  key={s.key}
                  points={points.join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {/* markers on the active week */}
            {active != null
              ? visible.map((s) => (
                  <circle
                    key={s.key}
                    cx={xAt(active)}
                    cy={yAt((data[active]![s.key] as number) ?? 0)}
                    r={3}
                    fill={s.color}
                  />
                ))
              : null}
          </svg>

          {/* invisible hover columns to drive the tooltip */}
          <div className="absolute inset-0 flex">
            {data.map((d, i) => (
              <div
                key={i}
                className="h-full flex-1"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
              />
            ))}
          </div>

          {/* tooltip */}
          {active != null ? (
            <div
              className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs shadow-md"
              style={{ left: `${(active / Math.max(1, n - 1)) * 100}%` }}
            >
              <p className="mb-1 font-medium text-[var(--foreground)]">
                Week of {shortDate(data[active]!.weekStart)}
              </p>
              {visible.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[var(--muted)]">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-[var(--foreground)]">
                    {(data[active]![s.key] as number) ?? 0}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {/* x-axis range labels */}
          <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
            <span>{shortDate(data[0]!.weekStart)}</span>
            <span>{shortDate(data[n - 1]!.weekStart)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* --------------------------------------------------------------------------- */
/* Small shared bits                                                           */
/* --------------------------------------------------------------------------- */

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-[var(--muted)]">{children}</p>;
}
