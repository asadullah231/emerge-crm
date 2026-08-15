/**
 * Provider-agnostic resume parser. Given a workspace AiConfig and a CV file, it
 * prepares the input for that provider and asks the model to return structured
 * data via a forced tool/function call, validated against ParsedResume.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { parsedResumeSchema, type ParsedResume } from "@emerge/core";
import { AI_PROVIDER_BY_KEY, resolveBaseUrl, type AiConfig } from "./providers";
import { prepareInput } from "./extract";

const TOOL_NAME = "emit_resume";

const PROMPT = [
  "You extract structured data from a candidate's CV/resume for a recruitment CRM.",
  "Return ONLY via the emit_resume tool. Rules:",
  "- Use null for anything the CV does not state. Never invent or infer beyond what is written.",
  "- firstName/lastName: split the candidate's name; lastName is required if a name is present.",
  "- title: current or most recent job title. currentEmployer: current or most recent company.",
  "- skills: a single comma-separated string of the candidate's skills/technologies.",
  "- experienceYears: total years of professional experience if stated or clearly computable, else null.",
  "- education[]: institution/degree/fieldOfStudy/startYear/endYear (years as integers or null).",
  "- experience[]: company/title/startDate/endDate (free text like \"Mar 2019\"), isCurrent, summary.",
  "- Preserve the CV's language for free-text values; do not translate."
].join("\n");

// JSON Schema shared by both the Anthropic tool and the OpenAI function.
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    firstName: { type: ["string", "null"] },
    lastName: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    currentEmployer: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    secondaryEmail: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    mobile: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
    linkedinUrl: { type: ["string", "null"] },
    websiteUrl: { type: ["string", "null"] },
    skills: { type: ["string", "null"] },
    experienceYears: { type: ["integer", "null"] },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          institution: { type: ["string", "null"] },
          degree: { type: ["string", "null"] },
          fieldOfStudy: { type: ["string", "null"] },
          startYear: { type: ["integer", "null"] },
          endYear: { type: ["integer", "null"] }
        },
        required: ["institution", "degree", "fieldOfStudy", "startYear", "endYear"]
      }
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          company: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          startDate: { type: ["string", "null"] },
          endDate: { type: ["string", "null"] },
          isCurrent: { type: "boolean" },
          summary: { type: ["string", "null"] }
        },
        required: ["company", "title", "startDate", "endDate", "isCurrent", "summary"]
      }
    }
  },
  required: [
    "firstName",
    "lastName",
    "title",
    "currentEmployer",
    "email",
    "secondaryEmail",
    "phone",
    "mobile",
    "city",
    "country",
    "linkedinUrl",
    "websiteUrl",
    "skills",
    "experienceYears",
    "education",
    "experience"
  ]
} as const;

const MAX_TEXT_CHARS = 60_000;

export interface CvFile {
  buffer: Buffer;
  mime: string;
  filename: string;
}

export async function parseResume(cfg: AiConfig, file: CvFile): Promise<ParsedResume> {
  const native = AI_PROVIDER_BY_KEY[cfg.provider]?.native ?? "openai";
  const input = await prepareInput(file.buffer, file.mime, file.filename, native);

  const raw =
    native === "anthropic" ? await viaAnthropic(cfg, input) : await viaOpenAI(cfg, input);
  return parsedResumeSchema.parse(raw);
}

async function viaAnthropic(
  cfg: AiConfig,
  input: Awaited<ReturnType<typeof prepareInput>>
): Promise<unknown> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const content: Anthropic.ContentBlockParam[] =
    input.mode === "pdf-native"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.base64 }
          },
          { type: "text", text: PROMPT }
        ]
      : [{ type: "text", text: `${PROMPT}\n\n--- CV TEXT ---\n${input.text.slice(0, MAX_TEXT_CHARS)}` }];

  const message = await client.messages.create({
    model: cfg.model,
    max_tokens: 4096,
    tools: [{ name: TOOL_NAME, description: "Emit structured CV data.", input_schema: JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content }]
  });
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("parser returned no structured output");
  return toolUse.input;
}

async function viaOpenAI(
  cfg: AiConfig,
  input: Awaited<ReturnType<typeof prepareInput>>
): Promise<unknown> {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: resolveBaseUrl(cfg) ?? undefined });
  const text = input.mode === "text" ? input.text : "";
  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: `--- CV TEXT ---\n${text.slice(0, MAX_TEXT_CHARS)}` }
    ],
    tools: [
      {
        type: "function",
        function: { name: TOOL_NAME, description: "Emit structured CV data.", parameters: JSON_SCHEMA }
      }
    ],
    tool_choice: { type: "function", function: { name: TOOL_NAME } }
  });
  const call = res.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== "function") throw new Error("parser returned no structured output");
  return JSON.parse(call.function.arguments);
}
