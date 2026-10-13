#!/bin/sh
# Off-site copy of the database backups (docker-compose.prod.yml, service `offsite`, profile
# "offsite"). Owner, 2026-10-13: if the VPS disk dies, the data must still exist elsewhere.
#  - copies new ./backups/daovault-*.sql.gz to OFFSITE_REMOTE with rclone every OFFSITE_EVERY_SECONDS
#  - OFFSITE_REMOTE should be an rclone *crypt* remote (DOCKER.md "Off-site backup"): files are
#    encrypted on the VPS before they leave, the storage provider only sees noise
#  - deletes remote copies older than OFFSITE_KEEP_DAYS
#  - logs "[offsite] ALERT" when the copy fails or the newest local backup is older than 26 hours
# rclone's settings (remote + crypt passwords) are ./secrets/rclone.conf, mounted read-only.
set -eu

REMOTE="${OFFSITE_REMOTE:?set OFFSITE_REMOTE (e.g. daovault-crypt:) in .env.production}"
EVERY="${OFFSITE_EVERY_SECONDS:-21600}"
KEEP_DAYS="${OFFSITE_KEEP_DAYS:-30}"

alert() {
  echo "[offsite] ALERT: $1" >&2
}

while true; do
  newest="$(find /backups -name 'daovault-*.sql.gz' -mmin -1560 | head -n 1)"
  [ -n "${newest}" ] || alert "no local backup newer than 26 hours. Check: docker compose logs backup"

  if rclone copy /backups "${REMOTE}" --include 'daovault-*.sql.gz' --immutable --transfers 2 --retries 3 --log-level NOTICE; then
    rclone delete "${REMOTE}" --min-age "${KEEP_DAYS}d" --include 'daovault-*.sql.gz' --log-level NOTICE \
      || alert "could not prune copies older than ${KEEP_DAYS} days (copy itself worked)"
    echo "[offsite] synced to ${REMOTE} at $(date -u +%Y-%m-%dT%H:%MZ)"
  else
    alert "copy to ${REMOTE} FAILED. Check: docker compose logs offsite"
  fi
  sleep "${EVERY}"
done
