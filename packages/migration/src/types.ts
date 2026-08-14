/**
 * Emerge-side entity type names, used everywhere in the migration engine
 * (external_refs.entity_type, import_records.entity_type). Keep these string
 * literals stable - they are persisted.
 */
export type EntityType =
  | "user"
  | "company"
  | "contact"
  | "candidate"
  | "candidate_education"
  | "candidate_experience"
  | "job"
  | "application"
  | "application_status_history"
  | "note"
  | "attachment";

export type ImportMode = "dry_run" | "import" | "delta";

/** A raw record read from a Zoho snapshot JSONL file, plus its source module. */
export interface RawZohoRecord {
  module: string;
  record: Record<string, unknown>;
}

/** The result of transforming one raw record into an Emerge target row. */
export interface Transformed<TShape> {
  externalId: string;
  entityType: EntityType;
  shape: TShape;
  /** Links this row needs by external id (source entity + external id -> role). */
  parentRefs: Array<{ entityType: EntityType; externalId: string; role: string }>;
  /** Any Zoho fields not mapped into a column go here under zoho.<api_name>. */
  passthrough: Record<string, unknown>;
  /** Non-fatal notes (e.g. "on-hold mapped to screening"). */
  notes: string[];
}

/** The result of validating a transformed row. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Per-entity counters written into import_runs.stats. */
export interface EntityStats {
  fetched: number;
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  failed: number;
}
