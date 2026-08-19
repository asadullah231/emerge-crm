import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { companies, jobs, publicJobPostings, withWorkspace, workspaces } from "@emerge/db";
import { z } from "zod";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const EMPLOYMENT_LABEL: Record<string, string> = {
  permanent: "Permanent",
  contract: "Contract",
  temporary: "Temporary"
};
const MODE_LABEL: Record<string, string> = {
  onsite: "Onsite",
  remote: "Remote",
  hybrid: "Hybrid"
};

/**
 * Public careers page (M19): every published open job for the workspace, no
 * login. Lives outside the (app) shell; jobs link to a detail + apply page.
 */
export default async function CareersPage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!z.string().uuid().safeParse(workspaceId).success) notFound();

  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) notFound();

  const rows = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({
        id: jobs.id,
        title: jobs.title,
        location: jobs.location,
        city: jobs.city,
        country: jobs.country,
        employmentType: jobs.employmentType,
        workMode: jobs.workMode,
        clientName: companies.name,
        publishedAt: publicJobPostings.createdAt
      })
      .from(publicJobPostings)
      .innerJoin(jobs, eq(jobs.id, publicJobPostings.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(isNull(jobs.deletedAt), eq(jobs.status, "open")))
      .orderBy(desc(publicJobPostings.createdAt))
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="mt-1 text-[var(--muted)]">Open positions</p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          No open positions right now. Check back soon.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((job) => {
            const location =
              job.location ?? [job.city, job.country].filter(Boolean).join(", ") ?? "";
            return (
              <li key={job.id}>
                <Link
                  href={`/careers/${workspaceId}/${job.id}`}
                  className="block rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition-shadow hover:shadow-md"
                >
                  <p className="font-semibold">{job.title}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {[
                      location,
                      EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType,
                      MODE_LABEL[job.workMode] ?? job.workMode
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        Powered by Emerge CRM
      </footer>
    </main>
  );
}
