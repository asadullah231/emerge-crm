/**
 * Duplicated from apps/web/src/lib/applications.ts to keep this package
 * decoupled from the Next.js app. If those stages ever change, update both.
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
