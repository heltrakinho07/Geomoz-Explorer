"""Contract tests for the GeoMoz asynchronous analysis-job API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestAnalysisJobAPI:
    def test_create_gee_index_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "job-123",
                "type": job_type,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.index",
                "payload": {
                    "index": "ndvi",
                    "province": "Tete",
                    "start_date": "2023-01-01",
                    "end_date": "2023-12-31",
                    "cloud_pct": 30,
                },
            },
        )

        assert resp.status_code == 202
        assert resp.json()["status"] == "queued"

    def test_create_job_requires_gee_connection(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_session_store
        monkeypatch.setattr(gee_session_store, "get_token", lambda uid: None)

        resp = client.post(
            "/geomoz-api/jobs",
            json={"type": "gee.index", "payload": {"index": "ndvi"}},
        )
        assert resp.status_code == 409

    def test_create_job_rejects_unknown_type(self, client: TestClient) -> None:
        resp = client.post(
            "/geomoz-api/jobs",
            json={"type": "unknown.analysis", "payload": {}},
        )
        assert resp.status_code == 400

    def test_missing_job_returns_404(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        monkeypatch.setattr(analysis_jobs, "get_job", lambda uid, job_id: None)

        resp = client.get("/geomoz-api/jobs/missing")
        assert resp.status_code == 404

    def test_create_flood_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "flood-job-1",
                "type": job_type,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.flood",
                "payload": {
                    "province": "Sofala",
                    "event_start": "2019-03-15",
                    "event_end": "2019-03-25",
                },
            },
        )

        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.flood"

    def test_create_groundwater_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "groundwater-job-1",
                "type": job_type,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.groundwater",
                "payload": {"province": "Maputo", "year": 2023},
            },
        )

        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.groundwater"

    def test_create_erosion_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "erosion-job-1",
                "type": job_type,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.erosion",
                "payload": {"province": "Manica", "year": 2023},
            },
        )

        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.erosion"

    def test_create_targeting_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "targeting-job-1", "type": job_type, "status": "queued",
                "stage": "queued", "progress": 0, "message": "queued",
                "payload": payload, "result": None, "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None, "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.targeting",
                "payload": {
                    "mineral": "gold", "province": "Tete",
                    "start_date": "2023-01-01", "end_date": "2023-12-31",
                    "cloud_pct": 30, "score_threshold": 0.7,
                },
            },
        )
        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.targeting"

    def test_create_watershed_job_returns_202(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store, "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs, "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                "id": "watershed-job-1", "type": job_type, "status": "queued",
                "stage": "queued", "progress": 0, "message": "queued",
                "payload": payload, "result": None, "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None, "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.watershed",
                "payload": {"lat": -17.8, "lon": 35.1, "level": 10, "max_iter": 60},
            },
        )
        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.watershed"


    def test_job_can_be_associated_with_owned_project(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store
        import projects_store

        monkeypatch.setattr(
            gee_session_store, "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            projects_store, "get_project",
            lambda uid, project_id: {"id": project_id, "name": "Projecto Teste"},
        )

        captured = {}

        def fake_submit(uid, job_type, payload, runner, project_id=None):
            captured["project_id"] = project_id
            return {
                "id": "job-project-1",
                "type": job_type,
                "project_id": project_id,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            }

        monkeypatch.setattr(analysis_jobs, "submit_job", fake_submit)

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.index",
                "project_id": "project-123",
                "payload": {"index": "ndvi"},
            },
        )

        assert resp.status_code == 202
        assert captured["project_id"] == "project-123"
        assert resp.json()["project_id"] == "project-123"

    def test_job_rejects_unknown_project(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_session_store
        import projects_store

        monkeypatch.setattr(
            gee_session_store, "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(projects_store, "get_project", lambda uid, project_id: None)

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.index",
                "project_id": "missing-project",
                "payload": {"index": "ndvi"},
            },
        )

        assert resp.status_code == 404


class TestAnalysisJobCancellation:
    def test_cancel_job_endpoint(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs

        monkeypatch.setattr(
            analysis_jobs,
            "cancel_job",
            lambda uid, job_id: {
                "id": job_id,
                "type": "gee.index",
                "project_id": None,
                "status": "cancelled",
                "stage": "cancelled",
                "progress": 25,
                "message": "Análise cancelada pelo utilizador.",
                "payload": {"index": "ndvi"},
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:05+00:00",
                "started_at": "2026-09-28T00:00:01+00:00",
                "completed_at": "2026-09-28T00:00:05+00:00",
                "execution_mode": "local_executor",
            },
        )

        resp = client.post("/geomoz-api/jobs/job-cancel-1/cancel")

        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

    def test_cancel_missing_job_returns_404(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        monkeypatch.setattr(analysis_jobs, "cancel_job", lambda uid, job_id: None)

        resp = client.post("/geomoz-api/jobs/missing/cancel")

        assert resp.status_code == 404

    def test_cancel_job_marks_active_job_cancelled(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs

        monkeypatch.setattr(analysis_jobs, "_firestore", lambda: None)
        uid = "cancel-unit-user"
        job = analysis_jobs.create_job(uid, "gee.index", {"index": "ndvi"})

        cancelled = analysis_jobs.cancel_job(uid, job["id"])

        assert cancelled is not None
        assert cancelled["status"] == "cancelled"
        assert cancelled["stage"] == "cancelled"
        assert cancelled["completed_at"] is not None


class TestAnalysisJobRetry:
    def test_retry_job_endpoint(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import gee_session_store

        previous = {
            "id": "failed-job-1",
            "type": "gee.index",
            "project_id": None,
            "status": "failed",
            "stage": "failed",
            "progress": 45,
            "message": "falhou",
            "payload": {"index": "ndvi"},
            "result": None,
            "error": {"message": "temporary"},
            "created_at": "2026-09-28T00:00:00+00:00",
            "updated_at": "2026-09-28T00:00:05+00:00",
            "started_at": "2026-09-28T00:00:01+00:00",
            "completed_at": "2026-09-28T00:00:05+00:00",
            "execution_mode": "local_executor",
        }
        monkeypatch.setattr(analysis_jobs, "get_job", lambda uid, job_id: previous)
        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "submit_job",
            lambda uid, job_type, payload, runner, project_id=None: {
                **previous,
                "id": "retry-job-2",
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "payload": payload,
                "error": None,
                "completed_at": None,
            },
        )

        resp = client.post("/geomoz-api/jobs/failed-job-1/retry")

        assert resp.status_code == 202
        assert resp.json()["id"] == "retry-job-2"
        assert resp.json()["status"] == "queued"
        assert resp.json()["payload"]["index"] == "ndvi"

    def test_retry_active_job_returns_409(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "type": "gee.index",
                "project_id": None,
                "status": "processing",
                "stage": "processing",
                "progress": 50,
                "message": "running",
                "payload": {"index": "ndvi"},
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:02+00:00",
                "started_at": "2026-09-28T00:00:01+00:00",
                "completed_at": None,
                "execution_mode": "local_executor",
            },
        )

        resp = client.post("/geomoz-api/jobs/running-job/retry")

        assert resp.status_code == 409



class TestAnalysisJobCatalogValidation:
    def test_create_index_job_rejects_unknown_index(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-token", "project": "test-project"},
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={"type": "gee.index", "payload": {"index": "not-a-real-index"}},
        )

        assert resp.status_code == 422

    def test_create_targeting_job_rejects_unknown_mineral(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import gee_session_store

        monkeypatch.setattr(
            gee_session_store,
            "get_token",
            lambda uid: {"access_token": "mock-token", "project": "test-project"},
        )

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.targeting",
                "payload": {"mineral": "unobtainium"},
            },
        )

        assert resp.status_code == 422



class TestAnalysisJobCapacity:
    def test_create_job_rejects_when_user_queue_is_full(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs

        monkeypatch.setattr(analysis_jobs, "active_job_count", lambda uid=None: 5)
        monkeypatch.setenv("ANALYSIS_MAX_ACTIVE_PER_USER", "5")

        resp = client.post(
            "/geomoz-api/jobs",
            json={
                "type": "gee.index",
                "payload": {"index": "ndvi"},
            },
        )

        assert resp.status_code == 429
        assert "análises activas" in resp.json()["detail"]
