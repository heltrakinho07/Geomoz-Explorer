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


def test_result_download_settles_credit_only_when_output_exists(monkeypatch, tmp_path):
    import asyncio
    import api
    import billing

    job_id = "1" * 32
    output = tmp_path / "result.tif"
    output.write_bytes(b"II*\x00" + b"\x00" * 64)
    job = SimpleNamespace(id=job_id, status="completed", output_name=output.name,
                          error=None, tool="slope")
    monkeypatch.setattr(api, "get_processing_job", lambda current, uid: job)
    monkeypatch.setattr(api, "get_processing_job_output", lambda current, uid: output)
    settled = []
    monkeypatch.setattr(billing, "settle_cloud_job_credit",
                        lambda uid, jid, *, success: settled.append((uid, jid, success)))

    response = asyncio.run(api.processing_job_result(job_id, uid="verified-user"))
    assert response.status_code == 200
    assert settled == [("verified-user", job_id, True)]

    monkeypatch.setattr(api, "get_processing_job_output", lambda current, uid: None)
    with pytest.raises(Exception) as error:
        asyncio.run(api.processing_job_result(job_id, uid="verified-user"))
    assert getattr(error.value, "status_code", None) == 410
    assert settled == [("verified-user", job_id, True)]
