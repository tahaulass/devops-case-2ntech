# Findings

Production-readiness issues identified in the starter projects, how they were prioritised, and what was done.

## Prioritisation criteria

Each finding is scored on two axes and sorted by the product:

- **Impact** – what happens when it triggers: full outage / data loss / security breach (High), degraded or incorrect behaviour (Medium), maintainability or hygiene (Low).
- **Likelihood** – how easily it triggers in production: any user or any routine event such as a restart or deploy (High), a specific condition (Medium), unlikely (Low).

Severity: **Critical** = High × High · **High** = High × Medium or Medium × High · **Medium** / **Low** otherwise.
A finding was fixed if it blocks running the system on Kubernetes, can cause an outage or data loss, or is a security issue. Everything else is documented below as out of scope.

## Summary

| # | Area | Finding | Severity | Status |
| --- | --- | --- | --- | --- |
| F1 | Backend | Crash when MongoDB is unreachable at start-up | Critical | Fixed |
| F2 | Backend | One request with an invalid id kills the process (DoS) | Critical | Fixed |
| F3 | Frontend | API URL hard-coded to `http://localhost:5050` | Critical | Fixed |
| F4 | Backend | Health check does not reflect dependencies; no readiness/liveness split | High | Fixed |
| F5 | Backend | Wrong HTTP status codes (`res.send().status()`) | High | Fixed |
| F6 | Backend | No input validation: arbitrary fields and types written to the DB | High | Fixed |
| F7 | Backend | CORS open to every origin | Medium | Fixed |
| F8 | Config | Config loaded from `config.env` while the example file is `.env-example`; port and DB name hard-coded | High | Fixed |
| F9 | Backend | No graceful shutdown (SIGTERM) → dropped requests on every rollout | Medium | Fixed |
| F10 | Tests | `npm test` in the backend always fails (`exit 1`) → no pipeline can pass | High | Fixed |
| F11 | Tests | Cypress test checks the wrong page, deletes "any" record, Cypress 4 (2020) | Medium | Fixed |
| F12 | Frontend | After create/edit the user is redirected to the health page; errors are swallowed | Medium | Fixed |
| F13 | Frontend | Stray `;` rendered inside `<Routes>`; `useEffect` dependency causing a double fetch | Low | Fixed |
| F14 | Frontend | `cypress` and testing libraries in production `dependencies` (~500 MB binary in image builds) | Medium | Fixed |
| F15 | ETL | ETL only calls `https://api.github.com` and prints; no load, no idempotency, no scheduling, no error handling | Critical | Fixed (rewritten) |
| F16 | Ops | No Dockerfiles, no orchestration, no CI/CD, no backups | Critical | Fixed |
| F17 | Security | No authentication/authorisation on the CRUD API | High | Out of scope (documented) |
| F18 | Data | No MongoDB authentication model (single URI, implicitly admin) | High | Fixed (least-privilege app user) |
| F19 | Frontend | Create React App is deprecated; outdated transitive dependencies | Medium | Out of scope (documented) |
| F20 | Backend | `GET /record` returns the entire collection (no pagination) | Medium | Mitigated (limit 1000), pagination out of scope |

## Details

### F1 – Backend crashes when MongoDB is unreachable at start-up (Critical)
`db/conn.mjs` awaited `client.connect()` in a `try/catch`, logged the error and then called `conn.db(...)` with `conn === undefined` → `TypeError` at import time. With Kubernetes this means CrashLoopBackOff whenever the backend starts before MongoDB (a normal situation on first deploy, node restarts, DB maintenance).
**Fix:** the client is created without blocking start-up; the driver connects lazily and reconnects by itself. The HTTP server always starts, readiness reports the DB state. Connection pool and server-selection timeouts are configurable. ([server/db/conn.mjs](../mern-project/server/db/conn.mjs), [server/server.mjs](../mern-project/server/server.mjs))

