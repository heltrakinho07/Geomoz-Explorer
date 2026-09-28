"""Tests for persistent GeoMoz project outputs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestProjectOutputStore:
    def test_create_output_is_idempotent_for_same_source(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import project_outputs

        monkeypatch.setattr(project_outputs, "_firestore", lambda: None)
        project_outputs._outputs.clear()

        first = project_outputs.create_output(
            "uid-1",
            project_id="project-1",
            output_type="analysis_report",
            title="NDVI",
            source_type="analysis_job",
            source_id="job-1",
            content={"value": 1},
        )
        second = project_outputs.create_output(
            "uid-1",
            project_id="project-1",
            output_type="analysis_report",
            title="NDVI duplicado",
            source_type="analysis_job",
            source_id="job-1",
            content={"value": 2},
        )

        assert second["id"] == first["id"]
        assert len(project_outputs.list_outputs("uid-1", project_id="project-1")) == 1

    def test_compact_evidence_removes_ephemeral_and_sensitive_fields(self) -> None:
        from project_outputs import compact_evidence

        compact = compact_evidence({
            "mean": 0.42,
            "tileUrl": "https://tiles.example.invalid/x",
            "tile": "https://tiles.example.invalid/y",
            "floodTile": "https://tiles.example.invalid/flood",
            "permWaterTile": "https://tiles.example.invalid/water",
            "access_token": "secret",
            "geojson": {"type": "FeatureCollection"},
            "nested": {
                "coordinates": [1, 2, 3],
                "score": 0.81,
            },
        })

        assert compact["mean"] == 0.42
        assert "tileUrl" not in compact
        assert "tile" not in compact
        assert "floodTile" not in compact
        assert "permWaterTile" not in compact
        assert "access_token" not in compact
        assert "geojson" not in compact
        assert "coordinates" not in compact["nested"]
        assert compact["nested"]["score"] == 0.81


class TestProjectOutputsAPI:
    def test_create_output_from_completed_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import project_outputs
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "get_project",
            lambda uid, project_id: {
                "id": project_id,
                "name": "Projecto Teste",
            },
        )
        monkeypatch.setattr(
            projects_store,
            "touch_project",
            lambda uid, project_id: {
                "id": project_id,
                "name": "Projecto Teste",
            },
        )
        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "project_id": "project-1",
                "type": "gee.index",
                "status": "completed",
                "payload": {"index": "ndvi"},
                "result": {
                    "name": "NDVI",
                    "stats": {"mean": 0.42},
                    "tileUrl": "https://tiles.example.invalid/private",
                },
                "created_at": "2026-09-28T00:00:00+00:00",
                "started_at": "2026-09-28T00:00:01+00:00",
                "completed_at": "2026-09-28T00:00:05+00:00",
                "execution_mode": "local_executor",
            },
        )

        captured = {}

        def fake_create_output(uid, **kwargs):
            captured.update(kwargs)
            return {
                "id": "output-1",
                "owner_id": uid,
                "project_id": kwargs["project_id"],
                "type": kwargs["output_type"],
                "title": kwargs["title"],
                "description": kwargs["description"],
                "source_type": kwargs["source_type"],
                "source_id": kwargs["source_id"],
                "content": kwargs["content"],
                "created_at": "2026-09-28T00:01:00+00:00",
                "updated_at": "2026-09-28T00:01:00+00:00",
            }

        monkeypatch.setattr(project_outputs, "create_output", fake_create_output)

        resp = client.post(
            "/geomoz-api/projects/project-1/outputs/from-job/job-1",
            json={
                "title": "Relatório NDVI",
                "explanation": "Resultado interpretado.",
            },
        )

        assert resp.status_code == 201
        assert resp.json()["type"] == "analysis_report"
        assert captured["source_type"] == "analysis_job"
        assert captured["source_id"] == "job-1"
        assert captured["content"]["result"]["stats"]["mean"] == 0.42
        assert "tileUrl" not in captured["content"]["result"]
        assert captured["content"]["explanation"] == "Resultado interpretado."

    def test_create_output_requires_completed_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "get_project",
            lambda uid, project_id: {"id": project_id},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "project_id": "project-1",
                "type": "gee.index",
                "status": "processing",
            },
        )

        resp = client.post(
            "/geomoz-api/projects/project-1/outputs/from-job/job-running",
            json={},
        )

        assert resp.status_code == 409

    def test_create_output_rejects_job_from_other_project(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "get_project",
            lambda uid, project_id: {"id": project_id},
        )
        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "project_id": "other-project",
                "type": "gee.index",
                "status": "completed",
                "payload": {},
                "result": {},
            },
        )

        resp = client.post(
            "/geomoz-api/projects/project-1/outputs/from-job/job-1",
            json={},
        )

        assert resp.status_code == 409

    def test_create_output_from_completed_plan(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import analysis_jobs
        import project_outputs
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "get_project",
            lambda uid, project_id: {"id": project_id, "name": "Projecto"},
        )
        monkeypatch.setattr(
            projects_store,
            "touch_project",
            lambda uid, project_id: {"id": project_id},
        )
        monkeypatch.setattr(
            agent_plans,
            "get_plan",
            lambda uid, plan_id: {
                "id": plan_id,
                "project_id": "project-1",
                "title": "Plano Integrado",
                "goal": "Avaliar território",
                "status": "completed",
                "created_at": "2026-09-28T00:00:00+00:00",
                "completed_at": "2026-09-28T00:10:00+00:00",
                "steps": [{
                    "order": 1,
                    "tool_id": "calculate_index",
                    "tool_name": "Calcular índice geoespacial",
                    "purpose": "Avaliar vegetação",
                    "status": "completed",
                    "job_id": "job-1",
                    "arguments": {"index": "ndvi"},
                    "completed_at": "2026-09-28T00:05:00+00:00",
                }],
            },
        )
        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "status": "completed",
                "payload": {"index": "ndvi"},
                "result": {"stats": {"mean": 0.37}},
                "completed_at": "2026-09-28T00:05:00+00:00",
            },
        )

        captured = {}

        def fake_create_output(uid, **kwargs):
            captured.update(kwargs)
            return {
                "id": "output-plan-1",
                "owner_id": uid,
                "project_id": kwargs["project_id"],
                "type": kwargs["output_type"],
                "title": kwargs["title"],
                "description": kwargs["description"],
                "source_type": kwargs["source_type"],
                "source_id": kwargs["source_id"],
                "content": kwargs["content"],
                "created_at": "2026-09-28T00:11:00+00:00",
                "updated_at": "2026-09-28T00:11:00+00:00",
            }

        monkeypatch.setattr(project_outputs, "create_output", fake_create_output)

        resp = client.post(
            "/geomoz-api/projects/project-1/outputs/from-plan/plan-1",
            json={"explanation": "Síntese integrada."},
        )

        assert resp.status_code == 201
        assert resp.json()["type"] == "plan_report"
        assert captured["source_type"] == "analysis_plan"
        assert captured["content"]["analyses"][0]["result"]["stats"]["mean"] == 0.37
        assert captured["content"]["explanation"] == "Síntese integrada."

    def test_list_outputs_requires_project_ownership(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store

        monkeypatch.setattr(projects_store, "get_project", lambda uid, project_id: None)

        resp = client.get("/geomoz-api/projects/missing/outputs")

        assert resp.status_code == 404
