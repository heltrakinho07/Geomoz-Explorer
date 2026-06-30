"""
GeoMoz GEE Integration — Google Earth Engine spectral + terrain analysis.

Provides:
  - Sentinel-2 spectral indices (NDVI, Fe-Oxide, Clay, Hydrothermal, BSI)
  - Landsat-8 NDVI (alternative vegetation index)
  - Copernicus GLO-30 DEM-derived terrain indices (Elevation, Hipsometry,
    Slope, Hillshade, Topographic Classification with HydroSHEDS rivers)
  - Weighted composite of multiple normalized indices

Authentication priority:
  1. GEE_SERVICE_ACCOUNT_KEY env var (JSON string) — recommended for production
  2. Application default credentials (~/.config/earthengine/credentials)
"""

import os
import json
import logging
import threading
from typing import Optional, Any

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_gee_initialized = False
_gee_error: Optional[str] = None


# ── Initialization ─────────────────────────────────────────────────────────────

def _init_gee() -> None:
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
        project_id = os.environ.get("GEE_PROJECT_ID", "").strip() or None

        # Try service account from environment variable
        key_data = None
        if sa_key_raw:
            try:
                key_data = json.loads(sa_key_raw)
            except json.JSONDecodeError as e:
                logger.warning("Failed to parse GEE_SERVICE_ACCOUNT_KEY JSON: %s", e)
                pass
        
        if key_data:
            try:
                from google.auth.transport.requests import Request
                from google.oauth2 import service_account
                
                sa_email = key_data.get("client_email", "")
                project_id = project_id or key_data.get("project_id") or None
                if not sa_email:
                    raise ValueError("client_email missing in service account JSON")
                
                pk = key_data.get("private_key", "")
                logger.info("Creating credentials for service account: %s", sa_email)
                # Create credentials from service account info
                creds = service_account.Credentials.from_service_account_info(
                    key_data,
                    scopes=[
                        "https://www.googleapis.com/auth/earthengine",
                        "https://www.googleapis.com/auth/cloud-platform",
                    ]
                )
                logger.info("Initializing EE with project: %s", project_id)
                ee.Initialize(creds, project=project_id)
                logger.info("EE initialized successfully")
                _gee_initialized = True
                return
            except Exception as exc:
                logger.error("Service account auth failed: %s", exc, exc_info=True)
                _gee_error = f"Service account auth failed: {exc}"
                raise RuntimeError(_gee_error)

        try:
            ee.Initialize(project=project_id)
            _gee_initialized = True
            return
        except Exception as exc:
            _gee_error = (
                "GEE not configured. "
                "Set GEE_SERVICE_ACCOUNT_KEY (service account JSON as string) or run "
                "`earthencine authenticate` and set GEE_PROJECT_ID."
            )
            raise RuntimeError(_gee_error)


def reset_gee():
    global _gee_initialized, _gee_error
    with _lock:
        _gee_initialized = False
        _gee_error = None


def gee_status() -> dict:
    global _gee_error
    try:
        _init_gee()
        import ee
        ee.String("ok").getInfo()
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


# ── Index registry ─────────────────────────────────────────────────────────────
#
# Each entry has:
#   group   : "spectral" (Sentinel-2), "landsat" (L8), "terrain" (DEM-derived)
#   needs   : list of inputs ("s2","l8","dem","rivers")
#   vis     : leaflet visualization params (min/max/palette)
#   norm    : (min, max) used to normalize index to [0,1] for composite mode

INDEX_REGISTRY = {
    "ndvi": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "NDVI — Vegetation (Sentinel-2)",
        "formula": "NDVI = (B8 − B4) / (B8 + B4)",
        "bands": "NIR (B8) e Vermelho (B4)",
        "vis": {"min": -0.15, "max": 0.85,
                "palette": ["8B4513","D2B48C","FFFACD","ADFF2F","32CD32","006400"]},
        "norm": (-0.2, 0.9),
    },
    "fe_oxide": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Óxidos de Ferro (B4/B2)",
        "formula": "Fe-Oxide = B4 / B2",
        "bands": "Vermelho (B4) e Azul (B2)",
        "vis": {"min": 0.8, "max": 2.6,
                "palette": ["FFFFFF","FFF7BC","FEC44F","FE9929","EC7014","CC4C02","7F2704"]},
        "norm": (0.8, 2.6),
    },
    "clay": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Argilas / SWIR (B11/B8A)",
        "formula": "Clay = B11 / B8A",
        "bands": "SWIR1 (B11) e Red-Edge3 (B8A)",
        "vis": {"min": 0.5, "max": 1.6,
                "palette": ["F7FBFF","DEEBF7","9ECAE1","4292C6","2171B5","08519C","08306B"]},
        "norm": (0.5, 1.6),
    },
    "hydrothermal": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Alteração Hidrotermal — (B11+B4)/(B8A+B3)",
        "formula": "(B11 + B4) / (B8A + B3)  [Crosta et al.]",
        "bands": "SWIR1, Vermelho, Red-Edge3, Verde",
        "vis": {"min": 0.7, "max": 2.2,
                "palette": ["FFFFCC","FFEDA0","FED976","FEB24C","FD8D3C","FC4E2A","E31A1C","BD0026","800026"]},
        "norm": (0.7, 2.2),
    },
    "bare_soil": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Solo Exposto (BSI)",
        "formula": "(B11+B4 − B8−B2) / (B11+B4 + B8+B2)",
        "bands": "SWIR1, Vermelho, NIR, Azul",
        "vis": {"min": -0.4, "max": 0.6,
                "palette": ["006400","7CFC00","FFFF00","FFA500","FF4500","8B0000"]},
        "norm": (-0.4, 0.6),
    },
    "al_oh": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Alteração Argílica/Fílica — Al-OH (B11/B12)",
        "formula": "Al-OH = B11 / B12",
        "bands": "SWIR1 (B11 ~1610 nm) e SWIR2 (B12 ~2190 nm)",
        "vis": {"min": 0.95, "max": 1.6,
                "palette": ["2b083f","5b1a78","8e2faf","c44ec0","f06ba8","ffb27f","ffe39e"]},
        "norm": (0.95, 1.6),
    },
    "ferrous": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Ferro Ferroso (Fe²⁺) — B12/B8A",
        "formula": "Ferrous = B12 / B8A",
        "bands": "SWIR2 (B12) e Red-Edge3 (B8A)",
        "vis": {"min": 0.4, "max": 1.15,
                "palette": ["052f1a","0a6b3a","3aa856","8fd17a","d7f0b0","ffffe0"]},
        "norm": (0.4, 1.15),
    },
    "gossan": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Gossan / Capa de Ferro — (B4/B2)·(B11/B12)",
        "formula": "Gossan = (B4 / B2) × (B11 / B12)",
        "bands": "Vermelho (B4), Azul (B2), SWIR1 (B11), SWIR2 (B12)",
        "vis": {"min": 1.0, "max": 3.2,
                "palette": ["ffffff","ffe9b0","ffc04d","ff8a1f","e8520f","a81a06","5c0000"]},
        "norm": (1.0, 3.2),
    },
    "ndvi_l8": {
        "group": "landsat",
        "needs": ["l8"],
        "name": "NDVI — Vegetação (Landsat 8)",
        "formula": "NDVI = (SR_B5 − SR_B4) / (SR_B5 + SR_B4)",
        "bands": "NIR (SR_B5) e Vermelho (SR_B4)",
        "vis": {"min": 0.0, "max": 0.8,
                "palette": ["ffffff","ce7e45","df923d","f1b555","fcd163","99b718","74a901",
                            "669100","528d01","3e8200","207401","056201","004c00","023b01",
                            "012e01","011d01","011301"]},
        "norm": (0.0, 0.8),
    },
    "elevation": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Elevação — DEM Copernicus GLO-30",
        "formula": "DEM smoothed (focal_mean 3m)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 2000,
                "palette": ["0a4f0a","f7f7c8","d4b06b","8d5524","ffffff"]},
        "norm": (0, 2500),
    },
    "hipsometry": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Hipsometria — Elevação Normalizada",
        "formula": "(DEM − min) / (max − min)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 1,
                "palette": ["003f5c","2f4b7c","465881","5a6a86","6f7b92",
                            "8c9aa6","b5c0c8","f7b267","f08a5d","e4572e","b71c1c"]},
        "norm": (0, 1),
    },
    "slope": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Declive (Slope) — graus",
        "formula": "ee.Terrain.slope(DEM)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 35,
                "palette": ["1a9850","91cf60","d9ef8b","fee08b","fc8d59","d73027"]},
        "norm": (0, 45),
    },
    "hillshade": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Hillshade (Sombreado de Relevo)",
        "formula": "ee.Terrain.hillshade(DEM, azimuth=315, elevation=45)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 255,
                "palette": ["000000","ffffff"]},
        "norm": (0, 255),
    },
    "topo_class": {
        "group": "terrain",
        "needs": ["dem", "rivers"],
        "name": "Classificação Topográfica (5 classes + água)",
        "formula": "DEM em [<5, 5–10, 10–30, 30–60, >60] m + água (HydroSHEDS)",
        "bands": "DEM + HydroSHEDS FreeFlowingRivers",
        "vis": {"min": 1, "max": 6,
                "palette": ["d0f0ff","a0e060","ffff66","ffb366","ff6666","3366ff"]},
        "norm": (1, 6),
        "class_names": [
            "Planície / < 5 m",
            "Planície Baixa / 5–10 m",
            "Planície Média / 10–30 m",
            "Colinas Baixas / 30–60 m",
            "Colinas Altas / > 60 m",
            "Água & Rios",
        ],
    },
}


# ── Geometry helpers ───────────────────────────────────────────────────────────

# Full Mozambique fallback (used when no province/district selected)
_MZ_BBOX = (30.2, -26.9, 40.8, -10.4)


def _to_ee_region(region_geojson: Optional[dict]):
    """Convert a GeoJSON geometry dict to ee.Geometry. None → full MZ bbox."""
    import ee
    if region_geojson is None:
        w, s, e, n = _MZ_BBOX
        return ee.Geometry.BBox(w, s, e, n)
    return ee.Geometry(region_geojson, opt_proj="EPSG:4326", opt_geodesic=False)


# ── Source data builders ──────────────────────────────────────────────────────

def _mask_s2_clouds(image):
    import ee
    qa = image.select("QA60")
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    return image.updateMask(mask).divide(10000).copyProperties(image, ["system:time_start"])


