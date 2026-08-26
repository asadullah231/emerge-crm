"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Label } from "@/components/form";
import { trpc } from "@/lib/trpc/client";

const KIND_LABEL: Record<string, string> = {
  data_processing: "Data processing",
  email_marketing: "Email marketing"
};

const selectClass =
  "rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Candidate compliance panel (M20, Zoho Manage Compliance parity): email
 * opt-out and blocklist flags, consent log, GDPR JSON export and the
 * admin-only right-to-erase with typed confirmation.
 */
export function CompliancePanel({
  candidateId,
  candidateName,
  emailOptOut,
  isBlocked,
  canWrite,
  isAdmin
}: {
  candidateId: string;
  candidateName: string;
  emailOptOut: boolean;
  isBlocked: boolean;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [confirmText, setConfirmText] = useState("");
  const [erasing, setErasing] = useState(false);
  const [consentKind, setConsentKind] = useState("data_processing");
  const [consentStatus, setConsentStatus] = useState("granted");
  const [consentNote, setConsentNote] = useState("");
  const [exporting, setExporting] = useState(false);

  const consent = trpc.compliance.consentList.useQuery({ candidateId });
  const refresh = () => {
    utils.candidates.get.invalidate({ id: candidateId });
    utils.compliance.consentList.invalidate({ candidateId });
  };
  const setFlags = trpc.compliance.setFlags.useMutation({ onSuccess: refresh });
  const addConsent = trpc.compliance.consentAdd.useMutation({
    onSuccess: () => {
      setConsentNote("");
      refresh();
    }
  });
  const erase = trpc.compliance.eraseCandidate.useMutation({
    onSuccess: () => router.push("/candidates")
  });

  const exportData = async () => {
    setExporting(true);
    try {
      const pkg = await utils.client.compliance.exportCandidate.query({ id: candidateId });
      downloadJson(`gdpr-export-${candidateId}.json`, pkg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormError
        message={setFlags.error?.message ?? addConsent.error?.message ?? erase.error?.message}
      />

      <div className="flex flex-wrap items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={emailOptOut}
            disabled={!canWrite || setFlags.isPending}
            onChange={(e) => setFlags.mutate({ id: candidateId, emailOptOut: e.target.checked })}
          />
          Email opt-out
          <span className="text-xs text-[var(--muted)]">(blocks every email send)</span>
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isBlocked}
            disabled={!canWrite || setFlags.isPending}
            onChange={(e) => setFlags.mutate({ id: candidateId, isBlocked: e.target.checked })}
          />
          Blocklisted
          <span className="text-xs text-[var(--muted)]">
            (cannot be associated or submitted to clients)
          </span>
        </label>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Consent log</p>
        {(consent.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No consent records yet.</p>
        ) : (
          <ul className="space-y-1">
            {(consent.data ?? []).map((c) => (
              <li key={c.id} className="text-sm">
                <span
                  className={
                    c.status === "granted"
                      ? "font-medium text-green-600"
                      : "font-medium text-red-600"
                  }
                >
                  {c.status === "granted" ? "Granted" : "Withdrawn"}
                </span>{" "}
                {KIND_LABEL[c.kind] ?? c.kind}
                <span className="text-xs text-[var(--muted)]">
                  {" "}
                  · {c.actorName ?? "System"} · {new Date(c.createdAt).toLocaleDateString()}
                  {c.note ? ` · ${c.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <select
              aria-label="Consent kind"
              value={consentKind}
              onChange={(e) => setConsentKind(e.target.value)}
              className={selectClass}
            >
              <option value="data_processing">Data processing</option>
              <option value="email_marketing">Email marketing</option>
            </select>
            <select
              aria-label="Consent status"
              value={consentStatus}
              onChange={(e) => setConsentStatus(e.target.value)}
              className={selectClass}
            >
              <option value="granted">Granted</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            <input
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              placeholder="Note (optional)"
              className={`${selectClass} min-w-40 flex-1`}
            />
            <Button
              variant="outline"
              className="px-3 py-1.5"
              disabled={addConsent.isPending}
              onClick={() =>
                addConsent.mutate({
                  candidateId,
                  kind: consentKind as "data_processing" | "email_marketing",
                  status: consentStatus as "granted" | "withdrawn",
                  note: consentNote.trim() || undefined
                })
              }
            >
              {addConsent.isPending ? "Saving..." : "Record consent"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <Button variant="outline" className="px-3 py-1.5" disabled={exporting} onClick={exportData}>
          {exporting ? "Exporting..." : "GDPR export (JSON)"}
        </Button>
        {isAdmin ? (
          erasing ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="erase-confirm">Type the candidate name to erase permanently</Label>
                <input
                  id="erase-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={candidateName}
                  className={`${selectClass} min-w-56`}
                />
              </div>
              <Button
                variant="danger"
                className="px-3 py-1.5"
                disabled={confirmText.trim() !== candidateName || erase.isPending}
                onClick={() => erase.mutate({ id: candidateId, confirm: true })}
              >
                {erase.isPending ? "Erasing..." : "Erase forever"}
              </Button>
              <Button
                variant="outline"
                className="px-3 py-1.5"
                onClick={() => {
                  setErasing(false);
                  setConfirmText("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="px-3 py-1.5" onClick={() => setErasing(true)}>
              Right to erase
            </Button>
          )
        ) : null}
      </div>
      {isAdmin && erasing ? (
        <p className="text-xs text-red-600">
          This permanently deletes the candidate, their applications, interviews, submissions,
          offers, notes, emails and files. It cannot be undone and is logged in the audit trail.
        </p>
      ) : null}
    </div>
  );
}
