import Link from "next/link";
import { loadAll, withBodies } from "@/bd/lib/data";
import { buildTeam, dailyFor, fmtDay } from "@/bd/lib/team";
import { keyOf } from "@/bd/lib/campaigns";
import { Stat, Back } from "@/bd/components/ui";
import { EmailRow } from "@/bd/components/email-row";
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London"
  });

export const dynamic = "force-dynamic";

export default async function Member({ params }) {
  const { mailbox: raw } = await params;
  let mailbox = raw;
  try {
    mailbox = decodeURIComponent(raw);
  } catch {
    /* already plain */
  }
  const all = await loadAll();
  const t = buildTeam(all).find((x) => x.mailbox === mailbox);
  if (!t)
    return (
      <div className="space-y-3">
        <Back href="/bd/team" label="Team" />
        <div className="card px-6 py-6">This mailbox does not exist.</div>
      </div>
    );
  const days = dailyFor(all.outbox, mailbox, 14);
  const todayRows = all.outbox
    .filter(
      (r) =>
        r.sender === mailbox &&
        ["sent", "replied", "bounced", "auto_reply"].includes(r.status) &&
        r.sent_at &&
        new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
          new Date(r.sent_at)
        ) === days[0].day
    )
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  const replies = await withBodies(
    all.outbox
      .filter((r) => r.sender === mailbox && r.status === "replied")
      .sort((a, b) =>
        String(b.UpdatedAt || b.sent_at).localeCompare(String(a.UpdatedAt || a.sent_at))
      )
  );

  return (
    <div className="space-y-6">
      <Back href="/bd/team" label="Team" />
      <div className="card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            <div className="text-sm text-mute">
              {t.email || t.mailbox} · daily limit {t.cap} · emails go out Monday to Friday, 7:00 to
              19:00 UK
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Sent today" value={`${t.sentToday} / ${t.cap}`} />
          <Stat label="Sent total" value={t.sentTotal} />
          <Stat label="Replies" value={t.replies} tone={t.replies ? "text-ok" : ""} />
          <Stat label="Out of office" value={t.autoReplies} tone="text-mute" />
          <Stat label="Bounced" value={t.bounced} tone={t.bounced ? "text-bad" : ""} />
          <Stat label="Waiting" value={t.waiting} />
        </div>
        {t.failed > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-3 text-sm text-red-900">
            {t.failed} emails could not be sent from this mailbox. Gmail answered:{" "}
            {t.lastError || "unknown error"}. Once the mailbox is reconnected in n8n they are sent
            again automatically, nobody needs to re-upload anything.
          </div>
        )}
        {t.campaigns.length > 0 && (
          <div className="mt-4 text-sm text-mute">
            Campaigns:{" "}
            {t.campaigns.map((c, i) => (
              <span key={c}>
                {i ? ", " : ""}
                <Link
                  href={`/bd/campaign/${encodeURIComponent("c:" + c)}`}
                  className="text-brand hover:underline"
                >
                  {c}
                </Link>
              </span>
            ))}
          </div>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-3 font-semibold tracking-tight">Day by day (last 14 days)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Day</th>
                <th>Sent</th>
                <th>Replies</th>
                <th>Out of office</th>
                <th>Bounced</th>
                <th>Not sent</th>
                <th>Campaigns</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className={d.sent || d.failed ? "" : "text-mute"}>
                  <td className="whitespace-nowrap">
                    {fmtDay(d.day)}
                    {d.day === days[0].day ? (
                      <span className="ml-2 pill bg-brand/10 text-brand">today</span>
                    ) : null}
                  </td>
                  <td className="num font-medium">{d.sent}</td>
                  <td className={`num ${d.replies ? "text-ok font-medium" : ""}`}>{d.replies}</td>
                  <td className="num">{d.autoReplies}</td>
                  <td className={`num ${d.bounced ? "text-bad" : ""}`}>{d.bounced}</td>
                  <td className={`num ${d.failed ? "text-bad font-medium" : ""}`}>{d.failed}</td>
                  <td className="text-xs text-mute">{d.campaigns.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-3 font-semibold tracking-tight">
          Replies ({replies.length})
        </div>
        {!replies.length ? (
          <div className="px-5 pb-4 text-sm text-mute">No replies yet.</div>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {replies.map((r) => (
              <EmailRow
                key={r.Id}
                r={r}
                showCampaign
                campaignHref={`/bd/campaign/${encodeURIComponent(keyOf(r))}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-3 font-semibold tracking-tight">
          Sent today ({todayRows.length})
        </div>
        <p className="px-5 pb-3 text-xs text-mute">
          Open the campaign to read the full text of any email.
        </p>
        {!todayRows.length ? (
          <div className="px-5 pb-4 text-sm text-mute">Nothing sent yet today.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Company</th>
                  <th>Person</th>
                  <th>Campaign</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.slice(0, 500).map((r) => (
                  <tr key={r.Id}>
                    <td className="whitespace-nowrap num">{fmtTime(r.sent_at)}</td>
                    <td className="font-medium">{r.company}</td>
                    <td>
                      {r.contact_name}
                      {r.contact_title ? (
                        <span className="text-mute"> · {r.contact_title}</span>
                      ) : null}
                    </td>
                    <td>
                      <Link
                        href={`/bd/campaign/${encodeURIComponent(keyOf(r))}`}
                        className="text-brand hover:underline"
                      >
                        {r.campaign}
                      </Link>
                    </td>
                    <td className="text-xs text-mute">
                      {r.status === "replied" ? (
                        <span className="pill bg-emerald-500/10 text-emerald-700">Replied</span>
                      ) : r.status === "bounced" ? (
                        <span className="pill bg-red-500/10 text-red-700">Bounced</span>
                      ) : r.status === "auto_reply" ? (
                        "Out of office"
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
