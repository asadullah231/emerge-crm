// Campaign grouping. A campaign = everything that carries the same campaign name (jobs, companies, outbox rows), across research runs.
// Rows without a campaign name fall back to their batch id. Jobs still waiting for research show under their own campaign too.
import { capsFrom, capFor } from "./data";
import { skipBucket, companySkipReason } from "./text";

const lower = (s) =>
  String(s || "")
    .toLowerCase()
    .trim();
const isSentLike = (s) => ["sent", "replied", "bounced", "auto_reply"].includes(s);
export const keyOf = (r) =>
  r.campaign ? "c:" + String(r.campaign).trim() : "b:" + String(r.batch_id || "").trim();
export const whereForKey = (key) =>
  key.startsWith("c:") ? `(campaign,eq,${key.slice(2)})` : `(batch_id,eq,${key.slice(2)})`;
export const rowsForKey = (rows, key) => rows.filter((r) => keyOf(r) === key);

export function buildCampaigns({
  jobs,
  companies,
  outbox,
  state,
  senders,
  overrides = {},
  meta = []
}) {
  const senderName = Object.fromEntries(senders.map((s) => [s.mailbox, s.name || s.mailbox]));
  const caps = capsFrom(state);
  const pausedAll = lower(state.paused) === "yes";

  const groups = new Map();
  const get = (key) => {
    if (!groups.has(key))
      groups.set(key, {
        key,
        campaign: key.startsWith("c:") ? key.slice(2) : "",
        batches: new Set(),
        jobs: [],
        companies: [],
        outbox: []
      });
    return groups.get(key);
  };
  for (const co of companies)
    if (co.batch_id) {
      const g = get(keyOf(co));
      g.companies.push(co);
      g.batches.add(co.batch_id);
    }
  for (const o of outbox)
    if (o.batch_id) {
      const g = get(keyOf(o));
      g.outbox.push(o);
      g.batches.add(o.batch_id);
    }
  for (const j of jobs)
    if (j.batch_id) {
      const g = get(keyOf(j));
      g.jobs.push(j);
      g.batches.add(j.batch_id);
    }

  const out = [];
  for (const g of groups.values()) {
    const ob = g.outbox;
    if (!ob.length && !g.companies.length && !g.jobs.length) continue;
    const n = (s) => ob.filter((r) => r.status === s).length;
    const sent = ob.filter((r) => isSentLike(r.status)).length;
    const queued = n("queued") + n("sending");
    const blocked = n("blocked");
    const replied = n("replied");
    const autoReplies = n("auto_reply"); // out of office, bots: not real replies
    const failed = n("failed"); // Gmail refused (mailbox problem): still to be sent once the mailbox works again
    const bounced = n("bounced");
    const followups = ob.reduce((a, r) => a + (Number(r.followup_stage) || 0), 0); // follow-up emails sent so far (Part 04, same thread as the first email)
    const stamps = [...g.jobs, ...g.companies, ...ob];
    const started =
      stamps
        .map((r) => r.CreatedAt)
        .filter(Boolean)
        .sort()[0] || null;
    const lastActivity =
      stamps
        .flatMap((r) => [r.CreatedAt, r.UpdatedAt, r.sent_at])
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || started;
    const lastSent =
      ob
        .map((r) => r.sent_at)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;
    const jobCompanies = new Set(g.jobs.map((j) => lower(j.company))).size;
    const researched = g.companies.length;
    const withContacts = g.companies.filter((co) => co.status === "researched").length;
    const unresearched = g.jobs.filter(
      (j) => !j.status || j.status === "new" || j.status === "researching"
    ).length;
    const count = (rows, f) =>
      Object.entries(
        rows.reduce((a, r) => {
          const k = f(r);
          a[k] = (a[k] || 0) + 1;
          return a;
        }, {})
      ).sort((a, b) => b[1] - a[1]);
    const skipReasons = count(
      ob.filter((r) => r.status === "blocked"),
      (r) => skipBucket(r.block_reason)
    ); // why people were not emailed
    const noContactCompanies = g.companies.filter(
      (co) => co.status === "skip" || co.status === "low"
    );
    const companySkipReasons = count(noContactCompanies, (co) => companySkipReason(co.skip_reason));
    const senderKeys = [...new Set(ob.map((r) => r.sender).filter(Boolean))];
    const fallbackSender = g.companies[0]?.sender || g.jobs[0]?.sender || "mo";
    const senderLabel = (senderKeys.length ? senderKeys : [fallbackSender])
      .map((k) => senderName[k] || k)
      .join(", ");
    const requester = g.jobs[0]?.am_email || g.companies[0]?.am_email || "";
    const stale =
      !ob.length &&
      !unresearched &&
      lastActivity &&
      Date.now() - new Date(lastActivity).getTime() > 24 * 3600 * 1000;
    let stage;
    if (unresearched > 0 && !queued)
      stage = "researching"; // job ads waiting for or in research
    else if (stale) stage = "complete";
    else if (ob.length) stage = queued > 0 ? "sending" : unresearched ? "researching" : "complete";
    else if (g.companies.length) stage = withContacts ? "researching" : "nothing";
    else stage = "scraping";
    if (stage === "sending" && pausedAll) stage = "paused";
    const dailyCap = (senderKeys.length ? senderKeys : [fallbackSender]).reduce(
      (a, k) => a + capFor(caps, k),
      0
    );
    const daysLeft = queued ? Math.ceil(queued / dailyCap) : 0;
    const toSend = sent + queued + failed; // emails that were or will be sent; skipped ones do not count
    const progress = toSend ? Math.round((sent / toSend) * 100) : 0; // 100% = every email of this campaign is out
    const o = overrides[g.key] || {};
    out.push({
      key: g.key,
      batch: g.key,
      batches: [...g.batches],
      name: o.name || g.campaign || "Batch " + g.key.slice(2),
      campaign: g.campaign,
      archived: String(o.archived || "").toLowerCase() === "yes",
      note: o.note || "",
      started,
      lastSent,
      requester,
      senderLabel,
      senderKeys,
      jobs: g.jobs.length,
      jobCompanies,
      researched,
      withContacts,
      unresearched,
      contacts: ob.length,
      sent,
      replied,
      autoReplies,
      bounced,
      followups,
      queued,
      failed,
      toSend,
      blocked,
      skipReasons,
      noContactCompanies: noContactCompanies.length,
      companySkipReasons,
      progress,
      stage,
      daysLeft,
      dailyCap,
      pending: unresearched > 0 && !researched,
      stale: !!stale
    });
  }
  // 26 Oct 2026: a campaign registered by the form (bd_campaigns row with a real batch id) shows up at once as "Collecting job ads", before any row exists
  const seenBatches = new Set(out.flatMap((c) => c.batches)),
    seenNames = new Set(out.map((c) => c.campaign).filter(Boolean));
  for (const m of meta) {
    if (
      !m.name ||
      !/^bd-/.test(String(m.batch_id || "")) ||
      seenBatches.has(m.batch_id) ||
      seenNames.has(m.name)
    )
      continue;
    const started = m.started_at || m.CreatedAt || null;
    const dead = started && Date.now() - new Date(started).getTime() > 6 * 3600 * 1000; // nothing arrived in 6 hours: the scrape found nothing or failed
    const o = overrides["c:" + m.name] || {};
    out.push({
      key: "c:" + m.name,
      batch: "c:" + m.name,
      batches: [m.batch_id],
      name: m.name,
      campaign: m.name,
      archived: String(o.archived || m.archived || "").toLowerCase() === "yes",
      note: o.note || "",
      started,
      lastSent: null,
      requester: m.requester || "",
      senderLabel: senderName[m.sender] || m.sender || "",
      senderKeys: m.sender ? [m.sender] : [],
      jobs: 0,
      jobCompanies: 0,
      researched: 0,
      withContacts: 0,
      unresearched: 0,
      contacts: 0,
      sent: 0,
      replied: 0,
      autoReplies: 0,
      bounced: 0,
      followups: 0,
      queued: 0,
      failed: 0,
      toSend: 0,
      blocked: 0,
      skipReasons: [],
      noContactCompanies: 0,
      companySkipReasons: [],
      progress: 0,
      stage: dead ? "nothing" : "scraping",
      daysLeft: 0,
      dailyCap: capFor(caps, m.sender || "mo"),
      pending: false,
      stale: !!dead,
      justStarted: !dead
    });
  }
  out.sort((a, b) => String(b.started).localeCompare(String(a.started)));
  return out;
}
