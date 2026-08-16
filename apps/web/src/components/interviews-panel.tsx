"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { Button } from "@/components/form";
import { ScheduleInterviewModal } from "@/components/schedule-interview-modal";
import {
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_STYLE,
  INTERVIEW_TYPE_LABEL,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_OPTIONS
} from "@/lib/interviews";
import { trpc } from "@/lib/trpc/client";

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        INTERVIEW_STATUS_STYLE[status] ?? "bg-zinc-500/10"
      )}
    >
      {INTERVIEW_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function FeedbackForm({ interviewId, onDone }: { interviewId: string; onDone: () => void }) {
  const [rating, setRating] = useState("4");
  const [recommendation, setRecommendation] = useState("yes");
  const [comments, setComments] = useState("");
  const submit = trpc.interviewFeedback.submit.useMutation({ onSuccess: onDone });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex gap-2">
        <label className="text-xs text-[var(--muted)]">
          Rating
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="ml-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-sm text-[var(--foreground)]"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Recommendation
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            className="ml-1 rounded border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-sm text-[var(--foreground)]"
          >
            {RECOMMENDATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={2}
        placeholder="Comments"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
      />
      {submit.error ? <p className="text-xs text-red-600">{submit.error.message}</p> : null}
      <Button
        className="px-3 py-1.5"
        disabled={submit.isPending}
        onClick={() =>
          submit.mutate({
            interviewId,
            rating: parseInt(rating, 10),
            recommendation: recommendation as (typeof RECOMMENDATION_OPTIONS)[number]["value"],
            comments: comments.trim() || null
          })
        }
      >
        {submit.isPending ? "Saving..." : "Save feedback"}
      </Button>
    </div>
  );
}

export function InterviewsPanel({
  applicationId,
  canWrite
}: {
  applicationId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const [scheduling, setScheduling] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const list = trpc.interviews.byApplication.useQuery({ applicationId });
  const scorecard = trpc.interviewFeedback.forApplication.useQuery({ applicationId });

  const refresh = () => {
    utils.interviews.byApplication.invalidate({ applicationId });
    utils.interviewFeedback.forApplication.invalidate({ applicationId });
  };
  const setStatus = trpc.interviews.setStatus.useMutation({ onSuccess: refresh });

  const rows = list.data ?? [];
  const agg = scorecard.data?.aggregate;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {agg && agg.count > 0 ? (
          <p className="text-sm">
            Scorecard: <span className="font-medium">{agg.avgRating?.toFixed(1)}</span> avg over{" "}
            {agg.count} ·{" "}
            {Object.entries(agg.recommendations)
              .map(([k, v]) => `${RECOMMENDATION_LABEL[k] ?? k} ${v}`)
              .join(", ")}
          </p>
        ) : (
          <span className="text-sm text-[var(--muted)]">No interviews yet.</span>
        )}
        {canWrite ? (
          <Button className="px-3 py-1.5" onClick={() => setScheduling(true)}>
            Schedule interview
          </Button>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((iv) => (
            <li key={iv.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{INTERVIEW_TYPE_LABEL[iv.type] ?? iv.type}</span>
                    <StatusBadge status={iv.status} />
                    <span className="text-xs text-[var(--muted)]">{iv.humanId}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {new Date(iv.scheduledAt).toLocaleString()} · {iv.durationMins} min
                    {iv.avgRating != null
                      ? ` · ${iv.avgRating.toFixed(1)}★ (${iv.feedbackCount})`
                      : ""}
                  </p>
                  {iv.participants.length > 0 ? (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {iv.participants
                        .map((p) => p.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : null}
                  {iv.meetingLink ? (
                    <a
                      href={iv.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      Join link
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={`/api/interviews/${iv.id}/ics`}
                    className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--background)]"
                  >
                    .ics
                  </a>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => setFeedbackFor(feedbackFor === iv.id ? null : iv.id)}
                      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--background)]"
                    >
                      Feedback
                    </button>
                  ) : null}
                </div>
              </div>

              {canWrite && iv.status === "scheduled" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: iv.id, status: "completed" })}
                    className="text-xs text-green-600 hover:underline disabled:opacity-50"
                  >
                    Mark completed
                  </button>
                  <button
                    type="button"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: iv.id, status: "no_show" })}
                    className="text-xs text-[var(--muted)] hover:underline disabled:opacity-50"
                  >
                    No-show
                  </button>
                  <button
                    type="button"
                    disabled={setStatus.isPending}
                    onClick={() => {
                      const reason = window.prompt("Cancellation reason (optional):") ?? "";
                      setStatus.mutate({
                        id: iv.id,
                        status: "cancelled",
                        cancellationReason: reason || null
                      });
                    }}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              {iv.status === "cancelled" && iv.cancellationReason ? (
                <p className="mt-1 text-xs text-[var(--muted)]">Reason: {iv.cancellationReason}</p>
              ) : null}

              {feedbackFor === iv.id ? (
                <FeedbackForm
                  interviewId={iv.id}
                  onDone={() => {
                    setFeedbackFor(null);
                    refresh();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <ScheduleInterviewModal
        open={scheduling}
        onClose={() => setScheduling(false)}
        applicationId={applicationId}
        onDone={refresh}
      />
    </div>
  );
}
