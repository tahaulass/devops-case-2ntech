# SUBMISSION EVIDENCE

Environment: Docker Desktop Kubernetes v1.36.1 (Windows 11, WSL2, kubeadm provisioning), namespace `mern`, URL `http://mern.localhost`, 6 November 2026. All screenshots are in [`docs/screenshots/`](docs/screenshots/). The commands used for each one are listed so every step can be reproduced. No credentials are visible in any image: MongoDB is accessed with the credentials from the pod environment, and secrets are never printed.

The same checks run automatically in CI (`e2e-deploy` job, see §5): API, ETL idempotency, backup/restore and the MongoDB restart scenario in an ephemeral kind cluster, followed by Cypress UI tests.

## 1. Web Application

### 1.1 Home page

- **Screenshot:** `docs/screenshots/01-web-home.png`
- **Explanation:** `http://mern.localhost/` served through ingress-nginx → `frontend` pod. The "API Status" JSON comes from `GET /api/healthcheck` on the backend, so the screenshot proves the whole path UI → Ingress → backend.

### 1.2 Create operation

- **Form screenshot:** `docs/screenshots/02-record-create-form.png`
- **Successful result screenshot:** `docs/screenshots/03-record-created.png`
- **Explanation:** The "Create New Record" form filled in (Ayse Yilmaz, DevOps Engineer, Junior). After submitting (`POST /api/record` → `201`) the app navigates to `/records` and the new row is listed (`GET /api/record`).

### 1.3 Edit operation

- **Before-edit screenshot:** `docs/screenshots/04-record-edit-before.png`
- **After-edit screenshot:** `docs/screenshots/05-record-edit-after.png`
- **Explanation:** The edit form loaded with the existing values (`GET /api/record/:id`). After "Update Record" (`PATCH`), the list shows the same record with the changed position and level (Senior DevOps Engineer, Senior).

## 2. Docker

- **Image build screenshot:** `docs/screenshots/06-docker-build-and-containers.png`, `docs/screenshots/06b-docker-build-output.png`
- **Running containers screenshot:** `docs/screenshots/06c-docker-running-containers.png`
- **Explanation:**
  - `06`: the three images built locally from the multi-stage Dockerfiles, with their sizes: backend 64.6 MB, etl 48 MB, frontend 26 MB. The frontend runtime image contains only nginx and the static build, no Node.js.
  - `06b`: a `docker build` of the ETL image showing the multi-stage build (`build` stage installs the dependencies, `stage-1` copies only the result, creates the non-root user `etl` with uid 10001 and adds `etl.py`). Layers are reused from the build cache.
  - `06c`: `docker ps` on the Docker Desktop engine that runs the Kubernetes pods: the running containers of `mongo-0`, both `backend` pods, the `frontend` pod and the ingress-nginx controller, all `Up` for several hours. Image `7b1080523a1f` is the same frontend image id as in `06`.
  - The local docker-compose stack (`docker-compose.yml`) is provided for development; the target environment is Kubernetes (§3).

## 3. Kubernetes

- **Pod/workload status:** `docs/screenshots/07-kubernetes-workloads.png`
- **Service and Ingress status:** `docs/screenshots/08-kubernetes-services-ingress.png`
- **ETL CronJob/Job status:** `docs/screenshots/09-etl-cronjob-job.png`
- **Explanation:**
  - `kubectl -n mern get statefulset,deploy,pods,pvc`: StatefulSet `mongo` 1/1, Deployments `backend` 2/2 and `frontend` 1/1, all pods Running with 0 restarts, PVCs `data-mongo-0` and `mongo-backups` Bound.
  - `kubectl -n mern get svc,ingress` + the ingress controller Service: all application Services are `ClusterIP` (internal only, `mongo` headless). The only external entry point is the ingress-nginx `LoadBalancer` on localhost:80, and the Ingress `mern.localhost` routes `/` and `/api`.
  - `kubectl -n mern get cronjob,jobs`: CronJob `github-etl` scheduled `0 * * * *` and CronJob `mongo-backup` scheduled `15 */6 * * *`. Both had already run on their own schedule (`github-etl-29899440`, `mongo-backup-29899455`), plus the manual run `etl-run-2`.

## 4. Python ETL

### 4.1 Initial data load

- **Screenshot or terminal output:** `docs/screenshots/10-etl-first-load.png`
- **Explanation:** The first run was the scheduled CronJob run at 15:00 (`github-etl-29899440`). Its summary line shows `fetched: 5`, `inserted: 5`, `updated: 0`, `documents_before: 0`, `documents_after: 5`, `duplicates_created: 0`; the lines above show each repository with `etl_sync_count: 1`.

### 4.2 Update of the same repository

- **Screenshot or terminal output:** `docs/screenshots/11-etl-update-without-duplicate.png`, `docs/screenshots/11b-etl-db-sync-count.png`
- **Unique field used:** `github_id` (numeric GitHub repository id; unique index `uniq_github_id`)
- **Explanation:** A second run with the same repositories (`kubectl -n mern create job etl-run-2 --from=cronjob/github-etl`): `inserted: 0`, `updated: 5`, `documents_before: 5`, `documents_after: 5`, `duplicates_created: 0`. In mongosh there are still 5 documents, each with `etl_sync_count: 2`, so the existing documents were updated and not duplicated. The configured repository `facebook/react` is stored as `react/react`, because the repository was transferred on GitHub. Its `github_id` 10270250 did not change, which is exactly why the id and not the name is the key.

## 5. CI/CD

