"use client";

/**
 * Zoho Recruit-style Pipeline View: one row per job opening, one column per
 * pipeline stage, each cell the live candidate count in that job + stage.
 * Self-contained - owns its All Users / All Clients filters and a click-to-drill
 * panel. Real data only (dashboard.pipelineByJob + applicationsByStage); no mock
 * rows. Matches the Emerge dashboard styling (neutral surfaces, brand accents).
 */

import Link from "next/link";
import { useState } from "react";
import { STAGE_ACCENT } from "@/lib/applications";
import { trpc } from "@/lib/trpc/client";

/** The six stages the pipeline matrix shows (archived is intentionally excluded). */
type PipelineStage = "screening" | "submitted" | "interview" | "offered" | "hired" | "rejected";

/** The stage columns shown, in pipeline order. "Submissions" == submitted stage. */
const COLUMNS: { stage: PipelineStage; label: string }[] = [
  { stage: "screening", label: "Screening" },
  { stage: "submitted", label: "Submissions" },
  { stage: "interview", label: "Interview" },
  { stage: "offered", label: "Offered" },
  { stage: "hired", label: "Hired" },
  { stage: "rejected", label: "Rejected" }
];

const selectClass =
  "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)]";

type Selection = { jobId: string; jobTitle: string; stage: PipelineStage; label: string };

export function PipelineView() {
  const [ownerId, setOwnerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);

  const members = trpc.members.list.useQuery();
  const companies = trpc.companies.list.useQuery({ page: 1, pageSize: 200 });
  const pipeline = trpc.dashboard.pipelineByJob.useQuery(
    { ownerId: ownerId || undefined, companyId: companyId || undefined },
    { refetchInterval: 30_000, refetchOnWindowFocus: true }
  );

  const drill = trpc.dashboard.applicationsByStage.useQuery(
    {
      stage: (selected?.stage ?? "screening") as "screening",
      jobId: selected?.jobId,
      ownerId: ownerId || undefined,
      limit: 25
    },
    { enabled: selected != null }
  );

  const rows = pipeline.data ?? [];

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Pipeline View</h2>
          <p className="text-xs text-[var(--muted)]">
            Live candidate counts by stage per job opening
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              setSelected(null);
            }}
            className={selectClass}
            aria-label="Filter by user"
          >
            <option value="">All Users</option>
            {(members.data ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setSelected(null);
            }}
            className={selectClass}
            aria-label="Filter by client"
          >
            <option value="">All Clients</option>
            {(companies.data?.rows ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pipeline.isError ? (
        <p className="py-8 text-center text-sm text-red-600">
          {pipeline.error?.message ?? "Failed to load the pipeline."}
        </p>
      ) : pipeline.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">
          No job openings with candidates for these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2 text-left text-xs font-medium text-[var(--muted)]">
                  Job Opening / Client
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.stage}
                    className={`px-3 py-2 text-center text-xs font-medium ${STAGE_ACCENT[c.stage]}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-medium text-[var(--muted)]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.jobId} className="hover:bg-[var(--background)]">
                  <td className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2">
                    <Link
                      href={`/jobs/${r.jobId}`}
                      className="block truncate font-medium text-[var(--foreground)] hover:text-[var(--accent)] hover:underline"
                      title={r.jobTitle}
                    >
                      {r.jobTitle}
                    </Link>
                    {r.companyId ? (
                      <Link
                        href={`/companies/${r.companyId}`}
                        className="block truncate text-xs text-[var(--muted)] hover:text-[var(--accent)] hover:underline"
                      >
                        {r.companyName}
                      </Link>
                    ) : (
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {r.companyName ?? r.jobHumanId}
                      </span>
                    )}
                  </td>
                  {COLUMNS.map((c) => {
                    const n = r.counts[c.stage];
                    const isActive = selected?.jobId === r.jobId && selected?.stage === c.stage;
                    return (
                      <td key={c.stage} className="px-3 py-2 text-center">
                        {n > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelected(
                                isActive
                                  ? null
                                  : {
                                      jobId: r.jobId,
                                      jobTitle: r.jobTitle,
                                      stage: c.stage,
                                      label: c.label
                                    }
                              )
                            }
                            aria-pressed={isActive}
                            title={`${n} in ${c.label} · ${r.jobTitle}`}
                            className={`inline-flex min-w-[2rem] items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums transition-colors ${
                              isActive
                                ? "bg-[var(--brand-primary)] text-white"
                                : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15"
                            }`}
                          >
                            {n}
                          </button>
                        ) : (
                          <span className="text-[var(--muted)]">0</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-semibold text-[var(--foreground)]">
              {selected.label} · {selected.jobTitle}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Close
            </button>
          </div>
          {drill.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-7 animate-pulse rounded bg-[var(--border)]" />
              ))}
            </div>
          ) : !drill.data || drill.data.length === 0 ? (
            <p className="py-3 text-center text-sm text-[var(--muted)]">No candidates to show.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {drill.data.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/applications/${a.id}`}
                    className="flex items-center justify-between gap-3 py-1.5 hover:bg-[var(--card)]"
                  >
                    <span className="truncate text-sm text-[var(--foreground)]">
                      {[a.candidateFirstName, a.candidateLastName].filter(Boolean).join(" ") ||
                        a.candidateHumanId}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {a.ownerName ?? "Unassigned"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-[var(--border)]" />
      ))}
    </div>
  );
}
