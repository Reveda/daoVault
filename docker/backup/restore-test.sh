#!/bin/sh
# Restore drill (owner, 2026-10-13): proves a backup really restores, WITHOUT touching live data.
# Loads the dump into a separate throwaway database, counts the main tables, then drops it.
#
#   ./docker/backup/restore-test.sh backups/daovault-20261013-030000.sql.gz
#
# Run it once a month, and once with a file downloaded back from the off-site copy
# (rclone copy daovault-crypt:FILE ./backups/). The REAL restore (only after a disaster) is a
# different, careful procedure: DOCKER.md "Restore".
set -eu

FILE="${1:?usage: restore-test.sh backups/daovault-YYYYMMDD-HHMMSS.sql.gz}"
[ -f "${FILE}" ] || { echo "No such file: ${FILE}"; exit 1; }
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
TEST_DB="daovault_restore_test"

echo "1/4 testing the file..."
gzip -t "${FILE}"
echo "2/4 creating the throwaway database ${TEST_DB}..."
${COMPOSE} exec -T db psql -U daovault -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TEST_DB};" -c "CREATE DATABASE ${TEST_DB};"
echo "3/4 loading the dump..."
gunzip -c "${FILE}" | ${COMPOSE} exec -T db psql -U daovault -d "${TEST_DB}" -v ON_ERROR_STOP=1 -q > /dev/null
echo "4/4 counting..."
${COMPOSE} exec -T db psql -U daovault -d "${TEST_DB}" -t -c \
  "SELECT 'users ' || count(*) FROM users UNION ALL SELECT 'packages ' || count(*) FROM packages UNION ALL SELECT 'earnings ' || count(*) FROM earnings UNION ALL SELECT 'withdrawals ' || count(*) FROM withdrawals;"
${COMPOSE} exec -T db psql -U daovault -d postgres -c "DROP DATABASE ${TEST_DB};" > /dev/null
echo "OK: the backup restores. (The throwaway database was removed; live data was never touched.)"
