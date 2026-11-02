#!/bin/bash
# Logical backup of all MongoDB databases into a single gzipped archive.
# Writes:  $BACKUP_DIR/mongo-<UTC timestamp>.archive.gz (+ .sha256, .meta)
#          $BACKUP_DIR/LATEST  -> name of the newest verified backup
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="mongo-${TS}.archive.gz"
TMP="${BACKUP_DIR}/.${NAME}.partial"

log() { printf '{"ts":"%s","level":"%s","service":"mongo-backup","msg":"%s"%s}\n' "$(date -u +%FT%TZ)" "$1" "$2" "${3:-}"; }
fail() {
  log error "backup failed" ",\"error\":\"$1\""
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    # mongo image has no curl; use mongosh's fetch to send the alert.
    mongosh --nodb --quiet --eval "fetch(process.env.ALERT_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:':rotating_light: mongo-backup failed: $1'})})" || true
  fi
  rm -f "$TMP"
  exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

START=$(date +%s)
log info "backup started" ",\"file\":\"${NAME}\""

# Document counts at backup time, stored next to the archive (used to verify restores).
COUNTS=$(mongosh "$MONGODB_URI" --quiet --eval '
  const out = {};
  db.adminCommand({ listDatabases: 1, nameOnly: true }).databases
    .map(d => d.name).filter(n => !["admin","config","local"].includes(n))
    .forEach(n => { const d = db.getSiblingDB(n);
      d.getCollectionNames().forEach(c => { out[n + "." + c] = d.getCollection(c).countDocuments(); }); });
  print(JSON.stringify(out));')

mongodump --uri="$MONGODB_URI" --archive="$TMP" --gzip --quiet || fail "mongodump exited non-zero"

# Integrity checks: gzip stream is complete and archive is non-trivial.
gzip -t "$TMP" || fail "gzip integrity check failed"
SIZE=$(stat -c %s "$TMP")
[ "$SIZE" -gt 100 ] || fail "archive suspiciously small (${SIZE} bytes)"

mv "$TMP" "${BACKUP_DIR}/${NAME}"
( cd "$BACKUP_DIR" && sha256sum "$NAME" > "${NAME}.sha256" )
echo "$COUNTS" > "${BACKUP_DIR}/${NAME}.meta"
echo "$NAME" > "${BACKUP_DIR}/LATEST"

# Retention: delete archives older than RETENTION_DAYS (never the one just written).
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'mongo-*.archive.gz*' -mtime +"$RETENTION_DAYS" -print -delete | wc -l)

log info "backup finished" ",\"file\":\"${NAME}\",\"bytes\":${SIZE},\"duration_seconds\":$(( $(date +%s) - START )),\"retention_deleted_files\":${DELETED},\"counts\":${COUNTS}"
log info "available backups" ",\"files\":\"$(cd "$BACKUP_DIR" && ls -1 mongo-*.archive.gz | tr '\n' ' ')\""
