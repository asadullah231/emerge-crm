import { loadAll, capsFrom, capFor, today, repliesToday } from "@/bd/lib/data";
import { fmtDateTime } from "@/bd/lib/text";
import { Stat } from "@/bd/components/ui";

export const dynamic = "force-dynamic";

export default async function Today() {
  const all = await loadAll();
  const rows = today(all.outbox).sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  const caps = capsFrom(all.state);
  const paused =
    String(all.state.paused || "")
      .toLowerCase()
      .trim() === "yes";
  const bySender = {};
  for (const r of rows) bySender[r.sender] = (bySender[r.sender] || 0) + 1;
  const senders = all.senders.filter((s) => String(s.active).toLowerCase() === "yes");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-mute">
          Emails go out Monday to Friday between 7:00 and 19:00 UK, spread through the day.{" "}
          {paused ? "Sending is paused right now." : ""}
        </p>
      </div>
      <div className="card grid grid-cols-2 gap-6 px-6 py-5 sm:grid-cols-5">
        <Stat label="Sent today" value={rows.length} />
        <Stat
          label="Replies today"
          value={repliesToday(all.outbox).length}
          tone="text-ok"
          href="/bd/replies?when=today"
        />
        <Stat
          label="Not sent (mailbox problem)"
          value={
            all.outbox.filter(
              (r) =>
                r.status === "failed" &&
                r.sent_at &&
                new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
                  new Date(r.sent_at)
                ) ===
                  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date())
            ).length
          }
          tone="text-bad"
        />
        <Stat
          label="Bounced today"
          value={rows.filter((r) => r.status === "bounced").length}
          tone={rows.some((r) => r.status === "bounced") ? "text-bad" : ""}
        />
        <Stat
          label="Status"
          value={paused ? "Paused" : "Running"}
          tone={paused ? "text-warn" : "text-ok"}
        />
      </div>
      <section className="card px-6 py-5">
        <h2 className="font-semibold">Per mailbox</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {senders.map((s) => (
            <li key={s.mailbox} className="flex justify-between py-1.5">
              <span>{s.name}</span>
              <span className="num text-mute">
                {bySender[s.mailbox] || 0} of {capFor(caps, s.mailbox)} today
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card overflow-hidden">
        <div className="px-5 pt-4 pb-3 font-semibold tracking-tight">
          Sent today ({rows.length})
        </div>
        {!rows.length ? (
          <div className="px-5 pb-4 text-sm text-mute">Nothing sent yet today.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-mute">
              <tr>
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-5 py-2 font-medium">Company</th>
                <th className="px-5 py-2 font-medium">Person</th>
                <th className="px-5 py-2 font-medium">Sent as</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Id} className="border-t border-line">
                  <td className="px-5 py-2 whitespace-nowrap">
                    {fmtDateTime(r.sent_at).split(", ")[1] || fmtDateTime(r.sent_at)}
                  </td>
                  <td className="px-5 py-2">{r.company}</td>
                  <td className="px-5 py-2">
                    {r.contact_name}
                    {r.contact_title ? (
                      <span className="text-mute"> · {r.contact_title}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-2">{r.sender_name || r.sender}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
