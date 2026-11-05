import math
import pytest
from gee_download_grid import bounded_download_grid


def polygon(w, s, e, n):
    return {"type": "Polygon", "coordinates": [[[w,s],[e,s],[e,n],[w,n],[w,s]]]}


def test_province_sized_dem_stays_below_download_and_analysis_budgets():
    grid = bounded_download_grid(polygon(33, -21, 37, -16), 30)
    assert math.prod(grid["dimensions"]) <= 900_000
    assert grid["estimatedBytes"] <= 3_600_000
    assert max(grid["dimensions"]) < 10000
    assert grid["scale"] > 30
    assert grid["resolutionAdjusted"]


def test_small_aoi_preserves_requested_resolution_and_origin():
    grid = bounded_download_grid(polygon(35, -20, 35.01, -19.99), 30)
    assert grid["scale"] == 30
    assert not grid["resolutionAdjusted"]
    assert grid["crsTransform"][2] == 35
    assert grid["crsTransform"][5] == -19.99
    assert grid["crsTransform"][4] < 0


@pytest.mark.parametrize("geometry, scale", [
    (polygon(35,-20,35,-19),30), (polygon(-179,-20,179,-19),30),
    (polygon(35,-20,36,-19),float("nan")), ({},30),
])
def test_rejects_invalid_geometries_and_scales(geometry, scale):
    with pytest.raises(ValueError):
        bounded_download_grid(geometry, scale)


def test_long_thin_aoi_also_respects_dimension_limit():
    grid = bounded_download_grid(polygon(20, -20, 40, -19.999), 1)
    assert max(grid["dimensions"]) <= 9998
    assert math.prod(grid["dimensions"]) <= 900_000
