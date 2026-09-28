"""Tests for the GeoMoz natural-language agent planner and API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestAgentPlannerHelpers:
    def test_compact_explanation_removes_render_and_secret_fields(self) -> None:
        from ai_agent import _compact_for_explanation

        compact = _compact_for_explanation({
            "stats": {"mean": 0.42},
            "tileUrl": "https://example.invalid/private-tile",
            "geojson": {"type": "FeatureCollection"},
            "access_token": "secret",
        })

        assert compact["stats"]["mean"] == 0.42
        assert "tileUrl" not in compact
        assert "geojson" not in compact
        assert "access_token" not in compact

    def test_merge_geo_context_only_fills_missing_values(self) -> None:
        from ai_agent import merge_geo_context

        merged = merge_geo_context(
            {"province": "Tete", "index": "ndvi"},
            {
                "province": "Sofala",
                "district": "Dondo",
                "geometry": {"type": "Polygon", "coordinates": []},
            },
        )

        assert merged["province"] == "Tete"
        assert merged["district"] == "Dondo"
        assert merged["geometry"]["type"] == "Polygon"

    def test_extract_tool_call_rejects_unregistered_tool(self) -> None:
        from ai_agent import AgentPlannerError, _extract_tool_call

        with pytest.raises(AgentPlannerError):
            _extract_tool_call({
                "output": [{
                    "type": "function_call",
                    "name": "run_arbitrary_python",
                    "arguments": "{}",
                }]
            })

    def test_extract_registered_tool_call(self) -> None:
        from ai_agent import _extract_tool_call

        call = _extract_tool_call({
            "output": [{
                "type": "function_call",
                "name": "calculate_index",
                "arguments": '{"index":"ndvi"}',
                "call_id": "call-1",
            }]
        })

        assert call is not None
        assert call["tool_id"] == "calculate_index"
        assert call["arguments"]["index"] == "ndvi"

    def test_planner_status_without_key_is_safe(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from ai_agent import planner_status

        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        status = planner_status()

        assert status["configured"] is False
        assert status["arbitrary_code_execution"] is False
        assert status["max_tool_calls_per_turn"] == 1


class TestAgentAPI:
    def test_agent_status_does_not_expose_secret(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "super-secret-test-key")

        resp = client.get("/geomoz-api/ai/status")

        assert resp.status_code == 200
        text = resp.text
        assert "super-secret-test-key" not in text
        assert resp.json()["agent"]["configured"] is True

    def test_agent_message_response(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import ai_agent

        async def fake_plan(message, context):
            return {
                "mode": "message",
                "message": "Posso analisar NDVI, cheias, erosão e outras ferramentas registadas.",
                "model": "test-model",
                "response_id": "resp-1",
            }

        monkeypatch.setattr(ai_agent, "plan_agent_turn", fake_plan)

        resp = client.post(
            "/geomoz-api/ai/agent",
            json={"message": "O que podes fazer?"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "message"
        assert "NDVI" in data["message"]

    def test_agent_tool_call_executes_validated_tool(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import ai_agent
        import api

        async def fake_plan(message, context):
            return {
                "mode": "tool_call",
                "tool_id": "calculate_index",
                "arguments": {"index": "ndvi", "province": "Tete"},
                "model": "test-model",
                "response_id": "resp-2",
            }

        async def fake_execute(tool_id, req, uid):
            assert tool_id == "calculate_index"
            assert req.parameters["index"] == "ndvi"
            assert uid == "test-uid-123"
            return {
                "id": "agent-job-1",
                "type": "gee.index",
                "project_id": req.project_id,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": req.parameters,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            }

        monkeypatch.setattr(ai_agent, "plan_agent_turn", fake_plan)
        monkeypatch.setattr(api, "execute_ai_tool", fake_execute)

        resp = client.post(
            "/geomoz-api/ai/agent",
            json={
                "message": "Calcula NDVI em Tete",
                "context": {"province": "Tete"},
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "tool_call"
        assert data["tool"]["id"] == "calculate_index"
        assert data["job"]["status"] == "queued"

    def test_agent_rejects_unknown_project(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store

        monkeypatch.setattr(projects_store, "get_project", lambda uid, project_id: None)

        resp = client.post(
            "/geomoz-api/ai/agent",
            json={
                "message": "Calcula NDVI",
                "project_id": "missing-project",
            },
        )

        assert resp.status_code == 404

    def test_agent_message_validation(self, client: TestClient) -> None:
        resp = client.post("/geomoz-api/ai/agent", json={"message": "   "})

        assert resp.status_code == 422



class TestAgentExplanationAPI:
    def test_explain_completed_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs
        import ai_agent

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "type": "gee.index",
                "status": "completed",
                "payload": {"index": "ndvi"},
                "result": {"name": "NDVI", "stats": {"mean": 0.42}},
                "completed_at": "2026-09-28T00:01:00+00:00",
            },
        )

        async def fake_explain(job):
            return {
                "explanation": "Resultado: NDVI médio 0,42. Interpretação: indicador de vegetação. Limitações: requer validação de campo.",
                "model": "test-model",
                "response_id": "resp-explain-1",
            }

        monkeypatch.setattr(ai_agent, "explain_job_result", fake_explain)

        resp = client.post("/geomoz-api/ai/jobs/job-1/explain")

        assert resp.status_code == 200
        assert "0,42" in resp.json()["explanation"]

    def test_explain_requires_completed_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import analysis_jobs

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "type": "gee.index",
                "status": "processing",
                "payload": {"index": "ndvi"},
                "result": None,
            },
        )

        resp = client.post("/geomoz-api/ai/jobs/job-running/explain")

        assert resp.status_code == 409
