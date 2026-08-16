"use client";

import { useState } from "react";

type Verdict = "approved" | "rejected";

/**
 * Client-facing Approve / Reject control on the public share page. Posts to the
 * tokened verdict route and then shows the recorded decision. No app session.
 */
export function ShareVerdict({
  token,
  submissionId,
  initialStatus,
  initialComment
}: {
  token: string;
  submissionId: string;
  initialStatus: string;
  initialComment: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [comment, setComment] = useState(initialComment ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decided = status === "approved" || status === "rejected";

  const submit = async (verdict: Verdict, note: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, verdict, comment: note || undefined })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus(verdict);
      setComment(note);
      setRejecting(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (decided) {
    return (
      <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
        <span
          className={
            status === "approved" ? "font-medium text-green-600" : "font-medium text-red-600"
          }
        >
          {status === "approved" ? "Approved" : "Rejected"}
        </span>
        {comment ? <p className="mt-1 text-[var(--muted)]">{comment}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {rejecting ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reason for rejecting (optional)"
            rows={3}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit("rejected", draft.trim())}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("approved", "")}
            className="rounded-md bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-medium text-[var(--brand-on)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="rounded-md border border-[var(--border)] px-4 py-1.5 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
