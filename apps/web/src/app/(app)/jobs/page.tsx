"use client";

import { useEffect, useState } from "react";
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
  employmentType: string;
  workMode: string;
  isHot: boolean;
  recent: boolean;
};

const EMPTY_FILTERS: JobFilters = {
  status: "",
  ownerId: "",
  companyId: "",
  country: "",
  employmentType: "",
  workMode: "",
  isHot: false,
  recent: false
};

const RECENT_DAYS = 30;

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
  const debouncedSearch = useDebounced(search.trim());
  const sel = useRowSelection();

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
    !filters.employmentType &&
    !filters.workMode &&
    !filters.isHot &&
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
      ...(filters.recent ? { recent: "1" } : {})
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
      employmentType: f.fields?.employmentType ?? "",
      workMode: f.fields?.workMode ?? "",
      isHot: f.fields?.isHot === "1",
      recent: f.fields?.recent === "1"
    });
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

  const columns: DataTableColumn<JobRow>[] = [
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {showTrash ? "Job Openings - Trash" : "Job Openings"}
        </h1>
        <div className="flex items-center gap-2">
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
    </div>
  );
}
