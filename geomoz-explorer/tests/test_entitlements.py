"""Server-owned GeoMoz entitlements and atomic managed-job ledger tests.

The Firestore double serializes transaction commits, permitting deterministic
tests without Google credentials. Production uses Firestore's real transactions.
"""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import RLock
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import entitlements


class Snapshot:
    def __init__(self, data):
        self.exists = data is not None
        self._data = deepcopy(data)

    def to_dict(self):
        return deepcopy(self._data)


class Reference:
    def __init__(self, db, path):
        self.db = db
        self.path = path

    def collection(self, name):
        return Collection(self.db, self.path + "/" + name)

    def get(self, transaction=None):
        return Snapshot(self.db.docs.get(self.path))


class Collection:
    def __init__(self, db, path):
        self.db = db
        self.path = path

    def document(self, key):
        return Reference(self.db, self.path + "/" + key)


class Transaction:
    def __init__(self, db):
        self.db = db
        self.pending = []

    def set(self, reference, data, merge=False):
        self.pending.append((reference.path, deepcopy(data), merge))

    def commit(self):
        for path, data, merge in self.pending:
            if merge:
                self.db.docs[path] = {**self.db.docs.get(path, {}), **data}
            else:
                self.db.docs[path] = data


class MemoryDB:
    def __init__(self):
        self.docs = {}
        self.lock = RLock()

    def collection(self, name):
        return Collection(self, name)

    def transaction(self):
        return Transaction(self)


def make_store(monkeypatch, *, plan="pro", credit_limit=20, concurrent_limit=2):
    database = MemoryDB()
    database.docs["billing/test-user"] = {
        "plan": plan,
        "periodEnd": "2099-01-01T00:00:00+00:00" if plan != "community" else None,
        "status": "active",
        "creditCycle": entitlements.current_cycle(),
        "creditsUsed": 0,
    }

    def transact(method):
        def wrapped(transaction):
            with database.lock:
                result = method(transaction)
                transaction.commit()
                return result
        return wrapped

    monkeypatch.setattr(entitlements, "_db", lambda: database)
    monkeypatch.setattr(entitlements, "firestore", SimpleNamespace(
        transactional=transact, SERVER_TIMESTAMP="server-time",
    ))
    monkeypatch.setattr(entitlements, "_limits", lambda code: {
        "credits": credit_limit, "concurrent_jobs": concurrent_limit,
        "projects": 75, "storage_bytes": 30 * 1024**3, "seats": 1,
    })
    monkeypatch.setattr(entitlements, "get_features", lambda: {
        "gis_workspace": True, "remote_sensing": True,
    })
    return database


def test_community_cannot_start_managed_gdal_job(monkeypatch):
    db = make_store(monkeypatch, plan="community")
    with pytest.raises(HTTPException) as err:
        entitlements.reserve_managed_job("test-user", "a" * 32)
    assert err.value.status_code == 403
    assert "billingProcessingQuota/test-user" not in db.docs


def test_credits_and_concurrent_jobs_are_atomic_and_refundable(monkeypatch):
    db = make_store(monkeypatch, credit_limit=8, concurrent_limit=1)
    first = "a" * 32
    second = "b" * 32
    assert entitlements.reserve_managed_job("test-user", first)["remaining"] == 3
    assert db.docs["billing/test-user"]["creditsUsed"] == 5
    with pytest.raises(HTTPException) as err:
        entitlements.reserve_managed_job("test-user", second)
    assert err.value.status_code == 429
    with pytest.raises(HTTPException) as err:
        entitlements.reserve_managed_job("test-user", first)
    assert err.value.status_code == 409
    assert entitlements.finish_managed_job("test-user", first, success=False) is True
    assert entitlements.finish_managed_job("test-user", first, success=False) is False
    assert db.docs["billing/test-user"]["creditsUsed"] == 0
    assert entitlements.reserve_managed_job("test-user", second)["remaining"] == 3
    assert entitlements.finish_managed_job("test-user", second, success=True) is True
    assert db.docs["billing/test-user"]["creditsUsed"] == 5
    assert entitlements.user_entitlements("test-user")["concurrentJobsActive"] == 0


def test_limit_applies_after_completed_job(monkeypatch):
    make_store(monkeypatch, credit_limit=5)
    entitlements.reserve_managed_job("test-user", "a" * 32)
    entitlements.finish_managed_job("test-user", "a" * 32, success=True)
    with pytest.raises(HTTPException) as error:
        entitlements.reserve_managed_job("test-user", "b" * 32)
    assert error.value.status_code == 402


def test_two_concurrent_reservations_do_not_exceed_one_slot(monkeypatch):
    make_store(monkeypatch, credit_limit=100, concurrent_limit=1)

    def do_reservation(key):
        try:
            entitlements.reserve_managed_job("test-user", key)
            return "accepted"
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        answers = list(executor.map(do_reservation, ["a" * 32, "b" * 32]))
    assert sorted(answers, key=str) == sorted(["accepted", 429], key=str)


def test_refund_cannot_reduce_a_new_credit_cycle(monkeypatch):
    db = make_store(monkeypatch, credit_limit=100)
    entitlements.reserve_managed_job("test-user", "a" * 32)
    db.docs["billing/test-user"]["creditCycle"] = "2099-02"
    db.docs["billing/test-user"]["creditsUsed"] = 9
    assert entitlements.finish_managed_job("test-user", "a" * 32, success=False)
    assert db.docs["billing/test-user"]["creditsUsed"] == 9


def test_entitlement_summary_has_truthful_implementation_flags(monkeypatch):
    make_store(monkeypatch)
    monkeypatch.delenv("GEOMOZ_ENTITLEMENTS_JOBS_ENABLED", raising=False)
    monkeypatch.delenv("GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED", raising=False)
    summary = entitlements.user_entitlements("test-user")
    assert summary["plan"] == "pro"
    assert summary["storageEnforced"] is False
    assert summary["teamSeatsEnforced"] is False
    assert summary["geeCreditsCharged"] is False
    assert summary["managedJobsEnforced"] is False
    assert "scientific_analysis" in summary["features"]


def test_scientific_access_guards_are_explicit_and_byo_gee_not_charged(monkeypatch):
    monkeypatch.delenv("GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED", raising=False)
    assert not entitlements.science_plan_required("/geomoz-api/gee/index", "POST")
    monkeypatch.setenv("GEOMOZ_ENTITLEMENTS_SCIENCE_ENABLED", "true")
    assert entitlements.science_plan_required("/geomoz-api/gee/index", "POST")
    assert entitlements.science_plan_required("/geomoz-api/ai/agent-chat", "POST")
    assert not entitlements.science_plan_required("/geomoz-api/gee/status", "GET")
    assert not entitlements.science_plan_required("/geomoz-api/gee/oauth-token", "POST")
    assert not entitlements.science_plan_required("/geomoz-api/billing/webhook", "POST")


def test_expired_plan_falls_back_to_community(monkeypatch):
    db = make_store(monkeypatch)
    db.docs["billing/test-user"]["periodEnd"] = "2020-01-01T00:00:00Z"
    summary = entitlements.user_entitlements("test-user")
    assert summary["plan"] == "community"
    with pytest.raises(HTTPException) as err:
        entitlements.reserve_managed_job("test-user", "f" * 32)
    assert err.value.status_code == 403


def test_malformed_operation_id_and_credit_cost(monkeypatch):
    make_store(monkeypatch)
    with pytest.raises(ValueError):
        entitlements.reserve_managed_job("test-user", "../invalid")
    with pytest.raises(ValueError):
        entitlements.reserve_managed_job("test-user", "f" * 32, cost=True)
