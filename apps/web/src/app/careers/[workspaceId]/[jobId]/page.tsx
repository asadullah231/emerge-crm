import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { companies, jobs, publicJobPostings, withWorkspace, workspaces } from "@emerge/db";
import { z } from "zod";
import { CareersApplyForm } from "@/components/careers-apply-form";
import { JobDescriptionView } from "@/components/job-description-view";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Public job detail + apply form (M19). Only published, open jobs render. */
export default async function CareersJobPage({
  params
}: {
  params: Promise<{ workspaceId: string; jobId: string }>;
}) {
  const { workspaceId, jobId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(workspaceId).success || !uuid.safeParse(jobId).success) notFound();

  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) notFound();

  const [job] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        requiredSkills: jobs.requiredSkills,
        location: jobs.location,
        city: jobs.city,
        country: jobs.country,
        employmentType: jobs.employmentType,
        workMode: jobs.workMode,
        salaryText: jobs.salaryText,
        clientName: companies.name
      })
      .from(publicJobPostings)
      .innerJoin(jobs, eq(jobs.id, publicJobPostings.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        and(eq(publicJobPostings.jobId, jobId), isNull(jobs.deletedAt), eq(jobs.status, "open"))
      )
  );
  if (!job) notFound();

  const location = job.location ?? [job.city, job.country].filter(Boolean).join(", ");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/careers/${workspaceId}`}
        className="text-sm text-[var(--muted)] hover:underline"
      >
        &larr; All positions
      </Link>
      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {[workspace.name, location, job.salaryText].filter(Boolean).join(" · ")}
        </p>
      </header>

      {job.description ? (
        <section className="mb-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <JobDescriptionView text={job.description} />
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 text-lg font-semibold">Apply for this position</h2>
        <CareersApplyForm workspaceId={workspaceId} jobId={jobId} />
      </section>

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        Powered by Emerge CRM
      </footer>
    </main>
  );
}
