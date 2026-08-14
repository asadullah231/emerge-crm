# Zoho Recruit -> Emerge: Data Migration Map & Plan

Status: PROPOSED (awaiting approval). No production data has been imported.
Source of truth: live Zoho Recruit org (recruit.zoho.eu, org20113116180), audited
read-only via the Zoho Recruit API on 14 Aug 2026. Nothing in Zoho is modified
or deleted by any part of this plan; Zoho access is read-only throughout.

This document supersedes the counts in zoho-migration-plan.md (written 13 Aug
from the UI audit) with API-verified numbers, and adds the field-level map and
the operational design (dry-run, validation, logs, resume, rollback).

---

## 1. Live data baseline (API-verified, 14 Aug 2026)

| Zoho module                       |                                              Live count | Migrate?                                  | Emerge target                       |
| --------------------------------- | ------------------------------------------------------: | ----------------------------------------- | ----------------------------------- |
| Users                             | 28 records (19 active, 4 disabled, 4 deleted, 1 closed) | Yes (mapping table)                       | users + memberships                 |
| Clients                           |                                                      85 | Yes                                       | companies                           |
| Contacts                          |                                                      12 | Yes                                       | contacts                            |
| Candidates                        |                                                   1,296 | Yes                                       | candidates (+ education/experience) |
| Job Openings                      |                                                     101 | Yes                                       | jobs                                |
| Applications                      |                                                     762 | Yes                                       | applications (+ status history)     |
| Notes                             |                                                   1,218 | Yes                                       | notes (+ note_mentions)             |
| Attachments (CVs etc.)            |          1,293 candidates flagged Is_Attachment_Present | Yes                                       | attachments (MinIO)                 |
| Record timelines                  |                                          per-record API | Best effort                               | application_status_history          |
| Tags                              |                                         0 (all modules) | Nothing to migrate                        | -                                   |
| Custom fields                     |                           0 (all modules, API-verified) | Nothing to migrate                        | -                                   |
| Interviews                        |                                                       0 | Nothing to migrate                        | -                                   |
| To-Dos / Events / Calls           |                                               0 / 0 / 0 | Nothing to migrate                        | -                                   |
| Campaigns / Reviews / Submissions |                                               0 / 0 / 0 | Nothing to migrate                        | -                                   |
| Assessments                       |                                4 templates, 0 responses | No (definitions only; noted for post-1.0) | -                                   |

Data-quality facts that shape the plan:

- Candidates without email: **358 of 1,296 (27.6%)** - email cannot be the only
  dedupe key.
- Candidate Source values: `Imported by parser` 1,034 · `Added by User` 262.
- Applications by status (sum 762): Submitted to client 263, Associated 186,
  Rejected 167, Rejected by client 67, Archived 26, Interview to be scheduled
  15, Unqualified 9, Interview-Scheduled 9, In Review 6, Interview in progress
  6, On hold 6, Rejected for interview 1, Offer accepted 1.
- Jobs by status (sum 101): In-progress 95, Cancelled 2, Inactive 2, On-Hold 1,
  Filled 1. Every job has a Client (0 null Client_Name).
- Client duplicates: "Porsche Consulting" exists twice (both with jobs).
  Near-dupes: Maschinenfabrik Reinhause(n), Alpha FMC vs alphafmc.com, Arrow vs
  Arrow ECS. Junk test rows: "xyz", "gle", "My company".
- Contacts: 1 of 12 has no Client; 7 of 12 have no email.
- Notes by parent: Candidates 712, Applications 460, Job Openings 40, Clients 6.
  Range 16 Mar 2026 -> today (still being written). **646 notes (53%) contain
  @mention markup** in Zoho's `crm[user#<id>#<id>]crm` format.
- User identity duplicates (deleted + re-created): raza.a x2, taaseen.a x2,
  gab@ x2 (+1 hotmail), philippines.teampod x3.

## 2. Entity & relationship map (Zoho -> Emerge)

Import order (parents before children). Every arrow is reconnected via
`external_refs`, never by name matching:

