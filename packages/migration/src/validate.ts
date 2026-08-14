/**
 * Row-level validators that gate writes. A failing row is skipped and recorded
 * in import_records with the reason; the run continues.
 */
import type { Transformed, ValidationResult } from "./types.js";

function ok(): ValidationResult {
  return { ok: true, errors: [], warnings: [] };
}

function fail(msg: string): ValidationResult {
  return { ok: false, errors: [msg], warnings: [] };
}

export function validate(t: Transformed<Record<string, unknown>>): ValidationResult {
  switch (t.entityType) {
    case "company":
      return t.shape.name ? ok() : fail("company.name is required");
    case "contact":
      return t.shape.lastName ? ok() : fail("contact.lastName is required");
    case "candidate":
      return t.shape.lastName ? ok() : fail("candidate.lastName is required");
    case "job": {
      const parents = t.parentRefs.filter((r) => r.role === "company");
      if (!t.shape.title) return fail("job.title is required");
      if (parents.length === 0) return fail("job.company is required (no Client_Name in Zoho row)");
      return ok();
    }
    case "application": {
      const hasCandidate = t.parentRefs.some((r) => r.role === "candidate");
      const hasJob = t.parentRefs.some((r) => r.role === "job");
      if (!hasCandidate) return fail("application: candidate link missing");
      if (!hasJob) return fail("application: job link missing");
      return ok();
    }
    case "note": {
      const hasParent = t.parentRefs.some((r) => r.role === "parent");
      if (!hasParent) return fail("note: parent record could not be resolved");
      return ok();
    }
    default:
      return ok();
  }
}
