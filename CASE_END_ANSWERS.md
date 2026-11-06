# CASE END ANSWERS

---

## Candidate Information

- **Full name:** Taha Ulaş
- **Repository URL:** https://github.com/tahaulass/devops-case-2ntech
- **Completion date:** 6 November 2026
- **Target environment used:** Local Kubernetes – Docker Desktop (Windows 11 + WSL2, built-in Kubernetes v1.36.1, kubeadm provisioning). CI deploys the same manifests to an ephemeral kind cluster on every push.

---

## 1. Architecture and Request Flow

Diagram: [docs/architecture.md](docs/architecture.md) (Mermaid sources: `docs/diagrams/*.mmd`, rendered `docs/architecture.svg`).

- **Edge:** ingress-nginx (Service `LoadBalancer`, on Docker Desktop bound to localhost:80) with one Ingress `mern` for host `mern.localhost`: `/` → `frontend`, `/api` → `backend`. This is the only external entry point.
- **frontend:** Deployment, unprivileged nginx serving the static React build (no Node.js at runtime), ClusterIP Service.
- **backend:** Deployment (2 replicas), Express API, ClusterIP Service, probes `/healthz` (liveness) and `/readyz` (readiness, pings MongoDB), `/metrics` for Prometheus.
- **MongoDB:** StatefulSet `mongo` (1 replica) with a PVC from `volumeClaimTemplates`, headless Service, authentication enabled.
- **Batch:** CronJob `github-etl` (hourly), CronJob `mongo-backup` (6-hourly) writing to PVC `mongo-backups`, on-demand Job `mongo-restore`.

**Request path (create record):** the browser loads the SPA from `frontend` via the Ingress → the form posts to the same origin `POST /api/record` → ingress-nginx matches `/api` and forwards to the `backend` Service → kube-proxy selects one *ready* backend pod → the API validates the payload (`400` on error), uses its pooled connection (app user with `readWrite` on `employees` only) to the `mongo` headless Service → `insertOne` → `201 Created` back along the same path. The UI then navigates to `/records`, which calls `GET /api/record`.

## 2. Critical Findings and Prioritisation

Criteria: **impact** (outage, data loss, security vs. degraded vs. hygiene) × **likelihood** (triggered by any user or routine event vs. specific condition). Full list: [docs/findings.md](docs/findings.md).

1. **One request can crash the backend (F2).** `GET /record/<invalid-id>` threw inside an async handler → unhandled rejection → Node exits. Any anonymous user can cause an outage; any DB error had the same effect. High × High. Fixed with id validation, an async wrapper and a central error handler (400/500/503), covered by tests.
2. **Backend crashes if MongoDB is not reachable at start-up, and health checks are blind to the DB (F1 + F4).** `conn.db()` on `undefined` → CrashLoopBackOff on every cold start/DB restart, while `/healthcheck` reported OK even when the DB was down. High × High (start ordering is routine in Kubernetes). Fixed with lazy connect + driver reconnection, separate liveness/readiness, graceful shutdown.
3. **Frontend hard-coded to `http://localhost:5050` (F3).** Every user flow fails in any deployed environment. High × High. Fixed with a same-origin `/api` base path routed by the Ingress/nginx.

(Also critical: the ETL did not exist (F15) and nothing was deployable (F16) – both required rewrites rather than bug fixes.)

## 3. Items Left Out of Scope

- **Authentication/authorisation of the API** – a product change (users, login, roles); the case asks not to rebuild the app. Mitigated: no external exposure besides the Ingress, input validation, rate limit on the Ingress. Next step: OIDC at the Ingress or JWT middleware.
- **MongoDB replica set/HA, PITR, off-site backups** – a 3-member replica set on a single-node laptop cluster gives no real availability; object storage needs a cloud account. Documented in the runbook §7.
- **Create React App → Vite migration, pagination** – frontend/API contract work with no deployment value here.
- **TLS locally, GitOps (Argo CD), canary releases** – time-boxed; the prod overlay already has the TLS section and the pipeline produces SHA-pinned manifests that a GitOps controller could consume.
- **Gateway API instead of ingress-nginx** – ingress-nginx is retired (March 2026) but still the simplest working option for Docker Desktop/kind; production would use Gateway API.

## 4. Target Environment Selection

