/**
 * Pre-search report + LinkedIn Recruiter boolean pack for a job opening.
 * Free-text generation (no tool schema): the deliverable is a long structured
 * report recruiters read and copy strings from, modeled on the agency's
 * hand-built "Boolean Search Pack" documents. Output uses the app's note
 * formatting conventions (bold, "Label:" lines, "- " bullets) so it renders
 * cleanly in the CRM.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AI_PROVIDER_BY_KEY, resolveBaseUrl, type AiConfig } from "./providers";

export interface SearchPackJobInput {
  title: string;
  clientName: string | null;
  description: string | null;
  clientCallSummary: string | null;
  requiredSkills: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  workExperience: string | null;
  employmentType: string | null;
  workMode: string | null;
  salaryText: string | null;
}

function packPrompt(job: SearchPackJobInput, preparedDate: string): string {
  const jd = [
    `Job title: ${job.title}`,
    job.clientName ? `Hiring client: ${job.clientName}` : null,
    job.location ? `Location: ${job.location}` : null,
    [job.city, job.country].filter(Boolean).length > 0
      ? `City/Country: ${[job.city, job.country].filter(Boolean).join(", ")}`
      : null,
    job.workMode ? `Work mode: ${job.workMode}` : null,
    job.employmentType ? `Employment type: ${job.employmentType}` : null,
    job.industry ? `Industry: ${job.industry}` : null,
    job.workExperience ? `Required experience: ${job.workExperience}` : null,
    job.salaryText ? `Salary: ${job.salaryText}` : null,
    job.requiredSkills ? `Required skills: ${job.requiredSkills}` : null,
    job.description ? `Job description:\n${job.description.slice(0, 6000)}` : null,
    job.clientCallSummary ? `Client call summary:\n${job.clientCallSummary.slice(0, 4000)}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "You are a senior recruitment sourcer. Produce a complete LinkedIn Recruiter",
    "Boolean Search Pack (pre-search report) for the job below, ready for a",
    "recruiter to run today. Write in English.",
    "",
    "FORMAT RULES (the app renders these):",
    '- Use "**bold**" for section headings and emphasis.',
    '- Use "Label:" at the start of summary lines (e.g. "Client:", "Location:").',
    '- Use "- " bullets for lists. No markdown headings (#), no tables, no code fences.',
    "- Put every boolean string on its own line(s), exactly as it should be pasted.",
    "",
    "BOOLEAN RULES:",
    "- Operators UPPERCASE (AND / OR / NOT). Every OR block inside parentheses.",
    "- LinkedIn Recruiter has no wildcards: spell out variants (estimate / estimating / estimator).",
    "- Quote multi-word phrases; single words unquoted.",
    "- Exclude the hiring client (and any parent company) from all company strings.",
    "",
    "STRUCTURE (follow exactly):",
    `**Pre-Search Summary** - Client, Position, Location, Language, Anchor keywords, Other priority themes, Must-haves, Comp, Prepared ${preparedDate}. One "Label:" line each.`,
    "**How to use this pack** - 3-4 short bullets (three strings three fields, no wildcards, uppercase operators, start Full then Tight/Broad by volume).",
    "**1. Technical Keywords String (Keywords field)**",
    "  **1a. Full string - start here** then the string, then **Block-by-block notes** explaining each block and which blocks are FLEX.",
    "  **1b. Tight variant - use when results exceed ~300** then the string and one note.",
    "  **1c. Broad variant - use when results fall below ~50** then the string and one note.",
    "  **1d. Optional NOT block** then the string and a caution note.",
    "**2. Job Titles String (Current/Past Title field)**",
    "  **2a. Core titles** - one OR string spelling out every seniority variant, then Notes bullets.",
    "  **2b. Broad add-on** - feeder titles with a screening note.",
    "**3. Companies String (Current/Past Company field)**",
    "  **3a. Combined string** - real companies relevant to this sector and geography.",
    "  **3b. Groups** - Group A direct competitors, B regional/national players, C adjacent industry, D consultancies/OEMs if relevant, E client-side pool, F lowest priority. For each: the OR string and 1-2 sentences on why it is a good pool. Only include groups that make sense for this role.",
    "**4. Practical Search Tips** - Geography (location filter + radius), Experience and seniority filters, Industry filters, a Tight vs broad run sequence (Run 1-4), and Hygiene bullets (exclude client employees, spotlights, saved searches with alerts).",
    "",
    "Use only real companies you are confident exist in this sector and market;",
    "prefer well-known names over obscure ones. If the market is unfamiliar, keep",
    "Group lists shorter rather than inventing companies.",
    "",
    "--- JOB ---",
    jd
  ].join("\n");
}

export async function generateSearchPack(
  cfg: AiConfig,
  job: SearchPackJobInput,
  preparedDate: string
): Promise<string> {
  const native = AI_PROVIDER_BY_KEY[cfg.provider]?.native ?? "openai";
  const prompt = packPrompt(job, preparedDate);
  if (native === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const message = await client.messages.create({
      model: cfg.model,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }]
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("search pack generation returned no text");
    return text;
  }
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: resolveBaseUrl(cfg) ?? undefined });
  const res = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }]
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("search pack generation returned no text");
  return text;
}
