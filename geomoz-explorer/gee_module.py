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
import threading
from typing import Optional, Any

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
