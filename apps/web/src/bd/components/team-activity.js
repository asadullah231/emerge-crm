import Link from "next/link";
import { dailyFor } from "@/bd/lib/team";

/**
 * GitHub-style activity grid: one row per teammate, one square per day,
 * darker = more emails sent that day, green ring = got replies. The whole
 * team's rhythm in one glance, no reading needed.
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

export function TeamActivity({ team, outbox, days = 14, linkTo = "team" }) {
  const rows = team
    .map((t) => {
      const daily = dailyFor(outbox, t.mailbox, days).reverse(); // oldest -> newest
      const sent = daily.reduce((a, d) => a + d.sent, 0);
      const replies = daily.reduce((a, d) => a + d.replies, 0);
      return { ...t, daily, windowSent: sent, windowReplies: replies };
    })
    .sort((a, b) => b.windowSent - a.windowSent || a.name.localeCompare(b.name));
  const maxSent = Math.max(1, ...rows.map((r) => r.windowSent));
  const todayKey = ukDay(new Date());

  return (
    <section className="card space-y-1 px-6 py-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-mute">
          Team activity · last {days} days
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-mute">
          less
          {[0, 3, 10, 20, 35].map((n) => (
            <span
              key={n}
              className="inline-block h-2.5 w-2.5 rounded-[3px]"
              style={{ background: shade(n) }}
            />
          ))}
          more · <span className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-emerald-500" />{" "}
          = replies that day
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((t) => (
          <div key={t.mailbox} className="flex items-center gap-3">
            <Link
              href={
                linkTo === "team"
                  ? `/bd/team/${encodeURIComponent(t.mailbox)}`
                  : `/bd?who=${encodeURIComponent(t.mailbox)}`
              }
              className="w-32 shrink-0 truncate text-[13px] font-medium hover:text-brand sm:w-40"
            >
              {t.name}
            </Link>
            <div className="flex gap-1">
              {t.daily.map((d) => (
                <span
                  key={d.day}
                  title={`${dayLabel(d.day)} · ${d.sent} sent${d.replies ? ` · ${d.replies} replies` : ""}`}
                  className={`inline-block h-4 w-4 rounded-[4px] sm:h-[18px] sm:w-[18px] ${d.replies ? "ring-2 ring-emerald-500" : ""} ${d.day === todayKey ? "outline outline-1 outline-black/20" : ""}`}
                  style={{ background: shade(d.sent) }}
                />
              ))}
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              <span
                className="h-2 overflow-hidden rounded-full bg-black/[0.04]"
                style={{ width: "100%", maxWidth: 120 }}
              >
                <span
                  className="block h-full rounded-full bg-brand/60"
                  style={{ width: `${Math.round((t.windowSent / maxSent) * 100)}%` }}
                />
              </span>
              <span className="num whitespace-nowrap text-xs text-mute">
                <b className="text-ink">{t.windowSent}</b> sent
                {t.windowReplies ? (
                  <span className="text-ok"> · {t.windowReplies} replies</span>
                ) : (
                  ""
                )}
              </span>
            </div>
          </div>
        ))}
        {!rows.length && <div className="text-sm text-mute">No senders yet.</div>}
      </div>
    </section>
  );
}
