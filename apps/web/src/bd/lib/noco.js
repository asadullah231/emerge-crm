// NocoDB read/write layer. The token never reaches the browser: every call runs on the server.
const BASE = (process.env.NOCODB_BASE_URL || "").replace(/\/$/, "");
const H = { "xc-token": process.env.NOCODB_TOKEN || "", "content-type": "application/json" };

export const T = {
  jobs: process.env.NOCODB_T_JOBS,
  companies: process.env.NOCODB_T_COMPANIES,
  outbox: process.env.NOCODB_T_OUTBOX,
  sendState: process.env.NOCODB_T_SEND_STATE,
  senders: process.env.NOCODB_T_SENDERS,
  campaigns: process.env.NOCODB_T_CAMPAIGNS,
  replies: process.env.NOCODB_T_REPLIES || "mrcoaxsmhnhnnxq" // bd_replies (5 Nov 2026): what each person wrote back
};

/** NocoDB pages at 1000 rows; pull everything the page needs. */
/** Reads are cached 60 s on the server (tag 'noco'); the actions call revalidateTag('noco') so a click shows up at once. `fresh: true` bypasses the cache. */
export async function fetchAll(tableId, { fields, where, fresh } = {}) {
  if (!tableId) return [];
  const out = [];
  for (let page = 0; page < 30; page++) {
    const q = new URLSearchParams({ limit: "1000", offset: String(page * 1000) });
    if (fields) q.set("fields", fields);
    if (where) q.set("where", where);
    const res = await fetch(
      `${BASE}/api/v2/tables/${tableId}/records?${q}`,
      fresh
        ? { headers: H, cache: "no-store" }
        : { headers: H, next: { revalidate: 60, tags: ["noco"] } }
    );
    if (!res.ok) throw new Error(`NocoDB ${tableId} ${res.status}`);
    const j = await res.json();
    const list = j.list || [];
    out.push(...list);
    if (list.length < 1000 || j.pageInfo?.isLastPage) break;
  }
  return out;
}

/** Bulk insert (POST) or update (PATCH, rows need Id). NocoDB accepts 100 rows per request. */
export async function writeRows(tableId, method, rows) {
  for (let i = 0; i < rows.length; i += 100) {
    const res = await fetch(`${BASE}/api/v2/tables/${tableId}/records`, {
      method,
      headers: H,
      body: JSON.stringify(rows.slice(i, i + 100))
    });
    if (!res.ok)
      throw new Error(
        `NocoDB ${method} ${tableId} ${res.status}: ${(await res.text()).slice(0, 200)}`
      );
  }
  return rows.length;
}
