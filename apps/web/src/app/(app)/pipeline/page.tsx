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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          aria-label="Filter by job"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        >
          <option value="">All jobs</option>
          {jobs.data?.rows.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} ({j.humanId})
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-[var(--muted)]">
        {canWrite
          ? "Drag a candidate between columns to move them through the pipeline."
          : "You have read-only access to the pipeline."}
      </p>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <ApplicationKanban jobId={jobId || undefined} canWrite={canWrite} showJob={!jobId} />
      </div>
    </div>
  );
}