```
users (mapping table, manual-reviewed)
  -> companies (Clients)            [owner = Account_Manager via user map]
    -> contacts (Contacts)          [company via Client_Name ref]
    -> jobs (Job_Openings)          [company REQUIRED via Client_Name ref,
                                     contact via Contact_Name ref,
                                     owner = Account_Manager]
  -> candidates (Candidates)        [owner = Candidate_Owner]
    -> candidate_education          [Educational_Details subform]
    -> candidate_experience         [Experience_Details subform]
      -> applications (Applications) [candidate + job refs, UNIQUE pair,
                                      owner = Application_Owner]
        -> application_status_history [timeline API, best effort]
  -> notes                          [parent module+id -> entity_type+entity_id]
    -> note_mentions + notifications? (mentions mapped; NO notification
                                       fan-out for historical notes)
  -> attachments                    [per-record attachments API -> MinIO]
```

The chain that must survive intact (benchmark case): Client "Porsche
Consulting" -> job "Consumer Goods Operations Consultant" -> 38 applications ->
each application -> one candidate -> that candidate's notes (with @mention
handoffs) and CV attachment.

## 3. Field-level map (API-verified api_names; 0 custom fields anywhere)

Legend: fields not listed are either system-computed in Zoho (counts,
Last_Activity_Time, Is_Locked, formula fields) or empty org-wide; anything
non-empty and unmapped goes into the target row's `custom_fields` jsonb under
`zoho.<api_name>` so nothing is silently dropped.

### 3.1 Clients -> companies

| Zoho api_name                                        | Emerge column                                        | Notes                                |
| ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| id                                                   | external_refs(entity='company', source='zoho')       | never stored on the row itself       |
| Client_Name                                          | name                                                 | trimmed                              |
| Account_Manager                                      | owner_id                                             | via user map                         |
| About                                                | description                                          |                                      |
| Website                                              | website (+ derived domain)                           | domain = normalized host, dedupe aid |
| Industry                                             | industry                                             |                                      |
| Contact_Number                                       | phone                                                |                                      |
| Source                                               | custom_fields.zoho.Source                            |                                      |
| Parent_Account                                       | custom_fields.zoho.Parent_Account                    | hierarchy unused; preserved as ref   |
| Billing_/Shipping_* (Street/City/State/Code/Country) | custom_fields.zoho.billing / .shipping               | address block preserved verbatim     |
| Fax                                                  | custom_fields.zoho.Fax                               |                                      |
| Created_Time / Modified_Time                         | created_at / updated_at                              | preserved, not import time           |
| Created_By / Modified_By                             | custom_fields.zoho.created_by/modified_by (user map) | audit only                           |

### 3.2 Contacts -> contacts

| Zoho api_name                                                      | Emerge column                 | Notes                                           |
| ------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------- |
| id                                                                 | external_refs                 |                                                 |
| First_Name / Last_Name                                             | first_name / last_name        | Last_Name required both sides                   |
| Email / Secondary_Email                                            | email / secondary_email       | lowercased; email nullable                      |
| Work_Phone / Mobile                                                | work_phone / mobile           |                                                 |
| Job_Title                                                          | title                         |                                                 |
| Department                                                         | custom_fields.zoho.Department |                                                 |
| Client_Name (lookup)                                               | company_id                    | via external ref; nullable (1 contact has none) |
| Contact_Owner                                                      | owner_id                      | user map                                        |
| Is_primary_contact                                                 | is_primary                    |                                                 |
| LinkedIn__s                                                        | linkedin                      | note the literal `__s` suffix                   |
| Salutation, Skype_ID, Mailing__/Other__, Fax, Twitter, Facebook__s | custom_fields.zoho.*          |                                                 |
| Created_Time / Modified_Time                                       | created_at / updated_at       |                                                 |

### 3.3 Candidates -> candidates

