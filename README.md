# Emerge CRM

A modern, open-source Recruitment CRM / Applicant Tracking System for staffing agencies.
Functional reference: OpenCATS. Competitive target: Zoho Recruit (Staffing Agency edition).

> Status: **v0.1.0 released** (Milestone 0: Project Foundation complete).
> Next up: Milestone 1 - Auth, Workspaces, Users & Roles.

## Why this exists

- No open-source or self-hostable product offers a modern agency ATS. OpenCATS is the only
  agency-oriented option and it is 2005-era PHP with no API, no AI, and a dated UI.
- Zoho Recruit wins on breadth and price but loses on speed, UX, and add-on pricing creep.
  Those are the openings this product attacks: fast, recruiter-first, no nickel-and-diming.

## Documentation

| Doc                                          | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| [docs/roadmap.md](docs/roadmap.md)           | Full milestone roadmap and versioning plan                     |
| [docs/architecture.md](docs/architecture.md) | Proposed technical architecture                                |
| [docs/development.md](docs/development.md)   | Git workflow, branching, commits, releases, Definition of Done |
| [docs/database.md](docs/database.md)         | Database conventions and entity overview                       |
| [docs/api.md](docs/api.md)                   | API conventions                                                |
| [docs/decisions.md](docs/decisions.md)       | Architecture Decision Record index                             |
| [docs/milestones/](docs/milestones/)         | One detailed spec per milestone                                |

## Current milestone

**[Milestone 1 - Auth, Workspaces, Users & Roles](docs/milestones/m01-auth-users.md)** (v0.2.0)
is next. Completed: [M0 - Project Foundation](docs/milestones/m00-foundation.md) (v0.1.0).

## Quick start (development)

```
cp .env.example .env
docker compose up -d postgres redis minio mailhog
pnpm install
pnpm db:migrate
pnpm dev
```

Then open http://localhost:3000, create your account and workspace, and invite your team
from Settings -> Members. Emails (password reset, invitations) land in MailHog at
http://localhost:8025 during development.

Or boot everything (including web + worker) with `docker compose up`.
