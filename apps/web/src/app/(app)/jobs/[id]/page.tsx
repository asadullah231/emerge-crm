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
import { CommunicationPanel } from "@/components/communication-panel";
import { JobDescriptionView } from "@/components/job-description-view";
import { JobDocuments } from "@/components/job-documents";
import { JobInterviewsPanel } from "@/components/job-interviews-panel";
import { JobMatchesPanel } from "@/components/matching-panel";
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
  const duplicate = trpc.jobs.duplicate.useMutation({
    onSuccess: async (created) => {
      await utils.jobs.list.invalidate();
      router.push(`/jobs/${created.id}`);
    }
  });
  const setPublished = trpc.jobs.setPublished.useMutation({ onSuccess: refresh });
  const setLocked = trpc.jobs.setLocked.useMutation({ onSuccess: refresh });
  const setRecruiters = trpc.jobs.setRecruiters.useMutation({ onSuccess: refresh });

  // Followers (JP-06): who gets a bell notification on job changes.
  const followState = trpc.follows.state.useQuery({ entityType: "job", entityId: params.id });
  const toggleFollow = trpc.follows.toggle.useMutation({
    onSuccess: () => utils.follows.state.invalidate({ entityType: "job", entityId: params.id })
  });

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
  const isAdmin = me.data?.role === "admin";
  // A locked job is read-only for everyone until an admin unlocks it (JP-05).
  const canEdit = canWrite && !isDeleted && !record.isLocked;

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
          {record.isLocked ? (
            <span
              title="Locked by an admin"
              className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600"
            >
              🔒 Locked
            </span>
          ) : null}
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={toggleFollow.isPending || followState.isLoading}
            title="Followers get a notification when this job changes"
            onClick={() =>
              toggleFollow.mutate({
                entityType: "job",
                entityId: record.id,
                follow: !followState.data?.following
              })
            }
          >
            {followState.data?.following ? "Following" : "Follow"}
            {followState.data && followState.data.count > 0 ? ` (${followState.data.count})` : ""}
          </Button>
          <Button variant="outline" onClick={() => window.print()} title="Print this job opening">
            Print
          </Button>
          {canWrite ? (
            isDeleted ? (
              <Button
                variant="outline"
                disabled={restore.isPending}
                onClick={() => restore.mutate({ id: record.id })}
              >
                Restore
              </Button>
            ) : (
              <>
                <select
                  value={record.status}
                  onChange={(e) =>
                    changeStatus.mutate({
                      id: record.id,
                      status: e.target.value as JobPatch["status"] & string
                    })
                  }
                  disabled={changeStatus.isPending || record.isLocked}
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
                  variant="outline"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate({ id: record.id })}
                >
                  {duplicate.isPending ? "Duplicating..." : "Duplicate"}
                </Button>
                <Button
                  variant="outline"
                  disabled={setPublished.isPending || record.isLocked}
                  title={
                    record.isPublished
                      ? "Remove this job from the public careers page"
                      : "List this job on the public careers page"
                  }
                  onClick={() =>
                    setPublished.mutate({ id: record.id, published: !record.isPublished })
                  }
                >
                  {setPublished.isPending
                    ? "Saving..."
                    : record.isPublished
                      ? "Unpublish"
                      : "Publish"}
                </Button>
                {isAdmin ? (
                  <Button
                    variant="outline"
                    disabled={setLocked.isPending}
                    title={
                      record.isLocked
                        ? "Unlock so the team can edit this job again"
                        : "Lock this job so nobody can change it"
                    }
                    onClick={() => setLocked.mutate({ id: record.id, locked: !record.isLocked })}
                  >
                    {setLocked.isPending ? "Saving..." : record.isLocked ? "Unlock" : "Lock"}
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  disabled={softDelete.isPending || record.isLocked}
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
              </>
            )
          ) : null}
        </div>
      }
    >
      {isDeleted ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This job is in the trash. Restore it to make changes.
        </div>
      ) : null}
      {record.isLocked && !isDeleted ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          🔒 This job opening is locked by an admin. Fields, status, publishing and delete are
          disabled until it is unlocked.
        </div>
      ) : null}
      {record.isPublished && me.data?.workspace ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--brand-secondary)]/40 bg-[var(--brand-secondary-soft)] px-3 py-2 text-sm">
          <span>This job is live on the public careers page.</span>
          <a
            href={`/careers/${me.data.workspace.id}/${record.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--brand-secondary)] hover:underline"
          >
            View public page
          </a>
        </div>
      ) : null}
      <FormError
        message={
          update.error?.message ??
          changeStatus.error?.message ??
          softDelete.error?.message ??
          restore.error?.message ??
          setPublished.error?.message ??
          setLocked.error?.message ??
          setRecruiters.error?.message
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
            label="Industry"
            value={record.industry}
            canEdit={canEdit}
            saving={update.isPending}
            onSave={save("industry")}
          />
          <InlineField
            label="Work experience"
            value={record.workExperience}
            canEdit={canEdit}
            saving={update.isPending}
            placeholder="e.g. 5+ years"
            onSave={save("workExperience")}
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
            render={(v) => <JobDescriptionView text={v} />}
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

      <RecordSection title="Assigned recruiters">
        <div className="flex flex-wrap items-center gap-2">
          {record.recruiters.length === 0 ? (
            <span className="text-sm text-[var(--muted)]">
              No recruiters assigned. The owner stays the account manager; recruiters work the
              search.
            </span>
          ) : (
            record.recruiters.map((r) => (
              <span
                key={r.userId}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--background)] px-2.5 py-1 text-sm"
              >
                {r.name ?? "Unknown"}
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Remove ${r.name ?? "recruiter"}`}
                    disabled={setRecruiters.isPending}
                    onClick={() =>
                      setRecruiters.mutate({
                        id: record.id,
                        recruiterIds: record.recruiters
                          .filter((x) => x.userId !== r.userId)
                          .map((x) => x.userId)
                      })
                    }
                    className="text-[var(--muted)] hover:text-red-600"
                  >
                    &times;
                  </button>
                ) : null}
              </span>
            ))
          )}
          {canEdit ? (
            <select
              value=""
              aria-label="Add recruiter"
              disabled={setRecruiters.isPending}
              onChange={(e) => {
                if (!e.target.value) return;
                setRecruiters.mutate({
                  id: record.id,
                  recruiterIds: [...record.recruiters.map((r) => r.userId), e.target.value]
                });
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--muted)]"
            >
              <option value="">Add recruiter...</option>
              {(members.data ?? [])
                .filter(
                  (m) => !m.deactivatedAt && !record.recruiters.some((r) => r.userId === m.userId)
                )
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
            </select>
          ) : null}
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

      <div id="section-matching">
        <RecordSection title="Matching candidates">
          <JobMatchesPanel jobId={record.id} canWrite={canEdit} />
        </RecordSection>
      </div>

      <RecordSection title="Sourcing summary">
        {record.bySource.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No applications yet, so no source data to show.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {record.bySource.map((s) => {
              const max = record.bySource[0]?.count ?? 1;
              return (
                <li key={s.source ?? "unknown"} className="flex items-center gap-3 text-sm">
                  <span className="w-32 flex-none capitalize text-[var(--muted)]">
                    {(s.source ?? "unknown").replace(/_/g, " ")}
                  </span>
                  <span
                    className="h-2 rounded-full bg-[var(--brand-secondary)]/60"
                    style={{ width: `${Math.max(6, (s.count / max) * 240)}px` }}
                  />
                  <span className="tabular-nums">{s.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </RecordSection>

      <RecordSection title="Interviews">
        <JobInterviewsPanel jobId={record.id} canWrite={canEdit} />
      </RecordSection>

      <RecordSection title="Communication">
        <CommunicationPanel entityType="job" entityId={record.id} canWrite={canEdit} />
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
