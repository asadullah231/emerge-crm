"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@emerge/ui";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { BulkBar } from "@/components/bulk-bar";
import { CandidatesBulkActions } from "@/components/candidates-bulk-actions";
import { MailMergeModal } from "@/components/mail-merge-modal";
import { Button, FormError, Input } from "@/components/form";
import { NewCandidateModal, candidateName } from "@/components/new-candidate-modal";
import { CANDIDATE_SOURCE_OPTIONS, SourceBadge } from "@/components/record";
import { SkillChips } from "@/components/skill-chips";
import { TagFilter } from "@/components/tag-editor";
import { ViewsBar, FieldFilter, type ViewFilters } from "@/components/views-bar";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";
import { useRowSelection } from "@/lib/use-row-selection";

type CandidateRow = RouterOutputs["candidates"]["list"]["rows"][number];

/** Structured candidate list filters (CP-03). All optional; "" means off. */
type CandidateFilters = {
  source: string;
  ownerId: string;
  isBlocked: boolean;
  recent: boolean;
};

const EMPTY_FILTERS: CandidateFilters = {
  source: "",
  ownerId: "",
  isBlocked: false,
  recent: false
};

const RECENT_DAYS = 30;

/** Optional columns the chooser can hide (CP-02); key must match `columns`. */
const CHOOSABLE_COLUMNS: { key: string; label: string; defaultHidden: boolean }[] = [
  { key: "humanId", label: "ID", defaultHidden: false },
  { key: "title", label: "Title", defaultHidden: false },
  { key: "employer", label: "Employer", defaultHidden: false },
  { key: "location", label: "Location", defaultHidden: false },
  { key: "source", label: "Source", defaultHidden: false },
  { key: "owner", label: "Owner", defaultHidden: false },
  { key: "createdAt", label: "Added", defaultHidden: true }
];
const DEFAULT_HIDDEN = CHOOSABLE_COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key);
const HIDDEN_COLS_KEY = "emerge.candidates.hiddenColumns";

