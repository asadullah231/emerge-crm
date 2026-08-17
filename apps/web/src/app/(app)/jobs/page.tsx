"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { BulkBar } from "@/components/bulk-bar";
import { Button, FormError, Input } from "@/components/form";
import { NewJobModal } from "@/components/new-job-modal";
import { JOB_STATUS_OPTIONS, JobStatusBadge } from "@/components/record";
import { TagFilter } from "@/components/tag-editor";
import { ViewsBar, FieldFilter, type ViewFilters } from "@/components/views-bar";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";
import { useRowSelection } from "@/lib/use-row-selection";

type JobRow = RouterOutputs["jobs"]["list"]["rows"][number];

export default function JobsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: "openedAt", dir: "desc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const sel = useRowSelection();

  const list = trpc.jobs.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    status: (status || undefined) as JobRow["status"] | undefined,
    deleted: showTrash
  });

  useEffect(
    () => sel.clear(),
    [debouncedSearch, tagIds, status, showTrash, page, sort.by, sort.dir, sel.clear]
  );

  const currentFilters: ViewFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    sortBy: sort.by,
    sortDir: sort.dir,
    fields: status ? { status } : undefined
  };
  const applyView = (f: ViewFilters) => {
    setSearch(f.search ?? "");
    setTagIds(f.tagIds ?? []);
    setSort({ by: f.sortBy ?? "openedAt", dir: f.sortDir ?? "desc" });
    setStatus(f.fields?.status ?? "");
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
      render: (row) => <span className="font-medium">{row.title}</span>
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
          <div className="flex flex-wrap items-center gap-4">
            <FieldFilter
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={JOB_STATUS_OPTIONS}
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
