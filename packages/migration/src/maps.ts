/**
 * Zoho -> Emerge value maps: application status/stage, job status, candidate
 * source. Every unmapped value is preserved in passthrough and reported.
 */
import { APPLICATION_STAGES } from "./stageConst.js";

/** Emerge application stage keys (mirrors apps/web/src/lib/applications.ts). */
export type AppStage = (typeof APPLICATION_STAGES)[number];

/**
 * Full Zoho Application_Status catalog (30 values as returned by the fields
 * API) mapped to Emerge stage + status_key. Live-observed counts (14 Aug)
 * are in the migration-map doc; every declared value is still mapped so
 * historical rows never fall through.
 */
export const APPLICATION_STATUS_MAP: Record<
  string,
  { stage: AppStage; statusKey: string; label: string }
> = {
  Associated: { stage: "screening", statusKey: "associated", label: "Associated" },
  Applied: { stage: "screening", statusKey: "applied", label: "Applied" },
  "In Review": { stage: "screening", statusKey: "in_review", label: "In Review" },
  Qualified: { stage: "screening", statusKey: "qualified", label: "Qualified" },
  "On-Hold": { stage: "screening", statusKey: "on_hold", label: "On hold" },
  "Submitted-to-client": {
    stage: "submitted",
    statusKey: "submitted_to_client",
    label: "Submitted to client"
  },
  "Approved by client": {
    stage: "submitted",
    statusKey: "approved_by_client",
    label: "Approved by client"
  },
  "Interview-to-be-Scheduled": {
    stage: "interview",
    statusKey: "interview_to_be_scheduled",
    label: "Interview to be scheduled"
  },
  "Interview-Scheduled": {
    stage: "interview",
    statusKey: "interview_scheduled",
    label: "Interview scheduled"
  },
  "Interview-in-Progress": {
    stage: "interview",
    statusKey: "interview_in_progress",
    label: "Interview in progress"
  },
  "Hired-for-Interview": {
    stage: "interview",
    statusKey: "hired_for_interview",
    label: "Hired for interview"
  },
  "To-be-Offered": { stage: "offered", statusKey: "offer_planned", label: "Offer planned" },
  "Offer-Made": { stage: "offered", statusKey: "offer_made", label: "Offer made" },
  "Offer-Accepted": { stage: "offered", statusKey: "offer_accepted", label: "Offer accepted" },
  "Offer-Declined": { stage: "offered", statusKey: "offer_declined", label: "Offer declined" },
  "Offer-Withdrawn": { stage: "offered", statusKey: "offer_withdrawn", label: "Offer withdrawn" },
  Hired: { stage: "hired", statusKey: "hired", label: "Hired" },
  Joined: { stage: "hired", statusKey: "joined", label: "Joined" },
  "Converted - Employee": {
    stage: "hired",
    statusKey: "converted_employee",
    label: "Converted - Employee"
  },
  "Converted - Temp": { stage: "hired", statusKey: "converted_temp", label: "Converted - Temp" },
  "Hired by client": { stage: "hired", statusKey: "hired_by_client", label: "Hired by client" },
  "Forward-to-Onboarding": {
    stage: "hired",
    statusKey: "forward_to_onboarding",
    label: "Forward to onboarding"
  },
  Rejected: { stage: "rejected", statusKey: "rejected", label: "Rejected" },
  "Rejected by client": {
    stage: "rejected",
    statusKey: "rejected_by_client",
    label: "Rejected by client"
  },
  "Rejected-for-Interview": {
    stage: "rejected",
    statusKey: "rejected_for_interview",
    label: "Rejected for interview"
  },
  "Rejected-Hirable": {
    stage: "rejected",
    statusKey: "rejected_hirable",
    label: "Rejected hirable"
  },
  Unqualified: { stage: "rejected", statusKey: "unqualified", label: "Unqualified" },
  "Junk candidate": { stage: "rejected", statusKey: "junk_candidate", label: "Junk candidate" },
  "No-Show": { stage: "rejected", statusKey: "no_show", label: "No show" },
  Archived: { stage: "archived", statusKey: "archived", label: "Archived" }
};

