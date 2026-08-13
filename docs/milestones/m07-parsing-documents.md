# Milestone 7 - Resume Parsing & Document Management

- Version on completion: **v0.8.0**
- Status: Not started
- Complexity: **L**

## Objective

Turn uploaded CVs into structured candidate data automatically, and finish document
management (versions, preview). This is where the product first clearly beats OpenCATS.

## User value

Drop a CV, get a filled candidate profile: no retyping. The CV inbox becomes a pipeline
feeder instead of a folder.

## Features included

- Parsing pipeline (worker queue): PDF/DOCX text extraction -> LLM-based structured
  extraction (name, contact, links, work history, education, skills, languages) ->
  confidence-scored `parsed_profiles` record
- Provider abstraction for extraction: local heuristic fallback (regex/sectionizer, no
  external calls: the self-host default) + optional LLM provider (Anthropic API key in
  workspace settings) for high-quality parsing. Self-hosters choose their posture.
- Create-from-CV: upload one or many CVs -> parsed preview -> confirm/merge into new or
  existing candidates (match by email); bulk "CV inbox" processing
- Profile enrichment on existing candidates: parse attached CV, show field-level diff,
  apply selected fields (never silently overwrite)
- Document management completion: versions (new CV replaces, history kept), in-app PDF
  preview, DOCX -> PDF preview conversion (worker), per-document download audit
- Work history + education become structured sub-records on the candidate (replacing
  M3's free-text placeholders), rendered as a profile section

## Database changes

`parsed_profiles`, `candidate_experiences`, `candidate_educations`; `documents` gains
version chain + preview key.

## Backend changes

Parsing worker (queue, retries, poison handling), extraction provider interface, diff/
merge service, DOCX->PDF conversion job (libreoffice container or pure-JS; decide via ADR
if container added).

## Frontend changes

CV-inbox screen (upload many, watch statuses, open parsed preview), parse-preview diff
UI, structured experience/education editors, PDF preview panel on record page.

## API changes

Routers `parsing`, extended `documents`.

## Dependencies

M3 (candidates + documents); M6 (parse events into timeline).

## Acceptance criteria

1. A typical PDF CV parses to a profile preview in under 30s (LLM path) with name,
   email, phone, and at least the two most recent roles captured.
2. Local fallback path produces at minimum contact info + raw sectioned text with no
   external network calls (verified offline).
3. Bulk upload of 20 CVs processes without loss; failures are visible with retry.
4. Enrichment diff never overwrites a manually edited field without explicit selection.
5. Document versioning keeps history; preview renders PDF and DOCX in-app.
6. Parsing failures (scanned image PDF, password PDF) fail gracefully with clear status.

## Testing requirements

- Integration: extraction interface with fixture CVs (varied formats), merge rules,
  version chain. Golden-file tests for the local parser.
- Playwright: CV inbox happy path; enrichment diff apply.

## Definition of Done

Standard checklist + tag `v0.8.0` + release "Milestone 7 - Resume Parsing & Documents".

## Estimated complexity

L. Parsing quality is a long tail; scope is capped by the acceptance criteria, with
quality iteration continuing in later milestones.

## Explicitly OUT of scope

- OCR for scanned/image CVs (post-1.0), formatted/branded CV generation (M11), embedding
  generation for matching (M13), resume inbox via email (M12 integration point)

## Issue breakdown

1. M7-01 Parsing worker + provider interface + local fallback
2. M7-02 LLM extraction provider + settings
3. M7-03 Create-from-CV + CV inbox UI
4. M7-04 Enrichment diff/merge
5. M7-05 Structured experience/education
6. M7-06 Document versions + previews
7. M7-07 Fixture suite + tests
