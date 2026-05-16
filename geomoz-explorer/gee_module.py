"""
GeoMoz GEE Integration — Google Earth Engine spectral analysis.

Authentication priority:
  1. GEE_SERVICE_ACCOUNT_KEY env var (JSON string) — recommended for production
  2. Application default credentials (~/.config/earthengine/credentials)

Environment variables:
  GEE_SERVICE_ACCOUNT_KEY  — full JSON of the service account key file
  GEE_PROJECT_ID           — GCP project ID (optional; extracted from key JSON if omitted)

Quick setup guide (shown in the UI when GEE is not configured):
  1. Sign up at https://earthengine.google.com/
  2. Create a GCP project and enable the Earth Engine API
  3. Create a service account and grant it "Earth Engine Resource Viewer" role
  4. Download the JSON key → paste its full content into GEE_SERVICE_ACCOUNT_KEY secret
  5. Optionally set GEE_PROJECT_ID to your project ID
"""

import os
import json
import threading
from typing import Tuple, Optional

_lock = threading.Lock()
_gee_initialized = False
_gee_error: Optional[str] = None


# ── Initialization ─────────────────────────────────────────────────────────────

def _init_gee() -> None:
    """Initialize GEE (idempotent; raises RuntimeError if auth fails)."""
    global _gee_initialized, _gee_error

    with _lock:
        if _gee_initialized:
            return
        if _gee_error:
            raise RuntimeError(_gee_error)

        try:
            import ee  # noqa: F401
        except ImportError:
            _gee_error = "earthengine-api package not installed."
            raise RuntimeError(_gee_error)

        sa_key_raw = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
        project_id  = os.environ.get("GEE_PROJECT_ID", "").strip() or None

        if sa_key_raw:
            try:
                key_data = json.loads(sa_key_raw)
                sa_email = key_data.get("client_email", "")
                project_id = project_id or key_data.get("project_id") or None
                if not sa_email:
                    raise ValueError("client_email missing in service account JSON")
                credentials = ee.ServiceAccountCredentials(sa_email, key_data=sa_key_raw)
                ee.Initialize(credentials, project=project_id)
                _gee_initialized = True
                return
            except Exception as exc:
                _gee_error = f"Service account auth failed: {exc}"
                raise RuntimeError(_gee_error)

        # Application default credentials (earthengine authenticate)
        try:
            ee.Initialize(project=project_id)
            _gee_initialized = True
            return
        except Exception as exc:
            _gee_error = (
                "GEE not configured. "
                "Set GEE_SERVICE_ACCOUNT_KEY (service account JSON) or run "
                "`earthengine authenticate` and set GEE_PROJECT_ID."
            )
            raise RuntimeError(_gee_error)


def reset_gee():
    """Reset GEE state (useful after setting env vars at runtime)."""
    global _gee_initialized, _gee_error
    with _lock:
        _gee_initialized = False
        _gee_error = None


# ── Status ─────────────────────────────────────────────────────────────────────

def gee_status() -> dict:
    """Return GEE connection status without raising."""
    global _gee_error
    try:
        _init_gee()
        import ee
        info = ee.String("ok").getInfo()  # lightweight ping
        sa_key = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "")
        auth_type = "service_account" if sa_key else "application_default"
        project = os.environ.get("GEE_PROJECT_ID", "")
        if not project and sa_key:
            try:
                project = json.loads(sa_key).get("project_id", "")
            except Exception:
                pass
        return {
            "connected": True,
            "auth_type": auth_type,
            "project": project,
            "message": f"GEE conectado ({auth_type})",
        }
    except Exception as exc:
        return {
            "connected": False,
            "auth_type": None,
            "project": None,
            "message": str(exc),
        }


# ── Sentinel-2 index computation ───────────────────────────────────────────────

# Sentinel-2 SR band aliases
_S2_BANDS = ["B2", "B3", "B4", "B5", "B8", "B8A", "B11", "B12", "QA60"]

