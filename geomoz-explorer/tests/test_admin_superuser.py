"""GeoMoz admin console security regressions; no live Firebase credentials."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import admin
from admin import GrantPlan, require_admin, validate_grant
from platform_config import DEFAULT_FEATURES, blocked_api_module, update_features, update_plan_config


def request_with_token(token="test-firebase-id-token"):
    return Request({
        "type": "http", "method": "GET", "path": "/geomoz-api/admin/me",
        "headers": [(b"authorization", ("Bearer " + token).encode())],
    })


def test_admin_must_supply_firebase_id_token():
    with pytest.raises(HTTPException) as exc:
        require_admin(Request({"type": "http", "method": "GET", "headers": []}))
    assert exc.value.status_code == 401


@pytest.mark.parametrize("role", [None, "user", "billing", "admin-owner", "super_admin"])
def test_non_admin_custom_claim_rejected(monkeypatch, role):
    mock = SimpleNamespace(
        verify_id_token=lambda token, check_revoked: {"uid": "not-admin", "geomoz_role": "superadmin"},
        get_user=lambda uid: SimpleNamespace(disabled=False, custom_claims={"geomoz_role": role}),
    )
    monkeypatch.setattr(admin, "firebase_auth", mock)
    with pytest.raises(HTTPException) as exc:
        require_admin(request_with_token())
    assert exc.value.status_code == 403


def test_admin_role_comes_from_current_server_claims(monkeypatch):
    seen = {}

    def verify(token, check_revoked):
        seen["revoked"] = check_revoked
        return {"uid": "operator", "geomoz_role": "support"}

    mock = SimpleNamespace(
        verify_id_token=verify,
        get_user=lambda uid: SimpleNamespace(
            disabled=False, custom_claims={"geomoz_role": "superadmin"}, email="admin@example.invalid"
        ),
    )
    monkeypatch.setattr(admin, "firebase_auth", mock)
    user = require_admin(request_with_token())
    assert seen["revoked"] is True
    assert user["role"] == "superadmin"


def test_disabled_account_cannot_use_admin(monkeypatch):
    mock = SimpleNamespace(
        verify_id_token=lambda token, check_revoked: {"uid": "disabled"},
        get_user=lambda uid: SimpleNamespace(
            disabled=True, custom_claims={"geomoz_role": "superadmin"},
        ),
    )
    monkeypatch.setattr(admin, "firebase_auth", mock)
    with pytest.raises(HTTPException) as exc:
        require_admin(request_with_token())
    assert exc.value.status_code == 403


def test_protected_operator_is_not_demoted_or_disabled():
    account = SimpleNamespace(uid="owner", custom_claims={"geomoz_role": "superadmin"})
    with pytest.raises(HTTPException) as exc:
        admin._protect_operator_target({"uid": "owner", "role": "superadmin"}, account)
    assert exc.value.status_code == 403
    account.uid = "other-owner"
    with pytest.raises(HTTPException) as exc:
        admin._protect_operator_target({"uid": "owner", "role": "superadmin"}, account)
    assert exc.value.status_code == 403


def test_manual_plan_grant_needs_future_end_date():
    with pytest.raises(HTTPException):
        validate_grant(GrantPlan(plan="pro", reason="Oferta de lançamento"))
    with pytest.raises(HTTPException):
        validate_grant(GrantPlan(plan="pro", through=date.today(), reason="Oferta de lançamento"))
    validate_grant(GrantPlan(plan="pro", through=date.today() + timedelta(days=30),
                             reason="Oferta de lançamento"))
    validate_grant(GrantPlan(plan="community", reason="Regresso ao acesso gratuito"))


def test_sensitive_plan_edits_denied_before_firestore():
    with pytest.raises(ValueError):
        update_plan_config("community", {"monthlyMzn": 10})
    with pytest.raises(ValueError):
        update_plan_config("pro", {"monthlyMzn": -1})
    with pytest.raises(ValueError):
        update_plan_config("pro", {"fake": True})
    with pytest.raises(ValueError):
        update_plan_config("enterprise", {"monthlyMzn": 100})


def test_feature_flag_validation_denied_before_firestore():
    with pytest.raises(ValueError):
        update_features({"unknown_module": False})
    with pytest.raises(ValueError):
        update_features({"geo_ai": "false"})
    assert DEFAULT_FEATURES["geo_ai"] is True


@pytest.mark.parametrize(("endpoint", "module"), [
    ("/geomoz-api/ai/agent-chat", "geo_ai"),
    ("/geomoz-api/terrain/mesh", "terrain_3d"),
    ("/geomoz-api/gee/basins", "hydrology"),
    ("/geomoz-api/gee/landcover", "remote_sensing"),
    ("/geomoz-api/billing/webhook", None),
    ("/geomoz-api/admin/me", None),
    ("/geomoz-api/health", None),
])
def test_api_module_guards(endpoint, module):
    assert blocked_api_module(endpoint) == module
