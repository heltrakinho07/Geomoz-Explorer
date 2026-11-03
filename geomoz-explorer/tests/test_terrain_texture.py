"""Coordinate-aware RGB overlay tests; no network or GEE required."""
import base64
from io import BytesIO

import numpy as np
import pytest
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from terrain_dem import TerrainInputError
from terrain_texture import rgb_texture_to_preview


def example_rgb(crs="EPSG:32736"):
    values = np.zeros((3, 16, 16), dtype=np.uint8)
    values[0] = 220
    values[1] = np.arange(16, dtype=np.uint8)[:, None] * 8
    values[2] = 90
    with MemoryFile() as memory:
        info = dict(driver="GTiff", count=3, width=16, height=16,
                    dtype="uint8", transform=from_origin(600000, 8000000, 30, 30))
        if crs:
            info["crs"] = crs
        with memory.open(**info) as dataset:
            dataset.write(values)
        return memory.read()


def test_rgb_overlay_aligns_to_metric_terrain_grid():
    response = rgb_texture_to_preview(
        example_rgb(), "rgb.tif", crs="EPSG:32736",
        bounds_meters=[600000, 7999520, 600480, 8000000], width=64, height=64
    )
    assert response["alignment"] == "reprojected to terrain grid"
    assert response["targetCrs"] == "EPSG:32736"
    assert response["validFraction"] > 0.95
    assert response["imageDataUrl"].startswith("data:image/png;base64,")
    raw = base64.b64decode(response["imageDataUrl"].split(",", 1)[1])
    with Image.open(BytesIO(raw)) as texture:
        assert texture.size == (64, 64)
        assert texture.mode == "RGBA"
        assert texture.getpixel((32, 32))[0] == 220


def test_mismatched_extent_is_rejected():
    with pytest.raises(TerrainInputError, match="sobrepõe"):
        rgb_texture_to_preview(
            example_rgb(), "rgb.tif", crs="EPSG:32736",
            bounds_meters=[900000, 7000000, 900480, 7000480], width=64, height=64,
        )


def test_missing_rgb_bands_and_crs_are_rejected():
    with pytest.raises(TerrainInputError, match="CRS"):
        rgb_texture_to_preview(
            example_rgb(crs=None), "rgb.tif", crs="EPSG:32736",
            bounds_meters=[600000, 7999520, 600480, 8000000], width=64, height=64,
        )


def test_image_rejects_invalid_target_grid():
    with pytest.raises(TerrainInputError, match="Dimensões"):
        rgb_texture_to_preview(
            example_rgb(), "rgb.tif", crs="EPSG:32736",
            bounds_meters=[600000, 7999520, 600480, 8000000], width=1000, height=1000,
        )
