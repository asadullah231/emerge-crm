"use client";

import Link from "next/link";
import { ENTITY_META, type NotableEntityType } from "@/lib/notes";
import { relativeTime } from "@/lib/time";
import { trpc } from "@/lib/trpc/client";

function titleCase(key: string): string {
  return key.replace(/[_.-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function auditText(action: string, meta: Record<string, unknown> | null | undefined): string {
  const verb = action.split(".").slice(1).join(".");
  if (verb === "updated" && meta && Array.isArray((meta as { fields?: string[] }).fields)) {
    return `updated ${(meta as { fields: string[] }).fields.map(titleCase).join(", ")}`;
  }
  if (verb === "created") return "created";
  if (verb === "deleted") return "deleted";
  if (verb === "restored") return "restored";
  if (verb === "status_changed" && (meta as { status?: string })?.status)
    return `set status to ${titleCase(String((meta as { status: string }).status))}`;
  if (verb === "stage_changed") return "moved stage";
  return titleCase(verb);
}

export default function ActivityPage() {
  const feed = trpc.timeline.feed.useQuery({ limit: 60 });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <p className="text-sm text-[var(--muted)]">Recent activity across your workspace.</p>

      {feed.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : feed.data && feed.data.length > 0 ? (
        <ol className="space-y-3">
          {feed.data.map((e) => {
            const meta = e.entityType ? ENTITY_META[e.entityType as NotableEntityType] : undefined;
            const href = meta && e.entityId ? `${meta.path}/${e.entityId}` : undefined;
            const label = meta?.label.toLowerCase();
            return (
              <li
                key={`${e.kind}-${e.id}`}
                className="flex gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    e.kind === "note" ? "bg-[var(--brand-secondary)]" : "bg-[var(--muted)]"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{e.actorName ?? "System"}</span>{" "}
                  {e.kind === "note" ? (
                    <>
                      added a note{label ? ` on a ${label}` : ""}:{" "}
                      <span className="text-[var(--muted)]">
                        {(e.body ?? "").split("\n")[0]!.slice(0, 100)}
                      </span>
                    </>
                  ) : (
                    <>
                      {auditText(e.action ?? "", e.meta)}
                      {label ? <span className="text-[var(--muted)]"> a {label}</span> : null}
                    </>
                  )}
                  {href ? (
                    <>
                      {" "}
                      <Link href={href} className="text-[var(--accent)] hover:underline">
                        view
                      </Link>
                    </>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {relativeTime(e.createdAt)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-[var(--muted)]">No activity yet.</p>
      )}
    </div>
  );
}
