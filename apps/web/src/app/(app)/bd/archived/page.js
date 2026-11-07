import Link from "next/link";
import { loadAll, buildCampaigns } from "@/bd/lib/data";
import { fmtDate } from "@/bd/lib/text";
import { Back } from "@/bd/components/ui";
import { ArchiveButton } from "@/bd/components/controls";

export const dynamic = "force-dynamic";

export default async function Archived() {
  const all = await loadAll();
  const items = buildCampaigns(all).filter((c) => c.archived);
  return (
    <div className="space-y-4">
      <Back />
      <div>
        <h1 className="text-2xl font-semibold">Archived campaigns</h1>
        <p className="text-sm text-mute">
          Hidden from the Campaigns page. Nothing here is deleted; unarchive to bring one back.
        </p>
      </div>
      {!items.length && <div className="card px-5 py-6 text-sm text-mute">Nothing archived.</div>}
      <div className="card divide-y divide-line">
        {items.map((c) => (
          <div
            key={c.batch}
            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <div>
              <Link
                href={`/bd/campaign/${encodeURIComponent(c.batch)}`}
                className="font-medium hover:underline"
              >
                {c.name}
              </Link>
              <div className="text-xs text-mute">
                Started {fmtDate(c.started)} · {c.sent} sent · {c.replied} replies
              </div>
            </div>
            <ArchiveButton batch={c.batch} archived />
          </div>
        ))}
      </div>
    </div>
  );
}
