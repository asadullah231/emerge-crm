"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/form";
import type { NotableEntityType } from "@/lib/notes";
import { trpc } from "@/lib/trpc/client";

/**
 * Send one template to a set of selected records, personalised per record via
 * merge fields. Used from the list bulk bar (candidates/contacts).
 */
export function MailMergeModal({
  open,
  onClose,
  entityType,
  entityIds,
  onDone
}: {
  open: boolean;
  onClose: () => void;
  entityType: NotableEntityType;
  entityIds: string[];
  onDone: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  const templates = trpc.emailTemplates.list.useQuery(undefined, { enabled: open });
  const send = trpc.emails.sendBulk.useMutation({
    onSuccess: (r) => {
      setResult({ sent: r.sent, skipped: r.skipped.length });
      onDone();
    }
  });

  const close = () => {
    setResult(null);
    setTemplateId("");
    onClose();
  };

  return (
    <Modal title={`Mail merge (${entityIds.length} selected)`} open={open} onClose={close}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">
            Queued <span className="font-medium">{result.sent}</span> email
            {result.sent === 1 ? "" : "s"}
            {result.skipped > 0 ? `, skipped ${result.skipped} (no email on record)` : ""}.
          </p>
          <Button onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Each recipient gets the template personalised with their own merge fields. Records
            without an email address are skipped.
          </p>
          <label className="block text-sm">
            Template
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            >
              <option value="">Choose a template</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {(templates.data ?? []).length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              No templates yet. Create one in Settings &rarr; Email templates.
            </p>
          ) : null}
          {send.error ? <p className="text-xs text-red-600">{send.error.message}</p> : null}
          <div className="flex gap-2">
            <Button
              disabled={!templateId || send.isPending || entityIds.length === 0}
              onClick={() => send.mutate({ entityType, entityIds, templateId })}
            >
              {send.isPending ? "Sending..." : `Send to ${entityIds.length}`}
            </Button>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