### F2 – Invalid id → unhandled rejection → process exit (Critical)
`new ObjectId(req.params.id)` throws for any non-24-hex id. Inside an `async` Express 4 handler this becomes an unhandled promise rejection, which terminates Node ≥ 15. `GET /record/abc` was enough to take an instance down; the same applied to any MongoDB error.
**Fix:** `ObjectId.isValid` → `400`; every handler is wrapped so errors reach a central error handler (`500`, or `503` for DB connectivity errors) without stack traces. Covered by unit tests. ([routes/record.mjs](../mern-project/server/routes/record.mjs), [app.mjs](../mern-project/server/app.mjs))

### F3 – Hard-coded `http://localhost:5050` in all components (Critical)
Works only when browser, frontend and backend run on the same laptop. In any deployed environment every user flow fails.
**Fix:** single `API_URL` (default: same-origin `/api`). nginx (compose) and the Ingress (Kubernetes) route `/api` to the backend, so no CORS is needed and the same image works in every environment. ([client/src/api.js](../mern-project/client/src/api.js))

### F4 – Health check without dependency awareness (High)
`/healthcheck` always returned "OK", even with the DB down, so Kubernetes would send traffic to pods that can only fail. Conversely, using a DB-dependent check as *liveness* would restart all pods during a DB outage.
**Fix:** `/healthz` (liveness, process only), `/readyz` (readiness, pings MongoDB, 503 while shutting down), plus a startup probe. The original `/healthcheck` is kept for the UI. ([routes/healthcheck.mjs](../mern-project/server/routes/healthcheck.mjs))

### F5 – Status codes are never applied (High)
`res.send(x).status(404)` sends the response first, so the status is always 200 (and `POST` advertised `204` with a body). Clients, probes, monitoring and alerting cannot distinguish errors.
**Fix:** `res.status(code).json(body)` everywhere: `201` create, `400` validation, `404` not found (also for update/delete of a missing id), `503` DB down.

### F6 – No input validation (High)
Any type was written (`name` could be an object), empty records were accepted, no size limit on the body.
**Fix:** whitelist of `name`, `position` (non-empty strings, ≤ 100 chars) and `level` (`Intern|Junior|Senior`); JSON body limit 10 kB; invalid JSON → 400.

### F7 – CORS open to all origins (Medium)
`app.use(cors())` allowed any website to call the API from a user's browser.
**Fix:** same-origin by default; explicit allow-list via `CORS_ORIGINS` for local development only.

### F8 – Inconsistent / hard-coded configuration (High)
`loadEnvironment.mjs` read `./config.env`, the example was `.env-example` with a different variable name convention, `PORT` was a constant and the DB name was the Atlas sample DB `sample_training`. The connection fell back silently to `localhost:27017`.
**Fix:** [config.mjs](../mern-project/server/config.mjs): all settings from environment variables, `.env` only outside production, fail fast if `MONGODB_URI` is missing, `.env.example` documented. In Kubernetes: ConfigMap for non-secret values, Secret for the URI.

### F9 – No graceful shutdown (Medium)
SIGTERM killed the process immediately; in-flight requests failed on every rollout/scale-down.
**Fix:** on SIGTERM readiness turns 503, the server stops accepting connections, finishes in-flight requests, closes the Mongo pool (bounded by a timeout); `tini` as PID 1 forwards signals; `preStop` sleep lets endpoints be removed first.

### F10 / F11 – Tests (High / Medium)
Backend `npm test` was `exit 1`. The Cypress test expected the new employee on `/` (the health page), its `after` hook clicked the first "Delete" on the page (could delete real data), and it used Cypress 4 with the legacy `cypress.json` / `integration` layout.
**Fix:** backend unit/API tests with `node:test` and an in-memory fake DB (no extra dependencies); a React unit test; Cypress 13 E2E covering home, create, list, edit, delete on a uniquely named record, executed in CI against the real deployment in kind.

### F12 / F13 – Frontend behaviour (Medium / Low)
After a successful create/edit the app navigated to `/` (API status), so the user never saw the result; failed requests were not reported. A stray `;` was rendered as text inside `<Routes>`; `useEffect([records.length])` re-fetched after the first load.
**Fix:** navigate to `/records`, show the server's validation message on failure, removed the stray character and the needless dependency.

