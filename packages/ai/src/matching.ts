/**
 * LLM-assisted matching (M18, Zoho Zia parity): rerank a lexical shortlist of
 * candidates for a job with scores + one-line reasons, and expand a search
 * query into related skills/terms for semantic-ish search. Both use a forced
 * tool/function call so the output is always machine-readable, mirroring
 * resume.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { AI_PROVIDER_BY_KEY, resolveBaseUrl, type AiConfig } from "./providers";

const RANK_TOOL = "rank_candidates";
const EXPAND_TOOL = "expand_terms";

export interface MatchJobInput {
  title: string;
  description: string | null;
  requiredSkills: string | null;
  location: string | null;
}

export interface MatchCandidateInput {
  id: string;
  name: string;
  title: string | null;
  skills: string | null;
  city: string | null;
  country: string | null;
  experienceYears: number | null;
}

const rankResultSchema = z.object({
  rankings: z.array(
    z.object({
      candidateId: z.string(),
      score: z.number().min(0).max(100),
      reason: z.string().max(300)
    })
  )
});
export type RankResult = z.infer<typeof rankResultSchema>;

const RANK_SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
          score: { type: "number", description: "Fit score 0-100" },
          reason: { type: "string", description: "One short sentence, recruiter-friendly" }
        },
        required: ["candidateId", "score", "reason"]
      }
    }
  },
  required: ["rankings"]
} as const;

function rankPrompt(job: MatchJobInput, candidates: MatchCandidateInput[]): string {
  const jd = [
    `Title: ${job.title}`,
    job.requiredSkills ? `Required skills: ${job.requiredSkills}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.description ? `Description: ${job.description.slice(0, 4000)}` : null
  ]
    .filter(Boolean)
    .join("\n");
  const list = candidates
    .map((c) =>
      [
        `id: ${c.id}`,
        `name: ${c.name}`,
        c.title ? `title: ${c.title}` : null,
        c.skills ? `skills: ${c.skills}` : null,
        c.experienceYears !== null ? `experience: ${c.experienceYears} years` : null,
        [c.city, c.country].filter(Boolean).length > 0
          ? `location: ${[c.city, c.country].filter(Boolean).join(", ")}`
          : null
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n");
  return [
    "You are a recruitment matching engine. Score how well each candidate fits the job.",
    "Consider skill fit (including implied skills, e.g. Next.js implies React), seniority, domain and location.",
    "Score 0-100 where 80+ means submit today, 50-79 worth a look, below 50 weak.",
    "Give every candidate exactly one entry. Keep reasons to one short sentence.",
    "",
    "--- JOB ---",
    jd,
    "",
    "--- CANDIDATES ---",
    list
  ].join("\n");
}

export async function rankCandidates(
  cfg: AiConfig,
  job: MatchJobInput,
  candidates: MatchCandidateInput[]
): Promise<RankResult> {
  const native = AI_PROVIDER_BY_KEY[cfg.provider]?.native ?? "openai";
  const prompt = rankPrompt(job, candidates);
  const raw =
    native === "anthropic"
      ? await anthropicTool(cfg, prompt, RANK_TOOL, RANK_SCHEMA)
      : await openaiTool(cfg, prompt, RANK_TOOL, RANK_SCHEMA as unknown as Record<string, unknown>);
  return rankResultSchema.parse(raw);
}

const expandResultSchema = z.object({ terms: z.array(z.string().max(60)).max(15) });

const EXPAND_SCHEMA = {
  type: "object",
  properties: {
    terms: {
      type: "array",
      items: { type: "string" },
      description: "Related skills, synonyms, tools and job titles"
    }
  },
  required: ["terms"]
} as const;

/**
 * Expand a recruiter search query into related terms so a keyword search can
 * behave semantically (e.g. "React" also finds Next.js, Redux, frontend).
 */
export async function expandSearchTerms(cfg: AiConfig, query: string): Promise<string[]> {
  const native = AI_PROVIDER_BY_KEY[cfg.provider]?.native ?? "openai";
  const prompt = [
    "You expand recruitment search queries. Given a query, return up to 12 closely",
    "related terms a matching CV might contain instead: synonyms, related tools,",
    "frameworks, certifications and equivalent job titles. Include the original",
    "term first. Terms only, no explanations.",
    "",
    `Query: ${query.slice(0, 200)}`
  ].join("\n");
  const raw =
    native === "anthropic"
      ? await anthropicTool(cfg, prompt, EXPAND_TOOL, EXPAND_SCHEMA)
      : await openaiTool(
          cfg,
          prompt,
          EXPAND_TOOL,
          EXPAND_SCHEMA as unknown as Record<string, unknown>
        );
  const parsed = expandResultSchema.parse(raw);
  const seen = new Set<string>();
  return parsed.terms
    .map((t) => t.trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

async function anthropicTool(
  cfg: AiConfig,
  prompt: string,
  toolName: string,
  schema: object
): Promise<unknown> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const message = await client.messages.create({
    model: cfg.model,
    max_tokens: 4096,
    tools: [
      {
        name: toolName,
        description: "Emit the structured result.",
        input_schema: schema as unknown as Anthropic.Tool.InputSchema
      }
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: prompt }]
  });
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("matching returned no structured output");
  }
  return toolUse.input;
}

async function openaiTool(
  cfg: AiConfig,
  prompt: string,
  toolName: string,
  schema: Record<string, unknown>
): Promise<unknown> {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: resolveBaseUrl(cfg) ?? undefined });
  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: { name: toolName, description: "Emit the structured result.", parameters: schema }
      }
    ],
    tool_choice: { type: "function", function: { name: toolName } }
  });
  const call = res.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== "function") {
    throw new Error("matching returned no structured output");
  }
  return JSON.parse(call.function.arguments);
}
