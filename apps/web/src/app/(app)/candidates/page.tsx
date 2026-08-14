"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { Button, FormError, Input } from "@/components/form";
import { NewCandidateModal, candidateName } from "@/components/new-candidate-modal";
import { SourceBadge } from "@/components/record";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

type CandidateRow = RouterOutputs["candidates"]["list"]["rows"][number];

export default function CandidatesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: "lastName", dir: "asc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounced(search.trim());

  const list = trpc.candidates.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    deleted: showTrash
  });

  const restore = trpc.candidates.restore.useMutation({
    onSuccess: () => utils.candidates.list.invalidate()
  });

  const columns: DataTableColumn<CandidateRow>[] = [
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
      render: (row) => <span className="font-medium">{candidateName(row)}</span>
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {showTrash ? "Candidates - Trash" : "Candidates"}
        </h1>
        <div className="flex items-center gap-2">
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
            <Button onClick={() => setCreating(true)}>New candidate</Button>
          ) : null}
        </div>
      </div>

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
        onRowClick={(row) => router.push(`/candidates/${row.id}`)}
        isLoading={list.isLoading}
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted candidates stay here for 30 days."
            : debouncedSearch
              ? "No candidates match your search."
              : "No candidates yet. Create your first one."
        }
      />

      <NewCandidateModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