**Choice:** Docker Desktop Kubernetes on my Windows laptop + ephemeral kind clusters in CI.
**Why:** no cost, reproducible by any reviewer with Docker Desktop, real Kubernetes API (same manifests as production), fast feedback. Running the identical deployment in kind inside CI makes the result verifiable by others and proves reproducibility from a clean cluster on every push.
**Limitations:** single node (no real HA, topology spread and PDBs have no effect), hostpath storage, NetworkPolicies not enforced by Docker Desktop's network (they are enforced in kind), no real DNS/TLS, the laptop is the single point of failure.
**In production I would use:** a managed Kubernetes service (EKS/AKS/GKE) with ≥ 3 nodes across zones, provisioned with Terraform; managed MongoDB (Atlas) or the MongoDB operator with a replica set; a CSI storage class with snapshots; Gateway API + cert-manager; External Secrets Operator with a cloud secret manager; Argo CD for deployments; centralised logging/metrics (Loki/Prometheus or the cloud equivalent).

## 5. MongoDB Approach

**Chosen:** in-cluster MongoDB 7 as a **StatefulSet** (1 member) with a PVC per pod, a **headless Service**, authentication with separate root and app users, resource limits and WiredTiger cache cap.

| Option | Advantages | Disadvantages / trade-offs |
| --- | --- | --- |
| **StatefulSet in cluster (chosen)** | Self-contained and reproducible, no external account, full control, demonstrates stateful workloads + backup/restore on Kubernetes | We own upgrades, backups, monitoring, HA; single member = downtime during restarts |
| Managed (MongoDB Atlas) | HA replica set, automated backups + PITR, upgrades, monitoring | Needs an account/network access from the cluster, cost, less to demonstrate for the backup criterion, secrets for an external endpoint |
| MongoDB Community/Percona Operator | Replica sets, automated failover, backup integration (PBM) | More moving parts (CRDs, operator lifecycle) than justified on a laptop |
| Deployment + PVC | Simpler YAML | No stable identity, rolling update could start two mongod on one volume; wrong primitive for a database |

For production I would choose Atlas (or the Percona/MongoDB operator if data must stay in-cluster) with a 3-member replica set.

## 6. Helm or Manifest Management

I used **Kustomize** (built into `kubectl`) instead of Helm.

- **Why:** the application has one consumer and a small set of differences between environments (image names/tags, replicas, HPA, ingress host/TLS, storage size). Kustomize expresses these as overlays/patches on plain, readable YAML, needs no extra tool, and `kubectl apply -k` works everywhere (also in CI). `configMapGenerator` adds content hashes to ConfigMap names, so a config change automatically rolls the pods. `kustomize edit set image` gives SHA-pinned prod manifests.
- **Helm would add:** templating logic, packaging/versioning of a chart, release history and `helm rollback`, dependency management. Those are valuable when distributing an app to many teams or when values vary a lot, but they add template complexity (`{{ }}` everywhere, harder reviews) and another tool/state (release secrets).
- Helm is still used where it fits: installing third-party software (`kube-prometheus-stack`, see `k8s/monitoring/`).

## 7. Kubernetes Service Types

Criteria: *Does it need to be reachable from outside the cluster? Does the client need one virtual IP or individual pod identities?*

| Service | Type | Reason |
| --- | --- | --- |
| `frontend` | ClusterIP | Reached only through the Ingress; no direct node/LB exposure |
| `backend` | ClusterIP | Reached by the Ingress (`/api`) and the frontend proxy; `/metrics` stays internal |
| `mongo` | **Headless** (`clusterIP: None`) | StatefulSet governing Service: stable DNS per pod (`mongo-0.mongo.mern.svc`) needed for replica sets later, and clients connect to the real pod IP |
| `ingress-nginx-controller` | LoadBalancer | The single external entry point (on Docker Desktop it binds to localhost; in the cloud a cloud LB) |

Not used: **NodePort** (opens a port on every node, bypasses the Ingress policies), **LoadBalancer per app** (more public endpoints, cost), **ExternalName** (no external dependency referenced by DNS name; the GitHub API is called directly).
**Preventing unnecessary exposure:** only `/` and `/api` are routed; MongoDB and `/metrics` have no external route; NetworkPolicies default-deny ingress and allow MongoDB only from backend/ETL/backup/restore pods; no `hostPort`/`hostNetwork` (blocked by Pod Security "restricted").

## 8. Kubernetes Workload Types

