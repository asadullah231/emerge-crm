"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { candidateName } from "@/components/new-candidate-modal";
import { ScheduleInterviewModal } from "@/components/schedule-interview-modal";
import {
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_STYLE,
  INTERVIEW_TYPE_LABEL
} from "@/lib/interviews";
import { cn } from "@emerge/ui";
import { trpc } from "@/lib/trpc/client";

/**
 * Aggregated interviews across a job's applications (M17c, Zoho job record
 * Interviews related list) with a Schedule action that first picks which
 * candidate's application the interview belongs to, then reuses the M11 modal.
 */
export function JobInterviewsPanel({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const utils = trpc.useUtils();
  const [picking, setPicking] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const list = trpc.interviews.byJob.useQuery({ jobId });
  const apps = trpc.applications.list.useQuery(
    { page: 1, pageSize: 200, jobId, deleted: false },
    { enabled: picking }
  );

  const rows = list.data ?? [];

  return (
    <div className="space-y-3">
      {canWrite ? (
        <div>
          <Button variant="outline" className="px-3 py-1.5" onClick={() => setPicking(true)}>
            Schedule interview
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No interviews scheduled for this job yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((iv) => (
            <li key={iv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link
                  href={`/applications/${iv.applicationId}`}
                  className="text-sm font-medium hover:text-[var(--accent)] hover:underline"
                >
                  {candidateName({
                    firstName: iv.candidateFirstName,
                    lastName: iv.candidateLastName
                  })}
                </Link>
                <p className="text-xs text-[var(--muted)]">
                  {INTERVIEW_TYPE_LABEL[iv.type] ?? iv.type} · {iv.durationMins} min ·{" "}
                  {new Date(iv.scheduledAt).toLocaleString(undefined, {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  INTERVIEW_STATUS_STYLE[iv.status] ?? "bg-[var(--background)] text-[var(--muted)]"
                )}
              >
                {INTERVIEW_STATUS_LABEL[iv.status] ?? iv.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        title="Schedule an interview"
        open={picking}
        onClose={() => {
          setPicking(false);
          setApplicationId("");
        }}
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="pick-application">Candidate (application)</Label>
            <select
              id="pick-application"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            >
              <option value="">Select a candidate...</option>
              {(apps.data?.rows ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {candidateName({
                    firstName: a.candidateFirstName,
                    lastName: a.candidateLastName
                  })}{" "}
                  ({a.humanId})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPicking(false)}>
              Cancel
            </Button>
            <Button
              disabled={!applicationId}
              onClick={() => {
                setPicking(false);
                setScheduling(true);
              }}
            >
              Continue
            </Button>
          </div>
        </div>
      </Modal>

      {applicationId ? (
        <ScheduleInterviewModal
          open={scheduling}
          onClose={() => {
            setScheduling(false);
            setApplicationId("");
          }}
          applicationId={applicationId}
          onDone={() => {
            utils.interviews.byJob.invalidate({ jobId });
          }}
        />
      ) : null}
    </div>
  );
}
