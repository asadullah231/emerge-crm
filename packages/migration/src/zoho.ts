/**
 * Minimal LIVE Zoho Recruit API client for the attachment backfill.
 *
 * Unlike the rest of the migration engine (which reads offline JSONL snapshots
 * of record metadata), attachments need the actual file BYTES, which are only
 * available from the live API. This client does exactly two things beyond auth:
 * list a record's attachments and download one attachment's bytes.
 *
 * Auth is OAuth refresh-token → access-token (Self Client / Server-based app).
 * Region matters: EU orgs use accounts.zoho.eu + recruit.zoho.eu.
 */
import { setTimeout as sleep } from "node:timers/promises";

export interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** e.g. https://accounts.zoho.eu */
  accountsDomain: string;
  /** e.g. https://recruit.zoho.eu */
  apiDomain: string;
}

/** Attachment metadata as returned by the v2 Attachments related-list API. */
export interface ZohoAttachment {
  id: string;
  fileName: string;
  size: number;
  /** Zoho's `$type` (e.g. "Attachment") when present. */
  type: string | null;
  createdTime: string | null;
}

/** Read Zoho config from env; throws with a clear message if anything is missing. */
export function zohoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ZohoConfig {
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;
  const missing = [
    ["ZOHO_CLIENT_ID", clientId],
    ["ZOHO_CLIENT_SECRET", clientSecret],
    ["ZOHO_REFRESH_TOKEN", refreshToken]
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`missing Zoho OAuth env: ${missing.join(", ")}`);
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    accountsDomain: (env.ZOHO_ACCOUNTS_DOMAIN ?? "https://accounts.zoho.eu").replace(/\/$/, ""),
    apiDomain: (env.ZOHO_API_DOMAIN ?? "https://recruit.zoho.eu").replace(/\/$/, "")
  };
}

/** Minimal fetch signature so tests can inject a fake. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}>;

export interface ZohoClientOptions {
  fetchImpl?: FetchLike;
  /** Max retries on 429/5xx before giving up. */
  maxRetries?: number;
  /** Base backoff (ms); doubles each attempt, honours Retry-After when given. */
  backoffMs?: number;
  /**
   * Minimum gap (ms) between any two outgoing API requests. Zoho throttles
   * bursts with a transient HTTP 400; spacing requests keeps us under the
   * per-minute rate limit. 0 disables the gate.
   */
  minIntervalMs?: number;
}

export class ZohoClient {
  private readonly cfg: ZohoConfig;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly minIntervalMs: number;
  private token: { value: string; expiresAt: number } | null = null;
  /** Single-flight lock so concurrent callers share one token refresh. */
  private refreshing: Promise<string> | null = null;
  /** Next allowed request time (performance.now clock) for the rate gate. */
  private nextSlotAt = 0;

  constructor(cfg: ZohoConfig, opts: ZohoClientOptions = {}) {
    this.cfg = cfg;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.maxRetries = opts.maxRetries ?? 6;
    this.backoffMs = opts.backoffMs ?? 1000;
    this.minIntervalMs = opts.minIntervalMs ?? 0;
  }

  /** Space outgoing requests by at least minIntervalMs, across all callers. */
  private async rateGate(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const now = performance.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + this.minIntervalMs;
    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }

  /** Cached access token; refreshes ~60s before expiry. Refresh is single-flight. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > monotonicNow()) return this.token.value;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const url =
      `${this.cfg.accountsDomain}/oauth/v2/token` +
      `?refresh_token=${encodeURIComponent(this.cfg.refreshToken)}` +
      `&client_id=${encodeURIComponent(this.cfg.clientId)}` +
      `&client_secret=${encodeURIComponent(this.cfg.clientSecret)}` +
      `&grant_type=refresh_token`;
    const res = await this.fetchImpl(url, { method: "POST" });
    if (!res.ok) throw new Error(`Zoho token refresh failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!body.access_token) throw new Error(`Zoho token refresh: no access_token (${body.error})`);
    this.token = {
      value: body.access_token,
      expiresAt: monotonicNow() + (body.expires_in ?? 3600) * 1000
    };
    return this.token.value;
  }

  private async authedFetch(
    path: string,
    accept: "json" | "binary",
    opts: { retryClientError?: boolean } = {}
  ) {
    let attempt = 0;
    for (;;) {
      const token = await this.accessToken();
      await this.rateGate();
      const res = await this.fetchImpl(`${this.cfg.apiDomain}${path}`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: accept === "json" ? "application/json" : "*/*"
        }
      });
      if (res.status === 401) {
        // Token might have been revoked mid-run; force a refresh once.
        this.token = null;
        if (attempt++ < 1) continue;
      }
      // Zoho throttles bursty attachment downloads with a transient 400 (the same
      // request succeeds on retry), so downloads opt into retrying 400 too.
      const retryable =
        res.status === 429 ||
        res.status >= 500 ||
        (opts.retryClientError === true && res.status === 400);
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : this.backoffMs * 2 ** attempt;
        attempt++;
        await sleep(wait);
        continue;
      }
      return res;
    }
  }

  /** List a record's attachments. Returns [] for a 204 (no attachments). */
  async listAttachments(module: string, recordId: string): Promise<ZohoAttachment[]> {
    const res = await this.authedFetch(`/recruit/v2/${module}/${recordId}/Attachments`, "json");
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(`list attachments ${module}/${recordId}: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return (body.data ?? []).map(normalizeAttachment);
  }

  /** Download one attachment's bytes + best-effort content type. */
  async downloadAttachment(
    module: string,
    recordId: string,
    attachmentId: string
  ): Promise<{ bytes: Buffer; contentType: string | null }> {
    const res = await this.authedFetch(
      `/recruit/v2/${module}/${recordId}/Attachments/${attachmentId}`,
      "binary",
      { retryClientError: true }
    );
    if (!res.ok)
      throw new Error(`download ${module}/${recordId}/${attachmentId}: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType: res.headers.get("Content-Type") };
  }

  /**
   * One page of a module's records (raw Zoho JSON, same shape the original
   * MCP snapshot captured). 204 = past the last page. Used by fetch-snapshot.
   */
  async listRecords(
    module: string,
    page: number,
    perPage = 200
  ): Promise<{ records: Record<string, unknown>[]; more: boolean }> {
    const res = await this.authedFetch(
      `/recruit/v2/${module}?page=${page}&per_page=${perPage}`,
      "json"
    );
    if (res.status === 204) return { records: [], more: false };
    if (!res.ok) throw new Error(`list ${module} page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
      info?: { more_records?: boolean };
    };
    return { records: body.data ?? [], more: body.info?.more_records === true };
  }

  /** All org users (raw Zoho JSON), for the user-map snapshot file. */
  async listUsers(): Promise<Record<string, unknown>[]> {
    const res = await this.authedFetch(`/recruit/v2/users?type=AllUsers`, "json");
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(`list users: HTTP ${res.status}`);
    const body = (await res.json()) as { users?: Record<string, unknown>[] };
    return body.users ?? [];
  }
}

/** Zoho returns Size as a string sometimes; `$type` is the attachment kind. */
export function normalizeAttachment(raw: Record<string, unknown>): ZohoAttachment {
  const sizeRaw = raw.Size ?? raw.size;
  const size = typeof sizeRaw === "number" ? sizeRaw : Number.parseInt(String(sizeRaw ?? "0"), 10);
  return {
    id: String(raw.id),
    fileName: String(raw.File_Name ?? raw.file_name ?? "attachment"),
    size: Number.isFinite(size) ? size : 0,
    type: raw.$type != null ? String(raw.$type) : null,
    createdTime: raw.Created_Time != null ? String(raw.Created_Time) : null
  };
}

/**
 * A monotonic-ish clock. `Date.now()` is unavailable in some sandboxes but this
 * client runs under normal Node at import time, so we use a lazy require guard.
 */
function monotonicNow(): number {
  // performance.now is monotonic and always available in Node 22.
  return performance.now();
}
