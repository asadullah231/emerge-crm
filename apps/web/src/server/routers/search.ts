import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { candidates, companies, contacts, jobs, users } from "@emerge/db";
import { wordSearch } from "../list-query";
import { router, workspaceProcedure } from "../trpc";

export type SearchHit = {
  type: "candidate" | "company" | "contact" | "job";
  id: string;
  humanId: string | null;
  label: string;
  sublabel: string | null;
  href: string;
};

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

/**
 * Global command-palette search across the core objects. Each object type is
 * queried in parallel with a small cap; results are normalized to a flat list
 * the client renders grouped. Workspace-scoped via the RLS tx. Matching is
 * word-wise (shared wordSearch), so full names and multi-word queries work.
 */
export const searchRouter = router({
  global: workspaceProcedure
    .input(
      z.object({
        q: z.string().trim().min(1).max(100),
        perType: z.number().int().min(1).max(8).default(5)
      })
    )
    .query(async ({ ctx, input }): Promise<SearchHit[]> => {
      const [cands, comps, conts, jobRows] = await Promise.all([
        ctx.tx
          .select({
            id: candidates.id,
            humanId: candidates.humanId,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            title: candidates.title,
            email: candidates.email
          })
          .from(candidates)
          .where(
            and(
              isNull(candidates.deletedAt),
              wordSearch(input.q, [
                candidates.firstName,
                candidates.lastName,
                candidates.email,
                candidates.title,
                candidates.currentEmployer,
                candidates.humanId,
                candidates.skills,
                candidates.phone,
                candidates.mobile,
                candidates.city,
                candidates.country
              ])
            )
          )
          .limit(input.perType),
        ctx.tx
          .select({
            id: companies.id,
            name: companies.name,
            industry: companies.industry,
            location: companies.location
          })
          .from(companies)
          .where(
            and(
              isNull(companies.deletedAt),
              wordSearch(input.q, [
                companies.name,
                companies.domain,
                companies.industry,
                companies.location,
                companies.phone
              ])
            )
          )
          .limit(input.perType),
        ctx.tx
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            title: contacts.title,
            email: contacts.email
          })
          .from(contacts)
          .leftJoin(companies, eq(companies.id, contacts.companyId))
          .where(
            and(
              isNull(contacts.deletedAt),
              wordSearch(input.q, [
                contacts.firstName,
                contacts.lastName,
                contacts.email,
                contacts.title,
                contacts.workPhone,
                contacts.mobile,
                companies.name
              ])
            )
          )
          .limit(input.perType),
        ctx.tx
          .select({
            id: jobs.id,
            humanId: jobs.humanId,
            title: jobs.title,
            location: jobs.location,
            companyName: companies.name
          })
          .from(jobs)
          .leftJoin(companies, eq(companies.id, jobs.companyId))
          .leftJoin(users, eq(users.id, jobs.ownerId))
          .where(
            and(
              isNull(jobs.deletedAt),
              wordSearch(input.q, [
                jobs.title,
                jobs.humanId,
                jobs.location,
                jobs.city,
                jobs.country,
                jobs.description,
                jobs.clientCallSummary,
                jobs.requiredSkills,
                jobs.industry,
                companies.name,
                users.name
              ])
            )
          )
          .limit(input.perType)
      ]);

      const hits: SearchHit[] = [];
      for (const c of cands)
        hits.push({
          type: "candidate",
          id: c.id,
          humanId: c.humanId,
          label: fullName(c.firstName, c.lastName) || c.humanId,
          sublabel: c.title ?? c.email,
          href: `/candidates/${c.id}`
        });
      for (const j of jobRows)
        hits.push({
          type: "job",
          id: j.id,
          humanId: j.humanId,
          label: j.title,
          sublabel: j.companyName ?? j.location,
          href: `/jobs/${j.id}`
        });
      for (const co of comps)
        hits.push({
          type: "company",
          id: co.id,
          humanId: null,
          label: co.name,
          sublabel: co.industry ?? co.location,
          href: `/companies/${co.id}`
        });
      for (const ct of conts)
        hits.push({
          type: "contact",
          id: ct.id,
          humanId: null,
          label: fullName(ct.firstName, ct.lastName) || ct.email || "Contact",
          sublabel: ct.title ?? ct.email,
          href: `/contacts/${ct.id}`
        });
      return hits;
    })
});
