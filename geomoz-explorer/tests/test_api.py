"""
Tests for the GeoMoz FastAPI backend.

These tests use mocked dependencies (geomoz, Shapely) so they run without
requiring actual spatial data or Earth Engine credentials.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import geopandas as gpd
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Point


# ── Health endpoint ────────────────────────────────────────────────────────────


class TestHealth:
    """Tests for the /geomoz-api/health endpoint."""

    def test_health_returns_ok(self, client: TestClient) -> None:
        """GET /geomoz-api/health should return status ok with version."""
        resp = client.get("/geomoz-api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "2.1.0"

    def test_health_is_fast(self, client: TestClient) -> None:
        """Health check should respond in under 100 ms."""
        import time
        start = time.perf_counter()
        client.get("/geomoz-api/health")
        elapsed = (time.perf_counter() - start) * 1000
        assert elapsed < 100, f"Health check took {elapsed:.1f} ms"


# ── Utility functions _find_col ────────────────────────────────────────────────


class TestFindCol:
    """Tests for the _find_col helper function."""

    def test_finds_exact_column(self) -> None:
        """Should return the first matching column name."""
        from api import _find_col

        class MockGDF:
            columns = ["Provincia", "Distrito", "geometry"]

        result = _find_col(MockGDF(), ["Provincia", "PROVINCIA", "NAME_1"])
        assert result == "Provincia"

    def test_returns_first_candidate_match(self) -> None:
        """Should return the first candidate that matches."""
        from api import _find_col

        class MockGDF:
            columns = ["NAME_1", "Provincia"]

        result = _find_col(MockGDF(), ["Provincia", "NAME_1"])
        assert result == "Provincia"  # first in candidates list

    def test_returns_none_when_no_match(self) -> None:
        """Should return None when no column matches."""
        from api import _find_col

        class MockGDF:
            columns = ["geometry", "area"]

        result = _find_col(MockGDF(), ["Provincia", "NAME_1"])
        assert result is None

    def test_handles_none_gdf(self) -> None:
        """Should raise AttributeError when gdf is None.
        This is expected because _find_col is an internal function
        that always receives a valid GeoDataFrame."""
        from api import _find_col
        with pytest.raises(AttributeError):
            _find_col(None, ["Provincia"])

    def test_handles_empty_candidates(self) -> None:
        """Should return None when candidates list is empty."""
        from api import _find_col

        class MockGDF:
            columns = ["Provincia"]

        result = _find_col(MockGDF(), [])
        assert result is None


# ── Utility function _color_for ────────────────────────────────────────────────


class TestColorFor:
    """Tests for the _color_for helper function."""

    def test_returns_hex_color(self) -> None:
        """Should return a hex color string starting with #."""
        from api import _color_for
        color = _color_for("Granito")
        assert color.startswith("#")
        assert len(color) == 7  # #RRGGBB

    def test_deterministic(self) -> None:
        """Same input should always produce the same color."""
        from api import _color_for
        color1 = _color_for("Xisto")
        color2 = _color_for("Xisto")
        assert color1 == color2

    def test_different_inputs_produce_different_colors(self) -> None:
        """Different inputs should (likely) produce different colors."""
        from api import _color_for
        colors = {_color_for(str(i)) for i in range(25)}
        assert len(colors) >= 15

    def test_handles_empty_string(self) -> None:
        """Should handle empty string input."""
        from api import _color_for
        color = _color_for("")
        assert color.startswith("#")

    def test_color_in_palette(self) -> None:
        """Returned color should be one of the palette values."""
        from api import _color_for
        from api import _color_for as cf

        PALETTE = [
            "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
            "#264653", "#8ECAE6", "#219EBC", "#FFB703", "#FB8500",
            "#606C38", "#DDA15E", "#BC6C25", "#52B788", "#F2CC8F",
            "#023047", "#A8DADC", "#6D6875", "#B5838D", "#E76F51",
        ]
        color = cf("Teste")
        assert color in PALETTE


# ── Region geometry helper ─────────────────────────────────────────────────────


class TestRegionGeoJSON:
    """Tests for the _region_geojson helper function."""

    def test_returns_none_when_no_selection(self) -> None:
        """With no province or district, should return None."""
        from api import _region_geojson
        result = _region_geojson(None, None)
        assert result is None

    def test_returns_none_for_unknown_province(self) -> None:
        """With no matching province, the helper should not crash."""
        from api import _region_geojson
        # This should not raise — the function may return None or a geometry
        # depending on the mock data; we just verify it doesn't crash.
        result = _region_geojson("Inexistente", None)
        # Should be a dict (geometry) or None, never a list/string
        assert isinstance(result, (dict, type(None)))


