# Rolling back a bad release

Rollback has two layers: image and data.

## Image rollback (bad code, DB untouched)

```bash
cd /opt/emerge/app
git fetch --tags
git checkout v0.7.0             # or whatever the last-good tag is
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env build web worker
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env up -d web worker
curl -sSf https://emergeautomation.tech/api/health
```

Traefik keeps serving the old cert; DNS unchanged.

## Data rollback (bad migration or bad import)

The migration engine records every write in `import_records`. Any single M8
import run can be undone:

```bash
docker compose -f /opt/emerge/app/compose.prod.yaml exec web \
  pnpm --filter @emerge/migration cli rollback <run-id>
```

For a general "bad state after a schema migration" scenario, restore from
last night's backup — see [backup-restore.md](./backup-restore.md) Case B.

## DNS rollback

DNS TTL is 300 s at Hostinger, so pointing back to a previous host is a five-
minute revert:

1. Edit A records at Hostinger to the old target IP (or delete them entirely
   to make the domain temporarily unresolvable).
2. Wait ~5 minutes.
