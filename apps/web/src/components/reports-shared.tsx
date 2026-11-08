"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportPreset = "this_week" | "last_week" | "this_month" | "custom";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Local Monday 00:00 of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function pct(part: number, whole: number): string {
  if (!whole) return "-";
  return `${Math.round((part / whole) * 100)}%`;
}

// Red flags (Mo's spec): 30+ days live without a placement, or 7+ days since
// the client last received a submission. Shared by the position tracker and
// the dashboard so the two never disagree on what counts as stuck.
export const STALE_DAYS_LIVE = 30;
export const STALE_DAYS_SUBMISSION = 7;

export function isPositionFlagged(p: {
  daysLive: number;
  daysSinceLastSubmission: number | null;
  placements: number;
}): boolean {
  const noPlacementTooLong = p.daysLive >= STALE_DAYS_LIVE && p.placements === 0;
  const sinceSubmission = p.daysSinceLastSubmission ?? p.daysLive;
  return noPlacementTooLong || sinceSubmission >= STALE_DAYS_SUBMISSION;
}

/** Shared preset + custom-range state for every report page. */
export function useReportWindow() {
  const [preset, setPreset] = useState<ReportPreset>("this_week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "last_week") {
      const start = new Date(weekStart(now).getTime() - 7 * DAY_MS);
      return { from: start, to: endOfDay(new Date(start.getTime() + 6 * DAY_MS)) };
    }
    if (preset === "this_month") {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    }
    if (preset === "custom" && customFrom && customTo) {
      return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) };
    }
    const start = weekStart(now);
    return { from: start, to: endOfDay(new Date(start.getTime() + 6 * DAY_MS)) };
  }, [preset, customFrom, customTo]);

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, from, to };
}

export function ReportWindowPicker({ window }: { window: ReturnType<typeof useReportWindow> }) {
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo } = window;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          ["this_week", "This week"],
          ["last_week", "Last week"],
          ["this_month", "This month"],
          ["custom", "Custom"]
        ] as [ReportPreset, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setPreset(key)}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            preset === key
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {label}
        </button>
      ))}
      {preset === "custom" ? (
        <span className="flex items-center gap-1 text-sm">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          />
          <span className="text-[var(--muted)]">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
          />
        </span>
      ) : null}
    </div>
  );
}

const REPORT_TABS = [
  { href: "/reports/recruiters", label: "Recruiters" },
  { href: "/reports/account-managers", label: "Account managers" },
  { href: "/reports/positions", label: "Positions" },
  { href: "/reports/management", label: "Management" }
];

export function ReportsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-[var(--border)]">
      {REPORT_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            pathname === t.href
              ? "border-[var(--accent)] font-medium text-[var(--foreground)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function ReportCard({
  title,
  children,
  right
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export const TH = "px-2 py-1.5 text-left text-xs font-medium text-[var(--muted)]";
export const TD = "px-2 py-1.5 text-sm";
