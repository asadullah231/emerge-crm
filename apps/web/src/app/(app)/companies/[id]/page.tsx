"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, FormError } from "@/components/form";
import { NewContactModal, contactName } from "@/components/new-contact-modal";
import {
  COMPANY_STATUS_OPTIONS,
  FieldGrid,
  InlineField,
  RecordSection,
  RecordShell,
  StatusBadge
} from "@/components/record";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type CompanyPatch = RouterInputs["companies"]["update"]["patch"];

export default function CompanyRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [addingContact, setAddingContact] = useState(false);

  const me = trpc.auth.me.useQuery();
  const company = trpc.companies.get.useQuery({ id: params.id });
  const members = trpc.members.list.useQuery();

  const refresh = () =>
    Promise.all([
      utils.companies.get.invalidate({ id: params.id }),
      utils.companies.list.invalidate()
    ]);

  const update = trpc.companies.update.useMutation({ onSuccess: refresh });
  const softDelete = trpc.companies.softDelete.useMutation({
    onSuccess: async () => {
      await utils.companies.list.invalidate();
      router.push("/companies");
    }
  });
  const restore = trpc.companies.restore.useMutation({ onSuccess: refresh });

  if (company.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading company...</p>;
  }
  if (company.error || !company.data) {
    return <FormError message={company.error?.message ?? "Company not found"} />;
  }

  const record = company.data;
  const isDeleted = Boolean(record.deletedAt);
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const canEdit = canWrite && !isDeleted;

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? [])
      .filter((m) => !m.deactivatedAt || m.userId === record.ownerId)
      .map((m) => ({ value: m.userId, label: m.name }))
  ];

  const save = (field: keyof CompanyPatch) => (value: string | null) =>
    update.mutate({ id: record.id, patch: { [field]: value } as CompanyPatch });

  return (
    <RecordShell
      backHref="/companies"
      backLabel="Companies"
      title={record.name}
      badges={<StatusBadge status={record.status} />}
      actions={
        canWrite ? (
          isDeleted ? (
            <Button
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ id: record.id })}
            >
              Restore
            </Button>
          ) : (
            <Button
              variant="danger"
              disabled={softDelete.isPending}
              onClick={() => {
                if (
                  window.confirm(`Move "${record.name}" to trash? It can be restored for 30 days.`)
                ) {
                  softDelete.mutate({ id: record.id });
                }
              }}
            >
              Delete
            </Button>
          )
        ) : null
      }
    >
      {isDeleted ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This company is in the trash. Restore it to make changes.
        </div>
      ) : null}
      <FormError
        message={update.error?.message ?? softDelete.error?.message ?? restore.error?.message}
      />

      <RecordSection title="Details">
        <FieldGrid>
          <InlineField
            label="Name"
            value={record.name}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={(v) => {
              if (v) update.mutate({ id: record.id, patch: { name: v } });
            }}
          />
          <InlineField
            label="Status"
            value={record.status}
            canEdit={canEdit}
            saving={update.isPending}
            options={COMPANY_STATUS_OPTIONS}
            onSave={(v) => {
              if (v) {
                update.mutate({
                  id: record.id,
                  patch: { status: v as "prospect" | "active" | "dormant" }
                });
              }
            }}
          />
          <InlineField
            label="Website"
            value={record.website}
            canEdit={canEdit}
            saving={update.isPending}
            type="url"
            onSave={save("website")}
            render={(v) => (
              <a
                href={v.includes("://") ? v : `https://${v}`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                {v}
              </a>
            )}
          />
          <InlineField
            label="Account manager"
            value={record.ownerId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={ownerOptions}
            placeholder="Unassigned"
            onSave={(v) => update.mutate({ id: record.id, patch: { ownerId: v || null } })}
          />
          <InlineField
            label="Industry"
            value={record.industry}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("industry")}
          />
          <InlineField
            label="Company size"
            value={record.size}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("size")}
          />
          <InlineField
            label="Location"
            value={record.location}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("location")}
          />
          <InlineField
            label="Phone"
            value={record.phone}
            canEdit={canEdit}
            saving={update.isPending}
            type="tel"
            onSave={save("phone")}
          />
        </FieldGrid>
        <div className="mt-2">
          <InlineField
            label="About"
            value={record.description}
            canEdit={canEdit}
            saving={update.isPending}
            type="textarea"
            onSave={save("description")}
          />
        </div>
      </RecordSection>

      <RecordSection
        title={`Contacts (${record.contacts.length})`}
        actions={
          canEdit ? (
            <Button
              variant="outline"
              className="px-3 py-1.5"
              onClick={() => setAddingContact(true)}
            >
              Add contact
            </Button>
          ) : null
        }
      >
        {record.contacts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No contacts linked to this company yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {record.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                    {contactName(c)}
                  </Link>
                  {c.isPrimary ? (
                    <span className="ml-2 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
                      Primary
                    </span>
                  ) : null}
                  {c.title ? <span className="ml-2 text-[var(--muted)]">{c.title}</span> : null}
                </div>
                <span className="text-[var(--muted)]">{c.email}</span>
              </li>
            ))}
          </ul>
        )}
      </RecordSection>

      {record.tags.length > 0 ? (
        <RecordSection title="Tags">
          <div className="flex flex-wrap gap-2">
            {record.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs"
              >
                {t.name}
              </span>
            ))}
          </div>
        </RecordSection>
      ) : null}

      <p className="text-xs text-[var(--muted)]">
        Created {new Date(record.createdAt).toLocaleString()} - Last updated{" "}
        {new Date(record.updatedAt).toLocaleString()}
      </p>

      <NewContactModal
        open={addingContact}
        onClose={() => setAddingContact(false)}
        defaultCompanyId={record.id}
      />
    </RecordShell>
  );
}
