import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from workspace_dem import MAX_PIXELS, NODATA, WorkspaceDemRequest, inspect_area, resolve_workspace_area, write_dem_geotiff


AREA = {
    "type": "Polygon",
    "coordinates": [[[32.5, -26], [32.6, -26], [32.6, -25.9], [32.5, -25.9], [32.5, -26]]],
}


@pytest.mark.parametrize("crs", ["EPSG:4326", "EPSG:32736"])
def test_estimate_uses_export_grid_and_polygon_area(crs):
    geometry, estimate = inspect_area(AREA, 30, crs)
    assert geometry["type"] == "Polygon"
    assert 100 < estimate["areaKm2"] < 120
    assert estimate["pixels"] == estimate["columns"] * estimate["rows"] < MAX_PIXELS
    assert estimate["estimatedBytes"] == estimate["pixels"] * 4


def test_invalid_geometry_and_excessive_grid_rejected():
    crossing = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}
    wide = {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 1], [0, 1], [0, 0]]]}
    with pytest.raises(ValueError, match="auto-intersecções"):
        inspect_area(crossing, 30, "EPSG:4326")
    with pytest.raises(ValueError, match="3 milhões"):
        inspect_area(wide, 30, "EPSG:4326")
    with pytest.raises(ValueError, match="zona UTM"):
        inspect_area(AREA, 30, "EPSG:32737")
    with pytest.raises(ValueError):
        WorkspaceDemRequest(scale=10)


def test_export_keeps_crs_zero_elevation_and_nodata():
    transform = from_origin(32.5, -25.9, 0.001, 0.001)
    values = np.array([[0, NODATA], [2, 3]], dtype="float32")
    with MemoryFile() as source:
        with source.open(driver="GTiff", width=2, height=2, count=1, dtype="float32",
                         crs="EPSG:4326", transform=transform) as raster:
            raster.write(values, 1)
        raw = source.read()
    with MemoryFile(write_dem_geotiff(raw)) as result, result.open() as raster:
        assert raster.nodata == NODATA
        assert raster.crs.to_epsg() == 4326
        assert raster.transform == transform
        assert raster.read(1, masked=True).mask.tolist() == [[False, True], [False, False]]
        np.testing.assert_equal(raster.read(1), values)

def test_gaul_dem_uses_server_geometry_not_browser_geometry(monkeypatch):
    from agent import administrative_boundaries

    class FakeGeometry:
        def simplify(self, maxError):
            assert maxError == 100
            return self

        def getInfo(self):
            return AREA

    calls = []

    def fake_administrative_geometry(country, level, admin1, admin2):
        calls.append((country, level, admin1, admin2))
        return FakeGeometry(), {"dataset": "FAO/GAUL/2025/level2"}

    monkeypatch.setattr(administrative_boundaries, "administrative_geometry", fake_administrative_geometry)
    request = WorkspaceDemRequest(
        boundarySource="gaul2025", countryCode="MOZ", adminLevel=2,
        admin1Code=123, admin2Code=456,
    )
    def reject_legacy(*args):
        raise AssertionError("GAUL must not silently fall back to another boundary source")
    assert resolve_workspace_area(request, reject_legacy) == AREA
    assert calls == [("MOZ", 2, 123, 456)]


@pytest.mark.parametrize("fields", [
    {"boundarySource": "gaul2025", "countryCode": "MOZ", "adminLevel": 2, "admin1Code": 123},
    {"boundarySource": "gaul2025", "countryCode": "MOZ", "adminLevel": 1, "admin2Code": 456},
    {"countryCode": "MOZ"},
    {"boundarySource": "gaul2025", "countryCode": "MOZ", "geometry": AREA},
    {"boundarySource": "gaul2025", "countryCode": "MOZ", "province": "Sofala"},
])
def test_gaul_dem_rejects_incomplete_or_mixed_selections(fields):
    request = WorkspaceDemRequest(**fields)
    with pytest.raises(ValueError):
        resolve_workspace_area(request, lambda *_: AREA)
