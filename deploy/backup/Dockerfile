# Backup sidecar: nightly pg_dump + `mc mirror` to Cloudflare R2.
# Runs a small cron loop; sleeps between runs. `entrypoint.sh` handles the
# schedule and calls the individual scripts.
FROM alpine:3.20

RUN apk add --no-cache \
      bash \
      coreutils \
      curl \
      postgresql16-client \
      tzdata \
    && curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc \
    && chmod +x /usr/local/bin/mc

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY pg-backup.sh /usr/local/bin/pg-backup.sh
COPY minio-mirror.sh /usr/local/bin/minio-mirror.sh
COPY prune.sh /usr/local/bin/prune.sh
RUN chmod +x /usr/local/bin/*.sh

WORKDIR /backups
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
