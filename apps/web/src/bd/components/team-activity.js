import Link from "next/link";
import { dailyFor } from "@/bd/lib/team";

/**
 * GitHub-style activity grid, kept deliberately simple: a date header row,
 * then one row per teammate (name + mailbox), one square per day. Darker
 * blue = more emails sent that day, green ring = replies came in. Hover any
 * square for the exact numbers.
 */

const ukDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

function shade(sent) {
  if (!sent) return "rgba(0,0,0,0.05)";
  if (sent < 5) return "rgba(37,99,235,0.25)";
  if (sent < 15) return "rgba(37,99,235,0.5)";
  if (sent < 30) return "rgba(37,99,235,0.75)";
  return "rgba(37,99,235,1)";
}

const dayLabel = (k) =>
  new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London"
  });

const dayNum = (k) => String(Number(k.slice(8, 10)));
const weekdayInitial = (k) =>
  new Date(k + "T12:00:00Z")
    .toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "Europe/London" })
    .slice(0, 1);

export function TeamActivity({ team, outbox, days = 14, linkTo = "team" }) {
  const rows = team
    .map((t) => {
      const daily = dailyFor(outbox, t.mailbox, days).reverse(); // oldest -> newest
      const sent = daily.reduce((a, d) => a + d.sent, 0);
      const replies = daily.reduce((a, d) => a + d.replies, 0);
      return { ...t, daily, windowSent: sent, windowReplies: replies };
    })
    .sort((a, b) => b.windowSent - a.windowSent || a.name.localeCompare(b.name));
  const dayKeys = rows[0] ? rows[0].daily.map((d) => d.day) : [];
  const todayKey = ukDay(new Date());

  return (
    <section className="card space-y-1 overflow-x-auto px-6 py-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-mute">
          Who sent what · last {days} days
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-mute">
          none
          {[0, 3, 10, 20, 35].map((n) => (
            <span
              key={n}
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: shade(n) }}
            />
          ))}
          a lot · <span className="inline-block h-3 w-3 rounded-full ring-2 ring-emerald-500" /> =
          got replies
        </span>
      </div>

      <div className="min-w-fit">
        {/* Date header: weekday initial + date number over every column */}
        <div className="flex items-end gap-3 pb-1">
          <span className="w-44 shrink-0" />
          <div className="flex gap-1.5">
            {dayKeys.map((k) => (
              <span
                key={k}
                className={`flex h-9 w-5 flex-col items-center justify-end text-[10px] leading-tight ${k === todayKey ? "font-bold text-ink" : "text-mute"}`}
              >
                <span>{weekdayInitial(k)}</span>
                <span className="num">{dayNum(k)}</span>
              </span>
            ))}
          </div>
          <span className="pl-1 text-[10px] uppercase tracking-wide text-mute">Total</span>
        </div>

        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.mailbox} className="flex items-center gap-3">
              <Link
                href={
                  linkTo === "team"
                    ? `/bd/team/${encodeURIComponent(t.mailbox)}`
                    : `/bd?who=${encodeURIComponent(t.mailbox)}`
                }
                className="w-44 shrink-0 hover:text-brand"
              >
                <span className="block truncate text-[13px] font-medium leading-tight">
                  {t.name}
                </span>
                <span className="block truncate text-[11px] leading-tight text-mute">
                  {t.email || t.mailbox}
                </span>
              </Link>
              <div className="flex gap-1.5">
                {t.daily.map((d) => (
                  <span
                    key={d.day}
                    title={`${t.name} · ${dayLabel(d.day)} · ${d.sent} sent${d.replies ? ` · ${d.replies} replies` : ""}`}
                    className={`inline-block h-5 w-5 rounded-[4px] ${d.replies ? "ring-2 ring-emerald-500" : ""}`}
                    style={{ background: shade(d.sent) }}
                  />
                ))}
              </div>
              <span className="num whitespace-nowrap pl-1 text-xs text-mute">
                <b className="text-ink">{t.windowSent}</b>
                {t.windowReplies ? <span className="text-ok"> · {t.windowReplies} ↩</span> : ""}
              </span>
            </div>
          ))}
          {!rows.length && <div className="text-sm text-mute">No senders yet.</div>}
        </div>
      </div>
    </section>
  );
}
