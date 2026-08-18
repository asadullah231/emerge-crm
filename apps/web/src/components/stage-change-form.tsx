"use client";

import { useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { MentionTextarea, type MentionMember } from "@/components/mention-textarea";
import { mentionIdsInBody } from "@/lib/notes";
import {
  APPLICATION_STAGES,
  REJECTION_STAGE,
  STAGE_LABELS,
  type ApplicationStageKey
} from "@/lib/applications";

/**
 * Reusable "Move to next stage" form (M16). Owns the stage picker, an optional
 * @mention-aware comment, and a rejection-reason textarea that appears only
 * when Rejected is picked (server enforces the same rule). Used inline on the
 * application record page and inside the kanban-drop modal.
 */
export function StageChangeForm({
  currentStage,
  members,
  saving,
  error,
  onSubmit,
  onCancel,
  submitLabel = "Save change",
  defaultStage,
  lockStage = false
}: {
  currentStage: ApplicationStageKey;
  members: MentionMember[];
  saving: boolean;
  error?: string | null;
  onSubmit: (opts: {
    stage: ApplicationStageKey;
    noteBody: string | null;
    mentionUserIds: string[];
    rejectionReason: string | null;
  }) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /** When lockStage is true, hide the stage picker and use this stage. */
  defaultStage?: ApplicationStageKey;
  lockStage?: boolean;
}) {
  const [stage, setStage] = useState<ApplicationStageKey>(defaultStage ?? currentStage);
  const [noteBody, setNoteBody] = useState("");
  const [tracked, setTracked] = useState<MentionMember[]>([]);
  const [reason, setReason] = useState("");

  const isReject = stage === REJECTION_STAGE;
  const disabled = saving || stage === currentStage || (isReject && reason.trim().length === 0);

  const submit = () => {
    const trimmedBody = noteBody.trim();
    const trimmedReason = reason.trim();
    const mentionUserIds = trimmedBody ? mentionIdsInBody(trimmedBody, tracked) : [];
    onSubmit({
      stage,
      noteBody: trimmedBody || null,
      mentionUserIds,
      rejectionReason: isReject ? trimmedReason : null
    });
  };

  return (
    <div className="space-y-3">
      {error ? <FormError message={error} /> : null}

      {lockStage ? (
        <p className="text-sm text-[var(--muted)]">
          Moving to{" "}
          <span className="font-medium text-[var(--foreground)]">{STAGE_LABELS[stage]}</span>
        </p>
      ) : (
        <div>
          <Label htmlFor="stage-picker">Move to stage</Label>
          <select
            id="stage-picker"
            value={stage}
            onChange={(e) => setStage(e.target.value as ApplicationStageKey)}
            disabled={saving}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            {APPLICATION_STAGES.map((s) => (
              <option key={s} value={s} disabled={s === currentStage}>
                {STAGE_LABELS[s]}
                {s === currentStage ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="stage-comment">
          Comment{" "}
          <span className="font-normal text-[var(--muted)]">(optional, @mention to notify)</span>
        </Label>
        <MentionTextarea
          value={noteBody}
          onChange={setNoteBody}
          members={members}
          onMentionsChange={setTracked}
          placeholder="Feedback for the team... @mention the account manager"
          rows={3}
        />
      </div>

      {isReject ? (
        <div>
          <Label htmlFor="stage-reason">
            Rejection reason <span className="text-red-600">*</span>
          </Label>
          <textarea
            id="stage-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why the candidate was rejected (required)"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" onClick={submit} disabled={disabled}>
          {saving ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