def _build_s2_composite(region, start: str, end: str, cloud_pct: int):
    import ee
    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_pct))
        .map(_mask_s2_clouds)
        .select(["B2","B3","B4","B5","B8","B8A","B11","B12"])
    )
    count = col.size().getInfo()
    if count == 0:
        raise ValueError(
            f"Sem cenas Sentinel-2 entre {start} e {end} com nuvens < {cloud_pct}%. "
            "Aumente o intervalo de datas ou a tolerância de nuvens."
        )
    return col.median(), count


def _mask_l8_clouds(image):
    import ee
    qa = image.select("QA_PIXEL")
    mask = (qa.bitwiseAnd(1 << 3).eq(0)
            .And(qa.bitwiseAnd(1 << 5).eq(0)))
    return image.updateMask(mask)


def _build_l8_composite(region, start: str, end: str, cloud_pct: int):
    import ee
    col = (
        ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUD_COVER", cloud_pct))
        .map(_mask_l8_clouds)
    )
    count = col.size().getInfo()
    if count == 0:
        raise ValueError(
            f"Sem cenas Landsat 8 entre {start} e {end} com nuvens < {cloud_pct}%. "
            "Aumente o intervalo de datas ou a tolerância de nuvens."
        )
    return col.median(), count


def _build_dem(region):
    """Copernicus GLO-30 DEM mosaic, smoothed (focal_mean 3 m, square)."""
    import ee
    dem = (
        ee.ImageCollection("COPERNICUS/DEM/GLO30")
        .select("DEM")
        .filterBounds(region)
        .mosaic()
    )
    return dem.focal_mean(3, "square", "meters").rename("DEM")


def _build_rivers_raster(region):
    """Rasterize HydroSHEDS FreeFlowingRivers within region (value 1, else 0)."""
    import ee
    rivers_fc = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers").filterBounds(region)
    return ee.Image().byte().paint(rivers_fc, 1).rename("water")


# ── Index image builder ────────────────────────────────────────────────────────

def _build_index_image(index: str, region, s2=None, l8=None, dem=None, rivers=None):
    """Build the raw index image (1 band 'index'). Caller is responsible for clip."""
    import ee

    if index == "ndvi":
        return s2.normalizedDifference(["B8", "B4"]).rename("index")
    if index == "fe_oxide":
        return s2.select("B4").divide(s2.select("B2")).rename("index")
    if index == "clay":
        return s2.select("B11").divide(s2.select("B8A")).rename("index")
    if index == "hydrothermal":
        num = s2.select("B11").add(s2.select("B4"))
        den = s2.select("B8A").add(s2.select("B3"))
        return num.divide(den).rename("index")
    if index == "bare_soil":
        num = s2.select("B11").add(s2.select("B4")).subtract(s2.select("B8")).subtract(s2.select("B2"))
        den = s2.select("B11").add(s2.select("B4")).add(s2.select("B8")).add(s2.select("B2"))
        return num.divide(den).rename("index")
    if index == "al_oh":
        # Al-OH absorption (~2200 nm) falls in B12 → high B11/B12 = sericite/kaolinite
        # (alteração argílica/fílica).
        return s2.select("B11").divide(s2.select("B12")).rename("index")
    if index == "ferrous":
        return s2.select("B12").divide(s2.select("B8A")).rename("index")
    if index == "gossan":
        ferric = s2.select("B4").divide(s2.select("B2"))
        al_oh  = s2.select("B11").divide(s2.select("B12"))
        return ferric.multiply(al_oh).rename("index")
    if index == "ndvi_l8":
        return l8.normalizedDifference(["SR_B5", "SR_B4"]).rename("index")
    if index == "elevation":
        return dem.rename("index")
    if index == "slope":
        return ee.Terrain.slope(dem).rename("index")
    if index == "hillshade":
        return ee.Terrain.hillshade(dem).rename("index")
    if index == "hipsometry":
        # Normalize DEM to [0,1] using percentile range of the region (robust to outliers).
        stats = dem.reduceRegion(
            reducer=ee.Reducer.percentile([2, 98]),
            geometry=region,
            scale=90,
            bestEffort=True,
            maxPixels=int(1e9),
        )
        dmin = ee.Number(stats.get("DEM_p2"))
        dmax = ee.Number(stats.get("DEM_p98"))
        return dem.subtract(dmin).divide(dmax.subtract(dmin)).clamp(0, 1).rename("index")
    if index == "topo_class":
        water_safe = rivers.unmask(0)
        classified = dem.expression(
            "(w == 1) ? 6"
            ": (d < 5) ? 1"
            ": (d < 10) ? 2"
            ": (d < 30) ? 3"
            ": (d < 60) ? 4"
            ": 5",
            {"d": dem, "w": water_safe},
        ).rename("index")
        return classified

    raise ValueError(f"Índice desconhecido: {index!r}")


# ── Public: single-index tile ──────────────────────────────────────────────────

def compute_index_tile(
    index: str,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
) -> dict:
    """
    Compute one spectral / terrain index, return a Leaflet tile URL.

    region_geojson : GeoJSON geometry dict (Polygon/MultiPolygon) — used both
                     for filterBounds AND .clip() so output is precisely cut.
                     If None, falls back to the full Mozambique bbox.
    """
    import ee
    _init_gee()

    if index not in INDEX_REGISTRY:
        raise ValueError(f"Índice desconhecido '{index}'. Disponíveis: {list(INDEX_REGISTRY)}")

    cfg = INDEX_REGISTRY[index]
    region = _to_ee_region(region_geojson)

    s2 = l8 = dem = rivers = None
    scene_count = 0

    needs = cfg["needs"]
    if "s2" in needs:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs:
        l8, scene_count = _build_l8_composite(region, start_date, end_date, cloud_pct)
    if "dem" in needs:
        dem = _build_dem(region)
    if "rivers" in needs:
        rivers = _build_rivers_raster(region)

    idx_img = _build_index_image(index, region, s2=s2, l8=l8, dem=dem, rivers=rivers).clip(region)
    vis_img = idx_img.visualize(**cfg["vis"])
    map_data = vis_img.getMapId()
    tile_url = map_data["tile_fetcher"].url_format

    return {
        "tileUrl":    tile_url,
        "name":       cfg["name"],
        "formula":    cfg["formula"],
        "bands":      cfg["bands"],
        "group":      cfg["group"],
        "sceneCount": scene_count,
        "dateRange":  f"{start_date} → {end_date}" if cfg["group"] != "terrain" else "Estático (DEM)",
        "stats":      {},
        "classNames": cfg.get("class_names"),
    }


# ── Public: weighted composite of multiple indices ─────────────────────────────

def compute_composite_tile(
    weights: dict,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
) -> dict:
    """
    Build a weighted, normalized sum of multiple indices.

    weights : { index_id: weight_float } — only positive weights are used,
              and they are renormalized so they sum to 1.
    """
    import ee
    _init_gee()

    # Filter & normalize weights
    pos = {k: float(v) for k, v in weights.items() if v and float(v) > 0 and k in INDEX_REGISTRY}
    if not pos:
        raise ValueError("Pelo menos um índice com peso > 0 é necessário.")
    total = sum(pos.values())
    pos = {k: v / total for k, v in pos.items()}

    region = _to_ee_region(region_geojson)

    # Build shared data sources once (avoid duplicate work)
    needs_set = set()
    for k in pos:
        needs_set.update(INDEX_REGISTRY[k]["needs"])

    s2 = l8 = dem = rivers = None
    scene_count = 0
    if "s2" in needs_set:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs_set:
        l8_c, l8_n = _build_l8_composite(region, start_date, end_date, cloud_pct)
        l8 = l8_c
        scene_count = max(scene_count, l8_n)
    if "dem" in needs_set:
        dem = _build_dem(region)
    if "rivers" in needs_set:
        rivers = _build_rivers_raster(region)

    composite = None
    for k, w in pos.items():
        cfg = INDEX_REGISTRY[k]
        img = _build_index_image(k, region, s2=s2, l8=l8, dem=dem, rivers=rivers)
        nmin, nmax = cfg["norm"]
        # normalize to [0,1] using fixed registry range, then weight
        norm = img.subtract(nmin).divide(nmax - nmin).clamp(0, 1)
        weighted = norm.multiply(w)
        composite = weighted if composite is None else composite.add(weighted)

    composite = composite.clamp(0, 1).clip(region)

    vis_img = composite.visualize(min=0, max=1,
                                  palette=["2c7bb6", "abd9e9", "ffffbf", "fdae61", "d7191c"])
    map_data = vis_img.getMapId()
    tile_url = map_data["tile_fetcher"].url_format

    return {
        "tileUrl":    tile_url,
        "name":       "Composto Ponderado",
        "formula":    " + ".join(f"{w:.2f}×{k}" for k, w in pos.items()),
        "bands":      "Combinação normalizada [0,1]",
        "group":      "composite",
        "sceneCount": scene_count,
        "dateRange":  f"{start_date} → {end_date}",
        "weights":    pos,
        "stats":      {},
    }


# ── Lineaments / structural analysis ──────────────────────────────────────────
#
# Workflow:
#   1. Build smoothed DEM (Copernicus GLO-30)
#   2. Generate multi-azimuth hillshades (4 directions, sun elev 35°)
#   3. Apply Canny edge detector to each → take the per-pixel max
#   4. Convert to binary edge map (1 = edge)
#   5. Density: focal_mean over ~750 m radius → "lineament density" 0..1
#   6. Orientation: Sobel gradient direction sampled where edges exist →
#      build 18-bin rose-diagram (0..180°, bidirectional)
#
# This is a heuristic — it captures topographic lineaments (faults, fractures,
# major drainage). It is not a substitute for expert structural mapping.

_LINEAMENT_DENSITY_PALETTE = [
    "000033", "1a0066", "330099", "6600cc", "9933cc",
    "cc3399", "ff3366", "ff6600", "ffaa00", "ffff00",
]

_SOBEL_X = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
_SOBEL_Y = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]


