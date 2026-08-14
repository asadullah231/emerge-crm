# Zoho Recruit Audit — Emerge's Live Instance

Date: 13 Aug 2026. Method: read-only API audit of the production Zoho Recruit org
(module metadata, field definitions, org config, record data, timelines, notes,
activity log). This document is the source of truth for what Zoho Recruit provides
and what our team actually uses; the roadmap derives from it.

## 1. Org snapshot

| Object                          | Count                  | Notes                                                       |
| ------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Clients                         | 85                     | 100% have an Account Manager; almost no other fields filled |
| Contacts                        | 12                     | Rarely created; 13% of jobs have a hiring contact linked    |
| Candidates                      | 1,287                  | 72% imported via resume parser                              |
| Job Openings                    | 101                    | 95 In-progress; every job belongs to a Client               |
| Applications                    | 756                    | The live pipeline; association candidate-to-job             |
| Interviews                      | 0                      | Module never used                                           |
| Submissions                     | 0                      | Module never used (status flip is used instead)             |
| Reviews                         | 0                      | Module never used                                           |
| To-Dos / Tasks / Calls / Events | 0                      | Module never used                                           |
| Notes                           | 200+                   | Heavily used; the team's core collaboration artifact        |
| Tags                            | 0                      | Feature unused across all modules                           |
| Custom fields                   | 0                      | Stock schema everywhere                                     |
| Users                           | 19 active (27 records) | All have the Administrator profile                          |

Team shape: ~13 sourcers (mostly Philippines pod) who own candidates, applications
and notes, plus ~6 account managers (UK) who own clients and jobs. One Cairo user.
Deleted/disabled user records are failed re-invites.

Desk profile: DACH/EU headhunting. Jobs concentrated in Germany/Austria/Switzerland,
candidates in Germany/France/US. No job is ever published to a career site: this is
a pure sourcing shop, not an inbound-applications agency.

## 2. How the team actually works (observed, not assumed)

1. **Intake**: sourcers bulk-import CVs through the resume parser (72% of all
   candidates; ~12 parser imports per 2 working days). Parsed data fills contact
   info, employer, title, skills; education/experience land in tabular sub-grids.
2. **Association**: sourcer links candidate to a job. In Zoho the association IS
   the Application record (status starts at "Associated").
3. **Screening call**: sourcer writes a templated note on the candidate/application
   ("Full name / Availability / Location / notice period / call transcript"), and
   @mentions the account manager. This @mention note is the sourcer-to-AM handoff.
4. **Client submission**: AM flips Application status to "Submitted to client".
   Client feedback comes back as status "Approved by client" / "Rejected by client".
   The dedicated Submissions module is NOT used; the status machine is.
5. **Interview tail**: thin usage of "Interview to be scheduled" / "Interview-
   Scheduled" / "Interview in progress" statuses. The Interviews module itself has
   zero records; scheduling happens outside Zoho.
6. **Routing field**: Account_Manager on the job (set on 101/101). Assigned_Recruiter
   is empty on 89/101 - ownership of the application does that job instead.

Activity log confirms: all events come from normal users. No automation, no workflow
rules firing, no email sends, no exports, no offer generation in the log window.

## 3. Feature areas in the product vs used by us

