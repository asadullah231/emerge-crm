# Milestone 12 - Email Integration

- Version on completion: **v0.13.0**
- Status: Not started
- Complexity: **XL** (hardest subsystem in the product; isolate as its own worker module)

## Objective

Two-way email: connect Gmail/Microsoft 365 mailboxes, auto-associate conversations to
candidates/contacts, send from the app with templates: recruiting runs on email, so the
ATS must see it.

## User value

The candidate's record shows the whole conversation regardless of who on the team sent
it; recruiters send templated, personalized email without leaving the record.

## Features included

- Mailbox connections per user: Gmail (OAuth, history.list cursor + Pub/Sub push where
  configured, polling fallback) and Microsoft 365 (Graph delta + subscriptions);
  connect/disconnect; per-user privacy controls (sync from date, excluded domains,
  per-thread "don't log")
- Association engine: match messages to candidates/contacts by address; thread by
  Message-ID/References; unmatched mail stays invisible (privacy default: only mail
  matching a known record is stored)
- Email on timelines: threads render on candidate/contact/application timelines;
  application association when the candidate is active on exactly one job (else picker)
- Compose in-app: send-as connected mailbox via provider API, rich text, attachments
  (documents picker: send a CV), reply within thread; sent mail logged
- Templates: workspace templates with variables ({{candidate.first_name}},
  {{job.title}}, {{sender.name}}...), preview with real data; personal templates
- Bulk email v1: select up to 50 candidates -> template -> per-recipient send with
  rate limiting (sequences with steps/delays are M14)
- Email events into the bus: email.received / email.sent (M14 consumes for
  auto-unenroll); open tracking OFF by default (GDPR posture), per-workspace opt-in
  pixel

## Database changes

`email_accounts`, `email_threads`, `email_messages` (body storage in S3, metadata in
DB), `email_templates`, association join tables.

## Backend changes

Sync worker per provider (cursor persistence, backoff, dedupe), association service,
send service (provider APIs + SMTP fallback for system mail), template renderer
(sandboxed, no arbitrary code).

## Frontend changes

Connection settings + privacy controls, thread view on timelines, composer (reuses rich
text), template manager, bulk send flow with progress.

## API changes

Routers `email`, `emailTemplates`.

## Dependencies

M6 (timeline/events); M2/M3 (records to associate).

## Acceptance criteria

1. Both providers sync new mail within 2 min (push) / 5 min (poll); cursor survives
   worker restart without duplicates (dedupe by provider message id).
2. A conversation with a candidate appears on their timeline for all workspace members
   unless marked private; excluded-domain mail never stored (verified).
3. Compose sends via the user's real mailbox (appears in their Sent folder), threads
   correctly on the recipient side, logs to the timeline.
4. Template variables render correctly incl. fallbacks for missing values; preview
   matches sent output.
5. Bulk send to 50 respects provider rate limits, reports per-recipient status, and
   creates timeline entries.
6. Disconnecting a mailbox stops sync immediately and (user choice) retains or purges
   its synced history.

## Testing requirements

- Integration: provider adapters against recorded fixtures + live-sandbox smoke suite
  (manual CI job); association matrix; dedupe/replay; template rendering golden tests.
- Playwright: connect (mocked) -> thread on record -> reply -> bulk send.

## Definition of Done

Standard checklist + tag `v0.13.0` + release "Milestone 12 - Email".

## Estimated complexity

XL. Sync correctness (cursors, dedupe, privacy) is the risk center of the whole product;
budget accordingly and keep the module boundary hard.

## Explicitly OUT of scope

- Sequences/cadences (M14), shared team inbox, IMAP generic provider (post-1.0),
  email-to-parse resume inbox (post-1.0), open/click analytics beyond the opt-in pixel

## Issue breakdown

1. M12-01 Schema + S3 body storage + privacy model
2. M12-02 Gmail sync adapter
3. M12-03 Microsoft Graph sync adapter
4. M12-04 Association engine + timeline rendering
5. M12-05 Send service + composer + threading
6. M12-06 Templates + renderer
7. M12-07 Bulk send + rate limiting
8. M12-08 Fixture + sandbox test suites
