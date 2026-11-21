"use client";

/*
 * Recharts building blocks for the Bullhorn-style dashboard cards. Every chart
 * fills its card (the parent sets the height) and shows a hover tooltip.
 * Palette follows the report charts (fixed order, CVD-checked): blue, teal,
 * amber, purple; extra categories fold into a gray "Other". Text uses ink
 * tokens, never the series color.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CHART } from "@/components/report-charts";

export const SERIES = [CHART.blue, CHART.teal, CHART.amber, CHART.purple] as const;
export const OTHER = "#a1a1aa";

const AXIS = { fontSize: 10, fill: "var(--muted)" } as const;
const GRID = { stroke: "var(--border)", strokeDasharray: "3 3", vertical: false } as const;

/* ------------------------------------------------------------------------- */
/* Tooltip                                                                   */
/* ------------------------------------------------------------------------- */

type TipItem = { name?: string | number; value?: unknown; color?: string };

function Tip({
  active,
  label,
  payload,
  format
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly TipItem[];
  format?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] shadow-md">
      {label != null && label !== "" ? (
        <p className="mb-0.5 font-medium text-[var(--foreground)]">{label}</p>
      ) : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[var(--muted)]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{" "}
          <span className="font-medium tabular-nums text-[var(--foreground)]">
            {p.value == null
              ? "-"
              : format && typeof p.value === "number"
                ? format(p.value)
                : String(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Time series (area or line), fills the parent                              */
/* ------------------------------------------------------------------------- */

export type Series = { key: string; label: string; color: string };

export function TimeChart({
  data,
  series,
  area,
  format
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
  area?: boolean;
  format?: (v: number) => string;
}) {
  const axes = [
    <CartesianGrid key="g" {...GRID} />,
    <XAxis
      key="x"
      dataKey="x"
      tick={AXIS}
      tickLine={false}
      axisLine={false}
      interval="preserveStartEnd"
      minTickGap={12}
    />,
    <YAxis
      key="y"
      tick={AXIS}
      tickLine={false}
      axisLine={false}
      width={32}
      allowDecimals={false}
      tickFormatter={format ? (v: number) => format(v) : undefined}
    />,
    <Tooltip
      key="t"
      content={<Tip format={format} />}
      cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
    />
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      {area ? (
        <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          {axes}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#fill-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          {axes}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------------- */
/* Bars                                                                      */
/* ------------------------------------------------------------------------- */

export type BarRow = { label: string; count: number; href?: string };

/** Vertical bars for a handful of ordered buckets (e.g. Jobs by Age). */
export function ColumnChart({
  rows,
  color = CHART.blue,
  name = "Count"
}: {
  rows: BarRow[];
  color?: string;
  name?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={26} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "var(--background)" }} />
        <Bar
          dataKey="count"
          name={name}
          fill={color}
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          label={{ position: "top", fontSize: 10, fill: "var(--foreground)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranked bars (owners, companies), top 8. */
export function RankChart({
  rows,
  color = CHART.teal,
  name = "Count"
}: {
  rows: BarRow[];
  color?: string;
  name?: string;
}) {
  const router = useRouter();
  const top = rows.slice(0, 8);
  const go = (d: unknown) => {
    const href = (d as { payload?: BarRow } | undefined)?.payload?.href;
    if (href) router.push(href);
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={104}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}...` : v)}
        />
        <Tooltip content={<Tip />} cursor={{ fill: "var(--background)" }} />
        <Bar
          dataKey="count"
          name={name}
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={16}
          cursor={top.some((r) => r.href) ? "pointer" : undefined}
          onClick={go}
          label={{ position: "right", fontSize: 10, fill: "var(--foreground)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grouped vertical bars, two or more series per person. */
export function GroupedColumns({
  data,
  series
}: {
  data: Record<string, string | number>[];
  series: Series[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="x"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v: string) => v.split(" ")[0] ?? v}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={24} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "var(--background)" }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            label={{ position: "top", fontSize: 9, fill: "var(--muted)" }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------------- */
/* Donuts                                                                    */
/* ------------------------------------------------------------------------- */

export type Slice = { label: string; value: number; href?: string };

/** Top 4 slices keep their palette color; the rest fold into "Other". */
export function foldSlices(rows: Slice[]): (Slice & { color: string })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 4).map((s, i) => ({ ...s, color: SERIES[i]! }));
  const rest = sorted.slice(4).reduce((a, s) => a + s.value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest, color: OTHER }] : top;
}

/** Donut with the total in the middle and a labelled legend beside it. */
export function DonutChart({ slices }: { slices: (Slice & { color: string })[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative aspect-square w-[42%] max-w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="60%"
              outerRadius="95%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-[var(--foreground)]">
            {total}
          </span>
          <span className="text-[10px] text-[var(--muted)]">total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            {s.href ? (
              <Link
                href={s.href}
                className="min-w-0 flex-1 truncate text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
              >
                {s.label}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[var(--foreground)]">{s.label}</span>
            )}
            <span className="tabular-nums text-[var(--foreground)]">{s.value}</span>
            <span className="w-9 text-right text-[10px] tabular-nums text-[var(--muted)]">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Single-value gauge ring with the percentage in the middle. */
export function Gauge({
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
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  const data = [
    { k: "v", v: pct },
    { k: "r", v: 1 - pct }
  ];
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="relative h-[64px] w-[64px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="v"
              innerRadius={22}
              outerRadius={29}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={color} />
              <Cell fill="var(--border)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tabular-nums text-[var(--foreground)]">
          {fmtPct(value)}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {label}
        </p>
        {sub ? <p className="text-[11px] leading-tight text-[var(--muted)]">{sub}</p> : null}
      </div>
    </div>
  );
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  const p = v * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

/* ------------------------------------------------------------------------- */
/* Tables, switches, labels                                                  */
/* ------------------------------------------------------------------------- */

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
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
          <th className="pb-1.5 font-medium">{head[0]}</th>
          <th className="w-20 pb-1.5 text-right font-medium">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-[var(--border)]/50 last:border-0">
            <td className="truncate py-1.5 pr-2 text-[var(--foreground)]">{r.label}</td>
            <td className="py-1.5 text-right tabular-nums">
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

/** Compact Week / Month / Year segmented switch for time charts. */
export function GranularitySwitch({
  value,
  onChange
}: {
  value: "week" | "month" | "year";
  onChange: (v: "week" | "month" | "year") => void;
}) {
  const opts = ["week", "month", "year"] as const;
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] p-0.5 text-[10px]">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={`rounded px-1.5 py-0.5 ${o === value ? "bg-[var(--brand-primary)] font-medium text-white" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
        >
          {o[0]!.toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  );
}

export function CardEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--muted)]">
      {children}
    </div>
  );
}

export function bucketLabel(d: Date | string, g: "week" | "month" | "year"): string {
  const x = new Date(d);
  if (g === "year") return String(x.getFullYear());
  if (g === "month") return x.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return x.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