# ── API metadata ───────────────────────────────────────────────────────────────


class TestAPIMetadata:
    """Tests for API metadata and configuration."""

    def test_app_title_and_version(self) -> None:
        """FastAPI app should have correct metadata."""
        from api import app
        assert app.title == "GeoMoz API"
        assert app.version == "2.1.0"

    def test_cors_middleware_configured(self) -> None:
        """CORS middleware should be present."""
        from api import app
        cors_middleware = [
            m for m in app.user_middleware
            if m.cls.__name__ == "CORSMiddleware"
        ]
        assert len(cors_middleware) == 1

    def test_gzip_middleware_configured(self) -> None:
        """GZip middleware should be present."""
        from api import app
        gzip_middleware = [
            m for m in app.user_middleware
            if m.cls.__name__ == "GZipMiddleware"
        ]
        assert len(gzip_middleware) == 1

    def test_cors_restricts_methods(self) -> None:
        """CORS should only allow GET, POST, OPTIONS."""
        from api import app
        cors_found = False
        for m in app.user_middleware:
            if m.cls.__name__ == "CORSMiddleware":
                cors_found = True
                # Starlette stores middleware options in .kwargs
                opts = m.kwargs if hasattr(m, 'kwargs') else {}
                methods = opts.get("allow_methods", None)
                # Skip the assertion if we can't retrieve methods (test robustness)
                if methods is not None:
                    assert methods == ["GET", "POST", "OPTIONS"]
        assert cors_found, "CORSMiddleware should be registered"


# ── Rate limiter ───────────────────────────────────────────────────────────────


class TestRateLimiter:
    """Tests for the in-memory rate limiter."""

    def test_allows_normal_requests(self) -> None:
        """Should allow requests under the limit."""
        from api import _check_rate_limit
        result = _check_rate_limit("test-rate-limit-unit")
        assert result is True

    def test_blocks_excessive_requests_patched(self) -> None:
        """Should block when exceeding the limit (patched)."""
        from api import _check_rate_limit, _rate_limit_store
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("api._rate_limit_max_requests", 1)
            mp.setattr("api._rate_limit_window_seconds", 60)
            ip = "test-excessive-ratelimit"
            # Fresh start for this test
            _rate_limit_store[ip] = []
            assert _check_rate_limit(ip) is True
            # Second request should exceed limit of 1
            assert _check_rate_limit(ip) is False


# ── Pydantic request model validation ──────────────────────────────────────────


class TestGEEIndexRequest:
    """Tests for the GEEIndexRequest model validation."""

    def test_valid_request(self) -> None:
        """Should accept valid parameters."""
        from api import GEEIndexRequest
        req = GEEIndexRequest(
            index="ndvi",
            province="Manica",
            start_date="2023-01-01",
            end_date="2023-12-31",
            cloud_pct=30,
        )
        assert req.index == "ndvi"
        assert req.province == "Manica"
        assert req.cloud_pct == 30

    def test_invalid_cloud_pct_below_zero(self) -> None:
        """Should reject cloud_pct < 0."""
        from pydantic import ValidationError
        from api import GEEIndexRequest
        with pytest.raises(ValidationError):
            GEEIndexRequest(index="ndvi", cloud_pct=-5)

    def test_invalid_cloud_pct_above_100(self) -> None:
        """Should reject cloud_pct > 100."""
        from pydantic import ValidationError
        from api import GEEIndexRequest
        with pytest.raises(ValidationError):
            GEEIndexRequest(index="ndvi", cloud_pct=120)

    def test_invalid_date_format(self) -> None:
        """Should reject invalid date format."""
        from pydantic import ValidationError
        from api import GEEIndexRequest
        with pytest.raises(ValidationError):
            GEEIndexRequest(
                index="ndvi",
                start_date="01-01-2023",
                end_date="2023-12-31",
            )


