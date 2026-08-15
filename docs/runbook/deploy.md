# Shipping a new release

Prereq: the release is on `main` with a tag (see [../roadmap.md](../roadmap.md)
release process).

```bash
# On the VPS
cd /opt/emerge/app
git fetch --tags
git checkout v0.9.0                # the new tag
IMAGE_TAG=v0.9.0 docker compose -f compose.prod.yaml --env-file /opt/emerge/.env build web worker
IMAGE_TAG=v0.9.0 docker compose -f compose.prod.yaml --env-file /opt/emerge/.env up -d web worker

# Migrations (idempotent). Run BEFORE swapping traffic if the migration is
# backwards-compatible; run AFTER if it is not (but we don't do incompatible
# migrations — every change ships behind an additive schema).
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env exec web \
  pnpm --filter @emerge/db migrate

# Verify
curl -sSf https://crm.crm.emergeautomation.tech/api/health | jq
```

## Zero-downtime notes

- Next.js standalone runtime + Traefik healthcheck means a rebuild spins up
  the new container and only routes to it once `/api/health` returns 200.
- Compose `up -d web` recreates the web container; there's a ~5 s gap while
  Traefik notices. For true zero-downtime we'd add a second replica —
  overkill for v1; note it for later.

## After deploy

- Check that the previous night's backup ran (`docker logs emerge-backup`).
- Watch web logs for 1–2 minutes: `docker logs -f emerge-web`.
