"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@emerge/ui";
import { Button, FormError } from "@/components/form";
import { candidateName } from "@/components/new-candidate-modal";
import { FieldGrid, InlineField, RecordSection, RecordShell } from "@/components/record";
import { CommunicationPanel } from "@/components/communication-panel";
import { HiringPipelineTab } from "@/components/hiring-pipeline-tab";
import { InterviewsPanel } from "@/components/interviews-panel";
import { NotesPanel } from "@/components/notes-panel";
import { OffersPanel } from "@/components/offers-panel";
import { ReviewsPanel } from "@/components/reviews-panel";
import { TasksPanel } from "@/components/tasks-panel";
import { StageChangeForm } from "@/components/stage-change-form";
import { SubmissionsLog } from "@/components/submissions-log";
import { SubmitToClientModal } from "@/components/submit-to-client-modal";
import { TimelinePanel } from "@/components/timeline-panel";
import { STAGE_ACCENT, STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { trpc } from "@/lib/trpc/client";

function StageBadge({ stage }: { stage: string }) {
  const key = stage as ApplicationStageKey;
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-[var(--card)] px-2 py-0.5 text-xs font-semibold ring-1 ring-[var(--border)]",
        STAGE_ACCENT[key]
      )}
    >
      {STAGE_LABELS[key] ?? stage}
    </span>
  );
}

