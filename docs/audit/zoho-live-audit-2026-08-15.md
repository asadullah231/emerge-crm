# Zoho Recruit - Live Feature Audit vs Emerge CRM

**Source:** live Zoho Recruit org `20113116180` on `recruit.zoho.eu`, audited
2026-08-15 (post-cutover). Read-only. Combines Zoho Recruit REST API metadata
(`/settings/modules`, `/settings/fields`, `/settings/profiles/{id}`,
`/settings/roles`, `/users`, `/settings/timeline`) with a live UI screenshot of
the home dashboard (Chrome extension).

**Scope:** every module Zoho exposes, every field on every module we care
about, all 4 profiles' 200+ permission flags, all 170+ timeline activity types,
users/roles hierarchy, automation & portal capability surface. Compared
against Emerge CRM at commit `2a309a0` (branch `develop`,
[https://crm.emergeautomation.tech](https://crm.emergeautomation.tech)),
which shipped M1-M6 + M8 migration engine + the collapsible sidebar. **No M1-M5
functionality was changed by this audit and none is proposed.**

**How to read it:** section 1 is the feature audit (what Zoho actually is);
section 2 is the missing-feature gap list; section 3 is the entity/relationship
map (source of truth for schema decisions); section 4 is what has to happen for
each gap to close; section 5 is the recommended build order.

**Prior work this audit supersedes/extends:**
- `docs/audit/zoho-data-migration-map.md` (2026-08-14) - data + field map. Still
  correct for data; extended here with feature parity.
- `docs/milestones/*.md` - completed M1-M6 + M8.

---

## 0. Live counts (2026-08-15 home tile)

| Tile         | Zoho | Emerge staging (Emergetech workspace, post-cutover) |
| ------------ | ---: | --------------------------------------------------: |
| Active Jobs  |   96 |                                                  95 (open) + 1 filled + 2 inactive + 2 cancelled + 1 on_hold - matches Zoho |
| Applicants   |  767 |                                              1,298 candidates (Zoho tile counts pipeline applicants only, not sourced) |
| Interviews   |    0 |                                                   - (module not built) |
| Submissions  |    0 |                                                   - (folded into application_status_history) |
| Hires        |    0 |                                                    0 (matches) |
| Notes        |  n/a |                                              1,218 notes migrated (712/460/40/6 by parent type) |

Pipeline view visible on Zoho home matches Emerge kanban: **Screening,
Submissions, Interview, Offered, Hired, Rejected, Archived** - same 7 stages,
same colors (`#338cf0 / #465daf / #d87230 / #a09019 / #1a936a / #ff0000 /
#8CB5B8`), confirmed against `Application_Stage` picklist values from the API.

---

## 1. Feature audit - everything Zoho ships (organised by area)

Legend for **Used?** column: "yes" = has data in this org; "no" = zero records
or disabled; "config" = template/setting exists, no records.

### 1.1 Modules (from `GET /settings/modules`, all 19 tabs)

| # | api_name | Plural | parent | Global search | Creatable | Filter | Scoring | Blueprint | Presence sub-menu | Used? |
| - | -------- | ------ | ------ | :-----------: | :-------: | :----: | :-----: | :-------: | :---------------: | :---: |
| 1 | Home | Home | - | | | | | | | yes |
| 2 | Job_Openings | Job Openings | - | ✓ | ✓ | ✓ | ✓ | via status | ✓ | yes (101) |
| 3 | Candidates | Candidates | - | ✓ | ✓ | ✓ | ✓ | | ✓ | yes (1,298) |
| 4 | Applications | Applications | Candidates | ✓ | ✓ | ✓ | | via status | ✓ | yes (763) |
| 5 | Interviews | Interviews | - | ✓ | ✓ | ✓ | | ✓ (`Interview_Status`) | ✓ | no (0) |
| 6 | Clients | Clients | - | ✓ | ✓ | ✓ | ✓ | | ✓ | yes (86) |
| 7 | Contacts | Contacts | - | ✓ | ✓ | ✓ | ✓ | | ✓ | yes (12) |
| 8 | Analytics | Analytics | - | | | | | | | tab |
| 9 | Reports | Reports | Analytics | | | | | | | tab |
| 10 | Dashboards | Dashboards | Analytics | | | | | | | tab |
| 11 | Metrics | Metrics | Analytics | | | | | | | tab |
| 12 | Campaigns | Campaigns | - | ✓ | ✓ | ✓ | | | ✓ | no (0) |
| 13 | Assessments | Assessments | - | | ✓ | ✓ | | | ✓ | config (4 templates, 0 answered) |
| 14 | To_Dos | To-Dos | - | | ✓ | ✓ | | | | no (0) |
| 15 | RecruiterInbox | RecruiterInbox | - | | | ✓ | | | | inbox integration |
| 16 | Documents | Documents | - | | | | | | | file cabinet |
| 17 | Reviews | Reviews | Candidates | | ✓ | ✓ | | | ✓ | no (0) |
| 18 | Submissions | Submissions | Candidates | | ✓ | ✓ | | | ✓ | no (0 - replaced by app-status "Submitted-to-client") |
| 19 | Documents (dup label) | - | - | | | | | | | - |

Notable: **`presence_sub_menu` is not a phone-number field** - it means Zoho
shows real-time collaborator presence dots on that module (WhatsApp-tick style).
Zoho's model name for Job Openings is `Potentials` internally (Zoho Recruit is
a Zoho CRM fork; Job Openings = CRM Deals, Clients = CRM Accounts, Candidates =
CRM Leads, Interviews = CRM Products, To-Dos = CRM Activities). Every ref in
the field metadata `referredDetails.fromModule` uses these legacy names - the
importer already handles the aliases.

**Forecasts** is a visible tab on the profile (see 1.5) but no dedicated module
row - it's a computed forecast built on Job_Openings' `Revenue_per_Position` /
`Expected_Revenue` / `Actual_Revenue` / `Missed_Revenue` (Emerge has these in
`custom_fields.zoho.revenue.*`, dormant).

### 1.2 Fields per module (from `/settings/fields`, all API-verified)

**Job Openings - 35+ fields.** All stock, `custom_field=false` throughout.
Highlights beyond the base map already in the migration doc:

- Multi-pipeline: `Pipeline__s` picklist with a single "Standard Pipeline"
  seeded - the profile has `Crm_Implied_Change_Pipeline` permission enabled,
  so multi-pipeline is available but only one is defined.
- `Publish` / `Keep_on_Career_Site` / `Job_Board_Publish_Status` - career-site
  and paid/free-job-board publish state (permissions
  `Crm_Implied_JobBoards_Free/Paid`, `Crm_Implied_Publish`).
- `Is_Hot_Job_Opening` - Zoho's "hot job" flag (drives home-tile ranking).
- `Number_of_Positions`, `Target_Date`, `Date_Opened`, `Date_Closed`.
- Revenue block: `Revenue_per_Position`, `Expected_Revenue`, `Actual_Revenue`,
  `Missed_Revenue` - foundation for placements/fees module.
- `Assessment_Name` lookup - jobs can be tied to an assessment template.
- `Candidate_Submission_Limit` - cap per job.
- Rich-text `Job_Description` (HTML with allow-list already applied).

**Candidates - very large (~140 fields).** Beyond the base map: whole social
block (`LinkedIn__s`, `Facebook__s`, `Twitter__s`, `Skype_ID`), whole address
block (Mailing + Other), `Is_Blocked__s` (blocklist), `Is_Locked`, `Rating`,
`Origin` picklist (`Sourced / Applied / Referred / Agency`), `Email_Opt_Out`,
`Highest_Qualification_Held`, `Salutation`, education subform
(`Educational_Details`) + experience subform (`Experience_Details`), `Skill_Set`
free-text (Zia uses this for AI matching). Extra timeline: `Candidate_Locked`,
`Candidate_Disqualified`, `Candidate_Qualified`, `Candidate_Rated`,
`Candidate_Referred`, `Candidate_Portal_Signup`.

**Applications - 30 fields.** Confirms 30-value `Application_Status` picklist
(only 13 observed in live data; all 30 are already mapped in `applicationStatuses`
seed). `Hiring_Pipeline` (the 7-color stage picklist), `Application_Owner`,
`Rating`, `Date_Hired`, `LinkedIn__s / Facebook__s / Twitter__s` mirrored from
candidate, `Is_Blocked__s / Is_Locked / Is_Unqualified`. Both `Client_Name` and
`Job_Opening_Name` are denormalised lookups on every application row.

**Interviews - 30 fields.** This module IS built by Zoho but org has 0 rows.
Key structure to know for future work:

- `Interview_Name` picklist: Internal / General / Online / Phone / L1 / L2 / L3 / L4.
- `InterviewType__s` picklist: In-person / Live Video / Third-party Video /
  Recorded Video / Adhoc.
- `Meeting_Provider` picklist: Zoho Recruit-Live / Zoho Recruit-Recorded /
  Google Meet / Microsoft Teams.
- Lookups: `Candidate_Name` -> Candidates, `Job_Opening_Name` -> Job_Openings,
  `Client_Name` -> Clients, `Interviewer` -> Contacts (multi-select),
  `Reviewed_By` -> Contacts, `Questionnaire_Name` -> Assessments.
- Timestamps: `Start_DateTime`, `End_DateTime`.
- Content: `Venue`, `Schedule_Comments`, `Feedback`, `Reviewed_Time`,
  `Reminder` picklist (-None- / At time of event / 5m / 10m / 15m / 30m / 1h /
  2h / 1d / 2d before), `Cancellation_Reason` picklist (7 values),
  `Rejection_Reason` picklist (10 values), `VideoInterview_Stage` picklist.
- `Interview_Status` is a **blueprint** (`blueprint_supported=true`) - a
  finite-state machine with allowed transitions defined in Setup.

**Clients - 30 fields.** Adds beyond the base map: `Parent_Account` (self-ref
lookup for hierarchy), `Industry` picklist (Communications/Technology/…/Health
Care - 11 values), whole Billing + Shipping address block,
`Client_Portal_User_Status` picklist (Yet to invite / Invited / Active /
Inactive).

**Contacts - 30 fields.** Adds: whole Mailing + Other address block,
`Skype_ID`, `Salutation`, `Email_Opt_Out`, `Client_Portal_User_Status` (this
is where the client-side login is provisioned).

**Campaigns - 15 fields.** `Type` picklist (Conference/Webinar/Trade Show/PR/
Partners/Referral/Advertisement/Direct mail/Email/Telemarketing/Others),
`Status` (Planning/Active/Inactive/Complete), `Expected_Revenue`,
`Budgeted_Cost`, `Actual_Cost`, `Expected_Response`, `Num_sent`. Whole thing is
zero-data; nobody uses it.

**Assessments - 12 fields.** `Category` (Candidate/Recruiter/Interviewer
Assessment), `Type` (Behavioural Interview / General / Pre-Screening /
Behavioral Screening / Background Screening), `Rating_Type` (Star / Thumb /
Numeric), `Qualifying_Score`, `No_of_Questions`. Questions are a sub-resource
(`getRelatedNotes` analogue - Assessments have their own questions API).

**Reviews - 22 fields.** Candidate ratings/reviews (source: `Recruiter Review /
Answered Assessment / Interviewer Review / Client Review`), with
`Rating` + `Secured_Rating` + `Review_Comments`, `Status` (Pending / Answered /
Reviewed / Archived / Expired), `Qualified` boolean, ties to Candidate + Job +
Interview + Assessment + Contact + Submission. Auto-number `ZR_n_REV`.

**Submissions - 18 fields.** Distinct module (not to be confused with the
`Application_Status = "Submitted-to-client"` value). Lookups: Candidate + Job +
Client + Reviewer (Contact) + `Submitted_To` (multi-select lookup).
`Submission_Status` picklist (Submitted-to-client / Approved / Rejected /
Archived), `Submission_Medium` (Email / Share / Internal), `Reviewer_Comments`,
`Rating`. Auto-number `ZR_n_SUB`. **Zero rows** - the team uses the application
status field instead of creating separate submission records.

**To-Dos (Activities = Tasks/Calls/Events) - ~40 fields.** One physical
module, three logical types keyed by `Activity_Type`:
- Task: `Subject`, `Due_Date`, `Status` (Not Started/Deferred/In Progress/
  Completed/Waiting), `Priority` (High/Highest/Low/Lowest/Normal), `Reminder`,
  `Send_Notification_Email`.
- Call: `Call_Type` (Outbound/Inbound), `Call_Purpose` (Prospecting/Admin/
  Negotiation/Demo/Project/Support), `Call_Duration`, `Call_Start_Time`,
  `Call_Result`, `CTI_Entry` (Zoho voice/telephony), `Billable`.
- Event: `Meeting_Venue` (Client Location/Business Location/Online), `Venue`,
  `Start_DateTime` / `End_DateTime`, `All_day`, `Recurring_Activity` (RRULE),
  `Participants` (jsonarray), `Meeting_Provider`, latitude/longitude.
Polymorphic lookups: `Who_Id` (Contact) + `What_Id` / `Rel_SEID` (Related-to,
any parent module). **Zero rows** - activities aren't used.

### 1.3 Users, roles, profiles (from `/users`, `/settings/roles`, `/settings/profiles/{id}`)

- **28 users** total - 19 active, 4 disabled, 4 deleted, 1 closed. All map into
  a clean 21-person emerge set via the migration `user-map.json` (already
  present).
- **4 roles, 2-level hierarchy**: `Recruiter Admin` -> `Recruiter` ·
  `Client Administrator` -> `Client Interviewer`. `share_with_peers` is true
  on the two admin roles, false on the reports (standard Zoho data-sharing).
- **4 profiles** (permission bundles), 200+ enabled permissions each:
  - `Administrator` (89142000000011133) - everything on.
  - `Standard` (89142000000011135) - everything on except: view/CUD Clients &
    Contacts (all 4 verbs off), delete Job Openings/Candidates/Interviews/
    Campaigns/Docs/Submissions, export Job Openings/Candidates/Applications/
    Interviews/Clients/Contacts/Campaigns/Reviews/Submissions/Events/Tasks/
    Calls/Competitors/Users/ActivityLog, `Manage_Users/Roles/Profiles`,
    `Customize_Zoho_CRM`, `Zoho_People/CRM/Workerly_Integ`,
    `Manage_ClientPortal/ClientPortal_Users`, `Manage_Compliance/Sandbox/
    Subscription/CalendarBooking`, `View_Storage_Usage`, `Data_Migration`,
    `Formatted_Resume_Config`, `Custom_From_Address_Config`, `Career_website`,
    `Invite_Candidate`, `Apply_With_LinkedIn`, `Social_Admin`, `Delete_Emails`,
    `Delete_Events/Calls/Tasks/Docs`.
  - `Candidate` (89142000000346005) - candidate-portal only (self-service).
  - `Client Interviewer` / `Client Administrator` (89142000000466845 /
    89142000000466839) - client-portal profiles.
- **Tabs visibility per profile** (from the mystery permission entry in
  `permissions_details`): Administrator sees all 20 tabs (Home, Job Openings,
  Candidates, Applications, Interviews, Clients, Contacts, Campaigns,
  Assessments, Activities, Reports, Dashboards, Metrics, Analytics, Reviews,
  Submissions, Documents, Notes, RecruiterInbox, **Forecasts**). Standard is
  the same minus Clients & Contacts tabs.

### 1.4 Timeline / activity types (170+ from `/settings/timeline`)

The complete audit-log vocabulary Zoho ships. Full list already in the API
snapshot; the domains that matter for Emerge parity:

- Record lifecycle: Added / Updated / Deleted / Restored (+ bulk variants) +
  Merged.
- Status changes: general Status Changed (+ bulk, + Single Module, + via API,
  + bulk-via-API - 8 variants).
- Ownership: Owner Changed (+ bulk).
- Association: Associated / Unassociated (+ bulk).
- Emails: Sent, Sent-Bulk, Mail-Merge, Mail-Merge-Bulk, Opt-out.
- SMS: Sent, Received, Bulk.
- Telephony: Outgoing/Incoming Call Activity through Built-in Telephony.
- Notes: Added / Edited / Deleted / Restored (+ bulk added).
- Tags: Associated / Unassociated (+ bulk).
- Candidate lifecycle: Locked / Unlocked / Qualified / Disqualified / Rated /
  Blocked / Unblocked / Referred / Reactivated (GDPR) / Portal Signup /
  Invited / Reinvited / Portal Enabled/Disabled / Photo Deleted / MFA Reset.
- GDPR: Request Consent / Automatic Record Deletion / Candidate Reactivated.
- Job openings: Published/Unpublished in Job Board / Job Board Updated /
  Published in Social.
- Assessments: Answered / Question Added/Edited/Deleted/Reordered /
  Associated-with-Job.
- Offers: Sent / Withdrawn / Accepted / Declined / Resend / Change Expiry /
  Updated-and-Sent / 5 auto-withdraw reasons (Deleted candidate / Locked /
  Inactive Job / Unassociated / Blocklisted). Plus separate 400-series:
  Offer Created / Updated / Status Changed / Medium Changed.
- Approvals: 10 activities (Submitted / Approved / Rejected / Delegated /
  Resubmitted / Approved-by-Admin / Auto Final / Final Status / Auto Approved /
  Rejected-by-Admin).
- Interview lifecycle: Deleted / Restored / Cancelled / auto-Cancelled /
  Submission Review by User On Behalf of Contact.
- Custom Portal: User Invited / Reinvited / Invitation Accepted / Activated /
  Deactivated / Record Image Added/Deleted.
- Contact: Invited / Reinvited / Enabled / Disabled / Role Changed / Invitation
  Accepted / Revoked.
- Vendor: Invitation Revoked.
- Employee referral: Approval / Rejection.
- Attachments: Created / Updated / Downloaded-via-Client-Portal / Deleted.
- Drafts: Drafted / Deleted / Mass-Deleted / Attachment Deleted.
- Kanban: "Updated using kanban view" (500).
- Pipeline: "Pipeline Changed" (488).
- Extractor / Webform / Outlook / LinkedIn / Facebook / Twitter / Google Plus:
  Added/Removed/Updated variants for each integration.
- Bulk imports per source: Indeed / Monster / Career Builder / Resume Library /
  Dice / NEXXT / CV-Library (single + bulk variants).
- Data enriched (306) - Zoho's Zia enrichment provider.
- Custom Button Executed (77, 155-bulk) - allows arbitrary automation actions.
- Screening Failed (121) - resume-parser reject.
- Formatted Resume Generated / Re-generated / Bulk.
- Bulk Client Submission / Submitted To Client / Submitted to Hiring Manager
  (+ bulk).
- Converted-as-Candidate/Contact/Employee/Temp (+ bulk).
- Records Merged, Record Image Added, Video Submitted by Candidate.

### 1.5 Automation surface (from profile permission catalogue - every capability Zoho ships)

Because Zoho gates every feature behind a permission, the master permission
list on the Administrator profile is a **complete capability index**. Grouped:

- **Workflow Rules** - `Crm_Implied_Manage_Workflow` (create/edit/delete
  workflow rules with triggers on any module event, actions = Email
  Notification, Task, Field Update, Webhook, Custom Function).
- **Blueprints** - no dedicated permission, driven by
  `blueprint_supported=true` on picklist fields (only `Interview_Status` in
  this org). A blueprint enforces allowed status transitions with per-transition
  during-transition fields, common transitions, and after-transition actions.
- **Approval Process** - 10 timeline activities cover it (see 1.4). No records
  captured but the permission tree is on.
- **Assignment Rules** - implicit via `Change_Owner` + `Mass_Transfer_*`
  permissions.
- **Custom Buttons** - `Crm_Implied_Advanced_Dev_Access` + timeline
  Activity 77/155.
- **Custom Functions** - Deluge scripting via Extensions
  (`Advanced_Dev_Access`).
- **Web Forms** - `Web_To_Candidates / Web_To_Contacts` + Approve variants.
- **Career Site** - `Career_website` (public job board).
- **Resume Parser** - `Import_Resume` + `Parser_Mapping`. Powers the 1,034
  "Imported by parser" candidates in the org.
- **Resume Inbox** - `ResumeInbox` (email-in resume drop).
- **Formatted / Branded Resume** - `Formatted_Resume_Config` +
  `Formatted_Resume_Generate`.
- **Job Boards** - `JobBoards_Free / JobBoards_Paid` (7 paid boards evidenced
  by imports: Indeed, Monster, Career Builder, Resume Library, Dice, NEXXT,
  CV-Library).
- **Calendar Booking** - `Manage_CalendarBooking` (public self-book link).
- **Mail Merge** - `Mail_Merge` (bulk personalised emails + docs).
- **Print View** - `Print_View`.
- **Email Templates / SMS Templates / Message Templates / From Address**.
- **Zia (AI)** - `getZiaMatchingCandidates`, `getZiaMatchingJobOpenings`,
  `refineZiaMatchingCandidates`, `refineZiaMatchingJobOpenings`, plus timeline
  Data Enriched (306).
- **Data Migration** - `Data_Migration` (Zoho's CSV/CRM-import UI).
- **Sandbox** - `Manage_Sandbox` (staged config testing).
- **Compliance (GDPR)** - `Manage_Compliance / Compliance_Reports_Metrics` +
  timeline GDPR activities (134, 207, 133).
- **Custom Views** - `Manage_CustomViews` (per-module saved filters + column
  configs).
- **Custom Fields / Layouts** - `Customize_Zoho_CRM` (this org: 0 custom fields
  anywhere, all layouts are default).
- **Tags** - `Tags` + `Associate_Tags` + tag record count APIs. This org: 0
  tags anywhere.
- **Territories** - `territories: []` on every user; territories are off.
- **SMS integration** - `SMS_Integ` (add-on, likely off - 0 SMS Sent/Received
  activities).
- **Telephony (CTI)** - permissions on, evidenced by activity codes 600/601.
- **Zoho People / Zoho CRM / Zoho Workerly integrations** - permissions off on
  Standard.
- **Ecosystem integrations** (Zoho Mail, Outlook, Google Meet, Teams, Zoho
  Sheet View) - permissions on for both admin and standard.
- **Sales Inbox (RecruiterInbox)** - email intelligence layer, `SalesInbox`
  module row visible; no data seen.
- **Client Portal / Vendor Portal / Candidate Portal / Custom Portal** -
  `Manage_ClientPortal / Manage_ClientPortal_Users / Vendor_Portal /
  Invite_Candidate` + `Client_Portal_User_Status` field on Contacts & Clients +
  candidate & vendor profiles. Timeline activities 149-152, 168, 195-196,
  198-206 cover the flows.
- **Social publishing** - `Social_Admin / Social_Integration` + timeline
  "Published in Social" (70). Adds/removes for LinkedIn/Facebook/Twitter/
  Google+.
- **Storage / Subscription / Manage Users/Roles/Profiles** - admin-only.
- **Marketplace / Extensibility** - `Advanced_Dev_Access` (install
  extensions, write custom Deluge functions, add web-tabs + custom buttons).

### 1.6 Reports / Analytics / Dashboards / Forecasts (module tabs, from profiles)

Zoho Recruit ships:
- **Reports** module: standard folders (Sales Reports = Recruiter Reports),
  custom reports (Tabular, Summary, Matrix, Chart). Filters on any field.
  Scheduled email delivery. Permissions: `Manage_Reports_Dashboards`,
  `Schedule_Reports`.
- **Dashboards** module: 2D/3D chart, funnel, heatmap, target meter, KPI.
- **Metrics** module: prebuilt KPI cards.
- **Analytics** parent: umbrella tab.
- **Forecasts** tab (visible in Standard-profile tabs list): recruiter-target
  view built on Revenue_per_Position + Actual_Revenue.

No custom reports exist in this org (nothing about them in metadata; the
Standard profile has view/manage permissions, so any user could create).

### 1.7 Search + notifications + Zia + right-panel

- **Global search**: `global_search_supported: true` on Job_Openings,
  Candidates, Applications, Interviews, Clients, Contacts, Campaigns -
  everything except Home, Analytics/Reports/Dashboards/Metrics, To_Dos,
  RecruiterInbox, Documents, Assessments, Reviews, Submissions.
- **Advanced search revamp**: on for Job_Openings, Candidates, Applications,
  Clients, Contacts (post-2024 UI); older UI for the rest.
- **Notifications**: bell icon in top-right, "99+" seen on the home
  screenshot - high-volume notification feed. No API to list them at scale.
- **Smart Chat (Zia bar)**: bottom of every page ("Here is your Smart Chat
  (Ctrl+Space)").
- **Right-panel**: on every record - contextual widgets (activities, notes,
  attachments, related records, portal actions).
- **Zia matching**: 4 APIs (matching candidates for a job, matching jobs for a
  candidate, plus refine variants).

### 1.8 Data admin

- Bulk operations per module: Mass Transfer / Mass Update / Mass Delete / Mass
  Convert / Mass Email / Mass SMS (permissions catalog exhaustive).
- Import (CSV): `Import_My_*`, `Import_MyOrg_*`, `Import_History`, `Import_
  Resume`.
- Export (CSV): per module + activity log + users + competitors.
- Data Migration UI (from Zoho CRM or another Zoho product).
- Find & Merge (per Candidates / Contacts / Clients).
- Formatted resume config + generation.
- Storage usage.
- Sandbox.
- Compliance/GDPR.

---

## 2. Missing-feature list - Emerge vs Zoho

Format: **Feature** - **Emerge status** - **Notes**. Grouped by pain-severity
(high = daily use is blocked; medium = important but has workaround; low =
Zoho ships it but no evidence of use in this org, safe to defer).

### 2.1 HIGH - build these next to reach parity for daily use

| # | Feature | Emerge status | Why it matters |
| --- | ------- | ------------- | -------------- |
| H1 | **Interviews module** (schedule / list / calendar / feedback) | not built | Zoho has 30 fields + blueprint status FSM; team currently uses "Interview-*" application statuses as a proxy. Missing: interviewer assignment, calendar link, meeting provider, feedback capture. Required for Michelle + Ryan + Luke etc. to run the client interview loop. |
| H2 | **Attachments per candidate → CV download** | schema exists (`attachments`, MinIO), 0 files migrated yet | Zoho: 1,293 candidates flagged Is_Attachment_Present. Migration engine can pull them via the per-record attachment endpoint; not yet run. Without this, recruiters can't send CVs. |
| H3 | **Global search across all modules** | per-module search only | Zoho's top-bar search hits Candidates + Jobs + Clients + Contacts in one box. Emerge has per-list-page search. |
| H4 | **Send email from a record** (Email tab) | not built | Zoho ships `Send Email` permission + Zoho Mail integration + IMAP + `Last_Mailed_Time` field on every module. Email is the daily comms channel; Emerge has to at least log-outbound before recruiters will switch. Resend SMTP already wired for transactional. |
| H5 | **Career site + web-to-candidate form** | not built | Team doesn't currently publish via career site (no records show `Origin=CareerSite`) so LOW-priority for the sales pitch, but if Emerge is going to replace Zoho fully this is the missing candidate acquisition path. Downgrade to MEDIUM if agency mostly sources actively. |
| H6 | **Resume parser + Resume Inbox** | not built (M7 milestone open) | 1,034 candidates in Zoho got in via parser. Without this the team hand-types every candidate - a dealbreaker for switching. |
| H7 | **Multi-status offer flow** (Offer_Made / Offer_Accepted / Offer_Withdrawn + expiry + resend) | modelled as application-statuses only | Zoho has a full Offers sub-flow (14 timeline activities). Currently Emerge covers via `application_stage=offered`. Enough for now, but as soon as any offer is issued, need offer letter template + expiry countdown. |
| H8 | **Client portal (Contacts login → review submissions)** | not built | Two profiles (Client Administrator, Client Interviewer) exist in Zoho; permission tree covers invite → review → download attachment → comment. Emergetech has 12 contacts, of which at least some have client-portal user status ready. Without this, sending "submitted-to-client" candidates outside the CRM is manual (email/PDF). |

### 2.2 MEDIUM - useful, add after HIGH

| # | Feature | Emerge status | Notes |
| --- | ------- | ------------- | ----- |
| M1 | **Tags** (per module, filter by tag, tag record counts) | schema exists (`tags` + `taggings`), UI absent | Zoho: 0 tags anywhere in this org - no data to migrate. Emerge already has the plumbing (`taggings.entityType` polymorphic). Just needs the composer & filter chips. |
| M2 | **Custom views (saved filters + column configs) per module** | list pages have static columns/filters | Zoho: `Manage_CustomViews`. Recruiters use custom views heavily in Zoho (default view = "My Open Candidates" etc.). Emerge needs at minimum: view chooser + save current filters + share view. |
| M3 | **Custom fields per module** | schema stores in `custom_fields` jsonb | Zoho org has 0 custom fields (verified) - no data need. But Emerge should give admins an "add field" UI eventually. Post-1.0. |
| M4 | **Layouts / page-config per module** | fixed layout | Zoho: page layouts per profile. Deferrable - nothing bespoke in this org's config. |
| M5 | **Assessments** (question bank + candidate answers + scoring) | not built | Zoho: 4 templates, 0 responses. Not used in the org yet - safe to postpone until first customer asks. Full field-set already mapped in section 1.2. |
| M6 | **Reviews** (recruiter/interviewer/client review of a candidate) | not built | Zoho: 0 records. Modelled around Interviews + Assessments. Postpone alongside Interviews. |
| M7 | **Approval Process** (multi-step approvals with delegation/resubmit) | not built | Zoho has 10 timeline activity types for it (181-190). No approval records in this org's usage pattern. Postpone. |
| M8 | **Blueprint (finite-state machine on any picklist)** | applications have hard-coded status → stage map | Zoho: only Interview_Status is a blueprint here. Emerge already gets you the same effect via `application_statuses.stage`. Generalise later. |
| M9 | **Mail Merge** (personalised bulk emails from a template + record fields) | not built | Zoho: `Mail_Merge` permission on. Deferable - SMTP+Resend is wired but no bulk send UI. |
| M10 | **Job publishing to career site + free/paid job boards** | not built | Zoho: `Publish/JobBoards_Free/JobBoards_Paid`. Only meaningful if H5 (career site) is built. Postpone. |
| M11 | **Formatted / branded resume** (generate a client-branded CV) | not built | Zoho: config + generate permissions; timeline activities 34/35/255. Common recruiter deliverable. Post-1.0. |
| M12 | **Calendar booking** (public link for candidates to self-book calls) | not built | Zoho: `Manage_CalendarBooking`. Nice-to-have. |
| M13 | **Zia matching** (AI candidate → job / job → candidate) | not built | Zoho: 4 endpoints. Requires embedding pipeline; post-1.0. |
| M14 | **Reports + dashboards module** | not built (only home cards) | Zoho: full Report builder + dashboard builder. Emerge has: pipeline kanban + notification bell + nothing else. Build a scoped "reports" surface. |
| M15 | **Forecasts** (revenue from `Revenue_per_Position` × filled jobs) | data preserved in `custom_fields.zoho.revenue.*`, no UI | Post-1.0. |
| M16 | **Candidate portal** (candidate logs in → sees applications) | not built | Zoho: `Candidate` profile + Candidate_Portal_User_Status. Only needed if we want candidates to self-service; skip unless a client requests. |
| M17 | **Vendor portal** (agency vendor submits candidates) | not built | Same - skip unless requested. |
| M18 | **Compliance / GDPR module** (consent capture, right-to-erase, auto-delete) | schema stores flags; no workflow | UK org, likely needed. Post-1.0 unless a client asks. |
| M19 | **Sandbox** | not applicable (already have dev + staging DBs) | - |
| M20 | **Custom buttons / custom functions (Deluge)** | not built | Zoho: `Advanced_Dev_Access` - this is the whole extensibility surface. Post-1.0 (or "never" if we ship a proper webhook + workflow engine ourselves). |
| M21 | **Marketplace extensions** | not applicable | - |

### 2.3 LOW - Zoho ships it but zero-data in this org

| Feature | Note |
| ------- | ---- |
| Campaigns module | 0 records; team runs GTM outside the ATS. Skip. |
| To-Dos (Tasks/Calls/Events) | 0 records; team uses external calendar + Zoho Mail. If needed, ship a minimal Tasks module post-1.0. |
| SMS templates + sending | 0 SMS sent/received in timeline; not used. |
| Social publishing (LinkedIn/FB/X/Google+) | Not used. |
| Job board integrations (Indeed/Monster/…) | Zoho activity codes present but 0 imports from any of them in this org's timeline. |
| Territories | Empty on every user. |
| Recruiter Inbox / Zoho Sheet View / Zoho Chat Bar | Not used. |
| Video interviews (Live / Recorded / Google Meet / Teams providers) | 0 interview records anywhere. |
| Sandbox / Manage Subscription / Storage Usage | Admin-only, one-shot. |
| Convert-as-Employee / Convert-as-Temp | Zoho People / Workerly integrations required; not licensed here. |

---

## 3. Data/entity relationship map (Zoho → Emerge)

The imported baseline confirmed by the migration engine and cross-checked
against Zoho's `parent_module` metadata. Cardinality arrows are Zoho→Emerge
one-to-one unless noted; child → parent means "each child row has one parent".

```
users (28 Zoho identities → 21 Emerge users, mapping table user-map.json)
  │
  ├─◄ workspace_id on everything (RLS)
  │
  ├─ companies ← Clients (86 rows)          [Account_Manager → owner_id]
  │    │
  │    ├─ contacts ← Contacts (12)          [Client_Name → company_id, nullable (1 orphan)]
  │    │
  │    └─ jobs ← Job_Openings (101)         [Client_Name REQUIRED, Contact_Name optional,
  │         │                                 Account_Manager → owner_id]
  │         │
  │         ├─ applications ← Applications (763)   [UNIQUE (candidate_id, job_id);
  │         │    │                                    Application_Owner = sourcer;
  │         │    │                                    Application_Status → statusKey +
  │         │    │                                    Hiring_Pipeline → stage]
  │         │    │
  │         │    ├─ application_status_history     [derived from Zoho timeline
  │         │    │                                   activities 11/12/38-43/488]
  │         │    │
  │         │    ├─ notes (subset - 460)          [Parent_Id + se_module='Applications']
  │         │    │
  │         │    ├─ (future) interviews           [Job_Opening_Name + Candidate_Name lookups
  │         │    │                                   in Zoho; on Emerge: application_id]
  │         │    │
  │         │    └─ (future) submissions           [Zoho has a separate module for it;
  │         │                                        Emerge folds it into a status transition]
  │         │
  │         └─ notes (subset - 40)                [Parent_Id + se_module='Potentials']
  │
  ├─ candidates ← Candidates (1,298)          [Candidate_Owner → owner_id; dedupe by lowercased email]
  │    │
  │    ├─ candidate_education ← Educational_Details subform
  │    ├─ candidate_experience ← Experience_Details subform
  │    │
  │    ├─ attachments (kind = cv | formatted_cv | other) ← per-record Zoho attachments API
  │    │                                                    [1,293 flagged Is_Attachment_Present;
  │    │                                                     NOT YET migrated to MinIO]
  │    │
  │    └─ notes (subset - 712)                [Parent_Id + se_module='Leads']
  │
  ├─ notes (all 1,218) + note_mentions        [Zoho crm[user#…#…]crm markup rewritten to
  │                                              Emerge @-mention format for mapped users;
  │                                              646/1218 contained mentions]
  │
  ├─ notifications (Emerge in-app bell)       [empty at cutover - NO historical fan-out;
  │                                              live @-mentions in Emerge notes fan out]
  │
  ├─ audit_log                                 [Emerge minimal audit - auth + membership only;
  │                                              Zoho's 170-activity timeline is per-record
  │                                              and can be imported as history if needed]
  │
  ├─ external_refs (Zoho record id ↔ Emerge id, per entity_type, per workspace) - idempotency backbone
  ├─ import_runs (dry_run | import | delta, running/completed/failed/rolled_back)
  └─ import_records (per-record ledger: created/updated/linked/skipped/failed + pre-image for rollback)

Modules with 0 rows in Zoho → nothing to migrate:
  Interviews (0), Submissions (0), Reviews (0), Campaigns (0), Assessments - templates only,
  To-Dos/Tasks/Calls/Events (0).
```

**Zoho internal aliases** the importer must know (already handled):
Leads = Candidates · Potentials = Job_Openings · Accounts = Clients ·
Products = Interviews · Activities = To_Dos · Questionnaires = Assessments ·
SalesInbox = RecruiterInbox.

**Denormalised fields on child rows** (Emerge should ignore, keep the join):
Applications carry First/Last/Email/Phone/Mobile/LinkedIn/Facebook/Twitter of
the candidate + Job_Opening_Name/ID + Client_Name - all resolvable via ref.
Submissions carry Candidate + Job + Client all as lookups too.

---

## 4. Migration requirements - what has to happen for each gap

Grouped by the M-numbers in section 2.

### 4.1 Data already imported (M8, complete)

- Companies: 86 (Clients). Duplicates flagged (Porsche Consulting x2, near-dupe
  Alpha FMC etc, junk rows "xyz"/"gle"/"My company"). Merge is UI-manual.
- Contacts: 12. One orphan (no Client_Name).
- Candidates: 1,298 (Zoho had 1,296; 2 extras likely delta post-fetch). 358
  no-email preserved with fuzzy-dedupe report.
- Jobs: 101 (all with company).
- Applications: 763. UNIQUE (candidate_id, job_id) intact.
- Notes: 1,218 with parent-resolution and mention rewrite.
- User map: 21 Emerge users, memberships (deactivated for archived Zoho
  identities).

### 4.2 Data pending (still zero in Emerge, present in Zoho)

- **Attachments (candidate CVs)**: 1,293 files. Requires running the
  attachment phase of the migration engine (already coded - was rate-limited
  out of the initial import). ETA: hours (rate-limited).
- **Per-record timelines** ("Zoho activity 11/12/38-43/488"): for
  applications, this becomes `application_status_history` rows. Best-effort
  import - not required for parity, but nice for showing "Ryan moved this to
  Submitted 3 weeks ago" on a candidate card.
- **Notes on Clients/Jobs**: currently attributed if parent module resolves;
  ~40 job notes + 6 client notes were imported. Confirm no regressions.

### 4.3 Feature builds required per gap

Each item lists: **new schema (if any)**, **new API (tRPC)**, **new UI**,
**Zoho fields to import**, **RLS story**.

- **H1 Interviews**
  - Schema: `interviews` (workspace_id, application_id, candidate_id, job_id,
    company_id, interviewer_user_ids uuid[], interviewer_contact_ids uuid[],
    scheduled_start, scheduled_end, meeting_provider enum, venue, status
    enum, cancellation_reason, feedback text, reviewed_by uuid,
    reviewed_at, video_stage enum). `interview_status_history` for the FSM
    (blueprint parity).
  - tRPC: `interviews.{create,update,cancel,reschedule,list,byApplication,
    calendar}`.
  - UI: interview form (dialog inside application detail); interview list; a
    week/day calendar view under a new `/interviews` route.
  - Zoho fields: all 30 from section 1.2.
  - RLS: standard workspace_id.
- **H2 Attachments migration** - engine only (no schema change; existing
  `attachments` table); runs the pending phase.
- **H3 Global search** - one endpoint `search.global(query)` fanning out to
  candidates/jobs/companies/contacts + top-bar UI. Postgres full-text on the
  4 tables.
- **H4 Email from record** - schema: `emails` (workspace_id, entity_type,
  entity_id, direction, from, to[], cc[], subject, body_html, message_id,
  provider_id, sent_at, opened_at, replied_at). tRPC: `emails.{send,list,byRecord}`.
  Send via Resend SMTP that's already wired. Inbound (reply threading) via
  Resend Inbound webhook. UI: an Email tab on candidate/application detail.
- **H5 Career site + web-to-candidate** - deferred; only build when we sign a
  client who wants their own careers page.
- **H6 Resume parser** - already scoped as M7. Reuse an OSS parser (e.g.
  hosted Affinda / Sovren-alternative) or self-host a python service. Feed
  parsed JSON into candidate + subforms.
- **H7 Offer engine** - schema: `offers` (workspace_id, application_id,
  status enum [draft/sent/accepted/declined/withdrawn], sent_at, expires_at,
  accepted_at, declined_at, letter_html, salary_amount, salary_currency,
  start_date, medium enum). `offer_status_history`. UI: "Generate offer" in
  applications kanban.
- **H8 Client portal** - schema: `portal_users` (workspace_id, contact_id,
  email, password_hash, status). Route group `/portal/*` with its own auth.
  Contacts of a client can log in, see the jobs they're on, see submissions,
  approve/reject/comment. Reuse `applications.status_key` transitions.

Medium tier is straightforward - every one of M1-M20 fits one of the same
templates.

---

## 5. Recommended implementation order

Ranked by daily-use impact × build cost × unblocking-Emerge-as-sole-tool.
Milestone tags are proposals; no code exists yet for any of these except the
data-only followups.

### 5.1 Phase 1 (weeks 1-3) - parity for the two things recruiters do every day

**M9 - Attachments migration (data only, no code)** - 1 day
Runs the paused attachment phase; publishes 1,293 CVs. Recruiter can now click
"Download CV" from Emerge.

**M10 - Global search** - 2 days
`search.global()` + top-bar. Removes the single most jarring difference from
Zoho.

**M11 - Interviews module (H1)** - 5-7 days
Schema + tRPC + list/create/reschedule/cancel + interviewer assignment +
feedback capture + blueprint FSM. Read-only calendar view (list, not week
grid) v1; week grid v1.1.

**M12 - Email from record (H4)** - 4-5 days
Outbound via Resend; simple send composer in a "Communication" tab; log
Sent activity in `audit_log`. Skip inbound threading in v1; use Reply-To
header trick.

### 5.2 Phase 2 (weeks 4-6) - hand the workflow to the whole team

**M13 - Client portal (H8)** - 5-7 days
Portal auth, single "My Submissions" page for a contact, approve/reject with
comment, download CV. Contact user status wired.

**M14 - Offer engine (H7)** - 4-5 days
Offers table + generate-from-template + send + accept/decline/withdraw +
expiry cron.

**M15 - Reports v1 (M14)** - 3-4 days
5 baseline reports: jobs by status, applications by stage per recruiter,
time-to-fill, candidate source funnel, submitted-to-client per client.
Static (no report builder), scheduled email delivery via `notes-templates`
pattern.

### 5.3 Phase 3 (weeks 7-10) - everything that unblocks scale

**M16 - Resume parser (H6, M7 milestone)** - 5-7 days including vendor spike.
**M17 - Tags + Custom Views (M1 + M2)** - 3-4 days combined; share the tag
`Taggable` composer + the view-chooser is one route.
**M18 - Mail merge (M9)** - 2-3 days on top of M12 email.

### 5.4 Phase 4 (post-1.0) - only if a client requests

Career site (H5/M10), Formatted resume (M11), Zia matching (M13),
Assessments (M5), Reviews (M6), Approval process (M7), Blueprints (M8),
Custom fields UI (M3), Candidate portal (M16), Vendor portal (M17),
Compliance/GDPR module (M18), Custom buttons/functions (M20).

### 5.5 Never (or replace with our own thing)

Campaigns, SMS templates, social publishing, job-board integrations, sandbox,
Zoho People/CRM/Workerly integrations, marketplace.

---

## 6. What NOT to touch (M1-M5 boundary)

- `users` / `memberships` / `invitations` / `sessions` / `password_reset_tokens`
- `companies` / `contacts` / `tags` / `taggings`
- `candidates` / `candidate_education` / `candidate_experience` /
  `attachments` / `counters`
- `jobs`
- `applications` / `application_statuses` / `application_status_history`

Every new milestone adds tables and routers; nothing above is modified.

---

## 7. Confidence & follow-ups

- API-verified: modules, fields, picklists, profiles, roles, users, timeline
  events, field lookups + parents.
- UI-verified: home dashboard visible in Chrome tab
  ([recruit.zoho.eu](https://recruit.zoho.eu)) - 96 Active Jobs / 767 Applicants
  / pipeline "Screening → Archived" matches Emerge stages.
- **UI drill-downs NOT clicked** (chose depth in API metadata over Chrome
  clicks): Setup > Automation (workflow rules), Setup > Customization
  (layouts), Setup > Portals, per-record right-panel. The Chrome tab is still
  open - happy to open any specific dialog if a decision needs the exact UI
  behaviour (e.g. blueprint transition editor, workflow trigger picker).
- **Not audited**: mobile app parity, offline mode, custom Deluge scripts (not
  used here), extensions installed from marketplace (unknown until Setup >
  Extensions is opened - request if needed).
