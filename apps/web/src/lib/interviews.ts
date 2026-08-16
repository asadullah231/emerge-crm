/** Interview display constants shared by client components (pure data). */

export const INTERVIEW_TYPE_OPTIONS = [
  { value: "screen", label: "Screen" },
  { value: "l1", label: "Round 1" },
  { value: "l2", label: "Round 2" },
  { value: "l3", label: "Round 3" },
  { value: "l4", label: "Round 4" },
  { value: "client", label: "Client" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other" }
] as const;

export const INTERVIEW_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  INTERVIEW_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

export const INTERVIEW_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show"
};

export const INTERVIEW_STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
  completed: "bg-green-500/10 text-green-600",
  cancelled: "bg-zinc-500/10 text-[var(--muted)]",
  no_show: "bg-red-500/10 text-red-600"
};

export const RECOMMENDATION_OPTIONS = [
  { value: "strong_yes", label: "Strong yes" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong no" }
] as const;

export const RECOMMENDATION_LABEL: Record<string, string> = Object.fromEntries(
  RECOMMENDATION_OPTIONS.map((o) => [o.value, o.label])
);
