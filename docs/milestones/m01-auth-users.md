# Milestone 1 - Auth, Workspaces, Users & Roles

- Version on completion: **v0.2.0**
- Status: In review (feature/m1-authentication)
- Complexity: **L**

## Objective

Secure multi-user foundation: accounts, sessions, workspaces (tenants), role-based
permissions, and invitations. Every later feature assumes this exists.

## User value

An agency can sign up, create its workspace, invite the team, and control who can do what.

## Features included

- Email + password signup/login (argon2), httpOnly session cookies, logout, password reset
  via emailed token (SMTP config; provider-agnostic)
- Workspace creation on signup; workspace settings page (name, logo)
- Invitations: invite by email with role; accept flow; member list; deactivate member
- Roles v1 (fixed): **Admin** (everything incl. billing/settings/members), **Recruiter**
  (all recruiting objects, no workspace admin), **Read-only**. Custom roles deferred (M18
  revisit). Permission checks server-side on every procedure + RLS policies live from here.
- User profile: name, avatar, timezone
- Audit log (minimal): auth events + member/role changes recorded

## Database changes

`workspaces`, `users`, `memberships` (user x workspace x role), `invitations`, `sessions`,
`audit_log`. RLS enabled pattern established here for all future tables.

## Backend changes

Auth service, session middleware, permission guard helper (`requireRole`), workspace
context injection (sets RLS context per request), invitation emails via worker queue.

## Frontend changes

Auth screens (login, signup, forgot/reset), onboarding (create workspace), members &
invitations settings page, role badge UI, guarded routing.

## API changes

tRPC routers: `auth`, `workspace`, `members`. All future routers build on the
`protectedProcedure` + `workspaceProcedure` middlewares created here.

## Dependencies

M0.

## Acceptance criteria

1. Signup creates user + workspace + Admin membership; login/logout works; sessions
   survive restart (DB-backed) and expire.
2. Password reset round-trip works with a real SMTP target (MailHog in compose).
3. Invited user lands with the assigned role; deactivated member loses access immediately.
4. A Read-only user receives `FORBIDDEN` on any mutation, verified by tests, and the UI
   hides/disables mutation affordances.
5. A user in workspace A can never read workspace B data (RLS test proves it at SQL level).
6. Audit log lists auth + membership events with actor and timestamp.

## Testing requirements

- Integration tests: full auth flows, permission matrix (3 roles x core operations),
  cross-workspace isolation test hitting raw SQL with RLS context.
- Playwright: signup -> invite -> accept -> role-restricted UI.

## Definition of Done

Standard checklist + tag `v0.2.0` + release "Milestone 1 - Authentication & Users".
Commit: `feat: complete authentication and user management`.

## Estimated complexity

L. Session + RLS context plumbing and the permission middleware are foundational and must
be right; everything downstream trusts them.

## Explicitly OUT of scope

- OAuth/SSO login (Google/Microsoft SSO deferred to M18/post-1.0)
- Custom roles, field-level permissions, territories
- Billing/plans (open-source core has none)
- 2FA (M18)

## Issue breakdown

1. M1-01 Schema + migrations: users/workspaces/memberships/invitations/sessions/audit
2. M1-02 Auth service + session middleware + RLS context
3. M1-03 Permission guards + role matrix + tests
4. M1-04 Auth UI (login/signup/reset/onboarding)
5. M1-05 Members & invitations (API + UI + emails)
6. M1-06 Audit log (write path + settings view)
