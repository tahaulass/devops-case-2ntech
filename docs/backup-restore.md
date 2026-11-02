# Backup & Restore Runbook

Evidence screenshots are referenced from [`SUBMISSION_EVIDENCE.md`](../SUBMISSION_EVIDENCE.md) (section 6).

---

## 1. Approach

| | |
| --- | --- |
| Backup method | Logical backup with `mongodump --archive --gzip` (all user databases, one compressed archive per run) |
| Execution method | Kubernetes **CronJob** `mongo-backup` ([k8s/base/backup/cronjob.yaml](../k8s/base/backup/cronjob.yaml)) running [backup.sh](../k8s/base/backup/scripts/backup.sh). On demand: `kubectl create job --from=cronjob/mongo-backup`. Restore: on-demand **Job** [k8s/jobs/mongo-restore-job.yaml](../k8s/jobs/mongo-restore-job.yaml) running [restore.sh](../k8s/base/backup/scripts/restore.sh) |
| Backup storage location | Dedicated PVC `mongo-backups` (namespace `mern`), mounted at `/backups`. Separate from the database PVC `data-mongo-0`, so deleting/corrupting the DB volume does not destroy the backups |
| Backup format and size | `mongo-<UTC timestamp>.archive.gz` + `.sha256` checksum + `.meta` (document counts per collection at backup time). A few KB for the case dataset |
| Frequency | Every 6 hours (`15 */6 * * *`, UTC) + on demand before risky changes (deploys, migrations) |
| Retention period | 7 days (`RETENTION_DAYS=7`; older archives are deleted by the backup job itself) → max. 28 scheduled backups |
| Encryption and access control | Backup runs with the root credentials from Secret `mongo-root` (the app user cannot read other DBs). The PVC is only mountable by pods in namespace `mern`; the NetworkPolicy only lets backup/restore pods reach MongoDB. At-rest encryption depends on the storage class (local disk here; encrypted object storage in production — see §7) |

## 2. Targets

| | Target | Measured |
| --- | --- | --- |
| RPO | ≤ 6 h (scheduled backup interval); 0 for changes made right after an on-demand backup | Scenario: 0 data loss (backup taken right after the record was created) |
| RTO | ≤ 15 min (detect + start restore Job + restore + verify) | Restore Job: **<!-- FILL: seconds from `restore finished` log -->** s; end-to-end incl. pod start: **<!-- FILL -->** s |

## 3. Backup procedure

```bash
# Automatic: CronJob mongo-backup (every 6h). Check it:
kubectl -n mern get cronjob mongo-backup
kubectl -n mern get jobs -l app.kubernetes.io/name=mongo-backup

# On demand (e.g. before a deploy):
kubectl -n mern create job mongo-backup-manual-1 --from=cronjob/mongo-backup
kubectl -n mern wait --for=condition=complete job/mongo-backup-manual-1 --timeout=300s
kubectl -n mern logs job/mongo-backup-manual-1
# -> {"msg":"backup finished","file":"mongo-2026...Z.archive.gz","bytes":...,"counts":{"employees.records":1,...}}

# List the backups stored on the PVC (read-only helper Job):
kubectl -n mern delete job list-backups --ignore-not-found
kubectl apply -f k8s/jobs/list-backups-job.yaml
kubectl -n mern wait --for=condition=complete job/list-backups --timeout=120s
kubectl -n mern logs job/list-backups
```

What `backup.sh` does:
1. Records the document count of every collection (`.meta`).
2. `mongodump --archive=<tmp> --gzip` (written to a `.partial` file first, so a crashed run never looks like a valid backup).
3. Integrity checks: `gzip -t` and minimum size; then atomic rename, `sha256sum` file, `LATEST` pointer.
4. Deletes archives older than `RETENTION_DAYS`.
5. On any error: JSON error log, optional webhook alert (`ALERT_WEBHOOK_URL`), non-zero exit → Job `Failed` → `MongoBackupJobFailed` alert.

## 4. Restore procedure

```bash
# 1. (Optional) stop writers so nothing is written during the restore
kubectl -n mern scale deploy/backend --replicas=0
kubectl -n mern patch cronjob github-etl -p '{"spec":{"suspend":true}}'

# 2. Run the restore Job (newest backup by default; set BACKUP_FILE in the manifest for a specific one)
kubectl -n mern delete job mongo-restore --ignore-not-found
kubectl apply -f k8s/jobs/mongo-restore-job.yaml
kubectl -n mern wait --for=condition=complete job/mongo-restore --timeout=600s
kubectl -n mern logs job/mongo-restore

# 3. Bring writers back
kubectl -n mern scale deploy/backend --replicas=2
kubectl -n mern patch cronjob github-etl -p '{"spec":{"suspend":false}}'
```

What `restore.sh` does: verifies the `sha256` checksum **before** touching the database → `mongorestore --drop --nsInclude 'employees.*'` → compares the document count of every restored collection with the counts recorded at backup time and fails the Job on any mismatch.

## 5. Verification

How is it verified that the backup is not corrupted or incomplete?

- **At backup time:** `mongodump` exit code, `gzip -t` (complete compressed stream), minimum size, `.partial` → atomic rename, SHA-256 checksum stored next to the archive.
- **At restore time:** checksum verified before restore; per-collection document counts after restore must equal the counts captured at backup time (Job fails otherwise).
- **Functionally:** the restored record is visible in the UI and via `GET /api/record`.
- **Production addition:** a scheduled *restore drill* (weekly CronJob restoring the latest backup into a throw-away MongoDB and running the same count checks) — a backup that was never restored is not a backup.

## 6. End-to-end test result

Date and result of the executed scenario: **<!-- FILL: date -->**, Docker Desktop Kubernetes. The same scenario is executed automatically in every CI run (`scripts/e2e-k8s.sh`, job `e2e-deploy`).

| # | Step | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Record created | "Backup Test" created via the UI | `docs/screenshots/13-backup-record-created.png` |
| 2 | Backup taken | `mongo-backup-manual-1` completed, archive on PVC `mongo-backups` | `docs/screenshots/14-backup-taken.png` |
| 3 | Collection dropped | `db.records.drop()` → `true` | `docs/screenshots/15-collection-dropped.png` |
| 4 | Data confirmed gone | Record List empty, `countDocuments()` = 0 | `docs/screenshots/16-data-missing-after-drop.png` |
| 5 | Restored from backup | `restore finished and verified` | `docs/screenshots/17-restore-executed.png` |
| 6 | Data confirmed back | Same record (same `_id`) in UI and DB | `docs/screenshots/18-data-restored-verified.png` |

## 7. Known limitations

| Limitation | Production approach |
| --- | --- |
| Backups live in the same cluster (different PVC, same node/disk) | Upload each archive to object storage in another region/account (S3/GCS/Azure Blob with versioning + Object Lock, lifecycle rules for retention), e.g. via `rclone`/`aws s3 cp` in the same Job |
| RPO = 6 h, no point-in-time recovery | MongoDB replica set + continuous oplog backup (Percona Backup for MongoDB, MongoDB Ops/Cloud Manager, or Atlas continuous backup) → RPO of seconds and PITR |
| `mongodump` of a standalone instance is not a consistent snapshot under concurrent writes | Replica set + `mongodump --oplog`, or storage snapshots (CSI VolumeSnapshot) |
| Archives are not encrypted by the job | Server-side encryption with KMS keys on the bucket, or `age`/`gpg` encryption before upload |
| Restore drill is manual / CI-only | Weekly automated restore into a scratch instance + alert on failure |
| Backup uses the root user | Dedicated `backup` user with the built-in `backup`/`restore` roles |
