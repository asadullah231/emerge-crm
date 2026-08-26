"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { JOB_EMPLOYMENT_OPTIONS, JOB_WORK_MODE_OPTIONS } from "@/components/record";
import { contactName } from "@/components/new-contact-modal";
import { NewCompanyModal } from "@/components/new-company-modal";
import { trpc } from "@/lib/trpc/client";

const ACCEPT = ".pdf,.doc,.docx,.rtf,.txt";

export function NewJobModal({
  open,
  onClose,
  defaultCompanyId
}: {
  open: boolean;
  onClose: () => void;
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [hiringContactId, setHiringContactId] = useState("");
  const [employmentType, setEmploymentType] = useState("permanent");
  const [workMode, setWorkMode] = useState("onsite");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [workExperience, setWorkExperience] = useState("");
  const [positions, setPositions] = useState("1");
  const [targetDate, setTargetDate] = useState("");
  const [isHot, setIsHot] = useState(false);
  const [clientCallSummary, setClientCallSummary] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  // Optional intake documents, uploaded right after the job is created (M15).
  const jdRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const companyOptions = trpc.companies.list.useQuery(
    { page: 1, pageSize: 200, sortBy: "name", sortDir: "asc", deleted: false },
    { enabled: open }
  );
  // Hiring contact is scoped to the chosen company; load that company's contacts.
  const company = trpc.companies.get.useQuery(
    { id: companyId },
    { enabled: open && companyId.length > 0 }
  );

  const reset = () => {
    setTitle("");
    setCompanyId(defaultCompanyId ?? "");
    setHiringContactId("");
    setEmploymentType("permanent");
    setWorkMode("onsite");
    setLocation("");
    setIndustry("");
    setWorkExperience("");
    setPositions("1");
    setTargetDate("");
    setIsHot(false);
    setClientCallSummary("");
    setUploadError(null);
    setCreatedId(null);
    if (jdRef.current) jdRef.current.value = "";
    if (summaryRef.current) summaryRef.current.value = "";
  };

  const create = trpc.jobs.create.useMutation();

  const submit = async () => {
    setUploadError(null);
    setSubmitting(true);
    try {
      const n = parseInt(positions, 10);
      let created;
      try {
        created = await create.mutateAsync({
          title: title.trim(),
          companyId,
          hiringContactId: hiringContactId || null,
          employmentType: employmentType as "permanent" | "contract" | "temporary",
          workMode: workMode as "onsite" | "hybrid" | "remote",
          location: location.trim() || null,
          industry: industry.trim() || null,
          workExperience: workExperience.trim() || null,
          clientCallSummary: clientCallSummary.trim() || null,
          targetCloseAt: targetDate ? new Date(targetDate) : null,
          isHot,
          positions: Number.isFinite(n) && n > 0 ? n : 1
        });
      } catch {
        return; // Shown via create.error.
      }

      const uploads: Array<{ file: File | undefined; kind: string }> = [
        { file: jdRef.current?.files?.[0], kind: "job_description" },
        { file: summaryRef.current?.files?.[0], kind: "client_meeting_summary" }
      ];
      const failures: string[] = [];
      for (const u of uploads) {
        if (!u.file) continue;
        const body = new FormData();
        body.append("file", u.file);
        body.append("kind", u.kind);
        const res = await fetch(`/api/jobs/${created.id}/documents`, { method: "POST", body });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          failures.push(`${u.file.name}: ${data.error ?? "upload failed"}`);
        }
      }
      await utils.jobs.list.invalidate();

      if (failures.length > 0) {
        // The job exists; be honest about the files and let the user proceed.
        setCreatedId(created.id);
        setUploadError(
          `Job opening created, but a document failed to upload (${failures.join("; ")}). ` +
            "You can upload it again from the job page."
        );
        return;
      }
      reset();
      onClose();
      router.push(`/jobs/${created.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="New job opening" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <FormError message={create.error?.message ?? uploadError ?? undefined} />
        <div>
          <Label htmlFor="job-title">Job title</Label>
          <Input
            id="job-title"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="job-company" className="block text-sm font-medium">
              Client
            </label>
            <button
              type="button"
              onClick={() => setCreatingCompany(true)}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              + New client
            </button>
          </div>
          <select
            id="job-company"
            required
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setHiringContactId("");
            }}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select a client...
            </option>
            {companyOptions.data?.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="job-contact">Hiring contact</Label>
          <select
            id="job-contact"
            value={hiringContactId}
            disabled={!companyId}
            onChange={(e) => setHiringContactId(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">No hiring contact</option>
            {company.data?.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {contactName(c)}
                {c.title ? ` - ${c.title}` : ""}
              </option>
            ))}
          </select>
          {!companyId ? (
            <p className="mt-1 text-xs text-[var(--muted)]">Pick a client first.</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="job-employment">Employment type</Label>
            <select
              id="job-employment"
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {JOB_EMPLOYMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="job-mode">Work mode</Label>
            <select
              id="job-mode"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {JOB_WORK_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="job-location">Location</Label>
            <Input
              id="job-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="job-positions">Positions</Label>
            <Input
              id="job-positions"
              type="number"
              min={1}
              value={positions}
              onChange={(e) => setPositions(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="job-industry">Industry</Label>
            <Input
              id="job-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="job-experience">Work experience</Label>
            <Input
              id="job-experience"
              placeholder="e.g. 5+ years"
              value={workExperience}
              onChange={(e) => setWorkExperience(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="job-target-date">Target date</Label>
            <Input
              id="job-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isHot}
                onChange={(e) => setIsHot(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              Hot job opening
            </label>
          </div>
        </div>
        <div>
          <Label htmlFor="job-call-summary">Client call summary</Label>
          <textarea
            id="job-call-summary"
            value={clientCallSummary}
            onChange={(e) => setClientCallSummary(e.target.value)}
            rows={3}
            placeholder="Key points from the client call: must-haves, salary, process..."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Included in the email the team receives when this job is posted.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="job-jd-file">Job description (file)</Label>
            <input
              id="job-jd-file"
              ref={jdRef}
              type="file"
              accept={ACCEPT}
              className="w-full text-sm text-[var(--muted)] file:mr-2 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--background)] file:px-2 file:py-1 file:text-sm"
            />
          </div>
          <div>
            <Label htmlFor="job-summary-file">Client meeting summary (file)</Label>
            <input
              id="job-summary-file"
              ref={summaryRef}
              type="file"
              accept={ACCEPT}
              className="w-full text-sm text-[var(--muted)] file:mr-2 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--background)] file:px-2 file:py-1 file:text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {createdId ? (
            <Button
              type="button"
              onClick={() => {
                const id = createdId;
                reset();
                onClose();
                router.push(`/jobs/${id}`);
              }}
            >
              Open job opening
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !companyId}>
                {submitting ? "Creating..." : "Create job opening"}
              </Button>
            </>
          )}
        </div>
      </form>

      <NewCompanyModal
        open={creatingCompany}
        onClose={() => setCreatingCompany(false)}
        onCreated={async (c) => {
          setCompanyId(c.id);
          setHiringContactId("");
        }}
      />
    </Modal>
  );
}
