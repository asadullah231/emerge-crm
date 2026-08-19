import { TRPCError } from "@trpc/server";
import { and, eq, ilike, isNull, or, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  decryptSecret,
  expandSearchTerms,
  rankCandidates,
  type AiConfig,
  type MatchCandidateInput
} from "@emerge/ai";
import { applications, candidates, jobs, workspaceAiSettings, type Transaction } from "@emerge/db";
import { scoreCandidateForJob } from "../matching";
import { router, workspaceProcedure } from "../trpc";

/** Decrypted workspace AI config, or null when not configured (M7-AI-1). */
async function loadAiConfig(tx: Transaction, workspaceId: string): Promise<AiConfig | null> {
  const [s] = await tx
    .select()
    .from(workspaceAiSettings)
    .where(eq(workspaceAiSettings.workspaceId, workspaceId));
  if (!s?.apiKeyCiphertext || !s.apiKeyIv || !s.apiKeyTag) return null;
  return {
    provider: s.provider,
    model: s.model,
    baseUrl: s.baseUrl,
    apiKey: decryptSecret({ ciphertext: s.apiKeyCiphertext, iv: s.apiKeyIv, tag: s.apiKeyTag })
  };
}

function requireAi(cfg: AiConfig | null): AiConfig {
  if (!cfg) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure an AI provider in Settings to use AI matching"
    });
  }
  return cfg;
}

const candidateCols = {
  id: candidates.id,
  humanId: candidates.humanId,
  firstName: candidates.firstName,
  lastName: candidates.lastName,
  title: candidates.title,
  skills: candidates.skills,
  city: candidates.city,
  country: candidates.country,
  experienceYears: candidates.experienceYears
};

async function loadJob(tx: Transaction, jobId: string) {
  const [job] = await tx
    .select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      requiredSkills: jobs.requiredSkills,
      location: jobs.location,
      city: jobs.city,
      country: jobs.country
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt)));
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

/**
 * Candidate <-> job matching (M18, Zoho Zia parity). forJob/forCandidate rank
 * the whole live corpus with the lexical scorer; aiRank refines a shortlist
 * through the workspace's own LLM; semanticCandidates expands a query into
 * related terms so keyword search behaves semantically.
 */
export const matchingRouter = router({
  forJob: workspaceProcedure
    .input(
      z.object({ jobId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) })
    )
    .query(async ({ ctx, input }) => {
      const job = await loadJob(ctx.tx, input.jobId);
      const [pool, existing] = await Promise.all([
        ctx.tx.select(candidateCols).from(candidates).where(isNull(candidates.deletedAt)),
        ctx.tx
          .select({ candidateId: applications.candidateId, id: applications.id })
          .from(applications)
          .where(and(eq(applications.jobId, input.jobId), isNull(applications.deletedAt)))
      ]);
      const inPipeline = new Map(existing.map((a) => [a.candidateId, a.id]));

      const scored = pool
        .map((c) => ({ candidate: c, ...scoreCandidateForJob(job, c) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit)
        .map((s) => ({
          ...s.candidate,
          score: s.score,
          matchedSkills: s.matchedSkills.slice(0, 8),
          applicationId: inPipeline.get(s.candidate.id) ?? null
        }));
      return { job: { id: job.id, title: job.title }, matches: scored, poolSize: pool.length };
    }),

  forCandidate: workspaceProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10)
      })
    )
    .query(async ({ ctx, input }) => {
      const [cand] = await ctx.tx
        .select(candidateCols)
        .from(candidates)
        .where(and(eq(candidates.id, input.candidateId), isNull(candidates.deletedAt)));
      if (!cand) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });

      const [openJobs, existing] = await Promise.all([
        ctx.tx
          .select({
            id: jobs.id,
            humanId: jobs.humanId,
            title: jobs.title,
            description: jobs.description,
            requiredSkills: jobs.requiredSkills,
            city: jobs.city,
            country: jobs.country,
            location: jobs.location
          })
          .from(jobs)
          .where(and(isNull(jobs.deletedAt), eq(jobs.status, "open"))),
        ctx.tx
          .select({ jobId: applications.jobId, id: applications.id })
          .from(applications)
          .where(
            and(eq(applications.candidateId, input.candidateId), isNull(applications.deletedAt))
          )
      ]);
      const inPipeline = new Map(existing.map((a) => [a.jobId, a.id]));

      const scored = openJobs
        .map((j) => ({ job: j, ...scoreCandidateForJob(j, cand) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit)
        .map((s) => ({
          id: s.job.id,
          humanId: s.job.humanId,
          title: s.job.title,
          location: s.job.location,
          score: s.score,
          matchedSkills: s.matchedSkills.slice(0, 8),
          applicationId: inPipeline.get(s.job.id) ?? null
        }));
      return { matches: scored, openJobs: openJobs.length };
    }),

  /** LLM rerank of a lexical shortlist; needs the workspace AI settings. */
  aiRank: workspaceProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        candidateIds: z.array(z.string().uuid()).min(1).max(15)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cfg = requireAi(await loadAiConfig(ctx.tx, ctx.workspaceId));
      const job = await loadJob(ctx.tx, input.jobId);
      const rows = await ctx.tx
        .select(candidateCols)
        .from(candidates)
        .where(and(inArray(candidates.id, input.candidateIds), isNull(candidates.deletedAt)));
      const payload: MatchCandidateInput[] = rows.map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        title: c.title,
        skills: c.skills,
        city: c.city,
        country: c.country,
        experienceYears: c.experienceYears
      }));
      const result = await rankCandidates(
        cfg,
        {
          title: job.title,
          description: job.description,
          requiredSkills: job.requiredSkills,
          location: job.location ?? ([job.city, job.country].filter(Boolean).join(", ") || null)
        },
        payload
      );
      // Only echo ids we actually sent; the model cannot inject rows.
      const known = new Set(rows.map((r) => r.id));
      return result.rankings
        .filter((r) => known.has(r.candidateId))
        .sort((a, b) => b.score - a.score);
    }),

  /** Query expansion + OR keyword search = semantic-ish candidate search. */
  semanticCandidates: workspaceProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(100).default(30)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cfg = requireAi(await loadAiConfig(ctx.tx, ctx.workspaceId));
      const terms = await expandSearchTerms(cfg, input.query);
      const searchTerms = terms.length > 0 ? terms : [input.query];
      const like = (t: string) => `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const rows = await ctx.tx
        .select(candidateCols)
        .from(candidates)
        .where(
          and(
            isNull(candidates.deletedAt),
            or(
              ...searchTerms.flatMap((t) => [
                ilike(candidates.skills, like(t)),
                ilike(candidates.title, like(t))
              ])
            )
          )
        )
        .limit(input.limit);

      // Tag each row with the terms it matched so the UI can show why.
      const lowered = searchTerms.map((t) => t.toLowerCase());
      const matches = rows.map((c) => {
        const text = `${c.title ?? ""} ${c.skills ?? ""}`.toLowerCase();
        return { ...c, matchedTerms: lowered.filter((t) => text.includes(t)).slice(0, 6) };
      });
      return { terms: searchTerms, matches };
    })
});
