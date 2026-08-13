# Milestone 11 - Offers & Placements

- Version on completion: **v0.12.0**
- Status: Not started
- Complexity: **M**

## Objective

Close the loop: offers with status tracking, placements with fee records, and the
agency-branded formatted CV for client submissions. The pipeline's Placed stage becomes
real revenue data.

## User value

Agencies track offers to acceptance, record every placement with its fee (the number the
business runs on), and send clients branded CVs without manual reformatting.

## Features included

- Offer records on an application: position title, salary/rate + currency, start date,
  expiry date, status chain (draft -> sent -> accepted / declined / withdrawn / expired),
  decline reason, versioning (counter-offers create v2, history kept)
- Placement records: created on offer acceptance (or manually), start date, salary,
  fee basis + calculated fee (percentage of salary or fixed), guarantee period + end
  date, status (pending start / active / completed / fell through + reason), invoice
  reference field (text; invoicing integration post-1.0)
- Moving an application to Placed now requires/creates the placement record (closes the
  M5 "pending placement" flag); Placed stage and placement stay consistent
- Formatted CV v1: workspace template (logo, brand color, contact-info redaction toggle)
  rendered from the structured profile (M7) to PDF via the worker; attach to candidate
  as document kind `formatted_cv`; download/share manually (client portal post-1.0)
- Guarantee-period watchdog: notification to owner N days before guarantee expiry;
  fell-through placements prompt a credit note task
- Revenue basics on records: company page shows placements + fees to date; placement
  list with period filter (full analytics in M15)

## Database changes

`offers` (versioned), `placements`; documents gain `formatted_cv` kind.

## Backend changes

Offer state machine, placement creation service + Placed-stage consistency guard, PDF
render job (HTML template -> PDF), guarantee watchdog job.

## Frontend changes

Offer panel on application, placement form + list, formatted-CV template settings +
generate/preview, company revenue section.

## API changes

Routers `offers`, `placements`.

## Dependencies

M5 (pipeline), M7 (structured profile for formatted CV); M10 recommended (natural flow)
but not blocking.

## Acceptance criteria

1. Offer state machine enforces legal transitions; counter-offer creates a new version
   with prior versions immutable.
2. Accepting an offer creates a placement pre-filled from the offer; application moves
   to Placed; the M5 pending flag is gone product-wide.
3. Fee calculation: percentage and fixed both correct incl. currency display; editable
   before placement is marked active.
4. Formatted CV renders the seeded candidate to a branded PDF with redaction on/off,
   in under 15s.
5. Guarantee watchdog fires the notification at the configured offset (time-travel test).
6. Fell-through placement records reason and re-opens the job's openings count.

## Testing requirements

- Integration: state machines (offer, placement), fee math golden tests, Placed
  consistency, openings count.
- Playwright: offer -> accept -> placement -> formatted CV download.

## Definition of Done

Standard checklist + tag `v0.12.0` + release "Milestone 11 - Offers & Placements".

## Estimated complexity

M.

## Explicitly OUT of scope

- E-signature (post-1.0; offers tracked, not signed in-product), invoicing/accounting
  (post-1.0), commission splits between recruiters (post-1.0), client portal delivery
  of formatted CVs (post-1.0), temp/contract pay & bill (Phase 4)

## Issue breakdown

1. M11-01 Offers model + state machine + UI
2. M11-02 Placements + Placed consistency + fees
3. M11-03 Formatted CV template + PDF job
4. M11-04 Guarantee watchdog + fell-through flow
5. M11-05 Company revenue section + tests
