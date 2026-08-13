"use client";

import { FormError } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

function formatTimestamp(value: Date | string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export default function AuditLogSettingsPage() {
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";
  const log = trpc.workspace.auditLog.useQuery(undefined, { enabled: isAdmin });

  if (me.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading...</p>;
  }
  if (!isAdmin) {
    return (
      <p className="text-sm text-[var(--muted)]">Only admins can view the audit log.</p>
    );
  }
  if (log.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading audit log...</p>;
  }
  if (log.error) {
    return <FormError message={log.error.message} />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Audit log</h2>
      <p className="text-sm text-[var(--muted)]">
        Authentication and membership events in this workspace, newest first.
      </p>
      {log.data && log.data.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No events recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {log.data?.map((event) => (
                <tr key={event.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                    {formatTimestamp(event.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {event.actorName ?? "System"}
                    {event.actorEmail ? (
                      <span className="ml-1 text-xs text-[var(--muted)]">{event.actorEmail}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <code className="text-xs">{event.action}</code>
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {event.targetType ? `${event.targetType}${event.targetId ? `: ${event.targetId}` : ""}` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
