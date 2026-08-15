#!/usr/bin/env bash
# One-time cutover: prepare the shared VPS (Hostinger 187.127.75.106) so that
# the emerge-web / emerge-worker containers from compose.prod.yaml can join
# the existing infra. Idempotent: safe to re-run.
#
# Prereqs on the box:
#   * root-traefik-1 already running on :80/:443 (ACME resolver `myresolver`)
#   * emerge-pg / emerge-redis / emerge-minio containers already running with
#     their named volumes.
#   * /opt/emerge/.env populated with EMERGE_PROD_* values.
set -euo pipefail

ENV_FILE=/opt/emerge/.env
if [ ! -f "$ENV_FILE" ]; then
  echo "!! $ENV_FILE not found. Create it from .env.production.example first."
  exit 1
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

echo "== Creating /opt/emerge/{app,backups,data} ..."
mkdir -p /opt/emerge/{app,backups,data}
chown root:root /opt/emerge
chmod 700 /opt/emerge/data

echo "== Creating shared docker network emerge_net (if missing) ..."
docker network inspect emerge_net >/dev/null 2>&1 || docker network create emerge_net

echo "== Attaching emerge-pg / emerge-redis / emerge-minio to emerge_net ..."
for c in emerge-pg emerge-redis emerge-minio; do
  if docker inspect "$c" >/dev/null 2>&1; then
    if docker inspect "$c" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw emerge_net; then
      echo "   $c already on emerge_net"
    else
      docker network connect emerge_net "$c"
      echo "   $c -> emerge_net"
    fi
  else
    echo "!! $c not running; skipping"
  fi
done

echo "== Rotating Postgres password to EMERGE_PROD_PG_PASSWORD ..."
docker exec emerge-pg psql -U emerge -d emerge -c \
  "ALTER USER emerge WITH PASSWORD '${POSTGRES_PASSWORD}';"

echo "== Ensuring emerge_app role exists (RLS depends on it) ..."
docker exec emerge-pg psql -U emerge -d emerge -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='emerge_app';" | grep -q 1 || \
  docker exec emerge-pg psql -U emerge -d emerge -c "CREATE ROLE emerge_app NOLOGIN;"

echo "== Rotating MinIO root credentials ..."
# MinIO can't rotate root creds via API; we re-create the container with new
# env vars. The named volume `emerge_minio_data` preserves the bucket. We
# also add Traefik labels for minio.emergeautomation.tech + attach to both
# networks in the same recreate.
if docker inspect emerge-minio >/dev/null 2>&1; then
  echo "   stopping emerge-minio"
  docker stop emerge-minio >/dev/null
  docker rm emerge-minio >/dev/null
fi

docker run -d \
  --name emerge-minio \
  --restart always \
  --network emerge_net \
  --label traefik.enable=true \
  --label traefik.docker.network=root_traefik_network \
  --label 'traefik.http.routers.emerge-minio.rule=Host(`minio.emergeautomation.tech`)' \
  --label traefik.http.routers.emerge-minio.entrypoints=websecure \
  --label traefik.http.routers.emerge-minio.tls=true \
  --label traefik.http.routers.emerge-minio.tls.certresolver=myresolver \
  --label traefik.http.services.emerge-minio.loadbalancer.server.port=9000 \
  -e MINIO_ROOT_USER="${S3_ACCESS_KEY}" \
  -e MINIO_ROOT_PASSWORD="${S3_SECRET_KEY}" \
  -v emerge_minio_data:/data \
  minio/minio:latest server /data --console-address ':9001'

echo "   attaching emerge-minio to root_traefik_network"
docker network connect root_traefik_network emerge-minio || true

echo "== VPS bootstrap complete."
echo "   Now: docker compose -f /opt/emerge/app/compose.prod.yaml --env-file $ENV_FILE build web worker"
echo "   Then: docker compose -f /opt/emerge/app/compose.prod.yaml --env-file $ENV_FILE up -d web worker"
