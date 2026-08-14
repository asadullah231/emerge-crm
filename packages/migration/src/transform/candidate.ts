import { mapCandidateSource } from "../maps.js";
import type { Transformed } from "../types.js";
import { bool, lowerEmail, num, ownerId, passthroughOf, str } from "./util.js";

export interface CandidateShape {
  firstName: string | null;
  lastName: string;
  email: string | null;
  secondaryEmail: string | null;
  phone: string | null;
  mobile: string | null;
  currentTitle: string | null;
  currentEmployer: string | null;
  experienceYears: number | null;
  skills: string | null;
  expectedSalary: number | null;
  currentSalary: number | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  linkedin: string | null;
  website: string | null;
  source: string;
  rating: number | null;
  isBlocked: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EducationShape {
  institute: string | null;
  major: string | null;
  degree: string | null;
  startMonth: string | null;
  endMonth: string | null;
  isCurrent: boolean;
  sortOrder: number;
}

export interface ExperienceShape {
  title: string | null;
  company: string | null;
  summary: string | null;
  startMonth: string | null;
  endMonth: string | null;
  isCurrent: boolean;
  sortOrder: number;
}

const MAPPED = [
  "First_Name",
  "Last_Name",
  "Email",
  "Secondary_Email",
  "Phone",
  "Mobile",
  "Current_Job_Title",
  "Current_Employer",
  "Experience_in_Years",
  "Skill_Set",
  "Expected_Salary",
  "Current_Salary",
  "Street",
  "City",
  "State",
  "Zip_Code",
  "Country",
  "LinkedIn__s",
  "Website",
  "Source",
  "Rating",
  "Is_Blocked__s",
  "Candidate_Owner",
  "Created_Time",
  "Modified_Time",
  "Educational_Details",
  "Experience_Details"
];

export function transformCandidate(record: Record<string, unknown>): Transformed<CandidateShape> {
  const externalId = String(record.id);
  const src = mapCandidateSource(str(record.Source));
  const owner = ownerId(record.Candidate_Owner);
  const notes: string[] = [];
  if (src.original && src.original !== "Imported by parser" && src.original !== "Added by User")
    notes.push(`candidate source "${src.original}" mapped to "${src.source}"`);
  return {
    externalId,
    entityType: "candidate",
    shape: {
      firstName: str(record.First_Name),
      lastName: str(record.Last_Name) ?? "(unknown)",
      email: lowerEmail(record.Email),
      secondaryEmail: lowerEmail(record.Secondary_Email),
      phone: str(record.Phone),
      mobile: str(record.Mobile),
      currentTitle: str(record.Current_Job_Title),
      currentEmployer: str(record.Current_Employer),
      experienceYears: num(record.Experience_in_Years),
      skills: str(record.Skill_Set),
      expectedSalary: num(record.Expected_Salary),
      currentSalary: num(record.Current_Salary),
      street: str(record.Street),
      city: str(record.City),
      state: str(record.State),
      zipCode: str(record.Zip_Code),
      country: str(record.Country),
      linkedin: str(record.LinkedIn__s),
      website: str(record.Website),
      source: src.source,
      rating: num(record.Rating),
      isBlocked: bool(record.Is_Blocked__s),
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time)
    },
    parentRefs: owner ? [{ entityType: "user", externalId: owner, role: "owner" }] : [],
    passthrough: passthroughOf(record, MAPPED),
    notes
  };
}

/** Transform education subform rows if the parent candidate carries them inline. */
export function transformEducation(
  parentExternalId: string,
  rows: unknown
): Array<Transformed<EducationShape>> {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const duration = r.Duration as Record<string, unknown> | null | undefined;
    const externalId = `${parentExternalId}#edu#${i}`;
    return {
      externalId,
      entityType: "candidate_education" as const,
      shape: {
        institute: str(r.Institute_School),
        major: str(r.Major_Department),
        degree: str(r.Degree),
        startMonth: str(duration?.from),
        endMonth: str(duration?.to),
        isCurrent: bool(r.Currently_pursuing),
        sortOrder: i
      },
      parentRefs: [{ entityType: "candidate", externalId: parentExternalId, role: "candidate" }],
      passthrough: {},
      notes: []
    };
  });
}

/** Transform experience subform rows if the parent candidate carries them inline. */
export function transformExperience(
  parentExternalId: string,
  rows: unknown
): Array<Transformed<ExperienceShape>> {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw, i) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const duration = r.Work_Duration as Record<string, unknown> | null | undefined;
    const externalId = `${parentExternalId}#exp#${i}`;
    return {
      externalId,
      entityType: "candidate_experience" as const,
      shape: {
        title: str(r.Occupation_Title),
        company: str(r.Company),
        summary: str(r.Summary),
        startMonth: str(duration?.from),
        endMonth: str(duration?.to),
        isCurrent: bool(r.I_currently_work_here),
        sortOrder: i
      },
      parentRefs: [{ entityType: "candidate", externalId: parentExternalId, role: "candidate" }],
      passthrough: {},
      notes: []
    };
  });
}
