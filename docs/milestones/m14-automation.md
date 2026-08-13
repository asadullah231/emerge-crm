# Milestone 14 - Automation: Stage Rules, Sequences & Webhooks

- Version on completion: **v0.15.0**
- Status: Not started
- Complexity: **XL**

## Objective

Make the system do the busywork: lightweight per-stage automations (HubSpot's two-tier
model), multi-step outreach sequences with reply detection, and webhooks so external
tools (n8n, Zapier) can extend everything else.

## User value

"When a candidate enters Screening, send the screening email and create a call task" runs
itself. Outreach follow-ups never get forgotten. Anything we did not build can be wired
up via webhooks + n8n.

## Features included

- Stage automations (per pipeline stage, board "Automate" tab): triggers = enters stage /
  leaves stage / in stage longer than N days; actions = send email template (as owner),
  create task, notify user/role, update field, add tag; multiple rules per stage;
  enable/disable; run log
- Sequences: ordered steps (email template / manual task / delay N days), enrollment of
  candidates (from lists, views, or matches), state machine per enrollment (active /
  paused / finished / unenrolled / bounced), **auto-unenroll on reply** (consumes M12
  email.received), send-window + timezone + daily cap settings, per-step metrics
  (sent/replied/unenrolled)
- Event digests: daily/weekly email digest of notifications (closes the M6 deferral)
- Webhooks: workspace endpoints subscribed to event catalog topics, HMAC-signed
  deliveries, retries with backoff, delivery log + replay; ships with an n8n recipe doc
- Automation guardrails: all automated email clearly attributed in timeline, global
  kill-switch per workspace, loop protection (automation-triggered events cannot
  re-trigger the same rule within a window)

## Database changes

`automation_rules`, `automation_runs`, `sequences`, `sequence_steps`,
`sequence_enrollments`, `sequence_events`, `webhooks`, `webhook_deliveries`.

## Backend changes

Rule engine consuming the event bus (condition check via M8 filter AST reuse), sequence
scheduler on BullMQ delayed jobs, webhook dispatcher, digest job.

## Frontend changes

Automate tab on board stages, sequence builder (steps editor + enrollment picker +
metrics), webhook settings + delivery log, digest preferences.

## API changes

Routers `automation`, `sequences`, `webhooks`.

## Dependencies

M5 (stage events), M6 (event bus), M8 (filter AST for conditions), M12 (email send +
reply detection).

## Acceptance criteria

1. Stage rule fires within 30s of the triggering event; run log records
   trigger/actions/outcome; disabled rules never fire.
2. "In stage > N days" fires exactly once per threshold crossing (idempotency test).
3. Sequence: enrollment of 100 candidates schedules step 1 within the send window;
   a reply (fixture-injected) unenrolls within 2 min and cancels pending steps.
4. Daily cap + send window respected across timezones (time-travel tests).
5. Webhook delivery: signed payload, 3 retries with backoff on 500s, replay from log
   works; secret rotation invalidates old signatures.
6. Loop protection: a rule updating a field that would re-trigger itself is suppressed
   and surfaced in the run log.

## Testing requirements

- Integration: rule engine matrix (triggers x actions), sequence state machine incl.
  bounce/reply/pause, webhook signing + retry, loop protection.
- Playwright: build stage rule -> drag card -> observe actions; build 2-step sequence ->
  enroll -> metrics.

## Definition of Done

Standard checklist + tag `v0.15.0` + release "Milestone 14 - Automation".

## Estimated complexity

XL. The sequence scheduler + reply detection interplay and idempotency guarantees are
the hard core. Sub-branches recommended: `feature/m14-rules`, `feature/m14-sequences`,
`feature/m14-webhooks`.

## Explicitly OUT of scope

- Full visual workflow builder with branching (Zoho Blueprint class: post-1.0; n8n via
  webhooks is the interim answer), SMS/WhatsApp/LinkedIn sequence channels (post-1.0;
  step model is channel-agnostic by design), lead scoring

## Issue breakdown

1. M14-01 Rule engine + Automate tab + run log
2. M14-02 Sequence model + scheduler
3. M14-03 Reply detection + auto-unenroll
4. M14-04 Sequence builder UI + metrics
5. M14-05 Webhooks + delivery log + n8n recipe
6. M14-06 Digests + guardrails + tests
