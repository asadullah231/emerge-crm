"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@emerge/ui";
import { Button, FormError } from "@/components/form";
import { candidateName } from "@/components/new-candidate-modal";
import { trpc } from "@/lib/trpc/client";

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-green-500/10 text-green-600"
      : score >= 50
        ? "bg-[var(--brand-secondary-soft)] text-[var(--brand-secondary)]"
        : "bg-[var(--background)] text-[var(--muted)]";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)}>
      {score}
    </span>
  );
}

function MatchedChips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span
          key={s}
          className="rounded-full bg-[var(--brand-secondary-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-secondary)]"
        >
          {s}
        </span>
      ))}
    </span>
  );
}

/**
 * Matching candidates for a job (M18, Zoho Zia parity): lexical top-10 with
 * matched skills, an optional AI rerank through the workspace LLM (score +
 * one-line reason per candidate) and one-click Associate into the pipeline.
 */
export function JobMatchesPanel({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const matches = trpc.matching.forJob.useQuery({ jobId, limit: 10 });
  const aiRank = trpc.matching.aiRank.useMutation();
  const associate = trpc.applications.create.useMutation({
    onSuccess: () => {
      utils.matching.forJob.invalidate({ jobId });
      utils.applications.board.invalidate();
    }
  });

  const [associatingId, setAssociatingId] = useState<string | null>(null);
  const aiByCandidate = new Map((aiRank.data ?? []).map((r) => [r.candidateId, r]));

  if (matches.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Scoring candidates...</p>;
  }
  const rows = matches.data?.matches ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No matching candidates found yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Top {rows.length} of {matches.data?.poolSize.toLocaleString()} candidates, scored on
          skills, title, description and location.
        </p>
        <Button
          variant="outline"
          className="px-3 py-1.5"
          disabled={aiRank.isPending}
          onClick={() => aiRank.mutate({ jobId, candidateIds: rows.map((r) => r.id).slice(0, 15) })}
        >
          {aiRank.isPending ? "AI ranking..." : "AI rank"}
        </Button>
      </div>
      <FormError message={aiRank.error?.message ?? associate.error?.message} />

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((m) => {
          const ai = aiByCandidate.get(m.id);
          return (
            <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/candidates/${m.id}`}
                    className="text-sm font-medium hover:text-[var(--accent)] hover:underline"
                  >
                    {candidateName({ firstName: m.firstName, lastName: m.lastName })}
                  </Link>
                  <ScoreBadge score={m.score} />
                  {ai ? (
                    <span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-primary)]">
                      AI {Math.round(ai.score)}
                    </span>
                  ) : null}
                </div>
                {m.title ? <p className="text-xs text-[var(--muted)]">{m.title}</p> : null}
                <div className="mt-1">
                  <MatchedChips items={m.matchedSkills} />
                </div>
                {ai ? <p className="mt-1 text-xs italic text-[var(--muted)]">{ai.reason}</p> : null}
              </div>
              <div className="shrink-0">
                {m.applicationId ? (
                  <Link
                    href={`/applications/${m.applicationId}`}
                    className="rounded-full bg-[var(--background)] px-2 py-1 text-xs text-[var(--muted)] hover:underline"
                  >
                    In pipeline
                  </Link>
                ) : canWrite ? (
                  <Button
                    variant="outline"
                    className="px-3 py-1"
                    disabled={associate.isPending && associatingId === m.id}
                    onClick={() => {
                      setAssociatingId(m.id);
                      associate.mutate({ candidateId: m.id, jobId, source: "matching" });
                    }}
                  >
                    {associate.isPending && associatingId === m.id ? "Adding..." : "Associate"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Matching open jobs for a candidate (M18): lexical scores + Associate. */
export function CandidateMatchesPanel({
  candidateId,
  canWrite
}: {
  candidateId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const matches = trpc.matching.forCandidate.useQuery({ candidateId, limit: 10 });
  const associate = trpc.applications.create.useMutation({
    onSuccess: () => {
      utils.matching.forCandidate.invalidate({ candidateId });
      utils.applications.board.invalidate();
    }
  });
  const [associatingId, setAssociatingId] = useState<string | null>(null);

  if (matches.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Scoring open jobs...</p>;
  }
  const rows = matches.data?.matches ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No matching open jobs found.</p>;
  }

  return (
    <div className="space-y-2">
      <FormError message={associate.error?.message} />
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/jobs/${m.id}`}
                  className="text-sm font-medium hover:text-[var(--accent)] hover:underline"
                >
                  {m.title}
                </Link>
                <ScoreBadge score={m.score} />
              </div>
              {m.location ? <p className="text-xs text-[var(--muted)]">{m.location}</p> : null}
              <div className="mt-1">
                <MatchedChips items={m.matchedSkills} />
              </div>
            </div>
            <div className="shrink-0">
              {m.applicationId ? (
                <Link
                  href={`/applications/${m.applicationId}`}
                  className="rounded-full bg-[var(--background)] px-2 py-1 text-xs text-[var(--muted)] hover:underline"
                >
                  In pipeline
                </Link>
              ) : canWrite ? (
                <Button
                  variant="outline"
                  className="px-3 py-1"
                  disabled={associate.isPending && associatingId === m.id}
                  onClick={() => {
                    setAssociatingId(m.id);
                    associate.mutate({ candidateId, jobId: m.id, source: "matching" });
                  }}
                >
                  {associate.isPending && associatingId === m.id ? "Adding..." : "Associate"}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
