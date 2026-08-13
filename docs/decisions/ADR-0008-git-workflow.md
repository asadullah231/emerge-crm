# ADR-0008: Git workflow: main/develop/feature/fix/release, Conventional Commits, semver

- Status: Accepted (directed by product owner)
- Date: 2026-08-13

## Decision

Branch model: `main` (production-ready, tagged releases only), `develop` (integration),
`feature/*` (milestone work, e.g. `feature/m3-candidates`), `fix/*`, `release/*`.
Conventional Commits enforced by commitlint. Semantic versioning starting at v0.1.0;
each completed milestone bumps minor, gets a tag and a GitHub release. Full workflow in
[development.md](../development.md).

## Context

Milestone-by-milestone development with the requirement that the repo always shows what
is being built and every milestone leaves a stable state.

## Alternatives considered

- Trunk-based development: simpler, but the product owner requires an integration branch
  and release branches for milestone QA gates.
- GitFlow with hotfix/* as a separate type: folded into `fix/*` against `main`.

## Consequences

Slight merge overhead per milestone; in exchange, `main` is always demoable and every
version is reproducible from a tag.
