"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@emerge/ui";
import { Button, FormError, Input } from "@/components/form";
import { isOverdue } from "@/components/tasks-panel";
import { ENTITY_META, type NotableEntityType } from "@/lib/notes";
import { trpc } from "@/lib/trpc/client";

/** My-tasks list; lives on the Tasks page alongside Reports and Activity. */
export function TasksView() {
  const utils = trpc.useUtils();
  const [includeDone, setIncludeDone] = useState(false);
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState("");

  const list = trpc.tasks.mine.useQuery({ includeDone });
  const refresh = () => utils.tasks.mine.invalidate();
  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      setSubject("");
      setDueAt("");
      refresh();
    }
  });
  const setDone = trpc.tasks.setDone.useMutation({ onSuccess: refresh });
  const remove = trpc.tasks.remove.useMutation({ onSuccess: refresh });

  const rows = list.data ?? [];
  const add = () => {
    if (!subject.trim()) return;
    create.mutate({ subject: subject.trim(), dueAt: dueAt ? new Date(dueAt) : null });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My tasks</h1>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={includeDone}
            onChange={(e) => setIncludeDone(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand-primary)]"
          />
          Show completed
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a task for yourself..."
          className="min-w-48 flex-1"
          aria-label="Task subject"
        />
        <Input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          aria-label="Due date"
          className="w-auto"
        />
        <Button onClick={add} disabled={create.isPending || !subject.trim()}>
          Add
        </Button>
      </div>

      <FormError message={list.error?.message} />

      {list.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          Nothing on your list. Add a task above or from any record.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {rows.map((t) => {
            const meta = t.entityType ? ENTITY_META[t.entityType as NotableEntityType] : null;
            return (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  disabled={setDone.isPending}
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
                    {meta && t.entityId ? (
                      <>
                        {t.dueAt ? " · " : ""}
                        <Link
                          href={`${meta.path}/${t.entityId}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {meta.label}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: t.id })}
                  aria-label="Delete task"
                  className="text-xs text-[var(--muted)] hover:text-red-600"
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
