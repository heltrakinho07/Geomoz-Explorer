"""Regression: personal Earth Engine status differentiates private storage failures."""

import asyncio
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def status_request() -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/geomoz-api/gee/status",
        "headers": [(b"authorization", b"Bearer firebase-test-token")],
    })


def test_firestore_failure_returns_actionable_sanitized_503(monkeypatch):
    import api
    import gee_module
    import gee_session_store

    monkeypatch.setattr(api, "_extract_uid_from_header", lambda _: "verified-uid")
    monkeypatch.setattr(
        gee_session_store, "get_token",
        MagicMock(side_effect=PermissionError("private datastore debug context")),
    )
    evaluator = MagicMock()
    monkeypatch.setattr(gee_module, "gee_status", evaluator)

    with pytest.raises(HTTPException) as error:
        asyncio.run(api.gee_status_endpoint(status_request()))

    assert error.value.status_code == 503
    assert "Firestore" in error.value.detail
    assert "Cloud Run" in error.value.detail
    assert "private datastore debug context" not in error.value.detail
    evaluator.assert_not_called()


def test_gee_evaluation_failure_returns_distinct_503(monkeypatch):
    import api
    import gee_module
    import gee_session_store

    monkeypatch.setattr(api, "_extract_uid_from_header", lambda _: "verified-uid")
    monkeypatch.setattr(gee_session_store, "get_token", lambda _: {"project": "project-x"})
    monkeypatch.setattr(
        gee_module, "gee_status",
        MagicMock(side_effect=RuntimeError("internal engine detail")),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(api.gee_status_endpoint(status_request()))

    assert error.value.status_code == 503
    assert "avaliar a sessão Earth Engine" in error.value.detail
    assert "internal engine detail" not in error.value.detail
