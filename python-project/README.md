# GitHub → MongoDB ETL

`etl.py` fetches repository metadata from the GitHub REST API and upserts it into MongoDB, keyed on the numeric GitHub repository id (`github_id`, unique index). Re-processing a repository updates the existing document (`$set`, `$inc etl_sync_count`) and never creates a duplicate. Runs as the hourly Kubernetes CronJob `github-etl`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | yes | – | MongoDB connection string (from Secret `mongo-app`) |
| `DB_NAME` | no | `employees` | Database |
| `ETL_COLLECTION` | no | `github_repositories` | Collection |
| `GITHUB_REPOS` | one of | – | Comma-separated `owner/repo` list |
| `GITHUB_ORG` | one of | – | Also load all public repos of this organisation |
| `GITHUB_TOKEN` | no | – | Raises the rate limit from 60 to 5000 requests/hour |
| `ALERT_WEBHOOK_URL` | no | – | Slack/Teams-compatible webhook, called when a run fails |

```bash
pip install -r requirements-dev.txt && pytest -q && ruff check .   # tests
docker build -t devops-case/etl:local .                            # image
kubectl -n mern create job etl-manual --from=cronjob/github-etl    # run now in the cluster
```

Logs are JSON lines; the final `etl run finished` line contains `fetched`, `inserted`, `updated`, `documents_before`, `documents_after`, `duplicates_created` and `duration_seconds`. Exit code ≠ 0 on failure (Job marked Failed → alert).
