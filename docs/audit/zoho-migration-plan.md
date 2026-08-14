# Zoho -> Emerge Migration Plan

Goal: move the whole agency (19 users, 85 clients, 12 contacts, 1,287 candidates,
101 jobs, 756 applications, 200+ notes, CV attachments) into Emerge with every
relationship intact, re-runnably, without freezing the team's work for days.
This is milestone M8; the design is fixed now so earlier milestones stay compatible.

## Strategy: API-based, idempotent, delta-capable (NOT a one-shot CSV)

1. **Source**: Zoho Recruit REST API v2 (we already have working API access via the
   connected MCP; the importer uses the same OAuth scopes server-side).
2. **External-id mapping**: every imported row writes into `external_refs`
   (entity_type, source='zoho', external_id, internal_id, unique on
   source+external_id). Re-running an import upserts instead of duplicating, and
   every relationship is reconnected by looking up the parent's external id.
3. **Order of import** (parents before children):
   users (mapping table, see below) -> clients -> contacts -> candidates
   (+ education/experience sub-grids) -> jobs -> applications (+ status mapping)
   -> notes -> attachments (CV files) -> record timelines (best effort).
4. **Delta mode**: after the first bulk run, re-run with Modified_Time >= last run
   to pick up changes while the team still works in Zoho. Final cutover = short
   freeze (hours, not days): last delta, verify counts, switch.
5. **Verification report**: per entity - source count, imported, skipped
   (with reasons), duplicates merged, orphans. The run is not "done" until source
   and target counts reconcile or every gap is explained.

## Entity mapping

| Zoho                                            | Emerge                                     | Key notes                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users (19 active)                               | users + memberships                        | Match by email. Account managers and sourcers must exist BEFORE data import so owner FKs bind. Users who never log in still get member rows (deactivated ok); merge duplicate/deleted Zoho user records to one person                                                                                                                                                                    |
| Clients                                         | companies                                  | Client_Name -> name; Account_Manager -> owner (via user map); About -> description; Website -> website+domain; Industry -> industry; Contact_Number -> phone; Parent_Account noted in custom_fields                                                                                                                                                                                      |
| Contacts                                        | contacts                                   | First/Last -> names; Email/Secondary; Work_Phone/Mobile; Job_Title -> title; Client_Name -> company (external ref); Contact_Owner -> owner; Is_primary_contact -> isPrimary; LinkedIn                                                                                                                                                                                                    |
| Candidates                                      | candidates                                 | Email lowercased = dedupe key (merge policy below); Source picklist -> source enum (Imported by parser -> parser, Added by User -> manual, else import); Candidate_Owner -> owner; Skill_Set, employer, title, experience, salaries, address, links map 1:1; Candidate_ID (ZR_n_CAND) kept as display legacy id in custom_fields                                                         |
| Candidate Educational/Experience_Details        | candidate_education / candidate_experience | Tabular sub-grids fetched per record (detail API); rows map 1:1                                                                                                                                                                                                                                                                                                                          |
| Job_Openings                                    | jobs                                       | Client_Name -> company (required; import fails loudly if missing); Contact_Name -> contact; Account_Manager -> owner; status map: In-progress -> open, On-Hold -> on_hold, Filled -> filled, Cancelled/Declined -> cancelled, Inactive -> inactive, Waiting for approval -> open + note; Job_Description rich text sanitized; Salary free text preserved; city/country, positions, dates |
| Applications                                    | applications                               | Candidate + Job via external refs (unique pair); Application_Status (30) -> our status dictionary + stage via mapping table (below); Application_Owner -> owner; Rating; Date_Hired; Created_Time preserved as appliedAt                                                                                                                                                                 |
| Notes                                           | notes                                      | Parent module+id -> entity_type+entity_id via external refs; author mapped; @mention markup converted to our mention format where the user maps, else kept as text; timestamps preserved                                                                                                                                                                                                 |
| Attachments (CVs)                               | attachments                                | Zoho attachments API per record -> MinIO; kind=cv for resume category; size/mime kept. Feasible via API; rate-limited, so this is the slowest phase - run as background queue with resume                                                                                                                                                                                                |
| Record timelines                                | application_status_history / activities    | Best effort: Zoho timeline API gives status-change events with actor+time; import what exists so time-in-stage analytics start with history. Where timeline is sparse, seed history with a single "imported at status X" event                                                                                                                                                           |
| Tags                                            | -                                          | Nothing to migrate (0 tags)                                                                                                                                                                                                                                                                                                                                                              |
| Custom fields                                   | -                                          | Nothing to migrate (0 custom fields)                                                                                                                                                                                                                                                                                                                                                     |
| Interviews/Submissions/Reviews/To_Dos/Campaigns | -                                          | Nothing to migrate (all 0 records)                                                                                                                                                                                                                                                                                                                                                       |

