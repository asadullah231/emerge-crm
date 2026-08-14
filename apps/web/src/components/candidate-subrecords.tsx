"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/form";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";

type Candidate = RouterOutputs["candidates"]["get"];
type Education = Candidate["education"][number];
type Experience = Candidate["experience"][number];

function yearOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export function EducationSection({
  candidateId,
  rows,
  canWrite,
  onChanged
}: {
  candidateId: string;
  rows: Education[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [institution, setInstitution] = useState("");
  const [degree, setDegree] = useState("");
  const [field, setField] = useState("");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");

  const add = trpc.candidates.addEducation.useMutation({
    onSuccess: () => {
      setInstitution("");
      setDegree("");
      setField("");
      setStartYear("");
      setEndYear("");
      setAdding(false);
      onChanged();
    }
  });
  const remove = trpc.candidates.removeEducation.useMutation({ onSuccess: () => onChanged() });

  return (
    <div className="space-y-3">
      {rows.length === 0 && !adding ? (
        <p className="text-sm text-[var(--muted)]">No education added.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-medium">{r.institution ?? "Institution"}</p>
                <p className="text-[var(--muted)]">
                  {[r.degree, r.fieldOfStudy].filter(Boolean).join(", ")}
                  {r.startYear || r.endYear
                    ? ` (${[r.startYear, r.endYear].filter(Boolean).join(" - ")})`
                    : ""}
                </p>
              </div>
              {canWrite ? (
                <button
                  onClick={() => remove.mutate({ id: r.id })}
                  disabled={remove.isPending}
                  className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="space-y-3 rounded-md border border-[var(--border)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate({
              candidateId,
              institution: institution.trim() || null,
              degree: degree.trim() || null,
              fieldOfStudy: field.trim() || null,
              startYear: startYear ? yearOrNull(startYear) : null,
              endYear: endYear ? yearOrNull(endYear) : null
            });
          }}
        >
          <div>
            <Label htmlFor="edu-inst">Institution</Label>
            <Input
              id="edu-inst"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edu-degree">Degree</Label>
              <Input id="edu-degree" value={degree} onChange={(e) => setDegree(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edu-field">Field of study</Label>
              <Input id="edu-field" value={field} onChange={(e) => setField(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edu-start">Start year</Label>
              <Input
                id="edu-start"
                inputMode="numeric"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edu-end">End year</Label>
              <Input
                id="edu-end"
                inputMode="numeric"
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-3 py-1.5"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="px-3 py-1.5" disabled={add.isPending}>
              Add
            </Button>
          </div>
        </form>
      ) : canWrite ? (
        <Button variant="outline" className="px-3 py-1.5" onClick={() => setAdding(true)}>
          Add education
        </Button>
      ) : null}
    </div>
  );
}

export function ExperienceSection({
  candidateId,
  rows,
  canWrite,
  onChanged
}: {
  candidateId: string;
  rows: Experience[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [summary, setSummary] = useState("");

  const add = trpc.candidates.addExperience.useMutation({
    onSuccess: () => {
      setCompany("");
      setTitle("");
      setStartDate("");
      setEndDate("");
      setSummary("");
      setAdding(false);
      onChanged();
    }
  });
  const remove = trpc.candidates.removeExperience.useMutation({ onSuccess: () => onChanged() });

  return (
    <div className="space-y-3">
      {rows.length === 0 && !adding ? (
        <p className="text-sm text-[var(--muted)]">No work experience added.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {r.title ?? "Role"}
                  {r.company ? ` at ${r.company}` : ""}
                </p>
                <p className="text-[var(--muted)]">
                  {[r.startDate, r.isCurrent ? "Present" : r.endDate].filter(Boolean).join(" - ")}
                </p>
                {r.summary ? <p className="mt-1 whitespace-pre-wrap">{r.summary}</p> : null}
              </div>
              {canWrite ? (
                <button
                  onClick={() => remove.mutate({ id: r.id })}
                  disabled={remove.isPending}
                  className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="space-y-3 rounded-md border border-[var(--border)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate({
              candidateId,
              company: company.trim() || null,
              title: title.trim() || null,
              startDate: startDate.trim() || null,
              endDate: endDate.trim() || null,
              summary: summary.trim() || null
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-company">Company</Label>
              <Input
                id="exp-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="exp-title">Title</Label>
              <Input id="exp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-start">Start (e.g. 2020)</Label>
              <Input
                id="exp-start"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="exp-end">End (or blank)</Label>
              <Input id="exp-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="exp-summary">Summary</Label>
            <textarea
              id="exp-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="px-3 py-1.5"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="px-3 py-1.5" disabled={add.isPending}>
              Add
            </Button>
          </div>
        </form>
      ) : canWrite ? (
        <Button variant="outline" className="px-3 py-1.5" onClick={() => setAdding(true)}>
          Add experience
        </Button>
      ) : null}
    </div>
  );
}
