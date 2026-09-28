"""Contract tests for GeoMoz persistent Projects API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestProjectsAPI:
    def test_project_name_is_required(self) -> None:
        from api import ProjectCreateRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ProjectCreateRequest(name="   ")

    def test_create_project_returns_201(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "create_project",
            lambda uid, name, description="", aoi=None, map_state=None, solution_id=None: {
                "id": "project-1",
                "name": name,
                "description": description,
                "solution_id": solution_id,
                "aoi": aoi,
                "map_state": map_state or {},
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
            },
        )

        resp = client.post(
            "/geomoz-api/projects",
            json={
                "name": "Quelimane Flood Study",
                "description": "Teste",
                "solution_id": "hazards",
                "aoi": {
                    "source": "mozambique",
                    "province": "Zambézia",
                    "district": None,
                    "geometry": None,
                    "label": "Zambézia (Moçambique)",
                },
                "map_state": {"center": [-17.8, 36.9], "zoom": 8},
            },
        )

        assert resp.status_code == 201
        assert resp.json()["id"] == "project-1"
        assert resp.json()["name"] == "Quelimane Flood Study"
        assert resp.json()["solution_id"] == "hazards"

    def test_unknown_solution_starter_is_rejected(
        self, client: TestClient,
    ) -> None:
        resp = client.post(
            "/geomoz-api/projects",
            json={
                "name": "Invalid Starter",
                "solution_id": "not-a-solution",
            },
        )

        assert resp.status_code == 422

    def test_list_projects_is_user_scoped(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store

        monkeypatch.setattr(
            projects_store,
            "list_projects",
            lambda uid, limit=100: [{
                "id": "project-1",
                "name": "Boane Groundwater",
                "description": "",
                "aoi": None,
                "map_state": {},
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T00:00:00+00:00",
            }],
        )

        resp = client.get("/geomoz-api/projects")
        assert resp.status_code == 200
        assert len(resp.json()["projects"]) == 1

    def test_get_missing_project_returns_404(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store
        monkeypatch.setattr(projects_store, "get_project", lambda uid, project_id: None)

        resp = client.get("/geomoz-api/projects/missing")
        assert resp.status_code == 404

    def test_patch_project_updates_workspace(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store

        def fake_update(uid, project_id, **kwargs):
            return {
                "id": project_id,
                "name": "Projecto actualizado",
                "description": "",
                "aoi": kwargs.get("aoi"),
                "map_state": kwargs.get("map_state") or {},
                "created_at": "2026-09-28T00:00:00+00:00",
                "updated_at": "2026-09-28T01:00:00+00:00",
            }

        monkeypatch.setattr(projects_store, "update_project", fake_update)

        resp = client.patch(
            "/geomoz-api/projects/project-1",
            json={"map_state": {"center": [-18, 35], "zoom": 7}},
        )

        assert resp.status_code == 200
        assert resp.json()["map_state"]["zoom"] == 7

    def test_delete_missing_project_returns_404(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import projects_store
        monkeypatch.setattr(projects_store, "delete_project", lambda uid, project_id: False)

        resp = client.delete("/geomoz-api/projects/missing")
        assert resp.status_code == 404
