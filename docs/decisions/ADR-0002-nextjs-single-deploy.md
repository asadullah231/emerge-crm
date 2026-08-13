# ADR-0002: Next.js App Router as the single web deployable

- Status: Accepted
- Date: 2026-08-13

## Decision

One Next.js (App Router) application serves the recruiter app (client-heavy route group),
the public career portal (SSR for SEO), and the HTTP API (tRPC + later REST routes).
A separate lightweight Node process runs background jobs.

## Context

The recruiter app wants a Linear-like, keyboard-first, optimistic-update feel (which pulls
toward a Vite SPA, Twenty's choice). But the product also needs a public, SEO-indexed career
portal, and the self-host promise is "one docker compose up". Cal.com and Documenso prove
the Next.js path for open-source SaaS.

## Alternatives considered

- Vite SPA + NestJS API (Twenty's stack): best app feel, but two frontends would still be
  needed for the career portal, plus a separate API server: three deployables, heavier ops.
- Remix/other metaframeworks: viable but smaller ecosystem for our dependency set.

## Reason

Fewest moving parts for self-hosters and for development; the app routes remain fully
client-interactive inside Next.js, so the UX goal is not sacrificed.

## Consequences

We must be disciplined that app routes stay client-heavy (no RSC waterfalls on hot paths).
If the app ever outgrows Next.js, the tRPC layer is the seam to extract a standalone API.
