"""Read-only administrative credit inspection contract."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import admin


class FakeEvent:
    def __init__(self):
        self.id = "event-1"
    def to_dict(self):
        return {"operation": "ai.agent_chat", "credits": 1,
                "cycle": "2026-11", "createdAt": "2026-11-07T08:00:00Z",
                "internalSecret": "never-return"}


class FakeQuery:
    def __init__(self):
        self.calls = []
    def order_by(self, name, direction=None):
        self.calls.append(("order_by", name))
        return self
    def limit(self, size):
        self.calls.append(("limit", size))
        return self
    def stream(self):
        return [FakeEvent()]


class FakeDb:
    def __init__(self):
        self.query = FakeQuery()
    def collection(self, name):
        assert name == "billing"
        return SimpleNamespace(document=lambda uid: SimpleNamespace(
            collection=lambda child: self._events(child)
        ))
    def _events(self, child):
        assert child == "usageEvents"
        return self.query


def test_admin_usage_reuses_authoritative_entitlements_and_redacts_events(monkeypatch):
    db = FakeDb()
    monkeypatch.setattr(admin, "_db", lambda: db)
    monkeypatch.setattr(admin, "_get_account", lambda uid: SimpleNamespace(uid=uid))
    import subscription_entitlements
    monkeypatch.setattr(subscription_entitlements, "user_subscription_snapshot",
                        lambda uid, database: {
                            "plan": "pro", "subscriptionStatus": "active",
                            "periodEnd": "2026-12-01", "limits": {"credits": 800},
                            "usage": {"credits": 8, "creditsReserved": 2},
                            "enforcement": {"credits": "opt_in"},
                        })
    result = admin.user_credit_usage("uid-1", limit=10,
        operator={"uid": "admin", "role": "support"})
    assert result["plan"] == "pro"
    assert result["usage"]["creditsReserved"] == 2
    assert result["eventsScope"] == "recent_only"
    assert result["recentCreditEvents"][0]["operation"] == "ai.agent_chat"
    assert "internalSecret" not in result["recentCreditEvents"][0]
    assert ("limit", 10) in db.query.calls


def test_admin_usage_does_not_bypass_account_lookup(monkeypatch):
    def missing(uid):
        raise HTTPException(404, "Utilizador não encontrado.")
    monkeypatch.setattr(admin, "_get_account", missing)
    with pytest.raises(HTTPException) as exc:
        admin.user_credit_usage("missing", limit=5,
            operator={"uid": "admin", "role": "admin"})
    assert exc.value.status_code == 404


def test_admin_usage_route_requires_verified_admin():
    route = next(r for r in admin.router.routes
                 if r.path == "/geomoz-api/admin/users/{uid}/usage")
    assert any(d.call is admin.require_admin for d in route.dependant.dependencies)
