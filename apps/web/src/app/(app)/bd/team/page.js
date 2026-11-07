import Link from "next/link";
import { loadAll } from "@/bd/lib/data";
import { buildTeam, windowTeamStats } from "@/bd/lib/team";
import { TeamActivity } from "@/bd/components/team-activity";
import { WhenSelect } from "@/bd/components/when-select";
import { Stat } from "@/bd/components/ui";

export const dynamic = "force-dynamic";

const WHEN = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" }
];

const ukDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

export default async function Team({ searchParams }) {
  const sp = await searchParams;
  const when = WHEN.some((w) => w.key === sp?.when) ? sp.when : "month";
  const whenLabel = WHEN.find((w) => w.key === when).label;

  const all = await loadAll();
  const team = buildTeam(all).filter((t) => t.active || t.sentTotal > 0);
  const win = windowTeamStats(all.outbox, when);
  const paused =
    String(all.state.paused || "")
      .toLowerCase()
      .trim() === "yes";

  const monthKey = ukDay(new Date()).slice(0, 7);
  const metaThisMonth = (mailbox) =>
    (all.meta || []).filter(
      (m) =>
        m.sender === mailbox &&
        /^bd-/.test(String(m.batch_id || "")) &&
        (m.started_at || m.CreatedAt) &&
        ukDay(m.started_at || m.CreatedAt).slice(0, 7) === monthKey
    ).length;

  const rows = team
    .map((t) => ({ ...t, win: win[t.mailbox] || { sent: 0, replies: 0, rate: 0 } }))
    .sort((a, b) => b.win.sent - a.win.sent || b.sentTotal - a.sentTotal);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-mute">
            One box per sender mailbox, like your cold email tool.{" "}
            {paused ? "Sending is paused right now." : ""}
          </p>
        </div>
        <WhenSelect value={when} options={WHEN} />
      </div>

      {/* GitHub-style grid: har banda, har din */}
      <TeamActivity team={rows} outbox={all.outbox} linkTo="team" />

      {/* Mailbox gallery */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((t) => (
          <div key={t.mailbox} className="card flex flex-col px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/bd/team/${encodeURIComponent(t.mailbox)}`}
                  className="text-[15px] font-semibold tracking-tight hover:text-brand"
                >
                  {t.name}
                </Link>
                <div className="text-xs text-mute">
                  {t.email || t.mailbox}
                  {t.active ? "" : " · not active"}
                </div>
              </div>
              <span
                className={`pill ${t.failedToday ? "bg-red-500/10 text-red-700" : t.paused ? "bg-amber-500/10 text-amber-700" : t.sentToday ? "bg-emerald-500/10 text-emerald-700" : "bg-black/[0.05] text-mute"}`}
              >
                {t.failedToday
                  ? "Mailbox problem"
                  : t.paused
                    ? "Paused"
                    : t.sentToday
                      ? "Sending"
                      : "Idle today"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <Stat label={`Sent · ${whenLabel.toLowerCase()}`} value={t.win.sent} />
              <Stat label="Replies" value={t.win.replies} tone={t.win.replies ? "text-ok" : ""} />
              <Stat
                label="Reply rate"
                value={t.win.sent ? `${t.win.rate}%` : "–"}
                tone={t.win.rate >= 2 ? "text-ok" : ""}
              />
              <Stat label="Today" value={`${t.sentToday} / ${t.cap}`} />
            </div>
            {t.failedToday > 0 && (
              <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-xs text-red-900">
                {t.failedToday} emails could not be sent today. Gmail answered:{" "}
                {t.lastError || "unknown error"}. The mailbox needs to be reconnected in n8n, then
                the emails go out again on their own.
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3 text-xs">
              <span className="text-mute">
                <b className="num text-ink">{metaThisMonth(t.mailbox)}</b> campaigns this month ·{" "}
                <b className="num text-ink">{t.waiting}</b> waiting
              </span>
              <span className="flex gap-3">
                <Link
                  href={`/bd?who=${encodeURIComponent(t.mailbox)}`}
                  className="text-brand hover:underline"
                >
                  Campaigns
                </Link>
                <Link
                  href={`/bd/team/${encodeURIComponent(t.mailbox)}`}
                  className="text-mute hover:text-ink"
                >
                  Day by day
                </Link>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
