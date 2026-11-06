"""Credits and entitlement roll-out safeguards (no live Firestore required)."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

import entitlement_engine as engine


def test_month_is_utc_not_local_and_rolls_over():
    local = datetime(2026, 12, 1, 1, 15, tzinfo=timezone(timedelta(hours=2)))
    assert engine.utc_cycle(local) == "2026-11"
    assert engine.utc_cycle(datetime(2026, 12, 1, tzinfo=timezone.utc)) == "2026-12"


def test_unknown_or_browser_supplied_cost_is_never_supported():
    assert engine.require_known_operation("ai.agent_chat") == 1
    for invalid in ("gee.export", "user_pro", "ai.agent_chat:1000", ""):
        with pytest.raises(HTTPException) as exc:
            engine.require_known_operation(invalid)
        assert exc.value.status_code == 422


def test_allowance_from_authoritative_server_plan(monkeypatch):
    monkeypatch.setattr(engine, "get_plan_limits", lambda plan: {
        "credits": {"community": 20, "pro": 800, "enterprise": None}[plan]
    })
    assert engine.plan_allowance("community") == 20
    assert engine.plan_allowance("pro") == 800
    assert engine.plan_allowance("enterprise") is None


def test_invalid_allowance_fails_closed(monkeypatch):
    monkeypatch.setattr(engine, "get_plan_limits", lambda _: {"credits": "100"})
    with pytest.raises(HTTPException) as exc:
        engine.plan_allowance("pro")
    assert exc.value.status_code == 503


def test_metering_opt_in_only(monkeypatch):
    monkeypatch.delenv("GEOMOZ_ENFORCE_AI_CREDITS", raising=False)
    assert engine.metering_enabled() is False
    monkeypatch.setenv("GEOMOZ_ENFORCE_AI_CREDITS", "false")
    assert engine.metering_enabled() is False
    monkeypatch.setenv("GEOMOZ_ENFORCE_AI_CREDITS", "true")
    assert engine.metering_enabled() is True


def test_usage_summary_is_account_scoped_and_observes_plan(monkeypatch):
    class Doc:
        def __init__(self, content=None):
            self._content = content
            self.exists = content is not None

        def get(self):
            return self

        def to_dict(self):
            return self._content

        def collection(self, name):
            assert name == "cycles"
            return self

        def document(self, key):
            assert key == "2026-11"
            return self

    class Database:
        def collection(self, name):
            assert name in ("billingUsage", "billing")
            self.name = name
            return self

        def document(self, key):
            assert key == "uid-abc"
            return Doc({"used": 3, "reserved": 2}) if self.name == "billingUsage" else Doc({"plan": "community", "status": "active"})

    monkeypatch.setattr(engine, "_db", Database)
    monkeypatch.setattr(engine, "_effective_plan", lambda _: "community")
    monkeypatch.setattr(engine, "get_plan_limits", lambda _: {"credits": 20})
    data = engine._usage_summary("uid-abc", datetime(2026, 11, 6, tzinfo=timezone.utc))
    assert data["creditsRemaining"] == 15
    assert data["creditsUsed"] == 3
    assert data["creditsReserved"] == 2
    assert data["cycle"] == "2026-11"


def test_usage_protected_by_verified_firebase_identity():
    # The public route requires the existing verified Firebase dependency,
    # not a caller-supplied UID or tenant selector.
    from billing import _uid
    dependency = engine.my_usage.__defaults__[0]
    assert dependency.dependency is _uid
