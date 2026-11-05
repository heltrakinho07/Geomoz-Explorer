"""Strict bounds, dates, and authentic Sentinel-2 RGB georeferencing tests.

Earth Engine and Google network calls are stubbed; CI never needs user tokens.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from terrain_dem import TerrainInputError
from terrain_satellite import (
    sentinel2_rgb_texture, validate_imagery_grid, validate_imagery_period
)

CRS = "EPSG:32736"
BOUNDS = [600_000, 7_999_520, 600_480, 8_000_000]


def test_metric_utm_grid_projects_to_manica_wgs84():
    projected, geo = validate_imagery_grid(CRS, BOUNDS, 193, 193)
    assert projected == BOUNDS
    assert 32 <= geo[0] <= 36
    assert -20 <= geo[1] <= -16
    assert geo[2] > geo[0] and geo[3] > geo[1]


@pytest.mark.parametrize("crs, bounds, width, height", [
    ("EPSG:4326", BOUNDS, 193, 193),
    ("EPSG:32700", BOUNDS, 193, 193),
    ("EPSG:32799", BOUNDS, 193, 193),
    (CRS, [0, 0, 500_000, 500_000], 193, 193),
    (CRS, [0, 0, 1, 0], 193, 193),
    (CRS, [0, 0, float("nan"), 50], 193, 193),
    (CRS, BOUNDS, 5000, 5000),
])
def test_invalid_or_unbounded_imagery_grids_fail(crs, bounds, width, height):
    with pytest.raises(TerrainInputError):
        validate_imagery_grid(crs, bounds, width, height)


def test_dates_default_last_year_and_limit_google_work():
    start, end, cloud = validate_imagery_period(None, None, 30)
    assert start == (date.today() - timedelta(days=365)).isoformat()
    assert end == (date.today() + timedelta(days=1)).isoformat()
    assert cloud == 30
    with pytest.raises(TerrainInputError):
        validate_imagery_period("2020-01-01", "2026-01-01", 30)
    with pytest.raises(TerrainInputError):
        validate_imagery_period("2026-10-01", "2026-01-01", 30)
    with pytest.raises(TerrainInputError):
        validate_imagery_period(None, None, 0)


def test_sentinel_rgb_exports_on_exact_metric_dem_grid(monkeypatch):
    calls = {}

    class Composite:
        def select(self, bands):
            calls["bands"] = bands
            return self

        def visualize(self, **kwargs):
            calls["vis"] = kwargs
            return self

        def getDownloadURL(self, kwargs):
            calls["export"] = kwargs
            return "https://earthengine.googleapis.com/v1/signed"

    def fake_composite(region, start, end, clouds):
        calls["request"] = (region, start, end, clouds)
        return Composite(), 17

    from terrain_satellite import sentinel2_rgb_texture as export
    import terrain_satellite
    import gee_module

    monkeypatch.setitem(
        sys.modules, "ee",
        SimpleNamespace(Geometry=SimpleNamespace(Rectangle=lambda bounds, crs, geodesic: (
            bounds, crs, geodesic
        )))
    )
    monkeypatch.setattr(gee_module, "_build_s2_composite", fake_composite)
    monkeypatch.setattr(terrain_satellite, "fetch_signed_gee_geotiff",
                        lambda url: b"example-geotiff")
    monkeypatch.setattr(
        terrain_satellite, "rgb_texture_to_preview",
        lambda raw, filename, **kwargs: {
            "imageDataUrl": "data:image/png;base64,AAA=",
            "width": kwargs["width"], "height": kwargs["height"],
            "targetCrs": kwargs["crs"], "validFraction": 1.0
        }
    )
    result = export(
        crs=CRS, bounds_meters=BOUNDS, width=193, height=193,
        start_date="2026-01-01", end_date="2026-10-01", cloud_pct=35,
    )
    assert calls["bands"] == ["B4", "B3", "B2"]
    assert calls["export"]["format"] == "GEO_TIFF"
    assert calls["export"]["crs"] == CRS
    assert calls["export"]["dimensions"] == [193, 193]
    assert calls["export"]["crs_transform"] == [
        480 / 193, 0, 600_000, 0, -480 / 193, 8_000_000
    ]
    assert result["sceneCount"] == 17
    assert result["collection"] == "COPERNICUS/S2_SR_HARMONIZED"
    assert result["cloudPercent"] == 35
    assert result["previewOnly"] is True