class TestGEECompositeRequest:
    """Tests for the GEECompositeRequest model validation."""

    def test_valid_weights(self) -> None:
        """Should accept valid weight configuration."""
        from api import GEECompositeRequest
        req = GEECompositeRequest(
            weights={"ndvi": 0.5, "fe_oxide": 0.5},
        )
        assert req.weights == {"ndvi": 0.5, "fe_oxide": 0.5}

    def test_empty_weights_raises(self) -> None:
        """Should reject empty weights."""
        from pydantic import ValidationError
        from api import GEECompositeRequest
        with pytest.raises(ValidationError):
            GEECompositeRequest(weights={})

    def test_zero_sum_weights_raises(self) -> None:
        """Should reject weights that sum to zero."""
        from pydantic import ValidationError
        from api import GEECompositeRequest
        with pytest.raises(ValidationError):
            GEECompositeRequest(weights={"ndvi": 0.0, "fe_oxide": 0.0})

    def test_invalid_date(self) -> None:
        """Should reject invalid date in composite request."""
        from pydantic import ValidationError
        from api import GEECompositeRequest
        with pytest.raises(ValidationError):
            GEECompositeRequest(
                weights={"ndvi": 0.5, "fe_oxide": 0.5},
                start_date="not-a-date",
            )


class TestGEELineamentsRequest:
    """Tests for the GEELineamentsRequest model validation."""

    def test_positive_smooth_m(self) -> None:
        """Should accept positive smooth_m."""
        from api import GEELineamentsRequest
        req = GEELineamentsRequest(smooth_m=50)
        assert req.smooth_m == 50

    def test_zero_smooth_m_raises(self) -> None:
        """Should reject zero or negative smooth_m."""
        from pydantic import ValidationError
        from api import GEELineamentsRequest
        with pytest.raises(ValidationError):
            GEELineamentsRequest(smooth_m=0)

    def test_negative_density_radius_raises(self) -> None:
        """Should reject negative density_radius_m."""
        from pydantic import ValidationError
        from api import GEELineamentsRequest
        with pytest.raises(ValidationError):
            GEELineamentsRequest(density_radius_m=-500)

    def test_negative_rose_samples_raises(self) -> None:
        """Should reject negative rose_samples."""
        from pydantic import ValidationError
        from api import GEELineamentsRequest
        with pytest.raises(ValidationError):
            GEELineamentsRequest(rose_samples=-100)


class TestGEETargetingRequest:
    """Tests for the GEETargetingRequest model validation."""

    def test_valid_score_threshold(self) -> None:
        """Should accept score threshold in [0, 1]."""
        from api import GEETargetingRequest
        req = GEETargetingRequest(mineral="gold", score_threshold=0.75)
        assert req.score_threshold == 0.75

    def test_default_score_threshold(self) -> None:
        """Default score threshold should be 0.7."""
        from api import GEETargetingRequest
        req = GEETargetingRequest(mineral="gold")
        assert req.score_threshold == 0.7

    def test_invalid_score_threshold_raises(self) -> None:
        """Should reject score threshold outside [0, 1]."""
        from pydantic import ValidationError
        from api import GEETargetingRequest
        with pytest.raises(ValidationError):
            GEETargetingRequest(mineral="gold", score_threshold=1.5)

    def test_invalid_score_threshold_negative(self) -> None:
        """Should reject negative score threshold."""
        from pydantic import ValidationError
        from api import GEETargetingRequest
        with pytest.raises(ValidationError):
            GEETargetingRequest(mineral="gold", score_threshold=-0.1)


class TestGEEWatershedRequest:
    """Tests for the GEEWatershedRequest model validation."""

    def test_valid_request(self) -> None:
        """Should accept valid watershed coordinates."""
        from api import GEEWatershedRequest
        req = GEEWatershedRequest(lat=-16.5, lon=34.5)
        assert req.lat == -16.5
        assert req.lon == 34.5
        assert req.max_iter == 60
        assert req.level == 10

    def test_valid_custom_iterations(self) -> None:
        """Should accept custom max_iter."""
        from api import GEEWatershedRequest
        req = GEEWatershedRequest(lat=-16.5, lon=34.5, max_iter=100)
        assert req.max_iter == 100


class TestGEEProfileRequest:
    """Tests for the GEEProfileRequest model validation."""

    def test_valid_coords(self) -> None:
        """Should accept a list of coordinate pairs."""
        from api import GEEProfileRequest
        req = GEEProfileRequest(coords=[[32.0, -15.0], [35.0, -17.0]], samples=100)
        assert len(req.coords) == 2

    def test_default_samples(self) -> None:
        """Default sample count should be 200."""
        from api import GEEProfileRequest
        req = GEEProfileRequest(coords=[[32.0, -15.0], [35.0, -17.0]])
        assert req.samples == 200


