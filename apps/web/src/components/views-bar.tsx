"use client";

import { trpc } from "@/lib/trpc/client";
import type { TaggableType } from "@/components/tag-editor";

/** Client mirror of the server viewFiltersSchema payload. */
export type ViewFilters = {
  search?: string;
  tagIds?: string[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
  fields?: Record<string, string>;
};

/**
 * Saved-view bar for a list page. Shows the workspace's saved views as chips
 * (click to apply), lets a writer save the current filters as a named view, and
 * delete views. Views are shared across the workspace.
 */
export function ViewsBar({
  entityType,
  current,
  canWrite,
  onApply
}: {
  entityType: TaggableType;
  current: ViewFilters;
  canWrite: boolean;
  onApply: (filters: ViewFilters) => void;
}) {
  const utils = trpc.useUtils();
  const views = trpc.views.list.useQuery({ entityType });
  const create = trpc.views.create.useMutation({
    onSuccess: () => utils.views.list.invalidate({ entityType })
  });
  const remove = trpc.views.delete.useMutation({
    onSuccess: () => utils.views.list.invalidate({ entityType })
  });

  const saveCurrent = () => {
    const name = window.prompt("Save current filters as a view. Name:")?.trim();
    if (!name) return;
    create.mutate({ entityType, name, filters: current });
  };

  const rows = views.data ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--muted)]">Views</span>
      {rows.length === 0 ? (
        <span className="text-xs text-[var(--muted)]">None saved</span>
      ) : (
        rows.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => onApply((v.filters ?? {}) as ViewFilters)}
              className="hover:text-[var(--accent)]"
            >
              {v.name}
            </button>
            {canWrite ? (
              <button
                type="button"
                aria-label={`Delete view ${v.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete the "${v.name}" view?`)) remove.mutate({ id: v.id });
                }}
                className="leading-none opacity-50 hover:opacity-100"
              >
                &times;
              </button>
            ) : null}
          </span>
        ))
      )}
      {canWrite ? (
        <button
          type="button"
          onClick={saveCurrent}
          disabled={create.isPending}
          className="inline-flex items-center rounded-full border border-dashed border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50"
        >
          + Save view
        </button>
      ) : null}
      {create.error ? <span className="text-xs text-red-600">{create.error.message}</span> : null}
    </div>
  );
}

/** Small labelled dropdown for a single structured field filter. */
export function FieldFilter({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
