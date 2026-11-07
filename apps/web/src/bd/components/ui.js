import Link from "next/link";
import { stageLabel } from "@/bd/lib/text";

const tones = {
  scraping: "bg-sky-500/10 text-sky-700",
  researching: "bg-indigo-500/10 text-indigo-700",
  sending: "bg-emerald-500/10 text-emerald-700",
  complete: "bg-black/[0.05] text-mute",
  nothing: "bg-amber-500/10 text-amber-700",
  paused: "bg-amber-500/10 text-amber-700"
};

export function StagePill({ stage }) {
  const live = stage === "sending" || stage === "researching" || stage === "scraping";
  return (
    <span className={`pill ${tones[stage] || tones.complete}`}>
      {live && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {stageLabel(stage)}
    </span>
  );
}

export function Progress({ value, tone = "bg-brand" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className={`h-full rounded-full transition-all duration-700 ${tone}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Stat({ label, value, tone = "", href }) {
  const num = (
    <div className={`num text-[22px] font-semibold leading-tight tracking-tight ${tone}`}>
      {value}
    </div>
  );
  return (
    <div>
      {href ? (
        <Link href={href} className="inline-block hover:underline" title="See the list">
          {num}
        </Link>
      ) : (
        num
      )}
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-mute">
        {label}
      </div>
    </div>
  );
}

export function Banner({ advice }) {
  const t = {
    ok: "border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-900",
    warn: "border-amber-500/20 bg-amber-500/[0.08] text-amber-900",
    bad: "border-red-500/15 bg-red-500/[0.06] text-red-900"
  }[advice.tone];
  const dot = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" }[advice.tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 backdrop-blur-sm ${t}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div>
        <div className="font-semibold tracking-tight">{advice.title}</div>
        <div className="mt-0.5 text-sm opacity-80">{advice.body}</div>
      </div>
    </div>
  );
}

export function Back({ href = "/bd", label = "All campaigns" }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-mute transition hover:text-ink"
    >
      &larr; {label}
    </Link>
  );
}
