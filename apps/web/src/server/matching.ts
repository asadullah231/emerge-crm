/**
 * Lexical match scoring (M18): pure functions that score how well a candidate
 * fits a job from structured fields alone (no LLM). Weights: skills 55, title
 * 25, JD mentions 10, location 10. The LLM rerank (packages/ai matching.ts)
 * refines a shortlist produced by this scorer.
 */

export interface ScoreJob {
  title: string;
  description: string | null;
  requiredSkills: string | null;
  city: string | null;
  country: string | null;
}

export interface ScoreCandidate {
  title: string | null;
  skills: string | null;
  city: string | null;
  country: string | null;
}

/** Generic filler tokens that say nothing about fit. */
const STOP = new Set([
  "and",
  "the",
  "for",
  "with",
  "of",
  "in",
  "to",
  "a",
  "an",
  "or",
  "senior",
  "junior",
  "mid",
  "lead",
  "m/f/d",
  "mfd"
]);

/** Lowercased word tokens; keeps tech-y characters like c++, c#, .net, node.js. */
export function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return [
    ...new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ""))
        .filter((t) => t.length >= 2 && !STOP.has(t))
    )
  ];
}

/** Skill phrases from a comma/semicolon/newline separated skills field. */
export function skillPhrases(s: string | null | undefined): string[] {
  if (!s) return [];
  return [
    ...new Set(
      s
        .toLowerCase()
        .split(/[,;\n·•]+/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2)
    )
  ];
}

function overlapRatio(needles: string[], haystack: Set<string>): number {
  if (needles.length === 0) return 0;
  const hit = needles.filter((n) => haystack.has(n)).length;
  return hit / needles.length;
}

export interface MatchScore {
  /** 0-100 composite. */
  score: number;
  /** Job skill phrases the candidate's profile actually contains. */
  matchedSkills: string[];
}

export function scoreCandidateForJob(job: ScoreJob, cand: ScoreCandidate): MatchScore {
  const jobSkills = skillPhrases(job.requiredSkills);
  const candText = `${cand.title ?? ""} ${cand.skills ?? ""}`.toLowerCase();
  const candTokens = new Set([...tokenize(cand.title), ...tokenize(cand.skills)]);

  // Skills: exact phrase containment first, token fallback for multi-word skills.
  const matchedSkills = jobSkills.filter(
    (p) => candText.includes(p) || overlapRatio(tokenize(p), candTokens) >= 0.6
  );
  // No structured skills on the job -> fall back to title tokens as the "skills".
  const skillScore =
    jobSkills.length > 0
      ? matchedSkills.length / jobSkills.length
      : overlapRatio(tokenize(job.title), candTokens);

  const titleScore = overlapRatio(tokenize(job.title), new Set(tokenize(cand.title)));

  // JD mentions: how many of the candidate's own skills the JD text talks about.
  const candSkills = skillPhrases(cand.skills);
  const jd = (job.description ?? "").toLowerCase();
  const jdScore =
    jd && candSkills.length > 0
      ? candSkills.filter((p) => jd.includes(p)).length / candSkills.length
      : 0;

  const jobCity = job.city?.trim().toLowerCase();
  const jobCountry = job.country?.trim().toLowerCase();
  const locScore =
    jobCity && cand.city && cand.city.trim().toLowerCase() === jobCity
      ? 1
      : jobCountry && cand.country && cand.country.trim().toLowerCase() === jobCountry
        ? 0.5
        : 0;

  const score = Math.round(55 * skillScore + 25 * titleScore + 10 * jdScore + 10 * locScore);
  return { score: Math.min(100, score), matchedSkills };
}
