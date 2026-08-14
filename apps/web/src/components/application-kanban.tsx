"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@emerge/ui";
import {
  APPLICATION_STAGES,
  STAGE_ACCENT,
  STAGE_LABELS,
  type ApplicationStageKey
} from "@/lib/applications";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Board = RouterOutputs["applications"]["board"];
type Card = Board["columns"][string][number];

function daysInStage(since: string | Date): number {
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Application kanban: 7 stage columns with native HTML5 drag-and-drop. Dropping
 * a card into a column moves the application to that stage (dropping into
 * Rejected prompts for a reason). Read-only users see the board but cannot move.
 */
export function ApplicationKanban({
  jobId,
  canWrite,
  showJob = true
}: {
  jobId?: string;
  canWrite: boolean;
  showJob?: boolean;
}) {
  const utils = trpc.useUtils();
  const input = { jobId };
  const board = trpc.applications.board.useQuery(input);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

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
    onSettled: invalidate
  });

  const changeStatus = trpc.applications.changeStatus.useMutation({ onSettled: invalidate });

  const drop = (stage: ApplicationStageKey) => {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id || !canWrite) return;
    const card = findCard(board.data, id);
    if (!card || card.stage === stage) return;
    if (stage === "rejected") {
      const reason = window.prompt("Reason for rejection (optional):", "") ?? "";
      changeStatus.mutate({ id, statusKey: "rejected", rejectionReason: reason || null });
      return;
    }
    changeStage.mutate({ id, stage });
  };

  if (board.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading pipeline...</p>;
  }
  if (board.error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {board.error.message}
      </p>
    );
  }

  const columns = board.data?.columns ?? {};

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-3 pb-2">
        {APPLICATION_STAGES.map((stage) => {
          const cards = columns[stage] ?? [];
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
                "flex w-64 flex-col rounded-lg border bg-[var(--card)]",
                overStage === stage
                  ? "border-[var(--brand-secondary)] ring-1 ring-[var(--brand-secondary)]"
                  : "border-[var(--border)]"
              )}
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                <span className={cn("text-sm font-semibold", STAGE_ACCENT[stage])}>
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--muted)]">
                  {cards.length}
                </span>
              </div>
              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {cards.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    statusLabel={statusLabel(card.statusKey)}
                    canWrite={canWrite}
                    showJob={showJob}
                    onDragStart={() => setDragId(card.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                  />
                ))}
                {cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-[var(--muted)]">Empty</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  card,
  statusLabel,
  canWrite,
  showJob,
  onDragStart,
  onDragEnd
}: {
  card: Card;
  statusLabel: string;
  canWrite: boolean;
  showJob: boolean;
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
        "rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm",
        canWrite && "cursor-grab active:cursor-grabbing"
      )}
    >
      <Link
        href={`/applications/${card.id}`}
        className="font-medium hover:text-[var(--accent)] hover:underline"
      >
        {name}
      </Link>
      {card.candidateTitle ? (
        <p className="truncate text-xs text-[var(--muted)]">{card.candidateTitle}</p>
      ) : null}
      {showJob ? (
        <p className="mt-1 truncate text-xs text-[var(--muted)]">{card.jobTitle}</p>
      ) : null}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="rounded-full bg-[var(--brand-secondary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-secondary)]">
          {statusLabel}
        </span>
        <span className="text-[10px] text-[var(--muted)]">{days === 0 ? "today" : `${days}d`}</span>
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