def _build_lineament_layers(region, smooth_m: int = 30, density_radius_m: int = 750):
    """
    Return a dict with:
      'edges_bin'  — binary edge image (1 = edge, masked elsewhere)
      'density'    — focal_mean over `density_radius_m` of edges (0..1)
      'direction'  — Sobel gradient direction in degrees (0..180, bidirectional)
    """
    import ee
    dem = _build_dem(region)
    dem_s = dem.focal_mean(smooth_m, "circle", "meters")

    # Sobel gradients for orientation
    kx = ee.Kernel.fixed(3, 3, _SOBEL_X, -1, -1, False)
    ky = ee.Kernel.fixed(3, 3, _SOBEL_Y, -1, -1, False)
    gx = dem_s.convolve(kx)
    gy = dem_s.convolve(ky)
    # Bidirectional orientation in degrees [0,180)
    direction = (
        gy.atan2(gx).multiply(180.0 / 3.141592653589793)
          .add(360).mod(180)
          .rename("dir")
    )

    # Multi-azimuth Canny → union (max)
    edges = None
    for az in (0, 45, 90, 135):
        hs = ee.Terrain.hillshade(dem_s, az, 35)
        canny = ee.Algorithms.CannyEdgeDetector(image=hs, threshold=8, sigma=1)
        edges = canny if edges is None else edges.max(canny)

    edges_bin = edges.gt(0).rename("edge").selfMask()
    density = (
        edges_bin.unmask(0)
                 .focal_mean(density_radius_m, "circle", "meters")
                 .rename("density")
    )
    return {"edges_bin": edges_bin, "density": density, "direction": direction}


