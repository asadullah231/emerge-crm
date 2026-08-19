"use client";

import { useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

const KIND_OPTIONS = [
  { value: "recruiter", label: "Recruiter" },
  { value: "interviewer", label: "Interviewer" },
  { value: "client", label: "Client" }
] as const;

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((o) => [o.value, o.label])
);

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-[var(--border)]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Ratings and Reviews related list on the application record (M17c, Zoho
 * Reviews parity): overall candidate-for-role reviews from the recruiter,
 * interviewer or client perspective. Interview scorecards stay separate.
 */
export function ReviewsPanel({
  applicationId,
  canWrite,
  myUserId,
  isAdmin
}: {
  applicationId: string;
  canWrite: boolean;
  myUserId: string | undefined;
  isAdmin: boolean;
}) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("recruiter");
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState("");

  const list = trpc.reviews.byApplication.useQuery({ applicationId });
  const invalidate = () => utils.reviews.byApplication.invalidate({ applicationId });
  const create = trpc.reviews.create.useMutation({
    onSuccess: () => {
      setAdding(false);
      setComment("");
      setRating(4);
      invalidate();
    }
  });
  const remove = trpc.reviews.delete.useMutation({ onSuccess: invalidate });

  const rows = list.data ?? [];

  return (
    <div className="space-y-3">
      <FormError message={create.error?.message ?? remove.error?.message} />

      {rows.length === 0 && !adding ? (
        <p className="text-sm text-[var(--muted)]">No reviews yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <Stars rating={r.rating} />
                  <span className="ml-2 font-medium">{r.reviewerName ?? "Unknown"}</span>
                  <span className="ml-2 rounded-full bg-[var(--card)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] ring-1 ring-[var(--border)]">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  {new Date(r.createdAt).toLocaleDateString()}
                  {canWrite && (isAdmin || r.reviewerUserId === myUserId) ? (
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this review?")) {
                          remove.mutate({ id: r.id });
                        }
                      }}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  ) : null}
                </span>
              </div>
              {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite && !adding ? (
        <Button variant="outline" className="px-3 py-1.5" onClick={() => setAdding(true)}>
          Add review
        </Button>
      ) : null}

      {adding ? (
        <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="review-kind">Reviewing as</Label>
              <select
                id="review-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="review-rating">Rating</Label>
              <select
                id="review-rating"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="review-comment">Comment (optional)</Label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="px-3 py-1.5"
              onClick={() => setAdding(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              className="px-3 py-1.5"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  applicationId,
                  kind: kind as (typeof KIND_OPTIONS)[number]["value"],
                  rating,
                  comment: comment.trim() || undefined
                })
              }
            >
              {create.isPending ? "Saving..." : "Save review"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
