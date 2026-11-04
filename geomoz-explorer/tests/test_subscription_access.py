"""Phase-1 subscription policy, authoritative balances and transactional refunds."""
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import billing
import subscription_access as access


NOW = datetime(2026, 11, 4, 15, 0, tzinfo=timezone.utc)
PRO = {"plan": "pro", "status": "active", "periodEnd": "2026-12-04T23:59:59+00:00"}


def limits(plan):
    return {"projects": 3 if plan == "community" else 75,
            "storage_bytes": 1024, "credits": 20 if plan == "community" else 4,
            "seats": 1, "concurrent_jobs": 1 if plan == "community" else 2}


def flags():
    return {"gis_workspace": True, "remote_sensing": True,
            "geo_ai": True, "hydrology": True, "terrain_3d": True,
            "seismic_catalogs": True}


def resolved(state, *, enabled=None):
    from unittest.mock import patch
    with patch.object(access, "get_plan_limits", side_effect=limits):
        return access.resolve_access(state, flags=enabled or flags(), at=NOW)


def test_community_and_pro_plan_entitlements():
    free = resolved({})
    assert free["plan"] == "community"
    assert free["features"]["local_gis"] is True
    assert free["features"]["scientific_analysis"] is False
    assert free["features"]["cloud_jobs"] is False

    paid = resolved(PRO)
    assert paid["plan"] == "pro"
    assert paid["features"]["cloud_jobs"] is True
    assert paid["features"]["scientific_analysis"] is True
    assert paid["features"]["collaboration"] is False
    assert paid["limits"]["projects"] == 75


def test_expiry_cancel_and_remote_module_flag_revoke_access():
    for status, end in (("cancelled", "2027-01-01T00:00:00+00:00"),
                        ("active", "2020-01-01T00:00:00+00:00")):
        result = resolved({**PRO, "status": status, "periodEnd": end})
        assert result["plan"] == "community"
        assert not result["features"]["cloud_jobs"]

    disabled = resolved(PRO, enabled={**flags(), "remote_sensing": False})
    assert disabled["features"]["cloud_jobs"] is True
    assert disabled["features"]["scientific_analysis"] is False


def test_monthly_credits_do_not_carry_to_next_utc_month():
    old_cycle = resolved({**PRO, "creditCycle": "2026-10", "creditsUsed": 4})
    assert old_cycle["usage"]["creditsUsed"] == 0
    assert old_cycle["usage"]["creditsRemaining"] == 4
    used = resolved({**PRO, "creditCycle": "2026-11", "creditsUsed": 3})
    assert used["usage"]["creditsUsed"] == 3
    assert used["usage"]["creditsRemaining"] == 1
    assert used["usage"]["storageQuotaEnforced"] is False
    assert used["earthEngineQuota"] == "external-user-owned"


def test_unknown_feature_fails_closed():
    with pytest.raises(ValueError):
        access.require_subscription_feature("user", "backend-root", access=resolved(PRO))
    with pytest.raises(HTTPException) as error:
        access.require_subscription_feature("user", "collaboration", access=resolved(PRO))
    assert error.value.status_code == 402
    assert error.value.detail["code"] == "PLAN_UPGRADE_REQUIRED"


class FakeSnapshot:
    def __init__(self, value):
        self.exists = value is not None
        self._value = deepcopy(value)

    def to_dict(self):
        return deepcopy(self._value)


class FakeRef:
    def __init__(self, db, key):
        self.db = db
        self.key = key
        self.id = key.split("/")[-1]

    def collection(self, name):
        return FakeCollection(self.db, self.key + "/" + name)

    def get(self, transaction=None):
        return FakeSnapshot(self.db.store.get(self.key))

    def document(self, doc):
        return FakeRef(self.db, self.key + "/" + doc)


class FakeCollection(FakeRef):
    def where(self, *args, **kwargs):
        return FakeQuery(self.db, self.key)

    def limit(self, max_results):
        return FakeQuery(self.db, self.key, max_results)


class FakeQuery:
    def __init__(self, db, prefix, limit=100):
        self.db, self.prefix, self.count = db, prefix, limit

    def limit(self, n):
        return FakeQuery(self.db, self.prefix, n)

    def stream(self):
        for path, value in list(self.db.store.items()):
            if path.startswith(self.prefix + "/") and value.get("status") == "reserved":
                yield SimpleNamespace(id=path.split("/")[-1], to_dict=lambda v=value: deepcopy(v))


class FakeTransaction:
    def __init__(self, database):
        self.database = database

    def set(self, reference, changes, merge=False):
        existing = self.database.store.get(reference.key, {})
        self.database.store[reference.key] = {
            **(existing if merge else {}), **deepcopy(changes)
        }


class FakeDatabase:
    def __init__(self, store):
        self.store = store

    def collection(self, name):
        return FakeCollection(self, name)

    def transaction(self):
        return FakeTransaction(self)


@pytest.fixture
def db(monkeypatch):
    store = {"billing/u1": {**PRO, "creditsUsed": 0, "creditCycle": "2026-11"}}
    fake = FakeDatabase(store)
    monkeypatch.setattr(billing, "_db", lambda: fake)
    monkeypatch.setattr(billing, "firestore",
                        SimpleNamespace(SERVER_TIMESTAMP="SERVER_TIMESTAMP",
                                        transactional=lambda fn: fn))
    monkeypatch.setattr(billing, "get_plan_limits", lambda plan: limits(plan))
    monkeypatch.setattr(billing, "_utcnow", lambda: NOW)
    return fake


def test_managed_job_credit_reserve_and_complete_idempotently(db):
    job = "a" * 32
    assert billing.reserve_cloud_job_credit("u1", job)["reserved"] == 1
    assert billing.reserve_cloud_job_credit("u1", job)["alreadyReserved"]
    assert db.store["billing/u1"]["creditsUsed"] == 1
    assert billing.settle_cloud_job_credit("u1", job, success=True)["status"] == "completed"
    assert billing.settle_cloud_job_credit("u1", job, success=False)["alreadySettled"]
    assert db.store["billing/u1"]["creditsUsed"] == 1


def test_failed_or_cancelled_job_refunds_exactly_once(db):
    job = "b" * 32
    billing.reserve_cloud_job_credit("u1", job)
    assert billing.settle_cloud_job_credit("u1", job, success=False)["status"] == "refunded"
    assert billing.settle_cloud_job_credit("u1", job, success=False)["alreadySettled"]
    assert db.store["billing/u1"]["creditsUsed"] == 0


def test_no_credit_spending_after_refund_or_expiry(db):
    db.store["billing/u1"]["status"] = "cancelled"
    with pytest.raises(HTTPException) as error:
        billing.reserve_cloud_job_credit("u1", "c" * 32)
    assert error.value.status_code == 402
    assert "billing/u1/usageEvents/raster-" + "c" * 32 not in db.store


def test_managed_jobs_stop_at_atomic_monthly_limit(db):
    for i in range(4):
        billing.reserve_cloud_job_credit("u1", f"{i:032x}")
    with pytest.raises(HTTPException) as error:
        billing.reserve_cloud_job_credit("u1", "f" * 32)
    assert error.value.status_code == 402
    assert db.store["billing/u1"]["creditsUsed"] == 4


def test_refund_never_deducts_from_new_month(db):
    job = "e" * 32
    billing.reserve_cloud_job_credit("u1", job)
    db.store["billing/u1"].update(creditCycle="2026-12", creditsUsed=2)
    billing.settle_cloud_job_credit("u1", job, success=False)
    assert db.store["billing/u1"]["creditsUsed"] == 2