def compute_lineaments_tile(
    region_geojson: Optional[dict],
    smooth_m: int = 30,
    density_radius_m: int = 750,
    rose_samples: int = 4000,
) -> dict:
    """
    Detect topographic lineaments from the DEM and return:
      - density tile (heat-style)
      - edges tile (crisp cyan lines)
      - rose-diagram bins (18 × 10°)
      - approximate mean density inside the region
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    layers = _build_lineament_layers(region, smooth_m=smooth_m,
                                     density_radius_m=density_radius_m)
    density = layers["density"].clip(region)
    edges = layers["edges_bin"].clip(region)

    # Mask out near-zero density so background is transparent (not dark navy)
    density_masked = density.updateMask(density.gt(0.003))
    density_vis = density_masked.visualize(min=0.003, max=0.35,
                                           palette=_LINEAMENT_DENSITY_PALETTE)
    edges_vis = edges.visualize(palette=["00f0ff"])

    density_map = density_vis.getMapId()
    edges_map = edges_vis.getMapId()

    # Orientation rose
    masked_dir = layers["direction"].updateMask(layers["edges_bin"])
    sample_fc = masked_dir.sample(
        region=region, scale=90, numPixels=rose_samples, dropNulls=True, seed=42,
    )
    try:
        dirs = sample_fc.aggregate_array("dir").getInfo() or []
    except Exception:
        dirs = []

    bins = [0] * 18
    for d in dirs:
        try:
            idx = int(float(d) // 10) % 18
            bins[idx] += 1
        except Exception:
            continue
    total = sum(bins) or 1
    rose = [{"bin_deg": i * 10, "count": c, "pct": c / total}
            for i, c in enumerate(bins)]

    # Mean density (rough estimate). unmask(0) so partial nodata doesn't null
    # the reducer over large regions.
    try:
        mean_density = density.unmask(0).reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region,
            scale=200, bestEffort=True, maxPixels=int(1e9),
        ).get("density").getInfo()
    except Exception:
        mean_density = None

    return {
        "tileUrl":        density_map["tile_fetcher"].url_format,
        "edgesTileUrl":   edges_map["tile_fetcher"].url_format,
        "name":           "Lineamentos — Densidade Estrutural",
        "formula":        "Canny multi-azimute (DEM) → densidade focal 750 m",
        "bands":          "Copernicus GLO-30 DEM",
        "group":          "structural",
        "rose":           rose,
        "sampleCount":    len(dirs),
        "meanDensity":    mean_density,
        "palette":        _LINEAMENT_DENSITY_PALETTE,
        "vis":            {"min": 0, "max": 0.35, "palette": _LINEAMENT_DENSITY_PALETTE},
    }


# ── Mineral targeting (presets over weighted composite + lineaments) ──────────
#
# Each preset declares which indices to combine (positive weights) and which
# to invert (1 - x) before summing. "lineaments" is a pseudo-index computed
# from the DEM on the fly. Weights are renormalized to sum to 1.

MINERAL_PRESETS: dict = {
    "gold": {
        "name": "Ouro (hidrotermal)",
        "description": (
            "Targeting clássico de ouro orogénico/epitermal: alteração "
            "hidrotermal, capeamento de Fe-óxidos e densidade estrutural."
        ),
        "weights": {
            "hydrothermal": 0.35,
            "fe_oxide":     0.20,
            "lineaments":   0.25,
            "clay":         0.10,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "fe_oxide": {
        "name": "Ferro / Fe-óxidos",
        "description": "BIFs e capeamentos lateríticos ricos em hematita/goethita.",
        "weights": {
            "fe_oxide":   0.50,
            "bare_soil":  0.20,
            "hydrothermal": 0.15,
            "lineaments": 0.15,
        },
        "invert": [],
    },
    "copper": {
        "name": "Cobre (pórfiro / IOCG)",
        "description": "Sistemas porfiríticos / IOCG — argilas, Fe-óxidos e estruturas.",
        "weights": {
            "hydrothermal": 0.30,
            "fe_oxide":     0.25,
            "clay":         0.15,
            "lineaments":   0.20,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "pegmatite": {
        "name": "Pegmatitos (Li, Ta, gemas)",
        "description": (
            "Pegmatitos LCT — controlo estrutural forte (zonas de cisalhamento), "
            "associados a granitos com solo exposto."
        ),
        "weights": {
            "lineaments": 0.35,
            "clay":       0.20,
            "fe_oxide":   0.15,
            "bare_soil":  0.15,
            "slope":      0.15,
        },
        "invert": ["slope"],
    },
    "bauxite": {
        "name": "Bauxite",
        "description": "Lateritas em superfícies planas elevadas, ricas em argila.",
        "weights": {
            "clay":       0.35,
            "bare_soil":  0.20,
            "hipsometry": 0.20,
            "ndvi":       0.15,
            "slope":      0.10,
        },
        "invert": ["ndvi", "slope"],
    },
    "graphite": {
        "name": "Grafite",
        "description": "Xistos grafitosos — controlo estrutural + assinatura clay/hydrothermal.",
        "weights": {
            "clay":         0.25,
            "hydrothermal": 0.20,
            "lineaments":   0.30,
            "bare_soil":    0.15,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "coal": {
        "name": "Carvão (proxy)",
        "description": (
            "Apenas indicativo: bacias sedimentares planas, baixa elevação, "
            "solo exposto. Confirmação requer mapeamento estratigráfico."
        ),
        "weights": {
            "bare_soil":  0.30,
            "hipsometry": 0.25,
            "hydrothermal": 0.15,
            "lineaments": 0.10,
            "ndvi":       0.10,
            "slope":      0.10,
        },
        "invert": ["hipsometry", "ndvi", "slope"],
    },
    "heavy_sands": {
        "name": "Areias Pesadas (Ti, Zr)",
        "description": "Depósitos costeiros — solo exposto, baixa elevação, Fe-óxidos.",
        "weights": {
            "bare_soil":  0.35,
            "ndvi":       0.20,
            "hipsometry": 0.20,
            "fe_oxide":   0.15,
            "slope":      0.10,
        },
        "invert": ["ndvi", "hipsometry", "slope"],
    },
}


_TARGETING_PALETTE = [
    "0d0887", "5302a3", "8b0aa5", "b83289", "db5c68",
    "f48849", "febc2a", "ffeb24", "ffff96",
]


def compute_targeting_tile(
    mineral: str,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
    weights_override: Optional[dict] = None,
    invert_override: Optional[list] = None,
    score_threshold: float = 0.7,
) -> dict:
    """
    Build a mineral favorability score (0–100) by combining normalized indices
    according to a per-mineral preset. Returns tile URL + favorability stats.
    """
    import ee
    _init_gee()

    if mineral not in MINERAL_PRESETS:
        raise ValueError(
            f"Mineral desconhecido '{mineral}'. "
            f"Disponíveis: {list(MINERAL_PRESETS)}"
        )

    preset = MINERAL_PRESETS[mineral]
    raw_weights = dict(weights_override) if weights_override else dict(preset["weights"])
    invert_set = set(invert_override if invert_override is not None else preset["invert"])

    # Validate keys: must be registry index OR the "lineaments" pseudo-index
    pos = {}
    for k, v in raw_weights.items():
        if v is None:
            continue
        f = float(v)
        if f <= 0:
            continue
        if k != "lineaments" and k not in INDEX_REGISTRY:
            continue
        pos[k] = f
    if not pos:
        raise ValueError("Preset sem pesos positivos válidos.")
    total = sum(pos.values())
    pos = {k: v / total for k, v in pos.items()}

    region = _to_ee_region(region_geojson)

    needs_set = set()
    for k in pos:
        if k == "lineaments":
            needs_set.add("dem")
        else:
            needs_set.update(INDEX_REGISTRY[k]["needs"])

    s2 = l8 = dem = rivers = None
    scene_count = 0
    if "s2" in needs_set:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs_set:
        l8_c, l8_n = _build_l8_composite(region, start_date, end_date, cloud_pct)
        l8 = l8_c
        scene_count = max(scene_count, l8_n)
    if "dem" in needs_set:
        dem = _build_dem(region)
    if "rivers" in needs_set:
        rivers = _build_rivers_raster(region)

    lin_density = None
    if "lineaments" in pos:
        lin_density = _build_lineament_layers(region)["density"]

    composite = None
    for k, w in pos.items():
        if k == "lineaments":
            # density already in [0,1] but typically peaks ~0.3 → rescale by 3, clamp
            norm = lin_density.multiply(3).clamp(0, 1)
        else:
            cfg = INDEX_REGISTRY[k]
            img = _build_index_image(k, region, s2=s2, l8=l8, dem=dem, rivers=rivers)
            nmin, nmax = cfg["norm"]
            norm = img.subtract(nmin).divide(nmax - nmin).clamp(0, 1)
        if k in invert_set:
            norm = ee.Image(1).subtract(norm)
        weighted = norm.multiply(w)
        composite = weighted if composite is None else composite.add(weighted)

    score = composite.clamp(0, 1).clip(region).rename("score")   # 0..1
    score_pct = score.multiply(100).rename("score")              # 0..100

    vis_img = score_pct.visualize(min=0, max=100, palette=_TARGETING_PALETTE)
    map_data = vis_img.getMapId()

    # Stats: mean, p90/p95/p99, area where score >= threshold.
    # Unmask(0) ensures stats cover the full region even when individual
    # bands have nodata gaps (otherwise ee.Image.add propagates masks and
    # reduceRegion returns None for partially-masked composites).
    score_for_stats = score.unmask(0)
    try:
        stat_dict = score_for_stats.reduceRegion(
            reducer=ee.Reducer.mean().combine(
                ee.Reducer.percentile([90, 95, 99]), sharedInputs=True,
            ),
            geometry=region, scale=200, bestEffort=True, maxPixels=int(1e9),
        ).getInfo() or {}
    except Exception:
        stat_dict = {}

    try:
        favorable_mask = score_for_stats.gte(score_threshold)
        area_img = favorable_mask.multiply(ee.Image.pixelArea()).rename("area")
        area_m2 = area_img.reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region,
            scale=200, bestEffort=True, maxPixels=int(1e9),
        ).get("area").getInfo()
        favorable_km2 = (area_m2 or 0) / 1e6
    except Exception:
        favorable_km2 = None

    return {
        "tileUrl":        map_data["tile_fetcher"].url_format,
        "name":           f"Potencial Mineral — {preset['name']}",
        "mineral":        mineral,
        "mineralName":    preset["name"],
        "description":    preset["description"],
        "weights":        pos,
        "inverted":       sorted(list(invert_set)),
        "formula":        " + ".join(
                              f"{w:.2f}×{'¬' if k in invert_set else ''}{k}"
                              for k, w in pos.items()
                          ),
        "group":          "targeting",
        "sceneCount":     scene_count,
        "dateRange":      f"{start_date} → {end_date}",
        "scoreThreshold": score_threshold,
        "stats": {
            "meanScore":      stat_dict.get("score_mean"),
            "p90":            stat_dict.get("score_p90"),
            "p95":            stat_dict.get("score_p95"),
            "p99":            stat_dict.get("score_p99"),
            "favorableKm2":   favorable_km2,
        },
        "palette":        _TARGETING_PALETTE,
        "vis":            {"min": 0, "max": 100, "palette": _TARGETING_PALETTE},
    }


# ── Topographic profile (A→B) ──────────────────────────────────────────────────

def _haversine_m(lon1, lat1, lon2, lat2):
    """Great-circle distance in meters between two lon/lat pairs."""
    import math
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl   = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _interpolate_polyline(coords, n_samples: int):
    """Generate n_samples (lon,lat) points evenly along a polyline by arc length."""
    if len(coords) < 2 or n_samples < 2:
        return list(coords), [0.0] * len(coords)
    seg_lens = [_haversine_m(coords[i][0], coords[i][1],
                              coords[i + 1][0], coords[i + 1][1])
                for i in range(len(coords) - 1)]
    total = sum(seg_lens)
    if total <= 0:
        return list(coords), [0.0] * len(coords)
    out_pts, out_dists = [], []
    for i in range(n_samples):
        t = (i / (n_samples - 1)) * total            # target distance from start
        d_accum = 0.0
        for j, sl in enumerate(seg_lens):
            if d_accum + sl >= t or j == len(seg_lens) - 1:
                frac = (t - d_accum) / sl if sl > 0 else 0
                lon = coords[j][0] + frac * (coords[j + 1][0] - coords[j][0])
                lat = coords[j][1] + frac * (coords[j + 1][1] - coords[j][1])
                out_pts.append((lon, lat))
                out_dists.append(t)
                break
            d_accum += sl
    return out_pts, out_dists


def compute_profile(coords: list, n_samples: int = 200) -> dict:
    """
    Sample Copernicus GLO-30 DEM elevation along a polyline (A→B[→C…]).
    coords: [[lon,lat], [lon,lat], ...]  (≥2 points)
    Returns distance_m + elevation_m arrays + summary stats.
    """
    import ee
    _init_gee()

    if not coords or len(coords) < 2:
        raise ValueError("Perfil requer pelo menos 2 pontos.")
    n_samples = max(20, min(int(n_samples), 500))

    pts, dists = _interpolate_polyline(coords, n_samples)
    line = ee.Geometry.LineString(coords, proj="EPSG:4326", geodesic=False)
    dem = _build_dem(line.bounds().buffer(500))

    # Sample all points in one batched call
    features = [ee.Feature(ee.Geometry.Point([p[0], p[1]]), {"i": i})
                for i, p in enumerate(pts)]
    fc = ee.FeatureCollection(features)
    sampled = dem.sampleRegions(collection=fc, scale=30, geometries=False)
    rows = sampled.getInfo().get("features", [])

    # Re-order by index "i" (sampleRegions doesn't guarantee order)
    by_idx = {int(r["properties"]["i"]): r["properties"].get("DEM")
              for r in rows}
    elevations = [by_idx.get(i) for i in range(len(pts))]
    valid = [e for e in elevations if e is not None]

    if not valid:
        raise ValueError("DEM sem dados sobre o traçado (área marítima ou fora do DEM).")

    # Gain / loss along the profile (ignore null gaps)
    gain = loss = 0.0
    prev = None
    for e in elevations:
        if e is None:
            continue
        if prev is not None:
            d = e - prev
            if d > 0:
                gain += d
            else:
                loss -= d
        prev = e

    total_distance = dists[-1] if dists else 0.0
    return {
        "points":      [{"lon": p[0], "lat": p[1]} for p in pts],
        "distances_m": dists,
        "elevations_m": elevations,
        "stats": {
            "totalDistanceM": total_distance,
            "minElevM":      min(valid),
            "maxElevM":      max(valid),
            "meanElevM":     sum(valid) / len(valid),
            "gainM":         gain,
            "lossM":         loss,
            "sampleCount":   len(valid),
        },
        "name":    "Perfil Topográfico — Copernicus GLO-30",
        "formula": f"DEM amostrado em {len(pts)} pontos (scale 30 m)",
    }


# ── Contour lines (equidistance configurable) ─────────────────────────────────

_CONTOUR_PALETTE = ["8b5a2b"]            # contour-line brown
_INDEX_CONTOUR_PALETTE = ["3a1c0c"]      # index contour darker brown


def compute_contours_tile(
    region_geojson: Optional[dict],
    interval_m: int = 50,
    index_every: int = 5,
) -> dict:
    """
    Generate contour-line tiles from the DEM at a given equidistance.
    Returns:
      - tileUrl       : minor contours (every interval_m)
      - indexTileUrl  : major contours (every interval_m * index_every)
      - intervals     : list of contour elevations actually present in region
      - min/max elev  : DEM extent in region
    """
    import ee
    _init_gee()

    interval_m = max(5, min(int(interval_m), 1000))
    index_every = max(2, min(int(index_every), 10))

    region = _to_ee_region(region_geojson)
    dem = _build_dem(region).clip(region)

    # Min/max elevation in region (for UI context + intervals list)
    try:
        mm = dem.reduceRegion(
            reducer=ee.Reducer.minMax(),
            geometry=region, scale=90, bestEffort=True, maxPixels=int(1e9),
        ).getInfo() or {}
        min_elev = mm.get("DEM_min")
        max_elev = mm.get("DEM_max")
    except Exception:
        min_elev = max_elev = None

    # Contour mask = pixels whose elevation is within a small band of any multiple
    # of `interval_m`. Use symmetric distance-to-nearest-multiple for centered lines.
    line_thresh = max(0.8, interval_m * 0.05)     # ~5% of interval as line width

    minor_mod = dem.mod(interval_m)
    minor_dist = minor_mod.min(
        ee.Image.constant(interval_m).subtract(minor_mod)
    )
    minor_mask = minor_dist.lt(line_thresh).selfMask()

    # Index contours: distance to nearest multiple of interval * index_every
    major_thresh = max(line_thresh * 1.2, 1.2)
    major_step = interval_m * index_every
    major_mod = dem.mod(major_step)
    major_dist = major_mod.min(
        ee.Image.constant(major_step).subtract(major_mod)
    )
    major_mask = major_dist.lt(major_thresh).selfMask()

    minor_vis = minor_mask.visualize(palette=_CONTOUR_PALETTE)
    major_vis = major_mask.visualize(palette=_INDEX_CONTOUR_PALETTE)

    minor_map = minor_vis.getMapId()
    major_map = major_vis.getMapId()

    # Build intervals list (every interval_m between min and max)
    intervals = []
    if min_elev is not None and max_elev is not None:
        start = (int(min_elev) // interval_m + 1) * interval_m
        cur = start
        while cur < max_elev and len(intervals) < 200:
            intervals.append(cur)
            cur += interval_m

    return {
        "tileUrl":       minor_map["tile_fetcher"].url_format,
        "indexTileUrl":  major_map["tile_fetcher"].url_format,
        "name":          f"Curvas de Nível — equidistância {interval_m} m",
        "formula":       f"DEM mod {interval_m} m < {line_thresh:.1f} m (linhas-mestras a cada {interval_m * index_every} m)",
        "intervalM":     interval_m,
        "indexEvery":    index_every,
        "indexIntervalM": interval_m * index_every,
        "minElevM":      min_elev,
        "maxElevM":      max_elev,
        "intervals":     intervals,
    }


# ── Custom topographic classes (user-defined breaks) ──────────────────────────

def compute_topo_classes_tile(
    region_geojson: Optional[dict],
    breaks:        list,
    colors:        list,
    labels:        list,
    include_water: bool = True,
    water_color:   str  = "#3366ff",
    water_label:   str  = "Água & Rios",
) -> dict:
    """
    Build an elevation-classified raster from user-defined break points.

    breaks  : sorted list of elevation thresholds in meters, e.g. [5, 10, 30, 60].
              N breaks → N+1 classes (the first is "< breaks[0]", the last is "≥ breaks[-1]").
    colors  : list of hex colors, length == N+1 (one per class).
    labels  : list of human-readable labels, length == N+1.
    include_water : if True, overlay water/rivers as an extra class on top.
    """
    import ee
    _init_gee()

    if not breaks or len(breaks) < 1:
        raise ValueError("Precisa de pelo menos um limite de elevação.")
    breaks_sorted = sorted(float(b) for b in breaks)
    n_classes = len(breaks_sorted) + 1
    if len(colors) != n_classes:
        raise ValueError(f"colors deve ter {n_classes} valores ({len(breaks_sorted)} limites + 1).")
    if len(labels) != n_classes:
        raise ValueError(f"labels deve ter {n_classes} valores.")

    region = _to_ee_region(region_geojson)
    dem = _build_dem(region).clip(region)

    # Class index 1..n_classes  (class = 1 + count of breaks where DEM >= break)
    classified = ee.Image(1)
    for b in breaks_sorted:
        classified = classified.add(dem.gte(b))
    classified = classified.toInt().rename("class")

    all_colors = [c.lstrip("#") for c in colors]
    all_labels = list(labels)
    max_class = n_classes
    water_applied = False

    if include_water:
        try:
            rivers = _build_rivers_raster(region).unmask(0)
            water_idx = n_classes + 1
            classified = classified.where(rivers.eq(1), water_idx)
            all_colors.append(water_color.lstrip("#"))
            all_labels.append(water_label)
            max_class = water_idx
            water_applied = True
        except Exception:
            # Rivers source unavailable for this region — silently skip
            water_applied = False

    vis = classified.visualize(min=1, max=max_class, palette=all_colors)
    tile_url = vis.getMapId()["tile_fetcher"].url_format

    # Per-class area (km²)
    try:
        groups_data = (
            ee.Image.pixelArea().addBands(classified)
            .reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
                geometry=region, scale=90, bestEffort=True, maxPixels=int(1e9),
            ).getInfo() or {}
        )
        groups = groups_data.get("groups", []) or []
        per_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}
    except Exception:
        per_class = {}

    areas_km2 = [per_class.get(i + 1, 0.0) for i in range(max_class)]
    total = sum(areas_km2) or 1
    pct = [round(a / total * 100, 2) for a in areas_km2]

    return {
        "tileUrl":   tile_url,
        "name":      "Classes Topográficas (custom)",
        "formula":   f"DEM com {len(breaks_sorted)} limite(s) ({', '.join(f'{b:g}m' for b in breaks_sorted)})"
                     + (" + Água & Rios" if include_water else ""),
        "breaks":    breaks_sorted,
        "colors":    [f"#{c}" for c in all_colors],
        "labels":    all_labels,
        "areasKm2":  areas_km2,
        "areasPct":  pct,
        "hasWater":  water_applied,
    }


# ── Cobertura do Solo (ESA WorldCover 10 m) ─────────────────────────────────

# (código, rótulo PT, cor hex) — classes oficiais ESA WorldCover v200 (2021)
_ESA_WORLDCOVER = [
    (10,  "Floresta / Árvores",          "006400"),
    (20,  "Arbustos",                    "ffbb22"),
    (30,  "Pradaria / Herbáceo",         "ffff4c"),
    (40,  "Agricultura",                 "f096ff"),
    (50,  "Áreas construídas",           "fa0000"),
    (60,  "Solo nu / veg. esparsa",      "b4b4b4"),
    (70,  "Neve e gelo",                 "f0f0f0"),
    (80,  "Água permanente",             "0064c8"),
    (90,  "Zonas húmidas herbáceas",     "0096a0"),
    (95,  "Mangais",                     "00cf75"),
    (100, "Musgos e líquenes",           "fae6a0"),
]


def compute_landcover_tile(region_geojson: Optional[dict], stats_scale: int = 100) -> dict:
    """
    Cobertura do solo a partir do ESA WorldCover v200 (2021, 10 m), com análise
    de área (km²/%) por classe na região selecionada.

    stats_scale: resolução (m) usada apenas na redução de área — 100 m mantém o
    cálculo rápido para uma província inteira; os tiles renderizam a 10 m.
    """
    import ee
    _init_gee()

    region = _to_ee_region(region_geojson)
    img = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").clip(region)

    codes  = [c   for c, _, _ in _ESA_WORLDCOVER]
    colors = [col for _, _, col in _ESA_WORLDCOVER]

    # Remapear códigos (10,20,…,100,95) → 1..N para uma paleta contígua.
    remapped = img.remap(codes, list(range(1, len(codes) + 1))).rename("class")
    vis = remapped.visualize(min=1, max=len(codes), palette=colors)
    tile_url = vis.getMapId()["tile_fetcher"].url_format

    # Área por classe (km²) sobre os códigos originais.
    per_code: dict = {}
    try:
        groups_data = (
            ee.Image.pixelArea().addBands(img)
            .reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName="code"),
                geometry=region, scale=stats_scale, bestEffort=True, maxPixels=int(1e9),
            ).getInfo() or {}
        )
        for g in groups_data.get("groups", []) or []:
            per_code[int(g["code"])] = float(g.get("sum", 0)) / 1e6
    except Exception as exc:
        raise RuntimeError(f"Falha ao calcular áreas de cobertura do solo: {exc}")

    total = sum(per_code.values()) or 1.0
    classes = []
    for code, label, color in _ESA_WORLDCOVER:
        area = per_code.get(code, 0.0)
        classes.append({
            "code":    code,
            "label":   label,
            "color":   f"#{color}",
            "areaKm2": round(area, 2),
            "pct":     round(area / total * 100, 2),
        })
    # Ordenar a análise por área (maior → menor), mantendo a legenda completa.
    ranked = sorted(classes, key=lambda c: c["areaKm2"], reverse=True)

    return {
        "tileUrl":      tile_url,
        "name":         "Cobertura do Solo — ESA WorldCover 2021",
        "source":       "ESA/WorldCover/v200",
        "year":         2021,
        "resolution_m": 10,
        "totalKm2":     round(total, 2),
        "classes":      classes,   # ordem oficial (para a legenda)
        "ranked":       ranked,    # ordenada por área (para a análise)
        "group":        "landcover",
    }


# ── Bacias Hidrográficas (HydroBASINS + HydroSHEDS + DEM) ───────────────────

import math as _math

# Candidate collection IDs for HydroBASINS by level (availability varies by project).
# WWF/HydroATLAS/v1/Basins/level0N is the global, currently-available source (carries
# HYBAS_ID + the full HydroBASINS geometry); the legacy per-continent hybas_af_* assets
# are kept as fallbacks.
_HYDROBASINS_CANDIDATES: dict = {
    lv: [
        f"WWF/HydroATLAS/v1/Basins/level{lv:02d}",
        f"WWF/HydroSHEDS/v1/Basins/hybas_af_lev{lv:02d}_v1c",
        f"WWF/HydroSHEDS/v1/Basins/hybas_af_lev{lv:02d}",
    ]
    for lv in (5, 6, 7, 8)
}


def compute_basins(region_geojson: Optional[dict], level: int = 6) -> dict:
    """
    Return HydroBASINS polygons (level 5–8) that intersect the region.
    Tries multiple collection IDs; if all fail, returns empty result with
    'source': 'unavailable' so the frontend can suggest DEM delineation.
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    candidates = _HYDROBASINS_CANDIDATES.get(level, _HYDROBASINS_CANDIDATES[6])
    last_error = "Collection not found"

    # Keep only lightweight identity/area props (HydroATLAS carries 100s of columns).
    keep_props = ["HYBAS_ID", "UP_AREA", "SUB_AREA", "ORDER_", "MAIN_BAS", "NEXT_DOWN"]

    for coll_id in candidates:
        try:
            basins_fc = (ee.FeatureCollection(coll_id).filterBounds(region)
                         .select(keep_props, None, True))
            count     = basins_fc.size().getInfo()
            geojson   = basins_fc.limit(300).getInfo()
            styled    = basins_fc.style(color="1a73e8", fillColor="1a73e818", width=1.5)
            tile_url  = styled.getMapId()["tile_fetcher"].url_format
            return {
                "tileUrl":  tile_url,
                "geojson":  geojson,
                "count":    count,
                "level":    level,
                "source":   "hydrobasins",
                "collId":   coll_id,
            }
        except Exception as exc:
            last_error = str(exc)
            continue

    # All candidates failed — return empty result flagged for frontend
    return {
        "tileUrl":  None,
        "geojson":  None,
        "count":    0,
        "level":    level,
        "source":   "unavailable",
        "error":    last_error,
    }


