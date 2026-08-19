"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@emerge/ui";
import {
  APPLICATION_STAGES,
  STAGE_DOT,
  STAGE_LABELS,
  type ApplicationStageKey
} from "@/lib/applications";
import { candidateName } from "@/components/new-candidate-modal";
import { Modal } from "@/components/modal";
import { StageChangeForm } from "@/components/stage-change-form";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Board = RouterOutputs["applications"]["board"];
type Card = Board["columns"][string][number];

function daysInStage(since: string | Date): number {
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Application kanban: 7 stage columns with native HTML5 drag-and-drop. Dropping
 * a card into a column opens a modal (M16) with the same fields as the record
 * page — optional comment with @mentions and a required rejection reason when
 * moving into Rejected. The optimistic move only commits after the modal is
 * confirmed. Read-only users see the board but cannot move cards.
 *
 * Visual design: columns are recessed surfaces (--surface-sunken) with a stage
 * dot + count header; cards are elevated on --card with an initials avatar,
 * status dot footer and quiet hover/drag states. All pipeline logic (drop,
 * optimistic move, edge auto-scroll) is unchanged.
 */
export function ApplicationKanban({
  jobId,
  canWrite,
  showJob = true,
  fill = false
}: {
  jobId?: string;
  canWrite: boolean;
  showJob?: boolean;
  /** true on the dedicated Pipeline page: the board stretches to the viewport. */
  fill?: boolean;
}) {
  const utils = trpc.useUtils();
  const input = { jobId };
  const board = trpc.applications.board.useQuery(input);
  const members = trpc.members.list.useQuery(undefined, { enabled: canWrite });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ card: Card; toStage: ApplicationStageKey } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // Edge auto-scroll while dragging: keep a rAF loop alive for the whole drag
  // and nudge the board horizontally / the hovered column vertically whenever
  // the cursor sits inside an edge band. Lets you drag Screening -> Archived in
  // one motion without letting go to scroll.
  useEffect(() => {
    if (!dragId) return;
    const EDGE = 64; // px band from an edge where scrolling kicks in
    const speed = (dist: number) => Math.min(20, Math.max(4, dist / 3));
    let raf = 0;

    const step = () => {
      const p = pointer.current;
      const board = boardRef.current;
      if (p && board) {
        const b = board.getBoundingClientRect();
        if (p.x < b.left + EDGE) board.scrollLeft -= speed(b.left + EDGE - p.x);
        else if (p.x > b.right - EDGE) board.scrollLeft += speed(p.x - (b.right - EDGE));

        const under = document.elementFromPoint(p.x, p.y);
        const col = under?.closest<HTMLElement>("[data-kanban-col]");
        if (col) {
          const c = col.getBoundingClientRect();
          if (p.y < c.top + EDGE) col.scrollTop -= speed(c.top + EDGE - p.y);
          else if (p.y > c.bottom - EDGE) col.scrollTop += speed(p.y - (c.bottom - EDGE));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      pointer.current = null;
    };
  }, [dragId]);

  const statusLabel = (key: string) =>
    board.data?.statuses.find((s) => s.key === key)?.label ?? key;

  const invalidate = () => utils.applications.board.invalidate(input);

  const changeStage = trpc.applications.changeStage.useMutation({
    onMutate: async ({ id, stage }) => {
      await utils.applications.board.cancel(input);
      const prev = utils.applications.board.getData(input);
      utils.applications.board.setData(input, (old) => moveCard(old, id, stage));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.applications.board.setData(input, ctx.prev);
    },
    onSuccess: () => {
      setPending(null);
    },
    onSettled: invalidate
  });

  const drop = (stage: ApplicationStageKey) => {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id || !canWrite) return;
    const card = findCard(board.data, id);
    if (!card || card.stage === stage) return;
    setPending({ card, toStage: stage });
  };

  if (board.isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {APPLICATION_STAGES.map((stage) => (
          <div
            key={stage}
            className="h-[480px] min-w-52 flex-1 animate-pulse rounded-xl bg-[var(--surface-sunken)]"
          />
        ))}
      </div>
    );
  }
  if (board.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {board.error.message}
      </p>
    );
  }

  const columns = board.data?.columns ?? {};
  const activeMembers = (members.data ?? [])
    .filter((m) => !m.deactivatedAt)
    .map((m) => ({ userId: m.userId, name: m.name }));

  return (
    <>
      <div
        ref={boardRef}
        className="kanban-scroll overflow-x-auto"
        onDragOver={(e) => {
          if (canWrite) pointer.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <div
          className={cn(
            "flex gap-4 pb-1",
            fill ? "h-[calc(100dvh-14rem)] min-h-[480px]" : "h-[65vh] min-h-[420px]"
          )}
        >
          {APPLICATION_STAGES.map((stage) => {
            const cards = columns[stage] ?? [];
            const isOver = overStage === stage;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  if (!canWrite) return;
                  e.preventDefault();
                  setOverStage(stage);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={() => drop(stage)}
                className={cn(
                  "flex min-w-52 flex-1 flex-col rounded-xl border transition-colors",
                  isOver
                    ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary-soft)]"
                    : "border-transparent bg-[var(--surface-sunken)]"
                )}
              >
                <div className="flex items-center gap-2 px-3 pb-2 pt-3">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage])}
                  />
                  <span className="truncate text-[13px] font-semibold tracking-tight">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="ml-auto rounded-md bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--muted)] shadow-xs">
                    {cards.length}
                  </span>
                </div>
                <div
                  data-kanban-col
                  className="kanban-scroll flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
                >
                  {cards.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      statusLabel={statusLabel(card.statusKey)}
                      canWrite={canWrite}
                      showJob={showJob}
                      isDragging={dragId === card.id}
                      onDragStart={() => setDragId(card.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverStage(null);
                      }}
                    />
                  ))}
                  {cards.length === 0 ? (
                    <div
                      className={cn(
                        "m-0.5 flex flex-1 items-center justify-center rounded-lg border border-dashed",
                        isOver ? "border-[var(--brand-secondary)]" : "border-[var(--border)]"
                      )}
                    >
                      <p className="text-xs text-[var(--muted)]">
                        {dragId ? "Drop here" : "No candidates"}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        title={
          pending
            ? `Move ${candidateName({
                firstName: pending.card.candidateFirstName,
                lastName: pending.card.candidateLastName
              })} to ${STAGE_LABELS[pending.toStage]}`
            : ""
        }
        open={Boolean(pending)}
        onClose={() => {
          if (!changeStage.isPending) setPending(null);
        }}
      >
        {pending ? (
          <StageChangeForm
            currentStage={pending.card.stage as ApplicationStageKey}
            defaultStage={pending.toStage}
            lockStage
            members={activeMembers}
            saving={changeStage.isPending}
            error={changeStage.error?.message ?? null}
            onCancel={() => setPending(null)}
            submitLabel="Move"
            onSubmit={(opts) =>
              changeStage.mutate({
                id: pending.card.id,
                stage: opts.stage,
                noteBody: opts.noteBody,
                mentionUserIds: opts.mentionUserIds,
                rejectionReason: opts.rejectionReason
              })
            }
          />
        ) : null}
      </Modal>
    </>
  );
}

