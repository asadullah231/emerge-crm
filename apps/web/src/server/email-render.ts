import { randomBytes } from "node:crypto";
import { escapeHtml, layout, paragraph } from "@emerge/email";

/**
 * Merge-field + record-email rendering (M13). Pure functions: the router builds
 * the merge data from the entity, this turns a template + data into a subject
 * line and a branded HTML body, and handles the Reply-To thread token so inbound
 * replies can be routed back to the originating record.
 */

/** Replace {{ key }} tokens with data[key]; unknown tokens render empty. */
export function applyMergeFields(source: string, data: Record<string, string>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => data[key] ?? "");
}

/** The merge-field keys referenced in a template (for the composer's helper UI). */
export function mergeFieldsUsed(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) out.add(m[1]!);
  return [...out];
}

/** Split authored plain text into paragraphs on blank lines; single newlines -> <br>. */
export function textToParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => paragraph(escapeHtml(block).replace(/\n/g, "<br />")))
    .join("");
}

/** Wrap an authored plain-text body in the branded email layout. */
export function renderRecordEmailHtml(opts: { bodyText: string; previewText?: string }): string {
  return layout({
    previewText: opts.previewText ?? opts.bodyText.slice(0, 140),
    contentHtml: textToParagraphs(opts.bodyText)
  });
}

// --- Reply-To threading -----------------------------------------------------

/** Domain that receives inbound replies (Resend Inbound / MX), env-overridable. */
export function inboundDomain(): string {
  return process.env.EMAIL_INBOUND_DOMAIN ?? "inbound.emergeautomation.tech";
}

/** A fresh opaque thread token stored on the outbound email row. */
export function makeThreadToken(): string {
  return randomBytes(18).toString("base64url");
}

/** The Reply-To address that carries the thread token, e.g. reply+<token>@domain. */
export function replyToAddress(token: string): string {
  return `reply+${token}@${inboundDomain()}`;
}

/**
 * Extract a thread token from any of the given addresses (To/Cc/Reply-To on an
 * inbound message). Matches the reply+<token>@<our-inbound-domain> shape.
 */
export function parseThreadToken(addresses: string[]): string | null {
  const domain = inboundDomain().toLowerCase();
  for (const raw of addresses) {
    if (!raw) continue;
    // Pull the bare address out of a possible "Name <addr>" form. Keep the
    // token's original case (base64url is case-sensitive); only the domain
    // comparison is case-insensitive.
    const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim();
    const m = addr.match(/^reply\+([\w-]+)@(.+)$/i);
    if (m && m[2]!.toLowerCase() === domain) return m[1]!;
  }
  return null;
}
