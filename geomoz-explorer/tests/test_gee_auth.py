"""Regression tests for per-user GeoMoz Earth Engine authentication."""

from __future__ import annotations

import sys
import types

import pytest

import gee_session_store
from gee_module import _init_gee, gee_status


class _FakeEEString:
    def __init__(self, value: str):
        self.value = value

    def getInfo(self):
        return self.value


class _FakeEEModule(types.SimpleNamespace):
    def __init__(self):
        super().__init__()
        self.initialize_calls = []

    def Initialize(self, **kwargs):
        self.initialize_calls.append(kwargs)

    def String(self, value: str):
        return _FakeEEString(value)


@pytest.fixture(autouse=True)
def clear_sessions():
    gee_session_store._user_sessions.clear()
    yield
    gee_session_store._user_sessions.clear()


def test_init_gee_uses_user_token_and_project(monkeypatch):
    fake_ee = _FakeEEModule()
    monkeypatch.setitem(sys.modules, "ee", fake_ee)
    gee_session_store.set_token(
        "user-1",
        {"access_token": "oauth-access-token", "project": "my-ee-project"},
    )

    _init_gee("user-1")

    assert len(fake_ee.initialize_calls) == 1
    call = fake_ee.initialize_calls[0]
    assert call["project"] == "my-ee-project"
    assert call["credentials"].token == "oauth-access-token"


def test_init_gee_requires_project(monkeypatch):
    fake_ee = _FakeEEModule()
    monkeypatch.setitem(sys.modules, "ee", fake_ee)
    gee_session_store.set_token(
        "user-1",
        {"access_token": "oauth-access-token", "project": ""},
    )

    with pytest.raises(RuntimeError, match="GCP Project ID"):
        _init_gee("user-1")

    assert fake_ee.initialize_calls == []


def test_init_gee_requires_session():
    with pytest.raises(RuntimeError, match="não está ligado"):
        _init_gee("missing-user")


def test_gee_status_validates_real_connection(monkeypatch):
    fake_ee = _FakeEEModule()
    monkeypatch.setitem(sys.modules, "ee", fake_ee)
    gee_session_store.set_token(
        "user-1",
        {"access_token": "oauth-access-token", "project": "my-ee-project"},
    )

    status = gee_status("user-1")

    assert status["connected"] is True
    assert status["auth_type"] == "oauth2"
    assert status["project"] == "my-ee-project"
    assert status["message"] == "Earth Engine ligado e validado."


def test_gee_status_without_session_is_disconnected():
    status = gee_status("missing-user")

    assert status["connected"] is False
    assert status["auth_type"] is None
    assert status["project"] is None
