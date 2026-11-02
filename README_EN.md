# 2NTECH DevOps Technical Case

For case requirements, submission scope, and assessment details, read **`DevOps_Technical_Case_EN.docx`**.

> The starter applications intentionally contain production-readiness issues. Existing behavior in the application code must not be assumed to be correct. The candidate is expected to analyze and prioritize critical issues, implement the necessary improvements, and document the decisions made.

## Project structure

- `mern-project/`: Starter application with a React frontend, Express.js backend, and MongoDB
- `python-project/`: Starter Python ETL workload and its limited ETL requirements
- `DevOps_Technical_Case_EN.docx`: Main English case document
- `CASE_END_ANSWERS.md`: Template containing the questions that must be answered at submission time
- `SUBMISSION_EVIDENCE.md`: Required screenshot and runtime-evidence template
- `docs/backup-restore.md`: Backup and restore runbook template (to be filled in by the candidate)
- `docs/screenshots/`: Directory for submission screenshots

## Environment options

The solution may run in a public cloud or on a Linux virtual machine provisioned by the candidate. Cloud usage is not mandatory. A Kubernetes distribution such as k3s, MicroK8s, or kubeadm may be installed on the VM.

## Core functional expectations

- The main user flows and API functions of the MERN application must work.
- The Python ETL must automatically retrieve repository information from the GitHub API and write it to MongoDB.
- When the same repository is retrieved in later ETL runs, a new record must not be created; the existing record must be updated using a unique repository identifier.
- The Python ETL must run once per hour.
- A backup and restore approach must be implemented for the MongoDB data; creating a record, taking a backup, deleting the data, restoring from the backup, and verifying that the data is back must be executed end to end and evidenced.
- Setup, deployment, rollback, backup/restore, and cleanup steps must be documented in the repository.
- Real credentials or secrets must not be stored in the repository.
- Required screenshots of the running system must be stored under `docs/screenshots/` and explained in `SUBMISSION_EVIDENCE.md`.

Detailed core criteria, advanced criteria, submission evidence, and final case questions are included in the Word document.
