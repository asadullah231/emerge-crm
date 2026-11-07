import { loadAll, withBodies } from "@/bd/lib/data";
import { keyOf } from "@/bd/lib/campaigns";
import { EmailRow } from "@/bd/components/email-row";

export const dynamic = "force-dynamic";

export default async function Emails({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp?.q || "")
    .trim()
    .toLowerCase();
  const all = await loadAll();
  let rows = all.outbox
    .filter((r) => ["sent", "replied", "bounced", "auto_reply"].includes(r.status))
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  if (q)
    rows = rows.filter((r) =>
      [r.company, r.contact_name, r.to_email, r.campaign, r.subject, r.sender_name].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q)
      )
    );
  const shown = await withBodies(rows.slice(0, 300));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Emails sent</h1>
        <p className="text-sm text-mute">
          Every email the system has sent, newest first. Open one to read exactly what went out.
        </p>
      </div>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search company, person, email, campaign or subject"
          className="input w-full max-w-xl"
        />
        <button className="btn">Search</button>
      </form>
      <div className="text-xs text-mute">
        {rows.length} emails{q ? ` matching "${q}"` : ""}
        {rows.length > shown.length ? `, showing the latest ${shown.length}` : ""}
      </div>
      <div className="card divide-y divide-line">
        {!shown.length && <div className="px-5 py-6 text-sm text-mute">Nothing found.</div>}
        {shown.map((r) => (
          <EmailRow
            key={r.Id}
            r={r}
            showCampaign
            campaignHref={`/bd/campaign/${encodeURIComponent(keyOf(r))}`}
          />
        ))}
      </div>
    </div>
  );
}
