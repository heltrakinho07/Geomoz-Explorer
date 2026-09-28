"""Tests for the deterministic GeoMoz AI tool registry."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestToolRegistry:
    def test_registry_exposes_only_validated_job_tools(self) -> None:
        from tool_registry import list_tools, registry_summary

        tools = list_tools()
        summary = registry_summary()

        assert summary["execution_model"] == "validated_tools_only"
        assert summary["arbitrary_code_execution"] is False
        assert summary["count"] == len(tools)
        assert len(tools) >= 6
        assert all(tool["execution"] == "analysis_job" for tool in tools)
        assert all(tool["job_type"].startswith("gee.") for tool in tools)

    def test_registry_can_filter_by_category(self) -> None:
        from tool_registry import list_tools

        hazard_tools = list_tools(category="hazards")

        assert hazard_tools
        assert all(tool["category"] == "hazards" for tool in hazard_tools)

    def test_unknown_tool_returns_none(self) -> None:
        from tool_registry import get_tool, resolve_job_type

        assert get_tool("does-not-exist") is None
        assert resolve_job_type("does-not-exist") is None


class TestToolRegistryAPI:
    def test_list_tools_endpoint(self, client: TestClient) -> None:
        resp = client.get("/geomoz-api/ai/tools")

        assert resp.status_code == 200
        data = resp.json()
        assert "tools" in data
        assert "registry" in data
        assert data["registry"]["arbitrary_code_execution"] is False

    def test_get_unknown_tool_returns_404(self, client: TestClient) -> None:
        resp = client.get("/geomoz-api/ai/tools/not-real")

        assert resp.status_code == 404

    def test_execute_tool_routes_to_analysis_job(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import api

        captured = {}

        async def fake_create_analysis_job(req, uid):
            captured["uid"] = uid
            captured["type"] = req.type
            captured["payload"] = req.payload
            captured["project_id"] = req.project_id
            return {
                "id": "tool-job-1",
                "type": req.type,
                "project_id": req.project_id,
                "status": "queued",
                "stage": "queued",
                "progress": 0,
                "message": "queued",
                "payload": req.payload,
                "result": None,
                "error": None,
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "execution_mode": "local_executor",
            }

        monkeypatch.setattr(api, "create_analysis_job", fake_create_analysis_job)

        resp = client.post(
            "/geomoz-api/ai/tools/calculate_index/execute",
            json={
                "project_id": "project-abc",
                "parameters": {
                    "index": "ndvi",
                    "province": "Tete",
                    "start_date": "2023-01-01",
                    "end_date": "2023-12-31",
                    "cloud_pct": 30,
                },
            },
        )

        assert resp.status_code == 202
        assert resp.json()["type"] == "gee.index"
        assert captured["uid"] == "test-uid-123"
        assert captured["project_id"] == "project-abc"
        assert captured["payload"]["index"] == "ndvi"

    def test_execute_unknown_tool_returns_404(self, client: TestClient) -> None:
        resp = client.post(
            "/geomoz-api/ai/tools/not-real/execute",
            json={"parameters": {}},
        )

        assert resp.status_code == 404
