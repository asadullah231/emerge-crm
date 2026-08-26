"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@emerge/ui";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { BulkBar } from "@/components/bulk-bar";
import { Button, FormError, Input } from "@/components/form";
import { JobsBulkActions } from "@/components/jobs-bulk-actions";
import { NewJobModal } from "@/components/new-job-modal";
import {
  JOB_EMPLOYMENT_OPTIONS,
  JOB_STATUS_OPTIONS,
  JOB_WORK_MODE_OPTIONS,
  JobStatusBadge
} from "@/components/record";
import { TagFilter } from "@/components/tag-editor";
import { ViewsBar, FieldFilter, type ViewFilters } from "@/components/views-bar";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";
import { useRowSelection } from "@/lib/use-row-selection";

type JobRow = RouterOutputs["jobs"]["list"]["rows"][number];

/** Structured job list filters (M17b). All optional; "" means not filtering. */
type JobFilters = {
  status: string;
  ownerId: string;
  companyId: string;
  country: string;
  industry: string;
  employmentType: string;
  workMode: string;
  isHot: boolean;
  isLocked: boolean;
  recent: boolean;
};

const EMPTY_FILTERS: JobFilters = {
  status: "",
  ownerId: "",
  companyId: "",
  country: "",
  industry: "",
  employmentType: "",
  workMode: "",
  isHot: false,
  isLocked: false,
  recent: false
};

const RECENT_DAYS = 30;

/** Optional columns the chooser can hide (JP-03); key must match `columns`. */
const CHOOSABLE_COLUMNS: { key: string; label: string; defaultHidden: boolean }[] = [
  { key: "humanId", label: "ID", defaultHidden: false },
  { key: "company", label: "Client", defaultHidden: false },
  { key: "status", label: "Status", defaultHidden: false },
  { key: "location", label: "Location", defaultHidden: false },
  { key: "industry", label: "Industry", defaultHidden: true },
  { key: "positions", label: "Positions", defaultHidden: false },
  { key: "owner", label: "Owner", defaultHidden: false },
  { key: "openedAt", label: "Opened", defaultHidden: true },
  { key: "targetCloseAt", label: "Target date", defaultHidden: true }
];
const DEFAULT_HIDDEN = CHOOSABLE_COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key);
const HIDDEN_COLS_KEY = "emerge.jobs.hiddenColumns";

