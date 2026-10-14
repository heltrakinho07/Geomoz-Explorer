"""Regression tests for GEE OAuth transport and account-scoped credentials.

These tests do not call Google APIs or use live credentials.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def browser_request(origin: str) -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/geomoz-api/gee/oauth/exchange-code",
        "headers": [(b"origin", origin.encode("ascii"))],
    })


def test_capabilities_requires_verified_firebase_uid():
    import api

    route = next(r for r in api.app.routes
                 if getattr(r, "path", "") == "/geomoz-api/gee/oauth/capabilities")
    assert any(dep.call is api.require_firebase_auth for dep in route.dependant.dependencies)


def test_capability_advertises_renewal_only_with_configured_secret(monkeypatch):
    import api
    import gee_module

    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_SECRET", "")
    not_ready = asyncio.run(api.gee_oauth_capabilities(uid="alice"))
    assert not_ready["code_flow_ready"] is False
    assert not_ready["token_flow_ready"] is True
    assert "secret" not in not_ready

    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_SECRET", "test-server-secret")
    ready = asyncio.run(api.gee_oauth_capabilities(uid="alice"))
    assert ready["code_flow_ready"] is True


def test_code_exchange_rejects_unconfigured_server_before_contacting_google(monkeypatch):
    import api
    import gee_module

    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_SECRET", "")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.gee_oauth_exchange_code(
            api.OAuthCodeRequest(code="not-a-real-code",
                                 redirect_uri="https://geomoz.geolithica.com",
                                 project="geoprocessamento-426809"),
            browser_request("https://geomoz.geolithica.com"),
            uid="alice",
        ))
    assert exc.value.status_code == 503


@pytest.mark.parametrize("redirect,origin", [
    ("https://attacker.example", "https://attacker.example"),
    ("https://geomoz.geolithica.com", "https://attacker.example"),
    ("postmessage", "https://geomoz.geolithica.com"),
])
def test_code_exchange_rejects_untrusted_oauth_origins(monkeypatch, redirect, origin):
    import api
    import gee_module

    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setattr(gee_module, "GOOGLE_CLIENT_SECRET", "test-secret")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.gee_oauth_exchange_code(
            api.OAuthCodeRequest(code="not-a-real-code", redirect_uri=redirect,
                                 project="my-project"),
            browser_request(origin),
            uid="alice",
        ))
    assert exc.value.status_code == 400


def test_temporary_token_replaces_old_refresh_token_when_switching_account(monkeypatch):
    import api
    import gee_session_store
    import gee_module

    stored = {"alice": {"project": "old-project", "refresh_token": "old-account-refresh"}}

    def clear(uid):
        stored.pop(uid, None)

    def save(uid, new_data):
        stored[uid] = {**stored.get(uid, {}), **new_data}

    monkeypatch.setattr(gee_session_store, "clear_token", clear)
    monkeypatch.setattr(gee_session_store, "set_token", save)
    monkeypatch.setattr(gee_session_store, "get_token", lambda uid: stored.get(uid))
    monkeypatch.setattr(gee_module, "_init_gee", MagicMock())
    monkeypatch.setattr(gee_module, "reset_gee", MagicMock())

    result = asyncio.run(api.gee_oauth_token(
        api.OAuthTokenRequest(access_token="new-access", project="new-project"),
        uid="alice",
    ))
    assert result["connected"] is True
    assert result["is_permanent"] is False
    assert stored["alice"] == {"access_token": "new-access", "project": "new-project"}