export default function CandidatesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const myId = me.data?.user.id ?? "";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Newest first by CAND number (client request 31 Aug); humanId is zero-padded.
  const [sort, setSort] = useState<SortState>({ by: "humanId", dir: "desc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<CandidateFilters>(EMPTY_FILTERS);
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN);
  const [colsOpen, setColsOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search.trim());
  const sel = useRowSelection();

  // Column visibility survives reloads per browser (CP-02).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HIDDEN_COLS_KEY);
      if (raw) setHiddenCols(JSON.parse(raw) as string[]);
    } catch {
      // Ignore unreadable storage; defaults stay.
    }
  }, []);
  const setHidden = (cols: string[]) => {
    setHiddenCols(cols);
    try {
      window.localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(cols));
    } catch {
      // Storage full/blocked; the in-memory state still applies.
    }
  };
  const toggleCol = (key: string) =>
    setHidden(
      hiddenCols.includes(key) ? hiddenCols.filter((k) => k !== key) : [...hiddenCols, key]
    );

  const setFilter = (patch: Partial<CandidateFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const structuredInput = {
    source: (filters.source || undefined) as CandidateRow["source"] | undefined,
    ownerId: filters.ownerId || undefined,
    isBlocked: filters.isBlocked || undefined,
    createdWithinDays: filters.recent ? RECENT_DAYS : undefined
  };

  const list = trpc.candidates.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    deleted: showTrash,
    ...structuredInput
  });

  // Selection is per current result set; reset it when the query changes.
  useEffect(
    () => sel.clear(),
    [debouncedSearch, tagIds, filters, showTrash, page, sort.by, sort.dir, sel.clear]
  );

  // Preset chips (CP-03): exclusive quick views over the structured filters.
  const noFilters = !filters.source && !filters.ownerId && !filters.isBlocked && !filters.recent;
  const presets = [
    { key: "all", label: "All", active: noFilters, apply: () => setFilters(EMPTY_FILTERS) },
    {
      key: "mine",
      label: "Mine",
      active: filters.ownerId === myId && myId !== "",
      apply: () => setFilters({ ...EMPTY_FILTERS, ownerId: myId })
    },
    {
      key: "recent",
      label: `Recent (${RECENT_DAYS}d)`,
      active: filters.recent,
      apply: () => setFilters({ ...EMPTY_FILTERS, recent: true })
    },
    {
      key: "blocked",
      label: "Blocked",
      active: filters.isBlocked,
      apply: () => setFilters({ ...EMPTY_FILTERS, isBlocked: true })
    }
  ];

  const currentFilters: ViewFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    sortBy: sort.by,
    sortDir: sort.dir,
    fields: {
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.isBlocked ? { isBlocked: "1" } : {}),
      ...(filters.recent ? { recent: "1" } : {}),
      // Saved views remember the column layout too (CP-02).
      ...(hiddenCols.length > 0 ? { hiddenCols: hiddenCols.join(",") } : {})
    }
  };
  const applyView = (f: ViewFilters) => {
    setSearch(f.search ?? "");
    setTagIds(f.tagIds ?? []);
    setSort({ by: f.sortBy ?? "humanId", dir: f.sortDir ?? "desc" });
    setFilters({
      source: f.fields?.source ?? "",
      ownerId: f.fields?.ownerId ?? "",
      isBlocked: f.fields?.isBlocked === "1",
      recent: f.fields?.recent === "1"
    });
    if (f.fields?.hiddenCols !== undefined) {
      setHidden(f.fields.hiddenCols ? f.fields.hiddenCols.split(",") : []);
    }
    setPage(1);
  };

  const restore = trpc.candidates.restore.useMutation({
    onSuccess: () => utils.candidates.list.invalidate()
  });
  // AI semantic search (M18): expands the query into related terms server-side.
  const semantic = trpc.matching.semanticCandidates.useMutation();

  const CSV_COLUMNS: CsvColumn<CandidateRow>[] = [
    { label: "ID", value: (r) => r.humanId },
    { label: "First name", value: (r) => r.firstName },
    { label: "Last name", value: (r) => r.lastName },
    { label: "Title", value: (r) => r.title },
    { label: "Employer", value: (r) => r.currentEmployer },
    { label: "Email", value: (r) => r.email },
    { label: "City", value: (r) => r.city },
    { label: "Country", value: (r) => r.country },
    { label: "Source", value: (r) => r.source },
    { label: "Owner", value: (r) => r.ownerName }
  ];
  const exportSelected = () => {
    const chosen = (list.data?.rows ?? []).filter((r) => sel.selectedIds.has(r.id));
    downloadCsv(`candidates-${chosen.length}.csv`, toCsv(chosen, CSV_COLUMNS));
  };

  const allColumns: DataTableColumn<CandidateRow>[] = [
    {
      key: "humanId",
      header: "ID",
      sortable: true,
      className: "text-[var(--muted)] whitespace-nowrap",
      render: (row) => row.humanId
    },
    {
      key: "lastName",
      header: "Name",
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {row.isBlocked ? (
            <span title="Blocked candidate" className="mr-1">
              🚫
            </span>
          ) : null}
          {candidateName(row)}
        </span>
      )
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => row.title ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "employer",
      header: "Employer",
      render: (row) => row.currentEmployer ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "location",
      header: "Location",
      render: (row) => {
        const loc = [row.city, row.country].filter(Boolean).join(", ");
        return loc || <span className="text-[var(--muted)]">-</span>;
      }
    },
    {
      key: "source",
      header: "Source",
      sortable: true,
      render: (row) => <SourceBadge source={row.source} />
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => row.ownerName ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "createdAt",
      header: "Added",
      sortable: true,
      className: "whitespace-nowrap",
      render: (row) => new Date(row.createdAt).toLocaleDateString()
    },
    ...(!showTrash
      ? [
          {
            key: "rowActions",
            header: "",
            className: "text-right whitespace-nowrap",
            render: (row: CandidateRow) => (
              <span className="inline-flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPeekId(row.id);
                  }}
                  title="Quick view"
                  aria-label="Quick view"
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  👁
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/candidates/${row.id}#section-matching`);
                  }}
                  title="Find matching jobs"
                  aria-label="Find matching jobs"
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  ✨
                </button>
              </span>
            )
          }
        ]
      : []),
    ...(showTrash && canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (row: CandidateRow) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  restore.mutate({ id: row.id });
                }}
                disabled={restore.isPending}
                className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                Restore
              </button>
            )
          }
        ]
      : [])
  ];
  // Name and row actions are always visible; the chooser governs the rest (CP-02).
  const columns = allColumns.filter(
    (c) => !CHOOSABLE_COLUMNS.some((o) => o.key === c.key) || !hiddenCols.includes(c.key)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {showTrash ? "Candidates - Trash" : "Candidates"}
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" onClick={() => setColsOpen((v) => !v)}>
              Columns
            </Button>
            {colsOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
                {CHOOSABLE_COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--background)]"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.includes(c.key)}
                      onChange={() => toggleCol(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setColsOpen(false)}
                  className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setShowTrash(!showTrash);
              setPage(1);
            }}
          >
            {showTrash ? "Back to candidates" : "Trash"}
          </Button>
          {canWrite && !showTrash ? (
            <>
              <Link href="/candidates/parse">
                <Button variant="outline">Parse CVs</Button>
              </Link>
              <Link href="/candidates/import">
                <Button variant="outline">Import CSV</Button>
              </Link>
              <Button onClick={() => setCreating(true)}>New candidate</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search by name, email, title, employer or ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-md"
          aria-label="Search candidates"
        />
        {!showTrash ? (
          <Button
            variant="outline"
            disabled={!search.trim() || semantic.isPending}
            title="Expands your query into related skills and titles with AI, then searches"
            onClick={() => semantic.mutate({ query: search.trim() })}
          >
            {semantic.isPending ? "AI searching..." : "AI search"}
          </Button>
        ) : null}
      </div>

      {semantic.data ? (
        <div className="space-y-2 rounded-lg border border-[var(--brand-secondary)]/40 bg-[var(--brand-secondary-soft)]/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              AI search: {semantic.data.matches.length} candidate(s) via{" "}
              {semantic.data.terms.length} related terms
            </p>
            <button
              type="button"
              onClick={() => semantic.reset()}
              className="text-xs text-[var(--muted)] hover:underline"
            >
              Clear
            </button>
          </div>
          <p className="flex flex-wrap gap-1">
            {semantic.data.terms.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[11px] text-[var(--muted)] ring-1 ring-[var(--border)]"
              >
                {t}
              </span>
            ))}
          </p>
          {semantic.data.matches.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No candidates matched the expanded terms.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {semantic.data.matches.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/candidates/${m.id}`}
                      className="text-sm font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {candidateName({ firstName: m.firstName, lastName: m.lastName })}
                    </Link>
                    {m.title ? <p className="text-xs text-[var(--muted)]">{m.title}</p> : null}
                  </div>
                  <span className="flex flex-wrap gap-1">
                    {m.matchedTerms.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[var(--brand-secondary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-secondary)]"
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {!showTrash ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={p.apply}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  p.active
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <FieldFilter
              label="Source"
              value={filters.source}
              onChange={(v) => setFilter({ source: v })}
              options={CANDIDATE_SOURCE_OPTIONS}
            />
            <TagFilter
              selected={tagIds}
              onChange={(ids) => {
                setTagIds(ids);
                setPage(1);
              }}
            />
          </div>
          <ViewsBar
            entityType="candidate"
            current={currentFilters}
            canWrite={canWrite}
            onApply={applyView}
          />
        </>
      ) : null}

      <FormError
        message={list.error?.message ?? restore.error?.message ?? semantic.error?.message}
      />

      <BulkBar
        entityType="candidate"
        selectedIds={sel.ids}
        canWrite={canWrite}
        showTrash={showTrash}
        onClear={sel.clear}
        onDone={() => utils.candidates.list.invalidate()}
        onExport={exportSelected}
        onMailMerge={() => setMerging(true)}
        extraActions={
          <CandidatesBulkActions
            selectedIds={sel.ids}
            onDone={() => {
              utils.candidates.list.invalidate();
              sel.clear();
            }}
          />
        }
      />

      <MailMergeModal
        open={merging}
        onClose={() => setMerging(false)}
        entityType="candidate"
        entityIds={sel.ids}
        onDone={sel.clear}
      />

      <DataTable
        columns={columns}
        rows={list.data?.rows ?? []}
        rowKey={(row) => row.id}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={50}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/candidates/${row.id}`)}
        isLoading={list.isLoading}
        selection={{
          selectedIds: sel.selectedIds,
          onToggleRow: sel.toggleRow,
          onTogglePage: sel.togglePage
        }}
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted candidates stay here for 30 days."
            : debouncedSearch
              ? "No candidates match your search."
              : "No candidates yet. Create your first one."
        }
      />

      <NewCandidateModal open={creating} onClose={() => setCreating(false)} />
      {peekId ? <CandidatePeekDrawer id={peekId} onClose={() => setPeekId(null)} /> : null}
    </div>
  );
}

