"use client";

import { useState } from "react";
import { cn } from "@emerge/ui";
import { Button } from "@/components/form";
import type { NotableEntityType } from "@/lib/notes";
import { trpc } from "@/lib/trpc/client";

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-zinc-500/10 text-[var(--muted)]",
  sent: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  failed: "bg-red-500/10 text-red-600",
  received: "bg-green-500/10 text-green-600"
};

function Composer({
  entityType,
  entityId,
  onSent
}: {
  entityType: NotableEntityType;
  entityId: string;
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const templates = trpc.emailTemplates.list.useQuery();
  const send = trpc.emails.send.useMutation({
    onSuccess: () => {
      setSubject("");
      setBody("");
      setTemplateId("");
      onSent();
    }
  });

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.data?.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.bodyHtml);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs text-[var(--muted)]">
          Template
          <select
            value={templateId}
            onChange={(e) => pickTemplate(e.target.value)}
            className={inputClass}
          >
            <option value="">No template</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          To (blank = record email)
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
            className={inputClass}
          />
        </label>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className={inputClass}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Write your message. Merge fields like {{candidate.firstName}} are filled in per record."
        className={inputClass}
      />
      {send.error ? <p className="text-xs text-red-600">{send.error.message}</p> : null}
      <Button
        className="px-3 py-1.5"
        disabled={send.isPending || !subject.trim() || !body.trim()}
        onClick={() =>
          send.mutate({
            entityType,
            entityId,
            to: to.trim() || null,
            subject,
            body,
            templateId: templateId || null
          })
        }
      >
        {send.isPending ? "Sending..." : "Send email"}
      </Button>
    </div>
  );
}

export function CommunicationPanel({
  entityType,
  entityId,
  canWrite
}: {
  entityType: NotableEntityType;
  entityId: string;
  canWrite: boolean;
}) {
  const utils = trpc.useUtils();
  const [composing, setComposing] = useState(false);
  const thread = trpc.emails.byRecord.useQuery({ entityType, entityId });
  const rows = thread.data ?? [];

  const refresh = () => utils.emails.byRecord.invalidate({ entityType, entityId });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--muted)]">
          {rows.length === 0
            ? "No emails yet."
            : `${rows.length} message${rows.length === 1 ? "" : "s"}`}
        </span>
        {canWrite ? (
          <Button className="px-3 py-1.5" onClick={() => setComposing((v) => !v)}>
            {composing ? "Close" : "Compose email"}
          </Button>
        ) : null}
      </div>

      {composing ? (
        <Composer
          entityType={entityType}
          entityId={entityId}
          onSent={() => {
            setComposing(false);
            refresh();
          }}
        />
      ) : null}

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase text-[var(--muted)]">
                    {m.direction === "inbound" ? "Received" : "Sent"}
                  </span>
                  <span className="font-medium">{m.subject}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_STYLE[m.status] ?? "bg-zinc-500/10"
                    )}
                  >
                    {m.status}
                  </span>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {new Date(m.sentAt ?? m.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {m.direction === "inbound" ? `from ${m.fromAddr}` : `to ${m.toAddrs.join(", ")}`}
              </p>
              {m.bodyText ? (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--muted)]">
                  {m.bodyText}
                </p>
              ) : null}
              {m.error ? <p className="mt-1 text-xs text-red-600">Error: {m.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
