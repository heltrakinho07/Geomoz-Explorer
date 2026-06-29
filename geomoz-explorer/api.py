"""
GeoMoz FastAPI backend — serves geomoz data as REST/GeoJSON endpoints.
Run: uvicorn api:app --host 0.0.0.0 --port 5001
"""

import json
import hashlib
import logging
import os
import time
from collections import defaultdict
from functools import lru_cache
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from shapely.errors import TopologicalError, GEOSException

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, field_validator, constr

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Simple in-memory rate limiter
# In production, use Redis or similar for distributed rate limiting
_rate_limit_store = defaultdict(list)
_rate_limit_max_requests = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "100"))
_rate_limit_window_seconds = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

def _check_rate_limit(client_ip: str) -> bool:
    """Check if client has exceeded rate limit."""
    now = time.time()
    # Remove old requests outside the time window
    _rate_limit_store[client_ip] = [
        req_time for req_time in _rate_limit_store[client_ip]
        if now - req_time < _rate_limit_window_seconds
    ]
    
    if len(_rate_limit_store[client_ip]) >= _rate_limit_max_requests:
        logger.warning("Rate limit exceeded for IP: %s", client_ip)
        return False
    
    _rate_limit_store[client_ip].append(now)
    return True

# Global thread pool executor for GEE operations (reused across requests)
_thread_pool_executor = ThreadPoolExecutor(max_workers=4)

app = FastAPI(title="GeoMoz API", version="2.1.0")

