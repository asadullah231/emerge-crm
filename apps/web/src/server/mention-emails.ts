/**
 * Fan out one email per @mentioned member on note create/update (M16). Runs
 * after the M6 fan-out (bell notifications) has picked the valid recipients —
 * we look up their email + name, resolve the entity's display label + deep
 * link, and enqueue the branded mention email via the existing email worker
 * queue. A queue outage must never fail the enclosing note mutation, so the
 * caller wraps this in try/catch.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  applications,
  candidates,
  companies,
  contacts,
  jobs,
  users,
  type Transaction
} from "@emerge/db";
import { enqueueEmail } from "./email";
import type { NotableEntityType } from "@/lib/notes";

const ENTITY_KIND: Record<NotableEntityType, string> = {
  candidate: "Candidate",
  job: "Job Opening",
  company: "Client",
  contact: "Contact",
  application: "Application"
};

const ENTITY_PATH: Record<NotableEntityType, string> = {
  candidate: "/candidates",
  job: "/jobs",
  company: "/companies",
  contact: "/contacts",
  application: "/applications"
};

function fullName(first: string | null | undefined, last: string | null | undefined): string {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || "(no name)";
}

/**
 * Resolve the human display label for a mention email header ("Candidate:
 * Jane Doe (CAND-0123)"). Returns null if the record was deleted between the
 * note write and this lookup.
 */
async function resolveEntityLabel(
  tx: Transaction,
  entityType: NotableEntityType,
  entityId: string
): Promise<string | null> {
  switch (entityType) {
    case "candidate": {
      const [row] = await tx
        .select({
          humanId: candidates.humanId,
          firstName: candidates.firstName,
          lastName: candidates.lastName
        })
        .from(candidates)
        .where(and(eq(candidates.id, entityId), isNull(candidates.deletedAt)));
      return row ? `${fullName(row.firstName, row.lastName)} (${row.humanId})` : null;
    }
    case "job": {
      const [row] = await tx
        .select({ humanId: jobs.humanId, title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.id, entityId), isNull(jobs.deletedAt)));
      return row ? `${row.title} (${row.humanId})` : null;
    }
    case "company": {
      const [row] = await tx
        .select({ name: companies.name })
        .from(companies)
        .where(and(eq(companies.id, entityId), isNull(companies.deletedAt)));
      return row?.name ?? null;
    }
    case "contact": {
      const [row] = await tx
        .select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.id, entityId), isNull(contacts.deletedAt)));
      return row ? fullName(row.firstName, row.lastName) : null;
    }
    case "application": {
      const [row] = await tx
        .select({
          humanId: applications.humanId,
          candidateFirst: candidates.firstName,
          candidateLast: candidates.lastName,
          jobTitle: jobs.title
        })
        .from(applications)
        .leftJoin(candidates, eq(candidates.id, applications.candidateId))
        .leftJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(applications.id, entityId), isNull(applications.deletedAt)));
      return row
        ? `${fullName(row.candidateFirst, row.candidateLast)} on ${row.jobTitle ?? "(job)"} (${row.humanId})`
        : null;
    }
  }
}

export async function sendMentionEmails(
  tx: Transaction,
  opts: {
    authorName: string;
    entityType: NotableEntityType;
    entityId: string;
    noteBody: string;
    recipientIds: string[];
  }
): Promise<void> {
  if (opts.recipientIds.length === 0) return;
  const [recipients, entityLabel] = await Promise.all([
    tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, opts.recipientIds)),
    resolveEntityLabel(tx, opts.entityType, opts.entityId)
  ]);
  if (!entityLabel || recipients.length === 0) return;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const entityUrl = `${base}${ENTITY_PATH[opts.entityType]}/${opts.entityId}`;
  const entityKind = ENTITY_KIND[opts.entityType];

  for (const r of recipients) {
    await enqueueEmail({
      type: "mention",
      to: r.email,
      authorName: opts.authorName,
      entityLabel,
      entityKind,
      entityUrl,
      noteBodyPreview: opts.noteBody
    });
  }
}
