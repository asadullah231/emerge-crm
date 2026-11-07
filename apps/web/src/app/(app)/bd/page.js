import Link from "next/link";
import { loadAll, buildCampaigns, queueAdvice, today } from "@/bd/lib/data";
import { buildTeam } from "@/bd/lib/team";
import { fmtDate, plural } from "@/bd/lib/text";
import { StagePill, Progress, Stat, Banner } from "@/bd/components/ui";
import { PauseResume } from "@/bd/components/controls";
import { TeamActivity } from "@/bd/components/team-activity";

export const dynamic = "force-dynamic";

const WHEN = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" }
];

const ukDay = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

/** Campaign ki aakhri harkat ka din; filter isi pe chalta hai. */
function lastDay(c) {
  const t = c.lastSent || c.started;
  return t ? ukDay(t) : "";
}

function inWindow(c, when) {
  if (when === "all") return true;
  const day = lastDay(c);
  if (!day) return false;
  const now = new Date();
  const todayKey = ukDay(now);
  if (when === "today") return day === todayKey;
  if (when === "yesterday") return day === ukDay(new Date(now.getTime() - 864e5));
  if (when === "7d") return day >= ukDay(new Date(now.getTime() - 7 * 864e5));
  if (when === "month") return day.slice(0, 7) === todayKey.slice(0, 7);
  return true;
}

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const who = typeof sp?.who === "string" ? sp.who : "";
  const when = WHEN.some((w) => w.key === sp?.when) ? sp.when : "all";
  const q = typeof sp?.q === "string" ? sp.q.trim().toLowerCase() : "";

  const all = await loadAll();
  const everyCampaign = buildCampaigns(all).filter((c) => !c.archived);
  const team = buildTeam(all);
  const advice = queueAdvice(everyCampaign, all.state);
  const paused =
    String(all.state.paused || "")
      .toLowerCase()
      .trim() === "yes";
  const sentToday = today(all.outbox).length;

  const campaigns = everyCampaign.filter(
    (c) =>
      (!who || c.senderKeys.includes(who) || (!c.senderKeys.length && who === "")) &&
      inWindow(c, when) &&
      (!q || c.name.toLowerCase().includes(q))
  );

  const totals = campaigns.reduce(
    (a, c) => ({
      sent: a.sent + c.sent,
      replied: a.replied + c.replied,
      queued: a.queued + c.queued
    }),
    { sent: 0, replied: 0, queued: 0 }
  );
  const running = campaigns.filter((c) =>
    ["sending", "researching", "scraping", "paused"].includes(c.stage)
  );
  const done = campaigns.filter((c) => !running.includes(c));
  const filtered = Boolean(who || when !== "all" || q);

  const href = (patch) => {
    const p = new URLSearchParams();
    const next = { who, when, q, ...patch };
    if (next.who) p.set("who", next.who);
    if (next.when && next.when !== "all") p.set("when", next.when);
    if (next.q) p.set("q", next.q);
    const s = p.toString();
    return s ? `/bd?${s}` : "/bd";
  };

  return (
    <div className="space-y-6">
      {sp?.started && (
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.07] px-5 py-3.5 text-sm text-emerald-900">
          Campaign started. It shows up below within a minute, once the first job ads are collected.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <PauseResume paused={paused} />
      </div>
      <Banner advice={advice} />

      <div className="card grid grid-cols-2 gap-6 px-6 py-5 sm:grid-cols-4">
        <Stat label="Sent today" value={sentToday} />
        <Stat label={filtered ? "Sent (filtered)" : "Sent in total"} value={totals.sent} />
        <Stat label="Replies" value={totals.replied} tone="text-ok" />
        <Stat label="Waiting to send" value={totals.queued} />
      </div>

      {/* GitHub-style activity grid: kaun active hai ek nazar me */}
      <TeamActivity
        team={team.filter((t) => t.active || t.sentTotal > 0)}
        outbox={all.outbox}
        linkTo="campaigns"
      />
      <div className="-mt-3 px-1 text-xs text-mute">
        Click a name to see only their campaigns ·{" "}
        <Link href="/bd/team" className="text-brand hover:underline">
          Full team view
        </Link>
      </div>

      {/* Filters: time window + search */}
      <section className="flex flex-wrap items-center gap-2">
        {WHEN.map((w) => (
          <Link
            key={w.key}
            href={href({ when: w.key })}
            className={`pill ${when === w.key ? "bg-brand text-white" : "bg-black/[0.05] text-mute hover:text-ink"}`}
          >
            {w.label}
          </Link>
        ))}
        <form action="/bd" className="ml-auto">
          {who && <input type="hidden" name="who" value={who} />}
          {when !== "all" && <input type="hidden" name="when" value={when} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search campaigns..."
            className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-black/30"
          />
        </form>
        {filtered && (
          <Link href="/bd" className="pill bg-black/[0.05] text-mute hover:text-ink">
            Clear filters
          </Link>
        )}
      </section>

      <Section
        title={`Running now (${running.length})`}
        items={running}
        empty={
          filtered
            ? "Nothing running matches these filters."
            : "Nothing is running. Upload a LinkedIn search in #bd-outreach to start a campaign."
        }
      />

      {/* Finished: apni jagah pe, collapsed by default jab filters off hon */}
      <details open={filtered || running.length === 0} className="group">
        <summary className="cursor-pointer select-none px-1 text-[11px] font-semibold uppercase tracking-wider text-mute hover:text-ink">
          Finished ({done.length}) <span className="normal-case">· click to open</span>
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {done.map((c) => (
            <CampaignCard key={c.batch} c={c} />
          ))}
          {!done.length && (
            <div className="card px-5 py-6 text-sm text-mute">No finished campaigns yet.</div>
          )}
        </div>
      </details>

      <div className="text-sm">
        <Link href="/bd/archived" className="text-mute hover:text-ink">
          Archived campaigns
        </Link>
      </div>
    </div>
  );
}

function Section({ title, items, empty }) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-mute">{title}</h2>
      {!items.length && <div className="card px-5 py-6 text-sm text-mute">{empty}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <CampaignCard key={c.batch} c={c} />
        ))}
      </div>
    </section>
  );
}