def compute_basin_stats(basin_geometry: dict) -> dict:
    """
    Compute elevation, slope, NDVI, NDWI, precipitation and derived
    risk indices (erosão, cheia, potencial hidrogeológico) for one basin.

    basin_geometry : GeoJSON geometry dict (Polygon / MultiPolygon).
    """
    import ee
    _init_gee()

    region = ee.Geometry(basin_geometry)

    # DEM → elevation + slope. ee.Terrain.slope on a *mosaic* (no fixed
    # projection) returns null, so pin the DEM to its native 30 m projection.
    dem_proj = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    dem   = _build_dem(region).rename("elev")
    slope = ee.Terrain.slope(dem.setDefaultProjection(dem_proj)).rename("slope")

    # Sentinel-2 NDVI + NDWI
    has_s2 = False
    ndvi = ndwi = None
    try:
        s2, _ = _build_s2_composite(region, "2023-01-01", "2023-12-31", 60)
        ndvi = s2.normalizedDifference(["B8", "B4"]).rename("ndvi")
        ndwi = s2.normalizedDifference(["B3", "B8"]).rename("ndwi")
        has_s2 = True
    except Exception:
        pass

    # CHIRPS precipitation (2022 annual sum, mm)
    has_precip = False
    chirps = None
    try:
        chirps = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterDate("2022-01-01", "2023-01-01")
            .sum()
            .rename("precip")
        )
        has_precip = True
    except Exception:
        pass

    max_px = int(1e9)
    reducer_mm = ee.Reducer.min().combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.mean(), sharedInputs=True)

    elev_info  = dem.unmask(0).reduceRegion(reducer=reducer_mm, geometry=region, scale=90, bestEffort=True, maxPixels=max_px).getInfo()
    slope_info = slope.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=90, bestEffort=True, maxPixels=max_px).getInfo()

    ndvi_mean = ndwi_mean = None
    if has_s2:
        try:
            nv = ndvi.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=30, bestEffort=True, maxPixels=max_px).getInfo()
            nw = ndwi.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=30, bestEffort=True, maxPixels=max_px).getInfo()
            # Plain ee.Reducer.mean() keys outputs by band name, not "<band>_mean".
            ndvi_mean = nv.get("ndvi")
            ndwi_mean = nw.get("ndwi")
        except Exception:
            pass

    precip_mm_yr = 800.0  # fallback
    if has_precip:
        try:
            pr = chirps.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=5000, bestEffort=True, maxPixels=max_px).getInfo()
            precip_mm_yr = float(pr.get("precip") or 800)
        except Exception:
            pass

    area_km2 = region.area(maxError=100).getInfo() / 1e6
    perim_km = region.perimeter(maxError=100).getInfo() / 1e3

    # ── Risk indices (0–100) ──────────────────────────────────────────────────
    mean_slope = float(slope_info.get("slope") or 0)
    mean_ndvi  = float(ndvi_mean or 0.3)
    precip_n   = min(1.0, precip_mm_yr / 2000.0)
    slope_n    = min(1.0, mean_slope / 45.0)
    veg_n      = max(0.0, min(1.0, mean_ndvi))

    erosion_risk = round(slope_n * 50 + (1 - veg_n) * 30 + precip_n * 20, 1)
    flat_n       = max(0.0, 1.0 - slope_n)
    ndwi_n       = max(0.0, min(1.0, float(ndwi_mean or 0) * 2))
    flood_risk   = round(flat_n * 40 + precip_n * 40 + ndwi_n * 20, 1)
    slope_hydro  = _math.exp(-((mean_slope - 10) ** 2) / 200.0)
    hydro_pot    = round(slope_hydro * 30 + precip_n * 40 + veg_n * 30, 1)

    return {
        "areaKm2":        round(area_km2, 2),
        "perimeterKm":    round(perim_km, 2),
        "elevMinM":       round(float(elev_info.get("elev_min")  or 0), 1),
        "elevMeanM":      round(float(elev_info.get("elev_mean") or 0), 1),
        "elevMaxM":       round(float(elev_info.get("elev_max")  or 0), 1),
        "slopeMeanDeg":   round(mean_slope, 2),
        "ndviMean":       round(float(ndvi_mean), 3) if ndvi_mean is not None else None,
        "ndwiMean":       round(float(ndwi_mean), 3) if ndwi_mean is not None else None,
        "precipMmYr":     round(precip_mm_yr, 1),
        "erosionRisk":    erosion_risk,
        "floodRisk":      flood_risk,
        "hydroPotential": hydro_pot,
    }