| Component | Workload | Stateless/stateful | Storage | Identity/order | Frequency | Restart | Scaling |
| --- | --- | --- | --- | --- | --- | --- | --- |
| frontend | Deployment | Stateless | none (emptyDir for nginx temp) | interchangeable pods | long-running | `Always`, rolling update `maxUnavailable: 0` | horizontal (HPA in prod) |
| backend | Deployment | Stateless (state in MongoDB) | none | interchangeable | long-running | `Always`, readiness-gated rolling update, PDB | horizontal (HPA on CPU in prod) |
| MongoDB | StatefulSet | Stateful | PVC per pod via `volumeClaimTemplates`, survives pod deletion | stable name `mongo-0` and DNS, ordered start/stop | long-running | restarted on same volume | vertical now; replica set members later |
| ETL | CronJob → Job | Run-to-completion | none | none | hourly `0 * * * *` | `restartPolicy: Never`, `backoffLimit: 2`, `concurrencyPolicy: Forbid`, `activeDeadlineSeconds` | n/a (one run at a time) |
| backup | CronJob → Job | Run-to-completion | PVC `mongo-backups` | none | every 6 h | `backoffLimit: 1`, `Forbid` | n/a |
| restore | Job (manual) | Run-to-completion | PVC read-only | none | on demand | `backoffLimit: 0` (never retry a destructive operation automatically) | n/a |

A Deployment for MongoDB was rejected (no stable identity, two pods could mount one volume during a rollout); a long-running loop with `sleep 3600` for the ETL was rejected (Kubernetes already schedules, retries, records history and exposes job status for alerting).

## 9. Configuration and Secret Management

- **Non-secret config:** ConfigMaps generated by Kustomize (`app-config`: DB name; `etl-config`: repositories, collection), plus env values in the manifests. The generator appends a content hash to the ConfigMap name, so changing a value rolls out new pods automatically.
- **Secrets:** `mongo-root`, `mongo-app`, optional `github-token` and `alerting`. Created by [`scripts/create-secrets.ps1`/`.sh`](scripts/) with random passwords directly in the cluster; nothing secret is in git, in images or in CI logs (`.gitignore`, `.dockerignore`, gitleaks in CI). Pods get them as env vars via `secretKeyRef`; least privilege: the app/ETL use the `app` user (readWrite on `employees` only), root is used only by backup/restore. `automountServiceAccountToken: false` everywhere.
- **Rotation:** env vars are read at start, so a rotation is: 1) create the new credential in MongoDB (`db.updateUser` / new user) while the old one still works; 2) update the Secret (`kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`, or the secret manager); 3) `kubectl rollout restart deployment/backend` – the rolling update with readiness probes only shifts traffic to pods that connected successfully with the new value, and fails safe (old pods keep serving) if the new value is wrong; CronJobs pick it up on their next run; 4) revoke the old credential after verification. In production: External Secrets Operator syncing from Vault/AWS Secrets Manager plus Reloader (or a checksum annotation) to trigger the restart automatically; etcd encryption at rest.

## 10. MongoDB Availability Failure

- **Backend process:** keeps running (the starter crashed). The driver retries server selection for 5 s per operation and reconnects automatically when MongoDB returns.
- **Requests:** DB operations fail fast with **503 "database unavailable, please retry"** (not 500, not a hang); `GET /api/healthcheck` (UI status) still answers.
- **Readiness:** `/readyz` pings MongoDB → 503 → pods are removed from the Service endpoints, so the Ingress returns 503 quickly instead of routing to broken pods.
- **Liveness:** `/healthz` does **not** depend on MongoDB → no restart storm; when MongoDB comes back, readiness turns green and traffic resumes by itself.
- **Start-up order:** found during the deployment – the backend pods started before MongoDB and stayed not-ready forever, because the Node.js driver keeps a closed topology after a failed *first* connect. The backend now connects in a retry loop and replaces a failed client with a new one every 5 s, so the start order of backend and MongoDB no longer matters (details in [findings F1](docs/findings.md)). Verified in CI (`scripts/e2e-k8s.sh` deletes `mongo-0` and checks the API recovers with backend restart count 0).
- **Additional measures:** bounded pool (`maxPoolSize`) and timeouts, graceful shutdown, ETL/backup jobs fail with non-zero exit (retried by `backoffLimit`, alerted), alerts `MongoNotReady` and `BackendNoReadyPods`. For production: replica set (automatic failover in seconds), a friendly error/retry in the UI, a circuit breaker and a PDB for MongoDB.

## 11. Faulty Deployment and Rollback

