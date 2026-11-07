import Link from "next/link";
import { fmtDateTime } from "@/bd/lib/text";

// One sent email, collapsed to a line; click to read the full text that went out.
// The stored draft ends with "[Your name] / EmergeTech"; at send time Part 03 swaps that for the sender's real signature. Show it the way it went out.
const asSent = (r) =>
  String(r.body || "")
    .replace(/\s*\[Your name\]\s*\n\s*EmergeTech\s*$/, "")
    .replace(/\[Your name\]/g, r.sender_name || r.sender || "")
    .trim() +
  "\n" +
  (r.sender_name || r.sender || "") +
  (r.sender_title ? "\n" + r.sender_title : "") +
  "\nEmergeTech";
export function EmailRow({ r, showCampaign = false, campaignHref = "" }) {
  const result =
    r.status === "replied" ? (
      <span className="pill bg-emerald-50 text-emerald-700">Replied</span>
    ) : r.status === "bounced" ? (
      <span className="pill bg-red-50 text-red-700">Bounced</span>
    ) : r.status === "auto_reply" ? (
      <span className="pill bg-gray-100 text-gray-600">Out of office</span>
    ) : null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm hover:bg-paper">
        <span className="w-28 shrink-0 whitespace-nowrap text-xs text-mute">
          {fmtDateTime(r.sent_at)}
        </span>
        <span className="font-medium">{r.company}</span>
        <span className="text-mute">
          {r.contact_name}
          {r.contact_title ? ` · ${r.contact_title}` : ""}
        </span>
        {showCampaign && r.campaign && (
          <Link href={campaignHref} className="text-xs text-brand hover:underline">
            {r.campaign}
          </Link>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-mute">
          {result}
          <span>as {r.sender_name || r.sender}</span>
          <span className="transition group-open:rotate-90">&rsaquo;</span>
        </span>
      </summary>
      <div className="border-t border-line bg-paper px-5 py-4 text-sm">
        <div className="text-xs text-mute">To {r.to_email}</div>
        <div className="mt-1 font-medium">{r.subject}</div>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {asSent(r)}
        </pre>
        <div className="mt-3 text-xs text-mute">
          Sent with {r.sender_name || r.sender}&rsquo;s email signature (name, title, EmergeTech,
          phone numbers).
        </div>
      </div>
    </details>
  );
}
