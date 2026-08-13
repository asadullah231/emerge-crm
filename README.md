# Emerge CRM

A modern, open-source Recruitment CRM / Applicant Tracking System for staffing agencies.
Functional reference: OpenCATS. Competitive target: Zoho Recruit (Staffing Agency edition).

> Status: **Milestone 0 in progress** (v0.1.0: project foundation).
> Roadmap approved 13 Aug 2026; development runs milestone by milestone.

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

**[Milestone 0 - Project Foundation](docs/milestones/m00-foundation.md)** (v0.1.0): monorepo,
Docker Compose stack, CI quality gates, app shell.

## Quick start (development)

```
cp .env.example .env
docker compose up -d postgres redis minio
pnpm install
pnpm db:migrate
pnpm dev
```

Or boot everything (including web + worker) with `docker compose up`.