# CORS configuration - use environment variable for allowed origins
# Default to localhost for development, set CORS_ORIGINS env var for production
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Enable gzip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting to all requests."""
    client_ip = request.client.host if request.client else "unknown"
    
    # Skip rate limiting for health checks or if disabled
    if os.getenv("DISABLE_RATE_LIMIT", "false").lower() == "true":
        return await call_next(request)
    
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {_rate_limit_max_requests} requests per {_rate_limit_window_seconds} seconds."
        )
    
    return await call_next(request)

# ── data loaders (cached) ──────────────────────────────────────────────────────

@lru_cache(maxsize=10)
def _provinces():
    import geomoz
    gdf = geomoz.read_province().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.01, preserve_topology=True).make_valid()
    return gdf

@lru_cache(maxsize=10)
def _districts():
    import geomoz
    gdf = geomoz.read_district().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True).make_valid()
    return gdf

@lru_cache(maxsize=10)
def _geology():
    import geomoz
    gdf = geomoz.read_geology().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True).make_valid()
    return gdf


def _find_col(gdf, candidates):
    for c in candidates:
        if c in gdf.columns:
            return c
    return None


def _color_for(value: str) -> str:
    palette = [
        "#E63946","#457B9D","#2A9D8F","#E9C46A","#F4A261",
        "#264653","#8ECAE6","#219EBC","#FFB703","#FB8500",
        "#606C38","#DDA15E","#BC6C25","#52B788","#F2CC8F",
        "#023047","#A8DADC","#6D6875","#B5838D","#E76F51",
    ]
    h = int(hashlib.md5(str(value).encode()).hexdigest(), 16)
    return palette[h % len(palette)]


def _gdf_to_geojson_response(gdf) -> Response:
    geojson_str = gdf.to_json(na="null", show_bbox=False)
    return Response(content=geojson_str, media_type="application/json")


# ── region geometry helper (used by GEE endpoints) ─────────────────────────────

def _region_geojson(province: Optional[str], district: Optional[str]) -> Optional[dict]:
    """
    Return a simplified GeoJSON geometry dict for the selected area:
      - district (if both given)
      - province (if only province given)
      - None      → full Mozambique (GEE fallback uses a bbox internally)

    The geometry is simplified before being shipped to GEE so the request stays light.
    """
    from shapely.geometry import mapping

    if district:
        dist_gdf = _districts()
        dcol = _find_col(dist_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dcol:
            sub = dist_gdf[dist_gdf[dcol] == district]
            # Disambiguate by province when both are given — district names
            # are repeated across provinces (e.g. "Chibuto", "Mocuba").
            if province and len(sub) > 0:
                pcol = _find_col(dist_gdf, ["Provincia", "PROVINCIA", "NAME_1"])
                if pcol:
                    sub_p = sub[sub[pcol] == province]
                    if len(sub_p) > 0:
                        sub = sub_p
            if len(sub) > 0:
                geom = sub.geometry.union_all().simplify(0.01, preserve_topology=True)
                return mapping(geom)

    if province:
        prov_gdf = _provinces()
        pcol = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if pcol:
            sub = prov_gdf[prov_gdf[pcol] == province]
            if len(sub) > 0:
                geom = sub.geometry.union_all().simplify(0.02, preserve_topology=True)
                return mapping(geom)

    return None


# ── province summary (for AI module) ─────────────────────────────────────────

@lru_cache(maxsize=1)
def _province_summary_cached():
    import geopandas as gpd
    import pandas as pd

    geo  = _geology().copy()
    prov = _provinces().copy()

    prov_col   = _find_col(prov, ["Provincia", "PROVINCIA", "NAME_1", "name"])
    leg_col    = _find_col(geo,  ["Legend", "LEGEND", "code2006"])
    era_col    = _find_col(geo,  ["ERA"])
    period_col = _find_col(geo,  ["PERIOD"])

    if not prov_col or not leg_col:
        return []

    geo_proj = geo.to_crs("EPSG:32736")
    geo["_area_m2"] = geo_proj.geometry.area

    geo_cent = geo.copy()
    geo_cent.geometry = geo.geometry.centroid

    join_cols = [c for c in [leg_col, era_col, period_col, "_area_m2"] if c] + ["geometry"]
    joined = gpd.sjoin(geo_cent[join_cols], prov[[prov_col, "geometry"]],
                       how="left", predicate="within")

    results = []
    for prov_name, group in joined.groupby(prov_col):
        if pd.isna(prov_name):
            continue
        lith    = [str(v) for v in group[leg_col].dropna().unique().tolist()[:40]]
        eras    = [str(v) for v in group[era_col].dropna().unique().tolist()[:15]] if era_col else []
        periods = [str(v) for v in group[period_col].dropna().unique().tolist()[:15]] if period_col else []
        dominant = str(group[leg_col].mode().iloc[0]) if len(group) > 0 else "N/A"
        area_km2 = round(float(group["_area_m2"].sum()) / 1e6, 1)
        results.append({
            "province":      str(prov_name),
            "totalFeatures": int(len(group)),
            "totalUnits":    int(group[leg_col].nunique()),
            "totalAreaKm2":  area_km2,
            "dominant":      dominant,
            "eras":          eras,
            "periods":       periods,
            "lithologies":   lith,
        })
    return results


# ── endpoints ──────────────────────────────────────────────────────────────────

@app.get("/geomoz-api/health")
def health():
    return {"status": "ok", "version": "2.1.0"}


@app.get("/geomoz-api/provinces")
def get_provinces():
    return _gdf_to_geojson_response(_provinces())


@app.get("/geomoz-api/province-names")
def get_province_names():
    gdf = _provinces()
    col = _find_col(gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
    if not col:
        return {"names": [], "column": None}
    names = sorted(gdf[col].dropna().unique().tolist())
    return {"names": names, "column": col}


@app.get("/geomoz-api/districts")
def get_districts(province: Optional[str] = Query(None)):
    import geopandas as gpd
    gdf = _districts()
    if province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            prov_shape = prov_gdf[prov_gdf[prov_col] == province]
            if len(prov_shape) > 0:
                try:
                    gdf = gpd.clip(gdf, prov_shape.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip districts to province '%s': %s", province, e)
    return _gdf_to_geojson_response(gdf)


@app.get("/geomoz-api/district-names")
def get_district_names(province: Optional[str] = Query(None)):
    import geopandas as gpd
    gdf = _districts()
    if province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            prov_shape = prov_gdf[prov_gdf[prov_col] == province]
            if len(prov_shape) > 0:
                try:
                    gdf = gpd.clip(gdf, prov_shape.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip district names to province '%s': %s", province, e)
    col = _find_col(gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
    if not col:
        return {"names": [], "column": None}
    names = sorted(gdf[col].dropna().unique().tolist())
    return {"names": names, "column": col}


@app.get("/geomoz-api/geology")
def get_geology(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    color_by: str = Query("code2006"),
):
    import geopandas as gpd
    gdf = _geology().copy()

    if district:
        dist_gdf = _districts()
        dist_col = _find_col(dist_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dist_col:
            area = dist_gdf[dist_gdf[dist_col] == district]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip geology to district '%s': %s", district, e)
    elif province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            area = prov_gdf[prov_gdf[prov_col] == province]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip geology to province '%s': %s", province, e)

    color_col = color_by if color_by in gdf.columns else _find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
    if color_col:
        gdf["_color"] = gdf[color_col].fillna("Unknown").astype(str).apply(_color_for)

    return _gdf_to_geojson_response(gdf)


@app.get("/geomoz-api/stats")
def get_stats(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
):
    import geopandas as gpd
    gdf = _geology().copy()

    if district:
        dist_gdf = _districts()
        dist_col = _find_col(dist_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dist_col:
            area = dist_gdf[dist_gdf[dist_col] == district]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip stats to district '%s': %s", district, e)
    elif province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            area = prov_gdf[prov_gdf[prov_col] == province]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip stats to province '%s': %s", province, e)

    if len(gdf) == 0:
        return {"totalFeatures": 0, "totalUnits": 0, "totalAreaKm2": 0, "dominant": "N/A", "lithologies": []}

    try:
        gdf_proj = gdf.to_crs("EPSG:32736")
        gdf_proj = gdf_proj.copy()
        gdf_proj["_area_m2"] = gdf_proj.geometry.area
    except (ValueError, TopologicalError, GEOSException) as e:
        logger.warning("Failed to project geometry for area calculation: %s", e)
        gdf_proj = gdf.copy()
        gdf_proj["_area_m2"] = 0.0

    legend_col = _find_col(gdf_proj, ["Legend", "LEGEND", "code2006", "ERA"])
    total_area_km2 = round(gdf_proj["_area_m2"].sum() / 1e6, 2)

    lithologies = []
    if legend_col:
        grouped = (
            gdf_proj.groupby(legend_col, dropna=False)["_area_m2"]
            .sum().reset_index().sort_values("_area_m2", ascending=False)
        )
        for _, row in grouped.iterrows():
            name = str(row[legend_col]) if row[legend_col] else "Unknown"
            area_km2 = round(row["_area_m2"] / 1e6, 2)
            pct = round(area_km2 / total_area_km2 * 100, 1) if total_area_km2 > 0 else 0
            lithologies.append({"name": name, "areaKm2": area_km2, "percent": pct, "color": _color_for(name)})

    dominant   = lithologies[0]["name"] if lithologies else "N/A"
    unique_units = len(gdf_proj[legend_col].dropna().unique()) if legend_col else 0

    return {
        "totalFeatures": len(gdf),
        "totalUnits":    unique_units,
        "totalAreaKm2":  total_area_km2,
        "dominant":      dominant,
        "lithologies":   lithologies,
    }


@app.get("/geomoz-api/geology-colors")
def get_geology_colors(color_by: str = Query("code2006")):
    gdf = _geology()
    col = color_by if color_by in gdf.columns else _find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
    if not col:
        return {"items": []}
    vals = sorted(gdf[col].dropna().unique().tolist())
    return {
        "column": col,
        "items": [{"value": str(v), "color": _color_for(str(v))} for v in vals[:60]],
    }


@app.get("/geomoz-api/province-summary")
def get_province_summary():
    return {"provinces": _province_summary_cached()}


# ── GEE endpoints ──────────────────────────────────────────────────────────────

@app.get("/geomoz-api/gee/status")
def gee_status():
    """Check Google Earth Engine connection status."""
    from .gee_module import gee_status as _gee_status, INDEX_REGISTRY
    status = _gee_status()
    status["indices"] = list(INDEX_REGISTRY.keys())
    return status


class GEEIndexRequest(BaseModel):
    index:      str
    province:   Optional[str] = None
    district:   Optional[str] = None
    start_date: str = "2023-01-01"
    end_date:   str = "2023-12-31"
    cloud_pct:  int = 30

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_date_format(cls, v):
        try:
            from datetime import datetime
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v


class GEECompositeRequest(BaseModel):
    weights:    dict           # {"ndvi": 0.4, "fe_oxide": 0.3, ...}
    province:   Optional[str] = None
    district:   Optional[str] = None
    start_date: str = "2023-01-01"
    end_date:   str = "2023-12-31"
    cloud_pct:  int = 30

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_date_format(cls, v):
        try:
            from datetime import datetime
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v

    @field_validator('weights')
    @classmethod
    def validate_weights(cls, v):
        if not v:
            raise ValueError('weights cannot be empty')
        total = sum(v.values())
        if total == 0:
            raise ValueError('weights sum cannot be zero')
        return v


@app.post("/geomoz-api/gee/index")
async def gee_index(req: GEEIndexRequest):
    """
    Compute a spectral / terrain index via Google Earth Engine, precisely
    clipped to the selected province / district (or full Mozambique).
    Returns a GEE-hosted tile URL (~24h validity).
    """
    import asyncio
    from .gee_module import compute_index_tile, INDEX_REGISTRY

    if req.index not in INDEX_REGISTRY:
        raise HTTPException(400, f"Unknown index '{req.index}'. Valid: {list(INDEX_REGISTRY)}")

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_index_tile(req.index, region, req.start_date, req.end_date, req.cloud_pct),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE computation failed: {exc}")


@app.post("/geomoz-api/gee/composite")
async def gee_composite(req: GEECompositeRequest):
    """
    Compute a weighted, normalized sum of multiple indices.
    Each index is normalized to [0,1] using its registry range, multiplied by
    the user-provided weight (renormalized so weights sum to 1), and summed.
    """
    import asyncio
    from .gee_module import compute_composite_tile

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_composite_tile(req.weights, region, req.start_date, req.end_date, req.cloud_pct),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE composite failed: {exc}")


class GEELineamentsRequest(BaseModel):
    province:        Optional[str] = None
    district:        Optional[str] = None
    smooth_m:        int   = 30
    density_radius_m: int  = 750
    rose_samples:    int   = 4000

    @field_validator('smooth_m', 'density_radius_m', 'rose_samples')
    @classmethod
    def validate_positive_int(cls, v):
        if v <= 0:
            raise ValueError('value must be positive')
        return v


class GEETargetingRequest(BaseModel):
    mineral:          str
    province:         Optional[str] = None
    district:         Optional[str] = None
    start_date:       str = "2023-01-01"
    end_date:         str = "2023-12-31"
    cloud_pct:        int = 30
    weights_override: Optional[dict] = None
    invert_override:  Optional[list] = None
    score_threshold:  float = 0.7

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_date_format(cls, v):
        try:
            from datetime import datetime
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v

    @field_validator('score_threshold')
    @classmethod
    def validate_score_threshold(cls, v):
        if not 0 <= v <= 1:
            raise ValueError('score_threshold must be between 0 and 1')
        return v


@app.post("/geomoz-api/gee/lineaments")
async def gee_lineaments(req: GEELineamentsRequest):
    """Topographic lineaments (Canny on multi-azimuth hillshades) + rose diagram."""
    import asyncio
    from .gee_module import compute_lineaments_tile

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_lineaments_tile(
                region, req.smooth_m, req.density_radius_m, req.rose_samples,
            ),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE lineaments failed: {exc}")


@app.get("/geomoz-api/gee/minerals")
def gee_minerals():
    """List available mineral targeting presets."""
    from .gee_module import MINERAL_PRESETS
    return {
        "minerals": [
            {
                "id":          k,
                "name":        v["name"],
                "description": v["description"],
                "weights":     v["weights"],
                "invert":      v["invert"],
            }
            for k, v in MINERAL_PRESETS.items()
        ]
    }


@app.post("/geomoz-api/gee/targeting")
async def gee_targeting(req: GEETargetingRequest):
    """Mineral favorability score (0–100) via weighted preset + lineaments."""
    import asyncio
    from .gee_module import compute_targeting_tile

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_targeting_tile(
                req.mineral, region, req.start_date, req.end_date, req.cloud_pct,
                req.weights_override, req.invert_override, req.score_threshold,
            ),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE targeting failed: {exc}")


class GEEProfileRequest(BaseModel):
    coords:    list           # [[lon,lat], [lon,lat], ...]
    samples:   int = 200


class GEEContoursRequest(BaseModel):
    province:    Optional[str] = None
    district:    Optional[str] = None
    interval_m:  int = 50
    index_every: int = 5


@app.post("/geomoz-api/gee/profile")
async def gee_profile(req: GEEProfileRequest):
    """Topographic profile (DEM elevation sampled along a polyline)."""
    import asyncio
    from .gee_module import compute_profile

    loop = asyncio.get_event_loop()

    try:
        return await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_profile(req.coords, req.samples),
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE profile failed: {exc}")


@app.post("/geomoz-api/gee/contours")
async def gee_contours(req: GEEContoursRequest):
    """Contour-line tiles at user-defined equidistance from Copernicus GLO-30."""
    import asyncio
    from .gee_module import compute_contours_tile

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_contours_tile(region, req.interval_m, req.index_every),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE contours failed: {exc}")


class GEETopoClassesRequest(BaseModel):
    province:       Optional[str] = None
    district:       Optional[str] = None
    breaks:         list           # e.g. [5, 10, 30, 60]
    colors:         list           # hex, len == len(breaks)+1
    labels:         list           # len == len(breaks)+1
    include_water:  bool = True
    water_color:    str  = "#3366ff"
    water_label:    str  = "Água & Rios"


@app.post("/geomoz-api/gee/topo-classes")
async def gee_topo_classes(req: GEETopoClassesRequest):
    """User-defined topographic classes from the DEM."""
    import asyncio
    from .gee_module import compute_topo_classes_tile

    region = _region_geojson(req.province, req.district)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_topo_classes_tile(
                region, req.breaks, req.colors, req.labels,
                req.include_water, req.water_color, req.water_label,
            ),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE topo-classes failed: {exc}")


@app.get("/geomoz-api/gee/indices")
def gee_indices():
    """List available indices with metadata, grouped (spectral/landsat/terrain)."""
    from .gee_module import INDEX_REGISTRY
    return {
        "indices": [
            {
                "id":      k,
                "name":    v["name"],
                "formula": v["formula"],
                "bands":   v["bands"],
                "group":   v["group"],
                "classNames": v.get("class_names"),
            }
            for k, v in INDEX_REGISTRY.items()
        ]
    }


# ── Bacias Hidrográficas ──────────────────────────────────────────────────────

class GEEBasinsRequest(BaseModel):
    province:  Optional[str] = None
    district:  Optional[str] = None
    level:     int            = 6   # HydroBASINS level 5–8


class GEEBasinStatsRequest(BaseModel):
    geometry: dict  # GeoJSON geometry dict (Polygon / MultiPolygon)


class GEEDrainageRequest(BaseModel):
    province:  Optional[str] = None
    district:  Optional[str] = None
    threshold: int            = 500


@app.post("/geomoz-api/gee/basins")
async def gee_basins(req: GEEBasinsRequest):
    """HydroBASINS polygons that intersect the selected region."""
    import asyncio
    from .gee_module import compute_basins

    region   = _region_geojson(req.province, req.district)
    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_basins(region, req.level)
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE basins failed: {exc}")


@app.post("/geomoz-api/gee/basin-stats")
async def gee_basin_stats(req: GEEBasinStatsRequest):
    """Elevation, slope, NDVI, NDWI, precipitation + risk indices for one basin."""
    import asyncio
    from .gee_module import compute_basin_stats

    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_basin_stats(req.geometry)
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE basin-stats failed: {exc}")


@app.post("/geomoz-api/gee/drainage")
async def gee_drainage(req: GEEDrainageRequest):
    """HydroSHEDS drainage network tile for the selected region."""
    import asyncio
    from .gee_module import compute_drainage_tile

    region   = _region_geojson(req.province, req.district)
    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_drainage_tile(region, req.threshold)
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE drainage failed: {exc}")


class GEERiverNetRequest(BaseModel):
    province: Optional[str] = None
    district: Optional[str] = None


@app.post("/geomoz-api/gee/river-network")
async def gee_river_network(req: GEERiverNetRequest):
    """Multi-order river network tile (Strahler-like classification via HydroSHEDS ACC)."""
    import asyncio
    from .gee_module import compute_river_network

    region   = _region_geojson(req.province, req.district)
    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_river_network(region)
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE river-network failed: {exc}")


class GEEWatershedRequest(BaseModel):
    lat:      float
    lon:      float
    province: Optional[str] = None
    district: Optional[str] = None
    max_iter: int            = 60


@app.post("/geomoz-api/gee/watershed")
async def gee_watershed(req: GEEWatershedRequest):
    """
    D8 watershed delineation from a pour point using HydroSHEDS 15DIR.
    Returns tile URL + GeoJSON polygon + area km².
    max_iter controls how many upstream pixels to expand (~500 m/step).
    """
    import asyncio
    from .gee_module import compute_watershed_from_point

    region   = _region_geojson(req.province, req.district)
    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_watershed_from_point(
                req.lat, req.lon, region, req.max_iter
            ),
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE watershed failed: {exc}")
