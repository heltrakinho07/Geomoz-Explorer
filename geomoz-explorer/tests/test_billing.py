"""Unit tests for the subscription catalogue and secure billing rules."""
from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from billing_core import (
    PLANS, current_plan, has_feature, monthly_cycle, period_end,
    public_catalogue, remaining_credits,
)
from billing_api import _verify_stripe_signature


def test_plan_catalogue_pricing_and_quotas():
    assert len(public_catalogue()) == 5
    assert PLANS["community"]["monthly_mzn"] == 0
    assert PLANS["academic"]["annual_mzn"] == 2990
    assert PLANS["pro"]["annual_mzn"] == 11990
    assert PLANS["teams"]["annual_mzn"] == 49990
    assert PLANS["community"]["projects"] == 3


def test_expired_or_forged_subscription_downgrades_to_community():
    now = datetime(2026, 11, 4, tzinfo=timezone.utc)
    assert current_plan({"plan": "pro", "status": "active",
                         "expires_at": (now - timedelta(seconds=1)).isoformat()}, now) == "community"
    assert current_plan({"plan": "pro", "status": "pending"}, now) == "community"
    assert current_plan({"plan": "not-a-plan", "status": "active"}, now) == "community"
    assert current_plan({}, now) == "community"


def test_active_entitlements_and_monthly_reset():
    now = datetime(2026, 11, 4, tzinfo=timezone.utc)
    a = {"plan": "academic", "status": "active",
         "expires_at": (now + timedelta(days=3)).isoformat(),
         "credits_cycle": monthly_cycle(now), "credits_used": 145}
    assert current_plan(a, now) == "academic"
    assert has_feature(a, "scientific_analysis", now)
    assert not has_feature(a, "batch_processing", now)
    assert remaining_credits(a, now) == 5
    assert remaining_credits({**a, "credits_cycle": "2026-10"}, now) == 150


def test_calendar_rollovers_and_leap_year():
    feb29 = datetime(2024, 2, 29, tzinfo=timezone.utc)
    assert period_end(feb29, "year") == datetime(2025, 2, 28, tzinfo=timezone.utc)
    jan31 = datetime(2026, 1, 31, tzinfo=timezone.utc)
    assert period_end(jan31, "month") == datetime(2026, 2, 28, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        period_end(jan31, "week")


def test_stripe_signature_valid_and_replay_expired(monkeypatch):
    now = 1770000000
    monkeypatch.setattr(time, "time", lambda: now)
    body = b'{"type":"checkout.session.completed"}'
    signature = hmac.new(b"whsec_test", str(now).encode() + b"." + body, hashlib.sha256).hexdigest()
    _verify_stripe_signature(body, f"t={now},v1={signature}", "whsec_test")
    with pytest.raises(HTTPException) as tampered:
        _verify_stripe_signature(body + b"!", f"t={now},v1={signature}", "whsec_test")
    assert tampered.value.status_code == 401
    with pytest.raises(HTTPException) as stale:
        _verify_stripe_signature(body, f"t={now - 301},v1={signature}", "whsec_test")
    assert stale.value.status_code == 400


def test_public_endpoint_exposes_no_secret(client):
    result = client.get("/geomoz-api/billing/plans")
    assert result.status_code == 200
    payload = result.json()
    assert payload["currency"] == "MZN"
    assert len(payload["plans"]) == 5
    assert "secret" not in str(payload).lower()


def test_card_checkout_fails_closed_without_gateway(client, monkeypatch):
    import billing_api
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {}
    monkeypatch.setattr(billing_api, "_db", lambda: mock_db)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    response = client.post("/geomoz-api/billing/checkout", json={
        "plan": "pro", "interval": "month", "provider": "stripe",
    })
    assert response.status_code == 503
    assert not mock_db.collection.return_value.document.return_value.set.called


def test_mpesa_order_not_activated_by_client(client, monkeypatch):
    import billing_api
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {}
    monkeypatch.setattr(billing_api, "_db", lambda: mock_db)
    response = client.post("/geomoz-api/billing/checkout", json={
        "plan": "pro", "interval": "month", "provider": "mpesa",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
    saved = mock_db.collection.return_value.document.return_value.set.call_args.args[0]
    assert saved["status"] == "pending"
    assert saved["amount_mzn"] == 1199


def test_academic_requires_verification(client, monkeypatch):
    import billing_api
    mock_db = MagicMock()
    mock_db.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {}
    monkeypatch.setattr(billing_api, "_db", lambda: mock_db)
    response = client.post("/geomoz-api/billing/checkout", json={
        "plan": "academic", "interval": "month", "provider": "mpesa",
    })
    assert response.status_code == 403
