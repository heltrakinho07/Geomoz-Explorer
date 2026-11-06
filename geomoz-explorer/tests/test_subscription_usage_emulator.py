"""Exercise the quota API and ledger against a real Firestore emulator."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
import pytest

import billing
import project_quota
from platform_config import DEFAULT_PLANS

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST"), reason="Requires the Firestore emulator"
)


@pytest.fixture
def account(monkeypatch):
    from google.cloud.firestore import Client

    database = Client(project="demo-geomoz-usage")
    monkeypatch.setattr(billing, "_db", lambda: database)
    monkeypatch.setattr(project_quota, "_db", lambda: database)
    monkeypatch.setattr(billing, "get_plan_limits", DEFAULT_PLANS.__getitem__)
    monkeypatch.setattr(project_quota, "get_plan_limits", DEFAULT_PLANS.__getitem__)
    app = FastAPI()
    app.include_router(billing.router)
    app.include_router(project_quota.router)

    def identity(request: Request):
        return request.headers["X-Test-Uid"]

    app.dependency_overrides[billing._uid] = identity
    uid = uuid.uuid4().hex
    with TestClient(app, headers={"X-Test-Uid": uid}) as client:
        yield client, database, uid


def test_project_limit_counts_existing_documents_and_retries(account):
    client, database, uid = account
    projects = database.collection("users").document(uid).collection("projects")
    projects.document("proj_legacy").set({"name": "Existing"})
    database.collection("billingProjectQuota").document(uid).set({"count": 0})
    payload = {"name": "New", "category": "estudo_geral", "aoi": {},
               "period": {"startDate": "2026-01-01", "endDate": "2026-01-02"}}
    url = "/geomoz-api/projects"
    keys = [uuid.uuid4().hex for _ in range(3)]

    def create(key):
        return client.post(url, json=payload, headers={"Idempotency-Key": key})

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(create, keys))
    assert sorted(result.status_code for result in results) == [200, 200, 402]
    key, created = next((key, result) for key, result in zip(keys, results) if result.is_success)
    assert create(key).json()["id"] == created.json()["id"]
    usage = client.get("/geomoz-api/billing/usage").json()
    assert (usage["projectsUsed"], usage["projectLimit"], usage["remainingCredits"]) == (3, 3, 20)
    assert client.delete(f"{url}/proj_legacy").is_success
    assert client.get("/geomoz-api/billing/usage").json()["projectsUsed"] == 2


def test_credits_are_atomic_isolated_and_reset_in_utc(account, monkeypatch):
    client, _, uid = account
    monkeypatch.setattr(billing, "_utcnow", lambda: datetime(2026, 11, 30, tzinfo=timezone.utc))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: billing.charge_managed_cloud_credits(uid, 20, "job-a"), range(2)))
    assert sum(result.get("charged", 0) for result in results) == 20
    with pytest.raises(billing.HTTPException) as error:
        billing.charge_managed_cloud_credits(uid, 1, "job-b")
    assert error.value.status_code == 402
    assert client.get("/geomoz-api/billing/usage").json()["remainingCredits"] == 0
    assert client.get("/geomoz-api/billing/usage/history").json()["events"][0]["operationId"] == "job-a"
    other = {"X-Test-Uid": uuid.uuid4().hex}
    assert client.get("/geomoz-api/billing/usage/history", headers=other).json() == {"events": []}

    monkeypatch.setattr(billing, "_utcnow", lambda: datetime(2026, 12, 1, tzinfo=timezone.utc))
    assert billing.charge_managed_cloud_credits(uid, 20, "job-a") == {"alreadyCharged": True}
    assert client.get("/geomoz-api/billing/usage").json()["remainingCredits"] == 20
    assert billing.charge_managed_cloud_credits(uid, 1, "job-b")["remaining"] == 19
