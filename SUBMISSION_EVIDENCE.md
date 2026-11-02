# SUBMISSION EVIDENCE

Environment: Docker Desktop Kubernetes (Windows 11, WSL2), namespace `mern`, URL `http://mern.localhost`. Commands used for each screenshot are listed so every step can be reproduced. No credentials are visible in any image (MongoDB is accessed with the credentials from the pod environment; secrets are never printed).

The same checks run automatically in CI (`e2e-deploy` job, see §5) – its log is additional evidence for §4 and §6.

## 1. Web Application

### 1.1 Home page

- **Screenshot:** `docs/screenshots/01-web-home.png`
- **Explanation:** `http://mern.localhost/` served through ingress-nginx → frontend pod. The "API Status" JSON comes from `GET /api/healthcheck` on the backend, proving the UI → Ingress → backend path works.

### 1.2 Create operation

- **Form screenshot:** `docs/screenshots/02-record-create-form.png`
- **Successful result screenshot:** `docs/screenshots/03-record-created.png`
- **Explanation:** The "Create Record" form filled in; after submitting, the app navigates to `/records` and the new row is listed (served by `POST /api/record` → `201`, then `GET /api/record`).

### 1.3 Edit operation

- **Before-edit screenshot:** `docs/screenshots/04-record-edit-before.png`
- **After-edit screenshot:** `docs/screenshots/05-record-edit-after.png`
- **Explanation:** The edit form shows the existing values loaded by `GET /api/record/:id`; after "Update Record" (`PATCH`) the list shows the changed position/level for the same record.

## 2. Docker

- **Image build screenshot:** `docs/screenshots/06-docker-build-and-containers.png`
- **Running containers screenshot:** `docs/screenshots/06b-docker-compose-ps.png`
- **Explanation:** `docker build` of the three images and `docker images devops-case/*` with their sizes (multi-stage builds; frontend runtime is nginx only). `docker compose ps` shows mongo, backend and frontend running and healthy (Docker `HEALTHCHECK`).

## 3. Kubernetes

- **Pod/workload status:** `docs/screenshots/07-kubernetes-workloads.png`
- **Service and Ingress status:** `docs/screenshots/08-kubernetes-services-ingress.png`
- **ETL CronJob/Job status:** `docs/screenshots/09-etl-cronjob-job.png`
- **Explanation:** `kubectl -n mern get statefulset,deploy,pods,pvc` – all pods Running/Ready, Mongo PVC bound. `kubectl -n mern get svc,ingress` – only ClusterIP/headless Services inside the namespace, the Ingress `mern.localhost` with paths `/` and `/api`, and the ingress-nginx LoadBalancer as the single external entry point. `kubectl -n mern get cronjob,jobs` – `github-etl` scheduled `0 * * * *` and completed Jobs.

## 4. Python ETL

### 4.1 Initial data load

- **Screenshot or terminal output:** `docs/screenshots/10-etl-first-load.png`
- **Explanation:** First run (`kubectl -n mern create job etl-run-1 --from=cronjob/github-etl`; `kubectl logs job/etl-run-1`): the summary line shows `inserted: 5`, `updated: 0`, `documents_after: 5`; mongosh shows the stored repositories (`full_name`, `github_id`, `stargazers_count`, `etl_sync_count: 1`).

### 4.2 Update of the same repository

- **Screenshot or terminal output:** `docs/screenshots/11-etl-update-without-duplicate.png`
- **Unique field used:** `github_id` (numeric GitHub repository id; unique index `uniq_github_id`)
- **Explanation:** Second run with the same repositories: `inserted: 0`, `updated: 5`, `documents_before: 5`, `documents_after: 5`, `duplicates_created: 0`. In mongosh the count is still 5, `etl_sync_count` is now 2, `etl_last_synced_at` changed and `etl_first_seen_at` is unchanged – the existing documents were updated, not duplicated.

## 5. CI/CD