| Zoho api_name                                                                                                                                        | Emerge column                              | Notes                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| id                                                                                                                                                   | external_refs                              |                                                                                    |
| Candidate_ID (autonumber `ZR_n_CAND`)                                                                                                                | custom_fields.zoho.legacy_id               | display legacy id; Emerge assigns CAND-nnnn                                        |
| First_Name / Last_Name                                                                                                                               | first_name / last_name                     |                                                                                    |
| Email / Secondary_Email                                                                                                                              | email / secondary_email                    | lowercased; email is Zoho-unique but 358 are null                                  |
| Phone / Mobile                                                                                                                                       | phone / mobile                             |                                                                                    |
| Current_Job_Title                                                                                                                                    | current_title                              | picklist in Zoho, text in Emerge                                                   |
| Current_Employer                                                                                                                                     | current_employer                           |                                                                                    |
| Experience_in_Years                                                                                                                                  | experience_years                           |                                                                                    |
| Skill_Set                                                                                                                                            | skills                                     | free text (structured skills = later milestone)                                    |
| Expected_Salary / Current_Salary                                                                                                                     | expected_salary / current_salary           | currency -> numeric                                                                |
| Street/City/State/Zip_Code/Country                                                                                                                   | address block columns                      |                                                                                    |
| LinkedIn__s / Website                                                                                                                                | linkedin / website                         |                                                                                    |
| Source                                                                                                                                               | source enum                                | `Imported by parser` -> parser; `Added by User` -> manual; anything else -> import |
| Candidate_Owner                                                                                                                                      | owner_id                                   | user map                                                                           |
| Candidate_Status / Candidate_Stage                                                                                                                   | custom_fields.zoho.candidate_status/_stage | candidate-level pipeline unused by team (left at defaults); preserved, not modeled |
| Origin / Rating / Email_Opt_Out / Is_Blocked__s / Highest_Qualification_Held / Salutation / Skype_ID / Fax / Twitter / Facebook__s / Additional_Info | custom_fields.zoho.*                       | Is_Blocked feeds M17 blocklist later                                               |
| Created_Time / Modified_Time                                                                                                                         | created_at / updated_at                    |                                                                                    |

Subforms (fetched per record via the detail API):

- `Educational_Details` -> candidate_education: Institute_School -> institute,
  Major_Department -> major, Degree -> degree, Duration (monthrange) ->
  start_month + end_month, Currently_pursuing -> is_current.
- `Experience_Details` -> candidate_experience: Occupation_Title -> title,
  Company -> company, Summary -> summary, Work_Duration (monthrange) ->
  start_month + end_month, I_currently_work_here -> is_current.

### 3.4 Job_Openings -> jobs

| Zoho api_name                                                                                                                  | Emerge column                         | Notes                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------- |
| id                                                                                                                             | external_refs                         |                                                               |
| Job_Opening_ID                                                                                                                 | custom_fields.zoho.legacy_id          | Emerge assigns JOB-nnnn                                       |
| Job_Opening_Name                                                                                                               | title                                 |                                                               |
| Client_Name (lookup, required)                                                                                                 | company_id (REQUIRED)                 | via ref; import fails loudly if unresolvable (audit: 0 nulls) |
| Contact_Name (lookup)                                                                                                          | contact_id                            | nullable hiring contact                                       |
| Account_Manager                                                                                                                | owner_id                              | user map; the org's real routing field                        |
| Assigned_Recruiter (lookup->Contacts)                                                                                          | custom_fields.zoho.assigned_recruiter | rarely used; preserved as ref                                 |
| Job_Opening_Status                                                                                                             | status                                | map below                                                     |
| Job_Description (richtext)                                                                                                     | description                           | HTML sanitized (allowlist), spot-check top 20                 |
| Salary (free text)                                                                                                             | salary_text                           | preserved verbatim; structured min/max left null              |
| Job_Type                                                                                                                       | employment_type                       | picklist map                                                  |
| Remote_Job                                                                                                                     | work_mode = remote / on_site          |                                                               |
| City/State/Country/Zip_Code                                                                                                    | location fields                       |                                                               |
| Number_of_Positions                                                                                                            | positions                             |                                                               |
| Target_Date / Date_Opened / Date_Closed                                                                                        | target_date / opened_at / closed_at   |                                                               |
| Revenue_per_Position / Expected_/Actual_/Missed_Revenue                                                                        | custom_fields.zoho.revenue.*          | feeds M12 placements later                                    |
| Industry / Work_Experience / Required_Skills / Is_Hot_Job_Opening / Publish / Keep_on_Career_Site / Candidate_Submission_Limit | custom_fields.zoho.*                  |                                                               |
| Created_Time / Modified_Time                                                                                                   | created_at / updated_at               |                                                               |

Job status map: `In-progress` -> open · `On-Hold` -> on_hold · `Filled` ->
filled · `Cancelled`/`Declined` -> cancelled · `Inactive` -> inactive ·
`Waiting for approval` -> open (+ import note). Observed live: only
In-progress/Cancelled/Inactive/On-Hold/Filled.

### 3.5 Applications -> applications

