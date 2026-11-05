"""Cloud-masked Sentinel-2 RGB draped on the *same projected grid* as a DEM.

Authenticated Earth Engine computations only; never accept external image URLs
from clients. GEE supplies a temporary signed GeoTIFF, downloaded through the
existing allowlisted, streaming, 32 MB GeoTIFF fetcher.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

from rasterio.crs import CRS
from rasterio.warp import transform_bounds

from terrain_dem import TerrainInputError
from terrain_gee import fetch_signed_gee_geotiff
from terrain_texture import rgb_texture_to_preview

MAX_SIDE_METRES = 300_000


def validate_imagery_grid(
    crs: str, bounds_meters: list[float], width: int, height: int
) -> tuple[list[float], list[float]]:
    """Return validated projected bounds and WGS84 footprint, fail closed."""
    if not isinstance(crs, str):
        raise TerrainInputError("O DEM não tem um CRS válido.")
    utm = crs.startswith(("EPSG:326", "EPSG:327"))
    if utm:
        try:
            zone = int(crs[8:])
        except (TypeError, ValueError):
            zone = 0
        if zone < 1 or zone > 60 or crs != f"EPSG:{int(crs[5:])}":
            raise TerrainInputError("Zona UTM do DEM inválida.")
    elif crs != "EPSG:3857":
        raise TerrainInputError("SRC não suportado para textura Sentinel-2.")
    if not 2 <= width <= 255 or not 2 <= height <= 255 or width * height > 65025:
        raise TerrainInputError("Dimensões da grelha de textura inválidas.")
    if not isinstance(bounds_meters, list) or len(bounds_meters) != 4:
        raise TerrainInputError("Extensão do DEM inválida.")
    try:
        b = [float(v) for v in bounds_meters]
    except (TypeError, ValueError) as exc:
        raise TerrainInputError("Coordenadas métricas inválidas.") from exc
    if not all(math.isfinite(v) for v in b) or b[0] >= b[2] or b[1] >= b[3]:
        raise TerrainInputError("Extensão métrica do DEM inválida.")
    if b[2] - b[0] > MAX_SIDE_METRES or b[3] - b[1] > MAX_SIDE_METRES:
        raise TerrainInputError(
            "Área demasiado extensa para RGB Sentinel-2. Recorte o DEM a 300 km por lado."
        )
    # Guard invalid projection and avoid uncontrolled global-scale GEE jobs.
    try:
        geographic = list(transform_bounds(CRS.from_string(crs), "EPSG:4326", *b, densify_pts=21))
    except Exception as exc:
        raise TerrainInputError("Não foi possível calcular a área Sentinel-2.") from exc
    west, south, east, north = geographic
    if (not all(math.isfinite(v) for v in geographic) or
            not -180 <= west < east <= 180 or not -90 <= south < north <= 90 or
            east - west >= 5 or north - south >= 5):
        raise TerrainInputError("Extensão geográfica inválida para a textura.")
    return b, geographic


def validate_imagery_period(
    start: str | None, end: str | None, cloud_pct: int
) -> tuple[str, str, int]:
    """End date is exclusive; default is the previous 12 months."""
    now = date.today()
    start_day = now - timedelta(days=365) if not start else date.fromisoformat(start)
    end_day = now + timedelta(days=1) if not end else date.fromisoformat(end)
    if not 1 <= cloud_pct <= 100:
        raise TerrainInputError("O filtro de nuvens deve estar entre 1 e 100%.")
    if (end_day <= start_day or (end_day - start_day).days > 1096 or
            end_day > now + timedelta(days=2)):
        raise TerrainInputError("O período Sentinel-2 deve ser válido e inferior a 3 anos.")
    return start_day.isoformat(), end_day.isoformat(), cloud_pct


def sentinel2_rgb_texture(
    *,
    crs: str,
    bounds_meters: list[float],
    width: int,
    height: int,
    start_date: str | None = None,
    end_date: str | None = None,
    cloud_pct: int = 30,
) -> dict:
    """Cloud-masked Sentinel-2 SR composite reprojected onto exact DEM grid."""
    from gee_module import _build_s2_composite
    import ee

    b, geo = validate_imagery_grid(crs, bounds_meters, width, height)
    start, end, clouds = validate_imagery_period(start_date, end_date, cloud_pct)
    region = ee.Geometry.Rectangle(geo, "EPSG:4326", False)
    composite, scene_count = _build_s2_composite(region, start, end, clouds)
    visual = composite.select(["B4", "B3", "B2"]).visualize(
        min=0.025, max=0.32, gamma=1.2
    )
    left, bottom, right, top = b
    transform = [(right - left) / width, 0, left, 0, -(top - bottom) / height, top]
    signed_url = visual.getDownloadURL({
        "format": "GEO_TIFF",
        "filePerBand": False,
        "crs": crs,
        "crs_transform": transform,
        "dimensions": [width, height],
    })
    raw = fetch_signed_gee_geotiff(signed_url)
    result = rgb_texture_to_preview(
        raw, "Sentinel2_RGB_GEE.tif",
        crs=crs, bounds_meters=b, width=width, height=height
    )
    result.update({
        "source": "Sentinel-2 SR Harmonized · RGB verdadeiro",
        "collection": "COPERNICUS/S2_SR_HARMONIZED",
        "sceneCount": int(scene_count),
        "startDate": start,
        "endDate": end,
        "cloudPercent": clouds,
        "previewOnly": True,
        "note": "Composição mediana filtrada por nuvens, sobre o DEM simplificado."
    })
    return result
