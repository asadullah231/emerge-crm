"use client";

import { useState } from "react";
import { FormError } from "@/components/form";
import {
  ReportCard,
  ReportWindowPicker,
  ReportsTabs,
  fmtDate,
  pct,
  useReportWindow
} from "@/components/reports-shared";
import { trpc } from "@/lib/trpc/client";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="text-xs text-[var(--muted)]">{detail}</p> : null}
    </div>
  );
}

export default function ManagementReportPage() {
  const reportWindow = useReportWindow();
  const { from, to } = reportWindow;
  const [consultantId, setConsultantId] = useState("");
  const [clientId, setClientId] = useState("");

  const overview = trpc.managementReports.overview.useQuery({
    from,
    to,
    consultantId: consultantId || undefined,
    clientId: clientId || undefined
  });

  const data = overview.data;
  const days = (v: number | null) => (v === null ? "-" : `${v}d`);

  return (
    <div className="space-y-4">
      <ReportsTabs />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Management report</h1>
          <p className="text-sm text-[var(--muted)]">
            {fmtDate(from)} - {fmtDate(to)} - conversion follows the candidates submitted in this
            window
          </p>
        </div>
        <ReportWindowPicker window={reportWindow} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={consultantId}
          onChange={(e) => setConsultantId(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
        >
          <option value="">All consultants</option>
          {(data?.filters.members ?? []).map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
        >
          <option value="">All clients</option>
          {(data?.filters.clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <FormError message={overview.error?.message} />
      {overview.isLoading ? <p className="text-sm text-[var(--muted)]">Loading report...</p> : null}

      {data ? (
        <>
          <ReportCard title="Activity in this window">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Submissions" value={String(data.counts.submissions)} />
              <Stat label="Interviews" value={String(data.counts.interviews)} />
              <Stat label="Offers" value={String(data.counts.offers)} />
              <Stat label="Placements" value={String(data.counts.placements)} />
            </div>
          </ReportCard>

          <ReportCard title="Conversion">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Submission to interview"
                value={pct(
                  data.conversion.submissionToInterview.reached,
                  data.conversion.submissionToInterview.cohort
                )}
                detail={`${data.conversion.submissionToInterview.reached} of ${data.conversion.submissionToInterview.cohort} submitted`}
              />
              <Stat
                label="Interview to offer"
                value={pct(
                  data.conversion.interviewToOffer.reached,
                  data.conversion.interviewToOffer.cohort
                )}
                detail={`${data.conversion.interviewToOffer.reached} of ${data.conversion.interviewToOffer.cohort} interviewed`}
              />
              <Stat
                label="Offer to acceptance"
                value={pct(
                  data.conversion.offerToAcceptance.reached,
                  data.conversion.offerToAcceptance.cohort
                )}
                detail={`${data.conversion.offerToAcceptance.reached} of ${data.conversion.offerToAcceptance.cohort} offered`}
              />
              <Stat
                label="Fill rate"
                value={pct(data.conversion.fillRate.filled, data.conversion.fillRate.decided)}
                detail={`${data.conversion.fillRate.filled} filled of ${data.conversion.fillRate.decided} closed`}
              />
            </div>
          </ReportCard>

          <ReportCard title="Speed">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                label="Opening to first submission"
                value={days(data.time.openingToFirstSubmission)}
                detail={`from ${data.time.openingToFirstSubmissionSample} job${data.time.openingToFirstSubmissionSample === 1 ? "" : "s"}`}
              />
              <Stat
                label="Time to fill"
                value={days(data.time.timeToFill)}
                detail={`from ${data.time.timeToFillSample} filled job${data.time.timeToFillSample === 1 ? "" : "s"}`}
              />
              <Stat
                label="Client feedback time"
                value={days(data.time.clientFeedback)}
                detail={`${data.time.clientFeedbackSample} answered, ${data.time.awaitingFeedback} still waiting`}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Client feedback time measures the first stage change after a submission - an interview
              booked or a rejection both count as the client responding.
            </p>
          </ReportCard>
        </>
      ) : null}
    </div>
  );
}
