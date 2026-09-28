"""Security regression tests for GeoMoz authentication and BYO-GEE routing."""

from __future__ import annotations

import asyncio
import base64
import json

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request


def _request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": raw_headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 443),
        }
    )


def _unsigned_jwt(payload: dict) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
    body = (
        base64.urlsafe_b64encode(json.dumps(payload).encode())
        .decode()
        .rstrip("=")
    )
    return f"{header}.{body}."


def test_invalid_firebase_token_is_not_trusted_from_unsigned_payload(monkeypatch):
    import api

    class FakeFirebaseAuth:
        @staticmethod
        def verify_id_token(_token):
            raise ValueError("invalid signature")

    monkeypatch.setattr(api, "firebase_auth", FakeFirebaseAuth())
    monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)

    token = _unsigned_jwt({"sub": "attacker-controlled-uid"})
    assert api._extract_uid_from_header(f"Bearer {token}") is None


def test_missing_authentication_is_rejected():
    import api

    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.require_firebase_auth(_request()))

    assert exc.value.status_code == 401


def test_gee_requires_user_project_and_credentials(monkeypatch):
    import api
    import gee_session_store

    monkeypatch.setattr(gee_session_store, "get_token", lambda _uid: {})
    monkeypatch.setenv("ALLOW_SERVER_GEE_FALLBACK", "false")
    monkeypatch.delenv("GEE_SERVICE_ACCOUNT_KEY", raising=False)

    request = _request({"X-GEE-Project": "user-earth-engine-project"})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(api.require_gee_auth(request, "user-123"))

    assert exc.value.status_code == 403
    assert "Ligue a sua conta Google Earth Engine" in str(exc.value.detail)


def test_oauth_token_request_requires_explicit_project():
    import api

    with pytest.raises(ValidationError):
        api.OAuthTokenRequest(access_token="temporary-token")


def test_oauth_code_request_requires_explicit_project():
    import api

    with pytest.raises(ValidationError):
        api.OAuthCodeRequest(code="authorization-code")