**Detection:** (1) before deploy – CI stops on failing tests, build, vulnerability scan or e2e; (2) during rollout – readiness/startup probes: with `maxUnavailable: 0` a pod that never becomes ready stops the rollout while old pods keep serving; `kubectl rollout status --timeout` fails the pipeline; (3) after rollout – alerts on 5xx rate, p95 latency, crash loops (`k8s/monitoring/prometheusrule.yaml`) and the e2e/smoke test.
**Rollback:** `kubectl rollout undo deployment/<name>` (previous ReplicaSet, `revisionHistoryLimit: 5`), automatic in the `deploy-prod` job when `rollout status` fails. In Git: `git revert` + pipeline (SHA-pinned images make any earlier version redeployable). With GitOps (next step) Argo CD would sync back to the previous commit.
**Verification:** `kubectl rollout status` succeeded, the running image tag equals the previous SHA (`kubectl get deploy -o jsonpath='{..image}'`), all pods Ready with 0 restarts, smoke test (`/api/healthcheck`, `GET /api/record`) passes, 5xx/latency back to baseline. If a release changed data, restore with the restore Job (take an on-demand backup before risky releases).

## 12. Scalability and Bottlenecks

**First bottleneck:** MongoDB – single member, 1 CPU/1 GiB limit, small WiredTiger cache, and `GET /record` returns the whole collection (limit 1000) without pagination or index use. Each extra backend pod also adds up to `maxPoolSize` (20) connections.
**Scale:**
- **backend** horizontally via HPA on CPU (target 70 %, min 3 / max 10 in prod) and, with Prometheus Adapter, on request rate per pod / p95 latency (> 300 ms); verify `replicas × maxPoolSize` stays well below MongoDB's connection capacity (monitor `connections.current`, ~ 1 MB RAM each).
- **frontend** is cheap (static nginx) – HPA on CPU; better: CDN for static assets.
- **MongoDB** vertically first (CPU/RAM, cache), then replica set with read preference `secondaryPreferred` for list queries, indexes, pagination; sharding only if data grows.
- **Ingress controller** replicas based on CPU and connections.
**Metrics/thresholds:** CPU > 70 %, memory > 80 % of limit, p95 latency > 300 ms, 5xx > 1 %, Mongo connections > 70 % of max, Mongo query latency / tickets, pod restarts, Ingress `nginx_ingress_controller_requests`. Dependent services: the GitHub API is not in the request path (ETL only); rate limit is handled with a token and backoff. I would validate with a load test (k6) at 10× the baseline before changing limits.

## 13. Logging, Monitoring, and Alerting

**Logs:** all components log **JSON lines to stdout** (`ts`, `level`, `service`, `msg`, fields): backend access log (method, path, status) and errors without stack traces to clients; ETL per-run summary (`fetched`, `inserted`, `updated`, `documents_before/after`, `duplicates_created`, `duration_seconds`) and per-repository lines; backup/restore with file, size, duration, counts. Accessible via `kubectl logs` (Jobs keep history: 3 successful/3 failed), ready for Loki/Fluent Bit.
**Metrics:** backend `/metrics` (Prometheus): `http_requests_total{method,route,status}`, `http_request_duration_seconds` histogram, Node.js process metrics; kube-state-metrics for workloads, jobs and cronjobs.
**Alerts** (`k8s/monitoring/prometheusrule.yaml`, executable with kube-prometheus-stack): `BackendNoReadyPods`, `MongoNotReady`, `PodCrashLooping`, `BackendHigh5xxRate`, `BackendHighLatencyP95`, `GithubEtlJobFailed`, `GithubEtlNotRunRecently`, `MongoBackupJobFailed`, `MongoBackupTooOld`, `PersistentVolumeAlmostFull`. Independently of Prometheus, the ETL and backup jobs post to a webhook (Slack/Teams) on failure if `ALERT_WEBHOOK_URL` is configured.
**During an incident** I look first at: the firing alert and its runbook hint → `kubectl -n mern get pods,events` (restarts, probe failures, OOMKilled, scheduling) → the 5xx/latency panels per route → backend logs filtered by `level=error` → MongoDB readiness/logs and PVC usage → recent deployments (`kubectl rollout history`, CI run) to correlate with a release.

## 14. Security Risks

1. **Unauthenticated API reachable through the Ingress** – anyone who can reach the host can read/modify records. *Implemented:* strict validation, body size limit, ingress rate limit, no CORS, generic error messages. *Production:* OIDC/JWT authentication and authorisation, WAF, TLS only.
2. **Credential leakage / over-privileged credentials** – *implemented:* no secrets in git/images (gitleaks, `.gitignore`, `.dockerignore`), random per-environment passwords, separate least-privilege app user, root only for backup jobs, no service-account tokens mounted, NetworkPolicy limiting who can reach MongoDB. *Production:* secret manager + External Secrets, etcd encryption, rotation policy, dedicated backup user, audit logs.
3. **Vulnerable or compromised supply chain / container escape** – *implemented:* Trivy scan fails the build on fixable CRITICAL CVEs, SBOM, minimal images (nginx-only frontend, slim Python, Alpine Node), non-root, read-only root filesystem, all capabilities dropped, seccomp `RuntimeDefault`, Pod Security "restricted" enforced on the namespace, third-party action pinned by commit SHA. *Production:* pin base images by digest + Renovate, image signing (cosign) and admission verification (Kyverno), private registry, policy-as-code.

