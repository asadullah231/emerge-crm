"use client";

import { useState } from "react";
import { Button, FormError, Input } from "@/components/form";
import { Modal } from "@/components/modal";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

/**
 * Associate a candidate to a job (create an application). Give it a `candidateId`
 * to pick a job, or a `jobId` to pick a candidate. Duplicate pairs are blocked
 * by the server with a clear message.
 */
export function AssociateModal({
  open,
  onClose,
  candidateId,
  jobId,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  candidateId?: string;
  jobId?: string;
  onCreated?: () => void;
}) {
  const pickJob = Boolean(candidateId);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());

  const jobsQ = trpc.jobs.list.useQuery(
    {
      page: 1,
      pageSize: 20,
      sortBy: "title",
      sortDir: "asc",
      search: debounced || undefined,
      deleted: false
    },
    { enabled: open && pickJob }
  );
  const candidatesQ = trpc.candidates.list.useQuery(
    {
      page: 1,
      pageSize: 20,
      sortBy: "lastName",
      sortDir: "asc",
      search: debounced || undefined,
      deleted: false
    },
    { enabled: open && !pickJob }
  );

  const create = trpc.applications.create.useMutation({
    onSuccess: () => {
      setSearch("");
      onCreated?.();
      onClose();
    }
  });

  const associate = (targetId: string) => {
    if (pickJob) create.mutate({ candidateId: candidateId!, jobId: targetId });
    else create.mutate({ candidateId: targetId, jobId: jobId! });
  };

  const results = pickJob
    ? (jobsQ.data?.rows ?? []).map((j) => ({
        id: j.id,
        label: j.title,
        sub: `${j.humanId} · ${j.companyName ?? ""}`
      }))
    : (candidatesQ.data?.rows ?? []).map((c) => ({
        id: c.id,
        label: candidateName(c),
        sub: [c.humanId, c.title].filter(Boolean).join(" · ")
      }));

  return (
    <Modal title={pickJob ? "Add to a job" : "Add a candidate"} open={open} onClose={onClose}>
      <div className="space-y-3">
        <FormError message={create.error?.message} />
        <Input
          type="search"
          autoFocus
          placeholder={pickJob ? "Search jobs..." : "Search candidates..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={pickJob ? "Search jobs" : "Search candidates"}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={create.isPending}
              onClick={() => associate(r.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-left text-sm hover:border-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-soft)] disabled:opacity-50"
            >
              <span className="font-medium">{r.label}</span>
              <span className="truncate text-xs text-[var(--muted)]">{r.sub}</span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-[var(--muted)]">
              {debounced ? "No matches." : `Search for a ${pickJob ? "job" : "candidate"}.`}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