# SCS Curve Number por classe ESA WorldCover (condição média de humidade, AMC II).
# Florestas/vegetação infiltram mais (CN baixo); urbano/água geram mais escoamento.
_ESA_CN = {10: 55, 20: 60, 30: 68, 40: 78, 50: 90, 60: 82,
           70: 90, 80: 100, 90: 88, 95: 80, 100: 70}


def compute_basin_report(basin_geometry: dict) -> dict:
    """
    Relatório hidro-ambiental completo de uma bacia: morfometria, uso do solo
    (ESA WorldCover), regime de chuva mensal (CHIRPS) e escoamento potencial
    (SCS Curve Number). Reutiliza os mesmos datasets dos restantes módulos.

    basin_geometry : GeoJSON geometry dict (Polygon / MultiPolygon).
    """
    import ee
    _init_gee()

    region = ee.Geometry(basin_geometry)
    max_px = int(1e9)

    # ── Morfometria ────────────────────────────────────────────────────────────
    # Slope on a mosaic needs a fixed projection or ee.Terrain.slope returns null.
    dem_proj = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    dem   = _build_dem(region).rename("elev")
    slope = ee.Terrain.slope(dem.setDefaultProjection(dem_proj)).rename("slope")
    relief = dem.addBands(slope)
    reducer_ms = (ee.Reducer.min().combine(ee.Reducer.max(), sharedInputs=True)
                  .combine(ee.Reducer.mean(), sharedInputs=True))
    rinfo = relief.unmask(0).reduceRegion(
        reducer=reducer_ms, geometry=region, scale=90, bestEffort=True, maxPixels=max_px,
    ).getInfo()

    area_km2 = region.area(maxError=100).getInfo() / 1e6
    perim_km = region.perimeter(maxError=100).getInfo() / 1e3
    area_km2 = max(area_km2, 1e-6)

    # Densidade de drenagem ≈ (nº de células-canal × ~0.5 km) / área
    acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    stream_cells = (
        acc.gte(200).selfMask().clip(region)
        .reduceRegion(reducer=ee.Reducer.count(), geometry=region, scale=500,
                      bestEffort=True, maxPixels=max_px).getInfo().get("b1") or 0
    )
    drainage_density = round((float(stream_cells) * 0.5) / area_km2, 3)
    # Compacidade de Gravelius (1 = circular; >1 = alongada)
    compactness = round(0.2821 * perim_km / (area_km2 ** 0.5), 3)
    # Fator de forma de Horton ≈ A / Lb², com Lb ≈ comprimento da bacia
    basin_len = max(perim_km / 2.0 - (area_km2 ** 0.5), area_km2 ** 0.5)
    form_factor = round(area_km2 / (basin_len ** 2), 3)

    # ── Uso do solo (ESA WorldCover) na bacia ───────────────────────────────────
    lc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").clip(region)
    codes  = [c   for c, _, _ in _ESA_WORLDCOVER]
    colors = [col for _, _, col in _ESA_WORLDCOVER]
    lc_vis = lc.remap(codes, list(range(1, len(codes) + 1))).visualize(
        min=1, max=len(codes), palette=colors)
    landcover_tile = lc_vis.getMapId()["tile_fetcher"].url_format

    per_code: dict = {}
    try:
        groups = (
            ee.Image.pixelArea().addBands(lc).reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName="code"),
                geometry=region, scale=100, bestEffort=True, maxPixels=max_px,
            ).getInfo() or {}
        ).get("groups", []) or []
        for g in groups:
            per_code[int(g["code"])] = float(g.get("sum", 0)) / 1e6
    except Exception:
        per_code = {}
    lc_total = sum(per_code.values()) or 1.0
    landcover = []
    for code, label, color in _ESA_WORLDCOVER:
        a = per_code.get(code, 0.0)
        if a > 0:
            landcover.append({"code": code, "label": label, "color": f"#{color}",
                              "areaKm2": round(a, 2), "pct": round(a / lc_total * 100, 2)})
    landcover.sort(key=lambda c: c["areaKm2"], reverse=True)

    # ── Chuva mensal (climatologia CHIRPS 2019–2023) ────────────────────────────
    years = 5
    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate("2019-01-01", "2024-01-01")

    def _monthly(m):
        m = ee.Number(m)
        return (chirps.filter(ee.Filter.calendarRange(m, m, "month")).sum()
                .divide(years).rename(ee.String("mon_").cat(m.int().format("%02d"))))

    monthly_img = ee.ImageCollection(ee.List.sequence(1, 12).map(_monthly)).toBands()
    mp = monthly_img.reduceRegion(reducer=ee.Reducer.mean(), geometry=region,
                                  scale=5000, bestEffort=True, maxPixels=max_px).getInfo() or {}
    precip_monthly = []
    for mm in range(1, 13):
        key = next((k for k in mp if k.endswith(f"mon_{mm:02d}")), None)
        precip_monthly.append(round(float(mp.get(key) or 0), 1))
    precip_annual = round(sum(precip_monthly), 1)

    # ── Escoamento potencial (SCS Curve Number) ─────────────────────────────────
    cn = lc.remap(list(_ESA_CN.keys()), list(_ESA_CN.values())).rename("cn")
    cn_tile = cn.visualize(min=40, max=100,
                           palette=["1a9850", "fee08b", "d73027"]).getMapId()["tile_fetcher"].url_format
    cn_mean = cn.reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=100,
                              bestEffort=True, maxPixels=max_px).getInfo().get("cn")

    return {
        "morphometry": {
            "areaKm2":          round(area_km2, 2),
            "perimeterKm":      round(perim_km, 2),
            "elevMinM":         round(float(rinfo.get("elev_min")  or 0), 1),
            "elevMeanM":        round(float(rinfo.get("elev_mean") or 0), 1),
            "elevMaxM":         round(float(rinfo.get("elev_max")  or 0), 1),
            "reliefM":          round(float(rinfo.get("elev_max") or 0) - float(rinfo.get("elev_min") or 0), 1),
            "slopeMeanDeg":     round(float(rinfo.get("slope_mean") or 0), 2),
            "slopeMaxDeg":      round(float(rinfo.get("slope_max")  or 0), 2),
            "drainageDensity":  drainage_density,
            "compactness":      compactness,
            "formFactor":       form_factor,
        },
        "landcover":      landcover,
        "landcoverTile":  landcover_tile,
        "precipMonthly":  precip_monthly,
        "precipAnnualMm": precip_annual,
        "runoff": {
            "cnMean":   round(float(cn_mean), 1) if cn_mean is not None else None,
            "cnTile":   cn_tile,
            "note":     "CN alto (vermelho) = maior escoamento / menor infiltração.",
        },
    }


def compute_drainage_tile(region_geojson: Optional[dict], threshold: int = 500) -> dict:
    """
    HydroSHEDS 15-arc-second flow accumulation thresholded → drainage network.
    threshold: minimum accumulation cells (500 ≈ medium rivers).
    """
    import ee
    _init_gee()
    region  = _to_ee_region(region_geojson)
    acc     = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    rivers  = acc.gte(threshold).selfMask().clip(region)
    vis     = rivers.visualize(palette=["1565c0"])
    tile_url = vis.getMapId()["tile_fetcher"].url_format
    return {"tileUrl": tile_url, "threshold": threshold}


