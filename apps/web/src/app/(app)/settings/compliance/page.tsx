"use client";

import { useEffect, useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Workspace compliance settings (M20): retention policy + full data export. */
export default function ComplianceSettingsPage() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";
  const policy = trpc.compliance.retentionGet.useQuery();

  const [months, setMonths] = useState(36);
  const [autoDelete, setAutoDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (policy.data) {
      setMonths(policy.data.months);
      setAutoDelete(policy.data.autoDelete);
    }
  }, [policy.data]);

  const save = trpc.compliance.retentionSet.useMutation({
    onSuccess: () => utils.compliance.retentionGet.invalidate()
  });

  const exportAll = async () => {
    setExporting(true);
    try {
      const pkg = await utils.client.compliance.exportWorkspace.query();
      downloadJson(`workspace-export-${new Date().toISOString().slice(0, 10)}.json`, pkg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          GDPR retention policy and workspace data export. Per-candidate export, erase, opt-out and
          blocklist live on each candidate record under Compliance.
        </p>
      </div>

      {!isAdmin ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Only admins can manage compliance settings.
        </p>
      ) : (
        <>
          <section className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <div>
              <h2 className="text-lg font-semibold">Retention policy</h2>
              <p className="text-sm text-[var(--muted)]">
                When auto-delete is on, candidates untouched for the retention period with no live
                applications are moved to the trash daily (30-day restore window still applies).
              </p>
            </div>
            <FormError message={save.error?.message} />
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="retention-months">Retention period (months)</Label>
                <input
                  id="retention-months"
                  type="number"
                  min={6}
                  max={120}
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="w-32 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 pb-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={autoDelete}
                  onChange={(e) => setAutoDelete(e.target.checked)}
                />
                Auto-delete stale candidates
              </label>
              <Button
                disabled={save.isPending || months < 6}
                onClick={() => save.mutate({ months, autoDelete })}
              >
                {save.isPending ? "Saving..." : "Save policy"}
              </Button>
            </div>
            {policy.data ? (
              <p className="text-xs text-[var(--muted)]">
                Current: {policy.data.months} months, auto-delete{" "}
                {policy.data.autoDelete ? "on" : "off"}.
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">No policy saved yet.</p>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <div>
              <h2 className="text-lg font-semibold">Workspace data export</h2>
              <p className="text-sm text-[var(--muted)]">
                One JSON package with every live candidate, client, contact, job and application.
                The export is logged in the audit trail.
              </p>
            </div>
            <Button variant="outline" disabled={exporting} onClick={exportAll}>
              {exporting ? "Exporting..." : "Export workspace data"}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
