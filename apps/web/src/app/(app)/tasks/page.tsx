"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { ReportsView } from "@/components/reports-view";
import { TasksView } from "@/components/tasks-view";

const TABS = ["tasks", "reports", "activity"] as const;
type Tab = (typeof TABS)[number];

/**
 * Tasks, Reports and Activity share one page (client request 29 Aug);
 * /reports and /activity redirect here with ?tab=.
 */
export default function TasksPage() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "tasks";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "reports" || t === "activity" ? t : "tasks";
  });

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
