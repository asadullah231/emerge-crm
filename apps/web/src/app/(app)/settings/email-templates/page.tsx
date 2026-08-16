"use client";

import { useState } from "react";
import { Button, FormError, Input, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]";

const MERGE_HINT =
  "Merge fields: {{candidate.firstName}}, {{candidate.fullName}}, {{candidate.title}}, {{job.title}}, {{company.name}}, {{contact.firstName}}";

type Template = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  category: string | null;
};

function TemplateForm({
  initial,
  onSaved,
  onCancel
}: {
  initial?: Template;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.bodyHtml ?? "");
  const utils = trpc.useUtils();
  const create = trpc.emailTemplates.create.useMutation({
    onSuccess: () => {
      utils.emailTemplates.list.invalidate();
      onSaved();
    }
  });
  const update = trpc.emailTemplates.update.useMutation({
    onSuccess: () => {
      utils.emailTemplates.list.invalidate();
      onSaved();
    }
  });
  const pending = create.isPending || update.isPending;
  const error = create.error?.message ?? update.error?.message;

  const submit = () => {
    if (initial) {
      update.mutate({
        id: initial.id,
        patch: { name, subject, bodyHtml: body, category: category || null }
      });
    } else {
      create.mutate({ name, subject, bodyHtml: body, category: category || null });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tpl-name">Name</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="tpl-cat">Category (optional)</Label>
          <Input id="tpl-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="tpl-subject">Subject</Label>
        <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="tpl-body">Body</Label>
        <textarea
          id="tpl-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{MERGE_HINT}</p>
      </div>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button disabled={pending || !name || !subject || !body} onClick={submit}>
          {pending ? "Saving..." : initial ? "Save changes" : "Create template"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function EmailTemplatesSettingsPage() {
  const list = trpc.emailTemplates.list.useQuery();
  const utils = trpc.useUtils();
  const remove = trpc.emailTemplates.remove.useMutation({
    onSuccess: () => utils.emailTemplates.list.invalidate()
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Email templates</h1>
          <p className="text-sm text-[var(--muted)]">
            Reusable emails with merge fields, used by the composer and mail merge.
          </p>
        </div>
        {!creating ? <Button onClick={() => setCreating(true)}>New template</Button> : null}
      </div>

      {creating ? (
        <TemplateForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
      ) : null}

      {rows.length === 0 && !creating ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          No templates yet. Create one to speed up outreach and mail merge.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) =>
            editing === t.id ? (
              <li key={t.id}>
                <TemplateForm
                  initial={t}
                  onSaved={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {t.name}
                    {t.category ? (
                      <span className="ml-2 rounded-full bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--muted)]">
                        {t.category}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-[var(--muted)]">{t.subject}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(t.id)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete template "${t.name}"?`))
                        remove.mutate({ id: t.id });
                    }}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
