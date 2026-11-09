"""GeoMoz BYO-GEE configuration: no platform credentials exposed."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import api


def test_config_uses_only_authenticated_users_credentials(monkeypatch):
    import gee_session_store
    monkeypatch.setattr(gee_session_store, "get_token",
                        lambda uid: {"project": "my-google-cloud-project",
                                     "access_token": "private-access-token",
                                     "service_account_key": "private-service-account-json"} if uid == "alice" else {})
    monkeypatch.setenv("GEE_SERVICE_ACCOUNT_KEY", "server-secret-key")
    monkeypatch.setenv("GEE_PROJECT_ID", "geomoz-server-project")
    own = api.gee_config(uid="alice")
    other = api.gee_config(uid="bob")
    assert own["status"]["project"] == "my-google-cloud-project"
    assert own["config"]["credentialSource"] == "user_only"
    assert own["status"]["allow_server_fallback"] is False
    assert own["config"]["envProjectId"] is None
    assert own["config"]["maskedServiceAccount"] is None
    assert other["status"]["connected"] is False
    assert other["status"]["project"] is None
    assert "server-secret-key" not in str(own)
    assert "geomoz-server-project" not in str(own)


def test_config_read_failure_does_not_return_server_credentials(monkeypatch):
    import gee_session_store
    monkeypatch.setattr(gee_session_store, "get_token",
                        lambda uid: (_ for _ in ()).throw(RuntimeError("secret-key")))
    with pytest.raises(HTTPException) as exc:
        api.gee_config(uid="alice")
    assert exc.value.status_code == 503
    assert "secret-key" not in str(exc.value.detail)


def test_personal_gee_config_requires_firebase_authentication():
    route = next(route for route in api.app.routes
                 if route.path == "/geomoz-api/gee/config")
    assert any(dependency.call is api.require_firebase_auth
               for dependency in route.dependant.dependencies)
