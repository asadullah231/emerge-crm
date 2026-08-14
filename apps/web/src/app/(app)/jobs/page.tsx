"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { Button, FormError, Input } from "@/components/form";
import { NewJobModal } from "@/components/new-job-modal";
import { JobStatusBadge } from "@/components/record";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

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
  const debouncedSearch = useDebounced(search.trim());

  const list = trpc.jobs.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    deleted: showTrash
  });

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
        <h1 className="text-2xl font-semibold">{showTrash ? "Jobs - Trash" : "Jobs"}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowTrash(!showTrash);
              setPage(1);
            }}
          >
            {showTrash ? "Back to jobs" : "Trash"}
          </Button>
          {canWrite && !showTrash ? (
            <Button onClick={() => setCreating(true)}>New job</Button>
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

      <FormError message={list.error?.message ?? restore.error?.message} />

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
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted jobs stay here for 30 days."
            : debouncedSearch
              ? "No jobs match your search."
              : "No jobs yet. Open your first role."
        }
      />

      <NewJobModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
