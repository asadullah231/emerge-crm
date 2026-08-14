# Backup & restore

## Backup

Ran by the `emerge-backup` sidecar every night at **02:00 UTC** (config:
`BACKUP_SCHEDULE_HOUR_UTC` in `/opt/emerge/.env`). Steps per run:

1. `pg_dump --format=custom --compress=9` → `/opt/emerge/backups/emerge-YYYY-MM-DD-HHMMSS.dump`
2. Upload the dump to `r2://emerge-crm-backup/postgres/`.
3. `mc mirror` the MinIO bucket to `r2://emerge-crm-backup/attachments/`.
4. Prune: keep last 30 daily dumps locally; keep first-of-month for the last
   12 months.

Manual run (also useful before risky operations):

```bash
docker exec emerge-backup /usr/local/bin/pg-backup.sh
docker exec emerge-backup /usr/local/bin/minio-mirror.sh
```

## Restore — Postgres

**Case A: restore into a fresh scratch container (drill / dev copy)**

```bash
# 1. Fetch the dump you want.
mc cp r2/emerge-crm-backup/postgres/emerge-2026-08-14-020000.dump /tmp/

# 2. Spin up an empty Postgres just for the restore.
docker run --rm -d --name pg-restore -e POSTGRES_PASSWORD=temp -p 15432:5432 postgres:16-alpine
sleep 5
docker exec pg-restore psql -U postgres -c "CREATE DATABASE emerge_restore;"

# 3. Restore.
pg_restore --dbname=postgres://postgres:temp@localhost:15432/emerge_restore \
           --no-owner --no-acl /tmp/emerge-2026-08-14-020000.dump

# 4. Poke around, then tear down.
docker stop pg-restore
```

**Case B: overwrite the production DB (disaster recovery — LAST RESORT)**

Requires downtime. Announce first.

```bash
# 1. Stop the app so no new writes.
docker compose -f /opt/emerge/app/compose.prod.yaml stop web worker

# 2. Snapshot the current state before we overwrite it (just in case).
docker exec emerge-pg pg_dump --format=custom --compress=9 \
  --dbname=postgres://emerge:$POSTGRES_PASSWORD@localhost:5432/emerge \
  > /opt/emerge/backups/pre-restore-$(date -u +%Y%m%d-%H%M).dump

# 3. Drop + recreate the schema, then restore.
docker exec -i emerge-pg psql -U emerge -c "DROP DATABASE emerge; CREATE DATABASE emerge;"
cat /path/to/emerge-YYYY-MM-DD.dump | docker exec -i emerge-pg pg_restore \
  --dbname=postgres://emerge:$POSTGRES_PASSWORD@localhost:5432/emerge \
  --no-owner --no-acl

# 4. Re-apply migrations to reset RLS grants (idempotent).
docker compose -f /opt/emerge/app/compose.prod.yaml run --rm web \
  pnpm --filter @emerge/db migrate

# 5. Start the app again.
docker compose -f /opt/emerge/app/compose.prod.yaml start web worker
curl -sSf https://emergeautomation.tech/api/health
```

## Restore — MinIO attachments

The mirror job never deletes from R2, so the R2 copy is a strict superset
after any single-day loss.

```bash
mc mirror --overwrite r2/emerge-crm-backup/attachments minio/emerge
```

For a specific object:

```bash
mc cp r2/emerge-crm-backup/attachments/candidates/CAND-0042/cv.pdf \
      minio/emerge/candidates/CAND-0042/cv.pdf
```

## Monthly drill (calendar reminder)

On the 1st of every month:

1. Grab yesterday's dump from R2.
2. Restore into a scratch container (Case A above).
3. `psql` in, spot-check row counts against production, exit.
4. Log the drill outcome in `docs/runbook/drills.log`.