### F14 – Dev tooling in production dependencies (Medium)
`cypress` was a runtime dependency, so every image build downloaded the Cypress binary.
**Fix:** moved to `devDependencies`; `CYPRESS_INSTALL_BINARY=0` in the image build; the final frontend image contains only nginx + static files (no Node.js).

### F15 – ETL (Critical for the ETL requirement)
The starter only printed the GitHub API root response.
**Fix:** [etl.py](../python-project/etl.py): GitHub API (explicit repo list and/or an organisation), timeouts and retries with backoff (5xx, 429, rate limit), optional token, transform to a flat schema, **upsert keyed on the numeric GitHub repository id** with a **unique index**, `$setOnInsert` for first-seen, `$inc` sync counter, JSON logs with inserted/updated/duplicates counts, non-zero exit on failure + optional webhook alert. Runs as an hourly CronJob with `concurrencyPolicy: Forbid`.

### F16 – Operations (Critical)
No container images, deployment, pipeline or backups existed. See README for the full implementation (Dockerfiles, Kustomize, GitHub Actions, backup CronJob + restore Job).

### F18 – MongoDB credentials (High)
The starter assumed a single (Atlas admin) URI.
**Fix:** MongoDB runs with authentication; root credentials are used only by backup/restore; the application and ETL use a dedicated user with `readWrite` on the `employees` database only, created by an init script. All credentials are generated per environment by `scripts/create-secrets.*` and never committed.

## Additional hardening (not bugs in the starter, but required for production)

- Non-root containers, read-only root filesystem, all capabilities dropped, `seccompProfile: RuntimeDefault`, namespace enforced at Pod Security Standard **restricted**.
- Resource requests/limits for every container; startup/readiness/liveness probes.
- NetworkPolicies: default-deny ingress, MongoDB reachable only from backend/ETL/backup pods.
- Only the Ingress is exposed; `/metrics` and MongoDB are internal.
- Structured JSON logs + Prometheus metrics (`http_requests_total`, latency histogram) + alert rules.
- Image vulnerability scan, SBOM and secret scanning in CI.

## Out of scope (intentionally not fixed)

| Item | Reason | Recommended next step |
| --- | --- | --- |
| F17 – API authentication/authorisation | Changes the product (login flow, users, roles), not a deployment concern; the case asks not to rebuild the app | OIDC (e.g. Keycloak/Entra ID) at the Ingress or in the API, JWT validation middleware |
| F19 – Migrating off Create React App | Large frontend change with no operational benefit for this case; build output is static and served by nginx | Migrate to Vite; enables a smaller dependency tree and fewer `npm audit` findings |
| F20 – Pagination | API contract change that also needs UI work | `?limit&cursor` on `GET /api/record` |
| MongoDB replica set / HA | A 3-member replica set on a single-node laptop cluster adds complexity without real availability gain | Managed MongoDB (Atlas) or the MongoDB Community Operator with 3 members across zones |
| TLS on the Ingress (local) | No public DNS/CA on a laptop | cert-manager + Let's Encrypt; the prod overlay already declares the TLS section |
| ingress-nginx retirement | The community ingress-nginx project was retired in March 2026; it is used here only as the local/CI ingress | Gateway API with a maintained implementation (Envoy Gateway, NGINX Gateway Fabric, Traefik) |
| Full GitOps (Argo CD/Flux) | Time-boxed; the pipeline already produces SHA-pinned, rendered prod manifests | Argo CD watching `k8s/overlays/prod` with automated sync + rollback |
| Off-site backups / PITR | Requires a cloud account (object storage) | See [backup-restore.md §7](backup-restore.md#7-known-limitations) |
| Frontend `npm audit` findings in build-time dependencies | Build-only tools (react-scripts/webpack), not shipped in the nginx runtime image | Resolved by the Vite migration above |
