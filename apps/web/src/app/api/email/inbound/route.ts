import { handleInboundReply, type InboundMessage } from "@/server/email-inbound";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Coerce a string-or-array-of-strings field to a string[]. */
function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

/** Pull a header value out of Resend's [{name,value}] headers array. */
function header(headers: unknown, name: string): string | null {
  if (!Array.isArray(headers)) return null;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h && typeof h === "object" && "name" in h && "value" in h) {
      const hn = String((h as { name: unknown }).name).toLowerCase();
      if (hn === lower) return String((h as { value: unknown }).value);
    }
  }
  return null;
}

/** Map a provider webhook body (Resend inbound) to our normalised message. */
function normalize(body: unknown): InboundMessage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const from = data.from;
  if (typeof from !== "string" && typeof from !== "object") return null;
  const fromAddr =
    typeof from === "string" ? from : String((from as { email?: unknown }).email ?? "");
  if (!fromAddr) return null;

  const replyToHeader = header(data.headers, "reply-to");
  return {
    from: fromAddr,
    to: toArray(data.to),
    cc: toArray(data.cc),
    replyTo: replyToHeader ? [replyToHeader] : toArray(data.reply_to ?? data.replyTo),
    subject: typeof data.subject === "string" ? data.subject : "(no subject)",
    text: typeof data.text === "string" ? data.text : null,
    html: typeof data.html === "string" ? data.html : null,
    messageId:
      header(data.headers, "message-id") ?? (data.message_id as string | undefined) ?? null,
    inReplyTo: header(data.headers, "in-reply-to")
  };
}

/**
 * Public inbound-email webhook (Resend Inbound / MX). Threads a reply back onto
 * the record that sent it via the Reply-To token. Rate-limited; an optional
 * shared secret (EMAIL_INBOUND_SECRET) gates it when configured. Always returns
 * 200 for a well-formed but unroutable message so the provider does not retry.
 */
export async function POST(req: Request) {
  if (!rateLimit(`inbound:${clientIp(req)}`, 120, 60_000)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  const secret = process.env.EMAIL_INBOUND_SECRET;
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let msg: InboundMessage | null;
  try {
    msg = normalize(await req.json());
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!msg) return Response.json({ error: "Unrecognised payload" }, { status: 400 });

  try {
    const result = await handleInboundReply(msg);
    return Response.json({ ok: true, threaded: Boolean(result) });
  } catch (err) {
    console.error("[email inbound] failed:", err);
    return Response.json({ error: "Failed to process" }, { status: 500 });
  }
}
