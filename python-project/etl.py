"""GitHub -> MongoDB ETL.

Extract : repository metadata from the GitHub REST API
          (an explicit list in GITHUB_REPOS and/or all public repos of GITHUB_ORG).
Transform: keep a stable, flat subset of fields.
Load    : idempotent upsert into MongoDB keyed on the GitHub repository id
          (unique index on `github_id`). Re-processing the same repository updates the
          existing document and never creates a duplicate.

Designed to run as a Kubernetes CronJob (once per hour). Logs are JSON lines on stdout.
Exit code is non-zero on failure so the Job is marked Failed (used for alerting).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

import requests
from pymongo import MongoClient, UpdateOne
from pymongo.collection import Collection

GITHUB_API = os.getenv("GITHUB_API_URL", "https://api.github.com").rstrip("/")
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT_SECONDS", "15"))
MAX_RETRIES = int(os.getenv("HTTP_MAX_RETRIES", "3"))


# --------------------------------------------------------------------------- logging
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "service": "github-etl",
            "msg": record.getMessage(),
        }
        payload.update(getattr(record, "fields", {}))
        return json.dumps(payload, default=str)


log = logging.getLogger("etl")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
log.addHandler(_handler)
log.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())


def info(msg: str, **fields: Any) -> None:
    log.info(msg, extra={"fields": fields})


def error(msg: str, **fields: Any) -> None:
    log.error(msg, extra={"fields": fields})


# --------------------------------------------------------------------------- extract
def github_session(token: str | None) -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "devops-case-github-etl",
        }
    )
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    return s


def get_json(session: requests.Session, url: str, params: dict | None = None) -> Any:
    """GET with timeout and bounded exponential backoff on 5xx / 429 / rate-limit 403."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.get(url, params=params, timeout=HTTP_TIMEOUT)
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES:
                raise
            info("github request error, retrying", url=url, attempt=attempt, error=str(exc))
            time.sleep(2**attempt)
            continue

        rate_limited = resp.status_code in (403, 429) and resp.headers.get("X-RateLimit-Remaining") == "0"
        if resp.status_code >= 500 or resp.status_code == 429 or rate_limited:
            if attempt == MAX_RETRIES:
                resp.raise_for_status()
            info("github transient error, retrying", url=url, status=resp.status_code, attempt=attempt)
            time.sleep(2**attempt)
            continue

        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("unreachable")


def fetch_repositories(session: requests.Session, repos: list[str], org: str | None) -> list[dict]:
    results: list[dict] = []
    for full_name in repos:
        results.append(get_json(session, f"{GITHUB_API}/repos/{full_name}"))
    if org:
        page = 1
        while True:
            batch = get_json(
                session, f"{GITHUB_API}/orgs/{org}/repos", params={"per_page": 100, "page": page, "type": "public"}
            )
            if not batch:
                break
            results.extend(batch)
            page += 1
    return results


# --------------------------------------------------------------------------- transform
def transform(repo: dict) -> dict:
    """Flatten the GitHub payload into the fields we store. `github_id` is the unique key:
    unlike `full_name`, the numeric id never changes when a repo is renamed or transferred."""
    return {
        "github_id": repo["id"],
        "full_name": repo["full_name"],
        "name": repo["name"],
        "owner": (repo.get("owner") or {}).get("login"),
        "description": repo.get("description"),
        "html_url": repo.get("html_url"),
        "language": repo.get("language"),
        "topics": repo.get("topics", []),
        "license": (repo.get("license") or {}).get("spdx_id"),
        "default_branch": repo.get("default_branch"),
        "archived": repo.get("archived", False),
        "stargazers_count": repo.get("stargazers_count", 0),
        "forks_count": repo.get("forks_count", 0),
        "open_issues_count": repo.get("open_issues_count", 0),
        "watchers_count": repo.get("watchers_count", 0),
        "created_at": repo.get("created_at"),
        "updated_at": repo.get("updated_at"),
        "pushed_at": repo.get("pushed_at"),
    }


# --------------------------------------------------------------------------- load
def ensure_indexes(coll: Collection) -> None:
    # The unique index is the real guarantee against duplicates (also under concurrent runs).
    coll.create_index("github_id", unique=True, name="uniq_github_id")


def load(coll: Collection, docs: Iterable[dict], now: datetime) -> dict:
    ops = [
        UpdateOne(
            {"github_id": d["github_id"]},
            {
                "$set": {**d, "etl_last_synced_at": now},
                "$setOnInsert": {"etl_first_seen_at": now},
                "$inc": {"etl_sync_count": 1},
            },
            upsert=True,
        )
        for d in docs
    ]
    if not ops:
        return {"inserted": 0, "updated": 0}
    result = coll.bulk_write(ops, ordered=False)
    return {"inserted": result.upserted_count, "updated": result.matched_count}


# --------------------------------------------------------------------------- main
def notify_failure(message: str) -> None:
    """Optional alert hook (Slack/Teams/Discord-compatible incoming webhook)."""
    url = os.getenv("ALERT_WEBHOOK_URL")
    if not url:
        return
    try:
        requests.post(url, json={"text": f":rotating_light: github-etl failed: {message}"}, timeout=5)
    except requests.RequestException:
        pass


def parse_list(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def run() -> int:
    started = time.monotonic()
    mongo_uri = os.environ.get("MONGODB_URI")
    if not mongo_uri:
        error("MONGODB_URI is not set")
        return 2
    db_name = os.getenv("DB_NAME", "employees")
    coll_name = os.getenv("ETL_COLLECTION", "github_repositories")
    repos = parse_list(os.getenv("GITHUB_REPOS"))
    org = os.getenv("GITHUB_ORG") or None
    if not repos and not org:
        error("nothing to do: set GITHUB_REPOS and/or GITHUB_ORG")
        return 2

    info("etl run started", repos=repos, org=org, collection=f"{db_name}.{coll_name}",
         authenticated=bool(os.getenv("GITHUB_TOKEN")))
    try:
        session = github_session(os.getenv("GITHUB_TOKEN"))
        raw = fetch_repositories(session, repos, org)
        docs = [transform(r) for r in raw]
        info("extracted repositories", count=len(docs))

        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000, appName="github-etl")
        coll = client[db_name][coll_name]
        ensure_indexes(coll)
        before = coll.count_documents({})
        stats = load(coll, docs, datetime.now(timezone.utc))
        after = coll.count_documents({})
        for d in docs:
            stored = coll.find_one({"github_id": d["github_id"]}, {"_id": 0, "full_name": 1, "etl_sync_count": 1,
                                                                    "stargazers_count": 1})
            info("repository upserted", github_id=d["github_id"], **(stored or {}))
        client.close()
    except Exception as exc:  # noqa: BLE001 - top-level guard, we log and exit non-zero
        error("etl run failed", error=str(exc), error_type=type(exc).__name__)
        notify_failure(str(exc))
        return 1

    info(
        "etl run finished",
        fetched=len(docs),
        inserted=stats["inserted"],
        updated=stats["updated"],
        documents_before=before,
        documents_after=after,
        duplicates_created=after - before - stats["inserted"],
        duration_seconds=round(time.monotonic() - started, 2),
    )
    return 0


if __name__ == "__main__":
    sys.exit(run())
