"use client";

import { cn } from "@emerge/ui";
import { Button } from "@/components/form";

export type SortState = { by: string; dir: "asc" | "desc" };

export type DataTableColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
};

export type DataTableSelection = {
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  /** Toggle every row on the current page. `checked` = select (true) or clear (false). */
  onTogglePage: (ids: string[], checked: boolean) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  sort,
  onSortChange,
  onPageChange,
  onRowClick,
  isLoading,
  emptyMessage = "No records found.",
  selection
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  /** When set, a checkbox column is rendered for row selection. */
  selection?: DataTableSelection;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const colSpan = columns.length + (selection ? 1 : 0);

  const pageIds = rows.map(rowKey);
  const allOnPageSelected =
    selection != null && pageIds.length > 0 && pageIds.every((id) => selection.selectedIds.has(id));

  const toggleSort = (key: string) => {
    if (sort.by === key) {
      onSortChange({ by: key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ by: key, dir: "asc" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              {selection ? (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allOnPageSelected}
                    onChange={(e) => selection.onTogglePage(pageIds, e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                  />
                </th>
              ) : null}
              {columns.map((col) => (
                <th key={col.key} className={cn("px-3 py-2 font-medium", col.className)}>
                  {col.sortable ? (
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
                    >
                      {col.header}
                      {sort.by === col.key ? (
                        <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-[var(--muted)]">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-[var(--muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const selected = selection?.selectedIds.has(id) ?? false;
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-[var(--border)] last:border-0",
                      onRowClick && "cursor-pointer hover:bg-[var(--background)]",
                      selected && "bg-[var(--brand-primary-soft)]"
                    )}
                  >
                    {selection ? (
                      <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selected}
                          onChange={() => selection.onToggleRow(id)}
                          className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)]"
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-3 py-2", col.className)}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-[var(--muted)]">
        <span>{total === 0 ? "0 records" : `${from}-${to} of ${total.toLocaleString()}`}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1.5"
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1.5"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