- **Successful pipeline screenshot:** `docs/screenshots/12-cicd-pipeline-success.png`
- **Screenshot showing build/image/deployment stages:** `docs/screenshots/12b-cicd-stages.png`
- **Explanation:** GitHub Actions workflow `ci-cd` ([.github/workflows/ci-cd.yaml](.github/workflows/ci-cd.yaml)): `validate` (unit tests, lint, gitleaks secret scan, manifest validation) → `build` (3 images in parallel, Trivy vulnerability scan, SBOM, push to GHCR on `main`) → `e2e-deploy` (kind cluster + ingress-nginx, deploy of the exact images, API/ETL/backup-restore/resilience checks, Cypress UI tests) → `deploy-prod` (renders SHA-pinned prod manifests, gated). The pipeline history also shows the quality gates working: earlier runs were stopped by the Trivy scan on a CRITICAL CVE in a backend dependency (`proxy-addr`) and on fixable CRITICAL OS packages in the frontend base image, both fixed before the green run.

## 6. Backup and Restore

All steps below were executed in this order on the same record "Backup Test".

### 6.1 Record creation

- **Screenshot:** `docs/screenshots/13-backup-record-created.png`, `docs/screenshots/13b-backup-record-in-db.png`
- **Explanation:** Record "Backup Test" (DR drill, Senior) created in the UI. In mongosh it has `_id: ObjectId('6aedc6c7c48572d81a837724')`.

### 6.2 Taking the backup

- **Screenshot or terminal output:** `docs/screenshots/14-backup-taken.png`, `docs/screenshots/14b-backup-files-on-pvc.png`
- **Method and command used:** `kubectl -n mern create job backup-manual-1 --from=cronjob/mongo-backup` runs `mongodump --archive --gzip` ([backup.sh](k8s/base/backup/scripts/backup.sh)).
- **Backup storage location:** PVC `mongo-backups` (namespace `mern`), file `/backups/mongo-20261106T122450Z.archive.gz` with `.sha256` and `.meta` files next to it, listed with [`k8s/jobs/list-backups-job.yaml`](k8s/jobs/list-backups-job.yaml).
- **Explanation:** The job log shows `backup finished`, 2478 bytes, 2 s, and the per-collection counts `employees.records: 2`, `employees.github_repositories: 5`. The listing shows this archive and the scheduled backup from 15:15, each with its checksum and metadata file, and `LATEST` pointing to the new one.

### 6.3 Dropping the collection or database

- **Screenshot or terminal output:** `docs/screenshots/15-collection-dropped.png`
- **Explanation:** In mongosh: `db.records.drop()` → `true`.

### 6.4 Showing that the data is gone

- **Interface screenshot:** `docs/screenshots/16-data-missing-after-drop.png`
- **Database output:** `docs/screenshots/16b-db-empty-after-drop.png`
- **Explanation:** After a refresh the Record List is empty, and `db.records.countDocuments()` returns `0`.

### 6.5 Restoring from the backup

- **Screenshot or terminal output:** `docs/screenshots/17-restore-executed.png`, `docs/screenshots/17a-restore-duration.png`
- **Measured restore duration:** 2 s (checksum + `mongorestore` + verification, `duration_seconds` in the log); 5.8 s end-to-end including Job creation and pod start (`Measure-Command`).
- **Explanation:** `kubectl apply -f k8s/jobs/mongo-restore-job.yaml`. The log shows `mongo-20261106T122450Z.archive.gz: OK` (checksum verified before touching the database), then the per-collection verification `employees.records` expected 2 / actual 2 and `employees.github_repositories` 5 / 5 (`match: true`), and `restore finished and verified`.

### 6.6 Verifying that the data is back

- **Interface screenshot:** `docs/screenshots/18-data-restored-verified.png`
- **Database output:** `docs/screenshots/18b-db-restored.png`
- **Explanation:** Both records are back in the UI without restarting the application, and in mongosh "Backup Test" has the same `_id` as in 6.1 (`6aedc6c7c48572d81a837724`).

> Runbook, RPO/RTO and retention: [docs/backup-restore.md](docs/backup-restore.md).

## 7. Logging, Monitoring, and Advanced Criteria

- **Screenshot:** `docs/screenshots/19-monitoring-or-upper-criteria.png`
- **Explanation:**
  - `kubectl -n mern logs deploy/backend`: structured JSON logs (`ts`, `level`, `service`, `msg`, `method`, `path`, `status`), here the readiness probe `/readyz` answering 200.
  - `kubectl -n mern get networkpolicy,pdb`: default-deny ingress plus explicit allow rules for frontend, backend and MongoDB, and PodDisruptionBudgets for backend and frontend.
  - `kubectl get ns mern --show-labels`: the namespace enforces the Pod Security Standard `restricted`.
  - Prometheus metrics on the backend's internal `/metrics` endpoint and alert rules in [`k8s/monitoring/prometheusrule.yaml`](k8s/monitoring/prometheusrule.yaml) (optional kube-prometheus-stack add-on).

## 8. Additional Evidence: MongoDB failure and recovery

- **Screenshot:** `docs/screenshots/21-mongo-pod-restart-data-persisted.png`
- **Explanation:** `kubectl -n mern delete pod mongo-0`: the StatefulSet recreated `mongo-0` within seconds on the same PVC. Both records are still returned by the API (HTTP 200), and the backend pods were not restarted (RESTARTS 0).

- **Screenshot:** `docs/screenshots/21b-mongo-outage-backend-503-and-recovery.png`
- **Explanation:** `kubectl -n mern scale statefulset mongo --replicas=0` to simulate a longer outage. The backend pods become `0/1` because readiness fails, but they are **not restarted** (RESTARTS 0). With no ready backend endpoint, ingress-nginx answers immediately with `503 Service Temporarily Unavailable` instead of sending traffic to pods that cannot work. After `--replicas=1`, the backend pods become `1/1` on their own, still without a restart, and `GET /api/record` returns both records with HTTP 200.