def compute_river_network(region_geojson: Optional[dict]) -> dict:
    """
    Multi-order river network derived from HydroSHEDS flow accumulation.

    Stream order classification (approximate Strahler via ACC thresholds):
      1 — headwaters   (ACC ≥ 100 cells)
      2 — small        (ACC ≥ 500)
      3 — medium       (ACC ≥ 2 000)
      4 — large        (ACC ≥ 10 000)
      5 — major rivers (ACC ≥ 50 000)

    Returns one classified tile URL with palette light→dark blue, plus a
    second major-rivers-only tile for quick overlay.
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    acc    = ee.Image("WWF/HydroSHEDS/15ACC").select("b1").clip(region)

    classified = (
        ee.Image(0)
        .where(acc.gte(100),    1)
        .where(acc.gte(500),    2)
        .where(acc.gte(2_000),  3)
        .where(acc.gte(10_000), 4)
        .where(acc.gte(50_000), 5)
    ).selfMask()

    # Palette: progressively darker blue per order
    palette = ["a8d5f7", "5badf5", "1a73e8", "0d47a1", "002171"]
    tile_all = classified.visualize(min=1, max=5, palette=palette) \
                         .getMapId()["tile_fetcher"].url_format

    tile_major = acc.gte(10_000).selfMask().visualize(palette=["002171"], opacity=0.9) \
                    .getMapId()["tile_fetcher"].url_format

    return {
        "tileUrl":       tile_all,
        "majorTileUrl":  tile_major,
        "orders": {
            "1_headwaters": 100,
            "2_small":      500,
            "3_medium":     2_000,
            "4_large":      10_000,
            "5_major":      50_000,
        },
        "palette": palette,
    }


def compute_watershed_from_point(
    lat: float,
    lon: float,
    region_geojson: Optional[dict],
    max_iter: int = 60,
    level: int = 10,
) -> dict:
    """
    Delineate the basin at a clicked location.

    Primary (fast, robust): return the HydroBASINS sub-basin that contains the
    point — a real, hydrologically-defined catchment polygon returned in ~2 s,
    never hangs. `level` (6–12) controls detail (higher = smaller sub-basins).

    Fallback (slower): iterative D8 upstream expansion on HydroSHEDS 15" data,
    used only if HydroBASINS is unavailable.
    """
    import ee
    _init_gee()

    pt = ee.Geometry.Point([lon, lat])
    try:
        hb = _watershed_hydrobasins(pt, lat, lon, level)
        if hb is not None:
            return hb
    except Exception:
        pass  # fall through to the D8 method

    return _watershed_d8(lat, lon, region_geojson, max_iter)


def _watershed_hydrobasins(pt, lat: float, lon: float, level: int):
    """Containing HydroBASINS sub-basin (instant, real boundary). None if absent."""
    import ee
    keep = ["HYBAS_ID", "SUB_AREA", "UP_AREA", "ORDER_"]
    # Try the requested level first, then progressively coarser fallbacks.
    seen: list = []
    order = [level] + [l for l in (12, 10, 8, 6) if l != level]
    for lvl in order:
        if lvl in seen or not (1 <= lvl <= 12):
            continue
        seen.append(lvl)
        cid = f"WWF/HydroATLAS/v1/Basins/level{lvl:02d}"
        try:
            fc = (ee.FeatureCollection(cid).filterBounds(pt)
                  .select(keep, None, True).limit(1))
            geojson = fc.getInfo()                      # round-trip 1
            feats = geojson.get("features", [])
            if not feats:
                continue
            props = feats[0].get("properties", {})
            area_km2 = float(props.get("SUB_AREA") or 0)
            tile = (fc.style(color="0d47a1", fillColor="1565c033", width=2)
                    .getMapId()["tile_fetcher"].url_format)   # round-trip 2
            return {
                "tileUrl":   tile,
                "geojson":   geojson,
                "pourPoint": [lat, lon],
                "areaKm2":   round(float(area_km2), 2),
                "maxIter":   0,
                "level":     lvl,
                "source":    "hydrobasins",
            }
        except Exception:
            continue
    return None


def _watershed_d8(
    lat: float,
    lon: float,
    region_geojson: Optional[dict],
    max_iter: int = 60,
) -> dict:
    """
    Delineate a watershed (upstream catchment) from a pour point using the
    D8 flow-direction algorithm on HydroSHEDS 15-arc-second data.

    Algorithm:
      1. Snap pour point to nearest stream pixel (ACC ≥ 500).
      2. Seed a 1-pixel basin at the snapped location.
      3. Iteratively expand the basin by one pixel upstream per iteration
         using HydroSHEDS 15DIR flow-direction image (D8 values:
         1=E 2=SE 4=S 8=SW 16=W 32=NW 64=N 128=NE).
      4. Convert pixel mask → vector polygon.

    In pixel space (row 0 = North, row increases going South, col increases East):
      translate(dx, dy): result(col,row) = original(col-dx, row-dy)
      East  neighbor = translate(-1, 0)
      SE    neighbor = translate(-1, -1)  [col+1, row+1]
      South neighbor = translate( 0, -1)  [row+1]
      SW    neighbor = translate( 1, -1)
      West  neighbor = translate( 1,  0)
      NW    neighbor = translate( 1,  1)
      North neighbor = translate( 0,  1)
      NE    neighbor = translate(-1,  1)
    """
    import ee
    _init_gee()

    fdir = ee.Image("WWF/HydroSHEDS/15DIR").select("b1")
    acc  = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    proj = fdir.projection()   # EPSG:4326 at 15 arc-sec

    pour_pt = ee.Geometry.Point([lon, lat])

    # 1. Snap pour point to the strongest channel within 15 km.
    #    Reducer.max(N) returns the maximum of the first band (flow accumulation)
    #    together with the values of the other bands (lon/lat) at that same pixel,
    #    i.e. the coordinates of the main drainage channel near the click.
    min_acc  = 500
    snap_buf = pour_pt.buffer(15_000)
    snap_img = (
        acc.updateMask(acc.gte(min_acc))
        .addBands(ee.Image.pixelLonLat())   # bands: [b1 (acc), longitude, latitude]
    )
    snapped = snap_img.reduceRegion(
        reducer   = ee.Reducer.max(3).setOutputs(["acc", "lon", "lat"]),
        geometry  = snap_buf,
        scale     = 500,
        maxPixels = int(1e7),
        bestEffort= True,
    )
    snap_lon = snapped.get("lon")
    snap_lat = snapped.get("lat")
    # No drainage channel near the click → fail with a clear message (handler → 503).
    if snap_lon.getInfo() is None:
        raise RuntimeError(
            "Nenhum canal de drenagem encontrado perto do ponto. "
            "Clique mais perto de um rio/curso de água."
        )
    seed_pt = ee.Geometry.Point([snap_lon, snap_lat])

    # 2. Seed basin: a 600-m buffer around the pour point (≈ 1 pixel at 500 m scale)
    seed_geom = ee.Geometry(seed_pt).buffer(600)
    basin = (
        ee.Image.constant(1)
        .clip(seed_geom)
        .reproject(proj)
        .toByte()
        .rename("b")
        .unmask(0)
    )

    # 3. Iterative D8 upstream expansion
    for _ in range(max_iter):
        upstream = (
            fdir.eq(1  ).And(basin.translate(-1,  0, "pixels", proj))
            .Or(fdir.eq(2  ).And(basin.translate(-1, -1, "pixels", proj)))
            .Or(fdir.eq(4  ).And(basin.translate( 0, -1, "pixels", proj)))
            .Or(fdir.eq(8  ).And(basin.translate( 1, -1, "pixels", proj)))
            .Or(fdir.eq(16 ).And(basin.translate( 1,  0, "pixels", proj)))
            .Or(fdir.eq(32 ).And(basin.translate( 1,  1, "pixels", proj)))
            .Or(fdir.eq(64 ).And(basin.translate( 0,  1, "pixels", proj)))
            .Or(fdir.eq(128).And(basin.translate(-1,  1, "pixels", proj)))
        ).rename("b").toByte()
        basin = basin.Or(upstream).reproject(proj).unmask(0)

    basin = basin.selfMask()

    # 4. Vectorize
    clip_region = _to_ee_region(region_geojson) or pour_pt.buffer(max_iter * 600)
    vec = basin.reduceToVectors(
        geometry       = clip_region,
        scale          = 500,
        geometryType   = "polygon",
        bestEffort     = True,
        maxPixels      = int(1e9),
        labelProperty  = "basin",
    )

    area_km2 = vec.geometry().area(maxError=100).divide(1e6)

    # 5. Tile for visualization
    tile_url = (
        basin.visualize(palette=["0d47a1"], opacity=0.45)
        .getMapId()["tile_fetcher"].url_format
    )

    return {
        "tileUrl":    tile_url,
        "geojson":    vec.getInfo(),
        "pourPoint":  [lat, lon],
        "areaKm2":    round(float(area_km2.getInfo()), 2),
        "maxIter":    max_iter,
    }


# ── Geoperigos / Geohazards (cheias Sentinel-1 SAR + erosão RUSLE) ──────────────

# Flood-risk land-cover weighting reused from runoff intuition is not needed here;
# the two products below are self-contained and reuse the shared DEM/S2/CHIRPS.

def compute_flood_sar(
    region_geojson: Optional[dict],
    event_start: str,
    event_end: str,
    baseline_start: Optional[str] = None,
    baseline_end: Optional[str] = None,
) -> dict:
    """
    Flood extent from Sentinel-1 SAR (C-band, VV) — UN-SPIDER change-detection
    recommended practice. Water is smooth → low backscatter; a flood is where
    backscatter dropped sharply between a dry *baseline* and the *event* window.

    Permanent water (JRC Global Surface Water) and steep slopes (>5°) are removed,
    plus isolated speckle. Radar sees through clouds — essential during cyclones
    (legado Idai/Kenneth). Returns flood tile + permanent-water tile + area km².
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    # Default baseline: the 60 days before the event window (dry reference).
    if not (baseline_start and baseline_end):
        ev_start = ee.Date(event_start)
        baseline_end   = ev_start.advance(-1, "day")
        baseline_start = ev_start.advance(-60, "day")
    else:
        baseline_start = ee.Date(baseline_start)
        baseline_end   = ee.Date(baseline_end)

    def _s1(d0, d1):
        return (ee.ImageCollection("COPERNICUS/S1_GRD")
                .filterBounds(region).filterDate(d0, d1)
                .filter(ee.Filter.eq("instrumentMode", "IW"))
                .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                .select("VV"))

    after_col  = _s1(event_start, event_end)
    before_col = _s1(baseline_start, baseline_end)

    n_after = after_col.size().getInfo()
    if n_after == 0:
        raise RuntimeError(
            "Sem imagens Sentinel-1 no período do evento. Alargue as datas "
            "(o S1 passa a cada ~6–12 dias)."
        )
    n_before = before_col.size().getInfo()

    smooth = lambda img: img.focal_median(50, "circle", "meters")
    after  = smooth(after_col.median())
    before = smooth(before_col.median()) if n_before else after

    # Change: backscatter dropped (became water) AND is absolutely low after.
    diff  = after.subtract(before)
    flood = diff.lt(-3).And(after.lt(-15))

    # Remove permanent water (JRC occurrence > 40%) and steep terrain.
    jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    perm_water = jrc.gt(40).unmask(0)
    flood = flood.where(perm_water, 0)

    slope = ee.Terrain.slope(_build_dem(region)).clip(region)
    flood = flood.updateMask(slope.lt(5))

    # Remove isolated pixels (speckle): keep clusters ≥ 8 connected pixels.
    flood = flood.updateMask(flood)
    conn  = flood.connectedPixelCount(25, True)
    flood = flood.updateMask(conn.gte(8)).rename("flood")

    flood_area_km2 = (
        flood.multiply(ee.Image.pixelArea()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region, scale=60,
            bestEffort=True, maxPixels=int(1e10),
        ).get("flood")
    )

    flood_tile = flood.visualize(palette=["d50000"], opacity=0.85) \
                      .getMapId()["tile_fetcher"].url_format
    perm_tile  = perm_water.selfMask().visualize(palette=["1565c0"], opacity=0.6) \
                      .getMapId()["tile_fetcher"].url_format

    area_val = flood_area_km2.getInfo()
    return {
        "floodTile":     flood_tile,
        "permWaterTile": perm_tile,
        "areaKm2":       round((float(area_val) / 1e6) if area_val else 0.0, 2),
        "scenesEvent":   n_after,
        "scenesBaseline": n_before,
        "eventStart":    event_start,
        "eventEnd":      event_end,
        "source":        "sentinel-1",
    }


