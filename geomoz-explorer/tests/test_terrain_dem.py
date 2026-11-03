"""Synthetic DEM tests; no Earth Engine credentials are required."""
import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from terrain_dem import dem_to_preview, TerrainInputError
from terrain_gee import preview_scale_m


def synthetic_dem(crs="EPSG:32736"):
    image = np.arange(100, dtype="float32").reshape(10, 10) + 125
    image[4:6, 4:6] = -9999
    with MemoryFile() as mem:
        params = dict(driver="GTiff", width=10, height=10, count=1,
                      dtype="float32", nodata=-9999,
                      transform=from_origin(600000, 8000000, 30, 30))
        if crs is not None:
            params["crs"] = crs
        with mem.open(**params) as raster:
            raster.write(image, 1)
        return mem.read()


def test_crs_and_nodata_are_not_fabricated():
    result = dem_to_preview(synthetic_dem(), filename="test.tif")
    assert result["crs"] == "EPSG:32736"
    assert result["sourceCrs"] == "EPSG:32736"
    assert len(result["heights"]) == 193 ** 2
    assert result["minElevation"] >= 125
    assert result["maxElevation"] <= 224
    assert any(height is None for height in result["heights"])
    assert 0 < result["validFraction"] < 1
    assert result["cellSizeMeters"][0] > 0


def test_invalid_dem_inputs_are_rejected():
    with pytest.raises(TerrainInputError):
        dem_to_preview(synthetic_dem(), filename="not_a_tiff.png")
    with pytest.raises(TerrainInputError):
        dem_to_preview(synthetic_dem(crs=None))
    with pytest.raises(TerrainInputError):
        dem_to_preview(synthetic_dem(), size=512)


def test_gee_scale_adapts_to_aoi():
    small = {"type": "Polygon", "coordinates": [[[33, -19], [33.01, -19],
              [33.01, -18.99], [33, -18.99], [33, -19]]]}
    large = {"type": "Polygon", "coordinates": [[[30, -20], [35, -20],
              [35, -15], [30, -15], [30, -20]]]}
    assert preview_scale_m(small) == 30
    assert 30 < preview_scale_m(large) <= 30000