function CampaignCard({ c }) {
  const line = c.stale
    ? c.contacts
      ? `${c.queued ? c.queued + " waiting · " : ""}${c.blocked} skipped`
      : c.researched
        ? `${c.researched} companies researched, no emails were queued`
        : `${plural(c.jobs, "job ad")} collected, never researched`
    : c.pending
      ? `${plural(c.jobs, "job ad")} collected, research starts with the next run`
      : c.stage === "researching"
        ? `${c.researched} companies researched, emails are being prepared`
        : c.stage === "scraping"
          ? c.justStarted
            ? "Started, collecting job ads from LinkedIn (10 to 20 minutes)"
            : `${plural(c.jobs, "job ad")} collected`
          : c.stage === "nothing"
            ? "No decision makers with a work email were found"
            : `${c.queued} waiting · ${c.blocked} skipped`;
  return (
    <Link href={`/bd/campaign/${encodeURIComponent(c.batch)}`} className="card block px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight">{c.name}</div>
          <div className="text-xs text-mute">
            Started {fmtDate(c.started)} · sent as {c.senderLabel}
          </div>
        </div>
        <StagePill stage={c.stage} />
      </div>
      <div className="mt-4">
        <Progress value={c.progress} tone={c.stage === "complete" ? "bg-black/30" : "bg-brand"} />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs text-mute">
        <span>{line}</span>
        {c.toSend > 0 && (
          <span className="num whitespace-nowrap">
            {c.sent} of {c.toSend} sent
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-black/[0.06] pt-4 text-xs text-mute">
        <span>
          <b className="num text-ink">{c.jobs}</b> job ads
        </span>
        <span>&rarr;</span>
        <span>
          <b className="num text-ink">{c.jobCompanies || c.researched}</b> companies
        </span>
        <span>&rarr;</span>
        <span>
          <b className="num text-ink">{c.contacts}</b> people found
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3">
        <Stat label="Sent" value={c.sent} />
        <Stat
          label="Replies"
          value={
            c.sent ? `${c.replied} · ${Math.round((c.replied / c.sent) * 1000) / 10}%` : c.replied
          }
          tone={c.replied ? "text-ok" : ""}
        />
        <Stat label="Waiting" value={c.queued} />
        <Stat label="Skipped" value={c.blocked} tone="text-mute" />
      </div>
      {c.blocked > 0 && (
        <div className="mt-2 text-xs text-mute">
          <span className="text-ink">Skipped</span> = found but not emailed:{" "}
          {c.skipReasons
            .slice(0, 3)
            .map(([k, n]) => `${n} ${k}`)
            .join(" · ")}
          {c.skipReasons.length > 3 ? " · more" : ""}
        </div>
      )}
      {c.followups > 0 && (
        <div className="mt-2 text-xs text-mute">
          <span className="text-ink">{c.followups}</span> follow-ups sent in the same threads
        </div>
      )}
      {c.failed > 0 && (
        <div className="mt-2 text-xs text-bad">
          {c.failed} emails could not be sent (mailbox problem). They go out once the mailbox is
          reconnected.
        </div>
      )}
      {c.noContactCompanies > 0 && (
        <div className="mt-1 text-xs text-mute">
          {plural(c.noContactCompanies, "company", "companies")} researched with nobody to email
        </div>
      )}
      {c.queued > 0 && c.stage === "sending" && (
        <div className="mt-2 text-xs text-mute">
          About {plural(c.daysLeft, "working day")} of sending left
        </div>
      )}
    </Link>
  );
}
