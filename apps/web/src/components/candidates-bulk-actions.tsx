"use client";

import { useState } from "react";
import { Button, FormError, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { CANDIDATE_SOURCE_OPTIONS } from "@/components/record";
import { trpc, type RouterInputs } from "@/lib/trpc/client";

type Mode = "owner" | "fields";
type BulkPatch = RouterInputs["candidates"]["bulkUpdateFields"]["patch"];

const selectClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm";

/**
 * Candidate-specific bulk actions (CP-08): Reassign owner and Update fields,
 * mirroring the jobs bulk actions. Rendered inside the shared BulkBar via its
 * extraActions slot; each action opens a small modal and calls the matching
 * candidates bulk endpoint, then the page refetches through onDone.
 */
export function CandidatesBulkActions({
  selectedIds,
  onDone
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [source, setSource] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");

  const members = trpc.members.list.useQuery(undefined, { enabled: mode === "owner" });

  const close = () => setMode(null);
  const done = () => {
    close();
    onDone();
  };
  const reassign = trpc.candidates.bulkReassignOwner.useMutation({ onSuccess: done });
  const updateFields = trpc.candidates.bulkUpdateFields.useMutation({ onSuccess: done });
  const busy = reassign.isPending || updateFields.isPending;
  const error = reassign.error?.message ?? updateFields.error?.message ?? null;

  const hasFieldChange = Boolean(source || city || country || noticePeriod);
  const submitFields = () => {
    updateFields.mutate({
      ids: selectedIds,
      patch: {
        ...(source ? { source: source as NonNullable<BulkPatch["source"]> } : {}),
        ...(city ? { city } : {}),
        ...(country ? { country } : {}),
        ...(noticePeriod ? { noticePeriod } : {})
      }
    });
  };

  const count = selectedIds.length;

  return (
    <>
      <Button variant="outline" className="px-3 py-1.5" onClick={() => setMode("owner")}>
        Reassign owner
      </Button>
      <Button variant="outline" className="px-3 py-1.5" onClick={() => setMode("fields")}>
        Update fields
      </Button>

      <Modal
        title={
          mode === "owner"
            ? `Reassign ${count} candidate(s)`
            : `Update fields on ${count} candidate(s)`
        }
        open={mode !== null}
        onClose={() => {
          if (!busy) close();
        }}
      >
        <div className="space-y-4">
          <FormError message={error ?? undefined} />

          {mode === "owner" ? (
            <div>
              <Label htmlFor="cand-bulk-owner">New owner</Label>
              <select
                id="cand-bulk-owner"
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
                <Label htmlFor="cand-bulk-source">Source</Label>
                <select
                  id="cand-bulk-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Keep as is</option>
                  {CANDIDATE_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cand-bulk-city">City</Label>
                <input
                  id="cand-bulk-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Keep as is"
                  className={selectClass}
                />
              </div>
              <div>
                <Label htmlFor="cand-bulk-country">Country</Label>
                <input
                  id="cand-bulk-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Keep as is"
                  className={selectClass}
                />
              </div>
              <div>
                <Label htmlFor="cand-bulk-notice">Notice period</Label>
                <input
                  id="cand-bulk-notice"
                  type="text"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  placeholder="Keep as is"
                  className={selectClass}
                />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
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
