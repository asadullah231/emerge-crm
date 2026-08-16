"use client";

import Link from "next/link";
import { cn } from "@emerge/ui";
import { FormError } from "@/components/form";
import { candidateName } from "@/components/new-candidate-modal";
import {
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_STYLE,
  INTERVIEW_TYPE_LABEL
} from "@/lib/interviews";
import { trpc } from "@/lib/trpc/client";

function dayKey(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function MyInterviewsPage() {
  const list = trpc.interviews.mine.useQuery({ days: 14 });
  const rows = list.data ?? [];

  // Group by calendar day (rows already sorted by scheduledAt asc).
  const groups: { day: string; items: typeof rows }[] = [];
  for (const iv of rows) {
    const key = dayKey(new Date(iv.scheduledAt));
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(iv);
    else groups.push({ day: key, items: [iv] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">My interviews</h1>
      <p className="text-sm text-[var(--muted)]">
        Interviews you organize or attend, from yesterday onward.
      </p>
      <FormError message={list.error?.message} />

      {list.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
          No upcoming interviews. Schedule one from a candidate&apos;s application.
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h2 className="mb-2 text-sm font-semibold text-[var(--muted)]">{g.day}</h2>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)]">
                {g.items.map((iv) => (
                  <li key={iv.id}>
                    <Link
                      href={`/applications/${iv.applicationId}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--background)]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {candidateName({
                            firstName: iv.candidateFirstName,
                            lastName: iv.candidateLastName
                          })}
                          <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                            {INTERVIEW_TYPE_LABEL[iv.type] ?? iv.type} · {iv.jobTitle}
                          </span>
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {new Date(iv.scheduledAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}{" "}
                          · {iv.durationMins} min
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          INTERVIEW_STATUS_STYLE[iv.status] ?? "bg-zinc-500/10"
                        )}
                      >
                        {INTERVIEW_STATUS_LABEL[iv.status] ?? iv.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
