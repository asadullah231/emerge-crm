"use client";

import { useState } from "react";
import { ApplicationKanban } from "@/components/application-kanban";
import { trpc } from "@/lib/trpc/client";

export default function PipelinePage() {
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const [jobId, setJobId] = useState("");

  const jobs = trpc.jobs.list.useQuery({
    page: 1,
    pageSize: 200,
    sortBy: "title",
    sortDir: "asc",
    deleted: false
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-[var(--muted)]">
            {canWrite
              ? "Drag candidates between stages to move them forward."
              : "You have read-only access to the pipeline."}
          </p>
        </div>
        <div className="relative">
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            aria-label="Filter by job"
            className="w-full max-w-72 appearance-none truncate rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 pl-3 pr-9 text-sm shadow-xs outline-none transition-colors focus:border-[var(--brand-secondary)] focus:ring-2 focus:ring-[var(--brand-secondary-soft)]"
          >
            <option value="">All jobs</option>
            {jobs.data?.rows.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} ({j.humanId})
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </div>
      </div>

      <ApplicationKanban jobId={jobId || undefined} canWrite={canWrite} showJob={!jobId} fill />
    </div>
  );
}
