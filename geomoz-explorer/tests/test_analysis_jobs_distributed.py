"""Tests for the distributed GeoMoz Analysis Engine V2."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def clean_jobs(monkeypatch: pytest.MonkeyPatch):
    import analysis_jobs

    with analysis_jobs._jobs_lock:
        analysis_jobs._jobs.clear()
        analysis_jobs._futures.clear()
    monkeypatch.setattr(analysis_jobs, "_firestore", lambda: None)
    yield analysis_jobs
    with analysis_jobs._jobs_lock:
        analysis_jobs._jobs.clear()
        analysis_jobs._futures.clear()


def test_cloud_tasks_submit_does_not_run_in_api_process(
    clean_jobs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis_jobs = clean_jobs
    monkeypatch.setenv("ANALYSIS_EXECUTION_BACKEND", "cloud_tasks")
    monkeypatch.setattr(analysis_jobs, "_job_is_persisted", lambda uid, job_id: True)

    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(
        analysis_jobs,
        "_enqueue_cloud_task",
        lambda uid, job_id: (
            enqueued.append((uid, job_id))
            or f"queues/geomoz-analysis/tasks/job-{job_id}"
        ),
    )

    def must_not_run(progress):
        raise AssertionError("runner must execute on worker, not API process")

    job = analysis_jobs.submit_job(
        "uid-1",
        "gee.index",
        {"index": "ndvi"},
        must_not_run,
    )

    assert job["status"] == "queued"
    assert job["execution_mode"] == "cloud_tasks"
    assert job["attempt"] == 0
    assert len(enqueued) == 1
    assert enqueued[0][0] == "uid-1"
    assert analysis_jobs.active_job_count("uid-1") == 1


def test_execute_job_completes_persisted_cloud_job(
    clean_jobs,
) -> None:
    analysis_jobs = clean_jobs
    job = analysis_jobs.create_job(
        "uid-2",
        "gee.index",
        {"index": "ndvi"},
        execution_mode="cloud_tasks",
    )

    stages: list[str] = []

    def runner(progress):
        progress(30, "processing", "A processar.")
        stages.append("ran")
        return {"mean": 0.42}

    result = analysis_jobs.execute_job("uid-2", job["id"], runner)

    assert result is not None
    assert result["status"] == "completed"
    assert result["progress"] == 100
    assert result["attempt"] == 1
    assert result["result"] == {"mean": 0.42}
    assert stages == ["ran"]
    assert analysis_jobs.active_job_count("uid-2") == 0


def test_execute_job_requeues_retryable_failure(
    clean_jobs,
) -> None:
    analysis_jobs = clean_jobs
    job = analysis_jobs.create_job(
        "uid-3",
        "gee.index",
        {"index": "ndvi"},
        execution_mode="cloud_tasks",
    )

    def failing_runner(progress):
        raise RuntimeError("temporary Earth Engine failure")

    with pytest.raises(RuntimeError):
        analysis_jobs.execute_job(
            "uid-3",
            job["id"],
            failing_runner,
            retry_number=0,
            max_retries=2,
        )

    retrying = analysis_jobs.get_job("uid-3", job["id"])
    assert retrying is not None
    assert retrying["status"] == "queued"
    assert retrying["stage"] == "retrying"
    assert retrying["attempt"] == 1

    failed = analysis_jobs.execute_job(
        "uid-3",
        job["id"],
        failing_runner,
        retry_number=2,
        max_retries=2,
    )
    assert failed is not None
    assert failed["status"] == "failed"
    assert failed["attempt"] == 2


def test_cancelled_cloud_job_is_not_executed(
    clean_jobs,
) -> None:
    analysis_jobs = clean_jobs
    job = analysis_jobs.create_job(
        "uid-4",
        "gee.index",
        {"index": "ndvi"},
        execution_mode="cloud_tasks",
    )
    analysis_jobs.cancel_job("uid-4", job["id"])

    called = False

    def runner(progress):
        nonlocal called
        called = True
        return {}

    result = analysis_jobs.execute_job("uid-4", job["id"], runner)

    assert result is not None
    assert result["status"] == "cancelled"
    assert called is False


def test_internal_worker_endpoint_hidden_on_public_api(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEOMOZ_SERVICE_ROLE", "api")

    resp = client.post(
        "/geomoz-api/internal/analysis/run",
        json={"uid": "uid-5", "job_id": "job-5"},
    )

    assert resp.status_code == 404


def test_internal_worker_executes_persisted_job(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import analysis_jobs

    monkeypatch.setenv("GEOMOZ_SERVICE_ROLE", "analysis-worker")
    monkeypatch.setenv("ANALYSIS_TASK_MAX_RETRIES", "2")
    monkeypatch.setattr(
        analysis_jobs,
        "get_job",
        lambda uid, job_id: {
            "id": job_id,
            "type": "gee.index",
            "project_id": None,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "message": "queued",
            "payload": {"index": "ndvi"},
            "result": None,
            "error": None,
            "created_at": "2026-09-28T00:00:00+00:00",
            "updated_at": "2026-09-28T00:00:00+00:00",
            "started_at": None,
            "completed_at": None,
            "execution_mode": "cloud_tasks",
            "attempt": 0,
        },
    )

    captured: dict[str, int] = {}

    def fake_execute(
        uid,
        job_id,
        runner,
        *,
        retry_number=0,
        max_retries=0,
    ):
        captured["retry_number"] = retry_number
        captured["max_retries"] = max_retries
        return {
            "id": job_id,
            "type": "gee.index",
            "status": "completed",
            "progress": 100,
            "attempt": 1,
        }

    monkeypatch.setattr(analysis_jobs, "execute_job", fake_execute)

    resp = client.post(
        "/geomoz-api/internal/analysis/run",
        headers={"X-CloudTasks-TaskRetryCount": "1"},
        json={"uid": "uid-5", "job_id": "job-5"},
    )

    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert captured == {"retry_number": 1, "max_retries": 2}


def test_analysis_engine_status_reports_distributed_backend(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import analysis_jobs

    monkeypatch.setenv("ANALYSIS_EXECUTION_BACKEND", "cloud_tasks")
    monkeypatch.setattr(analysis_jobs, "active_job_count", lambda uid=None: 2)
    monkeypatch.setattr(
        analysis_jobs,
        "_cloud_tasks_config",
        lambda: {
            "project": "test-project",
            "location": "europe-west1",
            "queue": "geomoz-analysis",
            "worker_url": "https://worker.run.app",
            "service_account": "worker@test-project.iam.gserviceaccount.com",
            "audience": "https://worker.run.app",
        },
    )

    resp = client.get("/geomoz-api/analysis-engine/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "cloud_tasks"
    assert data["distributed"] is True
    assert data["configured"] is True
    assert data["queue"] == "geomoz-analysis"
    assert data["active_jobs"] == 2



def test_cloud_run_jobs_submit_dispatches_isolated_execution(
    clean_jobs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis_jobs = clean_jobs
    monkeypatch.setenv("ANALYSIS_EXECUTION_BACKEND", "cloud_run_jobs")
    monkeypatch.setattr(
        analysis_jobs,
        "_job_is_persisted",
        lambda uid, job_id: True,
    )

    dispatched: list[tuple[str, str]] = []
    monkeypatch.setattr(
        analysis_jobs,
        "_enqueue_cloud_run_job",
        lambda uid, job_id: (
            dispatched.append((uid, job_id))
            or "operations/analysis-execution"
        ),
    )

    def must_not_run(progress):
        raise AssertionError("runner must not execute inside the API process")

    job = analysis_jobs.submit_job(
        "uid-run-job",
        "gee.index",
        {"index": "ndvi"},
        must_not_run,
    )

    assert job["status"] == "queued"
    assert job["execution_mode"] == "cloud_run_jobs"
    assert job["attempt"] == 0
    assert dispatched == [("uid-run-job", job["id"])]


def test_distributed_backend_falls_back_when_job_is_not_persisted(
    clean_jobs,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis_jobs = clean_jobs
    monkeypatch.setenv("ANALYSIS_EXECUTION_BACKEND", "cloud_run_jobs")
    monkeypatch.setattr(
        analysis_jobs,
        "_job_is_persisted",
        lambda uid, job_id: False,
    )

    completed = []

    def runner(progress):
        completed.append(True)
        return {"ok": True}

    job = analysis_jobs.submit_job(
        "uid-fallback",
        "gee.index",
        {"index": "ndvi"},
        runner,
    )

    future = analysis_jobs._futures[("uid-fallback", job["id"])]
    future.result(timeout=2)
    result = analysis_jobs.get_job("uid-fallback", job["id"])

    assert result is not None
    assert result["execution_mode"] == "local_executor"
    assert result["status"] == "completed"
    assert completed == [True]


def test_cloud_run_jobs_status_is_distributed(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import analysis_jobs

    monkeypatch.setenv("ANALYSIS_EXECUTION_BACKEND", "cloud_run_jobs")
    monkeypatch.setattr(analysis_jobs, "active_job_count", lambda uid=None: 1)
    monkeypatch.setattr(
        analysis_jobs,
        "_cloud_run_job_config",
        lambda: {
            "project": "test-project",
            "location": "europe-west1",
            "job_name": "geomoz-analysis-job",
        },
    )

    resp = client.get("/geomoz-api/analysis-engine/status")

    assert resp.status_code == 200
    data = resp.json()
    assert data["backend"] == "cloud_run_jobs"
    assert data["distributed"] is True
    assert data["configured"] is True
    assert data["job_name"] == "geomoz-analysis-job"
    assert data["active_jobs"] == 1


def test_cloud_run_job_worker_passes_task_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import analysis_job_worker
    import analysis_jobs
    import api

    monkeypatch.setenv("GEOMOZ_JOB_UID", "uid-worker")
    monkeypatch.setenv("GEOMOZ_JOB_ID", "job-worker")
    monkeypatch.setenv("CLOUD_RUN_TASK_ATTEMPT", "1")
    monkeypatch.setenv("ANALYSIS_RUN_JOB_MAX_RETRIES", "2")

    monkeypatch.setattr(
        analysis_jobs,
        "get_job",
        lambda uid, job_id: {
            "id": job_id,
            "type": "gee.index",
            "status": "queued",
            "payload": {"index": "ndvi"},
        },
    )
    monkeypatch.setattr(
        api,
        "_prepare_analysis_runner",
        lambda uid, job_type, payload: (payload, lambda progress: {"ok": True}),
    )

    captured = {}

    def fake_execute(uid, job_id, runner, *, retry_number=0, max_retries=0):
        captured.update({
            "uid": uid,
            "job_id": job_id,
            "retry_number": retry_number,
            "max_retries": max_retries,
        })
        return {"status": "completed", "attempt": 2}

    monkeypatch.setattr(analysis_jobs, "execute_job", fake_execute)

    assert analysis_job_worker.run_once() == 0
    assert captured == {
        "uid": "uid-worker",
        "job_id": "job-worker",
        "retry_number": 1,
        "max_retries": 2,
    }
