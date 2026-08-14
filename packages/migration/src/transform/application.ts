import { mapApplicationStatus } from "../maps.js";
import type { Transformed } from "../types.js";
import { lookupId, num, ownerId, passthroughOf, str } from "./util.js";

export interface ApplicationShape {
  stage: string;
  statusKey: string;
  statusLabel: string;
  source: string | null;
  rating: number | null;
  appliedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Zoho carries the linked candidate + job on the Application record via
 * dollar-prefixed private fields observed in the live snapshot:
 *   $Candidate_Id   = <zoho candidate record id> (bare string)
 *   $Job_Opening_Id = <zoho job record id> (bare string)
 * The public `Job_Opening_ID` (no dollar) is Zoho's auto-numbered display id
 * like "ZR_91_JOB" and does NOT match external_refs, so we ignore it here.
 * The other candidate keys are kept as belt-and-braces fallbacks in case a
 * different Zoho response shape ever surfaces.
 */
export function extractCandidateExternalId(record: Record<string, unknown>): string | null {
  const r = record as Record<string, unknown>;
  return lookupId(r.$Candidate_Id) ?? lookupId(r.Candidate_Id) ?? lookupId(r.Candidate) ?? null;
}

export function extractJobExternalId(record: Record<string, unknown>): string | null {
  const r = record as Record<string, unknown>;
  return (
    lookupId(r.$Job_Opening_Id) ?? lookupId(r.Job_Opening_Id) ?? lookupId(r.Job_Opening) ?? null
  );
}

const MAPPED = [
  "Application_Status",
  "Hiring_Pipeline",
  "Application_Source",
  "Application_Owner",
  "Rating",
  "Created_Time",
  "Modified_Time",
  "Candidate_ID",
  "Candidate",
  "Job_Opening_ID",
  "Job_Opening",
  "$Parent_Id",
  "Parent_Id",
  "$Job_Opening_Id",
  "Application_Name__s",
  "Application_ID",
  "Full_Name",
  "First_Name",
  "Last_Name",
  "Email",
  "Phone",
  "Mobile"
];

export function transformApplication(
  record: Record<string, unknown>
): Transformed<ApplicationShape> {
  const externalId = String(record.id);
  const statusRaw = str(record.Application_Status);
  const mapped = mapApplicationStatus(statusRaw);
  const zohoStage = str(record.Hiring_Pipeline);
  const notes: string[] = [];
  if (mapped.statusKey === "imported_unknown")
    notes.push(`unmapped Zoho status "${statusRaw ?? "(null)"}" -> archived/imported_unknown`);
  // Report Zoho stage vs mapped stage mismatch (map wins).
  const zohoStageKey = zohoStage
    ?.toLowerCase()
    .replace("submissions", "submitted")
    .replace(" ", "_");
  if (zohoStageKey && zohoStageKey !== mapped.stage)
    notes.push(`Zoho stage "${zohoStage}" differs from mapped stage "${mapped.stage}" (map wins)`);

  const candidateExtId = extractCandidateExternalId(record);
  const jobExtId = extractJobExternalId(record);
  const owner = ownerId(record.Application_Owner);
  const parentRefs: Transformed<ApplicationShape>["parentRefs"] = [];
  if (candidateExtId)
    parentRefs.push({ entityType: "candidate", externalId: candidateExtId, role: "candidate" });
  if (jobExtId) parentRefs.push({ entityType: "job", externalId: jobExtId, role: "job" });
  if (owner) parentRefs.push({ entityType: "user", externalId: owner, role: "owner" });

  return {
    externalId,
    entityType: "application",
    shape: {
      stage: mapped.stage,
      statusKey: mapped.statusKey,
      statusLabel: mapped.label,
      source: str(record.Application_Source),
      rating: num(record.Rating),
      appliedAt: str(record.Created_Time),
      createdAt: str(record.Created_Time),
      updatedAt: str(record.Modified_Time)
    },
    parentRefs,
    passthrough: passthroughOf(record, MAPPED),
    notes
  };
}