## Application status mapping (Zoho -> Emerge stage/status)

- Associated, Applied -> screening/associated; In Review -> screening/in_review;
  Qualified -> screening/qualified; Unqualified, Junk candidate -> rejected/unqualified
- Submitted to client -> submitted/submitted_to_client; Approved by client ->
  submitted/approved_by_client; Rejected by client -> rejected/rejected_by_client
- Interview to be scheduled / Interview-Scheduled / Interview in progress /
  Hired-for-Interview -> interview/(same, slugged); Rejected for interview ->
  rejected/rejected_for_interview
- Offer planned / made / accepted / declined / withdrawn -> offered/(same);
  On hold -> screening/on_hold
- Hired, Joined, Converted - Employee/Temp, Hired by client,
  Forward-to-Onboarding -> hired/(same); No show -> rejected/no_show;
  Rejected, Rejected hirable -> rejected/(same); Archived -> archived/archived

Unmapped/unknown values (future-proofing): import as archived/imported_unknown
with original value preserved in custom_fields; listed in the verification report.

## Duplicate policy

- Candidates: match by lowercased email. Same email twice in Zoho is impossible
  (unique there); a Zoho candidate matching an already-created Emerge candidate
  merges (Zoho wins for empty fields, Emerge wins for conflicts, report lists all).
  No-email candidates (~30%) import as-is; optional name+phone fuzzy report only.
- Companies: match by normalized domain, else exact name (we already saw
  "Porsche Consulting" twice and "Maschinenfabrik Reinhause(n)" spelled two ways -
  the report flags these for one-click merge, never auto-merges names).
- Contacts: match by email.

## Migration risks

1. **Zoho API rate limits** (credits/day, per-minute): bulk read of 1,287
   candidates + sub-grids + attachments needs batching, backoff, and resumable
   queue state. Mitigation: delta design, per-entity checkpoints, run over a day.
2. **Attachment access**: attachment download endpoints have separate scopes;
   validate scope coverage in a dry run BEFORE cutover day. Fallback: Zoho bulk
   export archive for files.
3. **User mapping gaps**: records owned by deleted/disabled Zoho users (Raza old
   record, hazel, philippines pod account) - map to their active successor or a
   designated fallback owner; report lists every fallback assignment.
4. **Data quality**: duplicate clients, free-text salaries, 30% candidates without
   email. Import preserves as-is + flags; cleanup is a post-migration task inside
   Emerge (merge tools, M8/M9), not a blocker.
5. **Team cutover**: people keep working in Zoho during the bulk run. Delta re-runs
   close the gap; the final freeze is announced and short. Rollback = keep Zoho
   read-only for a quarter; Emerge import is non-destructive to Zoho.
6. **Rich text/JD fidelity**: Zoho HTML sanitized on import; spot-check top 20 jobs.

## Technical risks (product-wide, flagged early)

1. Resume parser quality (M7) defines intake UX; we evaluate parser options
   (self-hosted vs API) against the team's real CV mix (DACH PDFs, EU CVs) before
   committing. Contract: parser outputs our candidate + education/experience shape.
2. Search performance at 10k+ candidates: covered by seeded perf tests (M2's 10k
   seed script pattern extends to candidates in M3, search in M9).
3. Status dictionary flexibility vs analytics: configurable statuses must still
   map to fixed stages, or funnels break. The stage set is fixed; statuses are
   workspace-editable within a stage.
4. RLS discipline: every new tenant table ships RLS in its creation migration
   (established M1 pattern; enforced in review checklist).
5. MinIO/attachment storage sizing for ~1,300 CVs now, growing daily; lifecycle
   rules and backup policy land with M7.
