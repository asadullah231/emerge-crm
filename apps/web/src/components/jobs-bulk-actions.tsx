"use client";

import { useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import {
  JOB_EMPLOYMENT_OPTIONS,
  JOB_STATUS_OPTIONS,
  JOB_WORK_MODE_OPTIONS
} from "@/components/record";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type Mode = "status" | "owner" | "fields";
type BulkPatch = RouterInputs["jobs"]["bulkUpdateFields"]["patch"];
type BulkStatus = RouterInputs["jobs"]["bulkChangeStatus"]["status"];

const selectClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm";

/**
 * Job-specific bulk actions (M17b): Change status, Reassign owner and Update
 * fields, matching Zoho's mass actions. Rendered inside the shared BulkBar via
 * its extraActions slot; each action opens a small modal and calls the matching
 * jobs bulk endpoint, then the page refetches through onDone.
 */
export function JobsBulkActions({
  selectedIds,
  onDone
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [status, setStatus] = useState("open");
  const [ownerId, setOwnerId] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [hot, setHot] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const members = trpc.members.list.useQuery(undefined, { enabled: mode === "owner" });

  const close = () => setMode(null);
  const done = () => {
    close();
    onDone();
  };
  const changeStatus = trpc.jobs.bulkChangeStatus.useMutation({ onSuccess: done });
  const reassign = trpc.jobs.bulkReassignOwner.useMutation({ onSuccess: done });
  const updateFields = trpc.jobs.bulkUpdateFields.useMutation({ onSuccess: done });
  const busy = changeStatus.isPending || reassign.isPending || updateFields.isPending;
  const error =
    changeStatus.error?.message ?? reassign.error?.message ?? updateFields.error?.message ?? null;

  const hasFieldChange = Boolean(employmentType || workMode || hot || targetDate);
  const submitFields = () => {
    updateFields.mutate({
      ids: selectedIds,
      patch: {
        ...(employmentType
          ? { employmentType: employmentType as NonNullable<BulkPatch["employmentType"]> }
          : {}),
        ...(workMode ? { workMode: workMode as NonNullable<BulkPatch["workMode"]> } : {}),
        ...(hot ? { isHot: hot === "yes" } : {}),
        ...(targetDate ? { targetCloseAt: new Date(targetDate) } : {})
      }
    });
  };

  const count = selectedIds.length;

  return (
    <>
      <Button variant="outline" className="px-3 py-1.5" onClick={() => setMode("status")}>
        Change status
      </Button>
      <Button variant="outline" className="px-3 py-1.5" onClick={() => setMode("owner")}>
        Reassign owner
      </Button>
      <Button variant="outline" className="px-3 py-1.5" onClick={() => setMode("fields")}>
        Update fields
      </Button>

      <Modal
        title={
          mode === "status"
            ? `Change status of ${count} job(s)`
            : mode === "owner"
              ? `Reassign ${count} job(s)`
              : `Update fields on ${count} job(s)`
        }
        open={mode !== null}
        onClose={() => {
          if (!busy) close();
        }}
      >
        <div className="space-y-4">
          <FormError message={error ?? undefined} />

          {mode === "status" ? (
            <div>
              <Label htmlFor="bulk-status">New status</Label>
              <select
                id="bulk-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClass}
              >
                {JOB_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Filled, Cancelled and Declined stamp the close date; other statuses reopen the job.
              </p>
            </div>
          ) : null}

          {mode === "owner" ? (
            <div>
              <Label htmlFor="bulk-owner">New owner</Label>
              <select
                id="bulk-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectClass}
              >
                <option value="">Select a team member...</option>
                {(members.data ?? [])
                  .filter((m) => !m.deactivatedAt)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

          {mode === "fields" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="bulk-emp">Employment type</Label>
                <select
                  id="bulk-emp"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Keep as is</option>
                  {JOB_EMPLOYMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="bulk-mode">Work mode</Label>
                <select
                  id="bulk-mode"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Keep as is</option>
                  {JOB_WORK_MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="bulk-hot">Hot job</Label>
                <select
                  id="bulk-hot"
                  value={hot}
                  onChange={(e) => setHot(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Keep as is</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <Label htmlFor="bulk-target">Target date</Label>
                <input
                  id="bulk-target"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className={selectClass}
                />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            {mode === "status" ? (
              <Button
                disabled={busy}
                onClick={() =>
                  changeStatus.mutate({ ids: selectedIds, status: status as BulkStatus })
                }
              >
                {changeStatus.isPending ? "Updating..." : "Change status"}
              </Button>
            ) : null}
            {mode === "owner" ? (
              <Button
                disabled={busy || !ownerId}
                onClick={() => reassign.mutate({ ids: selectedIds, ownerId })}
              >
                {reassign.isPending ? "Reassigning..." : "Reassign"}
              </Button>
            ) : null}
            {mode === "fields" ? (
              <Button disabled={busy || !hasFieldChange} onClick={submitFields}>
                {updateFields.isPending ? "Updating..." : "Update fields"}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
