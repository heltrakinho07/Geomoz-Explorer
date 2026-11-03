"""Geospatially faithful DEM decimation for GeoMoz's browser terrain studio.

Only the numeric elevation grid is returned. The original raster is never stored.
NoData stays null so the renderer can omit invalid triangles rather than invent
an elevation. The display grid is in a metric CRS with a geographic footprint.
"""
from __future__ import annotations

import math
from io import BytesIO
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform_bounds

MAX_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_SOURCE_PIXELS = 100_000_000
PREVIEW_GRID_SIZE = 193


class TerrainInputError(ValueError):
    """Invalid or unsupported DEM input; safe for a 4xx response."""


def _metric_crs(bounds4326: tuple[float, float, float, float]) -> str:
    west, south, east, north = bounds4326
    latitude = (south + north) * 0.5
    longitude = (west + east) * 0.5
    if not all(math.isfinite(v) for v in bounds4326):
        raise TerrainInputError("Os limites geográficos do DEM são inválidos.")
    if north <= south or east <= west:
        raise TerrainInputError("O DEM atravessa limites geográficos não suportados.")
    if -80 <= latitude < 84:
        zone = min(60, max(1, int((longitude + 180) // 6) + 1))
        return f"EPSG:{32600 + zone if latitude >= 0 else 32700 + zone}"
    return "EPSG:3857"


def dem_to_preview(data: bytes, filename: str = "dem.tif", size: int = PREVIEW_GRID_SIZE) -> dict[str, Any]:
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise TerrainInputError("O DEM deve ter entre 1 byte e 32 MB.")
    if not filename.lower().endswith((".tif", ".tiff")):
        raise TerrainInputError("Formato inválido. Envie um GeoTIFF (.tif ou .tiff).")
    if size < 16 or size > 257:
        raise TerrainInputError("Dimensão de pré-visualização inválida.")

    try:
        with MemoryFile(BytesIO(data)) as memfile, memfile.open() as src:
            if src.count < 1 or src.width < 2 or src.height < 2:
                raise TerrainInputError("O ficheiro não contém uma banda de elevação utilizável.")
            if src.width * src.height > MAX_SOURCE_PIXELS:
                raise TerrainInputError("Raster demasiado grande para este modo de pré-visualização.")
            if src.crs is None:
                raise TerrainInputError("O DEM precisa de um sistema de referência espacial (CRS).")
            if src.bounds.right <= src.bounds.left or src.bounds.top <= src.bounds.bottom:
                raise TerrainInputError("O DEM tem uma extensão geográfica inválida.")

            geographic = tuple(float(x) for x in transform_bounds(
                src.crs, "EPSG:4326", *src.bounds, densify_pts=21
            ))
            target_crs = _metric_crs(geographic)
            left, bottom, right, top = (
                float(x) for x in transform_bounds(src.crs, target_crs, *src.bounds, densify_pts=21)
            )
            if not all(math.isfinite(x) for x in (left, bottom, right, top)):
                raise TerrainInputError("Não foi possível projectar o DEM em metros.")
            if right <= left or top <= bottom:
                raise TerrainInputError("Extensão projectada do DEM inválida.")

            destination = np.full((size, size), np.nan, dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1),
                destination=destination,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src.nodata,
                dst_transform=from_bounds(left, bottom, right, top, size, size),
                dst_crs=target_crs,
                dst_nodata=np.nan,
                init_dest_nodata=True,
                resampling=Resampling.bilinear,
                num_threads=2,
            )
            valid = np.isfinite(destination)
            if not valid.any():
                raise TerrainInputError("O DEM não contém elevações válidas nesta área.")

            values = destination[valid]
            minimum, maximum = float(values.min()), float(values.max())
            # Explicit missing values let the WebGL mesh skip NoData cells.
            flat = [round(float(v), 2) if ok else None
                    for v, ok in zip(destination.flat, valid.flat)]
            return {
                "name": filename,
                "width": size,
                "height": size,
                "heights": flat,
                "bounds4326": list(geographic),
                "boundsMeters": [left, bottom, right, top],
                "crs": target_crs,
                "sourceCrs": src.crs.to_string(),
                "minElevation": round(minimum, 2),
                "maxElevation": round(maximum, 2),
                "meanElevation": round(float(values.mean()), 2),
                "validFraction": round(float(valid.mean()), 4),
                "cellSizeMeters": [(right - left) / size, (top - bottom) / size],
                "sourceWidth": src.width,
                "sourceHeight": src.height,
                "sourceResolution": list(map(abs, src.res)),
                "originalNodata": src.nodata,
            }
    except TerrainInputError:
        raise
    except (rasterio.errors.RasterioError, ValueError, OverflowError) as exc:
        raise TerrainInputError("Não foi possível ler o GeoTIFF. Verifique a integridade e o CRS.") from exc
