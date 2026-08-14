# Emerge CRM — production deploy runbook

Domain: **https://emergeautomation.tech**
Host: Hostinger VPS `187.127.75.106`
DB: Postgres 16 (bind-mounted `/opt/emerge/data/postgres`)
Queue: Redis 7 with AOF (`/opt/emerge/data/redis`)
Storage: MinIO S3 (`/opt/emerge/data/minio`), off-site mirror on Cloudflare R2
DNS: Hostinger
Mail: Resend (SMTP)

This is the operator-facing runbook. Design decisions and rationale live in
[../deploy/production-plan.md](../deploy/production-plan.md).

---

## 1. First-time deploy (cutover)

Do this once, in order. Every step is reversible until step 8.

### 1.1 Prepare secrets

1. Generate fresh secrets locally:
   ```bash
   openssl rand -base64 24    # POSTGRES_PASSWORD
   openssl rand -base64 24    # REDIS_PASSWORD
   openssl rand -base64 24    # S3_SECRET_KEY
   ```
2. Create an R2 bucket `emerge-crm-backup` in Cloudflare, mint an S3-compat
   API token with **Object Read & Write** scope. Save the `Account ID`,
   `Access Key ID` and `Secret Access Key`.
3. In Resend, add and verify the domain `emergeautomation.tech`. Mint an
   API key with `Send Emails` scope.
4. Append a new block `EMERGE_PROD_*` in `D:/Projects/.secrets/master.env`
   with all the above values.

### 1.2 DNS (Hostinger)

Add these A records at Hostinger (TTL 300 initially so we can rollback fast):

| Type | Name  | Value          |
| ---- | ----- | -------------- |
| A    | @     | 187.127.75.106 |
| A    | www   | 187.127.75.106 |
| A    | minio | 187.127.75.106 |

Wait for propagation (`dig emergeautomation.tech +short` should return the
VPS IP).

### 1.3 VPS bootstrap (via n8n SSH — the external SSH port is closed)

```bash
mkdir -p /opt/emerge/{app,data,backups}
mkdir -p /opt/emerge/data/{postgres,redis,minio,traefik/letsencrypt}
chown -R root:root /opt/emerge
chmod 700 /opt/emerge/data

# Firewall: keep only 80/443 public (SSH is already blocked in Hostinger).
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 1.4 App on VPS

```bash
cd /opt/emerge/app
git clone --branch main https://github.com/asadullah231/emerge-crm.git .
git checkout v0.8.0
```

Write `/opt/emerge/.env` from the master.env `EMERGE_PROD_*` block, then:

```bash
chmod 600 /opt/emerge/.env
chown root:root /opt/emerge/.env
```

### 1.5 Migrate data volumes (Option A: promote existing dev DB)

The existing `emerge-pg` / `emerge-redis` / `emerge-minio` containers already
hold the imported Zoho dataset. Move their volumes under `/opt/emerge/data`
before starting the prod stack:

```bash
# Postgres
docker stop emerge-pg
docker cp emerge-pg:/var/lib/postgresql/data/. /opt/emerge/data/postgres/
docker rm emerge-pg

# MinIO
docker stop emerge-minio
docker cp emerge-minio:/data/. /opt/emerge/data/minio/
docker rm emerge-minio

# Redis (safe to drop — queue state, not durable data)
docker stop emerge-redis && docker rm emerge-redis
```

(If dev containers use named volumes instead of container-internal dirs, use
`docker volume inspect` to find the source path and `rsync -a` it.)

### 1.6 Start the stack

```bash
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env pull
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env build web worker backup
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env up -d traefik postgres redis minio
```

Rotate DB + MinIO passwords **inside the running containers** to match the
new `.env` values (they were dev placeholders):

```bash
docker exec emerge-pg psql -U emerge -c "ALTER USER emerge WITH PASSWORD '<EMERGE_PROD_PG_PASSWORD>';"
docker exec emerge-minio mc admin user add local <NEW_KEY> <NEW_SECRET>
docker exec emerge-minio mc admin policy attach local consoleAdmin --user=<NEW_KEY>
# Remove the old dev key after the swap.
```

Bring up the app:

```bash
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env up -d web worker backup
```

### 1.7 Enable boot-time startup

```bash
cp /opt/emerge/app/deploy/systemd/emerge-crm.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable emerge-crm
```

### 1.8 Verify

```bash
# From anywhere on the internet:
curl -sSf https://emergeautomation.tech/api/health | jq
# Expect {"status":"ok", ...} with all four checks true.

# Cert issued?
curl -sI https://emergeautomation.tech | head -1  # HTTP/2 200

# Log in as Asad via the browser, spot-check the imported Porsche Consulting
# benchmark chain (client -> job -> 38 applications).
```

### 1.9 First backup

Trigger the backup sidecar manually so we know it works:

```bash
docker exec emerge-backup /usr/local/bin/pg-backup.sh
docker exec emerge-backup /usr/local/bin/minio-mirror.sh
# Verify in Cloudflare R2 UI.
```

### 1.10 Uptime monitor

Add a check in the n8n uptime workflow: `GET https://emergeautomation.tech/api/health`,
every 5 minutes. Alert channel: WhatsApp channel (per project conventions).

---

## 2. Routine operations

| Task                   | How                                                                 |
| ---------------------- | ------------------------------------------------------------------- |
| Deploy a new release   | See [../runbook/deploy.md](../runbook/deploy.md)                    |
| Look at logs           | `docker compose logs -f web` / `logs -f worker` / `logs -f traefik` |
| Restore from backup    | See [../runbook/backup-restore.md](../runbook/backup-restore.md)    |
| Rollback a bad release | See [../runbook/rollback.md](../runbook/rollback.md)                |
| Rotate a secret        | See [../runbook/rotate-secrets.md](../runbook/rotate-secrets.md)    |

## 3. Files & where they live

| Path on VPS                              | Purpose                             |
| ---------------------------------------- | ----------------------------------- |
| `/opt/emerge/app/`                       | Cloned repo (checked-out tag)       |
| `/opt/emerge/app/compose.prod.yaml`      | Compose file                        |
| `/opt/emerge/.env`                       | Runtime secrets (600)               |
| `/opt/emerge/data/postgres/`             | Postgres data                       |
| `/opt/emerge/data/redis/`                | Redis AOF                           |
| `/opt/emerge/data/minio/`                | MinIO buckets                       |
| `/opt/emerge/data/traefik/letsencrypt/`  | ACME certs                          |
| `/opt/emerge/backups/`                   | Local dumps (30 daily + 12 monthly) |
| `/etc/systemd/system/emerge-crm.service` | Boot-time start                     |
