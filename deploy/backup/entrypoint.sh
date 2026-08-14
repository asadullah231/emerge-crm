#!/usr/bin/env bash
# Simple backup scheduler: run every 24 h at BACKUP_SCHEDULE_HOUR_UTC (default 02).
# Runs `pg-backup.sh` and `minio-mirror.sh` sequentially. Logs to stdout so
# Docker captures them.
set -euo pipefail

HOUR="${BACKUP_SCHEDULE_HOUR_UTC:-2}"

echo "[backup] sidecar started; scheduled hour UTC=$HOUR"

while true; do
  now_h=$(date -u +%H)
  now_m=$(date -u +%M)
  target_ts=$(date -u -d "today ${HOUR}:00" +%s)
  now_ts=$(date -u +%s)
  # If we're past today's target, aim for tomorrow.
  if [ "$now_ts" -ge "$target_ts" ]; then
    target_ts=$(date -u -d "tomorrow ${HOUR}:00" +%s)
  fi
  sleep_for=$(( target_ts - now_ts ))
  echo "[backup] sleeping ${sleep_for}s until next run at $(date -u -d "@${target_ts}" +'%Y-%m-%d %H:%M UTC')"
  sleep "$sleep_for"

  echo "[backup] === run started at $(date -u +'%Y-%m-%dT%H:%M:%SZ') ==="
  if /usr/local/bin/pg-backup.sh; then
    echo "[backup] pg-backup ok"
  else
    echo "[backup] pg-backup FAILED (exit $?)" >&2
  fi
  if /usr/local/bin/minio-mirror.sh; then
    echo "[backup] minio-mirror ok"
  else
    echo "[backup] minio-mirror FAILED (exit $?)" >&2
  fi
  if /usr/local/bin/prune.sh; then
    echo "[backup] prune ok"
  else
    echo "[backup] prune FAILED (exit $?)" >&2
  fi
  echo "[backup] === run finished ==="
done