| Zoho api_name                      | Emerge column                 | Notes                                                                                                                                                                |
| ---------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                                 | external_refs                 |                                                                                                                                                                      |
| Application_ID (`ZR_n_APP`)        | custom_fields.zoho.legacy_id  | Emerge assigns APP-nnnn                                                                                                                                              |
| (candidate ref)                    | candidate_id                  | Zoho Applications carry denormalized candidate fields; the parent candidate id is resolved via the record's candidate association (Parent/lookup), then external ref |
| Job_Opening_Name + Job_Opening_ID  | job_id                        | resolved via external ref                                                                                                                                            |
| Application_Status                 | status_key (dictionary)       | exact map below                                                                                                                                                      |
| Hiring_Pipeline (7 colored stages) | stage                         | consistency-checked against status map; status map wins, mismatches reported                                                                                         |
| Application_Owner                  | owner_id                      | sourcer; user map                                                                                                                                                    |
| Application_Source                 | source                        |                                                                                                                                                                      |
| Rating                             | rating                        |                                                                                                                                                                      |
| Date_Hired                         | custom_fields.zoho.date_hired |                                                                                                                                                                      |
| Created_Time                       | applied_at + created_at       | preserved                                                                                                                                                            |
| Modified_Time                      | updated_at                    |                                                                                                                                                                      |

UNIQUE (candidate_id, job_id) is enforced in Emerge. If Zoho ever yields the
same pair twice, the second is skipped + reported (expected: 0 cases).

### 3.6 Application status map (all 30 defined; 13 observed live)

Emerge stage/status <- Zoho `Application_Status` actual_value:

| Zoho actual_value                     | Emerge stage / status_key             | Live count |
| ------------------------------------- | ------------------------------------- | ---------: |
| Associated                            | screening / associated                |        186 |
| Applied                               | screening / applied                   |          0 |
| In Review                             | screening / in_review                 |          6 |
| Qualified                             | screening / qualified                 |          0 |
| On-Hold                               | screening / on_hold                   |          6 |
| Submitted-to-client                   | submitted / submitted_to_client       |        263 |
| Approved by client                    | submitted / approved_by_client        |          0 |
| Interview-to-be-Scheduled             | interview / interview_to_be_scheduled |         15 |
| Interview-Scheduled                   | interview / interview_scheduled       |          9 |
| Interview-in-Progress                 | interview / interview_in_progress     |          6 |
| Hired-for-Interview                   | interview / hired_for_interview       |          0 |
| To-be-Offered (label "Offer planned") | offered / offer_planned               |          0 |
| Offer-Made                            | offered / offer_made                  |          0 |
| Offer-Accepted                        | offered / offer_accepted              |          1 |
| Offer-Declined                        | offered / offer_declined              |          0 |
| Offer-Withdrawn                       | offered / offer_withdrawn             |          0 |
| Hired                                 | hired / hired                         |          0 |
| Joined                                | hired / joined                        |          0 |
| Converted - Employee                  | hired / converted_employee            |          0 |
| Converted - Temp                      | hired / converted_temp                |          0 |
| Hired by client                       | hired / hired_by_client               |          0 |
| Forward-to-Onboarding                 | hired / forward_to_onboarding         |          0 |
| Rejected                              | rejected / rejected                   |        167 |
| Rejected by client                    | rejected / rejected_by_client         |         67 |
| Rejected-for-Interview                | rejected / rejected_for_interview     |          1 |
| Rejected-Hirable                      | rejected / rejected_hirable           |          0 |
| Unqualified                           | rejected / unqualified                |          9 |
| Junk candidate                        | rejected / junk_candidate             |          0 |
| No-Show                               | rejected / no_show                    |          0 |
| Archived                              | archived / archived                   |         26 |

Any value not in this table (future-proofing): import as archived /
imported_unknown, original preserved in custom_fields, listed in the
verification report. Missing dictionary entries are added to
application_statuses on the fly (workspace dict is extensible by design).

Note: Zoho maps "On hold" to the Interview pipeline color; our dictionary
places on_hold in screening (matches how the team uses it). The stage recorded
in Emerge comes from THIS table, not from Zoho's Hiring_Pipeline; mismatches
are only reported.

### 3.7 Notes -> notes (+ note_mentions)

- Parent resolution: Zoho note Parent_Id + se_module -> external ref ->
  (entity_type, entity_id). Zoho aliases: parent module "Leads" = Candidates,
  "Potentials" = Job_Openings, "Accounts" = Clients.
