"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { parsedResumeSchema, type ParsedResume } from "@emerge/core";
import { Button, FormError } from "@/components/form";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

const ACCEPT = ".pdf,.doc,.docx,.rtf,.txt";

type ParseRow = RouterOutputs["parsing"]["list"][number];

const TABS = [
  { key: "parsed", label: "Needs review" },
  { key: "queued", label: "In progress" },
  { key: "confirmed", label: "Confirmed" },
  { key: "failed", label: "Failed" }
] as const;

function displayName(parsed: unknown): string {
  const r = parsed as Partial<ParsedResume> | null;
  const name = [r?.firstName, r?.lastName].filter(Boolean).join(" ");
  return name || "Unnamed candidate";
}

export default function ParseCandidatesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("parsed");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const counts = trpc.parsing.counts.useQuery(undefined, { refetchInterval: 4000 });
  // "In progress" groups queued + parsing.
  const listStatus = tab === "queued" ? undefined : tab;
  const list = trpc.parsing.list.useQuery(
    { status: listStatus, limit: 200 },
    { refetchInterval: 4000 }
  );

  const rows: ParseRow[] =
    tab === "queued"
      ? (list.data ?? []).filter((r) => r.status === "queued" || r.status === "parsing")
      : (list.data ?? []).filter((r) => r.status === tab);

  const refreshAll = async () => {
    await Promise.all([utils.parsing.list.invalidate(), utils.parsing.counts.invalidate()]);
  };

  const upload = async (files: FileList) => {
    setUploadError(null);
    setUploading(true);
    try {
      const body = new FormData();
      for (const f of Array.from(files)) body.append("file", f);
      const res = await fetch("/api/candidates/import/parse", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        accepted?: unknown[];
        rejected?: { filename: string; error: string }[];
        error?: string;
      };
      if (!res.ok && !data.accepted?.length) throw new Error(data.error ?? "Upload failed");
      if (data.rejected?.length) {
        setUploadError(
          `Skipped ${data.rejected.length}: ` +
            data.rejected.map((r) => `${r.filename} (${r.error})`).join(", ")
        );
      }
      setTab("queued");
      await refreshAll();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const countFor = (key: (typeof TABS)[number]["key"]) => {
    const c = counts.data ?? {};
    if (key === "queued") return (c.queued ?? 0) + (c.parsing ?? 0);
    return c[key] ?? 0;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/candidates" className="text-sm text-[var(--muted)] hover:underline">
          &larr; Candidates
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Parse CVs</h1>
          <Link href="/candidates/import" className="text-sm text-[var(--accent)] hover:underline">
            Import from CSV instead
          </Link>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Drop CVs here. Each one is read automatically, then you review and confirm the candidate.
        </p>
      </div>

      <FormError message={uploadError ?? undefined} />

      {/* Drop zone */}
      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
          }}
        />
        <p className="text-sm text-[var(--foreground)]">Drag and drop CV files here</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          PDF, DOC, DOCX, RTF, TXT — up to 50 at once
        </p>
        <Button
          variant="outline"
          className="mt-4 px-4"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Choose files"}
        </Button>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "border-b-2 px-3 py-2 text-sm transition-colors " +
              (tab === t.key
                ? "border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]")
            }
          >
            {t.label}
            <span className="ml-1.5 rounded-full bg-[var(--background)] px-1.5 py-0.5 text-xs">
              {countFor(t.key)}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          {tab === "parsed"
            ? "Nothing to review yet. Uploaded CVs appear here once parsed."
            : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.status === "parsed" || row.status === "confirmed"
                    ? displayName(row.parsed)
                    : row.filename}
                </p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {row.filename}
                  {row.status === "failed" && row.error ? ` — ${row.error}` : ""}
                  {row.status === "parsing" ? " — reading..." : ""}
                  {row.status === "queued" ? " — queued" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.status === "parsed" ? (
                  <Button className="px-3 py-1.5" onClick={() => setReviewId(row.id)}>
                    Review
                  </Button>
                ) : null}
                {row.status === "confirmed" && row.candidateId ? (
                  <Link
                    href={`/candidates/${row.candidateId}`}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    View candidate
                  </Link>
                ) : null}
                {row.status === "failed" ? <RetryDiscard id={row.id} onDone={refreshAll} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewId ? (
        <ReviewModal
          id={reviewId}
          onClose={() => setReviewId(null)}
          onConfirmed={async () => {
            setReviewId(null);
            await refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}

function RetryDiscard({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const retry = trpc.parsing.retry.useMutation({ onSuccess: onDone });
  const discard = trpc.parsing.discard.useMutation({ onSuccess: onDone });
  return (
    <>
      <button
        onClick={() => retry.mutate({ id })}
        disabled={retry.isPending}
        className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
      >
        Retry
      </button>
      <button
        onClick={() => discard.mutate({ id })}
        disabled={discard.isPending}
        className="text-sm text-red-600 hover:underline disabled:opacity-50"
      >
        Discard
      </button>
    </>
  );
}

const EMPTY: ParsedResume = {
  firstName: null,
  lastName: null,
  title: null,
  currentEmployer: null,
  email: null,
  secondaryEmail: null,
  phone: null,
  mobile: null,
  city: null,
  country: null,
  linkedinUrl: null,
  websiteUrl: null,
  skills: null,
  experienceYears: null,
  education: [],
  experience: []
};

const FIELDS: Array<{ key: keyof ParsedResume; label: string }> = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name *" },
  { key: "title", label: "Title" },
  { key: "currentEmployer", label: "Current employer" },
  { key: "email", label: "Email" },
  { key: "secondaryEmail", label: "Secondary email" },
  { key: "phone", label: "Phone" },
  { key: "mobile", label: "Mobile" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "websiteUrl", label: "Website" }
];

function ReviewModal({
  id,
  onClose,
  onConfirmed
}: {
  id: string;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
}) {
  const job = trpc.parsing.get.useQuery({ id });
  const [form, setForm] = useState<ParsedResume | null>(null);
  const confirm = trpc.parsing.confirm.useMutation();

  // Initialise the form from the parsed data once loaded.
  const data =
    form ??
    (() => {
      if (!job.data) return null;
      const parsed = parsedResumeSchema.safeParse(job.data.parsed);
      return parsed.success ? parsed.data : EMPTY;
    })();

  const dupes = trpc.candidates.duplicates.useQuery(
    { email: data?.email ?? undefined },
    { enabled: !!data?.email }
  );

  const set = (patch: Partial<ParsedResume>) => setForm({ ...(data ?? EMPTY), ...patch });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Review candidate</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--muted)]">
            ✕
          </button>
        </div>

        {!data ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="space-y-4">
            {dupes.data && dupes.data.length > 0 ? (
              <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                Possible duplicate:{" "}
                {dupes.data.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 ? ", " : ""}
                    <Link href={`/candidates/${d.id}`} className="underline" target="_blank">
                      {[d.firstName, d.lastName].filter(Boolean).join(" ")} ({d.humanId})
                    </Link>
                  </span>
                ))}
                . Confirm still creates a new candidate; merge afterwards from the record if needed.
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs text-[var(--muted)]">{f.label}</span>
                  <input
                    value={(data[f.key] as string | null) ?? ""}
                    onChange={(e) =>
                      set({ [f.key]: e.target.value || null } as Partial<ParsedResume>)
                    }
                    className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Skills</span>
              <textarea
                value={data.skills ?? ""}
                onChange={(e) => set({ skills: e.target.value || null })}
                rows={2}
                className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 text-sm text-[var(--muted)]">
              <p>{data.education.length} education entries</p>
              <p>{data.experience.length} experience entries</p>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Education and experience are imported as parsed; edit them on the candidate record
              after confirming.
            </p>

            <FormError message={confirm.error?.message} />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={confirm.isPending || !data.lastName}
                onClick={() =>
                  confirm.mutate(
                    { id, candidate: { ...data, lastName: data.lastName ?? "" } },
                    { onSuccess: () => void onConfirmed() }
                  )
                }
              >
                {confirm.isPending ? "Creating..." : "Confirm and create"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
