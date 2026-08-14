"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type DataTableColumn, type SortState } from "@/components/data-table";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { COMPANY_STATUS_OPTIONS, DuplicateWarning, StatusBadge } from "@/components/record";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

type CompanyRow = RouterOutputs["companies"]["list"]["rows"][number];

function NewCompanyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"prospect" | "active" | "dormant">("prospect");

  const debouncedName = useDebounced(name.trim());
  const debouncedWebsite = useDebounced(website.trim());
  const duplicates = trpc.companies.duplicates.useQuery(
    { name: debouncedName || undefined, website: debouncedWebsite || undefined },
    { enabled: open && (debouncedName.length > 1 || debouncedWebsite.length > 3) }
  );

  const create = trpc.companies.create.useMutation({
    onSuccess: async (created) => {
      await utils.companies.list.invalidate();
      onClose();
      router.push(`/companies/${created.id}`);
    }
  });

  return (
    <Modal title="New company" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name: name.trim(),
            website: website.trim() || null,
            industry: industry.trim() || null,
            location: location.trim() || null,
            status
          });
        }}
      >
        <FormError message={create.error?.message} />
        <div>
          <Label htmlFor="company-name">Name</Label>
          <Input
            id="company-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Porsche Consulting"
          />
        </div>
        <div>
          <Label htmlFor="company-website">Website</Label>
          <Input
            id="company-website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="company-industry">Industry</Label>
            <Input
              id="company-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="company-location">Location</Label>
            <Input
              id="company-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="company-status">Status</Label>
          <select
            id="company-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {COMPANY_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <DuplicateWarning
          items={(duplicates.data ?? []).map((d) => ({
            id: d.id,
            label: d.domain ? `${d.name} (${d.domain})` : d.name,
            href: `/companies/${d.id}`
          }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create company"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CompaniesPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ by: "name", dir: "asc" });
  const [showTrash, setShowTrash] = useState(false);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounced(search.trim());

  const list = trpc.companies.list.useQuery({
    page,
    pageSize: 50,
    sortBy: sort.by,
    sortDir: sort.dir,
    search: debouncedSearch || undefined,
    deleted: showTrash
  });

  const restore = trpc.companies.restore.useMutation({
    onSuccess: () => utils.companies.list.invalidate()
  });

  const columns: DataTableColumn<CompanyRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => <span className="font-medium">{row.name}</span>
    },
    {
      key: "industry",
      header: "Industry",
      sortable: true,
      render: (row) => row.industry ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "location",
      header: "Location",
      sortable: true,
      render: (row) => row.location ?? <span className="text-[var(--muted)]">-</span>
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: "owner",
      header: "Account manager",
      render: (row) => row.ownerName ?? <span className="text-[var(--muted)]">-</span>
    },
    ...(showTrash && canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (row: CompanyRow) => (
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
        <h1 className="text-2xl font-semibold">{showTrash ? "Companies - Trash" : "Companies"}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowTrash(!showTrash);
              setPage(1);
            }}
          >
            {showTrash ? "Back to companies" : "Trash"}
          </Button>
          {canWrite && !showTrash ? (
            <Button onClick={() => setCreating(true)}>New company</Button>
          ) : null}
        </div>
      </div>

      <Input
        type="search"
        placeholder="Search by name, domain, industry or location..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-md"
        aria-label="Search companies"
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
        onRowClick={(row) => router.push(`/companies/${row.id}`)}
        isLoading={list.isLoading}
        emptyMessage={
          showTrash
            ? "Trash is empty. Deleted companies stay here for 30 days."
            : debouncedSearch
              ? "No companies match your search."
              : "No companies yet. Create your first one."
        }
      />

      <NewCompanyModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
