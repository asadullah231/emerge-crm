// Per-teammate numbers: what each mailbox sent, day by day. Same outbox rows, grouped by sender.
import { capsFrom, capFor } from "./data";

const SENT = ["sent", "replied", "bounced", "auto_reply"];
const ukDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

export function buildTeam({ outbox, senders, state, jobs = [], companies = [], meta = [] }) {
  const caps = capsFrom(state);
  const pausedRaw = String(state.paused || "")
    .toLowerCase()
    .trim();
  const pausedSet = new Set(
    pausedRaw
      .split(",")
      .map((s) => s.trim())
      .filter((x) => x && x !== "no")
  );
  const isPaused = (k) => pausedRaw === "yes" || pausedSet.has(k);
  const todayKey = ukDay(new Date());
  const active = senders.filter((s) => String(s.active).toLowerCase() === "yes");
  const known = new Set(active.map((s) => s.mailbox));
  // a mailbox that sent something but is not (or no longer) in bd_senders still gets a row
  const extra = [...new Set(outbox.map((r) => r.sender).filter((k) => k && !known.has(k)))].map(
    (k) => ({
      mailbox: k,
      name: outbox.find((r) => r.sender === k)?.sender_name || k,
      active: "no"
    })
  );
  return [...active, ...extra]
    .map((s) => {
      const mine = outbox.filter((r) => r.sender === s.mailbox);
      const sent = mine.filter((r) => SENT.includes(r.status));
      const today = sent.filter((r) => r.sent_at && ukDay(r.sent_at) === todayKey);
      const failedToday = mine.filter(
        (r) => r.status === "failed" && r.sent_at && ukDay(r.sent_at) === todayKey
      );
      return {
        mailbox: s.mailbox,
        name: s.name || s.mailbox,
        email: s.am_email || "",
        active: String(s.active).toLowerCase() === "yes",
        paused: isPaused(s.mailbox),
        cap: capFor(caps, s.mailbox),
        sentToday: today.length,
        sentTotal: sent.length,
        replies: mine.filter((r) => r.status === "replied").length,
        autoReplies: mine.filter((r) => r.status === "auto_reply").length,
        bounced: mine.filter((r) => r.status === "bounced").length,
        waiting: mine.filter((r) => ["queued", "sending"].includes(r.status)).length,
        failed: mine.filter((r) => r.status === "failed").length,
        failedToday: failedToday.length,
        lastError:
          (
            mine
              .filter((r) => r.status === "failed")
              .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0] || {}
          ).error || "",
        campaigns: [
          ...new Set(
            [
              ...meta
                .filter((m) => m.sender === s.mailbox && /^bd-/.test(String(m.batch_id || "")))
                .map((m) => m.name),
              ...jobs.filter((r) => r.sender === s.mailbox).map((r) => r.campaign),
              ...companies.filter((r) => r.sender === s.mailbox).map((r) => r.campaign),
              ...mine.map((r) => r.campaign)
            ].filter(Boolean)
          )
        ]
      };
    })
    .sort((a, b) => b.sentTotal - a.sentTotal || a.name.localeCompare(b.name));
}

/** Day-by-day rows for one mailbox, newest first. days = how many calendar days back (UK). */
export function dailyFor(outbox, mailbox, days = 14) {
  const mine = outbox.filter((r) => r.sender === mailbox && r.sent_at);
  const byDay = {};
  for (const r of mine) {
    const k = ukDay(r.sent_at);
    const d =
      byDay[k] ||
      (byDay[k] = {
        day: k,
        sent: 0,
        replies: 0,
        bounced: 0,
        autoReplies: 0,
        failed: 0,
        campaigns: new Set()
      });
    if (SENT.includes(r.status)) {
      d.sent++;
      if (r.campaign) d.campaigns.add(r.campaign);
    }
    if (r.status === "replied") d.replies++;
    if (r.status === "bounced") d.bounced++;
    if (r.status === "auto_reply") d.autoReplies++;
    if (r.status === "failed") d.failed++;
  }
  const out = [];
  for (let i = 0; i < days; i++) {
    const k = ukDay(Date.now() - i * 86400000);
    const d = byDay[k] || {
      day: k,
      sent: 0,
      replies: 0,
      bounced: 0,
      autoReplies: 0,
      failed: 0,
      campaigns: new Set()
    };
    out.push({ ...d, campaigns: [...d.campaigns] });
  }
  return out;
}

export const fmtDay = (k) =>
  new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London"
  });
