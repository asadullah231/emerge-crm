# Milestone 9 - Career Portal & Public Apply

- Version on completion: **v0.10.0**
- Status: Not started
- Complexity: **M**

## Objective

A public, SEO-friendly, branded job board per workspace with an apply flow that feeds
parsed applications straight into the pipeline and triage inbox.

## User value

Agencies stop paying for a separate careers site; applicants get a clean, fast,
mobile-friendly apply experience; recruiters get parsed candidates, not email attachments.

## Features included

- Public portal at `/careers/{workspace-slug}` (custom domain support documented for
  reverse proxy; first-class custom domains post-1.0): job list with search/filter
  (location, type), job detail (SSR, OpenGraph, JSON-LD JobPosting for Google Jobs)
- Portal branding settings: logo, brand color, intro text, social links
- Publish flow on jobs: `publish_to_portal` toggle + public description (separate from
  internal notes), published-at date
- Apply flow: name, email, phone, CV upload, optional questions per job (v1: 3 fixed
  optional fields: cover note, LinkedIn, salary expectation), **GDPR consent checkbox
  (required, configurable text)**
- Intake pipeline: application -> candidate created-or-matched (email) -> CV parsed (M7)
  -> Application in "Applied" stage -> triage inbox + notification
- Anti-abuse: rate limiting per IP, honeypot field, disposable-email flag (list-based)
- Indeed XML feed v1 (organic listing) at a stable URL

## Database changes

`portal_settings`; jobs gain `public_description`, `published_at`, slug; applications
gain applicant-supplied answers JSONB; candidates: consent fields now populated.

## Backend changes

Public routes (no session), intake service (dedupe + parse + stage + notify), feed
generator, rate limiter (Redis).

## Frontend changes

Portal pages (SSR route group, no app chrome, Lighthouse >= 90 mobile), branding
settings UI, publish controls on job page.

## API changes

Public endpoints per [api.md](../api.md): job list/detail/apply. Internal `portal` router.

## Dependencies

M4 (jobs), M5 (applications), M7 (parsing on intake).

## Acceptance criteria

1. Publishing a job makes it live on the portal within 60s; unpublishing removes it.
2. Apply with CV creates matched-or-new candidate with parsed profile, application in
   Applied, triage entry, and consent recorded with timestamp + text version.
3. Duplicate applicant (same email, same job) is deduped into the existing application
   with a timeline note, not a second application.
4. Job detail passes Google Rich Results test for JobPosting; portal Lighthouse mobile
   score >= 90 on the seeded demo.
5. Rate limit blocks a 100-requests/minute apply flood; honeypot submissions are
   silently dropped and logged.
6. Indeed feed validates against Indeed's XML schema for the seeded jobs.

## Testing requirements

- Integration: intake dedupe matrix (new/existing candidate x new/existing application),
  consent persistence, rate limiter, feed XML validation.
- Playwright: publish -> public apply -> appears in triage, end to end.

## Definition of Done

Standard checklist + tag `v0.10.0` + release "Milestone 9 - Career Portal".

## Estimated complexity

M.

## Explicitly OUT of scope

- Candidate accounts/status tracking (M16), custom application forms builder (post-1.0),
  multi-board multiposting network (post-1.0), first-class custom domains + SSL
  automation (post-1.0), CAPTCHA integrations

## Issue breakdown

1. M9-01 Portal pages + SSR + SEO/JSON-LD
2. M9-02 Branding settings + publish flow
3. M9-03 Apply + intake pipeline + consent
4. M9-04 Anti-abuse (rate limit, honeypot)
5. M9-05 Indeed XML feed
6. M9-06 Tests + Lighthouse budget in CI
