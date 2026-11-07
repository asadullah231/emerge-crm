import { notFound } from "next/navigation";
import "@/bd/bd.css";
import { bdAccess } from "@/bd/access";
import { BdTabs } from "@/bd/components/tabs";

// Every BD page reads live NocoDB rows; nothing here is static.
export const dynamic = "force-dynamic";

/**
 * BD Outreach module: the team's view of the n8n outreach engine (campaigns,
 * emails sent, replies, per-mailbox numbers). The pages live in this folder and
 * read the BD base through src/bd/lib; the engine itself stays in n8n.
 * Hidden (404) unless the workspace has the module switched on.
 */
export default async function BdLayout({ children }: { children: React.ReactNode }) {
  const access = await bdAccess();
  if (!access.enabled) notFound();
  return (
    <div className="bd mx-auto max-w-6xl space-y-6">
      <BdTabs canWrite={access.canWrite} />
      {children}
      <p className="pt-2 text-xs text-[var(--muted)]">
        Data refreshes on every page load. Times are UK.
      </p>
    </div>
  );
}