## 15. Python ETL Record Update Behaviour

The ETL builds one `UpdateOne` per repository and executes them in a single `bulk_write`:
```python
UpdateOne({"github_id": repo["id"]},
          {"$set": {...fields, "etl_last_synced_at": now},
           "$setOnInsert": {"etl_first_seen_at": now},
           "$inc": {"etl_sync_count": 1}},
          upsert=True)
```
- **Unique key:** `github_id` = the numeric GitHub repository `id`. Unlike `full_name`, it does not change when a repository is renamed or transferred (covered by a unit test). A **unique index** `uniq_github_id` guarantees no duplicates even with concurrent runs; `concurrencyPolicy: Forbid` prevents overlapping runs anyway.
- First run → `upserted` (inserted); later runs → matched and updated (`$set` refreshes stars, forks, etc.; `etl_sync_count` increments; `etl_first_seen_at` keeps the original value).
- **Evidence:** `docs/screenshots/10-etl-first-load.png` – the first, automatically scheduled CronJob run (`github-etl-29899440`): `inserted: 5`, `documents_before: 0`, `documents_after: 5`. `docs/screenshots/11-etl-update-without-duplicate.png` – a second, manual run with the same repositories (`etl-run-2`): `inserted: 0`, `updated: 5`, `documents_before: 5`, `documents_after: 5`, `duplicates_created: 0`. `docs/screenshots/11b-etl-db-sync-count.png` – mongosh shows still 5 documents, each with `etl_sync_count: 2`. The CI e2e job asserts the same automatically.
- **Real-world proof of the key choice:** the configured repository `facebook/react` is now stored as `react/react` – the repository was transferred on GitHub since it was added to the list. Its `github_id` (10270250) did not change, so the ETL updated the existing document. Keying on `full_name` would have created a duplicate.

## 16. Backup and Restore Approach

- **Method / location:** `mongodump --archive --gzip` by CronJob `mongo-backup` to a dedicated PVC `mongo-backups` (separate from the DB volume), with SHA-256 checksum and a `.meta` file of per-collection document counts. Restore: Job `mongo-restore` (`mongorestore --drop --nsInclude 'employees.*'`).
- **Frequency / retention:** every 6 h + on demand before risky changes; retention 7 days (pruned by the job).
- **Targets:** RPO ≤ 6 h; RTO ≤ 15 min. **Measured restore duration:** 2 s for checksum verification + `mongorestore` + count verification (restore log `duration_seconds`), 5.8 s end-to-end including Job creation and pod start-up (`Measure-Command`, see `docs/screenshots/17-restore-executed.png` and `17a-restore-duration.png`).
- **Integrity verification:** `.partial` file + atomic rename (no half-written backups), `gzip -t`, minimum size, checksum verified before every restore, post-restore document counts compared with the counts recorded at backup time (Job fails on mismatch), and the record visible again in the UI. The full drill (create → backup → drop → verify gone → restore → verify back) runs in every CI pipeline.
- **Production changes:** copy every archive to object storage in another region/account with versioning + Object Lock and KMS encryption; replica set + oplog/PITR backups (Percona Backup for MongoDB or Atlas continuous backup) for an RPO of minutes; dedicated `backup` user; weekly automated restore drill into a scratch instance with alerting; backup-age and size alerts (already defined).

Runbook: [docs/backup-restore.md](docs/backup-restore.md) · Evidence: [SUBMISSION_EVIDENCE.md §6](SUBMISSION_EVIDENCE.md#6-backup-and-restore).

---

## Additional Notes

- Advanced criteria implemented: **Packaging & environment management** (Kustomize dev/prod overlays), **Advanced security** (NetworkPolicies, Pod Security restricted, Trivy, SBOM, gitleaks, SHA-pinned actions), **High availability & scaling** (PDBs, topology spread, rolling updates with `maxUnavailable: 0`, HPA in prod), **Observability** (Prometheus metrics, alert rules, structured logs) and an automated **DR drill** in CI. Designed but not implemented: Terraform, GitOps, off-site backups.
- AI assistance (Claude) was used for writing code and documentation. I reviewed the decisions and ran every deployment step, test and the backup/restore scenario myself; the screenshots are from my environment.
