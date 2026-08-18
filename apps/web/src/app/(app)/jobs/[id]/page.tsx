"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApplicationKanban } from "@/components/application-kanban";
import { AssociateModal } from "@/components/associate-modal";
import { Button, FormError } from "@/components/form";
import { STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { contactName } from "@/components/new-contact-modal";
import {
  FieldGrid,
  InlineField,
  JOB_EMPLOYMENT_OPTIONS,
  JOB_STATUS_OPTIONS,
  JOB_WORK_MODE_OPTIONS,
  JobStatusBadge,
  RecordSection,
  RecordShell
} from "@/components/record";
import { JobDocuments } from "@/components/job-documents";
import { NotesPanel } from "@/components/notes-panel";
import { SkillChips } from "@/components/skill-chips";
import { JobRevenuePanel } from "@/components/revenue-panel";
import { SubmissionsLog } from "@/components/submissions-log";
import { TasksPanel } from "@/components/tasks-panel";
import { SubmitToClientModal } from "@/components/submit-to-client-modal";
import { TagEditor } from "@/components/tag-editor";
import { TimelinePanel } from "@/components/timeline-panel";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type JobPatch = RouterInputs["jobs"]["update"]["patch"];

export default function JobRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [associating, setAssociating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const me = trpc.auth.me.useQuery();
  const job = trpc.jobs.get.useQuery({ id: params.id });
  const members = trpc.members.list.useQuery();
  const companyOptions = trpc.companies.list.useQuery({
    page: 1,
    pageSize: 200,
    sortBy: "name",
    sortDir: "asc",
    deleted: false
  });

  const refresh = () =>
    Promise.all([utils.jobs.get.invalidate({ id: params.id }), utils.jobs.list.invalidate()]);

  const update = trpc.jobs.update.useMutation({ onSuccess: refresh });
  const changeStatus = trpc.jobs.changeStatus.useMutation({ onSuccess: refresh });
  const softDelete = trpc.jobs.softDelete.useMutation({
    onSuccess: async () => {
      await utils.jobs.list.invalidate();
      router.push("/jobs");
    }
  });
  const restore = trpc.jobs.restore.useMutation({ onSuccess: refresh });

  // Contacts of the current client, for the hiring-contact picker.
  const client = trpc.companies.get.useQuery(
    { id: job.data?.companyId ?? "" },
    { enabled: Boolean(job.data?.companyId) }
  );

  if (job.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading job...</p>;
  }
  if (job.error || !job.data) {
    return <FormError message={job.error?.message ?? "Job not found"} />;
  }

  const record = job.data;
  const isDeleted = Boolean(record.deletedAt);
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const canEdit = canWrite && !isDeleted;

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? [])
      .filter((m) => !m.deactivatedAt || m.userId === record.ownerId)
      .map((m) => ({ value: m.userId, label: m.name }))
  ];

  const companySelect = [
    ...(companyOptions.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name })),
    ...((companyOptions.data?.rows ?? []).some((c) => c.id === record.companyId)
      ? []
      : [{ value: record.companyId, label: record.companyName ?? "Current client" }])
  ];

  const contactSelect = [
    { value: "", label: "No hiring contact" },
    ...(client.data?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))
  ];

  const save = (field: keyof JobPatch) => (value: string | null) =>
    update.mutate({ id: record.id, patch: { [field]: value } as JobPatch });

  const saveNumber = (field: keyof JobPatch) => (value: string | null) => {
    const n = value ? parseInt(value, 10) : null;
    update.mutate({
      id: record.id,
      patch: { [field]: Number.isFinite(n) ? n : null } as JobPatch
    });
  };

  return (
    <RecordShell
      backHref="/jobs"
      backLabel="Job Openings"
      title={record.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--muted)]">{record.humanId}</span>
          <span>
            at{" "}
            <Link
              href={`/companies/${record.companyId}`}
              className="text-[var(--accent)] hover:underline"
            >
              {record.companyName}
            </Link>
          </span>
        </span>
      }
      badges={
        <span className="flex items-center gap-1.5">
          <JobStatusBadge status={record.status} />
          {record.isHot ? (
            <span
              title="Hot job opening"
              className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600"
            >
              🔥 Hot
            </span>
          ) : null}
        </span>
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
            <div className="flex items-center gap-2">
              <select
                value={record.status}
                onChange={(e) =>
                  changeStatus.mutate({
                    id: record.id,
                    status: e.target.value as JobPatch["status"] & string
                  })
                }
                disabled={changeStatus.isPending}
                aria-label="Change status"
                className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
              >
                {JOB_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                variant="danger"
                disabled={softDelete.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Move "${record.title}" to trash? It can be restored for 30 days.`
                    )
                  ) {
                    softDelete.mutate({ id: record.id });
                  }
                }}
              >
                Delete
              </Button>
            </div>
          )
        ) : null
      }
    >
      {isDeleted ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This job is in the trash. Restore it to make changes.
        </div>
      ) : null}
      <FormError
        message={
          update.error?.message ??
          changeStatus.error?.message ??
          softDelete.error?.message ??
          restore.error?.message
        }
      />

      <RecordSection title="Overview">
        <FieldGrid>
          <InlineField
            label="Title"
            value={record.title}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={(v) => {
              if (v) update.mutate({ id: record.id, patch: { title: v } });
            }}
          />
          <InlineField
            label="Client company"
            value={record.companyId}
            canEdit={canEdit}
            saving={update.isPending}
            options={companySelect}
            render={() => (
              <Link
                href={`/companies/${record.companyId}`}
                className="text-[var(--accent)] hover:underline"
              >
                {record.companyName}
              </Link>
            )}
            onSave={(v) => {
              // Switching client clears a hiring contact that no longer belongs.
              if (v && v !== record.companyId) {
                update.mutate({
                  id: record.id,
                  patch: { companyId: v, hiringContactId: null }
                });
              }
            }}
          />
          <InlineField
            label="Hiring contact"
            value={record.hiringContactId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={contactSelect}
            placeholder="No hiring contact"
            render={() =>
              record.hiringContact ? (
                <Link
                  href={`/contacts/${record.hiringContact.id}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {contactName(record.hiringContact)}
                </Link>
              ) : (
                <span className="text-[var(--muted)]">No hiring contact</span>
              )
            }
            onSave={(v) => update.mutate({ id: record.id, patch: { hiringContactId: v || null } })}
          />
          <InlineField
            label="Owner (account manager)"
            value={record.ownerId ?? ""}
            canEdit={canEdit}
            saving={update.isPending}
            options={ownerOptions}
            placeholder="Unassigned"
            onSave={(v) => update.mutate({ id: record.id, patch: { ownerId: v || null } })}
          />
          <InlineField
            label="Employment type"
            value={record.employmentType}
            canEdit={canEdit}
            saving={update.isPending}
            options={JOB_EMPLOYMENT_OPTIONS}
            onSave={(v) => {
              if (v) {
                update.mutate({
                  id: record.id,
                  patch: { employmentType: v as JobPatch["employmentType"] }
                });
              }
            }}
          />
          <InlineField
            label="Work mode"
            value={record.workMode}
            canEdit={canEdit}
            saving={update.isPending}
            options={JOB_WORK_MODE_OPTIONS}
            onSave={(v) => {
              if (v) {
                update.mutate({
                  id: record.id,
                  patch: { workMode: v as JobPatch["workMode"] }
                });
              }
            }}
          />
          <InlineField
            label="Location"
            value={record.location}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("location")}
          />
          <InlineField
            label="City"
            value={record.city}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("city")}
          />
          <InlineField
            label="Province / State"
            value={record.state}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("state")}
          />
          <InlineField
            label="Country"
            value={record.country}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("country")}
          />
          <InlineField
            label="Postal code"
            value={record.postalCode}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("postalCode")}
          />
          <InlineField
            label="Positions"
            value={String(record.positions)}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={saveNumber("positions")}
          />
          <InlineField
            label="Target date"
            value={record.targetCloseAt ? String(record.targetCloseAt).slice(0, 10) : null}
            canEdit={canEdit}
            saving={update.isPending}
            placeholder="YYYY-MM-DD"
            onSave={(v) => {
              const d = v ? new Date(v) : null;
              if (d && Number.isNaN(d.getTime())) return;
              update.mutate({ id: record.id, patch: { targetCloseAt: d } });
            }}
          />
          <InlineField
            label="Hot job opening"
            value={record.isHot ? "yes" : "no"}
            canEdit={canEdit}
            saving={update.isPending}
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" }
            ]}
            render={() => (record.isHot ? "🔥 Yes" : "No")}
            onSave={(v) => update.mutate({ id: record.id, patch: { isHot: v === "yes" } })}
          />
          <InlineField
            label="Salary"
            value={record.salaryText}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("salaryText")}
          />
          <InlineField
            label="Salary currency"
            value={record.salaryCurrency}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("salaryCurrency")}
          />
          <InlineField
            label="Salary min"
            value={record.salaryMin !== null ? String(record.salaryMin) : null}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={saveNumber("salaryMin")}
          />
          <InlineField
            label="Salary max"
            value={record.salaryMax !== null ? String(record.salaryMax) : null}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={saveNumber("salaryMax")}
          />
          <InlineField
            label="Salary period"
            value={record.salaryPeriod}
            canEdit={canEdit}
            saving={update.isPending}
            placeholder="year / day / hour"
            onSave={save("salaryPeriod")}
          />
        </FieldGrid>
        <div className="mt-2">
          <InlineField
            label="Job description"
            value={record.description}
            canEdit={canEdit}
            saving={update.isPending}
            type="textarea"
            render={(v) => <span className="whitespace-pre-wrap">{v}</span>}
            onSave={save("description")}
          />
        </div>
        <div className="mt-2">
          <InlineField
            label="Client call summary"
            value={record.clientCallSummary}
            canEdit={canEdit}
            saving={update.isPending}
            type="textarea"
            render={(v) => <span className="whitespace-pre-wrap">{v}</span>}
            onSave={save("clientCallSummary")}
          />
        </div>
        <div className="mt-2">
          <InlineField
            label="Required skills"
            value={record.requiredSkills}
            canEdit={canEdit}
            saving={update.isPending}
            type="textarea"
            render={(v) => <SkillChips skills={v} />}
            onSave={save("requiredSkills")}
          />
        </div>
      </RecordSection>

      <RecordSection title="Attachments">
        <JobDocuments
          jobId={record.id}
          files={record.attachments}
          canWrite={canEdit}
          onChanged={() => utils.jobs.get.invalidate({ id: record.id })}
        />
      </RecordSection>

      <RecordSection
        title={`Pipeline (${record.pipeline.total})`}
        actions={
          canEdit ? (
            <div className="flex gap-2">
              {record.pipeline.total > 0 ? (
                <Button
                  variant="outline"
                  className="px-3 py-1.5"
                  onClick={() => setSubmitting(true)}
                >
                  Submit to client
                </Button>
              ) : null}
              <Button className="px-3 py-1.5" onClick={() => setAssociating(true)}>
                Add candidate
              </Button>
            </div>
          ) : null
        }
      >
        {record.pipeline.total === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No candidates yet. Add one to start this job&apos;s pipeline.
          </p>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {record.pipeline.byStage
              .filter((s) => s.count > 0)
              .map((s) => (
                <span
                  key={s.stage}
                  className="rounded-full bg-[var(--background)] px-2.5 py-0.5 text-xs text-[var(--muted)]"
                >
                  {STAGE_LABELS[s.stage as ApplicationStageKey]}: {s.count}
                </span>
              ))}
          </div>
        )}
        <ApplicationKanban jobId={record.id} canWrite={canEdit} showJob={false} />
      </RecordSection>

      <RecordSection title="Client submissions">
        <SubmissionsLog mode="job" id={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Revenue">
        <JobRevenuePanel jobId={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Tags">
        <TagEditor
          entityType="job"
          entityId={record.id}
          tags={record.tags}
          canWrite={canEdit}
          onChanged={() => utils.jobs.get.invalidate({ id: record.id })}
        />
      </RecordSection>

      <p className="text-xs text-[var(--muted)]">
        Opened {new Date(record.openedAt).toLocaleDateString()}
        {record.closedAt ? ` - Closed ${new Date(record.closedAt).toLocaleDateString()}` : ""} -
        Last updated {new Date(record.updatedAt).toLocaleString()}
      </p>

      <AssociateModal
        open={associating}
        onClose={() => setAssociating(false)}
        jobId={record.id}
        onCreated={() => {
          utils.applications.board.invalidate({ jobId: record.id });
          utils.jobs.get.invalidate({ id: record.id });
        }}
      />
      <SubmitToClientModal
        open={submitting}
        onClose={() => setSubmitting(false)}
        jobId={record.id}
        onDone={() => {
          utils.submissions.byJob.invalidate({ jobId: record.id });
          utils.applications.board.invalidate({ jobId: record.id });
        }}
      />
      <RecordSection title="Tasks">
        <TasksPanel entityType="job" entityId={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Notes">
        <NotesPanel entityType="job" entityId={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Timeline">
        <TimelinePanel entityType="job" entityId={record.id} />
      </RecordSection>
    </RecordShell>
  );
}
