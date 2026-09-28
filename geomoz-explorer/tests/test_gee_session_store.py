"""Tests for short-lived BYO-GEE bearer-token persistence."""

from __future__ import annotations

import time

import pytest


@pytest.fixture
def session_store(monkeypatch: pytest.MonkeyPatch):
    import gee_session_store

    gee_session_store._user_sessions.clear()
    monkeypatch.setattr(gee_session_store, "_get_firestore_client", lambda: None)
    return gee_session_store


def test_set_token_records_expiry(session_store) -> None:
    before = time.time()

    session_store.set_token(
        "uid-1",
        {"access_token": "token", "project": "project-1"},
    )

    stored = session_store._user_sessions["uid-1"]
    assert stored["expires_at"] > before
    assert stored["expires_at"] <= before + 3601


def test_expired_token_is_removed(session_store) -> None:
    session_store._user_sessions["uid-1"] = {
        "access_token": "expired",
        "project": "project-1",
        "updated_at": time.time() - 4000,
        "expires_at": time.time() - 1,
    }

    assert session_store.get_token("uid-1") is None
    assert "uid-1" not in session_store._user_sessions


def test_legacy_token_without_expiry_is_treated_as_stale(session_store) -> None:
    session_store._user_sessions["uid-legacy"] = {
        "access_token": "unknown-lifetime",
        "project": "project-1",
    }

    assert session_store.get_token("uid-legacy") is None
    assert "uid-legacy" not in session_store._user_sessions


def test_fresh_token_is_returned(session_store) -> None:
    session_store._user_sessions["uid-1"] = {
        "access_token": "fresh",
        "project": "project-1",
        "expires_at": time.time() + 120,
    }

    token = session_store.get_token("uid-1")

    assert token is not None
    assert token["access_token"] == "fresh"
