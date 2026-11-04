"""PayZeno GeoMoz: pure safety checks and pricing tests; no real payment calls."""
from datetime import datetime, timezone
import base64
import hashlib
import hmac

import pytest
from fastapi import HTTPException

from billing import (
    PRICES_MZN,
    _add_months,
    _check_session_identity,
    _effective_plan,
    _normalise_phone,
    _verify_signature,
    _verified_status,
)


def test_price_in_minor_units_contract():
    assert PRICES_MZN[("academic", "monthly")] * 100 == 29900
    assert PRICES_MZN[("pro", "yearly")] * 100 == 1199000
    assert PRICES_MZN[("teams", "yearly")] * 100 == 4999000


def test_phone_normalisation_and_expiry():
    assert _normalise_phone("84 123 4567") == "+258841234567"
    assert _normalise_phone("0841234567") == "+258841234567"
    assert _add_months(datetime(2026, 1, 31, tzinfo=timezone.utc), 1).isoformat() == "2026-02-28T00:00:00+00:00"


def test_expired_paid_plan_cannot_be_used():
    expired = {"plan": "pro", "status": "active", "periodEnd": "2020-01-01T00:00:00+00:00"}
    assert _effective_plan(expired) == "community"
    assert _effective_plan({"plan": "pro", "status": "cancelled", "periodEnd": "2099-01-01T00:00:00+00:00"}) == "community"
    assert _effective_plan({"plan": "pro", "status": "active", "periodEnd": "2099-01-01T00:00:00+00:00"}) == "pro"


def test_payzeno_hmac_signatures(monkeypatch):
    monkeypatch.setenv("PAYZENO_WEBHOOK_SECRET", "secret-from-test")
    raw = b'{"event":"payment.succeeded"}'
    digest = hmac.new(b"secret-from-test", raw, hashlib.sha256).digest()
    _verify_signature(raw, digest.hex())
    _verify_signature(raw, "sha256=" + digest.hex())
    _verify_signature(raw, base64.b64encode(digest).decode())
    with pytest.raises(HTTPException) as exc:
        _verify_signature(raw + b"changed", digest.hex())
    assert exc.value.status_code == 401


def test_provider_confirmation_rejects_mismatch():
    payment = {"checkoutId": "abc", "reference": "GMZ-1234", "currency": "MZN", "amountMinor": 29900}
    assert _verified_status({"status": "paid", "checkout_id": "abc", "reference": "GMZ-1234", "currency": "MZN", "amount": 29900}, payment) == "paid"
    with pytest.raises(HTTPException):
        _check_session_identity({"status": "paid", "checkout_id": "different"}, payment)
    with pytest.raises(HTTPException):
        _check_session_identity({"status": "paid", "amount": 2990}, payment)
    with pytest.raises(HTTPException):
        _check_session_identity({"status": "paid", "currency": "USD"}, payment)


def test_project_quota_free_and_paid():
    from project_quota import quota_check
    quota_check(2, 3)
    quota_check(99, None)
    with pytest.raises(HTTPException) as exc:
        quota_check(3, 3)
    assert exc.value.status_code == 402


def test_project_creation_input_validation():
    from project_quota import CreateProjectRequest, validate_project
    payload = {
        "name": "Bacia do Búzi", "description": "Diagnóstico de drenagem",
        "category": "recursos_hidricos", "aoi": {"type": "Polygon", "coordinates": []},
        "period": {"startDate": "2026-01-01", "endDate": "2026-12-31"},
    }
    project = CreateProjectRequest.model_validate(payload)
    validate_project(project)
    project.period.startDate = "2027-01-01"
    with pytest.raises(HTTPException) as exc:
        validate_project(project)
    assert exc.value.status_code == 422
