"""Managed GDAL queue admission tests; never execute GDAL or charge real credits."""
from io import BytesIO
from types import SimpleNamespace
import pytest

import processing_jobs as jobs


class DeferredExecutor:
    def __init__(self):
        self.pending = []

    def submit(self, fn, *args):
        self.pending.append((fn, args))
        return SimpleNamespace(cancel=lambda: True, done=lambda: False)


@pytest.fixture
def sandbox(monkeypatch, tmp_path):
    monkeypatch.setattr(jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(jobs, "_jobs", {})
    monkeypatch.setattr(jobs, "_cancellations", {})
    monkeypatch.setattr(jobs, "_futures", {})
    monkeypatch.setattr(jobs, "_processes", {})
    monkeypatch.setattr(jobs, "_callbacks", {})
    executor = DeferredExecutor()
    monkeypatch.setattr(jobs, "_executor", executor)
    return executor


def _submit(uid, job_id, **kwargs):
    return jobs.create_processing_job(
        uid=uid, tool="slope", input_name="topography.tif",
        input_stream=BytesIO(b"II*\x00" + b"\x00" * 1024),
        job_id=job_id, **kwargs)


def test_per_plan_concurrent_job_limit_rejected(sandbox):
    _submit("user1", "a" * 32, max_active_per_user=1)
    with pytest.raises(ValueError, match="Limite de jobs"):
        _submit("user1", "b" * 32, max_active_per_user=1)
    _submit("user2", "c" * 32, max_active_per_user=1)


def test_cancelled_cloud_job_settles_credit_once(sandbox):
    results = []
    accepted = _submit("user1", "d" * 32, max_active_per_user=2,
                       on_complete=lambda success: results.append(success))
    assert accepted.id == "d" * 32
    assert jobs.delete_processing_job(accepted.id, "user1")
    assert results == [False]
    assert not jobs.delete_processing_job(accepted.id, "user1")


def test_invalid_processing_admission_never_invokes_credit_settlement(sandbox):
    callbacks = []
    with pytest.raises(ValueError):
        _submit("user1", "e" * 32, max_active_per_user=0,
                on_complete=lambda ok: callbacks.append(ok))
    assert callbacks == []


def test_callback_failure_does_not_corrupt_queue_cleanup(sandbox):
    def broken_callback(_):
        raise RuntimeError("Firestore temporarily unavailable")

    accepted = _submit("user1", "f" * 32, on_complete=broken_callback)
    assert jobs.delete_processing_job(accepted.id, "user1")
    assert not jobs._callbacks
