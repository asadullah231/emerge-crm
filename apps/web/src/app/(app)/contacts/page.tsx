"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { Button, FormError, Input } from "@/components/form";
import { NewContactModal, contactName } from "@/components/new-contact-modal";
import { TagFilter } from "@/components/tag-editor";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

type ContactRow = RouterOutputs["contacts"]["list"]["rows"][number];

export default function ContactsPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: "lastName", dir: "asc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const debouncedSearch = useDebounced(search.trim());

  const list = trpc.contacts.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    deleted: showTrash
  });

  const restore = trpc.contacts.restore.useMutation({
    onSuccess: () => utils.contacts.list.invalidate()
  });

  const columns: DataTableColumn<ContactRow>[] = [
    {
      key: "lastName",
      header: "Name",
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {contactName(row)}
          {row.isPrimary ? (
            <span className="ml-2 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
              Primary
            </span>
          ) : null}
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
      key: "email",
      header: "Email",
      sortable: true,
      render: (row) => row.email ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "company",
      header: "Company",
      render: (row) => row.companyName ?? <span className="text-[var(--muted)]">Independent</span>
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
            render: (row: ContactRow) => (
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
        <h1 className="text-2xl font-semibold">{showTrash ? "Contacts - Trash" : "Contacts"}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowTrash(!showTrash);
              setPage(1);
            }}
          >
            {showTrash ? "Back to contacts" : "Trash"}
          </Button>
          {canWrite && !showTrash ? (
            <Button onClick={() => setCreating(true)}>New contact</Button>
          ) : null}
        </div>
      </div>

      <Input
        type="search"
        placeholder="Search by name, email or title..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-md"
        aria-label="Search contacts"
      />

      {!showTrash ? (
        <TagFilter
          selected={tagIds}
          onChange={(ids) => {
            setTagIds(ids);
            setPage(1);
          }}
        />
      ) : null}

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
        onRowClick={(row) => router.push(`/contacts/${row.id}`)}
        isLoading={list.isLoading}
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted contacts stay here for 30 days."
            : debouncedSearch
              ? "No contacts match your search."
              : "No contacts yet. Create your first one."
        }
      />

      <NewContactModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
