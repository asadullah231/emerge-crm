"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc } from "@/lib/trpc/client";

const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" }
];

/**
 * Submit one or more of a job's candidates to the client in a single send.
 * Fetches the job's live applications, lets the sender pick, then shows the
 * tokened share link once (it cannot be shown again — the token is hashed).
 */
export function SubmitToClientModal({
  open,
  onClose,
  jobId,
  defaultApplicationIds = [],
  onDone
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  defaultApplicationIds?: string[];
  onDone?: () => void;
}) {
  const list = trpc.applications.list.useQuery({ jobId, pageSize: 200 }, { enabled: open });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = trpc.submissions.create.useMutation({
    onSuccess: (res) => {
      setShareUrl(`${window.location.origin}/share/${res.token}`);
      onDone?.();
    }
  });

  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultApplicationIds));
      setNote("");
      setExpiry("");
      setShareUrl(null);
      setCopied(false);
    }
    // defaultApplicationIds is a fresh array each render; key off open only.
  }, [open]);

  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    create.mutate({
      jobId,
      applicationIds: ids,
      note: note.trim() || null,
      expiresInDays: expiry ? parseInt(expiry, 10) : null
    });
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // clipboard blocked; the link is selectable in the field
    }
  };

  return (
    <Modal title="Submit to client" open={open} onClose={onClose}>
      {shareUrl ? (
        <div className="space-y-3">
          <p className="text-sm">
            Share this link with your client. They can review and approve or reject without signing
            in. It is shown once.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
            <Button variant="outline" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <FormError message={create.error?.message} />
          <div>
            <Label>Candidates</Label>
            {list.isLoading ? (
              <p className="text-sm text-[var(--muted)]">Loading candidates...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                No candidates on this job yet. Add candidates to the pipeline first.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                {rows.map((r) => {
                  const name = candidateName({
                    firstName: r.candidateFirstName,
                    lastName: r.candidateLastName
                  });
                  return (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--background)]">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">{r.humanId}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="submit-note">Note to client (optional)</Label>
            <textarea
              id="submit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="A short message shown on the review page."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="submit-expiry">Link expiry</Label>
            <select
              id="submit-expiry"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending || selected.size === 0}>
              {create.isPending
                ? "Submitting..."
                : `Submit ${selected.size || ""} candidate${selected.size === 1 ? "" : "s"}`.trim()}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