# RUSLE erosion-risk classes (t/ha/yr) → label/colour for legend + per-class area.
_RUSLE_CLASSES = [
    (1, "Muito baixo", "1a9850", 0,   5),
    (2, "Baixo",       "91cf60", 5,   10),
    (3, "Moderado",    "fee08b", 10,  20),
    (4, "Alto",        "fc8d59", 20,  40),
    (5, "Muito alto",  "d73027", 40,  1e9),
]


def compute_erosion_rusle(region_geojson: Optional[dict], year: int = 2023) -> dict:
    """
    Soil-loss risk via RUSLE: A = R·K·LS·C·P (t/ha/yr).
      R  — erosividade da chuva, de CHIRPS anual (R = 0.363·P + 79).
      K  — erodibilidade do solo (constante moderada 0.25; refinável c/ SoilGrids).
      LS — comprimento/declive, do DEM (Wischmeier & Smith a partir do declive %).
      C  — cobertura, de NDVI MODIS (C = exp(-2·NDVI/(1-NDVI))).
      P  — práticas de conservação (= 1, sem dados).
    Devolve tile classificado (5 classes), área por classe e A médio.
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    max_px = int(1e10)

    # R — rainfall erosivity from annual precipitation (CHIRPS).
    precip = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
              .filterDate(f"{year}-01-01", f"{year+1}-01-01").sum())
    R = precip.multiply(0.363).add(79).rename("R")

    # K — soil erodibility (moderate constant; documented limitation).
    K = ee.Image.constant(0.25).rename("K")

    # LS — from slope (%) via Wischmeier & Smith topographic factor.
    dem   = _build_dem(region)
    proj  = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    slope_deg = ee.Terrain.slope(dem.setDefaultProjection(proj))
    slope_pct = slope_deg.divide(180).multiply(_math.pi).tan().multiply(100)
    LS = (slope_pct.pow(2).multiply(0.0065)
          .add(slope_pct.multiply(0.0456)).add(0.065)).rename("LS")

    # C — cover-management from NDVI. MODIS (250 m, cloud-free composite) is used
    # instead of a Sentinel-2 median: at province scale it is adequate and ~10×
    # faster, which keeps the whole RUSLE computation interactive.
    try:
        ndvi = (ee.ImageCollection("MODIS/061/MOD13Q1")
                .filterDate(f"{year}-01-01", f"{year+1}-01-01")
                .select("NDVI").mean().multiply(0.0001).clamp(-0.99, 0.99))
        C = ndvi.multiply(-2).divide(ee.Image(1).subtract(ndvi)).exp().clamp(0, 1).rename("C")
    except Exception:
        C = ee.Image.constant(0.5).rename("C")

    A = R.multiply(K).multiply(LS).multiply(C).rename("A").clip(region)

    # Classify into the 5 risk classes.
    classified = ee.Image(0)
    for cid, _label, _color, lo, hi in _RUSLE_CLASSES:
        classified = classified.where(A.gte(lo).And(A.lt(hi)), cid)
    classified = classified.selfMask().rename("class")

    palette = [c for _, _, c, _, _ in _RUSLE_CLASSES]
    tile = classified.visualize(min=1, max=5, palette=palette, opacity=0.7) \
                     .getMapId()["tile_fetcher"].url_format

    # Per-class area (km²). Reduce at 250 m — province-scale stats don't need 90 m
    # and the coarser scale keeps the request interactive.
    groups = (ee.Image.pixelArea().addBands(classified).reduceRegion(
        reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
        geometry=region, scale=250, bestEffort=True, maxPixels=max_px,
    ).getInfo().get("groups", []) or [])
    by_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}

    classes = []
    for cid, label, color, lo, hi in _RUSLE_CLASSES:
        a = round(by_class.get(cid, 0.0), 1)
        classes.append({"id": cid, "label": label, "color": f"#{color}",
                        "range": f"{lo}–{'∞' if hi >= 1e9 else int(hi)} t/ha/ano",
                        "areaKm2": a})

    a_mean = A.reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=250,
                            bestEffort=True, maxPixels=max_px).get("A").getInfo()

    return {
        "tile":        tile,
        "classes":     classes,
        "meanTPerHa":  round(float(a_mean), 2) if a_mean is not None else None,
        "year":        year,
        "palette":     palette,
        "source":      "RUSLE · CHIRPS+DEM+MODIS",
    }


# ── Potencial de Água Subterrânea (AHP — sobreposição ponderada multicritério) ──

# Pesos AHP (somam 1.0). Derivados de estudos de hidrogeologia em climas
# semiáridos/tropicais. Sinal +1 = mais favorável quando maior; -1 = quando menor.
_GWP_FACTORS = [
    ("lineament", "Densidade de lineamentos", +1, 0.25),
    ("rainfall",  "Precipitação (CHIRPS)",    +1, 0.22),
    ("slope",     "Declive",                  -1, 0.18),
    ("drainage",  "Densidade de drenagem",    -1, 0.13),
    ("twi",       "Índice de humidade (TWI)", +1, 0.12),
    ("landcover", "Uso/cobertura do solo",    +1, 0.10),
]

# Capacidade de infiltração por classe ESA WorldCover (0–1).
_ESA_INFILTRATION = {10: 0.75, 20: 0.65, 30: 0.60, 40: 0.55, 50: 0.10,
                     60: 0.35, 70: 0.0, 80: 0.50, 90: 0.90, 95: 0.80, 100: 0.45}

_GWP_CLASSES = [
    (1, "Muito baixo", "d73027"),
    (2, "Baixo",       "fc8d59"),
    (3, "Moderado",    "fee08b"),
    (4, "Alto",        "91cf60"),
    (5, "Muito alto",  "1a9850"),
]


def compute_groundwater_ahp(region_geojson: Optional[dict], year: int = 2023) -> dict:
    """
    Mapa de potencial de água subterrânea por AHP (Analytic Hierarchy Process):
    combinação ponderada de 6 fatores hidrogeológicos normalizados (0–1):
    lineamentos, chuva, declive, densidade de drenagem, TWI e cobertura.

    GWPI = Σ wᵢ·xᵢ → classificado em 5 classes. Reutiliza os mesmos datasets
    dos restantes módulos (DEM GLO-30, HydroSHEDS, CHIRPS, ESA WorldCover).
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    max_px = int(1e10)

    # ── Fatores brutos ──────────────────────────────────────────────────────────
    dem   = _build_dem(region)
    proj  = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    slope = ee.Terrain.slope(dem.setDefaultProjection(proj)).rename("slope")

    lin_density = _build_lineament_layers(region)["density"].rename("lineament")

    precip = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
              .filterDate(f"{year}-01-01", f"{year+1}-01-01").sum().rename("rainfall"))

    acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    streams = acc.gte(200).unmask(0)
    drainage = streams.focal_mean(3000, "circle", "meters").rename("drainage")

    # TWI = ln( a / tan(beta) ); a ≈ área de contribuição a montante.
    cell_area = ee.Image.pixelArea()
    a = acc.add(1).multiply(cell_area)
    tan_b = slope.divide(180).multiply(_math.pi).tan().max(0.001)
    twi = a.divide(tan_b).log().rename("twi")

    lc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    lc_score = (lc.remap(list(_ESA_INFILTRATION.keys()),
                         [int(v * 100) for v in _ESA_INFILTRATION.values()])
                .divide(100).rename("landcover"))

    raw = {"lineament": lin_density, "rainfall": precip, "slope": slope,
           "drainage": drainage, "twi": twi, "landcover": lc_score}

    # ── Normalização min–max (uma só chamada para todas as bandas; escala grosseira
    #    para manter o pedido interativo — os fatores pesados (lineamentos via Canny)
    #    só são avaliados uma vez) ───────────────────────────────────────────────────
    stack = ee.Image.cat([raw[k].toFloat() for k, *_ in _GWP_FACTORS])
    mm = stack.reduceRegion(
        reducer=ee.Reducer.minMax(), geometry=region, scale=1000,
        bestEffort=True, maxPixels=max_px,
    ).getInfo()

    gwpi = ee.Image.constant(0)
    for key, _label, sign, weight in _GWP_FACTORS:
        vmin = mm.get(f"{key}_min")
        vmax = mm.get(f"{key}_max")
        if vmin is None or vmax is None or vmax == vmin:
            continue
        norm = raw[key].subtract(vmin).divide(vmax - vmin).clamp(0, 1)
        if sign < 0:
            norm = ee.Image(1).subtract(norm)
        gwpi = gwpi.add(norm.multiply(weight))
    gwpi = gwpi.clip(region).rename("gwpi")

    # ── Classificação em 5 classes. Como cada fator está em [0,1] e os pesos somam 1,
    #    o GWPI está em [0,1]; usamos cortes fixos calibrados (evita uma 2ª passagem
    #    de redução sobre o stack pesado). ──────────────────────────────────────────
    breaks = [0.33, 0.42, 0.50, 0.58]
    classified = (ee.Image(1)
                  .where(gwpi.gte(breaks[0]), 2)
                  .where(gwpi.gte(breaks[1]), 3)
                  .where(gwpi.gte(breaks[2]), 4)
                  .where(gwpi.gte(breaks[3]), 5)
                  .rename("class"))

    palette = [c for _, _, c in _GWP_CLASSES]
    tile = classified.visualize(min=1, max=5, palette=palette, opacity=0.7) \
                     .getMapId()["tile_fetcher"].url_format

    groups = (ee.Image.pixelArea().addBands(classified).reduceRegion(
        reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
        geometry=region, scale=500, bestEffort=True, maxPixels=max_px,
    ).getInfo().get("groups", []) or [])
    by_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}

    classes = [{"id": cid, "label": label, "color": f"#{color}",
                "areaKm2": round(by_class.get(cid, 0.0), 1)}
               for cid, label, color in _GWP_CLASSES]

    weights = [{"key": k, "label": lbl, "weight": w, "favours": "alto" if s > 0 else "baixo"}
               for k, lbl, s, w in _GWP_FACTORS]

    return {
        "tile":     tile,
        "classes":  classes,
        "weights":  weights,
        "year":     year,
        "palette":  palette,
        "source":   "AHP · lineamentos+chuva+declive+drenagem+TWI+cobertura",
    }
