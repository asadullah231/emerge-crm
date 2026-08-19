"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { BulkBar } from "@/components/bulk-bar";
import { MailMergeModal } from "@/components/mail-merge-modal";
import { Button, FormError, Input } from "@/components/form";
import { NewCandidateModal, candidateName } from "@/components/new-candidate-modal";
import { CANDIDATE_SOURCE_OPTIONS, SourceBadge } from "@/components/record";
import { TagFilter } from "@/components/tag-editor";
import { ViewsBar, FieldFilter, type ViewFilters } from "@/components/views-bar";
import { toCsv, downloadCsv, type CsvColumn } from "@/lib/csv-export";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";
import { useRowSelection } from "@/lib/use-row-selection";

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
  const [merging, setMerging] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const sel = useRowSelection();

  const list = trpc.candidates.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    source: (source || undefined) as CandidateRow["source"] | undefined,
    deleted: showTrash
  });

  // Selection is per current result set; reset it when the query changes.
  useEffect(
    () => sel.clear(),
    [debouncedSearch, tagIds, source, showTrash, page, sort.by, sort.dir, sel.clear]
  );

  const currentFilters: ViewFilters = {
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    sortBy: sort.by,
    sortDir: sort.dir,
    fields: source ? { source } : undefined
  };
  const applyView = (f: ViewFilters) => {
    setSearch(f.search ?? "");
    setTagIds(f.tagIds ?? []);
    setSort({ by: f.sortBy ?? "lastName", dir: f.sortDir ?? "asc" });
    setSource(f.fields?.source ?? "");
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
          <div className="flex flex-wrap items-center gap-4">
            <FieldFilter
              label="Source"
              value={source}
              onChange={(v) => {
                setSource(v);
                setPage(1);
              }}
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
    </div>
  );
}
