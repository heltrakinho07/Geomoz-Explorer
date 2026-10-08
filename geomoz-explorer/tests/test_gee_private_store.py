"""GEE credential isolation: private Admin-only storage, no cross-UID access."""

from unittest.mock import MagicMock

import pytest


class FakeDoc:
    def __init__(self):
        self.data = None

    def get(self):
        snapshot = MagicMock()
        snapshot.exists = self.data is not None
        snapshot.to_dict.return_value = dict(self.data) if self.data else None
        return snapshot

    def set(self, payload, merge=False):
        if merge and self.data is not None:
            self.data.update(payload)
        else:
            self.data = dict(payload)

    def delete(self):
        self.data = None


class FakeCollection:
    def __init__(self):
        self.docs = {}

    def document(self, uid):
        return self.docs.setdefault(uid, FakeDoc())


class FakeDB:
    def __init__(self):
        self.collections = {}

    def collection(self, name):
        return self.collections.setdefault(name, FakeCollection())


def test_credentials_only_exist_under_private_uid_documents(monkeypatch):
    import gee_session_store as store

    db = FakeDB()
    monkeypatch.setattr(store, "_get_db", lambda: db)

    store.set_token("alice", {
        "project": "alice-cloud",
        "refresh_token": "alice-refresh-secret",
        "access_token": "alice-access",
    })
    store.set_token("bob", {
        "project": "bob-cloud",
        "refresh_token": "bob-refresh-secret",
    })

    assert store.get_token("alice")["refresh_token"] == "alice-refresh-secret"
    assert store.get_token("bob")["refresh_token"] == "bob-refresh-secret"
    assert "bob-refresh-secret" not in str(store.get_token("alice"))
    assert "alice-refresh-secret" not in str(store.get_token("bob"))
    assert "users" not in db.collections  # No browser-readable secrets.
    assert db.collections["geePrivateSessions"].document("alice").data[
        "project"
    ] == "alice-cloud"

    store.clear_token("alice")
    assert store.get_token("alice") is None
    assert store.get_token("bob")["project"] == "bob-cloud"


def test_private_store_denies_anonymous_and_rejects_unavailable_admin(monkeypatch):
    import gee_session_store as store

    for uid in ("", "guest_user", "default", "a/b"):
        with pytest.raises(ValueError):
            store.get_token(uid)

    monkeypatch.setattr(store, "_get_db", lambda: None)
    monkeypatch.setattr(store, "_MEMORY_ONLY", False)
    with pytest.raises(RuntimeError, match="Firestore Admin"):
        store.set_token("alice", {"access_token": "private"})
    with pytest.raises(RuntimeError, match="Firestore Admin"):
        store.get_token("alice")


def test_session_secrets_are_not_saved_to_plaintext_disk(monkeypatch, tmp_path):
    import gee_session_store as store

    db = FakeDB()
    monkeypatch.setattr(store, "_get_db", lambda: db)
    monkeypatch.chdir(tmp_path)
    store.set_token("alice", {"service_account_key": "private-key-payload"})
    assert not list(tmp_path.glob("*.json"))
    assert store.get_token("alice")["service_account_key"] == "private-key-payload"
