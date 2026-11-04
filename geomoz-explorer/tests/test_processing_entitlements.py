"""Managed GDAL lifecycle callbacks: normal completion, cancellation, bad upload."""
from concurrent.futures import Future

import pytest

import processing_jobs


def _start(monkeypatch, tmp_path, job_id, callback):
    class FutureStub:
        def cancel(self):
            return True

        def done(self):
            return False

    monkeypatch.setattr(processing_jobs, "JOB_ROOT", tmp_path)
    monkeypatch.setattr(processing_jobs._executor, "submit", lambda *args, **kwargs: FutureStub())
    return processing_jobs.create_processing_job(
        uid="quota-user",
        tool="slope",
        input_name="dem.tif",
        input_bytes=b"II*\x00test-raster",
        operation_id=job_id,
        on_finished=callback,
    )


def test_cancel_releases_ledger_callback_once(monkeypatch, tmp_path):
    outcomes = []
    job_id = "1" * 32
    job = _start(monkeypatch, tmp_path, job_id, lambda success: outcomes.append(success))
    assert job.id == job_id
    assert processing_jobs.delete_processing_job(job_id, "quota-user")
    assert outcomes == [False]
    assert not processing_jobs.delete_processing_job(job_id, "quota-user")


def test_completed_job_settles_once(monkeypatch, tmp_path):
    outcomes = []
    job_id = "2" * 32
    _start(monkeypatch, tmp_path, job_id, lambda success: outcomes.append(success))
    processing_jobs._set_job(job_id, status="completed")
    assert processing_jobs.delete_processing_job(job_id, "quota-user")
    assert outcomes == [True]


def test_malformed_upload_never_leaks_callback(monkeypatch, tmp_path):
    outcomes = []
    job_id = "3" * 32
    monkeypatch.setattr(processing_jobs, "JOB_ROOT", tmp_path)
    with pytest.raises(ValueError):
        processing_jobs.create_processing_job(
            uid="quota-user", tool="slope", input_name="dem.tif",
            input_bytes=b"not-a-tiff", operation_id=job_id,
            on_finished=lambda success: outcomes.append(success),
        )
    assert job_id not in processing_jobs._on_finish
    assert job_id not in processing_jobs._jobs
    assert outcomes == []


def test_invalid_operation_id_is_rejected_before_file_allocation(monkeypatch, tmp_path):
    monkeypatch.setattr(processing_jobs, "JOB_ROOT", tmp_path)
    with pytest.raises(ValueError):
        processing_jobs.create_processing_job(
            uid="quota-user", tool="slope", input_name="dem.tif",
            input_bytes=b"II*\x00test", operation_id="../../unexpected",
        )
