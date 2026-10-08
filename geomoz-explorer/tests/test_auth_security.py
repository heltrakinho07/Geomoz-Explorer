"""Regression tests: verified identities and GEE credential isolation.

These checks intentionally do not require live Google/Firebase credentials.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _request(headers=None):
    items = [
        (key.lower().encode("ascii"), value.encode("utf-8"))
        for key, value in (headers or {}).items()
    ]
    return Request({"type": "http", "method": "POST", "path": "/", "headers": items})


def test_forged_jwt_payload_is_never_trusted(monkeypatch):
    import api

    verifier = MagicMock(side_effect=ValueError("bad signature"))
    monkeypatch.setattr(api, "firebase_auth", SimpleNamespace(verify_id_token=verifier))
    # Firebase-like JWT header/payload deliberately has no valid signature.
    forged = "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJhbm90aGVyLXVzZXIifQ."
    assert api._extract_uid_from_header(forged) is None
    verifier.assert_called_once()


def test_firebase_verification_is_required_even_if_sdk_is_unavailable(monkeypatch):
    import api

    monkeypatch.setattr(api, "firebase_auth", None)
    assert api._extract_uid_from_header("Bearer a.b.c") is None
    with pytest.raises(HTTPException) as error:
        asyncio.run(api.require_firebase_auth(_request({"Authorization": "Bearer a.b.c"})))
    assert error.value.status_code == 401


def test_anonymous_identity_cannot_write_gee_credentials():
    import api

    route = next(r for r in api.app.routes if getattr(r, "path", "") == "/geomoz-api/gee/configure")
    assert any(dep.call is api.require_firebase_auth for dep in route.dependant.dependencies)


def test_basin_tile_refresh_checks_gee_access():
    import api

    route = next(r for r in api.app.routes if getattr(r, "path", "") == "/geomoz-api/gee/refresh-basin-tiles")
    assert any(dep.call is api.require_gee_auth for dep in route.dependant.dependencies)


def test_invalid_bearer_does_not_fall_back_to_public_gee(monkeypatch):
    import api
    import gee_module

    monkeypatch.setattr(api, "firebase_auth", SimpleNamespace(verify_id_token=MagicMock(side_effect=ValueError())))
    monkeypatch.setattr(gee_module, "_init_gee", MagicMock())
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "true")
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT_KEY", "dummy-key")

    with pytest.raises(HTTPException) as error:
        asyncio.run(api.require_gee_auth(_request({"Authorization": "Bearer forged.token.value"})))
    assert error.value.status_code == 401
    gee_module._init_gee.assert_not_called()


def test_guest_must_not_supply_a_personal_gee_token(monkeypatch):
    import api
    import gee_module

    monkeypatch.setattr(gee_module, "_init_gee", MagicMock())
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "true")
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT_KEY", "dummy-key")
    with pytest.raises(HTTPException) as error:
        asyncio.run(api.require_gee_auth(_request({"X-GEE-Token": "not-my-token"})))
    assert error.value.status_code == 401
    gee_module._init_gee.assert_not_called()


def test_guest_access_requires_explicit_server_fallback(monkeypatch):
    import api
    import gee_module

    monkeypatch.setattr(gee_module, "_init_gee", MagicMock())
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "false")
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT_KEY", "dummy-key")
    with pytest.raises(HTTPException) as error:
        asyncio.run(api.require_gee_auth(_request()))
    assert error.value.status_code == 401
    gee_module._init_gee.assert_not_called()


def test_explicit_guest_demo_never_loads_shared_default_credentials(monkeypatch):
    import api
    import gee_module
    import gee_session_store

    init = MagicMock()
    store = MagicMock()
    monkeypatch.setattr(gee_module, "_init_gee", init)
    monkeypatch.setattr(gee_session_store, "get_token", store)
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "true")
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT_KEY", "dummy-key")

    assert asyncio.run(api.require_gee_auth(_request())) == ""
    init.assert_called_once_with(uid=None, project=None, token=None)
    store.assert_not_called()


def test_valid_firebase_user_can_use_own_gee_credentials(monkeypatch):
    import api
    import gee_module
    import gee_session_store

    verify = MagicMock(return_value={"uid": "verified-user"})
    init = MagicMock()
    store = MagicMock(return_value={"project": "my-project", "access_token": "saved-token"})
    monkeypatch.setattr(api, "firebase_auth", SimpleNamespace(verify_id_token=verify))
    monkeypatch.setattr(gee_module, "_init_gee", init)
    monkeypatch.setattr(gee_session_store, "get_token", store)
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "false")

    assert asyncio.run(api.require_gee_auth(_request({"Authorization": "Bearer real-token"}))) == "verified-user"
    verify.assert_called_once_with("real-token")
    store.assert_called_once_with("verified-user")
    init.assert_called_once_with(uid="verified-user", project=None, token=None)


def test_public_gee_status_does_not_use_unverified_personal_headers(monkeypatch):
    import api
    import gee_module
    import gee_session_store

    monkeypatch.setattr(api, "firebase_auth", SimpleNamespace(verify_id_token=MagicMock(side_effect=ValueError())))
    status = MagicMock(return_value={"connected": False, "auth_type": "none"})
    store = MagicMock()
    monkeypatch.setattr(gee_module, "gee_status", status)
    monkeypatch.setattr(gee_session_store, "get_token", store)

    result = asyncio.run(api.gee_status_endpoint(_request({
        "Authorization": "Bearer invalid-token",
        "X-GEE-Token": "secret-from-request",
        "X-GEE-Project": "someone-elses-project",
    })))
    assert result["user_connected"] is False
    status.assert_called_once_with(uid=None, project=None, token=None)
    store.assert_not_called()


def test_saved_analysis_routes_require_verified_identity():
    import api

    protected = {
        "/geomoz-api/analyses/save",
        "/geomoz-api/analyses",
        "/geomoz-api/analyses/{analysis_id}",
    }
    for route in api.app.routes:
        if getattr(route, "path", "") in protected:
            assert any(dep.call is api.require_firebase_auth for dep in route.dependant.dependencies)


def test_saved_analyses_are_isolated_by_user(client, monkeypatch, tmp_path):
    import api

    monkeypatch.setattr(api, "SAVED_ANALYSES_DIR", str(tmp_path))
    saved = client.post(
        "/geomoz-api/analyses/save",
        json={"title": "Private study", "type": "hidro", "data": {"private": True}},
    )
    assert saved.status_code == 200
    analysis_id = saved.json()["id"]
    assert client.get(f"/geomoz-api/analyses/{analysis_id}").status_code == 200

    # Switch only the verified user dependency. No data or filenames are shared.
    api.app.dependency_overrides[api.require_firebase_auth] = lambda: "another-user"
    assert client.get("/geomoz-api/analyses").json() == []
    assert client.get(f"/geomoz-api/analyses/{analysis_id}").status_code == 404
    assert client.delete(f"/geomoz-api/analyses/{analysis_id}").status_code == 404

    api.app.dependency_overrides[api.require_firebase_auth] = lambda: "test-uid-123"
    assert client.get(f"/geomoz-api/analyses/{analysis_id}").status_code == 200


def test_saved_analysis_id_cannot_traverse_directories(client):
    resp = client.post(
        "/geomoz-api/analyses/save",
        json={"id": "../private", "title": "bad-id", "data": {"x": 1}},
    )
    assert resp.status_code == 400
