// Turns the BD tables into campaign cards the team can read without knowing NocoDB or n8n.
import { fetchAll, T } from "./noco";

const lower = (s) => String(s || "").toLowerCase();

export async function loadAll() {
  const [jobs, companies, outbox, stateRows, senders, meta] = await Promise.all([
    fetchAll(T.jobs, {
      fields: "Id,batch_id,campaign,status,company,am_email,sender,CreatedAt,title,location"
    }),
    fetchAll(T.companies, {
      fields: "Id,batch_id,campaign,status,company,am_email,sender,skip_reason,CreatedAt"
    }),
    fetchAll(T.outbox, {
      fields:
        "Id,batch_id,campaign,status,mode,company,contact_name,contact_title,role,to_email,sender,sender_name,sender_title,am_email,sent_at,block_reason,not_before,subject,followup_stage,followup_at,CreatedAt,UpdatedAt"
    }), // no body here: the email text is loaded only on the pages that show it (withBodies)
    fetchAll(T.sendState),
    fetchAll(T.senders),
    fetchAll(T.campaigns, {
      fields:
        "Id,batch_id,name,archived,note,updated_by,requester,sender,started_at,status,bd_channel,contract_name,contract_size,CreatedAt"
    }) // contract_b64 stays out of the lists
  ]);
  // bd_campaigns: the team's own name / archived flag per batch (set from the dashboard)
  const overrides = Object.fromEntries(meta.filter((m) => m.batch_id).map((m) => [m.batch_id, m]));
  return {
    jobs,
    companies,
    outbox: outbox.filter((r) => r.mode !== "test"),
    state: stateRows[0] || {},
    senders: senders.filter((s) => s.mailbox),
    overrides,
    meta
  };
}

export function capsFrom(state) {
  const caps = {};
  for (const part of String(state.daily_caps || "").split(",")) {
    const [k, v] = part.split(":").map((x) => (x || "").trim().toLowerCase());
    if (k && Number(v) > 0) caps[k] = Number(v);
  }
  return caps;
}
export const capFor = (caps, mailbox) => caps[mailbox] || caps.all || 40;

export { buildCampaigns } from "./campaigns";

export function queueAdvice(campaigns, state) {
  const caps = capsFrom(state);
  const live = campaigns.filter((c) => !c.archived);
  const queued = live.reduce((a, c) => a + c.queued, 0);
  const activeSenders = [...new Set(live.filter((c) => c.queued).flatMap((c) => c.senderKeys))];
  const perDay = activeSenders.reduce((a, k) => a + capFor(caps, k), 0) || capFor(caps, "mo");
  const days = queued / perDay;
  // say it the way the team thinks: "400 a day per mailbox, 2 mailboxes sending" (the total alone read like a new limit; Asad, 26 Oct 2026)
  const n = activeSenders.length || 1;
  const rate =
    n > 1
      ? perDay +
        " a day in total (" +
        n +
        " mailboxes sending, up to " +
        capFor(caps, activeSenders[0]) +
        " a day each)"
      : perDay + " a day (one mailbox sending)";
  const paused = lower(state.paused).trim() === "yes";
  if (paused)
    return {
      tone: "warn",
      title: "Sending is paused",
      body: "No emails go out until sending is resumed. " + queued + " emails are waiting."
    };
  if (!queued)
    return {
      tone: "bad",
      title: "The queue is empty",
      body: "Nothing is being sent. Start a new campaign to keep emails going."
    };
  if (days < 1)
    return {
      tone: "warn",
      title: "Queue runs out today",
      body:
        queued +
        " emails left at about " +
        rate +
        ". Start the next campaign now so tomorrow is not empty."
    };
  return {
    tone: "ok",
    title: "Queue is healthy",
    body:
      queued +
      " emails waiting, about " +
      Math.ceil(days) +
      " working days of sending at " +
      rate +
      ". No new campaign needed yet."
  };
}

export const autoReplies = (outbox) => outbox.filter((r) => r.status === "auto_reply");

export function replies(outbox) {
  return outbox
    .filter((r) => r.status === "replied")
    .sort((a, b) =>
      String(b.UpdatedAt || b.sent_at).localeCompare(String(a.UpdatedAt || a.sent_at))
    );
}

export function today(outbox) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  // only emails that really went out; a failed attempt also carries sent_at but is not a sent email
  return outbox.filter(
    (r) =>
      r.sent_at &&
      ["sent", "replied", "bounced", "auto_reply"].includes(r.status) &&
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
        new Date(r.sent_at)
      ) === d
  );
}

/** Replies that came in today (UK): the row flipped to replied today, whichever day the email was sent. */
export function repliesToday(outbox) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });
  const d = f.format(new Date());
  return outbox.filter(
    (r) => r.status === "replied" && f.format(new Date(r.UpdatedAt || r.sent_at)) === d
  );
}

/** Attach the email text to the rows of one page (the list load leaves `body` out to keep every page light). */
export async function withBodies(rows) {
  if (!rows.length) return rows;
  const bodies = new Map();
  const ids = rows.map((r) => r.Id);
  for (let i = 0; i < ids.length; i += 100)
    for (const r of await fetchAll(T.outbox, {
      fields: "Id,body",
      where: `(Id,in,${ids.slice(i, i + 100).join(",")})`
    }))
      bodies.set(r.Id, r.body);
  return rows.map((r) => ({ ...r, body: bodies.get(r.Id) || "" }));
}

/** 5 Nov 2026: the reply messages (bd_replies, written by Part 04 when it reads the thread) for the rows of one page. Robot messages (tracking reminders, auto replies) are left out. */
export async function withReplies(rows) {
  if (!rows.length) return rows;
  const byRow = new Map();
  const ids = rows.map((r) => r.Id);
  for (let i = 0; i < ids.length; i += 100)
    for (const m of await fetchAll(T.replies, {
      fields: "Id,outbox_id,received_at,from_email,from_name,subject,text,kind,tag,stage",
      where: `(outbox_id,in,${ids.slice(i, i + 100).join(",")})`
    })) {
      const k = String(m.outbox_id);
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(m);
    }
  return rows.map((r) => ({
    ...r,
    messages: (byRow.get(String(r.Id)) || [])
      .filter((m) => m.kind !== "auto")
      .sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)))
  }));
}
