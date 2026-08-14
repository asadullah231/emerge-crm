"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, FormError } from "@/components/form";
import { contactName } from "@/components/new-contact-modal";
import { FieldGrid, InlineField, RecordSection, RecordShell } from "@/components/record";
import { NotesPanel } from "@/components/notes-panel";
import { TimelinePanel } from "@/components/timeline-panel";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type ContactPatch = RouterInputs["contacts"]["update"]["patch"];

export default function ContactRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const me = trpc.auth.me.useQuery();
  const contact = trpc.contacts.get.useQuery({ id: params.id });
  const members = trpc.members.list.useQuery();
  const companyOptions = trpc.companies.list.useQuery({
    page: 1,
    pageSize: 200,
    sortBy: "name",
    sortDir: "asc",
    deleted: false
  });

  const refresh = () =>
    Promise.all([
      utils.contacts.get.invalidate({ id: params.id }),
      utils.contacts.list.invalidate()
    ]);

  const update = trpc.contacts.update.useMutation({ onSuccess: refresh });
  const softDelete = trpc.contacts.softDelete.useMutation({
    onSuccess: async () => {
      await utils.contacts.list.invalidate();
      router.push("/contacts");
    }
  });
  const restore = trpc.contacts.restore.useMutation({ onSuccess: refresh });

  if (contact.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading contact...</p>;
  }
  if (contact.error || !contact.data) {
    return <FormError message={contact.error?.message ?? "Contact not found"} />;
  }

  const record = contact.data;
  const isDeleted = Boolean(record.deletedAt);
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const canEdit = canWrite && !isDeleted;
  const fullName = contactName(record);

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? [])
      .filter((m) => !m.deactivatedAt || m.userId === record.ownerId)
      .map((m) => ({ value: m.userId, label: m.name }))
  ];
  const companySelectOptions = [
    { value: "", label: "No company (independent)" },
    ...(companyOptions.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }))
  ];

  const save = (field: keyof ContactPatch) => (value: string | null) =>
    update.mutate({ id: record.id, patch: { [field]: value } as ContactPatch });

  return (
    <RecordShell
      backHref="/contacts"
      backLabel="Contacts"
      title={fullName}
      subtitle={
        record.companyId && record.companyName ? (
          <>
            {record.title ? `${record.title} at ` : "Works at "}
            <Link
              href={`/companies/${record.companyId}`}
              className="text-[var(--accent)] hover:underline"
            >
              {record.companyName}
            </Link>
          </>
        ) : (
          (record.title ?? "Independent contact")
        )
      }
      badges={
        record.isPrimary ? (
          <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
            Primary contact
          </span>
        ) : null
      }
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
                  window.confirm(`Move "${fullName}" to trash? It can be restored for 30 days.`)
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
          This contact is in the trash. Restore it to make changes.
        </div>
      ) : null}
      <FormError
        message={update.error?.message ?? softDelete.error?.message ?? restore.error?.message}
      />

      <RecordSection title="Details">
        <FieldGrid>
          <InlineField
            label="First name"
            value={record.firstName}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("firstName")}
          />
          <InlineField
            label="Last name"
            value={record.lastName}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={(v) => {
              if (v) update.mutate({ id: record.id, patch: { lastName: v } });
            }}
          />
          <InlineField
            label="Job title"
            value={record.title}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("title")}
          />
          <InlineField
            label="Company"
            value={record.companyId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={companySelectOptions}
            placeholder="Independent"
            onSave={(v) => update.mutate({ id: record.id, patch: { companyId: v || null } })}
          />
          <InlineField
            label="Email"
            value={record.email}
            canEdit={canEdit}
            saving={update.isPending}
            type="email"
            onSave={save("email")}
          />
          <InlineField
            label="Secondary email"
            value={record.secondaryEmail}
            canEdit={canEdit}
            saving={update.isPending}
            type="email"
            onSave={save("secondaryEmail")}
          />
          <InlineField
            label="Work phone"
            value={record.workPhone}
            canEdit={canEdit}
            saving={update.isPending}
            type="tel"
            onSave={save("workPhone")}
          />
          <InlineField
            label="Mobile"
            value={record.mobile}
            canEdit={canEdit}
            saving={update.isPending}
            type="tel"
            onSave={save("mobile")}
          />
          <InlineField
            label="LinkedIn"
            value={record.linkedinUrl}
            canEdit={canEdit}
            saving={update.isPending}
            type="url"
            onSave={save("linkedinUrl")}
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
            label="Primary contact"
            value={record.isPrimary ? "yes" : "no"}
            canEdit={canEdit && Boolean(record.companyId)}
            saving={update.isPending}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" }
            ]}
            onSave={(v) => update.mutate({ id: record.id, patch: { isPrimary: v === "yes" } })}
          />
          <InlineField
            label="Owner"
            value={record.ownerId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={ownerOptions}
            placeholder="Unassigned"
            onSave={(v) => update.mutate({ id: record.id, patch: { ownerId: v || null } })}
          />
        </FieldGrid>
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
      <RecordSection title="Notes">
        <NotesPanel entityType="contact" entityId={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Timeline">
        <TimelinePanel entityType="contact" entityId={record.id} />
      </RecordSection>
    </RecordShell>
  );
}
