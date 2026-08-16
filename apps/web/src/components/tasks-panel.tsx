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

  const rows = list.data ?? [];
  const add = () => {
    if (!subject.trim()) return;
    create.mutate({
      subject: subject.trim(),
      dueAt: dueAt ? new Date(dueAt) : null,
      assigneeId: assigneeId || null,
      entityType,
      entityId
    });
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No tasks yet.</p>
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
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add a task..."
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
