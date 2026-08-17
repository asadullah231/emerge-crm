"use client";

/**
 * Zoho Recruit-style Pipeline View: one row per job opening, one column per
 * pipeline stage, each stage cell a right-pointing funnel ribbon holding the
 * live candidate count in that job + stage. Self-contained - owns its All Users
 * / All Clients filters and a sortable first column. The panel is a fixed height
 * with the rows scrolling inside it (sticky header + sticky first column), like
 * Zoho. Clicking a ribbon opens that job's page. Real data only
 * (dashboard.pipelineByJob); no mock rows.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";

/** The seven pipeline stages, in order, matching Zoho's Pipeline View columns. */
type PipelineStage =
  "screening" | "submitted" | "interview" | "offered" | "hired" | "rejected" | "archived";

/** Column label + the header accent strip colour (Zoho's funnel palette). */
const COLUMNS: { stage: PipelineStage; label: string; color: string }[] = [
  { stage: "screening", label: "Screening", color: "#3a9bd1" },
  { stage: "submitted", label: "Submissions", color: "#0b2149" },
  { stage: "interview", label: "Interview", color: "#e08a2b" },
  { stage: "offered", label: "Offered", color: "#b0a020" },
  { stage: "hired", label: "Hired", color: "#0c7c71" },
  { stage: "rejected", label: "Rejected", color: "#d64545" },
  { stage: "archived", label: "Archived", color: "#9aa5b1" }
];

/** Right-pointing funnel ribbon (flat left, arrow right, small left notch). */
const RIBBON_CLIP =
  "polygon(0 0, calc(100% - 11px) 0, 100% 50%, calc(100% - 11px) 100%, 0 100%, 11px 50%)";

const selectClass =
  "rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm text-[var(--foreground)]";

type SortKey = "total" | "title-asc" | "title-desc";

export function PipelineView() {
  const [ownerId, setOwnerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [sort, setSort] = useState<SortKey>("total");

  const members = trpc.members.list.useQuery();
  const companies = trpc.companies.list.useQuery({ page: 1, pageSize: 200 });
  const pipeline = trpc.dashboard.pipelineByJob.useQuery(
    { ownerId: ownerId || undefined, companyId: companyId || undefined },
    { refetchInterval: 30_000, refetchOnWindowFocus: true }
  );

  const rows = useMemo(() => {
    const list = [...(pipeline.data ?? [])];
    if (sort === "title-asc") list.sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
    else if (sort === "title-desc") list.sort((a, b) => b.jobTitle.localeCompare(a.jobTitle));
    else list.sort((a, b) => b.total - a.total);
    return list;
  }, [pipeline.data, sort]);

  const cycleSort = () =>
    setSort((s) => (s === "title-asc" ? "title-desc" : s === "title-desc" ? "total" : "title-asc"));
  const sortGlyph = sort === "title-asc" ? "↑" : sort === "title-desc" ? "↓" : "⇅";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Pipeline View</h2>
          <button
            type="button"
            onClick={() => pipeline.refetch()}
            title="Refresh"
            aria-label="Refresh pipeline"
            className={`text-[var(--muted)] hover:text-[var(--accent)] ${
              pipeline.isFetching ? "animate-spin" : ""
            }`}
          >
            <RefreshIcon />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
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
            onChange={(e) => setCompanyId(e.target.value)}
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
        // Fixed-height panel: rows scroll inside, header + first column stay put.
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left align-bottom">
                  <button
                    type="button"
                    onClick={cycleSort}
                    className="flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Posting Title / Client Name
                    <span className="text-[10px]">{sortGlyph}</span>
                  </button>
                </th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.stage}
                    className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--card)] px-2 pb-2 pt-3 text-center text-xs font-medium text-[var(--foreground)]"
                  >
                    <span
                      className="absolute inset-x-1 top-0 h-1 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.jobId} className="group">
                  <td className="sticky left-0 z-10 bg-[var(--card)] px-3 py-2.5 group-hover:bg-[var(--background)]">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[var(--muted)]">
                        <BinocularsIcon />
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/jobs/${r.jobId}`}
                          className="block truncate font-medium text-[var(--accent)] hover:underline"
                          title={r.jobTitle}
                        >
                          {r.jobTitle}{" "}
                          <span className="font-normal text-[var(--muted)]">({r.total})</span>
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
                      </span>
                    </div>
                  </td>
                  {COLUMNS.map((c) => {
                    const n = r.counts[c.stage];
                    return (
                      <td
                        key={c.stage}
                        className="px-2 py-2.5 text-center group-hover:bg-[var(--background)]"
                      >
                        {n > 0 ? (
                          <Link
                            href={`/jobs/${r.jobId}`}
                            title={`${n} in ${c.label} · ${r.jobTitle}`}
                            className="mx-auto flex h-7 w-full max-w-[86px] items-center justify-center pr-1.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
                            style={{
                              backgroundColor: "var(--brand-primary)",
                              clipPath: RIBBON_CLIP
                            }}
                          >
                            {n}
                          </Link>
                        ) : (
                          <span className="text-[var(--border)]">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function BinocularsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="15" r="3.4" />
      <circle cx="18" cy="15" r="3.4" />
      <path d="M6 11.6V7a1.6 1.6 0 0 1 3.2 0v4.2" />
      <path d="M18 11.6V7a1.6 1.6 0 0 0-3.2 0v4.2" />
      <path d="M9.2 9.5h5.6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
