"use client";

import { STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import type { NotableEntityType } from "@/lib/notes";
import { relativeTime } from "@/lib/time";
import { trpc } from "@/lib/trpc/client";

function titleCase(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ACTION_VERB: Record<string, string> = {
  created: "created this record",
  updated: "updated",
  deleted: "moved to trash",
  restored: "restored from trash",
  status_changed: "changed the status",
  stage_changed: "moved stage"
};

/** Turn a raw audit action + meta into a human sentence. */
function auditLabel(action: string, meta: Record<string, unknown> | null | undefined): string {
  const verb = action.split(".").slice(1).join(".");
  if (verb === "updated" && meta && Array.isArray((meta as { fields?: string[] }).fields)) {
    const fields = (meta as { fields: string[] }).fields.map((f) => titleCase(f));
    return `updated ${fields.join(", ")}`;
  }
  if (verb === "status_changed" && meta && (meta as { status?: string }).status) {
    return `changed status to ${titleCase(String((meta as { status: string }).status))}`;
  }
  return ACTION_VERB[verb] ?? titleCase(verb);
}

const KIND_DOT: Record<string, string> = {
  note: "bg-[var(--brand-secondary)]",
  status: "bg-[var(--brand-primary)]",
  audit: "bg-[var(--muted)]"
};

/** Reusable Timeline tab: the record's activity, newest first. */
export function TimelinePanel({
  entityType,
  entityId
}: {
  entityType: NotableEntityType;
  entityId: string;
}) {
  const timeline = trpc.timeline.forRecord.useQuery({ entityType, entityId });

  if (timeline.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading activity...</p>;
  }
  if (!timeline.data || timeline.data.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {timeline.data.map((e) => {
        let text: React.ReactNode;
        if (e.kind === "note") {
          const snippet = (e.body ?? "").split("\n")[0]!.slice(0, 120);
          text = (
            <>
              added a note: <span className="text-[var(--muted)]">{snippet}</span>
            </>
          );
        } else if (e.kind === "status") {
          const stage = STAGE_LABELS[(e.toStage ?? "") as ApplicationStageKey] ?? e.toStage;
          text = (
            <>
              moved to <span className="font-medium">{stage}</span>
              {e.toStatusKey ? (
                <span className="text-[var(--muted)]"> ({titleCase(e.toStatusKey)})</span>
              ) : null}
            </>
          );
        } else {
          text = auditLabel(e.action ?? "", e.meta);
        }
        return (
          <li key={`${e.kind}-${e.id}`} className="flex gap-3 text-sm">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[e.kind] ?? "bg-[var(--muted)]"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{e.actorName ?? "System"}</span> {text}
            </div>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {relativeTime(e.createdAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
