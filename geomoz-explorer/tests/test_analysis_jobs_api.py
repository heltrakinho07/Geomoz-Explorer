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
            lambda uid, job_type, payload, runner: {
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
            lambda uid, job_type, payload, runner: {
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
            lambda uid, job_type, payload, runner: {
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
            lambda uid, job_type, payload, runner: {
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
            lambda uid, job_type, payload, runner: {
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
\n    def test_create_watershed_job_returns_202(\n        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,\n    ) -> None:\n        import analysis_jobs\n        import gee_session_store\n\n        monkeypatch.setattr(\n            gee_session_store, "get_token",\n            lambda uid: {"access_token": "mock-oauth-token", "project": "test-project"},\n        )\n        monkeypatch.setattr(\n            analysis_jobs, "submit_job",\n            lambda uid, job_type, payload, runner: {\n                "id": "watershed-job-1", "type": job_type, "status": "queued",\n                "stage": "queued", "progress": 0, "message": "queued",\n                "payload": payload, "result": None, "error": None,\n                "created_at": "2026-09-28T00:00:00+00:00",\n                "updated_at": "2026-09-28T00:00:00+00:00",\n                "started_at": None, "completed_at": None,\n                "execution_mode": "local_executor",\n            },\n        )\n\n        resp = client.post(\n            "/geomoz-api/jobs",\n            json={\n                "type": "gee.watershed",\n                "payload": {"lat": -17.8, "lon": 35.1, "level": 10, "max_iter": 60},\n            },\n        )\n        assert resp.status_code == 202\n        assert resp.json()["type"] == "gee.watershed"\n