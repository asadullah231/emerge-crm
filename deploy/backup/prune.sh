#!/usr/bin/env bash
# Retention policy:
#   - Keep the last BACKUP_RETENTION_DAILY daily dumps locally + on R2.
#   - Keep the first-of-month dump for the last BACKUP_RETENTION_MONTHLY months.
#   - Everything else is deleted.
set -euo pipefail

DAILY="${BACKUP_RETENTION_DAILY:-30}"
MONTHLY="${BACKUP_RETENTION_MONTHLY:-12}"

echo "[prune] local pruning: keeping last ${DAILY} daily dumps"
cd /backups
ls -1t emerge-*.dump 2>/dev/null | tail -n +$((DAILY + 1)) | while read -r f; do
  # Preserve if it's the first snapshot of its month.
  MONTH_PREFIX=$(echo "$f" | sed -E 's/^emerge-([0-9]{4}-[0-9]{2})-.*/\1/')
  FIRST_IN_MONTH=$(ls -1 emerge-${MONTH_PREFIX}-*.dump 2>/dev/null | sort | head -n 1 || true)
  if [ "$f" = "$FIRST_IN_MONTH" ]; then
    echo "[prune] keeping monthly ${f}"
    continue
  fi
  echo "[prune] removing ${f}"
  rm -f "$f"
done

# Optional: also prune old first-of-months once past MONTHLY horizon.
CUTOFF=$(date -u -d "${MONTHLY} months ago" +%Y-%m)
for f in emerge-*.dump; do
  [ -f "$f" ] || continue
  MONTH_PREFIX=$(echo "$f" | sed -E 's/^emerge-([0-9]{4}-[0-9]{2})-.*/\1/')
  if [[ "$MONTH_PREFIX" < "$CUTOFF" ]]; then
    echo "[prune] removing archived monthly ${f}"
    rm -f "$f"
  fi
done

echo "[prune] done"
