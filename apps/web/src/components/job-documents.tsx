"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/form";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Attachment = RouterOutputs["jobs"]["get"]["attachments"][number];

const ACCEPT = ".pdf,.doc,.docx,.rtf,.txt";

/** Job document categories, mirroring Zoho's attachment sections (M15). */
type JobKind = "job_description" | "client_meeting_summary" | "other";

const KIND_LABEL: Partial<Record<Attachment["kind"], string>> = {
  job_description: "Job description",
  client_meeting_summary: "Client meeting summary"
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobDocuments({
  jobId,
  files,
  canWrite,
  onChanged
}: {
  jobId: string;
  files: Attachment[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<JobKind>("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = trpc.attachments.remove.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message)
  });

  const pick = (kind: JobKind) => {
    kindRef.current = kind;
    inputRef.current?.click();
  };

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kindRef.current);
      const res = await fetch(`/api/jobs/${jobId}/documents`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Upload failed");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const download = async (id: string) => {
    setError(null);
    try {
      const { url } = await utils.attachments.downloadUrl.fetch({ id });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {files.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No documents uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <button
                  onClick={() => download(f.id)}
                  className="truncate font-medium text-[var(--accent)] hover:underline"
                >
                  {f.filename}
                </button>
                {KIND_LABEL[f.kind] ? (
                  <span className="ml-2 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
                    {KIND_LABEL[f.kind]}
                  </span>
                ) : null}
                <span className="ml-2 text-xs text-[var(--muted)]">{formatSize(f.size)}</span>
              </div>
              {canWrite ? (
                <button
                  onClick={() => remove.mutate({ id: f.id })}
                  disabled={remove.isPending}
                  className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={uploading}
            onClick={() => pick("job_description")}
          >
            {uploading ? "Uploading..." : "Upload job description"}
          </Button>
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={uploading}
            onClick={() => pick("client_meeting_summary")}
          >
            Upload meeting summary
          </Button>
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={uploading}
            onClick={() => pick("other")}
          >
            Other document
          </Button>
          <span className="text-xs text-[var(--muted)]">PDF, DOC, DOCX, RTF, TXT up to 15 MB</span>
        </div>
      ) : null}
    </div>
  );
}
