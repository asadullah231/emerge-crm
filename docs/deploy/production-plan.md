# Production Deployment Plan — Emerge CRM

Target: **https://emergeautomation.tech**
Status: **DECISIONS LOCKED 14 Aug 2026** — Option A + Hostinger DNS + Resend
SMTP + Cloudflare R2 backup. Review PR opened with compose/health/runbook.
Rule: M1–M5 functionality, DB schema, and completed milestones stay untouched.

---

## 1. What we have today (inspected)

**Repo build shape**

- Monorepo, pnpm 10, Node 22. Root `pnpm build` runs every workspace's build.
- `apps/web`: Next.js 15 (React 19, tRPC 11, Tailwind 4). Ships a **standalone**
  build behind `BUILD_STANDALONE=1` env; runtime is a single `node apps/web/server.js`.
  Multi-stage `apps/web/Dockerfile` already present.
- `apps/worker`: BullMQ consumer for background jobs (mention notifications
  etc.). Own `Dockerfile`, `pnpm start`.
- `packages/db`: Drizzle schema + migrations. `pnpm db:migrate` applies them.
- `packages/migration`: the Zoho importer (M8), CLI `emerge-migrate`.
- Dev `docker-compose.yml` already defines: postgres 16, redis 7, minio,
  mailhog, web, worker with named volumes + healthchecks.
- CI (github.com/asadullah231/emerge-crm): CI + Commitlint + Compose smoke +
  E2E smoke run on every PR; last release v0.8.0 all green.

**Runtime env vars used by app code** (from `grep process.env.`)

`DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_BUCKET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, `SMTP_FROM`, `NEXT_PUBLIC_APP_URL`, `NODE_ENV`. Nothing else.
(An auth-cookie secret is not read from env today — noted below as a gap.)

**Auth model**: DB sessions + argon2id (M1). No external OAuth / provider —
one less thing to configure.

**VPS state (Hostinger, 187.127.75.106, per project memory + secrets file)**

Already running there:

- `emerge-pg` — Postgres 16 on :15432 (dev DB; **holds all Zoho-imported data
  in workspace `019ffbfe-fa0e-7b43-8783-b191af0bd76f Emergetech`**).
- `emerge-redis` on :16379.
- `emerge-minio` on :19000 API + :19001 console, bucket `emerge`.
- `airvana-supabase` stack under `/opt/airvana-supabase/docker`.
- `n8n` (also our SSH bridge because external SSH port is blocked).

Secrets live in `D:/Projects/.secrets/master.env` under `EMERGE_DEV_*` keys.

---

## 2. Naming decision to lock first

The "dev" DB on the VPS now holds real Zoho data (the production import that
just ran). Two clean paths — pick one before we cut over:

**Option A — Promote in place (recommended).**
Rename mental model: what we've been calling "dev" IS production. We rotate
the passwords (they were set as "dev_" strings) but keep the containers,
volumes and workspace uuid. Data continuity, zero re-import. Downside: dev DB
and prod DB are the same thing until we later spin up a fresh dev DB
elsewhere.

**Option B — Fresh prod stack alongside.**
New containers `emerge-pg-prod` (:15433), `emerge-redis-prod` (:16380),
`emerge-minio-prod` (:19002), fresh secrets. Re-run the Zoho snapshot +
import into a new prod workspace. Keeps dev sandbox available. Downside: two
DBs to keep in sync, twice the disk, and today's imported data becomes the
"dev copy".

Everything below assumes **Option A** unless you say otherwise.

---

## 3. Proposed production topology

```
    Cloudflare DNS (emergeautomation.tech)
              │
              ▼
    Hostinger VPS 187.127.75.106
    ─────────────────────────────
    :80/:443 ─▶ Traefik (reverse proxy, Let's Encrypt HTTP-01)
                       │
                       ├── emergeautomation.tech        → emerge-web:3000
                       ├── minio.emergeautomation.tech  → emerge-minio:9000 (S3 API)
                       └── (optional) console.emerge…   → emerge-minio:9001
    Docker network `emerge-prod-net` (bridge, internal-only):
      emerge-web (:3000, standalone build, restart:always)
      emerge-worker (BullMQ, restart:always)
      emerge-pg (Postgres 16, volume emerge_pg_data, no host port)
      emerge-redis (:6379 internal only, volume emerge_redis_data)
      emerge-minio (:9000 API, :9001 console, volume emerge_minio_data)
```

Everything on the internal Docker network — only Traefik exposes 80/443.
The old host ports (:15432 / :16379 / :19000 / :19001) get closed to the
public internet; internal containers keep using the aliases.

---

## 4. What we set up, subsystem by subsystem

### 4.1 Production build & container image

- Add a `docker-compose.prod.yml` (or `compose.prod.yaml`) that reuses the
  existing service definitions but adds `restart: always`, drops MailHog,
  drops host port mappings for Postgres/Redis/MinIO, and mounts the volumes
  under `/opt/emerge/data/{postgres,redis,minio}`.
- Build web + worker images from the existing Dockerfiles (already
  standalone; nothing to change).
- Deploy method: git-based pull on the VPS + `docker compose pull && up -d`,
  triggered by an n8n workflow (we already use n8n for SSH). Later we can
  wire a GitHub Actions build-and-push → registry pipeline; not needed for
  first go-live.

### 4.2 Domain / DNS

- Domain **emergeautomation.tech** — confirm ownership: which registrar? If
  it's on Cloudflare already (we use Cloudflare for the OpenRent stack per
  memory), we add records there. Otherwise: pick where.
- Records (Cloudflare, DNS-only / grey cloud initially so Let's Encrypt
  HTTP-01 works cleanly; toggle proxy on later if we want):
  - `A emergeautomation.tech          → 187.127.75.106`
  - `A minio.emergeautomation.tech    → 187.127.75.106` (needed for S3 uploads over HTTPS)
  - optional `A console.emerge…       → 187.127.75.106` (MinIO admin console)

### 4.3 HTTPS / TLS

- **Traefik v3** as reverse proxy + ACME (Let's Encrypt). One container,
  labels drive per-service routing. HTTP-01 challenge on :80, redirect all
  http → https, HSTS on.
- Certs stored on a `traefik-letsencrypt` volume, auto-renewing.

### 4.4 Environment variables & secrets

- Two secret files:
  1. `D:/Projects/.secrets/master.env` gets a new block `EMERGE_PROD_*`
     containing the rotated passwords, S3 keys, session secret and SMTP.
  2. On the VPS: `/opt/emerge/.env` — 600, root-owned, sourced by
     `docker compose --env-file`. Never committed anywhere.
- **Rotate every secret** (they were dev placeholders):
  `EMERGE_PROD_PG_PASSWORD` (Postgres), `EMERGE_PROD_REDIS_PASSWORD`
  (Redis 7 supports `requirepass`; add to URL), `EMERGE_PROD_S3_ACCESS_KEY`
  - `EMERGE_PROD_S3_SECRET_KEY` (MinIO root user), new `EMERGE_PROD_S3_BUCKET`
    (or reuse `emerge`), `SESSION_COOKIE_SECRET` **new** (add support in
    apps/web session code — currently uses argon2 but signs cookies with an
    implicit default; needs a hard secret in prod).
- SMTP: pick a real provider. Options I'd default to:
  - **Resend** or **Postmark** for transactional (mention notifications,
    invitations) — cheapest, easy DKIM. Adds `SMTP_HOST/PORT/USER/PASS/FROM`.
  - Or SES if you already have AWS.
- `NEXT_PUBLIC_APP_URL=https://emergeautomation.tech`.

### 4.5 Database

- Postgres 16 stays where it is (Option A). Actions:
  - `ALTER USER emerge PASSWORD '<rotated>'` and rewrite `DATABASE_URL`.
  - Set `pg_hba.conf` (via env or config) so `emerge_app` role still exists
    (RLS depends on it — created by migration `0002_rls_policies.sql`).
  - Move the container off host port :15432; keep it internal-only.
  - Confirm `pg_isready` healthcheck is on the compose file.
- Run `pnpm db:migrate` once against prod DATABASE_URL to prove the
  migration chain is clean on this box (all 14 migrations already applied,
  should be a no-op).

### 4.6 Persistent storage

- Bind-mount volumes to a predictable host path so backups can see them:
  - `/opt/emerge/data/postgres` → Postgres data dir
  - `/opt/emerge/data/redis` → Redis AOF
  - `/opt/emerge/data/minio` → MinIO buckets
- MinIO bucket lifecycle policy for CV uploads (already used from M3 with
  `bucket=emerge`): versioning ON, no auto-delete for v1.
- Enable Redis AOF (`appendonly yes`) so job queue survives restarts.

### 4.7 Automatic restart & process supervision

- Docker Compose `restart: always` on every service.
- One systemd unit `emerge-crm.service` that runs
  `docker compose -f /opt/emerge/compose.prod.yaml up -d` on boot as a safety
  net (in case dockerd restarts before compose autostart kicks in).
- Traefik itself `restart: always`.

### 4.8 Logging

- Docker's default JSON driver rotated: add
  ```
  logging:
    driver: json-file
    options: { max-size: "50m", max-file: "5" }
  ```
  on every service (that's ~250 MB per service cap, disks won't fill).
- On the VPS, ship container logs to journald optionally; not required for v1.
- Application logs: Next.js + tRPC already log to stdout — captured by the
  above.

### 4.9 Health check

- Add `apps/web/src/app/api/health/route.ts` returning
  `{ status: "ok", db: <ping>, redis: <ping>, s3: <ping-optional>, sha: <git> }`.
  This is NEW code but does NOT touch M1–M5 behaviour.
- Traefik label `traefik.http.services.emerge-web.loadbalancer.server.healthcheck.path=/api/health`.
- Compose healthcheck: `curl -f http://localhost:3000/api/health`.
- Uptime probe: a n8n workflow hitting the URL every 5 min → WhatsApp/GHL on
  failure. Reuses our existing alerting.

### 4.10 Backup strategy

- **Postgres**: nightly `pg_dump -Fc` at 02:00 UTC to
  `/opt/emerge/backups/pg/YYYY-MM-DD.dump`; keep 30 daily + 12 monthly.
  Off-box copy via `rclone` to a bucket (need to pick storage: Backblaze B2
  is cheapest; Cloudflare R2 also fine). Cron via a `postgres-backup`
  sidecar container running `postgres:16-alpine` + `rclone`.
- **MinIO**: nightly `mc mirror emerge/emerge s3-remote/emerge-backup` to
  the same remote bucket.
- **App code**: already in Git.
- **Restore drill**: monthly, restore latest dump into a scratch container
  and open a psql prompt; a small runbook in `docs/runbook/restore.md`.

### 4.11 Security posture

- UFW / firewall on the VPS: 80, 443, 22 (whitelisted IPs), nothing else
  publicly exposed. Docker internal network keeps DBs private.
- Cloudflare (if we use it): proxied cloud + Full (Strict) TLS mode after
  cutover, WAF managed rules on.
- Session cookies: `Secure`, `HttpOnly`, `SameSite=Lax` (verify current
  code; small change if not already set).
- Rate limit / basic bot filter on `/api/trpc/*.login` in front of Traefik
  (optional v1.1).

---

## 5. Cutover sequence (what happens when you say go)

1. Confirm decisions in §2 (Option A vs B) and §4 (registrar, SMTP
   provider, backup bucket).
2. Add the new files to the repo — non-destructive, PR-reviewed:
   - `docker-compose.prod.yaml`
   - `apps/web/src/app/api/health/route.ts` (health endpoint)
   - `docs/deploy/README.md` + `docs/runbook/*.md`
3. Prepare `D:/Projects/.secrets/master.env` block `EMERGE_PROD_*`; generate
   the fresh passwords + session secret.
4. Point DNS records at 187.127.75.106.
5. On the VPS (via n8n SSH):
   - `mkdir -p /opt/emerge/{data,backups}` and set perms.
   - Write `/opt/emerge/compose.prod.yaml` + `/opt/emerge/.env` from the
     new secrets.
   - Pull the repo (or receive built images) into `/opt/emerge/app`.
   - `docker compose -f compose.prod.yaml pull && up -d traefik postgres redis minio`.
   - Rotate Postgres/MinIO passwords **inside the containers** and update
     `.env` to match; restart web + worker.
   - `docker compose up -d web worker`.
6. Wait for Let's Encrypt to issue certs (usually < 60 s).
7. `curl https://emergeautomation.tech/api/health` → expect 200.
8. Log in as Asad, spot-check the imported dataset renders (Porsche
   Consulting benchmark chain from Phase B).
9. Enable the backup cron; run one manual dump to confirm it lands in the
   remote bucket.
10. Add DNS check + `/api/health` polling to the n8n uptime workflow.

Rollback plan at every step: DNS TTL 300 s, so pointing back to Vercel or
whatever previous host is a five-minute revert. The old containers on the
existing dev ports stay in place until we're confident.

---

## 6. Decisions (locked 14 Aug 2026)

1. **Option A** — promote current DB in place (data continuity, no re-import).
2. **DNS on Hostinger** — the domain stays with Hostinger; we add A records
   there.
3. **SMTP = Resend** — verify `emergeautomation.tech` domain there, mint an
   API key.
4. **Off-site backup = Cloudflare R2** — bucket `emerge-crm-backup`, S3-compat
   token with Object Read & Write.
5. **SSH** — keep as-is: external SSH stays closed at Hostinger; we operate
   the VPS via n8n's SSH node (existing `grMG9FFshdYwLVc7` credential).
6. **MinIO** — expose only the S3 API on `minio.emergeautomation.tech`;
   admin console stays internal.

## 7. Open items still gated on your green light

- Rotated secrets for `EMERGE_PROD_*` block in `master.env`.
- Cloudflare R2 bucket + token.
- Resend domain verification.
- The actual VPS cutover (compose up, volume promotion, DNS switch).

These are the only steps that touch the outside world; the compose file,
health endpoint, and runbooks are already in the review PR.

---

## 7. What I did NOT do (and won't until you say)

- No files were pushed to the repo yet — everything above is intent.
- No changes to the VPS.
- No secrets rotated.
- No DNS changed.
- No M1–M5 code, DB schema or migrations touched.

When you say go, I'll open a `feat/production-deploy` PR first (compose
file, health endpoint, docs) so every change is review-visible before it
lands on the VPS.
