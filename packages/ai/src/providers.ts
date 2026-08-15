/**
 * The LLM providers a workspace can pick. anthropic + google talk to their own
 * endpoints; everything else (and any custom endpoint) is OpenAI-compatible, so
 * a single OpenAI client with a base_url covers OpenAI, OpenRouter, DeepSeek,
 * Groq, Mistral, xAI, and self-hosted gateways. This mirrors the breadth of
 * n8n's LLM nodes without a bespoke client per vendor.
 */
export type AiProviderKey =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "deepseek"
  | "google"
  | "groq"
  | "mistral"
  | "xai"
  | "openai_compatible";

export interface AiProviderPreset {
  key: AiProviderKey;
  label: string;
  /** Which SDK/protocol to use. */
  native: "anthropic" | "openai";
  /** Base URL for the OpenAI-compatible endpoint (null = SDK default / native). */
  defaultBaseUrl: string | null;
  defaultModel: string;
  /** Whether the operator must supply a custom base_url (openai_compatible). */
  baseUrlRequired: boolean;
  consoleUrl: string;
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    native: "anthropic",
    defaultBaseUrl: null,
    defaultModel: "claude-sonnet-5",
    baseUrlRequired: false,
    consoleUrl: "https://console.anthropic.com/settings/keys"
  },
  {
    key: "openai",
    label: "OpenAI",
    native: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    baseUrlRequired: false,
    consoleUrl: "https://platform.openai.com/api-keys"
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    native: "openai",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    baseUrlRequired: false,
    consoleUrl: "https://openrouter.ai/keys"
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    native: "openai",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    baseUrlRequired: false,
    consoleUrl: "https://platform.deepseek.com/api_keys"
  },
  {
    key: "google",
    label: "Google Gemini",
    native: "openai",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    baseUrlRequired: false,
    consoleUrl: "https://aistudio.google.com/apikey"
  },
  {
    key: "groq",
    label: "Groq",
    native: "openai",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrlRequired: false,
    consoleUrl: "https://console.groq.com/keys"
  },
  {
    key: "mistral",
    label: "Mistral",
    native: "openai",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    baseUrlRequired: false,
    consoleUrl: "https://console.mistral.ai/api-keys"
  },
  {
    key: "xai",
    label: "xAI (Grok)",
    native: "openai",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    baseUrlRequired: false,
    consoleUrl: "https://console.x.ai"
  },
  {
    key: "openai_compatible",
    label: "OpenAI-compatible (custom)",
    native: "openai",
    defaultBaseUrl: null,
    defaultModel: "",
    baseUrlRequired: true,
    consoleUrl: ""
  }
];

export const AI_PROVIDER_BY_KEY = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.key, p])
) as Record<AiProviderKey, AiProviderPreset>;

/** A resolved, ready-to-call provider configuration. */
export interface AiConfig {
  provider: AiProviderKey;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
}

/** The base URL to actually use (explicit override, else the provider preset). */
export function resolveBaseUrl(cfg: AiConfig): string | null {
  if (cfg.baseUrl && cfg.baseUrl.trim()) return cfg.baseUrl.trim();
  return AI_PROVIDER_BY_KEY[cfg.provider]?.defaultBaseUrl ?? null;
}
