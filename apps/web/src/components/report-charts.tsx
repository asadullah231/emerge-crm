"use client";

/**
 * Report chart primitives (RD UX pass): AdminLTE-inspired stat tiles and plain
 * HTML/SVG bar charts on the app theme. Categorical palette is fixed-order and
 * CVD-validated for light and dark surfaces (dataviz six-checks):
 *   1 blue #3564d9 - 2 teal #12a594 - 3 amber #d97706 - 4 purple #a855f7
 * Series keep their color everywhere (color follows the entity); red is a
 * status color reserved for flags and always ships with a label. Values and
 * labels wear ink tokens, never the series color; every chart has a table or
 * list nearby as the accessible view.
 */

import type { ReactNode } from "react";

export const CHART = {
  blue: "#3564d9",
  teal: "#12a594",
  amber: "#d97706",
  purple: "#a855f7"
} as const;

/* --------------------------------------------------------------------------- */
/* AdminLTE-style stat tile (clickable)                                        */
/* --------------------------------------------------------------------------- */

export function StatTile({
  label,
  value,
  color,
  sublabel,
  onClick,
  status
}: {
  label: string;
  value: number | string;
  /** Accent color (chart palette, or a status color WITH a status label). */
  color: string;
  sublabel?: string;
  onClick?: () => void;
  /** Marks the tile as a status (adds the warning glyph so it is not color-alone). */
  status?: boolean;
}) {
  const body = (
    <div
      className="relative h-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition-colors"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: color, opacity: 0.07 }}
      />
      <p className="relative text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {status ? <span aria-hidden>&#9888; </span> : null}
        {label}
      </p>
      <p className="relative mt-1 text-3xl font-semibold tabular-nums text-[var(--foreground)]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sublabel ? <p className="relative mt-0.5 text-xs text-[var(--muted)]">{sublabel}</p> : null}
    </div>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="block w-full cursor-pointer rounded-xl text-left transition hover:opacity-90 hover:ring-2 hover:ring-[var(--brand-primary)]/40"
      aria-label={`${label}: view list`}
    >
      {body}
    </button>
  ) : (
    body
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

/* --------------------------------------------------------------------------- */
/* Legend                                                                      */
/* --------------------------------------------------------------------------- */

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[var(--muted)]">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Grouped horizontal bars: one row per person, up to 2 series                 */
/* --------------------------------------------------------------------------- */

export function PeopleBars({
  rows,
  series,
  onRowClick
}: {
  rows: { key: string; name: string; values: number[] }[];
  series: { label: string; color: string }[];
  onRowClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--muted)]">No activity to chart.</p>;
  }
  return (
    <div>
      <Legend items={series} />
      <div className="space-y-2">
        {rows.map((r) => {
          const inner = (
            <div className="flex items-center gap-3">
              <span
                className="w-32 shrink-0 truncate text-sm text-[var(--foreground)]"
                title={r.name}
              >
                {r.name}
              </span>
              <span className="flex-1 space-y-0.5">
                {r.values.map((v, i) => (
                  <span key={i} className="flex h-4 items-center gap-1.5">
                    <span
                      className="h-3 rounded-r"
                      title={`${r.name} - ${series[i]?.label}: ${v}`}
                      style={{
                        backgroundColor: series[i]?.color,
                        width: `${(v / max) * 100}%`,
                        minWidth: v > 0 ? 6 : 0
                      }}
                    />
                    <span className="text-xs tabular-nums text-[var(--muted)]">{v}</span>
                  </span>
                ))}
              </span>
            </div>
          );
          return onRowClick ? (
            <button
              key={r.key}
              type="button"
              onClick={() => onRowClick(r.key)}
              className="block w-full rounded-md px-1 py-0.5 text-left hover:bg-[var(--brand-primary-soft)]"
            >
              {inner}
            </button>
          ) : (
            <div key={r.key} className="px-1 py-0.5">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Grouped vertical bars: one group per day, up to 4 series                    */
/* --------------------------------------------------------------------------- */

export function DayBars({
  groups,
  series
}: {
  groups: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const H = 120;
  return (
    <div>
      <Legend items={series} />
      <div className="flex items-end gap-4" style={{ height: H + 24 }}>
        {groups.map((g) => (
          <div key={g.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: H }}>
              {g.values.map((v, i) => (
                <span
                  key={i}
                  className="w-3 rounded-t"
                  title={`${g.label} - ${series[i]?.label}: ${v}`}
                  style={{
                    backgroundColor: series[i]?.color,
                    height: `${(v / max) * 100}%`,
                    minHeight: v > 0 ? 3 : 1,
                    opacity: v > 0 ? 1 : 0.25
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] text-[var(--muted)]">{g.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Single-hue distribution bars (magnitude)                                    */
/* --------------------------------------------------------------------------- */

export function BucketBars({
  buckets,
  color = CHART.blue,
  labelClass = "w-24"
}: {
  buckets: { label: string; count: number }[];
  color?: string;
  /** Width class for the label column; widen it for long text labels. */
  labelClass?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-3" title={`${b.label}: ${b.count}`}>
          <span className={`${labelClass} shrink-0 truncate text-xs text-[var(--muted)]`}>
            {b.label}
          </span>
          <span className="relative h-5 flex-1 overflow-hidden rounded bg-[var(--background)]">
            <span
              className="absolute inset-y-0 left-0 rounded-r"
              style={{
                backgroundColor: color,
                width: `${(b.count / max) * 100}%`,
                minWidth: b.count > 0 ? 6 : 0
              }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--foreground)]">
            {b.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* Progress stat (e.g. fill rate)                                              */
/* --------------------------------------------------------------------------- */

export function ProgressStat({
  label,
  part,
  whole,
  color = CHART.teal
}: {
  label: string;
  part: number;
  whole: number;
  color?: string;
}) {
  const pct = whole ? Math.round((part / whole) * 100) : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-semibold tabular-nums text-[var(--foreground)]">
          {pct === null ? "-" : `${pct}%`}
          <span className="ml-1 text-xs font-normal text-[var(--muted)]">
            ({part} of {whole})
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
        <div
          className="h-full rounded-full"
          style={{ backgroundColor: color, width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
