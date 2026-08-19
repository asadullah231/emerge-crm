"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/form";
import { TAG_COLORS, type TaggableType } from "@/components/tag-editor";

/**
 * Action bar shown when one or more list rows are selected. Handles bulk
 * tag-attach, soft-delete (or restore in trash), and CSV export of the
 * selection. Mutations run through the bulk router; the page passes onDone to
 * refetch and clear the selection.
 */
export function BulkBar({
  entityType,
  selectedIds,
  canWrite,
  showTrash,
  onClear,
  onDone,
  onExport,
  onMailMerge,
  extraActions
}: {
  entityType: TaggableType;
  selectedIds: string[];
  canWrite: boolean;
  showTrash: boolean;
  onClear: () => void;
  onDone: () => void;
  onExport: () => void;
  /** When provided, shows a "Mail merge" action (record types that can be emailed). */
  onMailMerge?: () => void;
  /** Entity-specific bulk actions rendered alongside the shared ones (M17b). */
  extraActions?: ReactNode;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);
  const tags = trpc.tags.list.useQuery(undefined, { enabled: tagOpen });

  const done = () => {
    onDone();
    onClear();
  };
  const softDelete = trpc.bulk.softDelete.useMutation({ onSuccess: done });
  const restore = trpc.bulk.restore.useMutation({ onSuccess: done });
  const addTag = trpc.bulk.addTag.useMutation({
    onSuccess: () => {
      setTagOpen(false);
      done();
    }
  });

  useEffect(() => {
    if (!tagOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [tagOpen]);

  if (selectedIds.length === 0) return null;
  const count = selectedIds.length;
  const busy = softDelete.isPending || restore.isPending || addTag.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--brand-primary)]/40 bg-[var(--brand-primary-soft)] px-3 py-2 text-sm">
      <span className="font-medium">{count} selected</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="outline" className="px-3 py-1.5" onClick={onExport}>
          Export CSV
        </Button>

        {canWrite && !showTrash ? extraActions : null}

        {canWrite && !showTrash && onMailMerge ? (
          <Button variant="outline" className="px-3 py-1.5" onClick={onMailMerge}>
            Mail merge
          </Button>
        ) : null}

        {canWrite && !showTrash ? (
          <div ref={tagRef} className="relative">
            <Button
              variant="outline"
              className="px-3 py-1.5"
              disabled={busy}
              onClick={() => setTagOpen((v) => !v)}
            >
              Add tag
            </Button>
            {tagOpen ? (
              <div className="absolute right-0 z-30 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl">
                {(tags.data ?? []).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--muted)]">
                    No tags yet. Create one on a record first.
                  </p>
                ) : (
                  (tags.data ?? []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        addTag.mutate({ type: entityType, ids: selectedIds, tagId: t.id })
                      }
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--background)] disabled:opacity-50"
                    >
                      <span
                        className={`h-2.5 w-2.5 flex-none rounded-full ${
                          TAG_COLORS.find((c) => c.key === t.color)?.dot ?? "bg-[var(--muted)]"
                        }`}
                      />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {canWrite && showTrash ? (
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={busy}
            onClick={() => restore.mutate({ type: entityType, ids: selectedIds })}
          >
            Restore
          </Button>
        ) : null}

        {canWrite && !showTrash ? (
          <Button
            variant="danger"
            className="px-3 py-1.5"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Move ${count} record(s) to trash? They can be restored for 30 days.`
                )
              ) {
                softDelete.mutate({ type: entityType, ids: selectedIds });
              }
            }}
          >
            Delete
          </Button>
        ) : null}

        <button
          type="button"
          onClick={onClear}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
