/**
 * Notes / timeline constants shared by server and client (M6). Pure data.
 */

/** Record types that carry Notes + a Timeline (Zoho parity: every module). */
export const NOTABLE_ENTITY_TYPES = [
  "candidate",
  "job",
  "company",
  "contact",
  "application"
] as const;

export type NotableEntityType = (typeof NOTABLE_ENTITY_TYPES)[number];

/** Human labels + the route prefix each entity links to. */
export const ENTITY_META: Record<NotableEntityType, { label: string; path: string }> = {
  candidate: { label: "Candidate", path: "/candidates" },
  job: { label: "Job", path: "/jobs" },
  company: { label: "Company", path: "/companies" },
  contact: { label: "Contact", path: "/contacts" },
  application: { label: "Application", path: "/applications" }
};

/**
 * Of the mentions the composer tracked, keep only those whose "@Name" still
 * appears in the final body (so deleting the text un-notifies the person).
 */
export function mentionIdsInBody(
  body: string,
  tracked: { userId: string; name: string }[]
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const m of tracked) {
    if (body.includes(`@${m.name}`) && !seen.has(m.userId)) {
      seen.add(m.userId);
      ids.push(m.userId);
    }
  }
  return ids;
}

/** Default workspace note templates, seeded lazily (Zoho parity: screening call). */
export const DEFAULT_NOTE_TEMPLATES: { name: string; body: string; sortOrder: number }[] = [
  {
    name: "Screening call",
    sortOrder: 1,
    body: [
      "Screening call summary",
      "- Availability / notice period:",
      "- Salary expectation:",
      "- Location / remote:",
      "- Motivation for move:",
      "- Key strengths:",
      "- Concerns / risks:",
      "- Next step:"
    ].join("\n")
  },
  {
    name: "Client submission",
    sortOrder: 2,
    body: [
      "Submitted to client",
      "- Why this candidate fits:",
      "- Salary / availability confirmed:",
      "- Anything to flag:"
    ].join("\n")
  },
  {
    name: "Interview feedback",
    sortOrder: 3,
    body: [
      "Interview feedback",
      "- Round / interviewer:",
      "- Outcome:",
      "- Strengths:",
      "- Reservations:",
      "- Recommendation:"
    ].join("\n")
  }
];
