# Development Workflow

## Repository

GitHub, single monorepo. Repo name and org: **pending decision** (see open questions in
roadmap approval). The repository must always show which milestone is in progress via
GitHub Milestones and the pinned project board.

## Branching model

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Production-ready code only | Never commit directly. Only `release/*` and `fix/*` merge here. Every merge is tagged. |
| `develop` | Integration branch for the current milestone | Only via PR from `feature/*` or `fix/*`. Must always build and pass tests. |
| `feature/*` | Milestone or feature work | Branched from `develop`. One branch per milestone (sub-branches allowed for big milestones). |
| `fix/*` | Bug fixes | From `develop` (or `main` for hotfixes, then back-merged). |
| `release/*` | Release preparation | From `develop` when a milestone hits code-complete. Version bump, changelog, final QA. Merges to `main` and back to `develop`. |

### Branch naming

- `feature/m1-authentication`
- `feature/m2-companies-contacts`
- `feature/m3-candidates`
- `feature/m5-applications-pipeline`
- `fix/candidate-search-pagination`
- `release/v0.2.0`

## Commit convention

Conventional Commits, enforced by commitlint in CI:

- `feat: add candidate management`
- `fix: resolve candidate filtering issue`
- `refactor: simplify candidate service`
- `test: add candidate API tests`
- `docs: update candidate documentation`
- `chore: update dependencies`

Scopes are encouraged for clarity: `feat(candidates): add tag editor`.

## GitHub structure

Hierarchy: **Milestone -> Issues -> task checklists -> Pull Requests -> Release.**

- One **GitHub Milestone** per roadmap milestone, named `M3 - Candidates`, with due date
  and description linking to `docs/milestones/m03-candidates.md`.
- Every milestone is broken into **Issues** before implementation starts. Each issue carries:
  objective, scope, acceptance criteria, dependencies, implementation notes (the issue lists
  in each milestone doc are the source; they get pasted into GitHub when the milestone opens).
- A **GitHub Project board** (Todo / In Progress / In Review / Done) tracks the current
  milestone. The board and the open GitHub Milestone are the single source of "what is being
  built right now".
- PRs reference their issue (`Closes #31`), target `develop`, and require green CI.

## Milestone completion checklist (Definition of Done)

A milestone is complete only when ALL of the following hold. "Works on my machine" is not done.

- [ ] All planned functionality implemented
- [ ] Database migrations complete, reversible, and run clean on a fresh database
- [ ] API endpoints tested (integration tests)
- [ ] UI states tested: happy path, error states, loading states, empty states
- [ ] Permission checks verified for every new endpoint and view
- [ ] Lint passes (`pnpm lint`)
- [ ] All tests pass (`pnpm test`)
- [ ] Production build passes (`pnpm build`)
- [ ] Docs updated: milestone doc, database.md, api.md, roadmap status
- [ ] All acceptance criteria in the milestone doc verified
- [ ] No known blocking bugs (open non-blockers become issues on the next milestone)
- [ ] Release branch merged to `main`
- [ ] Git tag `vX.Y.0` created
- [ ] GitHub release published: `Milestone N - <Name>` with changelog

## Release flow example (Milestone 1)

1. `feature/m1-authentication` -> PRs -> `develop`
2. Code-complete: branch `release/v0.2.0` from `develop`
3. Final QA + version bump + changelog on the release branch
4. Merge `release/v0.2.0` -> `main`
5. Commit: `feat: complete authentication and user management`
6. Tag: `v0.2.0`
7. GitHub Release: "Milestone 1 - Authentication & Users"
8. Merge `main` back into `develop`; open `feature/m2-companies-contacts`

## Ground rules

- Do not work directly on `main`. Ever.
- Do not implement features that belong to future milestones. If a future feature becomes
  tempting mid-milestone, file an issue on its milestone instead.
- Every milestone leaves `develop` and `main` in a stable, working state.
- No silent architecture decisions: anything structural gets an ADR in `docs/decisions/`
  before or alongside the change (see [decisions.md](decisions.md)).
