/**
 * The Claude resume parser: extracted CV -> structured ParsedResume.
 *
 * Uses a forced tool call (`emit_resume`) so the model must return JSON matching
 * our schema, then validates it with the shared zod schema. Claude's multilingual
 * strength is why this beats a fixed-template parser on the real DACH/EU CV mix.
 * Reads ANTHROPIC_API_KEY from the environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import { parsedResumeSchema, type ParsedResume } from "@emerge/core";
import type { ExtractResult } from "./extract.js";

const MODEL = process.env.PARSE_MODEL ?? "claude-sonnet-5";
const MAX_TEXT_CHARS = 60_000;

const PROMPT = [
  "You extract structured data from a candidate's CV/resume for a recruitment CRM.",
  "Return ONLY via the emit_resume tool. Rules:",
  "- Use null for anything the CV does not state. Never invent or infer beyond what is written.",
  "- firstName/lastName: split the candidate's name; lastName is required if a name is present.",
  "- email/secondaryEmail, phone/mobile: pick the primary first.",
  "- title: current or most recent job title. currentEmployer: current or most recent company.",
  "- skills: a single comma-separated string of the candidate's skills/technologies.",
  "- experienceYears: total years of professional experience if stated or clearly computable, else null.",
  "- education[]: each entry institution/degree/fieldOfStudy/startYear/endYear (years as integers or null).",
  "- experience[]: each role company/title/startDate/endDate (free text like \"Mar 2019\" or \"2019-03\"),",
  "  isCurrent true for the present role, summary a short description.",
  "- Preserve the CV's language for free-text values; do not translate."
].join("\n");

const RESUME_TOOL: Anthropic.Tool = {
  name: "emit_resume",
  description: "Emit the structured data extracted from the CV.",
  input_schema: {
    type: "object",
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
  }
};

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  cached ??= new Anthropic();
  return cached;
}

export async function parseResume(input: ExtractResult): Promise<ParsedResume> {
  const content: Anthropic.ContentBlockParam[] =
    input.mode === "pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: input.base64 }
          },
          { type: "text", text: PROMPT }
        ]
      : [{ type: "text", text: `${PROMPT}\n\n--- CV TEXT ---\n${input.text.slice(0, MAX_TEXT_CHARS)}` }];

  const message = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [RESUME_TOOL],
    tool_choice: { type: "tool", name: "emit_resume" },
    messages: [{ role: "user", content }]
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("parser returned no structured output");
  }
  return parsedResumeSchema.parse(toolUse.input);
}
