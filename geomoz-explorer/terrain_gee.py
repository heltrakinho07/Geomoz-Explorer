"""Bounded Copernicus GLO-30 terrain preview through existing user-authenticated GEE."""
from __future__ import annotations

import math
from io import BytesIO
from urllib.parse import urljoin, urlsplit
from zipfile import BadZipFile, ZipFile

import httpx
from shapely.geometry import shape

from terrain_dem import MAX_UPLOAD_BYTES, TerrainInputError, dem_to_preview


PRO_QUALITY_TARGETS = {"standard": 180, "detailed": 360, "maximum": 600}


def preview_scale_m(region_geojson: dict, quality: str = "standard") -> int:
    """Choose a bounded scale for Pro preview up to 600 cells per axis.

    Geographic span is an estimate only, used for resource admission.
    The raster itself is subsequently reprojected by Rasterio.
    """
    if quality not in PRO_QUALITY_TARGETS:
        raise TerrainInputError("Qualidade de DEM inválida.")
    region = shape(region_geojson)
    if region.is_empty or not region.is_valid:
        raise TerrainInputError("A geometria da área de estudo é inválida.")
    west, south, east, north = region.bounds
    if not all(math.isfinite(v) for v in (west, south, east, north)):
        raise TerrainInputError("Área geográfica inválida.")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise TerrainInputError("Seleccione uma área geográfica válida sem atravessar o antimeridiano.")
    mid_lat = (south + north) / 2
    lon_span_m = (east - west) * 111_320 * max(0.01, math.cos(math.radians(mid_lat)))
    lat_span_m = (north - south) * 111_320
    # Never request an unbounded global raster, even at coarse resolution.
    estimated_scale = math.ceil(max(lon_span_m, lat_span_m) / PRO_QUALITY_TARGETS[quality])
    if estimated_scale > 30_000:
        raise TerrainInputError("Área de estudo demasiado extensa. Reduza a extensão para gerar o DEM.")
    return max(30, estimated_scale)



def fetch_signed_gee_geotiff(download_url: str) -> bytes:
    """Fetch only a Google-signed GeoTIFF, enforcing redirected hosts and ZIP limits.

    A single shared bounded downloader serves DEM and imagery exports.
    """
    if not isinstance(download_url, str) or not download_url:
        raise TerrainInputError("Ligação de exportação GEE inválida.")
    chunks: list[bytes] = []
    total = 0
    current_url = download_url
    # Do not automatically follow redirects: every destination is checked to
    # prevent a signed Google URL from being used for arbitrary server requests.
    with httpx.Client(timeout=90.0, follow_redirects=False, trust_env=False) as client:
        for _redirect in range(5):
            parsed = urlsplit(current_url)
            host = (parsed.hostname or "").lower().rstrip(".")
            allowed = (
                host == "googleapis.com" or host.endswith(".googleapis.com")
                or host == "google.com" or host.endswith(".google.com")
                or host == "googleusercontent.com" or host.endswith(".googleusercontent.com")
            )
            if parsed.scheme != "https" or not allowed or parsed.username or parsed.password:
                raise TerrainInputError("Destino de exportação GEE não reconhecido.")
            with client.stream("GET", current_url) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location")
                    if not location:
                        raise TerrainInputError("Redireccionamento GEE sem destino.")
                    current_url = urljoin(current_url, location)
                    continue
                response.raise_for_status()
                for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise TerrainInputError("Recorte GEE demasiado grande. Reduza a área de estudo.")
                    chunks.append(chunk)
                break
        else:
            raise TerrainInputError("Demasiados redireccionamentos na exportação GEE.")
    raw = b"".join(chunks)
    if raw.startswith(bytes((0x50, 0x4B, 0x03, 0x04))):
        try:
            with ZipFile(BytesIO(raw)) as archive:
                candidates = [entry for entry in archive.infolist()
                              if entry.filename.lower().endswith((".tif", ".tiff"))
                              and not entry.is_dir()]
                if len(candidates) != 1 or candidates[0].file_size > MAX_UPLOAD_BYTES:
                    raise TerrainInputError("A exportação GEE não contém um único GeoTIFF válido.")
                with archive.open(candidates[0]) as entry:
                    raw = entry.read(MAX_UPLOAD_BYTES + 1)
                if len(raw) > MAX_UPLOAD_BYTES:
                    raise TerrainInputError("O DEM descompactado excede 32 MB.")
        except BadZipFile as exc:
            raise TerrainInputError("A exportação ZIP do GEE está corrompida.") from exc
    return raw


def copernicus_to_preview(region_geojson: dict, quality: str = "standard") -> dict:
    """Fetch a signed GEE export, enforce size limit and discard all source bytes."""
    from gee_module import get_index_download_url

    scale = preview_scale_m(region_geojson, quality)
    result = get_index_download_url("elevation", region_geojson, scale=scale)
    download_url = result.get("downloadUrl")
    if not isinstance(download_url, str):
        raise TerrainInputError("O Earth Engine não devolveu uma ligação GeoTIFF.")
    raw = fetch_signed_gee_geotiff(download_url)
    preview = dem_to_preview(raw, "Copernicus_GLO30_GEE.tif")
    preview["geeExportScaleMeters"] = scale
    preview["geePreviewQuality"] = quality
    preview["geeNativeResolutionMeters"] = 30
    preview["geeScientificNote"] = "Pré-visualização simplificada. Para medições finais utilize o DEM original."
    preview["sourceName"] = "Copernicus GLO-30 · Google Earth Engine"
    return preview
