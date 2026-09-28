"""Regression tests for server-side-only Earth Engine credential persistence."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

import gee_session_store as store


@pytest.fixture(autouse=True)
def clear_session_cache():
    store._user_sessions.clear()
    yield
    store._user_sessions.clear()


def test_public_metadata_never_contains_secrets():
    metadata = store._public_metadata(
        {
            "project": "my-ee-project",
            "account": "user@example.com",
            "access_token": "access-secret",
            "refresh_token": "refresh-secret",
            "service_account_key": '{"private_key":"secret"}',
        }
    )

    assert metadata["project"] == "my-ee-project"
    assert metadata["account"] == "user@example.com"
    assert metadata["connected"] is True
    assert metadata["is_permanent"] is True
    assert "access_token" not in metadata
    assert "refresh_token" not in metadata
    assert "service_account_key" not in metadata


def test_plaintext_disk_cache_is_disabled_by_default(monkeypatch, tmp_path):
    session_file = tmp_path / ".gee_sessions.json"
    monkeypatch.setattr(store, "_enable_local_cache", False)
    monkeypatch.setattr(store, "_sessions_file", str(session_file))
    monkeypatch.setattr(store, "_get_db", lambda: None)

    store.set_token(
        "user-1",
        {
            "project": "my-ee-project",
            "refresh_token": "server-secret",
        },
    )

    assert not session_file.exists()


def test_set_token_writes_secrets_only_to_private_document(monkeypatch):
    private_doc = MagicMock()
    public_doc = MagicMock()

    monkeypatch.setattr(store, "_get_db", lambda: object())
    monkeypatch.setattr(store, "_private_doc", lambda _db, _uid: private_doc)
    monkeypatch.setattr(store, "_public_doc", lambda _db, _uid: public_doc)

    store.set_token(
        "user-1",
        {
            "project": "my-ee-project",
            "account": "user@example.com",
            "access_token": "access-secret",
            "refresh_token": "refresh-secret",
            "service_account_key": '{"private_key":"secret"}',
        },
    )

    private_payload = private_doc.set.call_args.args[0]
    public_payload = public_doc.set.call_args.args[0]

    assert private_payload["access_token"] == "access-secret"
    assert private_payload["refresh_token"] == "refresh-secret"
    assert private_payload["service_account_key"]

    assert "access_token" not in public_payload
    assert "refresh_token" not in public_payload
    assert "service_account_key" not in public_payload


def test_get_token_lazy_loads_private_firestore_credentials(monkeypatch):
    snapshot = MagicMock()
    snapshot.exists = True
    snapshot.to_dict.return_value = {
        "project": "my-ee-project",
        "refresh_token": "refresh-secret",
    }
    private_doc = MagicMock()
    private_doc.get.return_value = snapshot

    monkeypatch.setattr(store, "_get_db", lambda: object())
    monkeypatch.setattr(store, "_private_doc", lambda _db, _uid: private_doc)

    data = store.get_token("user-1")

    assert data is not None
    assert data["project"] == "my-ee-project"
    assert data["refresh_token"] == "refresh-secret"
    assert store._user_sessions["user-1"]["refresh_token"] == "refresh-secret"
