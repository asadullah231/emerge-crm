#!/usr/bin/env bash
# Mirror the MinIO `emerge` bucket (candidate CVs + attachments) to
# Cloudflare R2. Uses `mc mirror --remove=false` so R2 is a strict superset
# (never deletes from R2 based on MinIO).
set -euo pipefail

mc alias set minio "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null
mc alias set r2 \
  "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  "${R2_ACCESS_KEY}" \
  "${R2_SECRET_KEY}" \
  --api S3v4 >/dev/null

mc mb "r2/${R2_BUCKET}" 2>/dev/null || true

echo "[minio-mirror] minio/${MINIO_BUCKET} -> r2/${R2_BUCKET}/attachments/"
mc mirror --overwrite --remove=false \
  "minio/${MINIO_BUCKET}" \
  "r2/${R2_BUCKET}/attachments"

echo "[minio-mirror] done"
