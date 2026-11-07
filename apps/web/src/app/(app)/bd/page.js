import Link from "next/link";
import { loadAll, buildCampaigns, queueAdvice, today } from "@/bd/lib/data";
import { fmtDate, plural } from "@/bd/lib/text";
import { StagePill, Progress, Stat, Banner } from "@/bd/components/ui";
import { PauseResume } from "@/bd/components/controls";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  const sp = await searchParams;
  const all = await loadAll();
  const campaigns = buildCampaigns(all).filter((c) => !c.archived);
  const advice = queueAdvice(campaigns, all.state);
  const paused =
    String(all.state.paused || "")
      .toLowerCase()
      .trim() === "yes";
  const sentToday = today(all.outbox).length;
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
        <Stat label="Sent in total" value={totals.sent} />
        <Stat label="Replies" value={totals.replied} tone="text-ok" />
        <Stat label="Waiting to send" value={totals.queued} />
      </div>

      <Section
        title="Running now"
        items={running}
        empty="Nothing is running. Upload a LinkedIn search in #bd-outreach to start a campaign."
      />
      <Section title="Finished" items={done} empty="No finished campaigns yet." />
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
        <Stat label="Replies" value={c.replied} tone={c.replied ? "text-ok" : ""} />
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
