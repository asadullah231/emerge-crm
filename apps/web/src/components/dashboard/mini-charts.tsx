"use client";

/*
 * Small SVG charts for Bullhorn-style dashboard cards. Palette follows the
 * report charts (fixed order, CVD-checked): blue, teal, amber, purple; extra
 * categories fold into a gray "Other". Values and labels use ink tokens; every
 * chart sits next to its numbers so color is never the only signal.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CHART } from "@/components/report-charts";

export const SERIES = [CHART.blue, CHART.teal, CHART.amber, CHART.purple] as const;
export const OTHER = "#a1a1aa";

/* ------------------------------------------------------------------------- */
/* Donut gauge (Success Rates: fill ratio / hit ratio)                       */
/* ------------------------------------------------------------------------- */

export function Donut({
  value,
  color,
  label,
  sub
}: {
  value: number | null;
  color: string;
  label: string;
  sub?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        role="img"
        aria-label={`${label} ${fmtPct(value)}`}
      >
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`}
          transform="rotate(-90 36 36)"
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          className="fill-[var(--foreground)] text-[13px] font-semibold tabular-nums"
        >
          {fmtPct(value)}
        </text>
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {sub ? <span className="text-[11px] text-[var(--muted)]">{sub}</span> : null}
    </div>
  );
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  const p = v * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

/* ------------------------------------------------------------------------- */
/* Line / area chart with hover tooltip                                      */
/* ------------------------------------------------------------------------- */

export type LineSeries = { label: string; color: string; values: (number | null)[] };

export function LineChart({
  series,
  xLabels,
  area,
  height = 130,
  format = (v) => String(v)
}: {
  series: LineSeries[];
  xLabels: string[];
  area?: boolean;
  height?: number;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = height;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  const n = xLabels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = Math.max(1, ...all);
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={pad.l - 4}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-[var(--muted)] text-[9px]"
            >
              {format(Math.round(t * 10) / 10)}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          (n - 1 - i) % every === 0 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 5}
              textAnchor="middle"
              className="fill-[var(--muted)] text-[9px]"
            >
              {l}
            </text>
          ) : null
        )}
        {series.map((s) => {
          const pts = s.values
            .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
            .filter((p): p is readonly [number, number] => p != null);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
          return (
            <g key={s.label}>
              {area && pts.length > 1 ? (
                <path
                  d={`${d} L${pts[pts.length - 1]![0]},${y(0)} L${pts[0]![0]},${y(0)} Z`}
                  fill={s.color}
                  opacity="0.15"
                />
              ) : null}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r="3"
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          );
        })}
        {hover != null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--muted)"
            strokeDasharray="3 3"
          />
        ) : null}
        {xLabels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - pad.l - pad.r) / Math.max(1, n - 1) / 2}
            y={0}
            width={(W - pad.l - pad.r) / Math.max(1, n - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] shadow-sm">
          <p className="font-medium text-[var(--foreground)]">{xLabels[hover]}</p>
          {series.map((s) => (
            <p key={s.label} className="flex items-center gap-1.5 text-[var(--muted)]">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}:{" "}
              <span className="font-medium tabular-nums text-[var(--foreground)]">
                {s.values[hover] == null ? "-" : format(s.values[hover] as number)}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Pie with direct labels (Jobs by Required Skills)                          */
/* ------------------------------------------------------------------------- */

export type Slice = { label: string; value: number };

/** Top 4 slices keep their palette color; the rest fold into "Other". */
export function foldSlices(rows: Slice[]): (Slice & { color: string })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 4).map((s, i) => ({ ...s, color: SERIES[i]! }));
  const rest = sorted.slice(4).reduce((a, s) => a + s.value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest, color: OTHER }] : top;
}

export function PieChart({ slices }: { slices: (Slice & { color: string })[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const R = 52;
  return (
    <div className="flex items-center gap-4">
      <svg
        width="124"
        height="124"
        viewBox="-62 -62 124 124"
        role="img"
        aria-label="Pie chart"
        className="shrink-0"
      >
        {slices.map((s) => {
          const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2;
          acc += s.value;
          const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
          if (slices.length === 1) return <circle key={s.label} r={R} fill={s.color} />;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = `M0,0 L${R * Math.cos(a0)},${R * Math.sin(a0)} A${R},${R} 0 ${large} 1 ${R * Math.cos(a1)},${R * Math.sin(a1)} Z`;
          return <path key={s.label} d={d} fill={s.color} stroke="var(--card)" strokeWidth="2" />;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{s.label}</span>
            <span className="tabular-nums text-[var(--muted)]">
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Horizontal bar list (status / owner / company counts)                     */
/* ------------------------------------------------------------------------- */

export type BarRow = { label: string; count: number; href?: string };

export function BarList({
  rows,
  color = CHART.blue,
  unit
}: {
  rows: BarRow[];
  color?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-[var(--foreground)]">{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums text-[var(--foreground)]">
                {r.count}
                {unit ? (
                  <span className="ml-0.5 font-normal text-[var(--muted)]">{unit}</span>
                ) : null}
              </span>
            </span>
            <span className="mt-1 block h-1.5 w-full rounded-full bg-[var(--border)]/60">
              <span
                className="block h-1.5 rounded-full"
                style={{ width: `${Math.max(2, (r.count / max) * 100)}%`, background: color }}
              />
            </span>
          </>
        );
        return (
          <li key={r.label}>
            {r.href ? (
              <Link href={r.href} className="block rounded hover:bg-[var(--background)]">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Bullhorn-style status table: label + clickable number + total row. */
export function CountTable({
  rows,
  head,
  total = true
}: {
  rows: BarRow[];
  head: [string, string];
  total?: boolean;
}) {
  const sum = rows.reduce((a, r) => a + r.count, 0);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
          <th className="pb-1.5 font-medium">{head[0]}</th>
          <th className="pb-1.5 text-right font-medium">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="py-1 pr-2 text-[var(--foreground)]">{r.label}</td>
            <td className="py-1 text-right tabular-nums">
              {r.href ? (
                <Link href={r.href} className="font-medium text-[var(--accent)] hover:underline">
                  {r.count}
                </Link>
              ) : (
                <span className="font-medium text-[var(--foreground)]">{r.count}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      {total && rows.length > 1 ? (
        <tfoot>
          <tr className="border-t border-[var(--border)]">
            <td className="pt-1.5 text-[var(--muted)]">Total</td>
            <td className="pt-1.5 text-right font-semibold tabular-nums text-[var(--foreground)]">
              {sum}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/** "Graphing data by Week · Month · Year" switch under time charts. */
export function GranularitySwitch({
  value,
  onChange
}: {
  value: "week" | "month" | "year";
  onChange: (v: "week" | "month" | "year") => void;
}) {
  const opts = ["week", "month", "year"] as const;
  return (
    <p className="mt-1 text-center text-[11px] text-[var(--muted)]">
      Graphing data by{" "}
      {opts.map((o, i) => (
        <span key={o}>
          {i > 0 ? " · " : ""}
          <button
            type="button"
            onClick={() => onChange(o)}
            className={
              o === value
                ? "font-semibold text-[var(--foreground)]"
                : "text-[var(--accent)] hover:underline"
            }
          >
            {o[0]!.toUpperCase() + o.slice(1)}
          </button>
        </span>
      ))}
    </p>
  );
}

export function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-[var(--muted)]">{children}</p>;
}

export function bucketLabel(d: Date | string, g: "week" | "month" | "year"): string {
  const x = new Date(d);
  if (g === "year") return String(x.getFullYear());
  if (g === "month") return x.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