- Author: note Created_By -> user map -> author_id.
- Body: Zoho mention markup `crm[user#<userId>#<something>]crm` is rewritten to
  the Emerge mention format for every user that maps; unmappable mentions
  degrade to the plain user name. 646 of 1,218 notes contain mentions.
- note_mentions rows are created for mapped mentions. **No notifications are
  fanned out for historical notes** (nobody wants 646 unread pings on day one).
- Created_Time preserved as created_at.

### 3.8 Attachments -> attachments (MinIO)

- Per-record attachments API for Candidates (1,293 flagged), then remaining
  modules with Is_Attachment_Present.
- Category "Resume"/"CV" -> kind=cv; "Formatted Resume" -> kind=formatted_cv;
  everything else kind=other. Filename, mime, size preserved; file bytes
  streamed to MinIO under `zoho/<module>/<record_id>/<attachment_id>_<name>`.
- Slowest phase (rate limits): runs as its own resumable queue; checksum
  (sha256) recorded per file; re-run skips files already stored with matching
  size/checksum.

### 3.9 Users -> users + memberships (mapping table, human-reviewed)

Import does NOT auto-create login-able users. It creates member rows
(deactivated, no password) so owner FKs bind, from a reviewed mapping file:

| Zoho identity (email)                                                                                                                                                                  | Zoho records                              | Proposed Emerge user                                                 | Note                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| meldeeb@ (mahmoud)                                                                                                                                                                     | 1 active                                  | mahmoud (admin)                                                      |                                   |
| usman.a@                                                                                                                                                                               | 1 active                                  | usman                                                                |                                   |
| raza.a@                                                                                                                                                                                | 1 active + 1 deleted                      | ONE user raza                                                        | both Zoho ids -> same Emerge user |
| taaseen.a@                                                                                                                                                                             | 1 active + 1 deleted                      | ONE user taaseen                                                     | same                              |
| gab@ (+ hotmail + gmail variants)                                                                                                                                                      | 1 active (Garry) + 1 deleted + 1 disabled | ONE user garry                                                       | all three ids -> same Emerge user |
| philippines.teampod@ (3 records)                                                                                                                                                       | disabled/deleted/closed                   | ONE user "Philippines Pod" (deactivated)                             | fallback pod account              |
| luke.churchman@, ryan.lubbock@, sam.thompson@, cristina.faylon@, monica.aballe@, reggie@, hazel.bigayan@, lisahaguilar08@, jason@, dave@, michelle@, ghada@, anna@, hans@, dona@, jen@ | 1 each                                    | one user each (active ones invited later, disabled stay deactivated) |                                   |

Records owned by deleted/disabled identities resolve through this table; any
Zoho user id that appears in data but not in the table falls back to the
workspace admin + a line in the verification report. The concrete table above
is generated as `migration/user-map.json` during dry-run and must be approved
before any real import.

## 4. Duplicate policy

- **Candidates**: primary key = lowercased email (Zoho enforces unique email, so
  Zoho-internal dupes are impossible). The 358 no-email candidates import
  as-is; a fuzzy report (normalized name + phone) flags candidates for HUMAN
  review - never auto-merged. Re-runs are idempotent via external_refs, so no
  duplicate rows regardless.
- **Companies**: matched only by external ref (each Zoho Client becomes exactly
  one company). The two "Porsche Consulting" rows import as two companies +
  a flagged merge suggestion; merging (with job re-parenting) is a one-click
  post-import action, never automatic. Same for the near-dupes and junk rows
  ("xyz", "gle", "My company" - flagged for delete-after-review).
- **Contacts**: matched by external ref; email report only.
- **Cross-source safety**: if an Emerge record already exists with the same
  dedupe key but NO zoho external ref (e.g. created manually in Emerge before
  cutover), the importer links it (adopts it as the ref target) and fills only
  empty fields; conflicts keep the Emerge value and are reported.

## 5. Engine design: safe, resumable, idempotent

New tables (created by the migration milestone, RLS like everything else):

- `external_refs` (workspace_id, entity_type, source='zoho', external_id,
  internal_id, UNIQUE(source, entity_type, external_id)): THE idempotency and
  relationship-reconnection backbone. Upsert-by-ref means a re-run can never
  duplicate.
- `import_runs` (id, source, mode: dry_run|import|delta, scope, started/
  finished, status, stats jsonb, log_key): one row per run; powers resume and
  rollback.
