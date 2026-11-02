#!/usr/bin/env bash
# End-to-end verification against a running cluster (used by CI in a kind cluster;
# also runnable locally from Git Bash / WSL after `kubectl apply -k k8s/overlays/dev`).
#
# Verifies: rollout + health, CRUD through the Ingress, ETL idempotency (2 runs, no duplicates),
# backup -> drop -> restore -> verify, backend recovery after a MongoDB restart.
set -euo pipefail

NS="${NS:-mern}"
BASE_URL="${BASE_URL:-http://mern.localhost}"
CURL=(curl -sS --fail-with-body --max-time 10 --resolve "mern.localhost:80:127.0.0.1")

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m    OK: %s\033[0m\n' "$*"; }
die()  { printf '\033[31m    FAIL: %s\033[0m\n' "$*"; exit 1; }

mongo_eval() {
  kubectl -n "$NS" exec mongo-0 -c mongo -- bash -c \
    'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin employees --eval "$0"' "$1"
}
run_job_from_cronjob() {  # $1 cronjob, $2 job name
  kubectl -n "$NS" delete job "$2" --ignore-not-found >/dev/null
  kubectl -n "$NS" create job "$2" --from="cronjob/$1" >/dev/null
  kubectl -n "$NS" wait --for=condition=complete "job/$2" --timeout=300s >/dev/null \
    || { kubectl -n "$NS" logs "job/$2" || true; die "job $2 did not complete"; }
}

step "Waiting for workloads"
kubectl -n "$NS" rollout status statefulset/mongo --timeout=300s
kubectl -n "$NS" rollout status deployment/backend --timeout=300s
kubectl -n "$NS" rollout status deployment/frontend --timeout=300s
kubectl -n "$NS" get pods,svc,ingress,cronjob,pvc -o wide

step "Health through the Ingress"
for _ in $(seq 1 30); do "${CURL[@]}" "$BASE_URL/api/healthcheck" >/dev/null 2>&1 && break; sleep 2; done
"${CURL[@]}" "$BASE_URL/api/healthcheck"; echo
"${CURL[@]}" -o /dev/null "$BASE_URL/" && ok "frontend served"
"${CURL[@]}" -o /dev/null "$BASE_URL/records" && ok "SPA deep link served"
# /metrics is routed to the frontend (SPA index.html), never to the backend.
if curl -s --resolve "mern.localhost:80:127.0.0.1" "$BASE_URL/metrics" | grep -q http_requests_total; then
  die "backend /metrics must not be reachable from outside"
fi
ok "backend /metrics not exposed through the Ingress"

step "CRUD API"
ID=$("${CURL[@]}" -H 'Content-Type: application/json' -d '{"name":"CI User","position":"Tester","level":"Junior"}' \
  "$BASE_URL/api/record" | python3 -c 'import json,sys; print(json.load(sys.stdin)["insertedId"])')
ok "created $ID"
"${CURL[@]}" -X PATCH -H 'Content-Type: application/json' -d '{"name":"CI User","position":"Lead","level":"Senior"}' \
  "$BASE_URL/api/record/$ID" >/dev/null
"${CURL[@]}" "$BASE_URL/api/record/$ID" | grep -q '"position":"Lead"' && ok "updated"
code=$(curl -s -o /dev/null -w '%{http_code}' --resolve "mern.localhost:80:127.0.0.1" "$BASE_URL/api/record/not-an-id")
[ "$code" = "400" ] && ok "invalid id -> 400 (no crash)" || die "invalid id returned $code"
"${CURL[@]}" -X DELETE "$BASE_URL/api/record/$ID" >/dev/null && ok "deleted"

step "ETL: first run"
run_job_from_cronjob github-etl etl-run-1
kubectl -n "$NS" logs job/etl-run-1 | tail -3
C1=$(mongo_eval 'db.github_repositories.countDocuments()' | tr -d '\r')
ok "documents after run 1: $C1"
[ "$C1" -gt 0 ] || die "ETL wrote nothing"

step "ETL: second run (same repositories)"
run_job_from_cronjob github-etl etl-run-2
kubectl -n "$NS" logs job/etl-run-2 | tail -1
C2=$(mongo_eval 'db.github_repositories.countDocuments()' | tr -d '\r')
SYNC=$(mongo_eval 'db.github_repositories.findOne({}, {etl_sync_count:1}).etl_sync_count' | tr -d '\r')
[ "$C1" = "$C2" ] && ok "no duplicates: $C1 -> $C2 documents" || die "duplicates created: $C1 -> $C2"
[ "$SYNC" -ge 2 ] && ok "existing record updated (etl_sync_count=$SYNC)" || die "record not updated"
mongo_eval 'db.github_repositories.aggregate([{$group:{_id:"$github_id",n:{$sum:1}}},{$match:{n:{$gt:1}}}]).toArray().length' \
  | grep -qx 0 && ok "no github_id appears twice"

step "Backup / restore scenario"
"${CURL[@]}" -H 'Content-Type: application/json' -d '{"name":"Backup Test","position":"DR drill","level":"Senior"}' \
  "$BASE_URL/api/record" >/dev/null && ok "1) record created"
run_job_from_cronjob mongo-backup backup-e2e
kubectl -n "$NS" logs job/backup-e2e | tail -2
ok "2) backup taken"
mongo_eval 'db.records.drop()' >/dev/null && ok "3) collection dropped"
"${CURL[@]}" "$BASE_URL/api/record" | grep -q 'Backup Test' && die "data still visible" || ok "4) data gone (API returns no record)"
kubectl -n "$NS" delete job mongo-restore --ignore-not-found >/dev/null
START=$(date +%s)
kubectl apply -f k8s/jobs/mongo-restore-job.yaml >/dev/null
kubectl -n "$NS" wait --for=condition=complete job/mongo-restore --timeout=300s \
  || { kubectl -n "$NS" logs job/mongo-restore; die "restore failed"; }
kubectl -n "$NS" logs job/mongo-restore | tail -3
ok "5) restored in $(( $(date +%s) - START ))s (incl. pod start)"
"${CURL[@]}" "$BASE_URL/api/record" | grep -q 'Backup Test' && ok "6) record is back via the API" || die "record not restored"

step "Resilience: backend survives a MongoDB restart"
kubectl -n "$NS" delete pod mongo-0 --wait=false >/dev/null
sleep 5
kubectl -n "$NS" get pods -l app.kubernetes.io/name=backend
kubectl -n "$NS" rollout status statefulset/mongo --timeout=300s
for _ in $(seq 1 30); do "${CURL[@]}" "$BASE_URL/api/record" >/dev/null 2>&1 && break; sleep 2; done
"${CURL[@]}" "$BASE_URL/api/record" | grep -q 'Backup Test' && ok "API recovered without backend restarts"
RESTARTS=$(kubectl -n "$NS" get pods -l app.kubernetes.io/name=backend -o jsonpath='{range .items[*]}{.status.containerStatuses[0].restartCount}{" "}{end}')
ok "backend restart counts: $RESTARTS"

printf '\n\033[1;32mAll end-to-end checks passed.\033[0m\n'
