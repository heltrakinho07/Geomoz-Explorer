"""Contract tests for GeoMoz Agent multi-step plans."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _local_plan_store(monkeypatch: pytest.MonkeyPatch):
    import agent_plans
    monkeypatch.setattr(agent_plans, "_firestore", lambda: None)
    agent_plans._plans.clear()
    yield
    agent_plans._plans.clear()


class TestAgentPlanStore:
    def test_rejects_unknown_tool(self) -> None:
        import agent_plans

        with pytest.raises(ValueError):
            agent_plans.create_plan(
                "uid-1",
                title="Plano inválido",
                goal="Teste",
                steps=[{
                    "tool_id": "arbitrary_python",
                    "purpose": "Não permitido",
                    "arguments": {},
                }],
            )

    def test_creates_auditable_plan(self) -> None:
        import agent_plans

        plan = agent_plans.create_plan(
            "uid-1",
            title="Água e erosão",
            goal="Comparar dois indicadores",
            steps=[
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Mapear potencial hídrico",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Mapear risco de erosão",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )

        assert plan["status"] == "ready"
        assert len(plan["steps"]) == 2
        assert plan["steps"][0]["status"] == "pending"
        assert plan["steps"][1]["tool_id"] == "calculate_erosion_risk"


class TestAgentPlanAPI:
    def test_advance_starts_first_step(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import api

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano teste",
            goal="Executar duas análises",
            steps=[
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Potencial hídrico",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Risco de erosão",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )

        async def fake_execute(tool_id, req, uid):
            return {
                "id": "job-1",
                "type": "gee.groundwater",
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

        monkeypatch.setattr(api, "execute_ai_tool", fake_execute)

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/advance")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert data["steps"][0]["job_id"] == "job-1"
        assert data["steps"][0]["status"] == "queued"

    def test_completed_step_releases_next_step(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import analysis_jobs
        import api

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano teste",
            goal="Executar duas análises",
            steps=[
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Potencial hídrico",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Risco de erosão",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 0,
            status="processing", job_id="job-1", started_at="start",
        )
        agent_plans.update_plan(
            "test-uid-123", plan["id"], status="running", started_at="start",
        )

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "status": "completed",
                "message": "done",
                "error": None,
                "completed_at": "2026-09-28T00:02:00+00:00",
            },
        )

        async def fake_execute(tool_id, req, uid):
            assert tool_id == "calculate_erosion_risk"
            return {
                "id": "job-2",
                "type": "gee.erosion",
                "project_id": req.project_id,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": req.parameters,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:02:01+00:00",
                "updated_at": "2026-09-28T00:02:01+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            }

        monkeypatch.setattr(api, "execute_ai_tool", fake_execute)

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/advance")

        assert resp.status_code == 200
        data = resp.json()
        assert data["current_step"] == 1
        assert data["steps"][0]["status"] == "completed"
        assert data["steps"][1]["job_id"] == "job-2"
        assert data["steps"][1]["status"] == "queued"

    def test_failed_child_blocks_plan(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import analysis_jobs

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano teste",
            goal="Teste de falha",
            steps=[
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Risco",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Água",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 0,
            status="processing", job_id="job-fail",
        )
        agent_plans.update_plan("test-uid-123", plan["id"], status="running")

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "status": "failed",
                "message": "GEE indisponível",
                "error": {"message": "GEE indisponível"},
                "completed_at": "2026-09-28T00:03:00+00:00",
            },
        )

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/advance")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        assert data["current_step"] == 0
        assert data["steps"][1]["status"] == "pending"

    def test_cancel_plan_cancels_active_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import analysis_jobs

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano teste",
            goal="Cancelar",
            steps=[
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Risco",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Água",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 0,
            status="processing", job_id="job-active",
        )
        agent_plans.update_plan("test-uid-123", plan["id"], status="running")

        captured = {}
        monkeypatch.setattr(
            analysis_jobs,
            "cancel_job",
            lambda uid, job_id: captured.update({"uid": uid, "job_id": job_id}),
        )

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/cancel")

        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
        assert captured["job_id"] == "job-active"

    def test_retry_resets_current_failed_step(
        self, client: TestClient,
    ) -> None:
        import agent_plans

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano teste",
            goal="Retry",
            steps=[
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Risco",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Água",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 0,
            status="failed", job_id="job-fail",
        )
        agent_plans.update_plan(
            "test-uid-123", plan["id"], status="failed",
            error={"message": "temporary"},
        )

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/retry")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
        assert data["steps"][0]["status"] == "pending"
        assert data["steps"][0]["job_id"] is None



class TestAgentPlanExplanationAPI:
    def test_explain_completed_plan(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import agent_plans
        import analysis_jobs
        import ai_agent

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano concluído",
            goal="Combinar água e erosão",
            steps=[
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Água",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Erosão",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 0,
            status="completed", job_id="job-water",
        )
        agent_plans.update_step(
            "test-uid-123", plan["id"], 1,
            status="completed", job_id="job-erosion",
        )
        agent_plans.update_plan(
            "test-uid-123", plan["id"], status="completed",
            completed_at="2026-09-28T00:05:00+00:00",
        )

        monkeypatch.setattr(
            analysis_jobs,
            "get_job",
            lambda uid, job_id: {
                "id": job_id,
                "type": "gee.groundwater" if job_id == "job-water" else "gee.erosion",
                "status": "completed",
                "payload": {"province": "Maputo", "year": 2024},
                "result": {"stats": {"mean": 0.5}},
                "completed_at": "2026-09-28T00:04:00+00:00",
            },
        )

        async def fake_explain(plan_arg, jobs):
            assert len(jobs) == 2
            return {
                "explanation": "Síntese integrada baseada em duas análises.",
                "model": "test-model",
                "response_id": "resp-plan-1",
                "analyses_used": 2,
            }

        monkeypatch.setattr(ai_agent, "explain_plan_result", fake_explain)

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/explain")

        assert resp.status_code == 200
        assert resp.json()["analyses_used"] == 2

    def test_explain_plan_requires_completion(
        self, client: TestClient,
    ) -> None:
        import agent_plans

        plan = agent_plans.create_plan(
            "test-uid-123",
            title="Plano activo",
            goal="Ainda em curso",
            steps=[
                {
                    "tool_id": "run_groundwater_ahp",
                    "purpose": "Água",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
                {
                    "tool_id": "calculate_erosion_risk",
                    "purpose": "Erosão",
                    "arguments": {"province": "Maputo", "year": 2024},
                },
            ],
        )

        resp = client.post(f"/geomoz-api/ai/plans/{plan['id']}/explain")

        assert resp.status_code == 409