- `import_records` (run_id, entity_type, external_id, action:
  created|updated|linked|skipped|failed, internal_id, error, payload_hash):
  per-record ledger - the log, the resume cursor, and the rollback list in one.

Pipeline per entity: **fetch -> snapshot -> transform -> validate -> (write) ->
verify**.

1. **Fetch + snapshot**: page through the Zoho API (per_page 200) and write raw
   JSONL to MinIO (`zoho-migration/<run>/<entity>.jsonl`) before any transform.
   The snapshot makes runs reproducible and is itself the Zoho backup.
2. **Transform**: pure functions (no I/O) from raw Zoho JSON to Emerge row
   shapes; unit-tested against fixture records captured from the real org.
3. **Validate**: required fields present, refs resolvable, enums mappable,
   emails well-formed, dates parseable. Failures never abort the run; the
   record is marked failed with a reason and the run continues.
4. **Write** (skipped in dry-run): upsert via external_refs inside the standard
   `withWorkspace` RLS transaction. Timestamps written explicitly (created_at =
   Zoho Created_Time). Batched (100/tx) so a crash loses at most one batch.
5. **Verify**: recount source vs target, spot-check the benchmark chain.

Operational properties:

- **Dry-run**: full fetch + transform + validate + report, zero DB writes.
  Outputs: per-entity counts, per-record failures, user-map file, duplicate
  report, status-map coverage, attachment scope check (can we download files?
  verified on a 10-file sample). Dry-run is mandatory before the first import.
- **Idempotent**: every write is an upsert keyed on external ref; payload_hash
  short-circuits unchanged records. Run it 10 times, get the same database.
- **Resumable**: per-entity checkpoint = last processed external_id per run;
  a killed run restarts and skips everything already in import_records for its
  run (and everything already ref-linked from prior runs).
- **Logged**: import_records is the queryable ledger; a human-readable summary
  log (JSONL) is stored in MinIO per run; the verification report is generated
  from the ledger, not from memory.
- **Rate-limit safe**: global limiter + exponential backoff on 429/5xx;
  attachments throttled hardest; a full run is allowed to take hours by design.
- **Rollback**: `rollback <run_id>` deletes rows created by that run (action=
  created) in reverse dependency order and removes their external_refs;
  updated/linked records are restored from the pre-image stored in
  import_records.payload (captured before update). Zoho is untouched either
  way - the ultimate rollback is that Zoho remains complete and read-only.
- **Delta re-runs**: fetch with Modified_Time >= last successful run start;
  team keeps working in Zoho during bulk import; final cutover = short
  announced freeze -> last delta -> verification -> switch. Zoho stays
  readable for a quarter after cutover.

## 6. Verification report (run is not done until this reconciles)

Per entity: Zoho count -> fetched -> imported (created/updated/linked) ->
skipped (by reason) -> failed (by reason). Plus targeted checks:

- companies 85 <-> refs 85; contacts 12; candidates 1,296; education/experience
  row counts vs subform rows fetched; jobs 101 (all with company); applications
  762 with UNIQUE pairs intact; status tally in Emerge equals the Zoho tally
  table in section 1; notes 1,218 with parent resolution rate; mention
  conversion rate (target: all 646 mention notes convert or are explained);
  attachments: files stored = attachments listed (with checksums).
- Benchmark chain spot-check: the Porsche Consulting job with 38 applications
  renders fully in Emerge (pipeline counts match Zoho exactly).
- Owner mapping: 0 records on the fallback owner, or each one listed.

## 7. Execution phases (after approval)

1. **Phase A - Engine + dry-run** (no production writes): external_refs/
   import_runs/import_records migrations, fetchers + transformers + validators
   with tests, dry-run against the live org, produce user-map + duplicate
   report + verification preview. STOP: review dry-run output together.
2. **Phase B - Staging import**: full import into a dedicated staging
   workspace ("Zoho Import Staging") on the dev DB. Verify report, browse the
   data, run the rollback drill (import -> rollback -> re-import) to prove it.
   STOP: sign-off on data fidelity.
3. **Phase C - Production import + delta + cutover**: bulk run into the real
   workspace, deltas while the team still uses Zoho, announced freeze, final
   delta, verification, switch. Zoho goes read-only, kept for a quarter.

Phase boundaries are approval gates. This document covers the plan and map
only; no engine code exists yet and nothing has been imported.
