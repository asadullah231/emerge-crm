/**
 * Shared helpers for Zoho -> Emerge transforms: safe field access, address
 * blocks, ownerlookup extraction, HTML sanitizing (minimal allowlist), and
 * hash utility for payload-hash short-circuiting.
 */
import { createHash } from "node:crypto";

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true";
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function date(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function lowerEmail(v: unknown): string | null {
  const s = str(v);
  return s ? s.toLowerCase() : null;
}

/** Extract the id from a Zoho lookup value which is either { id, name } or a scalar. */
export function lookupId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o.id);
  }
  return str(v);
}

/** Same for a Zoho ownerlookup value: { id, name, email }. */
export function ownerId(v: unknown): string | null {
  return lookupId(v);
}

/** Normalized domain from a URL/website. Returns null if unusable. */
export function domainFromUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = s.match(/^https?:\/\//i) ? new URL(s) : new URL(`https://${s}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Very conservative HTML sanitizer for Zoho rich-text (job description). */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "blockquote",
  "code",
  "pre",
  "hr",
  "div",
  "span"
]);

export function sanitizeHtml(html: string | null | undefined): string | null {
  const s = str(html);
  if (!s) return null;
  // strip script/style entirely
  const stripped = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  // drop disallowed tags (keep their inner text), keep allowed tags but drop
  // all attributes except href on <a>
  return stripped.replace(/<\/?([a-zA-Z][\w-]*)(\s[^>]*)?>/g, (m, tagRaw, attrs) => {
    const tag = String(tagRaw).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const close = m.startsWith("</");
    if (close) return `</${tag}>`;
    if (tag === "a" && attrs) {
      const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(String(attrs));
      const url = href ? (href[1] ?? href[2]) : null;
      if (url && /^(https?:|mailto:)/i.test(url))
        return `<a href="${url.replace(/"/g, "&quot;")}" rel="noopener noreferrer" target="_blank">`;
      return `<a>`;
    }
    return `<${tag}>`;
  });
}

export function sha256(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Extract Zoho mention markup `crm[user#<userId>#<...>]crm` occurrences and
 * return the mentioned Zoho user ids in document order, plus a cleaner body
 * with the markup replaced by @{userId} placeholders (resolved to Emerge
 * user handles at import time).
 */
export function extractZohoMentions(body: string | null | undefined): {
  cleaned: string;
  zohoUserIds: string[];
} {
  const s = str(body) ?? "";
  const ids: string[] = [];
  const cleaned = s.replace(/crm\[user#(\d+)#[^\]]*\]crm/g, (_m, id: string) => {
    ids.push(id);
    return `@{${id}}`;
  });
  return { cleaned, zohoUserIds: ids };
}

/** Build a passthrough object that keeps unmapped Zoho fields alive. */
export function passthroughOf(
  record: Record<string, unknown>,
  mappedKeys: string[]
): Record<string, unknown> {
  const skip = new Set([...mappedKeys, "id", "$currency_symbol", "$approval", "$approved"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (skip.has(k)) continue;
    if (k.startsWith("$")) continue;
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}
