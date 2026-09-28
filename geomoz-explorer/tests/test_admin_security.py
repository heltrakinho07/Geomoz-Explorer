"""Security tests for GeoMoz server-global administration endpoints."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


class DummyRequest:
    def __init__(self, authorization: str | None = None):
        self.headers = {}
        if authorization is not None:
            self.headers["Authorization"] = authorization


class TestAdminGuard:
    def test_admin_guard_requires_bearer_token(self) -> None:
        from api import require_admin_auth

        with pytest.raises(HTTPException) as exc:
            asyncio.run(require_admin_auth(DummyRequest()))

        assert exc.value.status_code == 401

    def test_admin_guard_accepts_custom_admin_claim(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from api import firebase_auth, require_admin_auth

        monkeypatch.setattr(
            firebase_auth,
            "verify_id_token",
            lambda token: {"uid": "admin-uid", "admin": True},
        )

        uid = asyncio.run(
            require_admin_auth(DummyRequest("Bearer valid-admin-token"))
        )

        assert uid == "admin-uid"

    def test_admin_guard_rejects_normal_authenticated_user(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from api import firebase_auth, require_admin_auth

        monkeypatch.delenv("GEOMOZ_ADMIN_UIDS", raising=False)
        monkeypatch.setattr(
            firebase_auth,
            "verify_id_token",
            lambda token: {"uid": "normal-user"},
        )

        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                require_admin_auth(DummyRequest("Bearer normal-token"))
            )

        assert exc.value.status_code == 403

    def test_admin_guard_accepts_server_side_uid_allowlist(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from api import firebase_auth, require_admin_auth

        monkeypatch.setenv("GEOMOZ_ADMIN_UIDS", "uid-1, uid-2")
        monkeypatch.setattr(
            firebase_auth,
            "verify_id_token",
            lambda token: {"uid": "uid-2"},
        )

        uid = asyncio.run(
            require_admin_auth(DummyRequest("Bearer allowlisted-token"))
        )

        assert uid == "uid-2"

    def test_invalid_token_does_not_expose_verifier_details(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from api import firebase_auth, require_admin_auth

        monkeypatch.setattr(
            firebase_auth,
            "verify_id_token",
            lambda token: (_ for _ in ()).throw(
                RuntimeError("sensitive verifier internals")
            ),
        )

        with pytest.raises(HTTPException) as exc:
            asyncio.run(
                require_admin_auth(DummyRequest("Bearer invalid"))
            )

        assert exc.value.status_code == 401
        assert "sensitive verifier internals" not in str(exc.value.detail)


class TestAdminGEEConfigAPI:
    def test_global_config_is_not_accessible_to_regular_client(
        self, client: TestClient,
    ) -> None:
        resp = client.get("/geomoz-api/gee/config")

        assert resp.status_code == 401

    def test_runtime_config_is_not_accessible_to_regular_client(
        self, client: TestClient,
    ) -> None:
        resp = client.post(
            "/geomoz-api/gee/configure",
            json={"project_id": "other-project"},
        )

        assert resp.status_code == 401

    def test_admin_runtime_config_is_disabled_by_default(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from api import app, require_admin_auth

        monkeypatch.delenv("GEOMOZ_ALLOW_RUNTIME_CONFIG", raising=False)
        app.dependency_overrides[require_admin_auth] = lambda: "admin-uid"
        try:
            resp = client.post(
                "/geomoz-api/gee/configure",
                json={"project_id": "other-project"},
            )
        finally:
            app.dependency_overrides.pop(require_admin_auth, None)

        assert resp.status_code == 403
        assert "Secret Manager" in resp.json()["detail"]

    def test_admin_can_read_masked_config(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_module
        from api import app, require_admin_auth

        monkeypatch.setattr(
            gee_module,
            "gee_status",
            lambda uid=None: {
                "connected": True,
                "auth_type": "service_account",
                "project": "server-project",
                "message": "ok",
            },
        )
        monkeypatch.setenv("GEE_PROJECT_ID", "server-project")
        monkeypatch.delenv("GEE_SERVICE_ACCOUNT_KEY", raising=False)

        app.dependency_overrides[require_admin_auth] = lambda: "admin-uid"
        try:
            resp = client.get("/geomoz-api/gee/config")
        finally:
            app.dependency_overrides.pop(require_admin_auth, None)

        assert resp.status_code == 200
        data = resp.json()
        assert data["config"]["envProjectId"] == "server-project"
        assert "private_key" not in resp.text

    def test_byo_gee_status_remains_user_endpoint(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_session_store

        monkeypatch.setattr(gee_session_store, "get_token", lambda uid: None)

        resp = client.get("/geomoz-api/gee/status")

        assert resp.status_code == 200
        assert resp.json()["reason"] == "not_connected"
