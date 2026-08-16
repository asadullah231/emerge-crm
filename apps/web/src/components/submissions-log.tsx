"use client";

import Link from "next/link";
import { cn } from "@emerge/ui";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Row = RouterOutputs["submissions"]["byJob"][number];

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]",
  approved: "bg-green-500/10 text-green-600",
  rejected: "bg-red-500/10 text-red-600",
  archived: "bg-zinc-500/10 text-[var(--muted)]"
};
const STATUS_LABEL: Record<string, string> = {
  submitted: "Awaiting client",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Revoked"
};

function SubmissionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status] ?? "bg-zinc-500/10"
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Submission history for a job, client (company) or single application. Read
 * view: each row shows the candidate, status/verdict and any client comment.
 * Writers can revoke a still-open share link.
 */
export function SubmissionsLog({
  mode,
  id,
  canWrite,
  showCandidate = true
}: {
  mode: "job" | "client" | "application";
  id: string;
  canWrite: boolean;
  showCandidate?: boolean;
}) {
  const utils = trpc.useUtils();
  const byJob = trpc.submissions.byJob.useQuery({ jobId: id }, { enabled: mode === "job" });
  const byClient = trpc.submissions.byClient.useQuery(
    { companyId: id },
    { enabled: mode === "client" }
  );
  const byApp = trpc.submissions.forApplication.useQuery(
    { applicationId: id },
    { enabled: mode === "application" }
  );
  const active = mode === "job" ? byJob : mode === "client" ? byClient : byApp;

  const invalidate = () => {
    if (mode === "job") utils.submissions.byJob.invalidate({ jobId: id });
    else if (mode === "client") utils.submissions.byClient.invalidate({ companyId: id });
    else utils.submissions.forApplication.invalidate({ applicationId: id });
  };
  const revoke = trpc.submissions.revoke.useMutation({ onSuccess: invalidate });

  if (active.isLoading) return <p className="text-sm text-[var(--muted)]">Loading...</p>;
  const rows = (active.data ?? []) as Row[];
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No submissions yet.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {showCandidate ? (
                <Link
                  href={`/applications/${r.applicationId}`}
                  className="font-medium hover:text-[var(--accent)] hover:underline"
                >
                  {candidateName({
                    firstName: r.candidateFirstName,
                    lastName: r.candidateLastName
                  })}
                </Link>
              ) : (
                <span className="font-medium">{r.humanId}</span>
              )}
              <SubmissionStatusBadge status={r.status} />
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Sent {new Date(r.sentAt).toLocaleDateString()}
              {r.sentByName ? ` by ${r.sentByName}` : ""}
              {r.verdictAt ? ` · decided ${new Date(r.verdictAt).toLocaleDateString()}` : ""}
            </p>
            {r.clientComment ? (
              <p className="mt-1 rounded-md bg-[var(--background)] px-2 py-1 text-xs">
                &ldquo;{r.clientComment}&rdquo;
              </p>
            ) : null}
          </div>
          {canWrite && r.status === "submitted" ? (
            <button
              type="button"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm("Revoke this share link? The client can no longer respond."))
                  revoke.mutate({ id: r.id });
              }}
              className="shrink-0 text-xs text-[var(--muted)] hover:text-red-600 hover:underline disabled:opacity-50"
            >
              Revoke
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
