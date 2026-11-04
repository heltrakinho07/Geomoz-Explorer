"""ESA WorldCover v200 (2021) category grid, snapped to the DEM preview.

Only the authenticated user's Earth Engine can initiate this request.
The raster is fetched from a Google-signed URL under the existing size/host guard.
Unlike RGB satellite previews, categorical maps ALWAYS use nearest-neighbour
reprojection and return original class codes, not altered RGB pixels.
"""
from __future__ import annotations

from io import BytesIO

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import reproject

from terrain_dem import TerrainInputError, MAX_SOURCE_PIXELS
from terrain_gee import fetch_signed_gee_geotiff
from terrain_satellite import validate_imagery_grid

WORLD_COVER_CLASSES = [
    {"value": 10, "label": "Árvores", "color": "#006400"},
    {"value": 20, "label": "Arbustos", "color": "#ffbb22"},
    {"value": 30, "label": "Prados", "color": "#ffff4c"},
    {"value": 40, "label": "Culturas", "color": "#f096ff"},
    {"value": 50, "label": "Áreas construídas", "color": "#fa0000"},
    {"value": 60, "label": "Vegetação escassa", "color": "#b4b4b4"},
    {"value": 70, "label": "Neve e gelo", "color": "#f0f0f0"},
    {"value": 80, "label": "Água permanente", "color": "#0064c8"},
    {"value": 90, "label": "Zonas húmidas", "color": "#0096a0"},
    {"value": 95, "label": "Mangais", "color": "#00cf75"},
    {"value": 100, "label": "Musgos e líquenes", "color": "#fae6a0"},
]
VALID_CODES = {item["value"] for item in WORLD_COVER_CLASSES}


def align_worldcover_categories(
    source: bytes, *,
    crs: str, bounds_meters: list[float], width: int, height: int
) -> dict:
    """Convert GEE GeoTIFF into DEM-aligned categorical values, preserving masks."""
    bounds, _ = validate_imagery_grid(crs, bounds_meters, width, height)
    try:
        with MemoryFile(BytesIO(source)) as mem, mem.open() as src:
            if (src.width < 1 or src.height < 1 or
                    src.width * src.height > MAX_SOURCE_PIXELS or
                    src.count < 1 or src.crs is None):
                raise TerrainInputError("A imagem ESA WorldCover é inválida.")
            dst = np.full((height, width), -1, dtype=np.int16)
            reproject(
                source=rasterio.band(src, 1), destination=dst,
                src_transform=src.transform, src_crs=src.crs,
                src_nodata=src.nodata, dst_nodata=-1,
                dst_transform=from_bounds(*bounds, width, height),
                dst_crs=crs, init_dest_nodata=True,
                resampling=Resampling.nearest, num_threads=2,
            )
            flat = [int(value) if int(value) in VALID_CODES else None
                    for value in dst.flat]
            if all(value is None for value in flat):
                raise TerrainInputError(
                    "Sem cobertura ESA WorldCover válida na extensão do DEM."
                )
            return {
                "name": "ESA WorldCover 2021 · Cobertura do solo",
                "dataset": "ESA/WorldCover/v200",
                "year": 2021,
                "width": width, "height": height,
                "targetCrs": crs, "values": flat,
                "classes": WORLD_COVER_CLASSES,
                "validFraction": round(
                    sum(v is not None for v in flat) / len(flat), 4
                ),
                "attribution": "ESA WorldCover Consortium, 2021 · CC BY 4.0",
                "previewOnly": True,
            }
    except TerrainInputError:
        raise
    except (rasterio.errors.RasterioError, ValueError, TypeError) as exc:
        raise TerrainInputError("Não foi possível alinhar ESA WorldCover ao DEM.") from exc


def worldcover_gee_overlay(*, crs: str, bounds_meters: list[float],
                           width: int, height: int) -> dict:
    """Download exact source class codes for the given DEM preview, not RGB."""
    import ee

    bounds, geographic = validate_imagery_grid(
        crs, bounds_meters, width, height
    )
    region = ee.Geometry.Rectangle(geographic, "EPSG:4326", False)
    image = (ee.ImageCollection("ESA/WorldCover/v200")
             .filterBounds(region).first().select("Map").clip(region))
    left, bottom, right, top = bounds
    url = image.getDownloadURL({
        "format": "GEO_TIFF",
        "filePerBand": False,
        "crs": crs,
        "crs_transform": [
            (right - left) / width, 0, left,
            0, -(top - bottom) / height, top,
        ],
        "dimensions": [width, height],
    })
    raw = fetch_signed_gee_geotiff(url)
    return align_worldcover_categories(
        raw, crs=crs, bounds_meters=bounds, width=width, height=height
    )
