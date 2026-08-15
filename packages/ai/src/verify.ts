/**
 * A cheap round-trip to validate a workspace's provider + model + key, without
 * pulling in the CV extraction stack (kept out of resume.ts so the web app can
 * import verify + crypto + providers without bundling unpdf/mammoth).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AI_PROVIDER_BY_KEY, resolveBaseUrl, type AiConfig } from "./providers";

export async function verifyAiConfig(cfg: AiConfig): Promise<{ ok: true }> {
  const native = AI_PROVIDER_BY_KEY[cfg.provider]?.native ?? "openai";
  if (native === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    await client.messages.create({
      model: cfg.model,
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }]
    });
  } else {
    const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: resolveBaseUrl(cfg) ?? undefined });
    await client.chat.completions.create({
      model: cfg.model,
      max_tokens: 4,
      messages: [{ role: "user", content: "ping" }]
    });
  }
  return { ok: true };
}
