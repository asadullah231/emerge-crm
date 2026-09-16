"use client";

import { useEffect, useState } from "react";
import { Button, FormError } from "@/components/form";
import { NoteBody } from "@/components/note-body";
import { trpc } from "@/lib/trpc/client";

/**
 * One-click pre-search report: generates the LinkedIn Recruiter boolean pack
 * for a job via the workspace AI settings and shows it ready to copy or save
 * as a job note. Wide dialog because the report is long.
 */
export function SearchPackModal({
  open,
  onClose,
  jobId,
  canWrite
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const [report, setReport] = useState<string | null>(null);
  const [sources, setSources] = useState<{ documents: number; notes: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const generate = trpc.matching.searchPack.useMutation({
    onSuccess: (res) => {
      setReport(res.report);
      setSources({ documents: res.documentsUsed, notes: res.notesUsed });
    }
  });
  const saveNote = trpc.notes.create.useMutation({
    onSuccess: async () => {
      setSavedNote(true);
      await utils.notes.list.invalidate({ entityType: "job", entityId: jobId });
    }
  });

  useEffect(() => {
    if (open) {
      setReport(null);
      setCopied(false);
      setSavedNote(false);
      generate.mutate({ jobId });
    }
    // Fire once per open; the mutation object identity changes every render.
  }, [open, jobId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the user can still select the text manually.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pre-search report"
        className="w-full max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">Pre-Search Report &amp; Boolean Pack</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
          >
            &#10005;
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          {generate.isPending ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              Analysing the job description, client call summary, attached documents and notes, then
              writing the report. This usually takes 30-60 seconds...
            </p>
          ) : generate.error ? (
            <FormError message={generate.error.message} />
          ) : report ? (
            <>
              {sources ? (
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Sources analysed: job details
                  {sources.documents > 0
                    ? ` + ${sources.documents} attached ${sources.documents === 1 ? "document" : "documents"}`
                    : ""}
                  {sources.notes > 0
                    ? ` + ${sources.notes} ${sources.notes === 1 ? "note" : "notes"}`
                    : ""}
                  {sources.documents === 0 && sources.notes === 0
                    ? " only (no readable attachments or notes on this job)"
                    : ""}
                </p>
              ) : null}
              <NoteBody body={report} />
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button
            variant="outline"
            className="px-3 py-1.5"
            disabled={generate.isPending}
            onClick={() => {
              setReport(null);
              setSavedNote(false);
              generate.mutate({ jobId });
            }}
          >
            Regenerate
          </Button>
          <div className="flex items-center gap-2">
            {saveNote.error ? <FormError message={saveNote.error.message} /> : null}
            {canWrite ? (
              <Button
                variant="outline"
                className="px-3 py-1.5"
                disabled={!report || saveNote.isPending || savedNote}
                onClick={() =>
                  report &&
                  saveNote.mutate({
                    entityType: "job",
                    entityId: jobId,
                    body: report,
                    kind: "other",
                    mentionUserIds: []
                  })
                }
              >
                {savedNote ? "Saved to notes" : saveNote.isPending ? "Saving..." : "Save as note"}
              </Button>
            ) : null}
            <Button className="px-3 py-1.5" disabled={!report} onClick={copy}>
              {copied ? "Copied" : "Copy report"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
