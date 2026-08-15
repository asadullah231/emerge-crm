"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

export type TaggableType = "company" | "contact" | "candidate" | "job";

type Tag = { id: string; name: string; color: string | null };

/** Preset colours offered when creating a tag; keys are stored in the DB. */
export const TAG_COLORS: { key: string; label: string; chip: string; dot: string }[] = [
  {
    key: "slate",
    label: "Slate",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-500"
  },
  {
    key: "blue",
    label: "Blue",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    dot: "bg-blue-500"
  },
  {
    key: "green",
    label: "Green",
    chip: "bg-green-500/10 text-green-600 dark:text-green-300",
    dot: "bg-green-500"
  },
  {
    key: "amber",
    label: "Amber",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500"
  },
  {
    key: "red",
    label: "Red",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    dot: "bg-red-500"
  },
  {
    key: "purple",
    label: "Purple",
    chip: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
    dot: "bg-purple-500"
  },
  {
    key: "teal",
    label: "Teal",
    chip: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
    dot: "bg-teal-500"
  }
];

const NEUTRAL_CHIP = "bg-[var(--muted)]/10 text-[var(--foreground)]";

export function tagChipClass(color: string | null): string {
  return TAG_COLORS.find((c) => c.key === color)?.chip ?? NEUTRAL_CHIP;
}

/**
 * Filter bar of the workspace's tags. Clicking a chip toggles it in `selected`
 * (record must carry every selected tag). Renders nothing until at least one
 * tag exists, so untagged workspaces see no clutter.
 */
export function TagFilter({
  selected,
  onChange
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const all = trpc.tags.list.useQuery();
  const tags = all.data ?? [];
  if (tags.length === 0) return null;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--muted)]">Tags</span>
      {tags.map((t) => {
        const on = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${tagChipClass(t.color)} ${
              on ? "ring-2 ring-[var(--accent)]" : "opacity-70 hover:opacity-100"
            }`}
          >
            {t.name}
          </button>
        );
      })}
      {selected.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

/**
 * Tag composer for a single record. Shows current tags as removable chips and a
 * picker to attach existing tags or create a new one. Backed by tags.setForEntity
 * (replaces the full set) and tags.create. Read-only users see chips only.
 */
export function TagEditor({
  entityType,
  entityId,
  tags,
  canWrite,
  onChanged
}: {
  entityType: TaggableType;
  entityId: string;
  tags: Tag[];
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [current, setCurrent] = useState<Tag[]>(tags);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[1]!.key);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep in sync when the parent refetches the record.
  useEffect(() => setCurrent(tags), [tags]);

  const all = trpc.tags.list.useQuery(undefined, { enabled: open });

  const setForEntity = trpc.tags.setForEntity.useMutation({
    onSuccess: (next) => {
      setCurrent(next);
      void utils.tags.list.invalidate();
      onChanged?.();
    }
  });
  const create = trpc.tags.create.useMutation();

  // Close the picker on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedIds = useMemo(() => new Set(current.map((t) => t.id)), [current]);

  const commit = (ids: string[]) => setForEntity.mutate({ entityType, entityId, tagIds: ids });

  const toggle = (tag: Tag) => {
    const next = selectedIds.has(tag.id)
      ? current.filter((t) => t.id !== tag.id).map((t) => t.id)
      : [...current.map((t) => t.id), tag.id];
    commit(next);
  };

  const remove = (tagId: string) => commit(current.filter((t) => t.id !== tagId).map((t) => t.id));

  const trimmed = query.trim();
  const options = (all.data ?? []).filter((t) =>
    trimmed ? t.name.toLowerCase().includes(trimmed.toLowerCase()) : true
  );
  const exactExists = (all.data ?? []).some((t) => t.name.toLowerCase() === trimmed.toLowerCase());

  const createAndAttach = async () => {
    if (!trimmed) return;
    try {
      const created = await create.mutateAsync({ name: trimmed, color: newColor });
      setQuery("");
      commit([...current.map((t) => t.id), created.id]);
    } catch {
      // create.error surfaces below (e.g. duplicate name race)
    }
  };

  const busy = setForEntity.isPending || create.isPending;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {current.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">No tags yet.</span>
        ) : (
          current.map((t) => (
            <span
              key={t.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tagChipClass(t.color)}`}
            >
              {t.name}
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  aria-label={`Remove ${t.name}`}
                  className="ml-0.5 leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
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
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          >
            + Add tag
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create..."
            className="w-full border-b border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            {options.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--background)] disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 flex-none rounded-full ${
                      TAG_COLORS.find((c) => c.key === t.color)?.dot ?? "bg-[var(--muted)]"
                    }`}
                  />
                  <span className="truncate">{t.name}</span>
                </span>
                {selectedIds.has(t.id) ? (
                  <span className="flex-none text-[var(--accent)]">&check;</span>
                ) : null}
              </button>
            ))}
            {options.length === 0 && !trimmed ? (
              <p className="px-3 py-2 text-xs text-[var(--muted)]">
                No tags yet. Type to create one.
              </p>
            ) : null}
          </div>

          {trimmed && !exactExists ? (
            <div className="border-t border-[var(--border)] p-2">
              <div className="mb-2 flex items-center gap-1.5 px-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setNewColor(c.key)}
                    aria-label={c.label}
                    className={`h-4 w-4 rounded-full ${c.dot} ${
                      newColor === c.key
                        ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]"
                        : ""
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={createAndAttach}
                disabled={busy}
                className="w-full rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-left text-sm font-medium text-[var(--brand-on)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
              >
                Create &ldquo;{trimmed}&rdquo;
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {setForEntity.error || create.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {setForEntity.error?.message ?? create.error?.message}
        </p>
      ) : null}
    </div>
  );
}
