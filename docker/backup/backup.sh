#!/bin/sh
# Daily PostgreSQL backup (docker-compose.prod.yml, service `backup`).
# Writes /backups/daovault-YYYYMMDD-HHMMSS.sql.gz (the VPS folder ./backups), keeps BACKUP_KEEP_DAYS days.
# Copy ./backups off the server too (see DOCKER.md): a backup on the same disk is not enough.
# Restore: gunzip -c FILE | docker compose -f docker-compose.prod.yml exec -T db psql -U daovault -d daovault
set -eu
set -o pipefail

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
mkdir -p /backups

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  file="/backups/daovault-${stamp}.sql.gz"
  if pg_dump --no-owner --no-privileges | gzip -9 > "${file}.part"; then
    mv "${file}.part" "${file}"
    echo "[backup] saved ${file}"
  else
    rm -f "${file}.part"
    echo "[backup] FAILED at ${stamp}" >&2
  fi
  find /backups -name 'daovault-*.sql.gz' -mtime +"${KEEP_DAYS}" -delete
  sleep 86400
done
