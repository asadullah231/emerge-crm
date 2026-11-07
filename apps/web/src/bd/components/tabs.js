"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/bd", "Campaigns"],
  ["/bd/emails", "Emails"],
  ["/bd/replies", "Replies"],
  ["/bd/today", "Today"],
  ["/bd/team", "Team"],
  ["/bd/help", "How it works"]
];

/** Module tab bar. Campaigns is active on /bd and on a campaign page; the rest match their own prefix. */
export function BdTabs({ canWrite }) {
  const path = usePathname() || "/bd";
  const active = (h) =>
    h === "/bd"
      ? path === "/bd" ||
        path.startsWith("/bd/campaign") ||
        path.startsWith("/bd/archived") ||
        path.startsWith("/bd/start")
      : path === h || path.startsWith(h + "/");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-0.5 rounded-xl bg-black/[0.04] p-1 text-[13px] font-medium text-mute dark:bg-white/[0.06]">
        {TABS.map(([h, t]) => (
          <Link
            key={h}
            href={h}
            className={
              "rounded-lg px-3 py-1.5 transition hover:text-ink " +
              (active(h) ? "bg-white text-ink shadow-soft" : "")
            }
          >
            {t}
          </Link>
        ))}
      </div>
      {canWrite && !path.startsWith("/bd/start") && (
        <Link href="/bd/start" className="btn-primary">
          Start a campaign
        </Link>
      )}
    </div>
  );
}
