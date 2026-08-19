"use client";

import { useMemo, useState } from "react";
import { cn } from "@emerge/ui";
import { Button, FormError, Label } from "@/components/form";
import { MentionTextarea, type MentionMember } from "@/components/mention-textarea";
import { Modal } from "@/components/modal";
import { APPLICATION_STAGES, STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type AppRecord = RouterOutputs["applications"]["get"];
type StatusRow = RouterOutputs["applications"]["statuses"][number];

const DAY_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Hiring Pipeline tab on the application record (M17c, Mo's Zoho spec): stage
 * stepper with done/current/pending states and days-in-stage, a one-click
 * "Move to next status" action (comment + mentions + required rejection reason,
 * reusing the M16 changeStatus path), a per-status timeline with date ranges
 * and actors, and a related-list sidebar with counts that jumps to the matching
 * Overview section.
 */
export function HiringPipelineTab({
  record,
  statuses,
  members,
  canEdit,
  onNavigate
}: {
  record: AppRecord;
  statuses: StatusRow[];
  members: MentionMember[];
  canEdit: boolean;
  /** Jump to an Overview section (switches tab and scrolls). */
  onNavigate: (sectionId: string) => void;
}) {
  const utils = trpc.useUtils();
  const [moving, setMoving] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [mentions, setMentions] = useState<MentionMember[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");

  const counts = trpc.applications.relatedCounts.useQuery({ id: record.id });

  const changeStatus = trpc.applications.changeStatus.useMutation({
    onSuccess: () => {
      setMoving(false);
      setNoteBody("");
      setMentions([]);
      setRejectionReason("");
      utils.applications.get.invalidate({ id: record.id });
      utils.applications.relatedCounts.invalidate({ id: record.id });
      utils.applications.board.invalidate();
    }
  });

  const statusLabel = (key: string | null) =>
    statuses.find((s) => s.key === key)?.label ?? key ?? "";

  // Next status in the ordered dictionary; hidden on the last one.
  const nextStatus = useMemo(() => {
    const idx = statuses.findIndex((s) => s.key === record.statusKey);
    return idx >= 0 && idx + 1 < statuses.length ? statuses[idx + 1] : undefined;
  }, [statuses, record.statusKey]);
  const nextIsRejection = nextStatus?.stage === "rejected";

  const currentStageIdx = APPLICATION_STAGES.indexOf(record.stage as ApplicationStageKey);
  const daysInStage = daysBetween(new Date(record.stageEnteredAt), new Date());

  // Per-status intervals from the append-only history (already newest-first).
  const intervals = useMemo(() => {
    const h = record.history;
    return h.map((entry, i) => ({
      id: entry.id,
      statusKey: entry.toStatusKey,
      stage: entry.toStage,
      from: new Date(entry.createdAt),
      to: i === 0 ? null : new Date(h[i - 1]!.createdAt),
      actorName: entry.actorName,
      note: entry.note,
      isCurrent: i === 0
    }));
  }, [record.history]);

  const related = [
    { id: "section-notes", label: "Notes", count: counts.data?.notes },
    { id: "section-documents", label: "Documents", count: counts.data?.documents },
    { id: "section-interviews", label: "Interviews", count: counts.data?.interviews },
    { id: "section-submissions", label: "Client submissions", count: counts.data?.submissions },
    { id: "section-reviews", label: "Reviews", count: counts.data?.reviews },
    { id: "section-tasks", label: "To-dos", count: counts.data?.tasks },
    { id: "section-communication", label: "Emails", count: counts.data?.emails }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
      <aside className="h-fit rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
        <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Related lists
        </p>
        <ul>
          {related.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onNavigate(r.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-[var(--background)]"
              >
                <span>{r.label}</span>
                <span className="rounded-full bg-[var(--background)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--muted)]">
                  {r.count ?? "-"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <p className="text-sm font-semibold">
                {statusLabel(record.statusKey)}
                <span className="ml-2 rounded-full bg-[var(--brand-secondary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--brand-secondary)]">
                  Current status
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {daysInStage === 0 ? "Entered today" : `${daysInStage} day(s) in this stage`}
              </p>
            </div>
            {canEdit && nextStatus ? (
              <Button onClick={() => setMoving(true)}>
                Move to next status: {nextStatus.label}
              </Button>
            ) : null}
          </div>

          <ol className="flex items-center gap-0 overflow-x-auto pb-1">
            {APPLICATION_STAGES.map((stage, i) => {
              const done = i < currentStageIdx;
              const current = i === currentStageIdx;
              return (
                <li key={stage} className="flex min-w-0 flex-1 items-center">
                  <div className="flex min-w-0 flex-col items-center gap-1 px-1">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        done &&
                          "border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-[var(--brand-on)]",
                        current &&
                          "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on)]",
                        !done && !current && "border-[var(--border)] text-[var(--muted)]"
                      )}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span
                      className={cn(
                        "max-w-24 truncate text-center text-[11px]",
                        current ? "font-semibold" : "text-[var(--muted)]"
                      )}
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                  {i < APPLICATION_STAGES.length - 1 ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mx-0.5 mb-4 h-px flex-1",
                        i < currentStageIdx ? "bg-[var(--brand-secondary)]" : "bg-[var(--border)]"
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="pb-3 text-sm font-semibold">Status timeline</h3>
          {intervals.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No status changes yet.</p>
          ) : (
            <ol className="space-y-0">
              {intervals.map((iv, i) => (
                <li key={iv.id} className="relative flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-1 size-2.5 shrink-0 rounded-full",
                        iv.isCurrent ? "bg-[var(--brand-secondary)]" : "bg-[var(--border)]"
                      )}
                    />
                    {i < intervals.length - 1 ? (
                      <span aria-hidden className="w-px flex-1 bg-[var(--border)]" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-sm font-medium">
                      {statusLabel(iv.statusKey)}
                      {iv.isCurrent ? (
                        <span className="ml-2 rounded-full bg-[var(--brand-secondary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-secondary)]">
                          Current
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {fmtDate(iv.from)}
                      {" - "}
                      {iv.to ? fmtDate(iv.to) : "now"}
                      {" · "}
                      {daysBetween(iv.from, iv.to ?? new Date())} day(s)
                      {iv.actorName ? ` · by ${iv.actorName}` : ""}
                    </p>
                    {iv.note ? (
                      <p className="mt-1 rounded-md bg-[var(--background)] px-2 py-1 text-xs text-[var(--muted)]">
                        {iv.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <Modal
        title={nextStatus ? `Move to ${nextStatus.label}` : ""}
        open={moving}
        onClose={() => {
          if (!changeStatus.isPending) setMoving(false);
        }}
      >
        <div className="space-y-4">
          <FormError message={changeStatus.error?.message ?? undefined} />
          <p className="text-sm text-[var(--muted)]">
            {statusLabel(record.statusKey)} {"→"} <strong>{nextStatus?.label}</strong>
          </p>
          <div>
            <Label htmlFor="pipeline-comment">Comment (optional)</Label>
            <MentionTextarea
              value={noteBody}
              onChange={setNoteBody}
              members={members}
              onMentionsChange={setMentions}
            />
          </div>
          {nextIsRejection ? (
            <div>
              <Label htmlFor="pipeline-reject">Rejection reason (required)</Label>
              <textarea
                id="pipeline-reject"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setMoving(false)}
              disabled={changeStatus.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={changeStatus.isPending || (nextIsRejection && !rejectionReason.trim())}
              onClick={() => {
                if (!nextStatus) return;
                changeStatus.mutate({
                  id: record.id,
                  statusKey: nextStatus.key,
                  noteBody: noteBody.trim() || undefined,
                  mentionUserIds: mentions.map((m) => m.userId),
                  rejectionReason: nextIsRejection ? rejectionReason.trim() : undefined
                });
              }}
            >
              {changeStatus.isPending ? "Moving..." : "Move"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
