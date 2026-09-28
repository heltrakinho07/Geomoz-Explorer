"""Concurrency tests for process-global Earth Engine credential isolation."""

from __future__ import annotations

import threading
import time

import pytest


def test_gee_execution_lock_serializes_concurrent_users(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import gee_module

    active = 0
    max_active = 0
    guard = threading.Lock()
    started = threading.Barrier(2)

    def fake_init(uid):
        assert uid in {"user-a", "user-b"}

    monkeypatch.setattr(gee_module, "_init_gee", fake_init)

    def worker(uid: str) -> None:
        nonlocal active, max_active
        started.wait()
        with gee_module.gee_execution(uid):
            with guard:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.04)
            with guard:
                active -= 1

    first = threading.Thread(target=worker, args=("user-a",))
    second = threading.Thread(target=worker, args=("user-b",))
    first.start()
    second.start()
    first.join(timeout=2)
    second.join(timeout=2)

    assert not first.is_alive()
    assert not second.is_alive()
    assert max_active == 1


def test_lock_only_context_does_not_initialize_gee(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import gee_module

    calls: list[str | None] = []
    monkeypatch.setattr(
        gee_module,
        "_init_gee",
        lambda uid=None: calls.append(uid),
    )

    with gee_module.gee_execution_lock():
        pass

    assert calls == []
