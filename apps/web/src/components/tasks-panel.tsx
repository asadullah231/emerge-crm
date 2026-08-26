"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { Button, Input } from "@/components/form";
import type { NotableEntityType } from "@/lib/notes";
import { trpc } from "@/lib/trpc/client";

/** Is this task past its due date and still open? */
export function isOverdue(t: { dueAt: Date | null; status: string }): boolean {
  return t.status !== "done" && t.dueAt != null && t.dueAt.getTime() < Date.now();
}

/** Activity kinds (JP-08, Zoho To-Dos: Task / Event / Log a call). */
const TASK_KINDS = ["task", "event", "call"] as const;
type TaskKindValue = (typeof TASK_KINDS)[number];
const TASK_KIND_LABEL: Record<TaskKindValue, string> = {
  task: "Task",
  event: "Event",
  call: "Call"
};
const TASK_KIND_ICON: Record<TaskKindValue, string> = {
  task: "✓",
  event: "📅",
  call: "📞"
};

type StatusFilter = "all" | "open" | "closed";

/**
 * Task list for one record: complete via checkbox, add with an optional due
 * date and assignee, delete. Used on candidate/company/contact/job/application.
 */
export function TasksPanel({
  entityType,
  entityId,
  canWrite
}: {
  entityType: NotableEntityType;
  entityId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const list = trpc.tasks.byEntity.useQuery({ entityType, entityId });
  const members = trpc.members.list.useQuery();
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [kind, setKind] = useState<TaskKindValue>("task");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const refresh = () => utils.tasks.byEntity.invalidate({ entityType, entityId });
  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      setSubject("");
      setDueAt("");
      setAssigneeId("");
      refresh();
    }
  });
  const setDone = trpc.tasks.setDone.useMutation({ onSuccess: refresh });
  const remove = trpc.tasks.remove.useMutation({ onSuccess: refresh });

  const allRows = list.data ?? [];
  const rows = allRows.filter((t) =>
    statusFilter === "all"
      ? true
      : statusFilter === "open"
        ? t.status !== "done"
        : t.status === "done"
  );
  const add = () => {
    if (!subject.trim()) return;
    create.mutate({
      subject: subject.trim(),
      kind,
      dueAt: dueAt ? new Date(dueAt) : null,
      assigneeId: assigneeId || null,
      entityType,
      entityId
    });
  };

  return (
    <div className="space-y-3">
      {allRows.length > 0 ? (
        <div className="flex gap-1.5">
          {(["all", "open", "closed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs capitalize",
                statusFilter === f
                  ? "border-[var(--brand-secondary)] bg-[var(--brand-secondary-soft)] text-[var(--brand-secondary)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {allRows.length === 0 ? "No tasks yet." : "Nothing matches this filter."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={t.status === "done"}
                disabled={!canWrite || setDone.isPending}
                onChange={(e) => setDone.mutate({ id: t.id, done: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
              />
              <div className="min-w-0 flex-1">
                <p className={cn(t.status === "done" && "text-[var(--muted)] line-through")}>
                  {t.kind !== "task" ? (
                    <span
                      className="mr-1.5 text-xs"
                      title={TASK_KIND_LABEL[t.kind as TaskKindValue]}
                    >
                      {TASK_KIND_ICON[t.kind as TaskKindValue]}
                    </span>
                  ) : null}
                  {t.subject}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {t.dueAt ? (
                    <span className={cn(isOverdue(t) && "font-medium text-red-600")}>
                      Due {new Date(t.dueAt).toLocaleDateString()}
                    </span>
                  ) : null}
                  {t.assigneeName ? `${t.dueAt ? " · " : ""}${t.assigneeName}` : ""}
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: t.id })}
                  aria-label="Delete task"
                  className="text-xs text-[var(--muted)] hover:text-red-600"
                >
                  &times;
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TaskKindValue)}
            aria-label="Activity kind"
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
          >
            {TASK_KINDS.map((k) => (
              <option key={k} value={k}>
                {TASK_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder={
              kind === "call"
                ? "Log a call..."
                : kind === "event"
                  ? "Add an event..."
                  : "Add a task..."
            }
            className="min-w-40 flex-1"
            aria-label="Task subject"
          />
          <Input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            aria-label="Due date"
            className="w-auto"
          />
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            aria-label="Assignee"
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm"
          >
            <option value="">Me</option>
            {(members.data ?? [])
              .filter((m) => !m.deactivatedAt)
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
          </select>
          <Button onClick={add} disabled={create.isPending || !subject.trim()}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
