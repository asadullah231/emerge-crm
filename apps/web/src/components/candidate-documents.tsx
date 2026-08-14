"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/form";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Attachment = RouterOutputs["candidates"]["get"]["attachments"][number];

const ACCEPT = ".pdf,.doc,.docx,.rtf,.txt";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CandidateDocuments({
  candidateId,
  files,
  canWrite,
  onChanged
}: {
  candidateId: string;
  files: Attachment[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = trpc.attachments.remove.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message)
  });

  const upload = async (file: File, kind: "cv" | "other") => {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch(`/api/candidates/${candidateId}/documents`, {
        method: "POST",
        body
      });
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

  const hasCv = files.some((f) => f.kind === "cv");

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
                {f.kind === "cv" ? (
                  <span className="ml-2 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
                    CV
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
              if (file) void upload(file, hasCv ? "other" : "cv");
            }}
          />
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? "Uploading..." : hasCv ? "Upload document" : "Upload CV"}
          </Button>
          <span className="text-xs text-[var(--muted)]">PDF, DOC, DOCX, RTF, TXT up to 15 MB</span>
        </div>
      ) : null}
    </div>
  );
}
