# Runs ON the VPS (sent through vps.sh). Emerge CRM v0.27.0: BD Outreach module.
# 1. BD connection variables into /opt/emerge/.env (copied from the bd-dashboard container's env, once)
# 2. pull develop, build web, run migration 0037, start web
# Log: /opt/emerge/deploy-bd.log
set -e
cd /opt/emerge/app
if ! grep -q '^NOCODB_BASE_URL=' /opt/emerge/.env; then
  { echo ''; echo '# BD Outreach module (7 Nov 2026), copied from /opt/bd-dashboard/.env'; grep -E '^(NOCODB_|N8N_BASE_URL|SLACK_BD_CHANNEL)' /opt/bd-dashboard/.env; } >> /opt/emerge/.env
  grep -q '^NOCODB_T_REPLIES=' /opt/emerge/.env || echo 'NOCODB_T_REPLIES=mrcoaxsmhnhnnxq' >> /opt/emerge/.env
  echo ENV_OK
fi
git fetch -q origin && git checkout -q develop && git pull -q origin develop && git log --oneline -1
set -a && . /opt/emerge/.env && set +a
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env build web > /opt/emerge/deploy-bd.build.log 2>&1 && echo BUILD_OK
# migration 0037 (workspaces.bd_outreach) runs from the new image BEFORE the new web starts, so auth.me never selects a missing column
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env run --rm --no-deps -T web pnpm --filter @emerge/db migrate > /opt/emerge/deploy-bd.migrate.log 2>&1 && echo MIGRATE_OK
docker compose -f compose.prod.yaml --env-file /opt/emerge/.env up -d web && echo UP_OK
sleep 25
curl -s -o /dev/null -w 'HEALTH %{http_code}\n' https://crm.emergeautomation.tech/api/health
echo DEPLOY_DONE