export default function JobsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const myId = me.data?.user.id ?? "";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: "openedAt", dir: "desc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<JobFilters>(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<string[]>(DEFAULT_HIDDEN);
  const [colsOpen, setColsOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search.trim());
  const sel = useRowSelection();

  // Column visibility survives reloads per browser (JP-03).
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

  const setFilter = (patch: Partial<JobFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const structuredInput = {
    status: (filters.status || undefined) as JobRow["status"] | undefined,
    ownerId: filters.ownerId || undefined,
    companyId: filters.companyId || undefined,
    country: filters.country || undefined,
    employmentType: (filters.employmentType || undefined) as JobRow["employmentType"] | undefined,
    workMode: (filters.workMode || undefined) as JobRow["workMode"] | undefined,
    isHot: filters.isHot || undefined,
    isLocked: filters.isLocked || undefined,
    industry: filters.industry || undefined,
    openedWithinDays: filters.recent ? RECENT_DAYS : undefined
  };

  const list = trpc.jobs.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    deleted: showTrash,
    ...structuredInput
  });

  const members = trpc.members.list.useQuery(undefined, { enabled: !showTrash });
  const companies = trpc.companies.list.useQuery(
    { page: 1, pageSize: 200, sortBy: "name", sortDir: "asc", deleted: false },
    { enabled: !showTrash }
  );
  const filterOptions = trpc.jobs.filterOptions.useQuery(undefined, { enabled: !showTrash });

  useEffect(
    () => sel.clear(),
    [debouncedSearch, tagIds, filters, showTrash, page, sort.by, sort.dir, sel.clear]
  );

  // Preset chips (M17b): exclusive quick views over the structured filters.
  const noFilters =
    !filters.status &&
    !filters.ownerId &&
    !filters.companyId &&
    !filters.country &&
    !filters.industry &&
    !filters.employmentType &&
    !filters.workMode &&
    !filters.isHot &&
    !filters.isLocked &&
    !filters.recent;
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
      key: "inprogress",
      label: "In-progress",
      active: filters.status === "open" && !filters.recent && !filters.ownerId,
      apply: () => setFilters({ ...EMPTY_FILTERS, status: "open" })
    },
    {
      key: "locked",
      label: "Locked",
      active: filters.isLocked,
      apply: () => setFilters({ ...EMPTY_FILTERS, isLocked: true })
    }
  ];

  const currentFilters: ViewFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    sortBy: sort.by,
    sortDir: sort.dir,
    fields: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.employmentType ? { employmentType: filters.employmentType } : {}),
      ...(filters.workMode ? { workMode: filters.workMode } : {}),
      ...(filters.isHot ? { isHot: "1" } : {}),
      ...(filters.isLocked ? { isLocked: "1" } : {}),
      ...(filters.industry ? { industry: filters.industry } : {}),
      ...(filters.recent ? { recent: "1" } : {}),
      // Saved views remember the column layout too (JP-03).
      ...(hiddenCols.length > 0 ? { hiddenCols: hiddenCols.join(",") } : {})
    }
  };
  const applyView = (f: ViewFilters) => {
    setSearch(f.search ?? "");
    setTagIds(f.tagIds ?? []);
    setSort({ by: f.sortBy ?? "openedAt", dir: f.sortDir ?? "desc" });
    setFilters({
      status: f.fields?.status ?? "",
      ownerId: f.fields?.ownerId ?? "",
      companyId: f.fields?.companyId ?? "",
      country: f.fields?.country ?? "",
      industry: f.fields?.industry ?? "",
      employmentType: f.fields?.employmentType ?? "",
      workMode: f.fields?.workMode ?? "",
      isHot: f.fields?.isHot === "1",
      isLocked: f.fields?.isLocked === "1",
      recent: f.fields?.recent === "1"
    });
    if (f.fields?.hiddenCols !== undefined) {
      setHidden(f.fields.hiddenCols ? f.fields.hiddenCols.split(",") : []);
    }
    setPage(1);
  };

  const CSV_COLUMNS: CsvColumn<JobRow>[] = [
    { label: "ID", value: (r) => r.humanId },
    { label: "Title", value: (r) => r.title },
    { label: "Company", value: (r) => r.companyName },
    { label: "Status", value: (r) => r.status },
    { label: "Employment", value: (r) => r.employmentType },
    { label: "Work mode", value: (r) => r.workMode },
    { label: "Location", value: (r) => r.location },
    { label: "Positions", value: (r) => r.positions }
  ];
  const exportSelected = () => {
    const chosen = (list.data?.rows ?? []).filter((r) => sel.selectedIds.has(r.id));
    downloadCsv(`jobs-${chosen.length}.csv`, toCsv(chosen, CSV_COLUMNS));
  };

  // Full filtered export runs on the server so it covers every page (M17b).
  const exportAll = async () => {
    setExporting(true);
    try {
      const res = await utils.client.jobs.exportCsv.query({
        sortBy: sort.by,
        sortDir: sort.dir,
        search: debouncedSearch || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        deleted: showTrash,
        ...structuredInput
      });
      downloadCsv(`job-openings-${res.count}.csv`, res.csv);
    } finally {
      setExporting(false);
    }
  };

  const restore = trpc.jobs.restore.useMutation({
    onSuccess: () => utils.jobs.list.invalidate()
  });

  const allColumns: DataTableColumn<JobRow>[] = [
    {
      key: "humanId",
      header: "ID",
      sortable: true,
      className: "text-[var(--muted)] whitespace-nowrap",
      render: (row) => row.humanId
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {row.isHot ? (
            <span title="Hot job opening" className="mr-1">
              🔥
            </span>
          ) : null}
          {row.isLocked ? (
            <span title="Locked by an admin" className="mr-1">
              🔒
            </span>
          ) : null}
          {row.title}
        </span>
      )
    },
    {
      key: "company",
      header: "Client",
      render: (row) => row.companyName ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <JobStatusBadge status={row.status} />
    },
    {
      key: "location",
      header: "Location",
      sortable: true,
      render: (row) => row.location ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "industry",
      header: "Industry",
      render: (row) => row.industry ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "positions",
      header: "Positions",
      className: "text-right",
      render: (row) => row.positions
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => row.ownerName ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "openedAt",
      header: "Opened",
      sortable: true,
      className: "whitespace-nowrap",
      render: (row) => new Date(row.openedAt).toLocaleDateString()
    },
    {
      key: "targetCloseAt",
      header: "Target date",
      className: "whitespace-nowrap",
      render: (row) =>
        row.targetCloseAt ? (
          new Date(row.targetCloseAt).toLocaleDateString()
        ) : (
          <span className="text-[var(--muted)]">-</span>
        )
    },
    ...(!showTrash
      ? [
          {
            key: "rowActions",
            header: "",
            className: "text-right whitespace-nowrap",
            render: (row: JobRow) => (
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
                    router.push(`/jobs/${row.id}#section-matching`);
                  }}
                  title="Find matching candidates"
                  aria-label="Find matching candidates"
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
            render: (row: JobRow) => (
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
  // Title and row actions are always visible; the chooser governs the rest (JP-03).
  const columns = allColumns.filter(
    (c) => !CHOOSABLE_COLUMNS.some((o) => o.key === c.key) || !hiddenCols.includes(c.key)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {showTrash ? "Job Openings - Trash" : "Job Openings"}
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
          <Button variant="outline" onClick={exportAll} disabled={exporting || list.isLoading}>
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
          {canWrite && !showTrash ? (
            <Link
              href="/jobs/import"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"
            >
              Import
            </Link>
          ) : null}
          <Button
            variant="outline"
            onClick={() => {
              setShowTrash(!showTrash);
              setPage(1);
            }}
          >
            {showTrash ? "Back to job openings" : "Trash"}
          </Button>
          {canWrite && !showTrash ? (
            <Button onClick={() => setCreating(true)}>New job opening</Button>
          ) : null}
        </div>
      </div>

      <Input
        type="search"
        placeholder="Search by title, location or ID..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-md"
        aria-label="Search jobs"
      />

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
              label="Status"
              value={filters.status}
              onChange={(v) => setFilter({ status: v })}
              options={JOB_STATUS_OPTIONS}
            />
            <FieldFilter
              label="Owner"
              value={filters.ownerId}
              onChange={(v) => setFilter({ ownerId: v })}
              options={(members.data ?? [])
                .filter((m) => !m.deactivatedAt)
                .map((m) => ({ value: m.userId, label: m.name }))}
            />
            <FieldFilter
              label="Client"
              value={filters.companyId}
              onChange={(v) => setFilter({ companyId: v })}
              options={(companies.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <FieldFilter
              label="Country"
              value={filters.country}
              onChange={(v) => setFilter({ country: v })}
              options={(filterOptions.data?.countries ?? []).map((c) => ({ value: c, label: c }))}
            />
            <FieldFilter
              label="Industry"
              value={filters.industry}
              onChange={(v) => setFilter({ industry: v })}
              options={(filterOptions.data?.industries ?? []).map((c) => ({ value: c, label: c }))}
            />
            <FieldFilter
              label="Employment"
              value={filters.employmentType}
              onChange={(v) => setFilter({ employmentType: v })}
              options={[...JOB_EMPLOYMENT_OPTIONS]}
            />
            <FieldFilter
              label="Work mode"
              value={filters.workMode}
              onChange={(v) => setFilter({ workMode: v })}
              options={[...JOB_WORK_MODE_OPTIONS]}
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={filters.isHot}
                onChange={(e) => setFilter({ isHot: e.target.checked })}
              />
              Hot only
            </label>
            <TagFilter
              selected={tagIds}
              onChange={(ids) => {
                setTagIds(ids);
                setPage(1);
              }}
            />
          </div>
          <ViewsBar
            entityType="job"
            current={currentFilters}
            canWrite={canWrite}
            onApply={applyView}
          />
        </>
      ) : null}

      <FormError message={list.error?.message ?? restore.error?.message} />

      <BulkBar
        entityType="job"
        selectedIds={sel.ids}
        canWrite={canWrite}
        showTrash={showTrash}
        onClear={sel.clear}
        onDone={() => utils.jobs.list.invalidate()}
        onExport={exportSelected}
        extraActions={
          <JobsBulkActions
            selectedIds={sel.ids}
            onDone={() => {
              utils.jobs.list.invalidate();
              sel.clear();
            }}
          />
        }
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
        onRowClick={(row) => router.push(`/jobs/${row.id}`)}
        isLoading={list.isLoading}
        selection={{
          selectedIds: sel.selectedIds,
          onToggleRow: sel.toggleRow,
          onTogglePage: sel.togglePage
        }}
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted jobs stay here for 30 days."
            : debouncedSearch
              ? "No job openings match your search."
              : "No job openings yet. Open your first role."
        }
      />

      <NewJobModal open={creating} onClose={() => setCreating(false)} />
      {peekId ? <JobPeekDrawer id={peekId} onClose={() => setPeekId(null)} /> : null}
    </div>
  );
}

/**
 * Quick-view slide-in (JP-04, Zoho peek panel): key facts, the JD and notes
 * without leaving the list. Read-only; "Open record" jumps to the full page.
 */
function JobPeekDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "description" | "notes">("details");
  const job = trpc.jobs.get.useQuery({ id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = job.data;
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
            <h2 className="truncate text-lg font-semibold">{d?.title ?? "Loading..."}</h2>
            <p className="truncate text-sm text-[var(--muted)]">{d?.companyName}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`/jobs/${id}`}
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
          {(["details", "description", "notes"] as const).map((t) => (
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
              {t === "description" ? "Job description" : t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {job.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : !d ? (
            <p className="text-sm text-[var(--muted)]">Job not found.</p>
          ) : tab === "details" ? (
            <div className="divide-y divide-[var(--border)]">
              {fact("Status", <JobStatusBadge status={d.status} />)}
              {fact("Owner", d.ownerName)}
              {fact("Location", d.location)}
              {fact("Industry", d.industry)}
              {fact("Work experience", d.workExperience)}
              {fact("Employment", d.employmentType)}
              {fact("Work mode", d.workMode)}
              {fact("Positions", d.positions)}
              {fact("Salary", d.salaryText)}
              {fact("Opened", new Date(d.openedAt).toLocaleDateString())}
              {fact(
                "Target date",
                d.targetCloseAt ? new Date(d.targetCloseAt).toLocaleDateString() : null
              )}
              {fact("In pipeline", d.pipeline.total)}
            </div>
          ) : tab === "description" ? (
            d.description ? (
              <p className="whitespace-pre-wrap text-sm">{d.description}</p>
            ) : (
              <p className="text-sm text-[var(--muted)]">No job description yet.</p>
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
  const notes = trpc.notes.list.useQuery({ entityType: "job", entityId, order: "recent" });
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
