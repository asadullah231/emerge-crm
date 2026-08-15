/**
 * The structured shape a parsed CV is normalized into. Shared by the worker
 * (which fills it via the Claude parser) and the web app (the review/confirm
 * form and the confirm mutation validate against it). Kept dependency-light
 * (zod only) so both runtimes can import it without pulling the parser stack.
 *
 * Every field is nullable: a CV may omit anything. Dates on experience are
 * preserved as free text (e.g. "Mar 2019", "2019-03") to match the M3
 * candidate_experience.start_date/end_date text columns.
 */
import { z } from "zod";

export const parsedEducationSchema = z.object({
  institution: z.string().nullable(),
  degree: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startYear: z.number().int().min(1900).max(2100).nullable(),
  endYear: z.number().int().min(1900).max(2100).nullable()
});
export type ParsedEducation = z.infer<typeof parsedEducationSchema>;

export const parsedExperienceSchema = z.object({
  company: z.string().nullable(),
  title: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  summary: z.string().nullable()
});
export type ParsedExperience = z.infer<typeof parsedExperienceSchema>;

export const parsedResumeSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  title: z.string().nullable(),
  currentEmployer: z.string().nullable(),
  email: z.string().nullable(),
  secondaryEmail: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  /** Free-text skills, comma or newline separated. */
  skills: z.string().nullable(),
  experienceYears: z.number().int().min(0).max(80).nullable(),
  education: z.array(parsedEducationSchema).default([]),
  experience: z.array(parsedExperienceSchema).default([])
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

/** The field list the Claude tool + review form iterate over (top-level scalars). */
export const PARSED_SCALAR_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "currentEmployer",
  "email",
  "secondaryEmail",
  "phone",
  "mobile",
  "city",
  "country",
  "linkedinUrl",
  "websiteUrl",
  "skills",
  "experienceYears"
] as const;
