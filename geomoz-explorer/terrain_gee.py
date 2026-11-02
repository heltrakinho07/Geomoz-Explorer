"""Bounded Copernicus GLO-30 terrain preview through existing user-authenticated GEE."""
from __future__ import annotations

import math
from io import BytesIO
from urllib.parse import urlsplit
from zipfile import BadZipFile, ZipFile

import httpx
from shapely.geometry import shape

from terrain_dem import MAX_UPLOAD_BYTES, TerrainInputError, dem_to_preview


def preview_scale_m(region_geojson: dict) -> int:
    """Choose a scale that bounds a broad AOI to about 200 x 200 cells.

    Geographic span is an estimate only, used for resource admission.
    The raster itself is subsequently reprojected by Rasterio.
    """
    west, south, east, north = shape(region_geojson).bounds
    if not all(math.isfinite(v) for v in (west, south, east, north)):
        raise TerrainInputError("Área geográfica inválida.")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise TerrainInputError("Seleccione uma área geográfica válida sem atravessar o antimeridiano.")
    mid_lat = (south + north) / 2
    lon_span_m = (east - west) * 111_320 * max(0.01, math.cos(math.radians(mid_lat)))
    lat_span_m = (north - south) * 111_320
    return min(30_000, max(30, math.ceil(max(lon_span_m, lat_span_m) / 180)))


def copernicus_to_preview(region_geojson: dict) -> dict:
    """Fetch a signed GEE export, enforce size limit and discard all source bytes."""
    from gee_module import get_index_download_url

    scale = preview_scale_m(region_geojson)
    result = get_index_download_url("elevation", region_geojson, scale=scale)
    download_url = result.get("downloadUrl")
    if not isinstance(download_url, str):
        raise TerrainInputError("O Earth Engine não devolveu uma ligação GeoTIFF.")
    parsed = urlsplit(download_url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (
        host == "googleapis.com" or host.endswith(".googleapis.com")
        or host == "google.com" or host.endswith(".google.com")
        or host.endswith(".googleusercontent.com")
    ):
        raise TerrainInputError("Destino de exportação GEE não reconhecido.")

    chunks: list[bytes] = []
    total = 0
    with httpx.Client(timeout=90.0, follow_redirects=True) as client:
        with client.stream("GET", download_url) as response:
            response.raise_for_status()
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise TerrainInputError("Recorte GEE demasiado grande. Reduza a área de estudo.")
                chunks.append(chunk)
    raw = b"".join(chunks)
    if raw.startswith(bytes((0x50, 0x4B, 0x03, 0x04))):
        try:
            with ZipFile(BytesIO(raw)) as archive:
                candidates = [entry for entry in archive.infolist()
                              if entry.filename.lower().endswith((".tif", ".tiff"))
                              and not entry.is_dir()]
                if len(candidates) != 1 or candidates[0].file_size > MAX_UPLOAD_BYTES:
                    raise TerrainInputError("A exportação GEE não contém um único GeoTIFF válido.")
                raw = archive.read(candidates[0])
        except BadZipFile as exc:
            raise TerrainInputError("A exportação ZIP do GEE está corrompida.") from exc
    preview = dem_to_preview(raw, "Copernicus_GLO30_GEE.tif")
    preview["geeExportScaleMeters"] = scale
    preview["sourceName"] = "Copernicus GLO-30 · Google Earth Engine"
    return preview