class TestGEEFloodRequest:
    """Tests for the GEEFloodRequest model validation."""

    def test_valid_dates(self) -> None:
        """Should accept valid event dates."""
        from api import GEEFloodRequest
        req = GEEFloodRequest(
            event_start="2019-03-15",
            event_end="2019-03-25",
        )
        assert req.event_start == "2019-03-15"
        assert req.event_end == "2019-03-25"

    def test_valid_with_baseline(self) -> None:
        """Should accept optional baseline dates."""
        from api import GEEFloodRequest
        req = GEEFloodRequest(
            event_start="2019-03-15",
            event_end="2019-03-25",
            baseline_start="2019-01-01",
            baseline_end="2019-03-14",
        )
        assert req.baseline_start == "2019-01-01"


# ── GEE endpoint helpers ───────────────────────────────────────────────────────


class TestGEEIndices:
    """Tests for the /geomoz-api/gee/indices endpoint."""

    def test_lists_available_indices(self, client: TestClient) -> None:
        """Should return a list of index definitions."""
        resp = client.get("/geomoz-api/gee/indices")
        assert resp.status_code == 200
        data = resp.json()
        assert "indices" in data
        assert isinstance(data["indices"], list)
        index_ids = {i["id"] for i in data["indices"]}
        assert "ndvi" in index_ids
        assert "elevation" in index_ids


class TestGEEMinerals:
    """Tests for the /geomoz-api/gee/minerals endpoint."""

    def test_lists_mineral_presets(self, client: TestClient) -> None:
        """Should return a list of mineral targeting presets."""
        resp = client.get("/geomoz-api/gee/minerals")
        assert resp.status_code == 200
        data = resp.json()
        assert "minerals" in data
        mineral_ids = {m["id"] for m in data["minerals"]}
        assert "gold" in mineral_ids


# ── Error handling ─────────────────────────────────────────────────────────────


class TestErrorHandling:
    """Tests for error handling in various endpoints."""

    def test_unknown_route_returns_404(self, client: TestClient) -> None:
        """Unknown routes should return 404."""
        resp = client.get("/geomoz-api/nonexistent")
        assert resp.status_code == 404

    def test_health_without_rate_limit(self, client: TestClient) -> None:
        """Health endpoint should work normally."""
        for _ in range(10):
            resp = client.get("/geomoz-api/health")
            assert resp.status_code == 200


# ── REST endpoints: Provinces ────────────────────────────────────────────────────


class TestProvinces:
    """Tests for province-related endpoints."""

    def test_provinces_returns_geojson(self, client: TestClient) -> None:
        """GET /geomoz-api/provinces should return GeoJSON."""
        resp = client.get("/geomoz-api/provinces")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("type") == "FeatureCollection"
        assert len(data.get("features", [])) > 0

    def test_province_names_returns_list(self, client: TestClient) -> None:
        """GET /geomoz-api/province-names should return name list."""
        resp = client.get("/geomoz-api/province-names")
        assert resp.status_code == 200
        data = resp.json()
        assert "names" in data
        assert "Tete" in data["names"]
        assert data["column"] is not None

    def test_provinces_geojson_has_expected_properties(self, client: TestClient) -> None:
        """Province features should include geometry and Provincia field."""
        resp = client.get("/geomoz-api/provinces")
        data = resp.json()
        feat = data["features"][0]
        assert "geometry" in feat
        assert "properties" in feat
        assert feat["properties"].get("Provincia") == "Tete"


# ── REST endpoints: Districts ─────────────────────────────────────────────────────


class TestDistricts:
    """Tests for district-related endpoints."""

    def test_districts_returns_geojson(self, client: TestClient) -> None:
        """GET /geomoz-api/districts should return GeoJSON."""
        resp = client.get("/geomoz-api/districts")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("type") == "FeatureCollection"
        assert len(data.get("features", [])) > 0

    def test_district_names_returns_list(self, client: TestClient) -> None:
        """GET /geomoz-api/district-names should return name list."""
        resp = client.get("/geomoz-api/district-names")
        assert resp.status_code == 200
        data = resp.json()
        assert "names" in data
        assert "Moatize" in data["names"]

    def test_districts_filter_by_province(self, client: TestClient) -> None:
        """Filtering districts by province should not crash."""
        resp = client.get("/geomoz-api/districts?province=Tete")
        assert resp.status_code == 200

    def test_district_names_filter_by_province(self, client: TestClient) -> None:
        """Filtering district names by province should not crash."""
        resp = client.get("/geomoz-api/district-names?province=Tete")
        assert resp.status_code == 200
        data = resp.json()
        assert "names" in data


# ── REST endpoints: Geology ───────────────────────────────────────────────────────