INDEX_REGISTRY = {
    "ndvi": {
        "name": "NDVI — Normalized Difference Vegetation Index",
        "formula": "NDVI = (B8 − B4) / (B8 + B4)",
        "bands": "NIR (B8) e Vermelho (B4)",
        "vis": {
            "min": -0.15, "max": 0.85,
            "palette": ["8B4513", "D2B48C", "FFFACD", "ADFF2F", "32CD32", "006400"],
        },
    },
    "fe_oxide": {
        "name": "Índice de Óxidos de Ferro (B4/B2)",
        "formula": "Fe-Oxide = B4 / B2",
        "bands": "Vermelho (B4) e Azul (B2)",
        "vis": {
            "min": 0.8, "max": 2.6,
            "palette": ["FFFFFF", "FFF7BC", "FEC44F", "FE9929", "EC7014", "CC4C02", "7F2704"],
        },
    },
    "clay": {
        "name": "Índice de Argilas / SWIR (B11/B8A)",
        "formula": "Clay = B11 / B8A",
        "bands": "SWIR1 (B11) e Red-Edge3 (B8A)",
        "vis": {
            "min": 0.5, "max": 1.6,
            "palette": ["F7FBFF", "DEEBF7", "9ECAE1", "4292C6", "2171B5", "08519C", "08306B"],
        },
    },
    "hydrothermal": {
        "name": "Alteração Hidrotermal — (B11+B4)/(B8A+B3)",
        "formula": "(B11 + B4) / (B8A + B3)  [Crosta et al.]",
        "bands": "SWIR1 (B11), Vermelho (B4), Red-Edge3 (B8A), Verde (B3)",
        "vis": {
            "min": 0.7, "max": 2.2,
            "palette": ["FFFFCC", "FFEDA0", "FED976", "FEB24C", "FD8D3C", "FC4E2A", "E31A1C", "BD0026", "800026"],
        },
    },
    "bare_soil": {
        "name": "Índice de Solo Exposto (BSI)",
        "formula": "(B11+B4 − B8−B2) / (B11+B4 + B8+B2)",
        "bands": "SWIR1 (B11), Vermelho (B4), NIR (B8), Azul (B2)",
        "vis": {
            "min": -0.4, "max": 0.6,
            "palette": ["006400", "7CFC00", "FFFF00", "FFA500", "FF4500", "8B0000"],
        },
    },
}


def _mask_s2_clouds(image):
    """Mask clouds and cirrus from Sentinel-2 QA60 band; scale to [0,1]."""
    import ee
    qa = image.select("QA60")
    cloud_bit  = 1 << 10
    cirrus_bit = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    return image.updateMask(mask).divide(10000).copyProperties(image, ["system:time_start"])


def _compute_s2_composite(bbox: Tuple[float, float, float, float], start: str, end: str, cloud_pct: int):
    """Return a cloud-free Sentinel-2 SR median composite for a bounding box."""
    import ee
    west, south, east, north = bbox
    region = ee.Geometry.BBox(west, south, east, north)

    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_pct))
        .map(_mask_s2_clouds)
        .select(_S2_BANDS[:-1])  # exclude QA60 after masking
    )

    count = col.size().getInfo()
    if count == 0:
        raise ValueError(
            f"No Sentinel-2 scenes found for {start}→{end} with <{cloud_pct}% cloud cover. "
            "Try a wider date range or a higher cloud threshold."
        )

    return col.median(), count, region


def _build_index_image(s2: "ee.Image", index: str) -> "ee.Image":
    """Compute a spectral index image from a Sentinel-2 composite."""
    import ee
    if index == "ndvi":
        return s2.normalizedDifference(["B8", "B4"]).rename("index")
    elif index == "fe_oxide":
        return s2.select("B4").divide(s2.select("B2")).rename("index")
    elif index == "clay":
        return s2.select("B11").divide(s2.select("B8A")).rename("index")
    elif index == "hydrothermal":
        num = s2.select("B11").add(s2.select("B4"))
        den = s2.select("B8A").add(s2.select("B3"))
        return num.divide(den).rename("index")
    elif index == "bare_soil":
        num = s2.select("B11").add(s2.select("B4")).subtract(s2.select("B8")).subtract(s2.select("B2"))
        den = s2.select("B11").add(s2.select("B4")).add(s2.select("B8")).add(s2.select("B2"))
        return num.divide(den).rename("index")
    else:
        raise ValueError(f"Unknown index: {index!r}")


def compute_index_tile(
    index: str,
    bbox: Tuple[float, float, float, float],
    start_date: str,
    end_date: str,
    cloud_pct: int = 30,
) -> dict:
    """
    Compute a spectral index over Sentinel-2 SR and return a Leaflet tile URL.

    Parameters
    ----------
    index      : one of INDEX_REGISTRY keys
    bbox       : (west, south, east, north) in WGS-84
    start_date : ISO date string e.g. "2023-01-01"
    end_date   : ISO date string e.g. "2023-12-31"
    cloud_pct  : max cloud cover percentage for scene filtering

    Returns
    -------
    dict with keys: tileUrl, name, formula, bands, sceneCount, dateRange
    """
    import ee

    _init_gee()

    if index not in INDEX_REGISTRY:
        raise ValueError(f"Unknown index {index!r}. Valid: {list(INDEX_REGISTRY)}")

    cfg = INDEX_REGISTRY[index]
    composite, scene_count, region = _compute_s2_composite(bbox, start_date, end_date, cloud_pct)
    idx_img = _build_index_image(composite, index)

    # Visualize → RGB → get tile URL (sub-second, no pixel computation)
    vis_img  = idx_img.visualize(**cfg["vis"])
    map_data = vis_img.getMapId()
    tile_url = map_data["tile_fetcher"].url_format

    return {
        "tileUrl":    tile_url,
        "name":       cfg["name"],
        "formula":    cfg["formula"],
        "bands":      cfg["bands"],
        "sceneCount": scene_count,
        "dateRange":  f"{start_date} → {end_date}",
        "stats":      {},
    }
