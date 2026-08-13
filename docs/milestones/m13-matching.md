# Milestone 13 - Candidate Matching & Semantic Search

- Version on completion: **v0.14.0**
- Status: Not started
- Complexity: **L**

## Objective

AI-powered matching both directions: best candidates for a job, best jobs for a
candidate, with explainable scores: the flagship differentiator over OpenCATS and the
answer to Zoho's Zia.

## User value

Open a job, see your own database ranked by fit before sourcing anywhere else. Open a
candidate, see which live jobs they should be submitted to.

## Features included

- Embeddings: candidate profiles (structured profile + CV text) and jobs (title +
  description + requirements) embedded via provider interface (OpenAI-compatible or
  Anthropic-adjacent embedding endpoint configurable; local model option documented for
  self-hosters), stored in pgvector, refreshed on record change (event-driven)
- Match scoring = hybrid: vector similarity + structured signals (location/remote fit,
  salary overlap, seniority, skill overlap, right-to-work), combined into a 0-100 score
  with per-factor breakdown ("why this score")
- Job page "Matches" tab: ranked candidates not yet in the pipeline, filters (min score,
  location radius, consent status), actions: add-to-job / dismiss (dismissals teach the
  ranking per-job); bulk add top-N
- Candidate page "Suggested jobs" panel: ranked open jobs, one-click add
- Semantic candidate search: natural-language query box ("senior react dev fintech
  london") over the candidate base, merged with M8 keyword results
- Nightly re-rank job for open jobs; on-demand refresh button

## Database changes

`candidate_embeddings`, `job_embeddings` (pgvector), `match_dismissals`; pgvector
extension migration.

## Backend changes

Embedding worker (batch, retry, provider interface), scoring service (SQL vector query +
structured re-rank), semantic search endpoint.

## Frontend changes

Matches tab with score breakdown popover, suggested jobs panel, semantic search box on
candidate list.

## API changes

Router `matching`; search router gains semantic mode.

## Dependencies

M7 (structured profiles), M8 (search UI + filters), M4/M5 (jobs/applications).

## Acceptance criteria

1. New/updated candidate or job re-embeds within 5 min (event path); nightly job covers
   drift.
2. Matches tab on the seeded dataset: top-10 for a seeded job contains the 3 planted
   "obvious fits" (fixture-based relevance test).
3. Every score shows its factor breakdown; changing a structured factor (e.g. location)
   visibly moves the score.
4. Dismiss removes the candidate from that job's matches permanently and logs it.
5. Semantic search returns results for zero-keyword-overlap paraphrases where FTS finds
   nothing (fixture test).
6. Fully functional with the self-host local-embedding path (no external calls),
   accuracy caveats documented.

## Testing requirements

- Integration: embedding pipeline idempotency, scoring math goldens, fixture relevance
  suite (planted fits), dismissal persistence.
- Playwright: matches tab -> breakdown -> bulk add.

## Definition of Done

Standard checklist + tag `v0.14.0` + release "Milestone 13 - Matching".

## Estimated complexity

L. Scoring quality iterates forever; the milestone caps at the fixture relevance bar
with the factor framework in place.

## Explicitly OUT of scope

- Learning-to-rank from outcomes (post-1.0), external talent-pool sourcing (Loxo-style
  data product: far post-1.0), JD generation and other generative assists (post-1.0),
  bias/adverse-impact auditing dashboard (post-1.0, before any corporate-HR push)

## Issue breakdown

1. M13-01 pgvector + embedding worker + provider interface
2. M13-02 Scoring service + breakdown
3. M13-03 Matches tab + dismissals + bulk add
4. M13-04 Suggested jobs panel
5. M13-05 Semantic search merge
6. M13-06 Relevance fixture suite
