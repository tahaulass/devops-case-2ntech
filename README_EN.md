# DevOps Technical Case – MERN application + Python ETL on Kubernetes

The starter MERN application (React, Express, MongoDB) and the GitHub ETL were analysed, fixed, containerised and deployed to Kubernetes with CI/CD, scheduled ETL, backup/restore and basic observability.

| Document | Content |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Architecture and request-flow diagrams (Mermaid sources in `docs/diagrams/`) |
| [docs/findings.md](docs/findings.md) | Issues found, severity, impact, fix, out-of-scope items |
| [docs/backup-restore.md](docs/backup-restore.md) | Backup & restore runbook, RPO/RTO, verification |
| [CASE_END_ANSWERS.md](CASE_END_ANSWERS.md) | Answers to the 16 case questions |
| [SUBMISSION_EVIDENCE.md](SUBMISSION_EVIDENCE.md) | Screenshots (`docs/screenshots/`) and what each one proves |

---

## 1. Architecture (summary)

```
Browser ──► ingress-nginx ──► Ingress mern.localhost ─┬─ "/"    ─► Service frontend (ClusterIP) ─► nginx + React build
                                                      └─ "/api" ─► Service backend  (ClusterIP) ─► Express API (x2)
                                                                                                        │
            CronJob github-etl (hourly) ── GitHub API                                                   ▼
                       └────────── upsert by github_id ──────────────────────► Service mongo (headless) ─► StatefulSet mongo-0 (PVC)
            CronJob mongo-backup (6h) ── mongodump ──► PVC mongo-backups ──► Job mongo-restore (on demand)
```

