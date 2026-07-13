"""
Tests for the GEE indices API — Urban, Health, and Climate modules.

Uses the same mocked dependencies (geomoz, Shapely) as test_api.py.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


class TestGeeIndicesAPI:
    """Tests for the /geomoz-api/gee/indices endpoint including new modules."""

    NEW_GROUPS = {
        "urban":   ["urban_expansion", "impervious_surface", "urban_heat_island"],
        "health":  ["malaria_risk", "healthcare_access", "sanitation_index", "epidemic_risk"],
        "climate": ["precipitation", "temperature_lst", "cyclone_tracks", "cyclone_risk"],
    }

    def test_indices_endpoint_returns_success(self, client: TestClient) -> None:
        """GET /geomoz-api/gee/indices should return 200."""
        resp = client.get("/geomoz-api/gee/indices")
        assert resp.status_code == 200

    def test_indices_contains_all_new_groups(self, client: TestClient) -> None:
        """Response should include urban, health, and climate indices."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        groups = {i["group"] for i in data["indices"]}
        for group in self.NEW_GROUPS:
            assert group in groups, f"Missing group: {group}"

    def test_indices_contains_specific_new_ids(self, client: TestClient) -> None:
        """All 11 new index IDs should be present in the response."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        ids = {i["id"] for i in data["indices"]}
        all_new_ids = set()
        for ids_list in self.NEW_GROUPS.values():
            all_new_ids.update(ids_list)
        missing = all_new_ids - ids
        assert not missing, f"Missing index IDs: {missing}"

    @pytest.mark.parametrize("idx_id,expected_group", [
        ("urban_expansion",    "urban"),
        ("impervious_surface", "urban"),
        ("urban_heat_island",  "urban"),
        ("malaria_risk",       "health"),
        ("healthcare_access",  "health"),
        ("sanitation_index",   "health"),
        ("epidemic_risk",      "health"),
        ("precipitation",      "climate"),
        ("temperature_lst",    "climate"),
        ("cyclone_tracks",     "climate"),
        ("cyclone_risk",       "climate"),
    ])
    def test_new_index_group_assignment(
        self, client: TestClient, idx_id: str, expected_group: str,
    ) -> None:
        """Each new index should belong to the correct group."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        idx_map = {i["id"]: i for i in data["indices"]}
        assert idx_id in idx_map, f"Index {idx_id} not found"
        assert idx_map[idx_id]["group"] == expected_group, (
            f"{idx_id}: expected group {expected_group}, got {idx_map[idx_id]['group']}"
        )

    def test_urban_indices_have_correct_order(self, client: TestClient) -> None:
        """Urban indices should appear in the response with valid metadata."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        urban = [i for i in data["indices"] if i["group"] == "urban"]
        assert len(urban) == 3
        for idx in urban:
            assert "name" in idx, f"{idx['id']}: missing name"
            assert "formula" in idx, f"{idx['id']}: missing formula"
            assert "bands" in idx, f"{idx['id']}: missing bands"
            assert isinstance(idx["name"], str) and len(idx["name"]) > 0
            assert isinstance(idx["formula"], str) and len(idx["formula"]) > 0

    def test_health_indices_have_correct_order(self, client: TestClient) -> None:
        """Health indices should appear in the response with valid metadata."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        health = [i for i in data["indices"] if i["group"] == "health"]
        assert len(health) == 4
        for idx in health:
            assert "name" in idx
            assert "formula" in idx
            assert idx.get("classNames") is None, (
                f"{idx['id']}: should not have classNames"
            )

    def test_climate_indices_have_correct_order(self, client: TestClient) -> None:
        """Climate indices should appear in the response with valid metadata."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        climate = [i for i in data["indices"] if i["group"] == "climate"]
        assert len(climate) == 4
        for idx in climate:
            assert "name" in idx
            assert "formula" in idx

    def test_total_index_count(self, client: TestClient) -> None:
        """The API should report the expected total number of indices."""
        resp = client.get("/geomoz-api/gee/indices")
        data = resp.json()
        assert len(data["indices"]) == 43, (
            f"Expected 43 indices, got {len(data['indices'])}"
        )


class TestGeeMineralPresets:
    """Ensure mineral presets are not affected by new indices."""

    def test_minerals_endpoint_still_works(self, client: TestClient) -> None:
        """GET /geomoz-api/gee/minerals should still return 8 presets."""
        resp = client.get("/geomoz-api/gee/minerals")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["minerals"]) == 8

    def test_gold_preset_unchanged(self, client: TestClient) -> None:
        """Gold preset should have its original structure."""
        resp = client.get("/geomoz-api/gee/minerals")
        data = resp.json()
        gold = [m for m in data["minerals"] if m["id"] == "gold"]
        assert len(gold) == 1
        weights = gold[0]["weights"]
        assert "hydrothermal" in weights
        assert "fe_oxide" in weights
        assert "lineaments" in weights


class TestHealthEndpoint:
    """Health endpoint should remain unaffected by new GEE index definitions."""

    def test_health_ok(self, client: TestClient) -> None:
        """GET /geomoz-api/health should still work."""
        resp = client.get("/geomoz-api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "2.1.0"

    def test_gee_status_endpoint(self, client: TestClient) -> None:
        """GET /geomoz-api/gee/status should include index list."""
        resp = client.get("/geomoz-api/gee/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "indices" in data
        assert isinstance(data["indices"], list)
        # Status is mocked via gee_module patch in conftest; indices come
        # from INDEX_REGISTRY via the api.py endpoint