/** Fallback for any status value Zoho grows in the future. */
export const UNKNOWN_APPLICATION_STATUS = {
  stage: "archived" as AppStage,
  statusKey: "imported_unknown",
  label: "Imported (unknown status)"
};

/**
 * The Zoho API returns Application_Status as the DISPLAY label on records
 * (e.g. "Submitted to client") but exposes the machine `actual_value`
 * (e.g. "Submitted-to-client") via the fields metadata. Both variants map to
 * the same Emerge (stage, status_key), so we index both.
 */
const APPLICATION_STATUS_DISPLAY_ALIASES: Record<string, keyof typeof APPLICATION_STATUS_MAP> = {
  "Submitted to client": "Submitted-to-client",
  "Interview to be scheduled": "Interview-to-be-Scheduled",
  "Interview-Scheduled": "Interview-Scheduled",
  "Interview scheduled": "Interview-Scheduled",
  "Interview in progress": "Interview-in-Progress",
  "Rejected for interview": "Rejected-for-Interview",
  "Rejected hirable": "Rejected-Hirable",
  "On hold": "On-Hold",
  "Offer planned": "To-be-Offered",
  "Offer made": "Offer-Made",
  "Offer accepted": "Offer-Accepted",
  "Offer declined": "Offer-Declined",
  "Offer withdrawn": "Offer-Withdrawn",
  "No show": "No-Show",
  "Hired for interview": "Hired-for-Interview",
  "Forward to onboarding": "Forward-to-Onboarding"
};

export function mapApplicationStatus(zoho: string | null | undefined) {
  if (!zoho) return { ...UNKNOWN_APPLICATION_STATUS, source: null };
  const alias = APPLICATION_STATUS_DISPLAY_ALIASES[zoho];
  const key = alias ?? zoho;
  const hit = APPLICATION_STATUS_MAP[key];
  if (hit) return { ...hit, source: zoho };
  return { ...UNKNOWN_APPLICATION_STATUS, source: zoho };
}

/** Zoho Job_Opening_Status -> Emerge job status. */
export const JOB_STATUS_MAP: Record<string, string> = {
  "In-progress": "open",
  "On-Hold": "on_hold",
  Filled: "filled",
  Cancelled: "cancelled",
  Declined: "cancelled",
  Inactive: "inactive",
  "Waiting for approval": "open"
};

export function mapJobStatus(zoho: string | null | undefined): {
  status: string;
  note: string | null;
} {
  if (!zoho) return { status: "open", note: "missing status defaulted to open" };
  const hit = JOB_STATUS_MAP[zoho];
  if (hit)
    return {
      status: hit,
      note: zoho === "Waiting for approval" ? "was 'Waiting for approval' in Zoho" : null
    };
  return { status: "open", note: `unmapped Zoho status "${zoho}" -> open` };
}

/** Zoho Job Type picklist -> Emerge employment type enum. */
export const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  "Full-Time": "full_time",
  "Full Time": "full_time",
  "Part-Time": "part_time",
  "Part Time": "part_time",
  Contract: "contract",
  Temporary: "contract",
  Internship: "internship",
  Freelance: "contract"
};

export function mapEmploymentType(zoho: string | null | undefined): string | null {
  if (!zoho) return null;
  return EMPLOYMENT_TYPE_MAP[zoho] ?? null;
}

/** Zoho candidate Source -> Emerge source enum. */
export function mapCandidateSource(zoho: string | null | undefined): {
  source: string;
  original: string | null;
} {
  if (!zoho) return { source: "import", original: null };
  if (zoho === "Imported by parser") return { source: "parser", original: zoho };
  if (zoho === "Added by User") return { source: "manual", original: zoho };
  if (zoho === "Employee Referral" || zoho === "External Referral")
    return { source: "referral", original: zoho };
  if (zoho === "API") return { source: "api", original: zoho };
  return { source: "import", original: zoho };
}
