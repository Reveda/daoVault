#!/bin/sh
# Daily PostgreSQL backup (docker-compose.prod.yml, service `backup`).
# Writes /backups/daovault-YYYYMMDD-HHMMSS.sql.gz (the VPS folder ./backups), keeps BACKUP_KEEP_DAYS days.
# Every dump is tested (gzip -t) before it counts; a failure is logged as "[backup] ALERT".
# The `offsite` service copies ./backups off the server, encrypted
# (docker/backup/offsite.sh): a backup on the same disk is not enough.
# Restore drill (no risk to live data): docker/backup/restore-test.sh FILE
set -eu
set -o pipefail

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
EVERY="${BACKUP_EVERY_SECONDS:-86400}"
mkdir -p /backups

alert() {
  echo "[backup] ALERT: $1" >&2
}

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  file="/backups/daovault-${stamp}.sql.gz"
  if pg_dump --no-owner --no-privileges | gzip -9 > "${file}.part" && gzip -t "${file}.part"; then
    mv "${file}.part" "${file}"
    echo "[backup] saved ${file} ($(du -h "${file}" | cut -f1))"
  else
    rm -f "${file}.part"
    alert "database backup FAILED at ${stamp} UTC. Check: docker compose logs backup"
  fi
  find /backups -name 'daovault-*.sql.gz' -mtime +"${KEEP_DAYS}" -delete
  sleep "${EVERY}"
done
