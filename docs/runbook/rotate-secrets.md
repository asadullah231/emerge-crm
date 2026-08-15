# Rotating secrets

## Postgres password

```bash
NEW=$(openssl rand -base64 24)
docker exec emerge-pg psql -U emerge -c "ALTER USER emerge WITH PASSWORD '${NEW}';"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${NEW}|" /opt/emerge/.env
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env up -d web worker backup
```

Then update the `EMERGE_PROD_PG_PASSWORD` line in
`D:/Projects/.secrets/master.env`.

## Redis password

```bash
NEW=$(openssl rand -base64 24)
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${NEW}|" /opt/emerge/.env
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env up -d redis web worker
```

## MinIO S3 keys

```bash
NEW_KEY=$(openssl rand -hex 12)
NEW_SECRET=$(openssl rand -base64 24)
docker exec emerge-minio mc admin user add local ${NEW_KEY} ${NEW_SECRET}
docker exec emerge-minio mc admin policy attach local consoleAdmin --user=${NEW_KEY}
# Update .env
sed -i "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=${NEW_KEY}|" /opt/emerge/.env
sed -i "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${NEW_SECRET}|" /opt/emerge/.env
docker compose -f /opt/emerge/app/compose.prod.yaml --env-file /opt/emerge/.env up -d web worker backup
# Delete the old key once the new one is proven.
docker exec emerge-minio mc admin user remove local <OLD_KEY>
```

## Resend / SMTP

Rotate at Resend, then update `SMTP_PASSWORD` in `/opt/emerge/.env` and
`docker compose up -d web worker`.

## R2 backup keys

Rotate at Cloudflare, update `R2_ACCESS_KEY` and `R2_SECRET_KEY` in
`/opt/emerge/.env`, then `docker compose up -d backup`.
