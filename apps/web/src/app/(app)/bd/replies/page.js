import Link from "next/link";
import { loadAll, replies, autoReplies, repliesToday, withReplies } from "@/bd/lib/data";
import { fmtDateTime } from "@/bd/lib/text";
import { keyOf } from "@/bd/lib/campaigns";

export const dynamic = "force-dynamic";

// 5 Nov 2026 (Asad): every reply can be opened on the page itself. The text comes from bd_replies (Part 04 writes it when it reads the thread);
// older rows without a bd_replies entry fall back to the short reply_text on the outbox row. Gmail gives the workflow only the first ~200 characters.
const TAG = {
  positive: "bg-emerald-500/10 text-emerald-800",
  negative: "bg-red-500/10 text-red-800",
  neutral: "bg-black/5 text-ink"
};
const TAG_TEXT = { positive: "Sounds interested", negative: "Not interested", neutral: "Read it" };
const decode = (s) =>
  String(s || "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

function TagPill({ tag }) {
  if (!tag) return null;
  return (
    <span
      className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + (TAG[tag] || TAG.neutral)}
    >
      {TAG_TEXT[tag] || tag}
    </span>
  );
}

function ReplyText({ r }) {
  const msgs = r.messages || [];
  if (!msgs.length) {
    const fallback = decode(
      String(r.reply_text || "")
        .split(" | ")
        .slice(1)
        .join(" | ")
    ).trim();
    return (
      <div className="text-sm text-ink">
        {fallback ||
          "The text was not saved for this reply. Open the thread in the sender's Gmail."}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {msgs.map((m) => (
        <div key={m.Id} className="rounded-xl border border-line bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <span className="text-ink">{m.from_name || m.from_email}</span>
            {m.from_name ? <span>{m.from_email}</span> : null}
            <span>· {fmtDateTime(m.received_at)}</span>
            {Number(m.stage) > 0 ? (
              <span>· after follow-up {m.stage}</span>
            ) : (
              <span>· after the first email</span>
            )}
            <TagPill tag={m.tag} />
          </div>
          <div className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{decode(m.text)}</div>
        </div>
      ))}
      <div className="text-xs text-mute">
        Only the start of each message is saved (about 200 characters). Open the thread in the
        sender's Gmail for the full text and to answer.
      </div>
    </div>
  );
}

export default async function Replies({ searchParams }) {
  const sp = await searchParams;
  const onlyToday = sp?.when === "today";
  const all = await loadAll();
  const base = onlyToday
    ? repliesToday(all.outbox).sort((a, b) =>
        String(b.UpdatedAt).localeCompare(String(a.UpdatedAt))
      )
    : replies(all.outbox);
  const rows = await withReplies(base);
  const auto = autoReplies(all.outbox).length;
  const nameOf = {};
  // the mailbox the email really went from = the sender's row in bd_senders (the row's am_email is whoever filled the form, not always the sender)
  const mailboxOf = Object.fromEntries((all.senders || []).map((s) => [s.mailbox, s.am_email]));
  const lastTag = (r) => {
    const h = (r.messages || []).filter((m) => m.tag && m.tag !== "auto");
    return h.length ? h[h.length - 1].tag : "";
  };
  const whenOf = (r) => {
    const h = r.messages || [];
    return h.length ? h[h.length - 1].received_at : r.UpdatedAt || r.sent_at;
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{onlyToday ? "Replies today" : "Replies"}</h1>
        {onlyToday ? (
          <p className="text-sm">
            <Link href="/bd/replies" className="text-brand hover:underline">
              Show all replies
            </Link>
          </p>
        ) : null}
        <p className="text-sm text-mute">
          Everyone who answered. Click a row to read what they wrote, then open the thread in the
          sender's Gmail to answer. The label (interested / not interested) is a first guess by the
          system; the sender decides. Out-of-office and automatic replies are not listed here
          {auto ? `: ${auto} of those so far` : ""}.
        </p>
      </div>
      <div className="card overflow-hidden">
        {!rows.length ? (
          <div className="px-5 py-6 text-sm text-mute">
            {onlyToday ? "No replies yet today." : "No replies yet."}
          </div>
        ) : (
          <div className="divide-y divide-line">
            <div className="hidden bg-paper px-5 py-2 text-left text-xs uppercase tracking-wide text-mute md:grid md:grid-cols-[150px_1.2fr_1.6fr_1.2fr_120px_130px] md:gap-3">
              <div>When</div>
              <div>Company</div>
              <div>Person</div>
              <div>Campaign</div>
              <div>Sender</div>
              <div>Label</div>
            </div>
            {rows.map((r) => (
              <details key={r.Id} className="group">
                <summary className="cursor-pointer list-none px-5 py-3 text-sm hover:bg-paper md:grid md:grid-cols-[150px_1.2fr_1.6fr_1.2fr_120px_130px] md:items-center md:gap-3">
                  <div className="whitespace-nowrap text-mute">{fmtDateTime(whenOf(r))}</div>
                  <div className="font-medium">{r.company}</div>
                  <div>
                    {r.contact_name}
                    {r.contact_title ? (
                      <span className="text-mute"> · {r.contact_title}</span>
                    ) : null}
                    <div className="text-xs text-mute">{r.to_email}</div>
                  </div>
                  <div>
                    <Link
                      href={`/bd/campaign/${encodeURIComponent(keyOf(r))}`}
                      className="text-brand hover:underline"
                    >
                      {r.campaign || nameOf[r.batch_id] || "Batch " + r.batch_id}
                    </Link>
                  </div>
                  <div>
                    {r.sender_name || r.sender}
                    <div className="text-xs text-mute">{mailboxOf[r.sender] || r.sender}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TagPill tag={lastTag(r)} />
                    <span className="text-xs text-mute group-open:hidden">Open</span>
                    <span className="hidden text-xs text-mute group-open:inline">Close</span>
                  </div>
                </summary>
                <div className="border-t border-line bg-white px-5 py-4">
                  <ReplyText r={r} />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