function KanbanCard({
  card,
  statusLabel,
  canWrite,
  showJob,
  isDragging,
  onDragStart,
  onDragEnd
}: {
  card: Card;
  statusLabel: string;
  canWrite: boolean;
  showJob: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const name = candidateName({
    firstName: card.candidateFirstName,
    lastName: card.candidateLastName
  });
  const days = daysInStage(card.stageEnteredAt);
  return (
    <div
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-xs transition-all duration-150",
        canWrite && "cursor-grab hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[11px] font-semibold text-[var(--brand-primary)]"
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/applications/${card.id}`}
            className="block truncate text-[13px] font-semibold leading-tight hover:text-[var(--accent)] hover:underline"
          >
            {name}
          </Link>
          {card.candidateTitle ? (
            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{card.candidateTitle}</p>
          ) : null}
        </div>
      </div>
      {showJob ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            className="size-3 shrink-0"
          >
            <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" />
            <path d="M5.5 4.5v-1a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v1M1.5 8h13" />
          </svg>
          <span className="truncate">{card.jobTitle}</span>
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              STAGE_DOT[card.stage as ApplicationStageKey]
            )}
          />
          <span className="truncate">{statusLabel}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
          {days === 0 ? "today" : `${days}d`}
        </span>
      </div>
    </div>
  );
}

function findCard(board: Board | undefined, id: string): Card | undefined {
  if (!board) return undefined;
  for (const stage of APPLICATION_STAGES) {
    const found = (board.columns[stage] ?? []).find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Pure optimistic move of a card to another stage column. */
function moveCard(
  board: Board | undefined,
  id: string,
  stage: ApplicationStageKey
): Board | undefined {
  if (!board) return board;
  let moved: Card | undefined;
  const columns: Board["columns"] = {};
  for (const s of APPLICATION_STAGES) {
    columns[s] = (board.columns[s] ?? []).filter((c) => {
      if (c.id === id) {
        moved = c;
        return false;
      }
      return true;
    });
  }
  if (moved) columns[stage] = [{ ...moved, stage }, ...(columns[stage] ?? [])];
  return { ...board, columns };
}
