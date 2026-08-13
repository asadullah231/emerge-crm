# Milestone 16 - Candidate Portal

- Version on completion: **v0.17.0**
- Status: Not started
- Complexity: **M**

## Objective

Give applicants a self-service account: application status, profile + CV updates, and
GDPR self-service: reducing "any update?" emails and strengthening the compliance story.

## User value

Candidates see where they stand and keep their own data fresh; agencies cut status-chase
admin and get a defensible GDPR posture.

## Features included

- Portal accounts (separate auth realm from workspace users): magic-link login (no
  passwords to manage) tied to candidate email; invite email sent on application or by
  recruiter action
- My applications: list with current public-facing status per application. Public
  status = a per-stage label configured by admins ("In review", "Interviewing"...),
  never the internal stage name; per-application visibility toggle
- My profile: candidate edits contact info, links, notice period, salary expectation;
  CV re-upload (creates new version + parse + recruiter notification); changes appear
  on the workspace record with "edited by candidate" attribution in timeline
- GDPR self-service: view stored data summary, download my data (JSON + documents),
  withdraw consent / request deletion -> creates a workspace task + starts a
  configurable grace timer -> hard purge (documents included) on approval/expiry
- Notifications to candidates (email): status label changed, interview scheduled
  (respects workspace settings)
- Branding: portal inherits M9 career-portal branding

## Database changes

`portal_accounts`, `portal_sessions`, `stage_public_labels`, `deletion_requests`;
candidate edits audit via existing events.

## Backend changes

Separate auth middleware/realm (portal sessions must never reach workspace APIs), data
export job, purge pipeline (cascading hard delete incl. S3 + search index + embeddings).

## Frontend changes

Portal route group (mobile-first, minimal), status list, profile editor, GDPR screens;
admin settings for public labels + portal toggles.

## API changes

Portal-scoped routers (isolated from workspace tRPC context).

## Dependencies

M9 (portal foundation + branding), M5 (applications), M7 (re-parse on CV update).

## Acceptance criteria

1. Magic-link login works; a portal session cannot call any workspace endpoint
   (negative tests prove realm isolation).
2. Candidate sees only their own applications with public labels; internal stage names
   never leak through any portal payload (API response audit test).
3. Profile edit + CV re-upload reflect on the workspace record with attribution and
   notification.
4. Data download contains profile + applications + documents; deletion request flows to
   task -> purge; post-purge, search/matching/timeline contain no trace (verified).
5. Status-change candidate emails respect the workspace toggle and per-application
   visibility.

## Testing requirements

- Integration: realm isolation matrix, purge completeness (DB + S3 + FTS + vectors),
  label mapping.
- Playwright: apply (M9) -> invite -> login -> track -> update CV -> request deletion.

## Definition of Done

Standard checklist + tag `v0.17.0` + release "Milestone 16 - Candidate Portal".

## Estimated complexity

M. Purge completeness and realm isolation are the sensitive parts.

## Explicitly OUT of scope

- Interview self-scheduling from the portal (post-1.0 with booking links), portal
  messaging/chat, document e-sign, referral portal

## Issue breakdown

1. M16-01 Portal auth realm + magic links
2. M16-02 Applications view + public labels
3. M16-03 Profile self-edit + CV re-upload
4. M16-04 GDPR export + deletion pipeline
5. M16-05 Candidate emails + settings
6. M16-06 Isolation + purge test suites
