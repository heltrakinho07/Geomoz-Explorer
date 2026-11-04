"""GEE session durability and error handling."""
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException

import gee_session_store as store


def test_write_waits_for_firestore(monkeypatch):
    document = MagicMock()
    monkeypatch.setattr(store, "_document", lambda uid: document)
    store.set_token("user-one", {"project": "geoprocessamento-426809"})
    document.set.assert_called_once_with(
        {"project": "geoprocessamento-426809"}, merge=True
    )


def test_write_failure_returns_503(monkeypatch):
    document = MagicMock()
    document.set.side_effect = RuntimeError("unavailable")
    monkeypatch.setattr(store, "_document", lambda uid: document)
    with pytest.raises(HTTPException) as exc:
        store.set_token("user-one", {"access_token": "redacted"})
    assert exc.value.status_code == 503
    assert "redacted" not in str(exc.value.detail)


def test_read_failure_returns_503(monkeypatch):
    document = MagicMock()
    document.get.side_effect = RuntimeError("unavailable")
    monkeypatch.setattr(store, "_document", lambda uid: document)
    with pytest.raises(HTTPException) as exc:
        store.get_token("user-one")
    assert exc.value.status_code == 503


def test_read_is_persistent(monkeypatch):
    document = MagicMock()
    document.get.return_value.exists = True
    document.get.return_value.to_dict.return_value = {"project": "p"}
    monkeypatch.setattr(store, "_document", lambda uid: document)
    assert store.get_token("user-one") == {"project": "p"}


def test_delete_failure_returns_503(monkeypatch):
    document = MagicMock()
    document.delete.side_effect = RuntimeError("unavailable")
    monkeypatch.setattr(store, "_document", lambda uid: document)
    with pytest.raises(HTTPException) as exc:
        store.clear_token("user-one")
    assert exc.value.status_code == 503


def test_rejects_invalid_user_identity():
    with pytest.raises(HTTPException) as exc:
        store.set_token("guest/another-user", {})
    assert exc.value.status_code == 401
