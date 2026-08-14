"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormError, Input, Label } from "@/components/form";
import { Modal } from "@/components/modal";
import { JOB_EMPLOYMENT_OPTIONS, JOB_WORK_MODE_OPTIONS } from "@/components/record";
import { contactName } from "@/components/new-contact-modal";
import { trpc } from "@/lib/trpc/client";

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
  const [positions, setPositions] = useState("1");

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
    setPositions("1");
  };

  const create = trpc.jobs.create.useMutation({
    onSuccess: async (created) => {
      await utils.jobs.list.invalidate();
      reset();
      onClose();
      router.push(`/jobs/${created.id}`);
    }
  });

  return (
    <Modal title="New job" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(positions, 10);
          create.mutate({
            title: title.trim(),
            companyId,
            hiringContactId: hiringContactId || null,
            employmentType: employmentType as "permanent" | "contract" | "temporary",
            workMode: workMode as "onsite" | "hybrid" | "remote",
            location: location.trim() || null,
            positions: Number.isFinite(n) && n > 0 ? n : 1
          });
        }}
      >
        <FormError message={create.error?.message} />
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
          <Label htmlFor="job-company">Client company</Label>
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !companyId}>
            {create.isPending ? "Creating..." : "Create job"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
