# API Conventions

> This page records the contract conventions; endpoint documentation is added per milestone.

## Internal API (tRPC) - live from M1

- Routers per domain: `auth`, `workspace`, `members` (live), then `companies`, `contacts`,
  `candidates`, `jobs`, `applications`, `pipeline`, `tasks`, `notes`, `documents`, ...
- Every procedure requires an authenticated session and enforces workspace scope + role
  permission server-side. No client-trusted authorization.
- Input validation with Zod on every procedure; errors returned as typed error codes
  (`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`), never raw exceptions.
- List procedures: cursor pagination (`limit`, `cursor`), consistent
  `{ items, nextCursor }` envelope; filtering/sorting params mirror the Views engine (M8).

### Middleware stack (apps/web/src/server/trpc.ts, established in M1)

Every future router builds on these; do not hand-roll auth checks.

| Procedure            | Guarantees                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publicProcedure`    | None. Auth surface only (login, signup, password reset, invitation acceptance).                                                                                                          |
| `protectedProcedure` | Valid DB-backed session cookie; `ctx.session` present. UNAUTHORIZED otherwise.                                                                                                           |
| `workspaceProcedure` | protected + runs inside the RLS workspace transaction (`ctx.tx`, `ctx.workspaceId`, `ctx.role`); mutations FORBIDDEN for read-only members; failed procedures roll the transaction back. |
| `adminProcedure`     | workspaceProcedure + admin role. Members, workspace settings, audit log.                                                                                                                 |

### Live routers (M1)

- `auth`: `signup`, `login`, `logout`, `me`, `requestPasswordReset`, `resetPassword`,
  `updateProfile`. Sessions are httpOnly cookies backed by the `sessions` table
  (SHA-256 token hashes, 30-day expiry).
- `workspace`: `update` (admin), `auditLog` (admin, RLS-scoped, newest first).
- `members`: `list`, `pendingInvitations` (admin), `invite` (admin; queues the email and
  returns a one-time shareable accept link), `revokeInvitation`, `changeRole` (last-admin
  guard), `deactivate` (kills the member's sessions immediately), `reactivate`, plus the
  public accept flow: `invitationInfo`, `acceptInvitationExisting`, `acceptInvitationSignup`.

## Public API (REST, OpenAPI) - M17

- Versioned base path `/api/v1/`; API-key auth (`Authorization: Bearer`), per-key scopes
  and rate limits.
- Resources mirror core objects: `/candidates`, `/companies`, `/contacts`, `/jobs`,
  `/applications`, plus `/webhooks` management.
- OpenAPI spec generated from the same Zod schemas as tRPC (single source of truth) and
  published with the docs site.
- Webhooks (M14) deliver domain events (`application.stage_changed`, `candidate.created`,
  ...) with HMAC signatures and retry/backoff.

## Career portal endpoints (M9)

- Public, unauthenticated, rate-limited: job list, job detail, apply (multipart with CV).
- Anti-abuse: honeypot + rate limit; no CAPTCHA dependency in core.
