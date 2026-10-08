"""Tests for the heavy GIS processing job runtime and REST contract."""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError


@pytest.fixture(autouse=True)
def force_memory_job_store(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GIS_JOBS_FORCE_MEMORY", "true")
    import gis_processing_jobs as jobs

    with jobs._LOCK:
        jobs._MEMORY_JOBS.clear()
        jobs._MEMORY_RESULTS.clear()
        jobs._CANCEL_EVENTS.clear()
    yield
    with jobs._LOCK:
        jobs._MEMORY_JOBS.clear()
        jobs._MEMORY_RESULTS.clear()
        jobs._CANCEL_EVENTS.clear()


def _polygon_feature_collection() -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"group": "A"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [32.0, -26.0],
                            [32.2, -26.0],
                            [32.2, -25.8],
                            [32.0, -25.8],
                            [32.0, -26.0],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"group": "A"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [32.1, -25.9],
                            [32.3, -25.9],
                            [32.3, -25.7],
                            [32.1, -25.7],
                            [32.1, -25.9],
                        ]
                    ],
                },
            },
        ],
    }


class TestGISJobSecurity:
    def test_rejects_loopback_url(self) -> None:
        from gis_processing_jobs import GISJobSource

        with pytest.raises(ValidationError, match="rede privada|Hosts locais"):
            GISJobSource(kind="url", url="http://127.0.0.1/private.tif")

    def test_rejects_cross_project_storage_path(self) -> None:
        from gis_processing_jobs import _validate_storage_path

        with pytest.raises(ValueError, match="fora do projeto"):
            _validate_storage_path(
                "user-a",
                "project-a",
                "users/user-b/projects/project-b/rasters/secret.tif",
            )


class TestGISJobRuntime:
    def test_vector_dissolve_job_completes_and_returns_geojson(self) -> None:
        from gis_processing_jobs import (
            GISJobCreateRequest,
            GISJobSource,
            get_job,
            read_job_result,
            submit_job,
        )

        request = GISJobCreateRequest(
            project_id="project-a",
            tool="vector_dissolve",
            input=GISJobSource(
                kind="geojson",
                geojson=_polygon_feature_collection(),
                name="polygons.geojson",
            ),
            parameters={"property": "group"},
        )
        created = submit_job("user-a", request)
        assert created["status"] == "queued"

        deadline = time.time() + 8
        current = created
        while time.time() < deadline:
            current = get_job("user-a", "project-a", created["id"])
            if current and current["status"] in {
                "succeeded",
                "failed",
                "cancelled",
                "stale",
            }:
                break
            time.sleep(0.05)

        assert current is not None
        assert current["status"] == "succeeded", current.get("error")
        assert current["progress"] == 100
        assert current["output_count"] == 1

        result = read_job_result("user-a", "project-a", created["id"])
        assert result is not None
        content, content_type, file_name = result
        assert content_type == "application/geo+json"
        assert file_name.endswith(".geojson")
        parsed = json.loads(content)
        assert parsed["type"] == "FeatureCollection"
        assert len(parsed["features"]) == 1

    def test_jobs_are_isolated_by_user_and_project(self) -> None:
        from gis_processing_jobs import (
            GISJobCreateRequest,
            GISJobSource,
            get_job,
            submit_job,
        )

        request = GISJobCreateRequest(
            project_id="project-a",
            tool="vector_dissolve",
            input=GISJobSource(
                kind="geojson",
                geojson=_polygon_feature_collection(),
            ),
        )
        created = submit_job("user-a", request)
        assert get_job("user-b", "project-a", created["id"]) is None
        assert get_job("user-a", "project-b", created["id"]) is None


class TestGISJobAPI:
    def test_tools_catalog_is_exposed(self, client: TestClient) -> None:
        response = client.get("/geomoz-api/gis/tools")
        assert response.status_code == 200
        data = response.json()
        ids = {tool["id"] for tool in data["tools"]}
        assert {"vector_buffer", "raster_slope", "raster_hillshade"} <= ids

    def test_unknown_job_returns_404(self, client: TestClient) -> None:
        response = client.get(
            "/geomoz-api/gis/jobs/not-there",
            params={"project_id": "project-a"},
        )
        assert response.status_code == 404

    def test_result_requires_completed_job(self, client: TestClient, monkeypatch) -> None:
        import api

        monkeypatch.setattr(
            api,
            "get_gis_job",
            lambda uid, project_id, job_id: {
                "id": job_id,
                "status": "running",
            },
        )
        response = client.get(
            "/geomoz-api/gis/jobs/job-1/result",
            params={"project_id": "project-a"},
        )
        assert response.status_code == 409