| Zoho feature area                                    | Exists in Zoho | Used by us                    | Evidence                                     |
| ---------------------------------------------------- | -------------- | ----------------------------- | -------------------------------------------- |
| Candidates (CRUD, dedupe by unique email)            | Yes            | Heavy                         | 1,287 records                                |
| Resume parsing (parser import, tabular edu/exp)      | Yes            | Heavy                         | Source = "Imported by parser" on 72%         |
| Jobs tied to Clients (mandatory lookup)              | Yes            | Heavy                         | 101/101                                      |
| Applications with 30-status machine + 7-stage kanban | Yes            | Heavy                         | 756 records; statuses incl. client loop      |
| Notes + @mentions                                    | Yes            | Heavy                         | 200+; 133 titled "Call"; AM mentions         |
| Record timeline / audit history                      | Yes            | Passive but valuable          | Timelines populated by usage                 |
| Clients & Contacts modules                           | Yes            | Moderate                      | 85 clients, contacts sparse                  |
| Account Manager ownership                            | Yes            | Heavy                         | The routing field                            |
| Interviews module (scheduling, video, verdicts)      | Yes            | Never                         | 0 records                                    |
| Submissions module (formal sendouts to contacts)     | Yes            | Never                         | 0 records; status flip instead               |
| Reviews / Assessments (scorecards, questionnaires)   | Yes            | Never                         | 0 records                                    |
| Tasks / Events / Calls (To-Dos)                      | Yes            | Never                         | 0 records                                    |
| Tags                                                 | Yes            | Never                         | 0 tags in every module                       |
| Custom fields                                        | Yes            | Never                         | 0 custom fields                              |
| Custom views / advanced search                       | Yes            | Assumed light                 | Not inspectable via API; list views standard |
| Career site / job publishing                         | Yes            | Never                         | Publish=false on all 101 jobs                |
| Candidate portal                                     | Yes            | Never                         | No portal users                              |
| Client portal (roles exist)                          | Yes            | Configured, unused            | Client Admin/Interviewer roles, 0 users      |
| Campaigns                                            | Yes            | Never                         | Stock config, no data signals                |
| Offers (generate, send, approval flow)               | Yes            | Never                         | Absent from activity log                     |
| Email sending / templates from Zoho                  | Yes            | Never observed                | No mail events in log                        |
| Workflow rules / Blueprint / automation              | Yes            | Never observed                | All events "normal user"                     |
| Reports & dashboards                                 | Yes            | Unknown (not API-inspectable) | -                                            |
| Job revenue forecasting (per-position revenue)       | Yes            | Never                         | Fields empty                                 |
| Roles/profiles/permissions                           | Yes            | Effectively unused            | Everyone is Administrator                    |
| GDPR/consent, blocklist, locking                     | Yes            | Not used yet                  | Fields exist, all false                      |

## 4. Field-level reference (for schema design)

Full field inventories were captured for Candidates (52 fields), Job Openings (41),
Applications (38), Interviews (30), Reviews (24), Submissions (18), To-Dos (36),
Campaigns (16), Assessments (13), Clients (27), Contacts (40). Key structural facts:

- **Candidate**: unique lowercased Email is the dedupe key. Dual status model:
  13-value Candidate_Status plus 7-value kanban Candidate_Stage (our team leaves
  both at "New" - the pipeline truth lives on the Application). Tabular
  Educational_Details / Experience_Details sub-grids hold parsed CV data.
- **Job**: Client lookup is REQUIRED; Contact optional; Account_Manager ownerlookup;
  9-value status incl. "Submitted by client"; rich-text JD; free-text salary;
  revenue forecast fields (unused); career-site publish flags (unused);
  per-job pipeline selector (only "Standard Pipeline" exists).
- **Application**: junction of candidate x job with candidate/job fields mirrored
  read-only onto it (Zoho denormalization; we can use joins). 30-value status
  spanning sourcing, client loop, interviews, offers, joined, conversion; 7 colored
  stages (Screening, Submissions, Interview, Offered, Hired, Rejected, Archived)
  with a status-to-stage mapping. Lock_Status records why a record froze.
- **Interview**: one record = scheduled event + verdict (Strong Hire...), video
  interview fields, structured rejection/cancellation reasons. Unused by us.
- **Shared pattern on every module**: autonumber human ID (ZR_n_CAND / _JOB / _APP),
  owner, Created/Modified By + Time, Last_Activity_Time, Associated_Tags,
  Is_Attachment_Present, Is_Locked.
- **Timeline event taxonomy**: ~200 activity codes org-wide (CRUD, associate,
  status change, pipeline change, notes, parser, job boards, submissions, offers,
  portals, assessments, approvals, GDPR, blocklist, referrals, conversion, tags).

## 5. Not inspectable via API (flagged, needs manual check only if ever wanted)

Workflow rule definitions, Blueprint configs, email template contents, report and
dashboard definitions, career-site theming, integration marketplace connections.
Given zero automation events in the activity log and the team's manual workflow,
none of these block the rebuild.

## 6. Conclusions that drive the roadmap

1. The minimum system that replaces Zoho for this team day-one:
   Clients -> Jobs (AM owner) -> Applications (status machine incl. client-submission
   loop) <- Candidates (parser import, sourcer owner), plus templated notes with
   @mentions and a per-record + org-wide activity timeline.
2. Resume parsing is not a "later" feature: it is the number-one intake path and
   must arrive right after core objects.
3. A real Zoho migration engine (API-based, relationship-preserving) is a
   product milestone, not a script: 1,287 candidates, 756 applications, 101 jobs,
   85 clients, 200+ notes and their CV attachments must land connected.
4. Interviews, offers, assessments, portals, automation, tags, custom fields are
   NOT needed for switch-over. They come after migration or post-1.0.
5. Permissions can stay simple (admin / recruiter / read-only from M1 covers more
   than Zoho's actually-used model, which is "everyone is admin").