/**
 * Quick-view slide-in (CP-01, Zoho peek panel): key facts, skills and notes
 * without leaving the list. Read-only; "Open record" jumps to the full page.
 */
function CandidatePeekDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "skills" | "notes">("details");
  const candidate = trpc.candidates.get.useQuery({ id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = candidate.data;
  const fact = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value ?? "-"}</span>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--card)] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--muted)]">{d?.humanId ?? "..."}</p>
            <h2 className="truncate text-lg font-semibold">
              {d ? candidateName(d) : "Loading..."}
            </h2>
            <p className="truncate text-sm text-[var(--muted)]">
              {[d?.title, d?.currentEmployer].filter(Boolean).join(" at ")}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`/candidates/${id}`}
              className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--background)]"
            >
              Open record
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quick view"
              className="text-lg text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex gap-1 border-b border-[var(--border)] px-4 pt-2">
          {(["details", "skills", "notes"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-t-md px-3 py-1.5 text-sm capitalize",
                tab === t
                  ? "border border-b-0 border-[var(--border)] bg-[var(--card)] font-medium"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {candidate.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : !d ? (
            <p className="text-sm text-[var(--muted)]">Candidate not found.</p>
          ) : tab === "details" ? (
            <div className="divide-y divide-[var(--border)]">
              {fact("Email", d.email)}
              {fact("Phone", d.phone ?? d.mobile)}
              {fact("Location", [d.city, d.country].filter(Boolean).join(", ") || null)}
              {fact("Source", <SourceBadge source={d.source} />)}
              {fact("Owner", d.ownerName)}
              {fact("Experience", d.experienceYears !== null ? `${d.experienceYears} yrs` : null)}
              {fact("Notice period", d.noticePeriod)}
              {fact("Salary expectation", d.salaryText)}
              {fact("Applications", d.applications.length)}
              {fact("Added", new Date(d.createdAt).toLocaleDateString())}
            </div>
          ) : tab === "skills" ? (
            d.skills ? (
              <SkillChips skills={d.skills} />
            ) : (
              <p className="text-sm text-[var(--muted)]">No skills recorded yet.</p>
            )
          ) : (
            <PeekNotes entityId={id} />
          )}
        </div>
      </aside>
    </>
  );
}

/** Read-only notes list for the drawer (full editor lives on the record). */
function PeekNotes({ entityId }: { entityId: string }) {
  const notes = trpc.notes.list.useQuery({ entityType: "candidate", entityId, order: "recent" });
  if (notes.isLoading) return <p className="text-sm text-[var(--muted)]">Loading notes...</p>;
  if (!notes.data || notes.data.length === 0)
    return <p className="text-sm text-[var(--muted)]">No notes yet.</p>;
  return (
    <ul className="space-y-3">
      {notes.data.map((n) => (
        <li key={n.id} className="rounded-md border border-[var(--border)] p-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>{n.authorName ?? "Unknown"}</span>
            <span>{new Date(n.createdAt).toLocaleDateString()}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
