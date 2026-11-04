"""Plan request guardrails without real checkouts, Firestore writes or payments."""
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import billing_plan_requests as requests


def test_plan_request_never_accepts_a_free_or_unknown_purchase():
    for code in ("community", "vip", "admin"):
        with pytest.raises(ValidationError):
            requests.PlanRequest(plan=code, period="monthly")


def test_plan_request_period_and_message_limit():
    with pytest.raises(ValidationError):
        requests.PlanRequest(plan="pro", period="weekly")
    with pytest.raises(ValidationError):
        requests.PlanRequest(plan="pro", period="yearly", message="x" * 1001)


def test_teams_and_academic_request_allowed_when_checkout_disabled(monkeypatch):
    monkeypatch.setattr(requests, "get_plan_config", lambda plan: {"enabled": True})
    monkeypatch.setenv("GEOMOZ_BILLING_ENABLED", "false")
    from billing import _checkout_enabled
    assert not _checkout_enabled()
    for plan in ("academic", "pro", "teams"):
        payload = requests.PlanRequest(plan=plan, period="yearly")
        assert requests.validate_request(payload) is payload


def test_enterprise_requires_real_description(monkeypatch):
    monkeypatch.setattr(requests, "get_plan_config", lambda plan: {"enabled": True})
    with pytest.raises(HTTPException) as exc:
        requests.validate_request(requests.PlanRequest(plan="enterprise", message="teste"))
    assert exc.value.status_code == 422
    assert requests.validate_request(requests.PlanRequest(
        plan="enterprise", message="Instituição com 12 técnicos SIG"
    )).plan == "enterprise"


def test_disabled_plan_cannot_receive_new_requests(monkeypatch):
    monkeypatch.setattr(requests, "get_plan_config", lambda plan: {"enabled": False})
    with pytest.raises(HTTPException) as exc:
        requests.validate_request(requests.PlanRequest(plan="pro"))
    assert exc.value.status_code == 403


def test_public_plan_request_does_not_expose_internal_review_metadata():
    details = {
        "uid": "uid-1", "email": "person@example.invalid",
        "status": "in_review", "plan": "academic", "period": "monthly",
        "message": "Universidade", "submittedAt": "2026-11-04",
        "reviewedBy": "admin-uid", "submittedEpoch": 1793830000,
        "secret": "should never escape",
    }
    safe = requests.public_request(details)
    assert safe["plan"] == "academic"
    assert "reviewedBy" not in safe
    assert "submittedEpoch" not in safe
    assert "secret" not in safe


def test_teams_checkout_not_enabled_by_default(monkeypatch):
    from billing import config
    monkeypatch.delenv("GEOMOZ_TEAMS_CHECKOUT_ENABLED", raising=False)
    assert config()["teamsCheckoutEnabled"] is False
    monkeypatch.setenv("GEOMOZ_TEAMS_CHECKOUT_ENABLED", "true")
    assert config()["teamsCheckoutEnabled"] is True
