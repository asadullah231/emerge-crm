/**
 * Application pipeline constants shared by the server (seeding + status machine)
 * and the client (kanban columns + labels). Pure data, no imports, so both
 * runtimes can use it.
 */

export const APPLICATION_STAGES = [
  "screening",
  "submitted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "archived"
] as const;

export type ApplicationStageKey = (typeof APPLICATION_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStageKey, string> = {
  screening: "Screening",
  submitted: "Submitted",
  interview: "Interview",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
  archived: "Archived"
};

/**
 * Tailwind accent classes per stage for kanban column headers and badges. The
 * two brand colours lead the active pipeline; terminal columns use neutral or
 * red semantics so they read as end-states, never as brand emphasis.
 */
export const STAGE_ACCENT: Record<ApplicationStageKey, string> = {
  screening: "text-[var(--brand-secondary)]",
  submitted: "text-[var(--brand-secondary)]",
  interview: "text-[var(--brand-primary)]",
  offered: "text-[var(--brand-primary)]",
  hired: "text-green-600",
  rejected: "text-red-600",
  archived: "text-[var(--muted)]"
};

/**
 * Small stage-dot colors for the kanban board. These are semantic pipeline
 * colors (not brand accents): each column gets a distinct, muted dot so the
 * stages read at a glance, with green/red reserved for hired/rejected.
 */
export const STAGE_DOT: Record<ApplicationStageKey, string> = {
  screening: "bg-[var(--brand-secondary)]",
  submitted: "bg-sky-500",
  interview: "bg-violet-500",
  offered: "bg-amber-500",
  hired: "bg-green-500",
  rejected: "bg-red-500",
  archived: "bg-zinc-400"
};

export type DefaultStatus = {
  key: string;
  label: string;
  stage: ApplicationStageKey;
  sortOrder: number;
  isEntry: boolean;
  isTerminal: boolean;
};

/**
 * The Zoho statuses our team actually uses, mapped to the 7 stages. Exactly
 * one status per stage is the entry status (what a new application, or a kanban
 * drop into that stage, snaps to). M12 added the offer resolution statuses
 * (accepted/declined/withdrawn) onto the offered/rejected stages.
 */
export const DEFAULT_APPLICATION_STATUSES: DefaultStatus[] = [
  {
    key: "associated",
    label: "Associated",
    stage: "screening",
    sortOrder: 1,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "in_review",
    label: "In Review",
    stage: "screening",
    sortOrder: 2,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "submitted_to_client",
    label: "Submitted to client",
    stage: "submitted",
    sortOrder: 3,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "approved_by_client",
    label: "Approved by client",
    stage: "submitted",
    sortOrder: 4,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "interview_to_be_scheduled",
    label: "Interview to be scheduled",
    stage: "interview",
    sortOrder: 5,
    isEntry: true,
    isTerminal: false
  },
  {
    key: "interview_scheduled",
    label: "Interview scheduled",
    stage: "interview",
    sortOrder: 6,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "interview_in_progress",
    label: "Interview in progress",
    stage: "interview",
    sortOrder: 7,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "offer_made",
    label: "Offer made",
    stage: "offered",
    sortOrder: 8,
    isEntry: true,
    isTerminal: false
  },
  { key: "hired", label: "Hired", stage: "hired", sortOrder: 9, isEntry: true, isTerminal: true },
  {
    key: "unqualified",
    label: "Unqualified",
    stage: "rejected",
    sortOrder: 10,
    isEntry: false,
    isTerminal: true
  },
  {
    key: "rejected_by_client",
    label: "Rejected by client",
    stage: "rejected",
    sortOrder: 11,
    isEntry: false,
    isTerminal: true
  },
  {
    key: "rejected",
    label: "Rejected",
    stage: "rejected",
    sortOrder: 12,
    isEntry: true,
    isTerminal: true
  },
  {
    key: "archived",
    label: "Archived",
    stage: "archived",
    sortOrder: 13,
    isEntry: true,
    isTerminal: true
  },
  {
    key: "offer_accepted",
    label: "Offer accepted",
    stage: "offered",
    sortOrder: 14,
    isEntry: false,
    isTerminal: false
  },
  {
    key: "offer_declined",
    label: "Offer declined",
    stage: "rejected",
    sortOrder: 15,
    isEntry: false,
    isTerminal: true
  },
  {
    key: "offer_withdrawn",
    label: "Offer withdrawn",
    stage: "rejected",
    sortOrder: 16,
    isEntry: false,
    isTerminal: true
  }
];

/** The stages whose statuses expect a rejection reason. */
export const REJECTION_STAGE: ApplicationStageKey = "rejected";

/** Entry status key for a given stage, from the defaults. */
export function defaultEntryStatus(stage: ApplicationStageKey): string {
  return (
    DEFAULT_APPLICATION_STATUSES.find((s) => s.stage === stage && s.isEntry)?.key ?? "associated"
  );
}
