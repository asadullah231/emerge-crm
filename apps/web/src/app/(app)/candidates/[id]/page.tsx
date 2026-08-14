"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AssociateModal } from "@/components/associate-modal";
import { Button, FormError } from "@/components/form";
import { CandidateDocuments } from "@/components/candidate-documents";
import { STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { EducationSection, ExperienceSection } from "@/components/candidate-subrecords";
import { candidateName } from "@/components/new-candidate-modal";
import {
  CANDIDATE_SOURCE_OPTIONS,
  FieldGrid,
  InlineField,
  RecordSection,
  RecordShell,
  SourceBadge
} from "@/components/record";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type CandidatePatch = RouterInputs["candidates"]["update"]["patch"];

export default function CandidateRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [associating, setAssociating] = useState(false);

  const me = trpc.auth.me.useQuery();
  const candidate = trpc.candidates.get.useQuery({ id: params.id });
  const members = trpc.members.list.useQuery();

  const refresh = () =>
    Promise.all([
      utils.candidates.get.invalidate({ id: params.id }),
      utils.candidates.list.invalidate()
    ]);

  const update = trpc.candidates.update.useMutation({ onSuccess: refresh });
  const softDelete = trpc.candidates.softDelete.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate();
      router.push("/candidates");
    }
  });
  const restore = trpc.candidates.restore.useMutation({ onSuccess: refresh });

  if (candidate.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading candidate...</p>;
  }
  if (candidate.error || !candidate.data) {
    return <FormError message={candidate.error?.message ?? "Candidate not found"} />;
  }

  const record = candidate.data;
  const isDeleted = Boolean(record.deletedAt);
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const canEdit = canWrite && !isDeleted;
  const fullName = candidateName(record);

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? [])
      .filter((m) => !m.deactivatedAt || m.userId === record.ownerId)
      .map((m) => ({ value: m.userId, label: m.name }))
  ];

  const save = (field: keyof CandidatePatch) => (value: string | null) =>
    update.mutate({ id: record.id, patch: { [field]: value } as CandidatePatch });

  const saveNumber = (field: keyof CandidatePatch) => (value: string | null) => {
    const n = value ? parseInt(value, 10) : null;
    update.mutate({
      id: record.id,
      patch: { [field]: Number.isFinite(n) ? n : null } as CandidatePatch
    });
  };

  return (
    <RecordShell
      backHref="/candidates"
      backLabel="Candidates"
      title={fullName}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--muted)]">{record.humanId}</span>
          {record.title ? <span>{record.title}</span> : null}
          {record.currentEmployer ? (
            <span className="text-[var(--muted)]">at {record.currentEmployer}</span>
          ) : null}
        </span>
      }
      badges={<SourceBadge source={record.source} />}
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
          This candidate is in the trash. Restore it to make changes.
        </div>
      ) : null}
      <FormError
        message={update.error?.message ?? softDelete.error?.message ?? restore.error?.message}
      />

      <RecordSection title="Profile">
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
            label="Current title"
            value={record.title}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("title")}
          />
          <InlineField
            label="Current employer"
            value={record.currentEmployer}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("currentEmployer")}
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
            label="Phone"
            value={record.phone}
            canEdit={canEdit}
            saving={update.isPending}
            type="tel"
            onSave={save("phone")}
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
            label="City"
            value={record.city}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("city")}
          />
          <InlineField
            label="Country"
            value={record.country}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("country")}
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
            label="Website"
            value={record.websiteUrl}
            canEdit={canEdit}
            saving={update.isPending}
            type="url"
            onSave={save("websiteUrl")}
          />
          <InlineField
            label="Source"
            value={record.source}
            canEdit={canEdit}
            saving={update.isPending}
            options={CANDIDATE_SOURCE_OPTIONS}
            onSave={(v) => {
              if (v) {
                update.mutate({
                  id: record.id,
                  patch: { source: v as CandidatePatch["source"] }
                });
              }
            }}
          />
          <InlineField
            label="Owner (sourcer)"
            value={record.ownerId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={ownerOptions}
            placeholder="Unassigned"
            onSave={(v) => update.mutate({ id: record.id, patch: { ownerId: v || null } })}
          />
          <InlineField
            label="Experience (years)"
            value={record.experienceYears !== null ? String(record.experienceYears) : null}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={saveNumber("experienceYears")}
          />
          <InlineField
            label="Notice period"
            value={record.noticePeriod}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("noticePeriod")}
          />
          <InlineField
            label="Salary expectation"
            value={record.salaryText}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("salaryText")}
          />
        </FieldGrid>
        <div className="mt-2">
          <InlineField
            label="Skills"
            value={record.skills}
            canEdit={canEdit}
            saving={update.isPending}
            type="textarea"
            onSave={save("skills")}
          />
        </div>
      </RecordSection>

      <RecordSection title="Documents">
        <CandidateDocuments
          candidateId={record.id}
          files={record.attachments}
          canWrite={canEdit}
          onChanged={() => utils.candidates.get.invalidate({ id: record.id })}
        />
      </RecordSection>

      <RecordSection title="Experience">
        <ExperienceSection
          candidateId={record.id}
          rows={record.experience}
          canWrite={canEdit}
          onChanged={() => utils.candidates.get.invalidate({ id: record.id })}
        />
      </RecordSection>

      <RecordSection title="Education">
        <EducationSection
          candidateId={record.id}
          rows={record.education}
          canWrite={canEdit}
          onChanged={() => utils.candidates.get.invalidate({ id: record.id })}
        />
      </RecordSection>

      <RecordSection
        title={`Applications (${record.applications.length})`}
        actions={
          canEdit ? (
            <Button className="px-3 py-1.5" onClick={() => setAssociating(true)}>
              Add to job
            </Button>
          ) : null
        }
      >
        {record.applications.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Not on any job pipeline yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {record.applications.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link
                  href={`/jobs/${a.jobId}`}
                  className="font-medium hover:text-[var(--accent)] hover:underline"
                >
                  {a.jobTitle}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted)]">
                    {STAGE_LABELS[a.stage as ApplicationStageKey] ?? a.stage}
                  </span>
                  <Link
                    href={`/applications/${a.id}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Open
                  </Link>
                </div>
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

      <AssociateModal
        open={associating}
        onClose={() => setAssociating(false)}
        candidateId={record.id}
        onCreated={() => utils.candidates.get.invalidate({ id: record.id })}
      />
    </RecordShell>
  );
}
