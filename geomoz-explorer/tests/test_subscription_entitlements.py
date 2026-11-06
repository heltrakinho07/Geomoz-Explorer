"""Subscription feature-policy and quota regression checks (no live Firebase)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import subscription_entitlements as entitlement


def test_access_matrix_never_grants_paid_features_to_community():
    flags = {"gis_workspace": True, "remote_sensing": True, "terrain_3d": True}
    access = entitlement.access_matrix("community", flags)
    assert access["local_gis"]["available"] is True
    assert access["cloud_jobs"]["available"] is False
    assert access["gee_terrain_pro"]["available"] is False


def test_module_disabled_cannot_be_bypassed_by_paid_plan():
    flags = {"gis_workspace": True, "remote_sensing": False, "terrain_3d": False}
    access = entitlement.access_matrix("pro", flags)
    assert access["scientific_analysis"]["included"] is True
    assert access["scientific_analysis"]["available"] is False
    assert access["gee_terrain_pro"]["available"] is False


def test_unprovisioned_features_cannot_be_marked_available():
    access = entitlement.access_matrix("enterprise", {})
    assert access["collaboration"]["included"] is True
    assert access["collaboration"]["available"] is False
    assert access["collaboration"]["provisioning"] == "pending"
    assert access["institutional_api"]["available"] is False


def test_processing_gate_opt_in(monkeypatch):
    monkeypatch.delenv("GEOMOZ_ENFORCE_PROCESSING_PLAN", raising=False)
    assert entitlement.processing_gate_enabled() is False
    monkeypatch.setenv("GEOMOZ_ENFORCE_PROCESSING_PLAN", "true")
    assert entitlement.processing_gate_enabled() is True


class FakeSnap:
    def __init__(self, data):
        self.data = data
        self.exists = bool(data)

    def to_dict(self):
        return self.data


class FakeBillingRef:
    def __init__(self, bill):
        self.bill = bill

    def get(self):
        return FakeSnap(self.bill)


class FakeProjects:
    def count(self):
        return SimpleNamespace(
            get=lambda: [[SimpleNamespace(value=2)]]
        )


class FakeDb:
    def __init__(self, bill):
        self.bill = bill

    def collection(self, name):
        if name == "billing":
            return SimpleNamespace(document=lambda uid: FakeBillingRef(self.bill))
        if name == "users":
            return SimpleNamespace(
                document=lambda uid: SimpleNamespace(
                    collection=lambda child: FakeProjects()
                )
            )
        raise AssertionError("Unexpected collection " + name)


def test_entitlement_snapshot_uses_existing_billing_cycle_and_project_count(monkeypatch):
    now = datetime(2026, 11, 6, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(entitlement, "_utcnow", lambda: now)
    monkeypatch.setattr(entitlement, "get_features", lambda: {
        "gis_workspace": True, "remote_sensing": True, "terrain_3d": True
    })
    monkeypatch.setattr(entitlement, "get_plan_limits", lambda plan: {
        "projects": 75 if plan == "pro" else 3,
        "credits": 800 if plan == "pro" else 20,
        "storage_bytes": 1024 * 1024,
        "seats": 1, "concurrent_jobs": 1,
    })
    valid_until = (now + timedelta(days=10)).isoformat()
    bill = {"plan": "pro", "status": "active", "periodEnd": valid_until,
            "creditsUsed": 15, "creditsReserved": 5,
            "reservationCycle": "2026-11", "creditCycle": "2026-11"}
    response = entitlement.user_subscription_snapshot("user-123", FakeDb(bill))
    assert response["plan"] == "pro"
    assert response["usage"]["projects"] == 2
    assert response["usage"]["projectsRemaining"] == 73
    assert response["usage"]["credits"] == 15
    assert response["usage"]["creditsReserved"] == 5
    assert response["usage"]["creditsRemaining"] == 780
    assert response["usage"]["storageVerified"] is False
    assert response["enforcement"]["storage"] == "not_enforced"


def test_expired_subscription_falls_back_to_community(monkeypatch):
    monkeypatch.setattr(entitlement, "get_features", lambda: {})
    monkeypatch.setattr(entitlement, "get_plan_limits", lambda plan: {
        "projects": 3, "credits": 20, "storage_bytes": 100,
        "seats": 1, "concurrent_jobs": 1,
    })
    bill = {"plan": "pro", "status": "active",
            "periodEnd": "2020-01-01T00:00:00+00:00"}
    response = entitlement.user_subscription_snapshot("user-123", FakeDb(bill))
    assert response["plan"] == "community"
    assert response["periodEnd"] is None
    assert response["features"]["cloud_jobs"]["available"] is False


def test_server_side_processing_guard_rejects_community(monkeypatch):
    monkeypatch.setattr(entitlement, "_db", lambda: FakeDb({}))
    monkeypatch.setattr(entitlement, "get_features", lambda: {"gis_workspace": True})
    with pytest.raises(HTTPException) as exc:
        entitlement.require_plan_feature("user-123", "cloud_jobs")
    assert exc.value.status_code == 403


def test_server_side_processing_guard_does_not_trust_unknown_features():
    with pytest.raises(HTTPException) as exc:
        entitlement.require_plan_feature("someone", "superadmin")
    assert exc.value.status_code == 500
