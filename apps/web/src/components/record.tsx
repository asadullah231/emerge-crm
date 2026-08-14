"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@emerge/ui";
import { Button, Input } from "@/components/form";

export function RecordShell({
  backHref,
  backLabel,
  title,
  subtitle,
  badges,
  actions,
  children
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-[var(--muted)] hover:underline">
          &larr; {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {badges}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function RecordSection({
  title,
  actions,
  children
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">{children}</dl>;
}

/**
 * Inline-editable field: shows the value, click "Edit" to switch to an input.
 * Enter or Save commits, Escape or Cancel reverts. Read-only users get plain text.
 */
export function InlineField({
  label,
  value,
  onSave,
  canEdit,
  type = "text",
  placeholder = "Not set",
  options,
  render,
  saving
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
  canEdit: boolean;
  type?: "text" | "url" | "email" | "tel" | "textarea";
  placeholder?: string;
  /** When set, edit mode renders a select instead of an input. */
  options?: { value: string; label: string }[];
  /** Custom display renderer for view mode. */
  render?: (value: string) => React.ReactNode;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = () => {
    const next = draft.trim() === "" ? null : draft.trim();
    setEditing(false);
    if (next !== (value ?? null)) onSave(next);
  };
  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && type !== "textarea") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="group py-2">
      <dt className="text-xs font-medium text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm">
        {editing ? (
          <div className="flex items-start gap-2">
            {options ? (
              <select
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label={label}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : type === "textarea" ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label={label}
                rows={4}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
            ) : (
              <Input
                autoFocus
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label={label}
                className="py-1.5"
              />
            )}
            <Button onClick={commit} disabled={saving} className="px-3 py-1.5">
              Save
            </Button>
            <Button variant="outline" onClick={cancel} className="px-3 py-1.5">
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex min-h-8 items-center justify-between gap-2">
            <span className={cn(!value && "text-[var(--muted)]", "break-all")}>
              {value
                ? render
                  ? render(value)
                  : options
                    ? (options.find((o) => o.value === value)?.label ?? value)
                    : value
                : placeholder}
            </span>
            {canEdit ? (
              <button
                onClick={() => setEditing(true)}
                aria-label={`Edit ${label}`}
                className="text-xs text-[var(--muted)] opacity-50 transition-opacity hover:text-[var(--accent)] hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
              >
                Edit
              </button>
            ) : null}
          </div>
        )}
      </dd>
    </div>
  );
}

export const COMPANY_STATUS_OPTIONS = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "dormant", label: "Dormant" }
];

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    prospect: "bg-amber-500/10 text-amber-600",
    active: "bg-green-500/10 text-green-600",
    dormant: "bg-zinc-500/10 text-[var(--muted)]"
  };
  const label = COMPANY_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? "bg-zinc-500/10"
      )}
    >
      {label}
    </span>
  );
}

/** Non-blocking duplicate warning shown under create forms. */
export function DuplicateWarning({
  items
}: {
  items: { id: string; label: string; href: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <p className="font-medium text-amber-700 dark:text-amber-500">Possible duplicates</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={d.href} target="_blank" className="text-[var(--accent)] hover:underline">
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-[var(--muted)]">You can still create this record.</p>
    </div>
  );
}
