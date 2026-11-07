import Link from "next/link";
import { loadAll } from "@/bd/lib/data";
import { buildTeam } from "@/bd/lib/team";
import { Stat } from "@/bd/components/ui";

export const dynamic = "force-dynamic";

export default async function Team() {
  const all = await loadAll();
  const team = buildTeam(all);
  const paused =
    String(all.state.paused || "")
      .toLowerCase()
      .trim() === "yes";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-mute">
          One card per mailbox. Open a name for the day-by-day numbers.{" "}
          {paused ? "Sending is paused right now." : ""}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {team.map((t) => (
          <Link
            key={t.mailbox}
            href={`/bd/team/${encodeURIComponent(t.mailbox)}`}
            className="card block px-6 py-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold tracking-tight">{t.name}</div>
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
              <Stat label="Today" value={`${t.sentToday} / ${t.cap}`} />
              <Stat label="Sent total" value={t.sentTotal} />
              <Stat label="Replies" value={t.replies} tone={t.replies ? "text-ok" : ""} />
              <Stat label="Waiting" value={t.waiting} />
            </div>
            {t.failedToday > 0 && (
              <div className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-xs text-red-900">
                {t.failedToday} emails could not be sent today. Gmail answered:{" "}
                {t.lastError || "unknown error"}. The mailbox needs to be reconnected in n8n, then
                the emails go out again on their own.
              </div>
            )}
            <div className="mt-3 text-xs text-mute">
              {t.campaigns.length ? "Campaigns: " + t.campaigns.join(", ") : "No campaigns yet"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
