# Milestone 18 - Security, Performance & Production Hardening

- Version on completion: **v0.19.0**
- Status: Not started
- Complexity: **L**

## Objective

Make the product safe and boring to run in production: security review, 2FA + SSO,
performance targets enforced, operability (backup/restore, upgrades, observability),
and a hostile-eyes pass over the whole attack surface.

## User value

Agencies trust the system with their most sensitive asset (candidate data); self-hosters
get a system that upgrades and restores without fear.

## Features included

- Security: full OWASP pass (authz matrix re-audit incl. portal realm, injection, SSRF
  on webhook/feed fetchers, upload handling, template renderer sandbox), dependency
  audit + lockfile policy, secrets handling review, CSP + security headers, session
  hardening, brute-force lockouts + credential-stuffing protection
- 2FA (TOTP + recovery codes); SSO: Google + Microsoft OAuth login (maps to existing
  users; SAML/OIDC enterprise SSO post-1.0)
- Rate limiting coverage across all public + authenticated surfaces (consistent policy)
- Performance: P95 budgets enforced in CI perf suite on the 10k+100k seed (list <300ms,
  record page <400ms, search <150ms, board move <200ms round-trip); N+1 sweep; index
  audit against real query plans
- Operability: versioned upgrade path (`docker compose pull` + auto-migrations with
  pre-migration backup), documented backup/restore (Postgres + MinIO) with tested
  restore drill, health/readiness endpoints, structured logs, error tracking (Sentry-
  compatible, opt-in), basic metrics endpoint (Prometheus)
- Data protection finishers: encryption-at-rest guidance, retention policy job
  (workspace-configurable auto-anonymization of stale candidates: GDPR), incident
  response runbook in docs
- External penetration test window (findings triaged; blockers fixed in-milestone)

## Database changes

Only what audits force (indexes, constraints); retention/anonymization job tables.

## Backend changes

2FA/SSO, limiter middleware unification, perf fixes, telemetry endpoints.

## Frontend changes

2FA enrollment UI, SSO buttons, security settings page; perf fixes (bundle audit,
route-level code splitting verification).

## API changes

None new; hardening of everything existing.

## Dependencies

All previous milestones (this hardens the sum).

## Acceptance criteria

1. Independent security checklist (documented in repo) passes; pen-test blockers
   resolved; report summary committed (redacted).
2. 2FA + both SSO providers work incl. recovery and unlink flows.
3. CI perf suite green on all P95 budgets against the 100k-candidate seed.
4. Restore drill: nuke containers -> restore from backup -> workspace fully functional
   (documented, timed, repeatable).
5. Upgrade drill: v0.18 -> v0.19 via compose pull with automatic migration + rollback
   path verified.
6. Retention job anonymizes per policy and is fully audited.

## Testing requirements

- Security regression suite (authz matrix as code), perf suite in CI, chaos-lite drills
  (worker kill mid-job, Redis restart) with no data loss.

## Definition of Done

Standard checklist + tag `v0.19.0` + release "Milestone 18 - Hardening".

## Estimated complexity

L (wide, not deep: mostly disciplined sweeps).

## Explicitly OUT of scope

- SOC2/ISO certification work, enterprise SAML/SCIM, field-level encryption, multi-
  region/HA topologies (documented as future ops work)

## Issue breakdown

1. M18-01 OWASP + authz re-audit + fixes
2. M18-02 2FA + SSO
3. M18-03 Perf suite + budgets + fixes
4. M18-04 Backup/restore + upgrade drills + docs
5. M18-05 Observability (logs/metrics/errors)
6. M18-06 Retention/anonymization + runbooks
7. M18-07 Pen test window + triage
