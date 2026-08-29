"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, FormError, Input } from "@/components/form";
import { Modal } from "@/components/modal";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc } from "@/lib/trpc/client";
import { useDebounced } from "@/lib/use-debounced";

const CV_ACCEPT = ".pdf,.doc,.docx,.rtf,.txt";

/**
 * Associate a candidate to a job (create an application). Give it a `candidateId`
 * to pick a job, or a `jobId` to pick a candidate. Duplicate pairs are blocked
 * by the server with a clear message. In job mode a CV can be uploaded directly
 * (UP-02): it parses in the background and the candidate lands on the pipeline.
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
        {!pickJob && jobId ? (
          <ParseCvIntoJob
            jobId={jobId}
            onCreated={() => {
              onCreated?.();
            }}
          />
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Parse a CV" lane inside the add-candidate modal (UP-02): upload one CV,
 * watch it parse, and the worker creates the candidate plus the application
 * on this job. Ambiguous results are pointed at the review list instead.
 */
function ParseCvIntoJob({ jobId, onCreated }: { jobId: string; onCreated: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [parseId, setParseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);

  const parseQ = trpc.parsing.get.useQuery(
    { id: parseId ?? "" },
    {
      enabled: Boolean(parseId),
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        return s === "queued" || s === "parsing" || s === undefined ? 2000 : false;
      }
    }
  );

  const status = parseId ? parseQ.data?.status : null;
  const filename = parseQ.data?.filename;

  // Parsed and created; refresh the pipeline behind the modal once.
  useEffect(() => {
    if (status !== "confirmed" || !parseId) return;
    setParseId(null);
    setDoneName(filename ?? "CV");
    void utils.jobs.get.invalidate();
    void utils.candidates.list.invalidate();
    onCreated();
  }, [status, parseId, filename]);

  const upload = async (file: File) => {
    setError(null);
    setDoneName(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("autoConfirm", "1");
      body.append("jobId", jobId);
      const res = await fetch("/api/candidates/import/parse", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        accepted?: { id: string }[];
        rejected?: { filename: string; error: string }[];
        error?: string;
      };
      const first = data.accepted?.[0];
      if (!res.ok || !first) {
        throw new Error(data.rejected?.[0]?.error ?? data.error ?? "Upload failed");
      }
      setParseId(first.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const busy = uploading || status === "queued" || status === "parsing";

  return (
    <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Or parse a CV</p>
          <p className="text-xs text-[var(--muted)]">
            Upload a CV; the candidate is created and added to this job.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={CV_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="px-3 py-1.5"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? "Uploading..."
            : status === "queued" || status === "parsing"
              ? "Parsing CV..."
              : "Upload CV"}
        </Button>
      </div>
      {status === "parsed" ? (
        <p className="mt-2 text-xs text-amber-600">
          This CV needs a quick review (missing last name or duplicate email).{" "}
          <Link href="/candidates/parse" className="underline">
            Open the review list
          </Link>{" "}
          to finish it.
        </p>
      ) : null}
      {status === "failed" ? (
        <p className="mt-2 text-xs text-red-600">
          Parsing failed{parseQ.data?.error ? `: ${parseQ.data.error}` : ""}. Retry it from{" "}
          <Link href="/candidates/parse" className="underline">
            the parse page
          </Link>
          .
        </p>
      ) : null}
      {doneName ? (
        <p className="mt-2 text-xs text-emerald-600">
          {doneName} parsed; the candidate is on this job&apos;s pipeline.
        </p>
      ) : null}
      <FormError message={error ?? undefined} />
    </div>
  );
}
