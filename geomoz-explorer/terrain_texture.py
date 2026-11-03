"""Align an RGB GeoTIFF to the exact metric grid of the active 3D terrain preview.

This module accepts only local raster bytes, never external URLs.
"""
from __future__ import annotations

import base64
import math
from io import BytesIO
from typing import Any

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import reproject

from terrain_dem import MAX_UPLOAD_BYTES, MAX_SOURCE_PIXELS, TerrainInputError


def rgb_texture_to_preview(
    data: bytes,
    filename: str,
    *,
    crs: str,
    bounds_meters: list[float],
    width: int,
    height: int,
) -> dict[str, Any]:
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise TerrainInputError("A textura GeoTIFF deve ter até 32 MB.")
    if not filename.lower().endswith((".tif", ".tiff")):
        raise TerrainInputError("A textura tem de ser um GeoTIFF com bandas RGB.")
    if crs != "EPSG:3857" and not (
        crs.startswith("EPSG:326") or crs.startswith("EPSG:327")
    ):
        raise TerrainInputError("CRS de destino não suportado.")
    if not 2 <= width <= 255 or not 2 <= height <= 255 or width * height > 65025:
        raise TerrainInputError("Dimensões de textura não suportadas.")
    if len(bounds_meters) != 4 or not all(math.isfinite(float(v)) for v in bounds_meters):
        raise TerrainInputError("Extensão métrica inválida.")
    left, bottom, right, top = map(float, bounds_meters)
    if right <= left or top <= bottom:
        raise TerrainInputError("A extensão de destino não é válida.")
    try:
        with MemoryFile(BytesIO(data)) as memory, memory.open() as src:
            if src.count < 3:
                raise TerrainInputError("O GeoTIFF necessita de três bandas RGB.")
            if src.crs is None:
                raise TerrainInputError("A imagem não contém CRS. Georreferencie-a antes.")
            if src.width * src.height > MAX_SOURCE_PIXELS:
                raise TerrainInputError("Textura raster demasiado grande.")
            target_transform = from_bounds(left, bottom, right, top, width, height)
            channels = np.full((3, height, width), np.nan, dtype=np.float32)
            for index in range(3):
                reproject(
                    source=rasterio.band(src, index + 1),
                    destination=channels[index],
                    src_transform=src.transform,
                    src_crs=src.crs,
                    src_nodata=src.nodata,
                    dst_transform=target_transform,
                    dst_crs=crs,
                    dst_nodata=np.nan,
                    init_dest_nodata=True,
                    resampling=Resampling.bilinear,
                    num_threads=2,
                )
            valid = np.all(np.isfinite(channels), axis=0)
            if valid.sum() < 3:
                raise TerrainInputError(
                    "A imagem não se sobrepõe ao DEM ou não contém pixels RGB válidos."
                )
            # 8-bit orthoimagery is already display-ready; multispectral reflectance
            # uses robust per-channel percentiles to generate a visual texture.
            rgba = np.zeros((height, width, 4), dtype=np.uint8)
            for index in range(3):
                values = channels[index][valid]
                if src.dtypes[index] == "uint8":
                    scaled = np.clip(channels[index], 0, 255)
                else:
                    lo, hi = np.nanpercentile(values, [2, 98])
                    scaled = np.clip((channels[index] - lo) * 255 / max(hi - lo, 1e-7), 0, 255)
                rgba[:, :, index] = np.where(valid, scaled, 0).astype("uint8")
            rgba[:, :, 3] = np.where(valid, 255, 0).astype("uint8")
            destination = BytesIO()
            Image.fromarray(rgba).save(destination, format="PNG", optimize=True)
            return {
                "imageDataUrl": "data:image/png;base64," +
                    base64.b64encode(destination.getvalue()).decode("ascii"),
                "source": filename,
                "sourceCrs": src.crs.to_string(),
                "targetCrs": crs,
                "width": width,
                "height": height,
                "validFraction": round(float(valid.mean()), 4),
                "alignment": "reprojected to terrain grid",
            }
    except TerrainInputError:
        raise
    except (rasterio.errors.RasterioError, ValueError, OverflowError) as exc:
        raise TerrainInputError("Não foi possível ler e alinhar a textura RGB.") from exc
