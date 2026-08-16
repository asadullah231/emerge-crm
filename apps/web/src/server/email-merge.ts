import { eq } from "drizzle-orm";
import { applications, candidates, companies, contacts, jobs, type Transaction } from "@emerge/db";

/** Merge data + resolved recipient for one record, keyed as {{entity.field}}. */
export type MergeContext = { data: Record<string, string>; to: string | null };

const full = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ").trim();

/**
 * Build the merge-field map and default recipient for a record. Returns null
 * when the entity does not exist (or the type is unknown). Keys are namespaced
 * by entity (candidate.firstName, job.title, company.name, ...).
 */
export async function buildMergeData(
  tx: Transaction,
  entityType: string,
  entityId: string
): Promise<MergeContext | null> {
  switch (entityType) {
    case "candidate": {
      const [c] = await tx.select().from(candidates).where(eq(candidates.id, entityId));
      if (!c) return null;
      return {
        to: c.email ?? null,
        data: {
          "candidate.firstName": c.firstName ?? "",
          "candidate.lastName": c.lastName ?? "",
          "candidate.fullName": full(c.firstName, c.lastName),
          "candidate.title": c.title ?? "",
          "candidate.employer": c.currentEmployer ?? "",
          "candidate.email": c.email ?? "",
          "candidate.phone": c.phone ?? c.mobile ?? "",
          "candidate.city": c.city ?? "",
          "candidate.country": c.country ?? ""
        }
      };
    }
    case "contact": {
      const [c] = await tx.select().from(contacts).where(eq(contacts.id, entityId));
      if (!c) return null;
      return {
        to: c.email ?? null,
        data: {
          "contact.firstName": c.firstName ?? "",
          "contact.lastName": c.lastName ?? "",
          "contact.fullName": full(c.firstName, c.lastName),
          "contact.title": c.title ?? "",
          "contact.email": c.email ?? ""
        }
      };
    }
    case "company": {
      const [c] = await tx.select().from(companies).where(eq(companies.id, entityId));
      if (!c) return null;
      return { to: null, data: { "company.name": c.name } };
    }
    case "job": {
      const [row] = await tx
        .select({ title: jobs.title, companyName: companies.name })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .where(eq(jobs.id, entityId));
      if (!row) return null;
      return {
        to: null,
        data: { "job.title": row.title, "company.name": row.companyName ?? "" }
      };
    }
    case "application": {
      const [row] = await tx
        .select({
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email,
          phone: candidates.phone,
          mobile: candidates.mobile,
          title: candidates.title,
          jobTitle: jobs.title,
          companyName: companies.name
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .where(eq(applications.id, entityId));
      if (!row) return null;
      return {
        to: row.email ?? null,
        data: {
          "candidate.firstName": row.firstName ?? "",
          "candidate.lastName": row.lastName ?? "",
          "candidate.fullName": full(row.firstName, row.lastName),
          "candidate.title": row.title ?? "",
          "candidate.email": row.email ?? "",
          "candidate.phone": row.phone ?? row.mobile ?? "",
          "job.title": row.jobTitle,
          "company.name": row.companyName ?? ""
        }
      };
    }
    default:
      return null;
  }
}