- **Successful pipeline screenshot:** `docs/screenshots/12-cicd-pipeline-success.png`
- **Screenshot showing build/image/deployment stages:** `docs/screenshots/12b-cicd-stages.png`
- **Explanation:** GitHub Actions run of `ci-cd`: `validate` (tests, lint, manifests, secret scan) → `build` (3 images, Trivy scan, SBOM, push to GHCR) → `e2e-deploy` (deploy to kind, API/ETL/backup-restore checks, Cypress) → `deploy-prod` (gated, renders SHA-pinned prod manifests). The second screenshot shows the e2e log ending with "All end-to-end checks passed" and/or the pushed packages in GHCR.

## 6. Backup and Restore

All steps below were executed in order on the same record "Backup Test".

### 6.1 Record creation

- **Screenshot:** `docs/screenshots/13-backup-record-created.png`
- **Explanation:** Record "Backup Test" created in the UI and visible in the Record List (also visible in mongosh with its `_id`).

### 6.2 Taking the backup

- **Screenshot or terminal output:** `docs/screenshots/14-backup-taken.png`
- **Method and command used:** `kubectl -n mern create job backup-manual-1 --from=cronjob/mongo-backup` → `mongodump --archive --gzip` (script `k8s/base/backup/scripts/backup.sh`)
- **Backup storage location:** PVC `mongo-backups` (namespace `mern`), file `/backups/mongo-<timestamp>.archive.gz` + `.sha256` + `.meta` (listed with `k8s/jobs/list-backups-job.yaml`)
- **Explanation:** The job log shows `backup finished` with file name, size and the per-collection counts (`employees.records: N`); the listing shows the archive on the PVC.

### 6.3 Dropping the collection or database

- **Screenshot or terminal output:** `docs/screenshots/15-collection-dropped.png`
- **Explanation:** In mongosh: `db.records.drop()` → `true`.

### 6.4 Showing that the data is gone

- **Interface screenshot:** `docs/screenshots/16-data-missing-after-drop.png`
- **Database output:** `docs/screenshots/16b-db-empty-after-drop.png`
- **Explanation:** The Record List is empty after a refresh, and `db.records.countDocuments()` returns 0.

### 6.5 Restoring from the backup

- **Screenshot or terminal output:** `docs/screenshots/17-restore-executed.png`
- **Measured restore duration:** <!-- FILL: duration_seconds from the log --> s (restore + verification), <!-- FILL --> s including Job start
- **Explanation:** `kubectl apply -f k8s/jobs/mongo-restore-job.yaml`; the log shows checksum OK, `mongorestore`, per-collection `verify ... match: true` and `restore finished and verified`.

### 6.6 Verifying that the data is back

- **Interface screenshot:** `docs/screenshots/18-data-restored-verified.png`
- **Database output:** `docs/screenshots/18b-db-restored.png`
- **Explanation:** The same "Backup Test" record (same `_id` as in 6.1) is back in the UI and in mongosh; the application kept working without a restart.

> Runbook, RPO/RTO and retention: [docs/backup-restore.md](docs/backup-restore.md).

## 7. Logging, Monitoring, and Advanced Criteria

- **Screenshot:** `docs/screenshots/19-monitoring-or-upper-criteria.png`
- **Explanation:** Structured JSON logs of the backend (`kubectl -n mern logs deploy/backend`) and the Prometheus metrics endpoint (`kubectl -n mern port-forward deploy/backend 5050` → `/metrics`), plus `kubectl -n mern get networkpolicy,pdb` and `kubectl get ns mern --show-labels` (Pod Security "restricted").
- **Screenshot (optional):** `docs/screenshots/20-prometheus-alerts.png`
- **Explanation:** If kube-prometheus-stack is installed: the `devops-case-alerts` rules loaded in Prometheus (Status → Rules / Alerts).

## 8. Additional Evidence

- **Screenshot:** `docs/screenshots/21-mongo-outage-resilience.png`
- **Explanation:** `kubectl -n mern delete pod mongo-0` while watching `kubectl -n mern get pods -w`: backend pods become `0/1 Ready` (readiness) but are **not restarted**, and return to `1/1` automatically when MongoDB is back; the API returned 503 during the outage instead of crashing.