- **Target environment:** Kubernetes on a local machine (Docker Desktop's built-in Kubernetes on Windows/WSL2). The **same manifests** are deployed by CI into an ephemeral **kind** cluster on every push, where the full end-to-end suite runs.
- **Packaging:** Kustomize (`k8s/base` + `k8s/overlays/dev|prod`).
- **CI/CD:** GitHub Actions → GHCR.

## 2. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Docker Desktop | 4.3x+ | WSL2 backend; **Settings → Kubernetes → Enable Kubernetes** (provisioning method **kubeadm**, so locally built images are visible to the cluster) |
| kubectl | 1.29+ | Installed with Docker Desktop; includes Kustomize (`kubectl apply -k`) |
| Git | any | |
| Node.js 22 / Python 3.12 | optional | only to run unit tests outside containers |

Resources: ~4 GB RAM for Docker Desktop is enough (MongoDB is capped at 1 GiB).

## 3. Quick start with docker-compose (local development)

```powershell
copy .env.example .env          # edit the passwords; .env is git-ignored
docker compose up -d --build
start http://localhost:8080      # UI
docker compose run --rm etl      # run the ETL once (profile "etl")
docker compose down              # add -v to delete the data volume
```

## 4. Deploy to Kubernetes (Docker Desktop)

All commands work in PowerShell and bash. Run them from the repository root.

```powershell
# 4.1 Check the cluster
kubectl config use-context docker-desktop
kubectl get nodes

# 4.2 Ingress controller (one-time)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
kubectl -n ingress-nginx wait --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=180s

# 4.3 Build the images (shared with the cluster, no registry needed)
docker build -t devops-case/backend:local  mern-project/server
docker build -t devops-case/frontend:local mern-project/client
docker build -t devops-case/etl:local      python-project

# 4.4 Secrets (random passwords, created directly in the cluster, never written to disk)
.\scripts\create-secrets.ps1                 # bash: ./scripts/create-secrets.sh
#   optional, higher GitHub rate limit:  $env:GITHUB_TOKEN="<token>"; .\scripts\create-secrets.ps1

# 4.5 Deploy
kubectl apply -k k8s/overlays/dev
kubectl -n mern rollout status statefulset/mongo --timeout=300s
kubectl -n mern rollout status deployment/backend --timeout=300s
kubectl -n mern rollout status deployment/frontend --timeout=300s
kubectl -n mern get pods,svc,ingress,cronjob,pvc
```

Open **http://mern.localhost** (Chrome/Edge resolve `*.localhost` to 127.0.0.1; otherwise add `127.0.0.1 mern.localhost` to `C:\Windows\System32\drivers\etc\hosts`).

Fallback without Ingress: `kubectl -n mern port-forward svc/frontend 8080:80` → http://localhost:8080 (the frontend proxies `/api` itself).

### Production-like deployment

`k8s/overlays/prod` uses the GHCR images pinned to a commit SHA, 3 backend replicas + HPA, larger volumes and TLS. The pipeline renders it (`kustomize edit set image ...:<sha>`) and applies it when a `KUBECONFIG` secret and the approval of the `production` environment are present:

```bash
kubectl kustomize k8s/overlays/prod | less    # inspect
```

## 5. Testing

| Level | Command | Runs in CI |
| --- | --- | --- |
| Backend unit/API tests (fake DB) | `cd mern-project/server && npm ci && npm test` | ✅ |
| Frontend unit test + production build | `cd mern-project/client && npm ci && npm test && npm run build` | ✅ |
| ETL unit tests (mongomock) + lint | `cd python-project && pip install -r requirements-dev.txt && pytest && ruff check .` | ✅ |
| Manifest rendering + schema validation | `kubectl kustomize k8s/overlays/dev` / `kubeconform` | ✅ |
| End-to-end on a cluster (API, ETL idempotency, backup/restore, Mongo restart) | `./scripts/e2e-k8s.sh` (bash) | ✅ in kind |
| UI end-to-end (Cypress: create/list/edit/delete) | `cd mern-project/client && npx cypress run --config baseUrl=http://mern.localhost` | ✅ in kind |

### Python ETL

```powershell
kubectl -n mern get cronjob github-etl                               # schedule 0 * * * *
kubectl -n mern create job etl-manual-1 --from=cronjob/github-etl    # run now
kubectl -n mern logs -f job/etl-manual-1
```

The ETL upserts on `github_id` (numeric GitHub repository id, unique index). The last log line reports `inserted`, `updated`, `documents_before/after` and `duplicates_created`. Repositories are configured in `etl-config` (`GITHUB_REPOS`, optional `GITHUB_ORG`).

### Backup / restore

See [docs/backup-restore.md](docs/backup-restore.md). Short version:

```powershell
kubectl -n mern create job backup-manual-1 --from=cronjob/mongo-backup
kubectl -n mern logs job/backup-manual-1
kubectl apply -f k8s/jobs/mongo-restore-job.yaml
kubectl -n mern logs job/mongo-restore
```

### Inspecting MongoDB

```powershell
kubectl -n mern exec -it mongo-0 -- bash
# inside the pod (credentials come from the pod's environment, never typed or shown):
mongosh -u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD --authenticationDatabase admin employees
> db.records.find()
> db.github_repositories.countDocuments()
```

## 6. CI/CD

[`.github/workflows/ci-cd.yaml`](.github/workflows/ci-cd.yaml) – every job depends on the previous one, so any failure stops the pipeline.

1. **validate** – gitleaks secret scan, backend/frontend/ETL tests and lint, frontend production build, Kustomize render + kubeconform schema validation, shellcheck.
2. **build** (matrix: backend, frontend, etl) – Docker build with layer cache, **Trivy** scan (fails on fixable CRITICAL), HIGH report, **CycloneDX SBOM**, push to `ghcr.io/<owner>/devops-case-<name>:<git-sha>` on `main`.
3. **e2e-deploy** – kind cluster + ingress-nginx, load the exact images built in step 2, create secrets, `kubectl apply -k k8s/overlays/dev`, run `scripts/e2e-k8s.sh` and Cypress against `http://mern.localhost`; dumps diagnostics on failure.
4. **deploy-prod** (main only, `production` environment) – renders the prod overlay pinned to the commit SHA, stores it as an artifact and applies it if a cluster is configured, with automatic `rollout undo` if the rollout does not become healthy.

## 7. Rollback

```powershell
kubectl -n mern rollout history deployment/backend
kubectl -n mern rollout undo deployment/backend                  # previous ReplicaSet
kubectl -n mern rollout undo deployment/backend --to-revision=3  # specific revision
kubectl -n mern rollout status deployment/backend
kubectl -n mern get deploy backend -o jsonpath="{.spec.template.spec.containers[0].image}"
```

With the pipeline: revert the commit (`git revert <sha>` + push) – CI builds, tests and redeploys a known-good state; or re-run the `deploy-prod` job of an earlier successful run (images are immutable, tagged by SHA). Data changes are rolled back with the restore Job.

## 8. Cleanup

```powershell
kubectl delete -k k8s/overlays/dev          # app, jobs, services, ingress, namespace
kubectl delete pvc --all -n mern            # only if the namespace still exists (deletes data + backups!)
kubectl delete -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
docker image rm devops-case/backend:local devops-case/frontend:local devops-case/etl:local
docker compose down -v                      # compose stack and its volume
```

## 9. Troubleshooting

| Symptom | Check | Typical cause / fix |
| --- | --- | --- |
| Pods `ErrImageNeverPull` | `kubectl -n mern describe pod <pod>` | Images not built, or Docker Desktop uses the **kind** provisioning method → rebuild, or switch to kubeadm, or `kind load docker-image` |
| Pods `CreateContainerConfigError` | `kubectl -n mern describe pod <pod>` | Secrets missing → run `scripts/create-secrets.ps1` |
| `mongo-0` `CrashLoopBackOff` with permission errors | `kubectl -n mern logs mongo-0` | Volume not writable by uid 999 → `kubectl delete -k ...; kubectl delete pvc data-mongo-0 -n mern` and redeploy |
| Backend `0/1 Ready` | `kubectl -n mern logs deploy/backend`, `/readyz` | MongoDB not ready / wrong credentials (secret created after Mongo initialised: the app user is created only on the **first** start → delete PVC `data-mongo-0` or create the user manually) |
| `http://mern.localhost` not reachable | `kubectl -n ingress-nginx get svc` | Controller service must have `EXTERNAL-IP localhost`; port 80 used by another program (IIS, Skype) |
| UI loads but "API unreachable" | `kubectl -n mern get ingress mern` | Ingress class not `nginx`; use port-forward fallback |
| ETL job failed | `kubectl -n mern logs job/<name>` | GitHub rate limit (60/h unauthenticated) → add `GITHUB_TOKEN`; Mongo unreachable |
| Backup job failed | `kubectl -n mern logs job/<name>` | PVC `mongo-backups` full / not bound |
| NetworkPolicies not enforced locally | — | Docker Desktop's default network does not enforce NetworkPolicy; they are enforced in the CI kind cluster (kindnet) and on Calico/Cilium clusters |

## 10. Decisions and known limitations

- Kubernetes runs on a single-node local cluster; MongoDB is a single-member StatefulSet. Production: managed MongoDB or a 3-member replica set across zones, off-site backups with PITR (see findings and runbook).
- ingress-nginx was retired by the Kubernetes project in March 2026; it is used here only for local/CI. Production: Gateway API with a maintained controller.
- Secrets are Kubernetes Secrets created by a script; production: External Secrets Operator / Sealed Secrets backed by a secret manager, etcd encryption at rest.
- Full list: [docs/findings.md – Out of scope](docs/findings.md#out-of-scope-intentionally-not-fixed).
