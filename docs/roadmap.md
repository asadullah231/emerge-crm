# Development Roadmap

Product: modern open-source Recruitment CRM / ATS (agency-first).
Reference for workflows and entities: OpenCATS. Competitive bar: Zoho Recruit Staffing edition.

Every milestone produces a usable, testable increment and leaves the repository in a stable,
working state. Each milestone has a full spec in `docs/milestones/`.

## Versioning

Semantic versioning. Each completed milestone bumps the minor version and gets a git tag +
GitHub release. `v1.0.0` ships at Milestone 19.

## Phases

- **Phase 1 - Core ATS (M0-M8):** everything an agency needs to run a desk internally.
  At the end of M8 the product is a usable MVP for a real recruiter.
- **Phase 2 - Recruiting depth (M9-M15):** the features that make it competitive with
  Zoho Recruit: portals, interviews, offers, email, matching, automation, analytics.
- **Phase 3 - Platform (M16-M19):** candidate portal, public API, hardening, v1.0.

## Milestone overview

| #   | Milestone                                     | Version | Depends on   | Complexity |
| --- | --------------------------------------------- | ------- | ------------ | ---------- |
| M0  | Project Foundation                            | v0.1.0  | -            | M          |
| M1  | Auth, Workspaces, Users & Roles               | v0.2.0  | M0           | L          |
| M2  | Companies & Contacts                          | v0.3.0  | M1           | M          |
| M3  | Candidates & CV Upload                        | v0.4.0  | M1           | L          |
| M4  | Jobs                                          | v0.5.0  | M2           | M          |
| M5  | Applications & Pipeline Board                 | v0.6.0  | M3, M4       | L          |
| M6  | Activity Timeline, Tasks & Notes              | v0.7.0  | M2, M3, M4   | L          |
| M7  | Resume Parsing & Document Management          | v0.8.0  | M3           | L          |
| M8  | Search, Filters, Saved Views & Custom Fields  | v0.9.0  | M2-M5        | XL         |
| M9  | Career Portal & Public Apply                  | v0.10.0 | M4, M5, M7   | M          |
| M10 | Interviews & Scheduling                       | v0.11.0 | M5, M6       | L          |
| M11 | Offers & Placements                           | v0.12.0 | M5, M10      | M          |
| M12 | Email Integration                             | v0.13.0 | M6           | XL         |
| M13 | Candidate Matching & Semantic Search          | v0.14.0 | M7, M8       | L          |
| M14 | Automation: Stage Rules, Sequences & Webhooks | v0.15.0 | M5, M12      | XL         |
| M15 | Reports & Analytics                           | v0.16.0 | M5, M10, M11 | L          |
| M16 | Candidate Portal                              | v0.17.0 | M9, M5       | M          |
| M17 | Public API, Import/Export & Integrations      | v0.18.0 | M8           | L          |
| M18 | Security, Performance & Production Hardening  | v0.19.0 | all          | L          |
| M19 | v1.0 Production Release                       | v1.0.0  | M18          | M          |

Complexity scale: S (days), M (about a week), L (1-2 weeks), XL (2-3 weeks, consider splitting
into sub-issues aggressively). Estimates assume one primary developer plus AI tooling.

## Dependency notes

- M2 (Companies & Contacts) precedes M4 (Jobs) because agency jobs belong to client companies
  and have a contact as hiring contact. This mirrors OpenCATS (joborder -> company, contact).
- M5 (Applications) is the pipeline-bearing object joining Candidate and Job, modeled after
  OpenCATS `candidate_joborder` but with proper stage history. Kanban board ships here too:
  a pipeline without a board is not a usable increment.
- M6 (Timeline) introduces the domain event bus. Everything after M6 emits events into it,
  which is why it sits before parsing, interviews, email, and automation.
- M7 (Parsing) precedes M9 (Career Portal) so public applicants get parsed on arrival, and
  precedes M13 (Matching) which needs structured profiles.
- M8 (Search/Views/Custom Fields) closes Phase 1 because filters and saved views need all
  core objects to exist first.
- M12 (Email) deliberately sits after the timeline and before automation: sequences (M14)
  need reply detection from email sync to auto-unenroll candidates.
- M14 (Automation) depends on M5 (stage-change events) and M12 (email sending/replies).
- M17 exposes the public REST API. Internal API exists from M1 onward; M17 is versioning,
  API keys, docs, and CSV import/export at scale. A basic candidate CSV import ships earlier
  (M3) because migrating recruiters need their data on day one.

## Out of scope for v1.0 (explicitly deferred)

- Temp/contract back office: timesheets, shifts, pay & bill (Vincere territory). Phase 4+.
- Job board multiposting network (Indeed feed ships in M9; the 75-board network does not).
- Video interviews, assessments, background-check integrations, e-sign (integration points
  reserved in M11/M17, implementations post-1.0).
- Chrome/LinkedIn sourcing extension (post-1.0, high priority).
- WhatsApp/SMS channels (post-1.0; sequences engine in M14 is built channel-agnostic).
- Native mobile apps (the web app must be responsive; PWA acceptable).
- Client portal (post-1.0; formatted CV sharing in M11 covers the near-term agency need).

## Release process per milestone

1. All acceptance criteria in the milestone doc pass.
2. Tests, lint, and production build pass in CI.
3. Documentation updated (including this file's status column).
4. `release/vX.Y.0` branch -> final checks -> merge to `main`.
5. Tag `vX.Y.0`, create GitHub release titled `Milestone N - <name>`.
6. Merge back to `develop`, open next milestone.

See [development.md](development.md) for the full workflow.
