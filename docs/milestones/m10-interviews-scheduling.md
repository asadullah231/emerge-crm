# Milestone 10 - Interviews & Scheduling

- Version on completion: **v0.11.0**
- Status: Not started
- Complexity: **L**

## Objective

Interview records on applications, calendar sync (Google + Microsoft), and structured
feedback, so the Interview stage is managed in-product instead of in inboxes.

## User value

Recruiters schedule client and internal interviews with conflicts visible, attendees
invited automatically, and feedback captured against the application.

## Features included

- Interview records on an application: type (screen/client interview/final...), round
  number, datetime + duration, location/video link, interviewers (users + external
  client contacts), status (scheduled/completed/cancelled/no-show), notes
- Calendar connections per user: Google Calendar + Microsoft 365 OAuth; free/busy lookup
  when picking a slot; event created on the organizer's calendar with attendees (client
  contact + candidate receive standard calendar invites)
- Two-way sync of the created event: reschedule/cancel in either place reflects in both
  (scoped to events this product created; not a general calendar mirror)
- Feedback/scorecard v1: per-interviewer rating (1-5) + recommendation
  (strong yes/yes/no/strong no) + comments; visible summary on the application
- Timeline + notifications integration: scheduled/completed/cancelled events; upcoming
  interviews pinned on record timelines; My Interviews view (day/week list)
- ICS fallback: without a connected calendar, send .ics invites via SMTP

## Database changes

`calendar_connections`, `calendar_events`, `interviews`, `interview_participants`,
`interview_feedback`.

## Backend changes

OAuth flows + token refresh, provider adapters (Calendar API / Graph), sync worker
(watch channels / Graph subscriptions with renewal + polling fallback), ICS generation.

## Frontend changes

Schedule dialog with availability strip, interview cards on application/timeline,
My Interviews view, feedback form, connection settings.

## API changes

Routers `calendar`, `interviews`.

## Dependencies

M5 (applications), M6 (events/notifications); M12 not required (ICS via SMTP).

## Acceptance criteria

1. Both providers connect, disconnect, and survive token refresh (tested against real
   sandbox tenants).
2. Scheduling shows organizer free/busy; created event appears in the external calendar
   with all attendees within 60s.
3. Cancelling in the external calendar marks the interview cancelled in-product (sync
   within provider latency + 5 min polling fallback).
4. Feedback from two interviewers renders an aggregate on the application; feedback is
   immutable after submission (edit window 15 min).
5. No-calendar path: .ics invite delivered and importable into Google/Outlook.
6. All interview mutations appear on the application timeline.

## Testing requirements

- Integration: provider adapters mocked + one live-sandbox smoke suite (manually
  triggered CI job), ICS golden files, feedback immutability.
- Playwright: schedule -> feedback -> complete flow with mocked providers.

## Definition of Done

Standard checklist + tag `v0.11.0` + release "Milestone 10 - Interviews & Scheduling".

## Estimated complexity

L. OAuth + sync edge cases dominate; keep the sync scope strictly to product-created
events.

## Explicitly OUT of scope

- Candidate self-scheduling booking links (post-1.0, high priority), interview kits/
  question banks (post-1.0), video interview recording (post-1.0), panel load balancing

## Issue breakdown

1. M10-01 Calendar OAuth + connections + adapters
2. M10-02 Interview model + router + schedule dialog
3. M10-03 Sync worker (two-way, product-created events)
4. M10-04 Feedback/scorecards
5. M10-05 My Interviews + timeline integration
6. M10-06 ICS fallback + tests