const RATING_OPTIONS = [
  { value: "", label: "Not rated" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" }
];

export default function ApplicationRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"pipeline" | "overview">("pipeline");

  const me = trpc.auth.me.useQuery();
  const app = trpc.applications.get.useQuery({ id: params.id });
  const statuses = trpc.applications.statuses.useQuery();
  const members = trpc.members.list.useQuery();

  const refresh = () => utils.applications.get.invalidate({ id: params.id });
  const changeStatus = trpc.applications.changeStatus.useMutation({ onSuccess: refresh });
  const changeStage = trpc.applications.changeStage.useMutation({
    onSuccess: () => {
      refresh();
      utils.applications.board.invalidate();
    }
  });
  const updateMeta = trpc.applications.updateMeta.useMutation({ onSuccess: refresh });
  const softDelete = trpc.applications.softDelete.useMutation({
    onSuccess: () => router.push("/pipeline")
  });
  const restore = trpc.applications.restore.useMutation({ onSuccess: refresh });

  if (app.isLoading) return <p className="text-sm text-[var(--muted)]">Loading application...</p>;
  if (app.error || !app.data) {
    return <FormError message={app.error?.message ?? "Application not found"} />;
  }

  const record = app.data;
  const isDeleted = Boolean(record.deletedAt);
  const canWrite = me.data ? me.data.role !== "readonly" : false;
  const canEdit = canWrite && !isDeleted;
  const name = candidateName({
    firstName: record.candidateFirstName,
    lastName: record.candidateLastName
  });
  const statusOptions = (statuses.data ?? []).map((s) => ({ value: s.key, label: s.label }));
  const currentStatusLabel =
    statuses.data?.find((s) => s.key === record.statusKey)?.label ?? record.statusKey;

  const ownerOptions = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? [])
      .filter((m) => !m.deactivatedAt || m.userId === record.ownerId)
      .map((m) => ({ value: m.userId, label: m.name }))
  ];
  const activeMembers = (members.data ?? [])
    .filter((m) => !m.deactivatedAt)
    .map((m) => ({ userId: m.userId, name: m.name }));

  const setStatus = (key: string | null) => {
    if (!key || key === record.statusKey) return;
    const target = statuses.data?.find((s) => s.key === key);
    let rejectionReason: string | null | undefined;
    if (target?.stage === "rejected") {
      rejectionReason =
        window.prompt("Reason for rejection (optional):", record.rejectionReason ?? "") ?? "";
      rejectionReason = rejectionReason || null;
    }
    changeStatus.mutate({ id: record.id, statusKey: key, rejectionReason });
  };

  return (
    <RecordShell
      backHref="/pipeline"
      backLabel="Pipeline"
      title={name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--muted)]">{record.humanId}</span>
          <span>
            on{" "}
            <Link href={`/jobs/${record.jobId}`} className="text-[var(--accent)] hover:underline">
              {record.jobTitle}
            </Link>
          </span>
        </span>
      }
      badges={<StageBadge stage={record.stage} />}
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
            <>
              <Button variant="outline" onClick={() => setSubmitting(true)}>
                Submit to client
              </Button>
              <Button
                variant="danger"
                disabled={softDelete.isPending}
                onClick={() => {
                  if (window.confirm(`Remove ${name} from ${record.jobTitle}'s pipeline?`)) {
                    softDelete.mutate({ id: record.id });
                  }
                }}
              >
                Remove
              </Button>
            </>
          )
        ) : null
      }
    >
      {isDeleted ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          This application is in the trash. Restore it to make changes.
        </div>
      ) : null}
      {record.rejectionReason && record.stage === "rejected" ? (
        <div
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700"
        >
          <span className="font-semibold">Rejected:</span> {record.rejectionReason}
        </div>
      ) : null}
      <FormError message={changeStatus.error?.message ?? updateMeta.error?.message} />

      <div className="flex gap-1 border-b border-[var(--border)]">
        {(
          [
            { key: "pipeline", label: "Hiring Pipeline" },
            { key: "overview", label: "Overview" }
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-[var(--brand-secondary)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pipeline" ? (
        <HiringPipelineTab
          record={record}
          statuses={statuses.data ?? []}
          members={activeMembers}
          canEdit={canEdit}
          onNavigate={(sectionId) => {
            if (sectionId === "section-documents") {
              router.push(`/candidates/${record.candidateId}`);
              return;
            }
            setTab("overview");
            window.setTimeout(() => {
              document.getElementById(sectionId)?.scrollIntoView({
                behavior: "smooth",
                block: "start"
              });
            }, 60);
          }}
        />
      ) : null}

      <div className={tab === "overview" ? "space-y-6" : "hidden"}>
        {canEdit ? (
          <RecordSection title="Move to next stage">
            <StageChangeForm
              currentStage={record.stage as ApplicationStageKey}
              members={activeMembers}
              saving={changeStage.isPending}
              error={changeStage.error?.message ?? null}
              onSubmit={(opts) =>
                changeStage.mutate({
                  id: record.id,
                  stage: opts.stage,
                  noteBody: opts.noteBody,
                  mentionUserIds: opts.mentionUserIds,
                  rejectionReason: opts.rejectionReason
                })
              }
            />
          </RecordSection>
        ) : null}

        <RecordSection title="Pipeline">
          <FieldGrid>
            <InlineField
              label="Candidate"
              value={name}
              canEdit={false}
              onSave={() => {}}
              render={() => (
                <Link
                  href={`/candidates/${record.candidateId}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {name}
                </Link>
              )}
            />
            <InlineField
              label="Job"
              value={record.jobTitle}
              canEdit={false}
              onSave={() => {}}
              render={() => (
                <Link
                  href={`/jobs/${record.jobId}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {record.jobTitle}
                </Link>
              )}
            />
            <InlineField
              label="Status"
              value={record.statusKey}
              canEdit={canEdit}
              saving={changeStatus.isPending}
              options={statusOptions}
              render={() => currentStatusLabel}
              onSave={setStatus}
            />
            <InlineField
              label="Stage"
              value={record.stage}
              canEdit={false}
              onSave={() => {}}
              render={() => STAGE_LABELS[record.stage as ApplicationStageKey] ?? record.stage}
            />
            <InlineField
              label="Owner (sourcer)"
              value={record.ownerId ?? ""}
              canEdit={canEdit}
              saving={updateMeta.isPending}
              options={ownerOptions}
              placeholder="Unassigned"
              onSave={(v) => updateMeta.mutate({ id: record.id, patch: { ownerId: v || null } })}
            />
            <InlineField
              label="Rating"
              value={record.rating !== null ? String(record.rating) : ""}
              canEdit={canEdit}
              saving={updateMeta.isPending}
              options={RATING_OPTIONS}
              placeholder="Not rated"
              onSave={(v) =>
                updateMeta.mutate({ id: record.id, patch: { rating: v ? parseInt(v, 10) : null } })
              }
            />
          </FieldGrid>
          {record.rejectionReason ? (
            <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
              Rejection reason: {record.rejectionReason}
            </p>
          ) : null}
        </RecordSection>

        <div id="section-interviews">
          <RecordSection title="Interviews">
            <InterviewsPanel applicationId={record.id} canWrite={canEdit} />
          </RecordSection>
        </div>

        <div id="section-reviews">
          <RecordSection title="Ratings and reviews">
            <ReviewsPanel
              applicationId={record.id}
              canWrite={canEdit}
              myUserId={me.data?.user.id}
              isAdmin={me.data?.role === "admin"}
            />
          </RecordSection>
        </div>

        <div id="section-tasks">
          <RecordSection title="Tasks">
            <TasksPanel entityType="application" entityId={record.id} canWrite={canEdit} />
          </RecordSection>
        </div>

        <div id="section-submissions">
          <RecordSection title="Client submissions">
            <SubmissionsLog
              mode="application"
              id={record.id}
              canWrite={canEdit}
              showCandidate={false}
            />
          </RecordSection>
        </div>

        <RecordSection title="Offer & placement">
          <OffersPanel applicationId={record.id} canWrite={canEdit} />
        </RecordSection>

        <RecordSection title="History">
          {record.history.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No transitions yet.</p>
          ) : (
            <ol className="space-y-2">
              {record.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    {h.fromStatusKey ? (
                      <>
                        <span className="text-[var(--muted)]">{h.fromStatusKey}</span>
                        {" -> "}
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">Created as </span>
                    )}
                    <span className="font-medium">{h.toStatusKey}</span>
                    {h.note ? <span className="text-[var(--muted)]"> ({h.note})</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                    {h.actorName ? `${h.actorName} · ` : ""}
                    {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>
        <div id="section-communication">
          <RecordSection title="Communication">
            <CommunicationPanel entityType="application" entityId={record.id} canWrite={canEdit} />
          </RecordSection>
        </div>

        <div id="section-notes">
          <RecordSection title="Notes">
            <NotesPanel entityType="application" entityId={record.id} canWrite={canEdit} />
          </RecordSection>
        </div>

        <RecordSection title="Timeline">
          <TimelinePanel entityType="application" entityId={record.id} />
        </RecordSection>
      </div>

      <SubmitToClientModal
        open={submitting}
        onClose={() => setSubmitting(false)}
        jobId={record.jobId}
        defaultApplicationIds={[record.id]}
        onDone={() => {
          utils.applications.get.invalidate({ id: record.id });
          utils.submissions.forApplication.invalidate({ applicationId: record.id });
        }}
      />
    </RecordShell>
  );
}