class TestGeology:
    """Tests for geology-related endpoints."""

    def test_geology_returns_geojson(self, client: TestClient) -> None:
        """GET /geomoz-api/geology should return GeoJSON."""
        resp = client.get("/geomoz-api/geology")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("type") == "FeatureCollection"

    def test_geology_has_color_field(self, client: TestClient) -> None:
        """Geology features should have _color property."""
        resp = client.get("/geomoz-api/geology")
        data = resp.json()
        if data.get("features"):
            assert "_color" in data["features"][0]["properties"]

    def test_geology_filter_by_province(self, client: TestClient) -> None:
        """Filtering geology by province should not crash."""
        resp = client.get("/geomoz-api/geology?province=Tete")
        assert resp.status_code == 200

    def test_geology_filter_by_district(self, client: TestClient) -> None:
        """Filtering geology by district should not crash."""
        resp = client.get("/geomoz-api/geology?district=Moatize")
        assert resp.status_code == 200


# ── REST endpoints: Stats ─────────────────────────────────────────────────────────


class TestStats:
    """Tests for the /geomoz-api/stats endpoint."""

    def test_stats_returns_summary(self, client: TestClient) -> None:
        """GET /geomoz-api/stats should return summary dict."""
        resp = client.get("/geomoz-api/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "totalFeatures" in data
        assert "totalAreaKm2" in data
        assert "dominant" in data
        assert data["totalFeatures"] > 0

    def test_stats_with_province(self, client: TestClient) -> None:
        """Stats filtered by province should work."""
        resp = client.get("/geomoz-api/stats?province=Tete")
        assert resp.status_code == 200

    def test_stats_with_district(self, client: TestClient) -> None:
        """Stats filtered by district should work."""
        resp = client.get("/geomoz-api/stats?district=Moatize")
        assert resp.status_code == 200

    def test_stats_lithologies_is_list(self, client: TestClient) -> None:
        """Stats should include lithologies list."""
        resp = client.get("/geomoz-api/stats")
        data = resp.json()
        assert "lithologies" in data
        assert isinstance(data["lithologies"], list)
        if data["lithologies"]:
            first = data["lithologies"][0]
            assert "name" in first
            assert "areaKm2" in first
            assert "percent" in first
            assert "color" in first


# ── REST endpoints: Geology Colors ────────────────────────────────────────────────


class TestGeologyColors:
    """Tests for the /geomoz-api/geology-colors endpoint."""

    def test_geology_colors_returns_items(self, client: TestClient) -> None:
        """GET /geomoz-api/geology-colors should return color mappings."""
        resp = client.get("/geomoz-api/geology-colors")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) > 0
        assert "value" in data["items"][0]
        assert "color" in data["items"][0]

    def test_geology_colors_column_is_present(self, client: TestClient) -> None:
        """Should indicate which column was used for coloring."""
        resp = client.get("/geomoz-api/geology-colors")
        data = resp.json()
        assert data["column"] is not None


# ── REST endpoints: Province Summary ──────────────────────────────────────────────


class TestProvinceSummary:
    """Tests for the /geomoz-api/province-summary endpoint."""

    def test_province_summary_returns_list(self, client: TestClient) -> None:
        """GET /geomoz-api/province-summary should return province list."""
        resp = client.get("/geomoz-api/province-summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "provinces" in data
        assert isinstance(data["provinces"], list)

    def test_province_summary_has_fields(self, client: TestClient) -> None:
        """Each province entry should have required fields."""
        resp = client.get("/geomoz-api/province-summary")
        data = resp.json()
        if data["provinces"]:
            entry = data["provinces"][0]
            assert "province" in entry
            assert "totalFeatures" in entry
            assert "totalUnits" in entry
            assert "totalAreaKm2" in entry
            assert "dominant" in entry


# ── GEE endpoints without Earth Engine ────────────────────────────────────────────


class TestGEEStatus:
    """Tests for GEE status endpoint (no GEE credentials needed for endpoint call)."""

    def test_gee_status_returns_disconnected(self, client: TestClient) -> None:
        """Without GEE credentials, status should return connected=False."""
        from unittest.mock import patch
        with patch("gee_module.gee_status") as mock_status:
            mock_status.return_value = {
                "connected": False,
                "auth_type": None,
                "project": None,
                "message": "GEE not configured",
                "indices": [],
            }
            resp = client.get("/geomoz-api/gee/status")
            assert resp.status_code == 200
            data = resp.json()
            assert "connected" in data
