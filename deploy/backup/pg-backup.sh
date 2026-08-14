#!/usr/bin/env bash
# Dump the Emerge production database, compress, and mirror to Cloudflare R2.
# Filename convention: emerge-YYYY-MM-DD-HHMMSS.dump (pg_dump custom format).
set -euo pipefail

STAMP=$(date -u +'%Y-%m-%d-%H%M%S')
OUT="/backups/emerge-${STAMP}.dump"

echo "[pg-backup] dumping ${PGDATABASE} @ ${PGHOST} -> ${OUT}"
pg_dump \
  --format=custom \
  --compress=9 \
  --file="${OUT}" \
  --no-owner \
  --no-acl \
  --dbname="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:5432/${PGDATABASE}"

# Configure R2 alias (idempotent).
mc alias set r2 \
  "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  "${R2_ACCESS_KEY}" \
  "${R2_SECRET_KEY}" \
  --api S3v4 >/dev/null

# Ensure bucket exists (won't error if it does).
mc mb "r2/${R2_BUCKET}" 2>/dev/null || true

REMOTE="r2/${R2_BUCKET}/postgres/emerge-${STAMP}.dump"
echo "[pg-backup] uploading -> ${REMOTE}"
mc cp "${OUT}" "${REMOTE}"

SIZE=$(stat -c%s "${OUT}")
echo "[pg-backup] done (${SIZE} bytes)"
