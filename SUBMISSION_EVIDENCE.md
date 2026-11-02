# SUBMISSION EVIDENCE

For the submission to be considered complete, add screenshots of the running system to the `docs/screenshots/` directory and specify the related file path under each item below.

Screenshots must not expose real credentials, tokens, passwords, private keys, or sensitive connection details.

## 1. Web Application

### 1.1 Home page

- **Screenshot:** `docs/screenshots/...`
- **Explanation:**

### 1.2 Create operation

- **Form screenshot:** `docs/screenshots/...`
- **Successful result screenshot:** `docs/screenshots/...`
- **Explanation:**

### 1.3 Edit operation

- **Before-edit screenshot:** `docs/screenshots/...`
- **After-edit screenshot:** `docs/screenshots/...`
- **Explanation:**

## 2. Docker

- **Image build screenshot:** `docs/screenshots/...`
- **Running containers screenshot:** `docs/screenshots/...`
- **Explanation:**

## 3. Kubernetes

- **Pod/workload status:** `docs/screenshots/...`
- **Service and Ingress status, where applicable:** `docs/screenshots/...`
- **ETL CronJob/Job status:** `docs/screenshots/...`
- **Explanation:**

## 4. Python ETL

### 4.1 Initial data load

Show that GitHub repository information was stored in MongoDB for the first time.

- **Screenshot or terminal output:** `docs/screenshots/...`
- **Explanation:**

### 4.2 Update of the same repository

Show that processing the same repository again did not create a duplicate and instead updated the existing record. Where possible, include both the repository count and the updated field in the same evidence.

- **Screenshot or terminal output:** `docs/screenshots/...`
- **Unique field used:**
- **Explanation:**

## 5. CI/CD

- **Successful pipeline screenshot:** `docs/screenshots/...`
- **Screenshot showing build/image/deployment stages:** `docs/screenshots/...`
- **Explanation:**

## 6. Backup and Restore

All six steps below must be evidenced. It must be clear that the steps were performed in order and on the same record.

### 6.1 Record creation

- **Screenshot:** `docs/screenshots/...`
- **Explanation:**

### 6.2 Taking the backup

- **Screenshot or terminal output:** `docs/screenshots/...`
- **Method and command used:**
- **Backup storage location:**
- **Explanation:**

### 6.3 Dropping the collection or database

- **Screenshot or terminal output:** `docs/screenshots/...`
- **Explanation:**

### 6.4 Showing that the data is gone

- **Interface screenshot:** `docs/screenshots/...`
- **Database output:** `docs/screenshots/...`
- **Explanation:**

### 6.5 Restoring from the backup

- **Screenshot or terminal output:** `docs/screenshots/...`
- **Measured restore duration:**
- **Explanation:**

### 6.6 Verifying that the data is back

- **Interface screenshot:** `docs/screenshots/...`
- **Database output:** `docs/screenshots/...`
- **Explanation:**

> The runbook, RPO/RTO targets, and retention period must be documented in `docs/backup-restore.md`.

## 7. Logging, Monitoring, and Advanced Criteria

Add evidence for any implemented logging, monitoring, alerting, Helm, Terraform, security scanning, or other advanced criteria.

- **Screenshot:** `docs/screenshots/...`
- **Explanation:**

## 8. Additional Evidence

- **Screenshot:** `docs/screenshots/...`
- **Explanation:**
