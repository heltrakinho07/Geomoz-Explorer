"""ESA WorldCover DEM overlay: original codes, nearest resampling and GEE isolation."""
from __future__ import annotations

import sys
from types import SimpleNamespace

import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from terrain_dem import TerrainInputError
from terrain_landcover import (
    WORLD_COVER_CLASSES, align_worldcover_categories, worldcover_gee_overlay
)

CRS = "EPSG:32736"
BOUNDS = [600000, 7999520, 600480, 8000000]


def worldcover_tiff():
    classes = np.full((16, 16), 10, dtype=np.uint8)
    classes[4:10, 2:9] = 50
    classes[10:15, 10:15] = 80
    classes[0:2, :] = 255
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", count=1, width=16, height=16,
                      dtype="uint8", crs=CRS, nodata=255,
                      transform=from_origin(600000, 8000000, 30, 30)) as raster:
            raster.write(classes, 1)
        return mem.read()


def test_worldcover_categorical_grid_and_nodata():
    result = align_worldcover_categories(
        worldcover_tiff(), crs=CRS, bounds_meters=BOUNDS,
        width=64, height=64
    )
    assert result["dataset"] == "ESA/WorldCover/v200"
    assert result["year"] == 2021
    assert result["width"] == result["height"] == 64
    assert set(value for value in result["values"] if value is not None) == {10, 50, 80}
    assert result["values"][0] is None
    assert 0 < result["validFraction"] < 1
    assert next(item for item in result["classes"] if item["value"] == 50)["color"] == "#fa0000"
    assert len(WORLD_COVER_CLASSES) == 11


def test_worldcover_rejects_nonoverlap():
    with pytest.raises(TerrainInputError, match="Sem cobertura"):
        align_worldcover_categories(
            worldcover_tiff(), crs=CRS,
            bounds_meters=[100000, 7000000, 100480, 7000480],
            width=64, height=64
        )


def test_gee_export_is_aligned_and_source_is_2021(monkeypatch):
    calls = {}

    class FakeEE:
        def filterBounds(self, region):
            calls["region"] = region
            return self

        def first(self):
            return self

        def select(self, band):
            calls["band"] = band
            return self

        def clip(self, region):
            return self

        def getDownloadURL(self, options):
            calls["export"] = options
            return "https://earthengine.googleapis.com/v1/expected"

    from terrain_landcover import worldcover_gee_overlay as export
    import terrain_landcover

    def collection(asset):
        calls["dataset"] = asset
        return FakeEE()

    monkeypatch.setitem(sys.modules, "ee", SimpleNamespace(
        ImageCollection=collection,
        Geometry=SimpleNamespace(Rectangle=lambda bounds,crs,geodesic:(bounds,crs,geodesic))
    ))
    monkeypatch.setattr(terrain_landcover, "fetch_signed_gee_geotiff",
                        lambda url: worldcover_tiff())
    result = export(crs=CRS,bounds_meters=BOUNDS,width=64,height=64)
    assert calls["dataset"] == "ESA/WorldCover/v200"
    assert calls["band"] == "Map"
    assert calls["export"]["crs"] == CRS
    assert calls["export"]["dimensions"] == [64,64]
    assert calls["export"]["crs_transform"] == [7.5,0,600000,0,-7.5,8000000]
    assert result["year"] == 2021
