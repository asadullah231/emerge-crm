import { notFound } from "next/navigation";
import { LogoFull } from "@/components/logo";
import { ShareVerdict } from "@/components/share-verdict";
import { loadShareByToken } from "@/server/share";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Candidate review",
  robots: { index: false, follow: false }
};

/**
 * Public, no-login client review page. Reached via a share token; shows the
 * submitted candidate(s) with their CV and an Approve / Reject control that
 * writes back to the application pipeline. Unknown or expired tokens 404.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const batch = await loadShareByToken(token);
  if (!batch) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <LogoFull />
        <span className="text-xs text-[var(--muted)]">Candidate review</span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h1 className="text-xl font-semibold">{batch.jobTitle}</h1>
        {batch.companyName ? (
          <p className="mt-0.5 text-sm text-[var(--muted)]">For {batch.companyName}</p>
        ) : null}
        {batch.note ? (
          <p className="mt-4 whitespace-pre-line rounded-md bg-[var(--background)] px-3 py-2 text-sm">
            {batch.note}
          </p>
        ) : null}

        <p className="mt-6 text-sm font-medium text-[var(--muted)]">
          {batch.candidates.length} candidate{batch.candidates.length === 1 ? "" : "s"} submitted
        </p>

        <ul className="mt-3 space-y-3">
          {batch.candidates.map((c) => (
            <li key={c.submissionId} className="rounded-lg border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.candidateName}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {[c.title, c.employer].filter(Boolean).join(" at ") || "—"}
                  </p>
                </div>
                {c.hasCv ? (
                  <a
                    href={`/api/share/${token}/cv/${c.applicationId}`}
                    className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--background)]"
                  >
                    Download CV
                  </a>
                ) : null}
              </div>
              <ShareVerdict
                token={token}
                submissionId={c.submissionId}
                initialStatus={c.status}
                initialComment={c.clientComment}
              />
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        Powered by EmergeTech - emergetech.co.uk
      </p>
    </div>
  );
}
