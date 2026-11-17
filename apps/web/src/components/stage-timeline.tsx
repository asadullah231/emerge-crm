"use client";

import { Badge } from "@/components/ui/badge";
import { STAGE_DOT, STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";

const DAY_MS = 24 * 60 * 60 * 1000;

type HistoryRow = {
  id: string;
  fromStatusKey: string | null;
  toStatusKey: string;
  fromStage: ApplicationStageKey | null;
  toStage: ApplicationStageKey;
  note: string | null;
  createdAt: Date | string;
  actorName: string | null;
};

function days(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function fmtDays(n: number): string {
  return n < 1 ? "<1d" : `${n}d`;
}

function fmtWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Visual stage timeline for an application: every transition with its exact
 * timestamp, who moved it, and how long the application sat in each stage.
 * The header answers the daily question directly: how long in the current
 * stage, and (for submitted) how long the client has been quiet.
 */
export function StageTimeline({
  history,
  currentStage,
  stageEnteredAt
}: {
  history: HistoryRow[];
  currentStage: ApplicationStageKey;
  stageEnteredAt: Date | string | null;
}) {
  const now = new Date();
  const rows = [...history]
    .map((h) => ({ ...h, at: new Date(h.createdAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const inStageDays = stageEnteredAt ? days(new Date(stageEnteredAt), now) : null;
  const waitingOnClient = currentStage === "submitted" && inStageDays != null;

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No transitions yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          In {STAGE_LABELS[currentStage]} for {inStageDays == null ? "-" : fmtDays(inStageDays)}
        </Badge>
        {waitingOnClient ? (
          <Badge variant={inStageDays >= 3 ? "destructive" : "success"}>
            {inStageDays >= 3
              ? `Waiting on client feedback for ${fmtDays(inStageDays)}`
              : "With the client"}
          </Badge>
        ) : null}
      </div>

      <ol className="relative ml-1.5 space-y-0 border-l border-[var(--border)]">
        {rows.map((h, i) => {
          const next = rows[i + 1];
          const stayed = days(h.at, next ? next.at : now);
          const isLast = !next;
          return (
            <li key={h.id} className="relative pb-4 pl-5 last:pb-0">
              <span
                className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--card)] ${STAGE_DOT[h.toStage]}`}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{STAGE_LABELS[h.toStage]}</span>
                {h.toStatusKey && h.toStatusKey !== h.toStage ? (
                  <span className="text-xs text-[var(--muted)]">{h.toStatusKey}</span>
                ) : null}
                <span className="text-xs tabular-nums text-[var(--muted)]">{fmtWhen(h.at)}</span>
                {h.actorName ? (
                  <span className="text-xs text-[var(--muted)]">by {h.actorName}</span>
                ) : null}
                <span className="text-xs tabular-nums text-[var(--muted)]">
                  · {fmtDays(stayed)} {isLast ? "here so far" : "in this stage"}
                </span>
              </div>
              {h.note ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]" title={h.note}>
                  {h.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
