from datetime import datetime, timezone

import mongomock

import etl

SAMPLE = {
    "id": 10270250,
    "full_name": "facebook/react",
    "name": "react",
    "owner": {"login": "facebook"},
    "description": "UI library",
    "html_url": "https://github.com/facebook/react",
    "language": "JavaScript",
    "topics": ["ui"],
    "license": {"spdx_id": "MIT"},
    "default_branch": "main",
    "archived": False,
    "stargazers_count": 100,
    "forks_count": 10,
    "open_issues_count": 1,
    "watchers_count": 100,
    "created_at": "2013-05-24T16:15:54Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "pushed_at": "2026-01-01T00:00:00Z",
}


def test_transform_uses_numeric_github_id():
    doc = etl.transform(SAMPLE)
    assert doc["github_id"] == 10270250
    assert doc["owner"] == "facebook"
    assert doc["license"] == "MIT"


def test_reprocessing_same_repo_updates_instead_of_duplicating():
    coll = mongomock.MongoClient().db.repos
    etl.ensure_indexes(coll)

    first = etl.load(coll, [etl.transform(SAMPLE)], datetime.now(timezone.utc))
    assert first == {"inserted": 1, "updated": 0}

    changed = {**SAMPLE, "stargazers_count": 150}
    second = etl.load(coll, [etl.transform(changed)], datetime.now(timezone.utc))
    assert second == {"inserted": 0, "updated": 1}

    assert coll.count_documents({}) == 1
    doc = coll.find_one({"github_id": SAMPLE["id"]})
    assert doc["stargazers_count"] == 150
    assert doc["etl_sync_count"] == 2


def test_renamed_repo_is_still_the_same_record():
    coll = mongomock.MongoClient().db.repos
    etl.load(coll, [etl.transform(SAMPLE)], datetime.now(timezone.utc))
    renamed = {**SAMPLE, "full_name": "facebook/react-new", "name": "react-new"}
    etl.load(coll, [etl.transform(renamed)], datetime.now(timezone.utc))
    assert coll.count_documents({}) == 1
    assert coll.find_one()["full_name"] == "facebook/react-new"


def test_parse_list():
    assert etl.parse_list(" a/b, c/d ,") == ["a/b", "c/d"]
