"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@emerge/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { InterviewsView } from "@/components/interviews-view";
import { ReportsView } from "@/components/reports-view";
import { TasksView } from "@/components/tasks-view";

const TABS = ["tasks", "interviews", "reports", "activity"] as const;
type Tab = (typeof TABS)[number];

/**
 * Tasks, Interviews, Reports and Activity share one page (client request
 * 29 Aug); /interviews, /reports and /activity redirect here with ?tab=,
 * and the sidebar's Interviews item links straight to its tab.
 */
export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksHub />
    </Suspense>
  );
}

function TasksHub() {
  const urlTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(TABS.includes(urlTab as Tab) ? (urlTab as Tab) : "tasks");

  // Follow the URL when it changes while already on this page (nav clicks).
  useEffect(() => {
    setTab(TABS.includes(urlTab as Tab) ? (urlTab as Tab) : "tasks");
  }, [urlTab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "tasks" ? (
        <TasksView />
      ) : tab === "interviews" ? (
        <InterviewsView />
      ) : tab === "reports" ? (
        <ReportsView />
      ) : (
        <div className="mx-auto max-w-3xl space-y-3">
          <div>
            <h1 className="text-lg font-semibold">Activity</h1>
            <p className="text-sm text-[var(--muted)]">Recent activity across your workspace.</p>
          </div>
          <ActivityFeed />
        </div>
      )}
    </div>
  );
}
