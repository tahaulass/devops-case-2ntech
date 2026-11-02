#!/usr/bin/env bash
# Creates the Kubernetes Secrets with random passwords. Nothing is written to disk or git.
# Idempotent: existing secrets are kept (rotating is a separate, explicit action).
#   ./scripts/create-secrets.sh            # namespace "mern"
#   GITHUB_TOKEN=ghp_xxx ./scripts/create-secrets.sh
set -euo pipefail
NS="${NS:-mern}"
kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS"

rand() { openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24; }
exists() { kubectl -n "$NS" get secret "$1" >/dev/null 2>&1; }

MONGO_HOST="mongo-0.mongo.${NS}.svc.cluster.local:27017"

if ! exists mongo-root; then
  ROOT_PW="$(rand)"
  kubectl -n "$NS" create secret generic mongo-root \
    --from-literal=MONGO_INITDB_ROOT_USERNAME=root \
    --from-literal=MONGO_INITDB_ROOT_PASSWORD="$ROOT_PW" \
    --from-literal=MONGODB_ROOT_URI="mongodb://root:${ROOT_PW}@${MONGO_HOST}/?authSource=admin"
  echo "created secret mongo-root"
else
  echo "secret mongo-root already exists, keeping it"
fi

if ! exists mongo-app; then
  APP_PW="$(rand)"
  kubectl -n "$NS" create secret generic mongo-app \
    --from-literal=MONGO_APP_USERNAME=app \
    --from-literal=MONGO_APP_PASSWORD="$APP_PW" \
    --from-literal=MONGODB_URI="mongodb://app:${APP_PW}@${MONGO_HOST}/employees?authSource=employees"
  echo "created secret mongo-app"
else
  echo "secret mongo-app already exists, keeping it"
fi

if [ -n "${GITHUB_TOKEN:-}" ] && ! exists github-token; then
  kubectl -n "$NS" create secret generic github-token --from-literal=GITHUB_TOKEN="$GITHUB_TOKEN"
  echo "created secret github-token"
fi
if [ -n "${ALERT_WEBHOOK_URL:-}" ] && ! exists alerting; then
  kubectl -n "$NS" create secret generic alerting --from-literal=ALERT_WEBHOOK_URL="$ALERT_WEBHOOK_URL"
  echo "created secret alerting"
fi
