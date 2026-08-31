"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTITY_META, type NotableEntityType } from "@/lib/notes";
import { relativeTime } from "@/lib/time";
import { trpc } from "@/lib/trpc/client";

export function NotificationBell() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  // Light polling keeps the badge current without websockets.
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const list = trpc.notifications.list.useQuery({ limit: 15 }, { enabled: open });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    }
  });
  const markAll = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    }
  });

  const count = unread.data ?? 0;

  const openTarget = (n: {
    id: string;
    entityType: string;
    entityId: string;
    readAt: string | Date | null;
  }) => {
    if (!n.readAt) markRead.mutate({ id: n.id });
    setOpen(false);
    if (n.entityType === "task") {
      router.push("/tasks");
      return;
    }
    const meta = ENTITY_META[n.entityType as NotableEntityType];
    if (meta) router.push(`${meta.path}/${n.entityId}`);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-sm hover:bg-[var(--background)]"
      >
        <span aria-hidden>🔔</span>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-secondary)] px-1 text-[10px] font-semibold text-[var(--brand-on)]">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {count > 0 ? (
                <button
                  className="text-xs text-[var(--accent)] hover:underline"
                  onClick={() => markAll.mutate()}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {list.isLoading ? (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Loading...</p>
              ) : list.data && list.data.length > 0 ? (
                <ul>
                  {list.data.map((n) => {
                    const label =
                      ENTITY_META[n.entityType as NotableEntityType]?.label.toLowerCase();
                    const snippet = (n.taskSubject ?? n.noteBody ?? "")
                      .split("\n")[0]!
                      .slice(0, 80);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openTarget(n)}
                          className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--background)]"
                        >
                          {!n.readAt ? (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-secondary)]" />
                          ) : (
                            <span className="mt-1.5 h-2 w-2 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="text-sm">
                              <span className="font-medium">{n.actorName ?? "Someone"}</span>{" "}
                              {n.kind === "task_assigned"
                                ? "assigned a task to you"
                                : n.kind === "record_assigned"
                                  ? `assigned a ${label ?? "record"} to you`
                                  : n.kind === "followed_update"
                                    ? `updated a ${label ?? "record"} you follow`
                                    : n.kind === "submission_verdict"
                                      ? `left a client verdict${label ? ` on a ${label}` : ""}`
                                      : n.kind === "email_reply"
                                        ? `replied${label ? ` on a ${label}` : ""}`
                                        : `mentioned you ${label ? `on a ${label}` : ""}`}
                            </span>
                            {snippet ? (
                              <span className="block truncate text-xs text-[var(--muted)]">
                                {snippet}
                              </span>
                            ) : null}
                            <span className="block text-[10px] text-[var(--muted)]">
                              {relativeTime(n.createdAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                  You&apos;re all caught up.
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
