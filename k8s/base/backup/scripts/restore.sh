#!/bin/bash
# Restore from a backup archive. Defaults to the newest one (LATEST).
#   BACKUP_FILE    : archive file name inside $BACKUP_DIR (optional)
#   RESTORE_NS     : namespace filter for mongorestore, default "employees.*"
# Uses --drop: restored collections replace the current ones.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RESTORE_NS="${RESTORE_NS:-employees.*}"
FILE="${BACKUP_FILE:-$(cat "${BACKUP_DIR}/LATEST")}"
ARCHIVE="${BACKUP_DIR}/${FILE}"

log() { printf '{"ts":"%s","level":"%s","service":"mongo-restore","msg":"%s"%s}\n' "$(date -u +%FT%TZ)" "$1" "$2" "${3:-}"; }

[ -f "$ARCHIVE" ] || { log error "backup file not found" ",\"file\":\"${FILE}\""; exit 1; }
START=$(date +%s)
log info "restore started" ",\"file\":\"${FILE}\",\"namespaces\":\"${RESTORE_NS}\""

# 1) verify checksum before touching the database
( cd "$BACKUP_DIR" && sha256sum -c "${FILE}.sha256" ) || { log error "checksum mismatch, aborting"; exit 1; }

# 2) restore
mongorestore --uri="$MONGODB_URI" --archive="$ARCHIVE" --gzip --drop \
  --nsInclude="$RESTORE_NS" --quiet

# 3) verify: compare document counts with the counts recorded at backup time
export META="${ARCHIVE}.meta" RESTORE_NS
mongosh "$MONGODB_URI" --quiet --eval '
  const expected = JSON.parse(require("fs").readFileSync(process.env.META, "utf8"));
  const re = new RegExp("^" + process.env.RESTORE_NS.replace(".", "\\.").replace("*", ".*") + "$");
  let ok = true;
  for (const [ns, n] of Object.entries(expected)) {
    if (!re.test(ns)) continue;
    const [d, ...c] = ns.split(".");
    const actual = db.getSiblingDB(d).getCollection(c.join(".")).countDocuments();
    print(JSON.stringify({ msg: "verify", ns, expected: n, actual, match: actual === n }));
    if (actual !== n) ok = false;
  }
  if (!ok) quit(1);'
log info "restore finished and verified" ",\"file\":\"${FILE}\",\"duration_seconds\":$(( $(date +%s) - START ))"
