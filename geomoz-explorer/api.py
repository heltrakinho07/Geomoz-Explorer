"""
GeoMoz FastAPI backend — serves geomoz data as REST/GeoJSON endpoints.
Run: uvicorn api:app --host 0.0.0.0 --port 5001
"""

import hashlib
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import geopandas as gpd
from shapely.errors import TopologicalError, GEOSException

from fastapi import FastAPI, Query, HTTPException, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import Depends

try:
    firebase_admin.initialize_app()
except ValueError:
    pass

def _admin_uid_allowlist() -> set[str]:
    return {
        uid.strip()
        for uid in os.environ.get("GEOMOZ_ADMIN_UIDS", "").split(",")
        if uid.strip()
    }


async def require_firebase_auth(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token Firebase ausente ou inválido.")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token Firebase ausente ou inválido.")
    try:
        decoded = firebase_auth.verify_id_token(token)
        uid = decoded.get("uid")
        if not uid:
            raise ValueError("uid ausente")
        return uid
    except HTTPException:
        raise
    except Exception:
        # Never return verifier internals or token details to clients.
        raise HTTPException(status_code=401, detail="Token Firebase inválido.")


async def require_admin_auth(request: Request) -> str:
    """Require a Firebase-authenticated GeoMoz administrator.

    Admin status can come from a Firebase custom claim (admin=true) or from the
    server-side GEOMOZ_ADMIN_UIDS allowlist. The allowlist is useful during the
    migration to custom claims and never leaves the backend.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Autenticação administrativa necessária.")

    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Autenticação administrativa necessária.")

    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token Firebase inválido.")

    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token Firebase inválido.")

    is_admin = decoded.get("admin") is True or uid in _admin_uid_allowlist()
    if not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Esta operação requer privilégios de administrador.",
        )

    return uid


def require_gee_auth(uid: str = Depends(require_firebase_auth)):
    """Hold the process-global Earth Engine context for the full request."""
    from gee_module import gee_execution

    with gee_execution(uid):
        yield uid
from pydantic import BaseModel, Field, field_validator, constr

# ── Package imports ────────────────────────────────────────────────────────
# These modules are siblings of api.py in the geomoz-explorer directory.
# Because the directory name contains a hyphen, it cannot be a valid Python
# package. The recommended setup is:
#   pip install -e geomoz-explorer/
# which installs it as a proper package via pyproject.toml.
#
# For development without installation, we fall back to adding the directory
# to sys.path manually.

try:
    # Standard imports — work when the package is installed (pip install -e .)
    from utils.common import find_col, color_for
except ImportError:
    # Fallback: add this directory to sys.path for dev mode
    _this_dir = os.path.dirname(os.path.abspath(__file__))
    if _this_dir not in sys.path:
        sys.path.insert(0, _this_dir)
    from utils.common import find_col, color_for

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Enable KML/GPX reading in fiona/geopandas
try:
    import fiona
    fiona.drvsupport.supported_drivers['KML'] = 'rw'
    fiona.drvsupport.supported_drivers['GPX'] = 'rw'
    fiona.drvsupport.supported_drivers['kml'] = 'rw'
    fiona.drvsupport.supported_drivers['gpx'] = 'rw'
except ImportError:
    logger.warning("Fiona not installed, KML/GPX upload may fail.")


# Simple in-memory rate limiter
# In production, use Redis or similar for distributed rate limiting
_rate_limit_store = defaultdict(list)
_rate_limit_max_requests = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "240"))
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
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Enable gzip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

def _rate_limit_identity(request: Request) -> str:
    """Build a non-sensitive rate-limit key suitable behind Firebase/Cloud Run."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        if token:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]
            return f"auth:{digest}"

    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        # Google/Firebase proxies append forwarding metadata. For anonymous
        # read-only traffic the first address is sufficient as a best-effort
        # limiter and avoids grouping every visitor under the proxy address.
        first = forwarded.split(",", 1)[0].strip()
        if first:
            return f"ip:{first}"

    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply best-effort per-session/IP rate limiting."""
    if os.getenv("DISABLE_RATE_LIMIT", "false").lower() == "true":
        return await call_next(request)

    # Do not spend quota on browser preflight or infrastructure probes.
    if request.method == "OPTIONS" or request.url.path in {
        "/geomoz-api/health",
        "/geomoz-api/status",
    }:
        return await call_next(request)

    identity = _rate_limit_identity(request)
    if not _check_rate_limit(identity):
        logger.warning("Rate limit exceeded for key=%s", identity[:32])
        raise HTTPException(
            status_code=429,
            detail=(
                f"Rate limit exceeded. Maximum {_rate_limit_max_requests} "
                f"requests per {_rate_limit_window_seconds} seconds."
            ),
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


def _gdf_to_geojson_response(gdf) -> Response:
    geojson_str = gdf.to_json(na="null", show_bbox=False)
    return Response(content=geojson_str, media_type="application/json")


# ── region geometry helper (used by GEE endpoints) ─────────────────────────────

def _clip_geo(gdf, province=None, district=None):
    """
    Clip *gdf* to province/district boundaries using cached data loaders.
    Eliminates the repeated 10-line clipping block in every endpoint.
    """
    if district:
        dist_gdf = _districts()
        dist_col = find_col(dist_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dist_col:
            mask = dist_gdf[dist_gdf[dist_col] == district]
            if len(mask) > 0:
                if province:
                    pcol = find_col(dist_gdf, ["Provincia", "PROVINCIA", "NAME_1"])
                    if pcol:
                        mask_p = mask[mask[pcol] == province]
                        if len(mask_p) > 0:
                            mask = mask_p
                try:
                    return gpd.clip(gdf, mask.geometry.union_all().buffer(0))
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip to district '%s': %s", district, e)
    elif province:
        prov_gdf = _provinces()
        prov_col = find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            mask = prov_gdf[prov_gdf[prov_col] == province]
            if len(mask) > 0:
                try:
                    return gpd.clip(gdf, mask.geometry.union_all().buffer(0))
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip to province '%s': %s", province, e)
    return gdf


def _region_geojson(
    province: Optional[str] = None,
    district: Optional[str] = None,
    geometry: Optional[dict] = None,
) -> Optional[dict]:
    """
    Return a GeoJSON geometry dict for the area of interest.
    Priority:
      1. `geometry` (direct GeoJSON geometry dict) — used for custom / global AOI
      2. district (if both province and district given)
      3. province (if only province given)
      4. None → full Mozambique / global bbox fallback depending on source

    The geometry is simplified before being shipped to GEE so the request stays light.
    """
    from shapely.geometry import mapping

    # Priority 1: direct geometry (uploaded / drawn AOI)
    if geometry is not None:
        return geometry

    # Priority 2: district
    if district:
        dist_gdf = _districts()
        dcol = find_col(dist_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dcol:
            sub = dist_gdf[dist_gdf[dcol] == district]
            # Disambiguate by province when both are given — district names
            # are repeated across provinces (e.g. "Chibuto", "Mocuba").
            if province and len(sub) > 0:
                pcol = find_col(dist_gdf, ["Provincia", "PROVINCIA", "NAME_1"])
                if pcol:
                    sub_p = sub[sub[pcol] == province]
                    if len(sub_p) > 0:
                        sub = sub_p
            if len(sub) > 0:
                geom = sub.geometry.union_all().buffer(0).simplify(0.01, preserve_topology=True)
                return mapping(geom)

    # Priority 3: province
    if province:
        prov_gdf = _provinces()
        pcol = find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if pcol:
            sub = prov_gdf[prov_gdf[pcol] == province]
            if len(sub) > 0:
                geom = sub.geometry.union_all().buffer(0).simplify(0.02, preserve_topology=True)
                return mapping(geom)

    return None


# ── province summary (for AI module) ─────────────────────────────────────────

@lru_cache(maxsize=1)
def _province_summary_cached():
    import geopandas as gpd
    import pandas as pd

    geo  = _geology().copy()
    prov = _provinces().copy()

    prov_col   = find_col(prov, ["Provincia", "PROVINCIA", "NAME_1", "name"])
    leg_col    = find_col(geo,  ["Legend", "LEGEND", "code2006"])
    era_col    = find_col(geo,  ["ERA"])
    period_col = find_col(geo,  ["PERIOD"])

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
    col = find_col(gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
    if not col:
        return {"names": [], "column": None}
    names = sorted(gdf[col].dropna().unique().tolist())
    return {"names": names, "column": col}


@app.get("/geomoz-api/districts")
def get_districts(province: Optional[str] = Query(None)):
    gdf = _clip_geo(_districts(), province)
    return _gdf_to_geojson_response(gdf)


@app.get("/geomoz-api/district-names")
def get_district_names(province: Optional[str] = Query(None)):
    gdf = _clip_geo(_districts(), province)
    col = find_col(gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
    if not col:
        return {"names": [], "column": None}
    names = sorted(gdf[col].dropna().unique().tolist())
    return {"names": names, "column": col}


@app.get("/geomoz-api/geology")
async def get_geology(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    color_by: str = Query("code2006"),
):
    from starlette.concurrency import run_in_threadpool

    def process_geology():
        gdf = _clip_geo(_geology().copy(), province, district)

        color_col = color_by if color_by in gdf.columns else find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
        if color_col:
            gdf["_color"] = gdf[color_col].fillna("Unknown").astype(str).apply(color_for)

        return _gdf_to_geojson_response(gdf)
        
    return await run_in_threadpool(process_geology)


@app.get("/geomoz-api/stats")
async def get_stats(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
):
    from starlette.concurrency import run_in_threadpool

    def process_stats():
        gdf = _clip_geo(_geology().copy(), province, district)

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

        legend_col = find_col(gdf_proj, ["Legend", "LEGEND", "code2006", "ERA"])
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
                lithologies.append({"name": name, "areaKm2": area_km2, "percent": pct, "color": color_for(name)})

        dominant   = lithologies[0]["name"] if lithologies else "N/A"
        unique_units = len(gdf_proj[legend_col].dropna().unique()) if legend_col else 0

        return {
            "totalFeatures": len(gdf),
            "totalUnits":    unique_units,
            "totalAreaKm2":  total_area_km2,
            "dominant":      dominant,
            "lithologies":   lithologies,
        }
        
    return await run_in_threadpool(process_stats)


@app.get("/geomoz-api/geology-colors")
def get_geology_colors(color_by: str = Query("code2006")):
    gdf = _geology()
    col = color_by if color_by in gdf.columns else find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
    if not col:
        return {"items": []}
    vals = sorted(gdf[col].dropna().unique().tolist())
    return {
        "column": col,
        "items": [{"value": str(v), "color": color_for(str(v))} for v in vals[:60]],
    }


@app.get("/geomoz-api/province-summary")
def get_province_summary():
    return {"provinces": _province_summary_cached()}


# ── Projects / persistent workspaces ─────────────────────────────────────────

PROJECT_SOLUTION_IDS = {
    "groundwater",
    "hazards",
    "environment",
    "minerals",
    "watershed",
}


class ProjectCreateRequest(BaseModel):
    name: str
    description: str = ""
    solution_id: Optional[str] = None
    aoi: Optional[dict] = None
    map_state: Optional[dict] = None

    @field_validator("solution_id")
    @classmethod
    def validate_solution_id(cls, value):
        if value is None:
            return value
        value = value.strip().lower()
        if value not in PROJECT_SOLUTION_IDS:
            raise ValueError("Solution Starter GeoMoz desconhecido.")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("O nome do projecto é obrigatório.")
        if len(value) > 120:
            raise ValueError("O nome do projecto deve ter no máximo 120 caracteres.")
        return value


class ProjectOutputCreateRequest(BaseModel):
    title: Optional[str] = None
    description: str = ""
    explanation: Optional[str] = None

    @field_validator("title")
    @classmethod
    def validate_output_title(cls, value):
        if value is None:
            return value
        value = value.strip()
        if len(value) > 180:
            raise ValueError("O título do output deve ter no máximo 180 caracteres.")
        return value

    @field_validator("description")
    @classmethod
    def validate_output_description(cls, value):
        value = value.strip()
        if len(value) > 1000:
            raise ValueError("A descrição deve ter no máximo 1000 caracteres.")
        return value

    @field_validator("explanation")
    @classmethod
    def validate_output_explanation(cls, value):
        if value is None:
            return value
        value = value.strip()
        if len(value) > 12000:
            raise ValueError("A interpretação deve ter no máximo 12000 caracteres.")
        return value


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    aoi: Optional[dict] = None
    map_state: Optional[dict] = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("O nome do projecto não pode ficar vazio.")
        if len(value) > 120:
            raise ValueError("O nome do projecto deve ter no máximo 120 caracteres.")
        return value


@app.post("/geomoz-api/projects", status_code=201)
async def create_project_endpoint(
    req: ProjectCreateRequest,
    uid: str = Depends(require_firebase_auth),
):
    from projects_store import create_project
    return create_project(
        uid,
        req.name,
        req.description,
        req.aoi,
        req.map_state or {},
        req.solution_id,
    )


@app.get("/geomoz-api/projects")
async def list_projects_endpoint(
    limit: int = Query(100, ge=1, le=200),
    uid: str = Depends(require_firebase_auth),
):
    from projects_store import list_projects
    return {"projects": list_projects(uid, limit=limit)}


@app.get("/geomoz-api/projects/{project_id}")
async def get_project_endpoint(
    project_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from projects_store import get_project
    project = get_project(uid, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")
    return project


@app.patch("/geomoz-api/projects/{project_id}")
async def update_project_endpoint(
    project_id: str,
    req: ProjectUpdateRequest,
    uid: str = Depends(require_firebase_auth),
):
    from projects_store import update_project
    project = update_project(
        uid,
        project_id,
        name=req.name,
        description=req.description,
        aoi=req.aoi,
        map_state=req.map_state,
        update_aoi="aoi" in req.model_fields_set,
        update_map_state="map_state" in req.model_fields_set,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")
    return project


def _geojson_bounds(geojson: Optional[dict]) -> Optional[dict[str, float]]:
    """Extract WGS84 bounds from GeoJSON without adding a GIS dependency."""
    if not isinstance(geojson, dict):
        return None

    coordinates: list[tuple[float, float]] = []

    def collect(value):
        if isinstance(value, dict):
            value_type = value.get("type")
            if value_type == "FeatureCollection":
                for feature in value.get("features") or []:
                    collect(feature)
            elif value_type == "Feature":
                collect(value.get("geometry"))
            elif value_type == "GeometryCollection":
                for geometry in value.get("geometries") or []:
                    collect(geometry)
            else:
                collect(value.get("coordinates"))
            return

        if isinstance(value, (list, tuple)):
            if (
                len(value) >= 2
                and isinstance(value[0], (int, float))
                and isinstance(value[1], (int, float))
            ):
                coordinates.append((float(value[0]), float(value[1])))
                return
            for item in value:
                collect(item)

    collect(geojson)
    if not coordinates:
        return None

    lons = [item[0] for item in coordinates]
    lats = [item[1] for item in coordinates]
    west, east = min(lons), max(lons)
    south, north = min(lats), max(lats)
    if west == east or south == north:
        padding = 0.05
        west -= padding
        east += padding
        south -= padding
        north += padding

    lon_pad = max((east - west) * 0.04, 0.01)
    lat_pad = max((north - south) * 0.04, 0.01)
    return {
        "south": max(-90.0, south - lat_pad),
        "north": min(90.0, north + lat_pad),
        "west": max(-180.0, west - lon_pad),
        "east": min(180.0, east + lon_pad),
    }


def _project_or_job_bounds(project: dict, job: dict) -> Optional[dict[str, float]]:
    payload = job.get("payload") or {}

    try:
        region = _region_geojson(
            payload.get("province"),
            payload.get("district"),
            payload.get("geometry"),
        )
        bounds = _geojson_bounds(region)
        if bounds:
            return bounds
    except Exception as exc:
        logger.info("Could not derive snapshot bounds from job AOI: %s", exc)

    aoi = project.get("aoi") or {}
    raw_bounds = aoi.get("bounds")
    if (
        isinstance(raw_bounds, list)
        and len(raw_bounds) == 2
        and all(isinstance(pair, list) and len(pair) >= 2 for pair in raw_bounds)
    ):
        try:
            south, west = float(raw_bounds[0][0]), float(raw_bounds[0][1])
            north, east = float(raw_bounds[1][0]), float(raw_bounds[1][1])
            if south < north and west < east:
                return {
                    "south": south,
                    "north": north,
                    "west": west,
                    "east": east,
                }
        except (TypeError, ValueError):
            pass

    return _geojson_bounds(aoi.get("geometry"))


def _job_snapshot_spec(job: dict) -> dict:
    result = job.get("result") or {}
    job_type = job.get("type")

    tile_url = (
        result.get("tileUrl")
        or result.get("tile")
        or result.get("floodTile")
    )
    overlay_geojson = None
    legend_items = None

    if job_type == "gee.groundwater":
        classes = result.get("classes") or []
        legend_items = [
            {
                "label": str(item.get("label") or item.get("id") or ""),
                "color": str(item.get("color") or "#94a3b8"),
            }
            for item in classes
            if isinstance(item, dict)
        ]
    elif job_type == "gee.flood":
        legend_items = [
            {"label": "Área potencialmente inundada", "color": "#d50000"},
        ]
    elif job_type == "gee.targeting":
        legend_items = [
            {"label": "Baixa favorabilidade", "color": "#313695"},
            {"label": "Moderada", "color": "#ffffbf"},
            {"label": "Alta favorabilidade", "color": "#a50026"},
        ]
    elif job_type == "gee.watershed":
        overlay_geojson = result.get("geojson")
        legend_items = [
            {"label": "Bacia delimitada", "color": "#0d47a1"},
        ]

    return {
        "tile_url": tile_url if isinstance(tile_url, str) else None,
        "overlay_geojson": overlay_geojson if isinstance(overlay_geojson, dict) else None,
        "legend_items": legend_items,
    }


async def _persist_output_map_snapshot(
    uid: str,
    project: dict,
    output: dict,
    job: Optional[dict],
) -> dict:
    """Best-effort publication-quality map snapshot for a persistent output."""
    if not job or job.get("status") != "completed":
        return output

    from project_assets import output_map_path, storage_status, upload_png
    from project_outputs import attach_asset

    if not storage_status().get("configured"):
        return output

    bounds = _project_or_job_bounds(project, job)
    if not bounds:
        return output

    spec = _job_snapshot_spec(job)
    if not spec.get("tile_url") and not spec.get("overlay_geojson"):
        return output

    try:
        import asyncio
        from utils.map_export import render_map_from_gee_result

        loop = asyncio.get_running_loop()
        png_bytes = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: render_map_from_gee_result(
                bounds=bounds,
                tile_url=spec.get("tile_url"),
                overlay_geojson=spec.get("overlay_geojson"),
                overlay_label=output.get("title"),
                legend_items=spec.get("legend_items"),
                width_mm=182,
                height_mm=105,
                dpi=170,
                title=output.get("title"),
            ),
        )

        storage_path = output_map_path(
            uid,
            output["project_id"],
            output["id"],
        )
        asset = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: upload_png(storage_path, png_bytes),
        )
        if not asset:
            return output

        asset.update({
            "kind": "map_snapshot",
            "bounds": bounds,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
        return attach_asset(uid, output["id"], "map", asset) or output
    except Exception as exc:
        logger.warning(
            "Map snapshot skipped for output=%s: %s",
            output.get("id"),
            exc,
        )
        return output


@app.get("/geomoz-api/projects/{project_id}/outputs")
async def list_project_outputs_endpoint(
    project_id: str,
    output_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    uid: str = Depends(require_firebase_auth),
):
    from project_outputs import list_outputs
    from projects_store import get_project

    if not get_project(uid, project_id):
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")

    return {
        "outputs": list_outputs(
            uid,
            project_id=project_id,
            output_type=output_type,
            limit=limit,
        )
    }


@app.post("/geomoz-api/projects/{project_id}/outputs/from-job/{job_id}", status_code=201)
async def create_project_output_from_job(
    project_id: str,
    job_id: str,
    req: ProjectOutputCreateRequest,
    uid: str = Depends(require_firebase_auth),
):
    from analysis_jobs import get_job
    from project_outputs import compact_evidence, create_output
    from projects_store import get_project, touch_project

    project = get_project(uid, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")

    job = get_job(uid, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job não encontrado.")
    if job.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="O job precisa estar concluído antes de criar um output.",
        )
    if job.get("project_id") and job.get("project_id") != project_id:
        raise HTTPException(
            status_code=409,
            detail="O job pertence a outro projecto.",
        )

    title = req.title or f"Relatório · {job.get('type', 'Análise GeoMoz')}"
    content = {
        "schema": "geomoz.analysis_report.v1",
        "analysis_type": job.get("type"),
        "parameters": compact_evidence(job.get("payload") or {}),
        "result": compact_evidence(job.get("result") or {}),
        "explanation": req.explanation,
        "job": {
            "id": job.get("id"),
            "created_at": job.get("created_at"),
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "execution_mode": job.get("execution_mode"),
        },
    }

    output = create_output(
        uid,
        project_id=project_id,
        output_type="analysis_report",
        title=title,
        description=req.description,
        source_type="analysis_job",
        source_id=job_id,
        content=content,
    )
    output = await _persist_output_map_snapshot(uid, project, output, job)
    touch_project(uid, project_id)
    return output


@app.post("/geomoz-api/projects/{project_id}/outputs/from-plan/{plan_id}", status_code=201)
async def create_project_output_from_plan(
    project_id: str,
    plan_id: str,
    req: ProjectOutputCreateRequest,
    uid: str = Depends(require_firebase_auth),
):
    from agent_plans import get_plan
    from analysis_jobs import get_job
    from project_outputs import compact_evidence, create_output
    from projects_store import get_project, touch_project

    project = get_project(uid, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")
    if plan.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="O plano precisa estar concluído antes de criar um output.",
        )
    if plan.get("project_id") and plan.get("project_id") != project_id:
        raise HTTPException(
            status_code=409,
            detail="O plano pertence a outro projecto.",
        )

    analyses = []
    plan_jobs = []
    for step in plan.get("steps") or []:
        job_id = step.get("job_id")
        job = get_job(uid, job_id) if job_id else None
        if job:
            plan_jobs.append(job)
        analyses.append({
            "order": step.get("order"),
            "tool_id": step.get("tool_id"),
            "tool_name": step.get("tool_name"),
            "purpose": step.get("purpose"),
            "status": step.get("status"),
            "job_id": job_id,
            "parameters": compact_evidence((job or {}).get("payload") or step.get("arguments") or {}),
            "result": compact_evidence((job or {}).get("result") or {}),
            "completed_at": (job or {}).get("completed_at") or step.get("completed_at"),
        })

    title = req.title or f"Relatório Integrado · {plan.get('title', 'GeoMoz Agent')}"
    content = {
        "schema": "geomoz.plan_report.v1",
        "plan": {
            "id": plan.get("id"),
            "title": plan.get("title"),
            "goal": plan.get("goal"),
            "created_at": plan.get("created_at"),
            "completed_at": plan.get("completed_at"),
        },
        "analyses": analyses,
        "explanation": req.explanation,
    }

    output = create_output(
        uid,
        project_id=project_id,
        output_type="plan_report",
        title=title,
        description=req.description,
        source_type="analysis_plan",
        source_id=plan_id,
        content=content,
    )
    for candidate in reversed(plan_jobs):
        spec = _job_snapshot_spec(candidate)
        if spec.get("tile_url") or spec.get("overlay_geojson"):
            output = await _persist_output_map_snapshot(
                uid,
                project,
                output,
                candidate,
            )
            break
    touch_project(uid, project_id)
    return output


@app.get("/geomoz-api/outputs/{output_id}")
async def get_project_output_endpoint(
    output_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from project_outputs import get_output

    output = get_output(uid, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output GeoMoz não encontrado.")
    return output


@app.get("/geomoz-api/outputs/{output_id}/map")
async def get_project_output_map(
    output_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Return the private persistent map snapshot attached to an output."""
    from project_assets import download_bytes
    from project_outputs import get_output

    output = get_output(uid, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output GeoMoz não encontrado.")

    map_asset = (output.get("assets") or {}).get("map")
    if not isinstance(map_asset, dict) or not map_asset.get("storage_path"):
        raise HTTPException(
            status_code=404,
            detail="Este output ainda não possui snapshot cartográfico persistente.",
        )

    import asyncio
    loop = asyncio.get_running_loop()
    map_bytes = await loop.run_in_executor(
        _thread_pool_executor,
        lambda: download_bytes(map_asset["storage_path"]),
    )
    if not map_bytes:
        raise HTTPException(status_code=404, detail="Snapshot cartográfico indisponível.")

    return Response(
        content=map_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": f'inline; filename="geomoz-map-{output_id[:8]}.png"',
        },
    )


@app.get("/geomoz-api/outputs/{output_id}/html")
async def render_project_output_html(
    output_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from fastapi.responses import HTMLResponse
    from project_outputs import get_output
    from projects_store import get_project
    from report_renderer import render_output_html

    output = get_output(uid, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output GeoMoz não encontrado.")

    project = get_project(uid, output.get("project_id"))
    if not project:
        raise HTTPException(status_code=404, detail="Projecto do output não encontrado.")

    map_data_uri = None
    map_asset = (output.get("assets") or {}).get("map")
    if isinstance(map_asset, dict) and map_asset.get("storage_path"):
        try:
            import base64
            from project_assets import download_bytes

            import asyncio
            loop = asyncio.get_running_loop()
            map_bytes = await loop.run_in_executor(
                _thread_pool_executor,
                lambda: download_bytes(map_asset["storage_path"]),
            )
            if map_bytes:
                encoded = base64.b64encode(map_bytes).decode("ascii")
                map_data_uri = f"data:image/png;base64,{encoded}"
        except Exception as exc:
            logger.warning(
                "Could not embed output map %s: %s",
                output_id,
                exc,
            )

    html = render_output_html(output, project, map_data_uri=map_data_uri)
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="geomoz-report-{output_id[:8]}.html"',
        },
    )


@app.delete("/geomoz-api/outputs/{output_id}")
async def delete_project_output_endpoint(
    output_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from project_outputs import delete_output

    if not delete_output(uid, output_id):
        raise HTTPException(status_code=404, detail="Output GeoMoz não encontrado.")
    return {"deleted": True, "id": output_id}


@app.delete("/geomoz-api/projects/{project_id}")
async def delete_project_endpoint(
    project_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from project_outputs import delete_output, list_outputs
    from projects_store import delete_project, get_project

    if not get_project(uid, project_id):
        raise HTTPException(status_code=404, detail="Projecto não encontrado.")

    # Clean durable deliverables and their private Storage assets first.
    # Job/plan history is intentionally independent and follows its own
    # retention policy.
    for output in list_outputs(uid, project_id=project_id, limit=200):
        try:
            delete_output(uid, output["id"])
        except Exception as exc:
            logger.warning(
                "Could not clean output=%s before deleting project=%s: %s",
                output.get("id"),
                project_id,
                exc,
            )

    if not delete_project(uid, project_id):
        raise HTTPException(status_code=500, detail="Falha ao eliminar o projecto.")
    return {"deleted": True, "id": project_id}

# ── GEE endpoints ──────────────────────────────────────────────────────────────

@app.get("/geomoz-api/status")
def api_status():
    """Basic health check and initialization status."""
    msg = "GeoMoz API is running."
    return {"status": "ok", "message": msg}

@app.post("/geomoz-api/convert-geom")
async def convert_geom(
    file: UploadFile = File(...),
    uid: str = Depends(require_firebase_auth),
):
    """Convert an authenticated user's KML/GPX/GeoJSON into GeoJSON.

    Archive formats are intentionally excluded here until archive expansion can
    be validated against zip-bomb/path-traversal limits.
    """
    import tempfile
    import os
    import json
    
    filename = file.filename or "upload"
    ext = filename.split('.')[-1].lower()
    if ext not in ['kml', 'gpx', 'json', 'geojson']:
        raise HTTPException(
            status_code=400,
            detail="Formato não suportado. Use KML, GPX ou GeoJSON.",
        )

    max_upload_bytes = 10 * 1024 * 1024
    tmp_path = None

    try:
        content = await file.read(max_upload_bytes + 1)
        if len(content) > max_upload_bytes:
            raise HTTPException(
                status_code=413,
                detail="Ficheiro demasiado grande. Limite máximo: 10 MB.",
            )

        # Save uploaded file to a private temporary path.
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            tmp.write(content)
            tmp_path = tmp.name
            
        # Parse using geopandas
        import geopandas as gpd
        gdf = gpd.read_file(tmp_path)
        
        # Reproject to WGS84 if needed
        if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)
            
        # Clean geometries to avoid intersection errors
        gdf.geometry = gdf.geometry.buffer(0)
            
        geojson_str = gdf.to_json()
        return json.loads(geojson_str)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Erro ao converter ficheiro de geometria.")
        raise HTTPException(
            status_code=500,
            detail="Erro ao converter o ficheiro de geometria.",
        )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass



class GEEServiceAccountKeyRequest(BaseModel):
    service_account_key: Optional[str] = None
    project_id: Optional[str] = None


@app.get("/geomoz-api/gee/config")
def gee_config(admin_uid: str = Depends(require_admin_auth)):
    """
    Return current GEE configuration (with sensitive values masked).
    Used by the Settings page to show the user what's configured.
    """
    from gee_module import _init_gee, gee_status as _gee_status

    sa_key_raw = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
    project_id = os.environ.get("GEE_PROJECT_ID", "").strip()

    # Build a masked version of the key for display
    masked_key = None
    has_key = bool(sa_key_raw)
    if has_key:
        try:
            key_data = json.loads(sa_key_raw)
            email = key_data.get("client_email", "")
            proj = key_data.get("project_id", "")
            masked_key = {
                "client_email": email,
                "project_id": proj or "(n/a)",
                "key_prefix": sa_key_raw[:40] + "…" if len(sa_key_raw) > 40 else sa_key_raw[:20] + "…",
                "has_private_key": bool(key_data.get("private_key", "")),
            }
        except (json.JSONDecodeError, Exception):
            masked_key = {"error": "Invalid JSON in GEE_SERVICE_ACCOUNT_KEY"}

    status = _gee_status()

    return {
        "status": status,
        "config": {
            "hasServiceAccountKey": has_key,
            "maskedServiceAccount": masked_key,
            "envProjectId": project_id or None,
            "envProjectSource": "env_var" if project_id else ("key_file" if has_key else None),
        },
        "endpoints": {
            "configure": {
                "method": "POST",
                "path": "/geomoz-api/gee/configure",
                "body": {
                    "service_account_key": "(optional) JSON string of the service account",
                    "project_id": "(optional) GCP project ID",
                },
            }
        },
    }


@app.post("/geomoz-api/gee/configure")
def gee_configure(
    req: GEEServiceAccountKeyRequest,
    admin_uid: str = Depends(require_admin_auth),
):
    """
    Update GEE credentials and reinitialize the connection.
    Accepts service_account_key (JSON string) and/or project_id.
    Returns the new connection status.
    """
    from gee_module import reset_gee, _init_gee, gee_status as _gee_status

    if os.environ.get("GEOMOZ_ALLOW_RUNTIME_CONFIG", "false").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "Configuração GEE global em runtime está desactivada. "
                "Use Secret Manager / configuração de deployment."
            ),
        )

    changed = False

    if req.service_account_key is not None:
        os.environ["GEE_SERVICE_ACCOUNT_KEY"] = req.service_account_key.strip()
        changed = True
        logger.info("GEE service account key updated via API")

    if req.project_id is not None:
        os.environ["GEE_PROJECT_ID"] = req.project_id.strip()
        changed = True
        logger.info("GEE project ID updated via API to: %s", req.project_id)

    if not changed:
        return {
            "configured": False,
            "message": "Nenhuma credencial fornecida. Envie service_account_key e/ou project_id.",
        }

    # Reset and reinitialize GEE
    reset_gee()
    try:
        _init_gee()
        status = _gee_status()
        status["configured"] = True
        status["message"] = "GEE configurado e conectado com sucesso!"
        logger.info("GEE reinitialized successfully after configuration update")
        return status
    except RuntimeError as exc:
        logger.error("GEE reinitialization failed after configuration update: %s", exc)
        return {
            "configured": False,
            "connected": False,
            "message": f"Falha ao conectar GEE: {exc}",
        }
    except Exception as exc:
        logger.error("Unexpected error during GEE configuration: %s", exc)
        return {
            "configured": False,
            "connected": False,
            "message": f"Erro inesperado: {exc}",
        }


class GEEIndexRequest(BaseModel):
    index:      str
    province:   Optional[str] = None
    district:   Optional[str] = None
    geometry:   Optional[dict] = None
    start_date: str = "2023-01-01"
    end_date:   str = "2023-12-31"
    cloud_pct:  int = 30

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('geometry')
    @classmethod
    def validate_geometry(cls, v):
        if v is not None:
            import json
            if len(json.dumps(v)) > 500_000:
                raise ValueError("A geometria é muito grande ou complexa. Simplifique o polígono.")
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


class GEERenderRequest(BaseModel):
    """Re-render a GEE index tile with custom visualization parameters.

    Same fields as GEEIndexRequest, plus:
      vis_params: dict with optional keys:
        bands   : str | list[str]
        min     : float
        max     : float
        gamma   : float
        opacity : float
        palette : list[str]
    """
    index:      str
    province:   Optional[str] = None
    district:   Optional[str] = None
    geometry:   Optional[dict] = None
    start_date: str = "2023-01-01"
    end_date:   str = "2023-12-31"
    cloud_pct:  int = 30
    vis_params: dict = {}

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('geometry')
    @classmethod
    def validate_geometry(cls, v):
        if v is not None:
            import json
            if len(json.dumps(v)) > 500_000:
                raise ValueError("A geometria é muito grande ou complexa. Simplifique o polígono.")
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
    geometry:   Optional[dict] = None
    start_date: str = "2023-01-01"
    end_date:   str = "2023-12-31"
    cloud_pct:  int = 30

    @field_validator('cloud_pct')
    @classmethod
    def validate_cloud_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('cloud_pct must be between 0 and 100')
        return v

    @field_validator('geometry')
    @classmethod
    def validate_geometry(cls, v):
        if v is not None:
            import json
            if len(json.dumps(v)) > 500_000:
                raise ValueError("A geometria é muito grande ou complexa. Simplifique o polígono.")
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



class OAuthTokenRequest(BaseModel):
    access_token: str
    project: Optional[str] = None

    @field_validator("access_token")
    @classmethod
    def validate_access_token(cls, value):
        value = value.strip()
        if len(value) < 20:
            raise ValueError("Token OAuth inválido.")
        return value

    @field_validator("project")
    @classmethod
    def validate_project(cls, value):
        if value is None:
            return value
        value = value.strip()
        return value or None


@app.post("/geomoz-api/gee/oauth-token")
async def gee_oauth_token(req: OAuthTokenRequest, uid: str = Depends(require_firebase_auth)):
    """Register and immediately verify a user's BYO-GEE connection."""
    import gee_session_store
    from gee_module import gee_status as verified_gee_status

    if not req.project:
        raise HTTPException(
            status_code=400,
            detail=(
                "Informe o Google Cloud Project ID associado ao Earth Engine. "
                "O GeoMoz usa este projecto para executar as análises."
            ),
        )

    gee_session_store.set_token(uid, {
        "access_token": req.access_token,
        "project": req.project,
    })

    status = verified_gee_status(uid)
    if not status.get("connected"):
        gee_session_store.clear_token(uid)
        raise HTTPException(
            status_code=400,
            detail=status.get("message") or "Não foi possível validar a ligação ao Earth Engine.",
        )

    return {
        "message": "Google Earth Engine conectado e validado.",
        **status,
    }


@app.get("/geomoz-api/gee/status")
async def gee_status_endpoint(uid: str = Depends(require_firebase_auth)):
    """Return a verified status for the current user's GEE connection."""
    import gee_session_store
    from gee_module import gee_status as verified_gee_status
    from gee_presets import INDEX_REGISTRY

    token = gee_session_store.get_token(uid)
    if not token:
        return {
            "connected": False,
            "project": None,
            "auth_type": None,
            "message": "Google Earth Engine ainda não foi conectado.",
            "reason": "not_connected",
            "indices": list(INDEX_REGISTRY.keys()),
        }

    status = verified_gee_status(uid)
    status["indices"] = list(INDEX_REGISTRY.keys())
    return status


@app.post("/geomoz-api/gee/disconnect")
async def gee_disconnect(uid: str = Depends(require_firebase_auth)):
    """Disconnect Earth Engine without signing the user out of GeoMoz."""
    import gee_session_store
    gee_session_store.clear_token(uid)
    return {
        "connected": False,
        "message": "Ligação ao Google Earth Engine removida.",
        "reason": "disconnected_by_user",
    }

class ToolExecuteRequest(BaseModel):
    parameters: dict = Field(default_factory=dict)
    project_id: Optional[str] = None


class GeoMozAgentRequest(BaseModel):
    message: str
    project_id: Optional[str] = None
    context: dict = Field(default_factory=dict)

    @field_validator("message")
    @classmethod
    def validate_message(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Escreva um pedido para o GeoMoz Agent.")
        if len(value) > 4000:
            raise ValueError("O pedido deve ter no máximo 4000 caracteres.")
        return value


@app.get("/geomoz-api/ai/status")
async def geomoz_ai_status(uid: str = Depends(require_firebase_auth)):
    """Return planner configuration without exposing credentials."""
    from ai_agent import planner_status
    from tool_registry import registry_summary

    return {
        "agent": planner_status(),
        "registry": registry_summary(),
    }


@app.get("/geomoz-api/ai/tools")
async def list_ai_tools(
    category: Optional[str] = Query(None),
    uid: str = Depends(require_firebase_auth),
):
    """List deterministic GIS tools available to GeoMoz AI."""
    from tool_registry import list_tools, registry_summary

    return {
        "tools": list_tools(category=category),
        "registry": registry_summary(),
    }


@app.get("/geomoz-api/ai/tools/{tool_id}")
async def get_ai_tool(
    tool_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Return one registered GeoMoz AI tool definition."""
    from tool_registry import get_tool

    tool = get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Ferramenta GeoMoz AI não encontrada.")
    return tool


@app.post("/geomoz-api/ai/tools/{tool_id}/execute", status_code=202)
async def execute_ai_tool(
    tool_id: str,
    req: ToolExecuteRequest,
    uid: str = Depends(require_firebase_auth),
):
    """Execute a registered tool through the validated AnalysisJob engine."""
    from tool_registry import get_tool, resolve_job_type

    tool = get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Ferramenta GeoMoz AI não encontrada.")

    if tool.get("confirmation_required"):
        raise HTTPException(
            status_code=409,
            detail="Esta ferramenta requer confirmação explícita antes da execução.",
        )

    job_type = resolve_job_type(tool_id)
    if not job_type:
        raise HTTPException(
            status_code=409,
            detail="A ferramenta ainda não possui executor configurado.",
        )

    job_request = AnalysisJobCreateRequest(
        type=job_type,
        payload=req.parameters,
        project_id=req.project_id,
    )
    return await create_analysis_job(job_request, uid)


class AnalysisJobCreateRequest(BaseModel):
    type: str
    payload: dict
    project_id: Optional[str] = None


@app.post("/geomoz-api/jobs", status_code=202)
async def create_analysis_job(
    req: AnalysisJobCreateRequest,
    uid: str = Depends(require_firebase_auth),
):
    """Create an asynchronous GeoMoz analysis job.

    Workflows are migrated one-by-one while synchronous endpoints remain
    available for backwards compatibility.
    """
    from analysis_jobs import submit_job
    import gee_session_store

    supported_job_types = {
        "gee.index",
        "gee.flood",
        "gee.watershed",
        "gee.targeting",
        "gee.erosion",
        "gee.groundwater",
    }
    if req.type not in supported_job_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de job ainda não suportado: {req.type}",
        )

    if req.project_id:
        from projects_store import get_project
        if not get_project(uid, req.project_id):
            raise HTTPException(
                status_code=404,
                detail="Projecto associado ao job não foi encontrado.",
            )

    if not gee_session_store.get_token(uid):
        raise HTTPException(
            status_code=409,
            detail="Conecte o Google Earth Engine antes de iniciar esta análise.",
        )

    if req.type == "gee.index":
        try:
            validated = GEEIndexRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        from gee_presets import INDEX_REGISTRY
        if validated.index not in INDEX_REGISTRY:
            raise HTTPException(
                status_code=422,
                detail=f"Índice GeoMoz desconhecido: {validated.index}",
            )

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_index_tile

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A preparar imagens e área de análise.")
            result = compute_index_tile(
                validated.index,
                region,
                validated.start_date,
                validated.end_date,
                validated.cloud_pct,
            )
            progress(90, "rendering", "A preparar mapa e estatísticas.")
            result["province"] = validated.province
            result["district"] = validated.district
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    if req.type == "gee.flood":
        try:
            validated = GEEFloodRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_flood_sar

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A preparar Sentinel-1 e linha de base.")
            progress(45, "processing", "A detectar mudança SAR e extensão da cheia.")
            result = compute_flood_sar(
                region,
                validated.event_start,
                validated.event_end,
                validated.baseline_start,
                validated.baseline_end,
            )
            progress(90, "rendering", "A preparar mapa e métricas de inundação.")
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    if req.type == "gee.watershed":
        try:
            validated = GEEWatershedRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_watershed_from_point

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A localizar o ponto de saída e dados hidrológicos.")
            progress(45, "processing", "A delimitar a bacia hidrográfica.")
            result = compute_watershed_from_point(
                validated.lat,
                validated.lon,
                region,
                validated.max_iter,
                validated.level,
            )
            progress(90, "rendering", "A preparar limite da bacia e área.")
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    if req.type == "gee.targeting":
        try:
            validated = GEETargetingRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        from gee_presets import MINERAL_PRESETS
        if validated.mineral not in MINERAL_PRESETS:
            raise HTTPException(
                status_code=422,
                detail=f"Preset mineral GeoMoz desconhecido: {validated.mineral}",
            )

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_targeting_tile

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A preparar Sentinel-2, relevo e critérios do modelo.")
            progress(45, "processing", "A combinar evidências e calcular favorabilidade mineral.")
            result = compute_targeting_tile(
                validated.mineral,
                region,
                validated.start_date,
                validated.end_date,
                validated.cloud_pct,
                validated.weights_override,
                validated.invert_override,
                validated.score_threshold,
            )
            progress(90, "rendering", "A preparar mapa, percentis e área favorável.")
            result["province"] = validated.province
            result["district"] = validated.district
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    if req.type == "gee.erosion":
        try:
            validated = GEEErosionRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_erosion_rusle

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A preparar chuva, solo, relevo e cobertura.")
            progress(45, "processing", "A calcular factores RUSLE e perda de solo.")
            result = compute_erosion_rusle(region, validated.year)
            progress(90, "rendering", "A classificar risco e calcular áreas.")
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    if req.type == "gee.groundwater":
        try:
            validated = GEEGroundwaterRequest(**req.payload)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        normalized_payload = validated.model_dump()
        region = _region_geojson(
            validated.province,
            validated.district,
            validated.geometry,
        )

        def runner(progress):
            from gee_module import _init_gee, compute_groundwater_ahp

            progress(10, "auth", "A validar ligação ao Earth Engine.")
            _init_gee(uid)
            progress(25, "preparing", "A preparar os factores hidrogeológicos.")
            progress(45, "processing", "A calcular a sobreposição ponderada AHP.")
            result = compute_groundwater_ahp(region, validated.year)
            progress(90, "rendering", "A classificar potencial e calcular áreas.")
            return result

        return submit_job(uid, req.type, normalized_payload, runner, project_id=req.project_id)

    raise HTTPException(
        status_code=500,
        detail="Tipo de job registado sem executor associado.",
    )


@app.post("/geomoz-api/ai/agent")
async def geomoz_ai_agent(
    req: GeoMozAgentRequest,
    uid: str = Depends(require_firebase_auth),
):
    """Plan one natural-language request and optionally execute one safe tool."""
    from ai_agent import AgentNotConfigured, AgentPlannerError, plan_agent_turn

    if req.project_id:
        from projects_store import get_project
        if not get_project(uid, req.project_id):
            raise HTTPException(status_code=404, detail="Projecto não encontrado.")

    try:
        plan = await plan_agent_turn(req.message, req.context)
    except AgentNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except AgentPlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if plan.get("mode") == "plan":
        from agent_plans import create_plan

        created_plan = create_plan(
            uid,
            title=str(plan.get("title") or "Plano GeoMoz"),
            goal=str(plan.get("goal") or req.message),
            steps=plan.get("steps") or [],
            project_id=req.project_id,
            source_message=req.message,
        )
        return {
            "mode": "plan",
            "message": (
                f"Plano criado com {len(created_plan.get('steps') or [])} etapas. "
                "A execução será feita sequencialmente."
            ),
            "plan": created_plan,
            "model": plan.get("model"),
            "response_id": plan.get("response_id"),
        }

    if plan.get("mode") != "tool_call":
        return {
            "mode": "message",
            "message": plan.get("message") or "Pedido analisado.",
            "model": plan.get("model"),
            "response_id": plan.get("response_id"),
        }

    tool_id = plan.get("tool_id")
    arguments = plan.get("arguments") or {}
    if not isinstance(tool_id, str) or not isinstance(arguments, dict):
        raise HTTPException(status_code=502, detail="Plano AI inválido.")

    job = await execute_ai_tool(
        tool_id,
        ToolExecuteRequest(
            parameters=arguments,
            project_id=req.project_id,
        ),
        uid,
    )

    from tool_registry import get_tool
    tool = get_tool(tool_id) or {}

    return {
        "mode": "tool_call",
        "message": f"A iniciar: {tool.get('name', tool_id)}.",
        "tool": {
            "id": tool_id,
            "name": tool.get("name", tool_id),
            "category": tool.get("category"),
        },
        "arguments": arguments,
        "job": job,
        "model": plan.get("model"),
        "response_id": plan.get("response_id"),
    }


@app.get("/geomoz-api/ai/plans")
async def list_analysis_plans(
    project_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    uid: str = Depends(require_firebase_auth),
):
    """List recent user-owned GeoMoz Agent plans."""
    from agent_plans import list_plans

    return {"plans": list_plans(uid, project_id=project_id, limit=limit)}


@app.get("/geomoz-api/ai/plans/{plan_id}")
async def get_analysis_plan(
    plan_id: str,
    uid: str = Depends(require_firebase_auth),
):
    from agent_plans import get_plan

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")
    return plan


@app.post("/geomoz-api/ai/plans/{plan_id}/advance")
async def advance_analysis_plan(
    plan_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Reconcile the current child job and start the next validated step."""
    from analysis_jobs import get_job
    from agent_plans import get_plan, update_plan, update_step

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")

    if plan.get("status") in {"completed", "failed", "cancelled"}:
        return plan

    steps = plan.get("steps") or []
    if not steps:
        updated = update_plan(
            uid,
            plan_id,
            status="failed",
            error={"message": "Plano sem etapas executáveis."},
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        return updated

    index = int(plan.get("current_step") or 0)
    index = max(0, min(index, len(steps) - 1))
    step = steps[index]
    job_id = step.get("job_id")

    if job_id:
        child = get_job(uid, job_id)
        if not child:
            updated = update_step(
                uid,
                plan_id,
                index,
                status="failed",
                message="Job associado à etapa não foi encontrado.",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            return update_plan(
                uid,
                plan_id,
                status="failed",
                error={"message": "Job associado à etapa não foi encontrado."},
                completed_at=datetime.now(timezone.utc).isoformat(),
            ) or updated

        child_status = child.get("status")
        if child_status in {"queued", "processing"}:
            return update_step(
                uid,
                plan_id,
                index,
                status=child_status,
                message=child.get("message") or "Etapa em execução.",
            )

        if child_status in {"failed", "cancelled"}:
            error_message = (
                (child.get("error") or {}).get("message")
                or child.get("message")
                or "A etapa não foi concluída."
            )
            update_step(
                uid,
                plan_id,
                index,
                status=child_status,
                message=error_message,
                completed_at=child.get("completed_at"),
            )
            return update_plan(
                uid,
                plan_id,
                status="failed" if child_status == "failed" else "cancelled",
                error={"message": error_message, "step": index + 1},
                completed_at=datetime.now(timezone.utc).isoformat(),
            )

        if child_status == "completed":
            update_step(
                uid,
                plan_id,
                index,
                status="completed",
                message="Etapa concluída.",
                completed_at=child.get("completed_at"),
            )
            if index >= len(steps) - 1:
                return update_plan(
                    uid,
                    plan_id,
                    status="completed",
                    current_step=index,
                    error=None,
                    completed_at=datetime.now(timezone.utc).isoformat(),
                )
            index += 1
            plan = update_plan(uid, plan_id, current_step=index) or plan
            steps = plan.get("steps") or steps
            step = steps[index]

    # No active child job: start the pending current step through the same
    # validated tool API used by single-turn Agent requests.
    try:
        child = await execute_ai_tool(
            str(step["tool_id"]),
            ToolExecuteRequest(
                parameters=step.get("arguments") or {},
                project_id=plan.get("project_id"),
            ),
            uid,
        )
    except HTTPException as exc:
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        update_step(
            uid,
            plan_id,
            index,
            status="failed",
            message=message,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        return update_plan(
            uid,
            plan_id,
            status="failed",
            error={"message": message, "step": index + 1},
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    now = datetime.now(timezone.utc).isoformat()
    update_step(
        uid,
        plan_id,
        index,
        status=child.get("status") or "queued",
        job_id=child.get("id"),
        message=child.get("message") or "Etapa iniciada.",
        started_at=now,
    )
    return update_plan(
        uid,
        plan_id,
        status="running",
        current_step=index,
        started_at=plan.get("started_at") or now,
        error=None,
        completed_at=None,
    )


@app.post("/geomoz-api/ai/plans/{plan_id}/cancel")
async def cancel_analysis_plan(
    plan_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Cancel the plan and its currently active child job when possible."""
    from analysis_jobs import cancel_job
    from agent_plans import cancel_plan, get_plan

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")

    steps = plan.get("steps") or []
    index = int(plan.get("current_step") or 0)
    if 0 <= index < len(steps):
        job_id = steps[index].get("job_id")
        if job_id and steps[index].get("status") in {"queued", "processing"}:
            cancel_job(uid, job_id)

    return cancel_plan(uid, plan_id)


@app.post("/geomoz-api/ai/plans/{plan_id}/retry")
async def retry_analysis_plan(
    plan_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Reset the failed/cancelled current step so it can be executed again."""
    from agent_plans import get_plan, update_plan, update_step

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")

    if plan.get("status") not in {"failed", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail="Apenas planos falhados ou cancelados podem ser repetidos.",
        )

    steps = plan.get("steps") or []
    index = int(plan.get("current_step") or 0)
    if not 0 <= index < len(steps):
        raise HTTPException(status_code=409, detail="Etapa actual inválida.")

    update_step(
        uid,
        plan_id,
        index,
        status="pending",
        job_id=None,
        message="Etapa pronta para nova execução.",
        started_at=None,
        completed_at=None,
    )

    # Steps cancelled because the whole plan was cancelled become pending again
    # only after the current step; already-completed steps remain immutable.
    refreshed = get_plan(uid, plan_id)
    if refreshed:
        tail = refreshed.get("steps") or []
        for step_index in range(index + 1, len(tail)):
            if tail[step_index].get("status") == "cancelled":
                update_step(
                    uid,
                    plan_id,
                    step_index,
                    status="pending",
                    job_id=None,
                    message="Aguardando execução.",
                    started_at=None,
                    completed_at=None,
                )

    return update_plan(
        uid,
        plan_id,
        status="ready",
        error=None,
        completed_at=None,
    )


@app.post("/geomoz-api/ai/plans/{plan_id}/explain")
async def explain_analysis_plan(
    plan_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Generate one grounded synthesis from all completed jobs in a plan."""
    from agent_plans import get_plan
    from analysis_jobs import get_job
    from ai_agent import AgentNotConfigured, AgentPlannerError, explain_plan_result

    plan = get_plan(uid, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano GeoMoz não encontrado.")
    if plan.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="O plano precisa estar concluído antes de ser sintetizado.",
        )

    jobs = []
    for step in plan.get("steps") or []:
        job_id = step.get("job_id")
        if not job_id:
            continue
        job = get_job(uid, job_id)
        if job:
            jobs.append(job)

    try:
        return await explain_plan_result(plan, jobs)
    except AgentNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except AgentPlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/geomoz-api/ai/jobs/{job_id}/explain")
async def explain_analysis_job(
    job_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Generate an evidence-grounded explanation for one completed user job."""
    from analysis_jobs import get_job
    from ai_agent import AgentNotConfigured, AgentPlannerError, explain_job_result

    job = get_job(uid, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job não encontrado.")
    if job.get("status") != "completed":
        raise HTTPException(
            status_code=409,
            detail="A análise precisa estar concluída antes de ser explicada.",
        )

    try:
        return await explain_job_result(job)
    except AgentNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except AgentPlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/geomoz-api/jobs")
async def get_analysis_jobs(
    limit: int = Query(20, ge=1, le=100),
    project_id: Optional[str] = Query(None),
    uid: str = Depends(require_firebase_auth),
):
    """List recent analysis jobs belonging to the current user."""
    from analysis_jobs import list_jobs
    return {
        "jobs": list_jobs(uid, limit=limit, project_id=project_id),
        "project_id": project_id,
    }


@app.get("/geomoz-api/jobs/{job_id}")
async def get_analysis_job(
    job_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Return one user-owned analysis job."""
    from analysis_jobs import get_job
    job = get_job(uid, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job não encontrado.")
    return job

@app.post("/geomoz-api/jobs/{job_id}/cancel")
async def cancel_analysis_job(
    job_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Cancel a queued or running analysis job owned by the current user."""
    from analysis_jobs import cancel_job
    job = cancel_job(uid, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job não encontrado.")
    return job


@app.post("/geomoz-api/jobs/{job_id}/retry", status_code=202)
async def retry_analysis_job(
    job_id: str,
    uid: str = Depends(require_firebase_auth),
):
    """Create a new execution using the same type, payload and project."""
    from analysis_jobs import get_job

    previous = get_job(uid, job_id)
    if not previous:
        raise HTTPException(status_code=404, detail="Analysis job não encontrado.")

    if previous.get("status") in {"queued", "processing"}:
        raise HTTPException(
            status_code=409,
            detail="A análise ainda está activa e não pode ser repetida.",
        )

    request = AnalysisJobCreateRequest(
        type=previous["type"],
        payload=previous.get("payload") or {},
        project_id=previous.get("project_id"),
    )
    return await create_analysis_job(request, uid)



@app.post("/geomoz-api/gee/index")
async def gee_index(req: GEEIndexRequest, uid: str = Depends(require_gee_auth)):
    """
    Compute a spectral / terrain index via Google Earth Engine, precisely
    clipped to the selected province / district (or full Mozambique).
    Returns a GEE-hosted tile URL (~24h validity).
    """
    import asyncio
    from gee_presets import INDEX_REGISTRY
    from gee_module import compute_index_tile

    if req.index not in INDEX_REGISTRY:
        raise HTTPException(400, f"Unknown index '{req.index}'. Valid: {list(INDEX_REGISTRY)}")

    region = _region_geojson(req.province, req.district, req.geometry)

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


@app.post("/geomoz-api/gee/render")
async def gee_render(req: GEERenderRequest, uid: str = Depends(require_gee_auth)):
    """
    Re-render an existing GEE index tile with custom visualization parameters.

    Accepts the same fields as `/gee/index` plus `vis_params`:
      vis_params:
        bands   : str | list[str]   — single band name or [R, G, B] list
        min     : float             — lower display bound
        max     : float             — upper display bound
        gamma   : float             — gamma correction
        opacity : float             — tile opacity 0–1
        palette : list[str]         — hex colour palette (single-band mode)
    """
    import asyncio
    from gee_presets import INDEX_REGISTRY
    from gee_module import compute_index_tile_vis

    if req.index not in INDEX_REGISTRY:
        raise HTTPException(400, f"Unknown index '{req.index}'. Valid: {list(INDEX_REGISTRY)}")

    region = _region_geojson(req.province, req.district, req.geometry)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_index_tile_vis(
                req.index, region, req.vis_params,
                req.start_date, req.end_date, req.cloud_pct,
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
        raise HTTPException(500, f"GEE re-render failed: {exc}")


@app.post("/geomoz-api/gee/composite")
async def gee_composite(req: GEECompositeRequest, uid: str = Depends(require_gee_auth)):
    """
    Compute a weighted, normalized sum of multiple indices.
    Each index is normalized to [0,1] using its registry range, multiplied by
    the user-provided weight (renormalized so weights sum to 1), and summed.
    """
    import asyncio
    from gee_module import compute_composite_tile

    region = _region_geojson(req.province, req.district, req.geometry)

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
    geometry:        Optional[dict] = None
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
    geometry:         Optional[dict] = None
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
async def gee_lineaments(req: GEELineamentsRequest, uid: str = Depends(require_gee_auth)):
    """Topographic lineaments (Canny on multi-azimuth hillshades) + rose diagram."""
    import asyncio
    from gee_module import compute_lineaments_tile

    region = _region_geojson(req.province, req.district, req.geometry)

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
    from gee_presets import MINERAL_PRESETS
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
async def gee_targeting(req: GEETargetingRequest, uid: str = Depends(require_gee_auth)):
    """Mineral favorability score (0–100) via weighted preset + lineaments."""
    import asyncio
    from gee_module import compute_targeting_tile

    region = _region_geojson(req.province, req.district, req.geometry)

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
    geometry:    Optional[dict] = None
    interval_m:  int = 50
    index_every: int = 5


@app.post("/geomoz-api/gee/profile")
async def gee_profile(req: GEEProfileRequest, uid: str = Depends(require_gee_auth)):
    """Topographic profile (DEM elevation sampled along a polyline)."""
    import asyncio
    from gee_module import compute_profile

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
async def gee_contours(req: GEEContoursRequest, uid: str = Depends(require_gee_auth)):
    """Contour-line tiles at user-defined equidistance from Copernicus GLO-30."""
    import asyncio
    from gee_module import compute_contours_tile

    region = _region_geojson(req.province, req.district, req.geometry)

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
    geometry:       Optional[dict] = None
    breaks:         list           # e.g. [5, 10, 30, 60]
    colors:         list           # hex, len == len(breaks)+1
    labels:         list           # len == len(breaks)+1
    include_water:  bool = True
    water_color:    str  = "#3366ff"
    water_label:    str  = "Água & Rios"


@app.post("/geomoz-api/gee/topo-classes")
async def gee_topo_classes(req: GEETopoClassesRequest, uid: str = Depends(require_gee_auth)):
    """User-defined topographic classes from the DEM."""
    import asyncio
    from gee_module import compute_topo_classes_tile

    region = _region_geojson(req.province, req.district, req.geometry)

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


class GEELandcoverRequest(BaseModel):
    province: Optional[str] = None
    district: Optional[str] = None
    geometry: Optional[dict] = None


@app.post("/geomoz-api/gee/landcover")
async def gee_landcover(req: GEELandcoverRequest, uid: str = Depends(require_gee_auth)):
    """Land cover (ESA WorldCover 2021, 10 m) with per-class area analysis."""
    import asyncio
    from gee_module import compute_landcover_tile

    region = _region_geojson(req.province, req.district, req.geometry)

    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_landcover_tile(region),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE landcover failed: {exc}")


@app.get("/geomoz-api/gee/indices")
def gee_indices():
    """List available indices with metadata, grouped (spectral/landsat/terrain)."""
    from gee_presets import INDEX_REGISTRY
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
    geometry:  Optional[dict] = None
    level:     int            = 6   # HydroBASINS level 5–8


class GEEBasinStatsRequest(BaseModel):
    geometry: dict  # GeoJSON geometry dict (Polygon / MultiPolygon)


class GEEDrainageRequest(BaseModel):
    province:  Optional[str] = None
    district:  Optional[str] = None
    geometry:  Optional[dict] = None
    threshold: int            = 500


@app.post("/geomoz-api/gee/basins")
async def gee_basins(req: GEEBasinsRequest, uid: str = Depends(require_gee_auth)):
    """HydroBASINS polygons that intersect the selected region."""
    import asyncio
    from gee_module import compute_basins

    region   = _region_geojson(req.province, req.district, req.geometry)
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
async def gee_basin_stats(req: GEEBasinStatsRequest, uid: str = Depends(require_gee_auth)):
    """Elevation, slope, NDVI, NDWI, precipitation + risk indices for one basin."""
    import asyncio
    from gee_module import compute_basin_stats

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


@app.post("/geomoz-api/gee/basin-report")
async def gee_basin_report(req: GEEBasinStatsRequest, uid: str = Depends(require_gee_auth)):
    """Full hydro-environmental basin report: morphometry + land cover + CHIRPS
    monthly rainfall + SCS-CN runoff potential."""
    import asyncio
    from gee_module import compute_basin_report

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor, lambda: compute_basin_report(req.geometry)
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE basin-report failed: {exc}")


@app.post("/geomoz-api/gee/drainage")
async def gee_drainage(req: GEEDrainageRequest, uid: str = Depends(require_gee_auth)):
    """HydroSHEDS drainage network tile for the selected region."""
    import asyncio
    from gee_module import compute_drainage_tile

    region   = _region_geojson(req.province, req.district, req.geometry)
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
    geometry: Optional[dict] = None


@app.post("/geomoz-api/gee/river-network")
async def gee_river_network(req: GEERiverNetRequest, uid: str = Depends(require_gee_auth)):
    """Multi-order river network tile (Strahler-like classification via HydroSHEDS ACC)."""
    import asyncio
    from gee_module import compute_river_network

    region   = _region_geojson(req.province, req.district, req.geometry)
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
    geometry: Optional[dict] = None
    max_iter: int            = 60
    level:    int            = 10


@app.post("/geomoz-api/gee/watershed")
async def gee_watershed(req: GEEWatershedRequest, uid: str = Depends(require_gee_auth)):
    """
    Basin delineation at a clicked point. Primary method returns the containing
    HydroBASINS sub-basin (instant, real boundary); falls back to iterative D8
    on HydroSHEDS 15DIR if HydroBASINS is unavailable. Returns tile URL +
    GeoJSON polygon + area km². `level` (6–12) controls HydroBASINS detail.
    """
    import asyncio
    from gee_module import compute_watershed_from_point

    region   = _region_geojson(req.province, req.district, req.geometry)
    loop     = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_watershed_from_point(
                req.lat, req.lon, region, req.max_iter, req.level
            ),
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE watershed failed: {exc}")


# ── Geoperigos / Geohazards ────────────────────────────────────────────────────

class GEEFloodRequest(BaseModel):
    province:       Optional[str] = None
    district:       Optional[str] = None
    geometry:       Optional[dict] = None
    event_start:    str
    event_end:      str
    baseline_start: Optional[str] = None
    baseline_end:   Optional[str] = None

    @field_validator('event_start', 'event_end', 'baseline_start', 'baseline_end')
    @classmethod
    def validate_date_format(cls, v):
        if v is None:
            return v
        try:
            from datetime import datetime
            datetime.strptime(v, '%Y-%m-%d')
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v


@app.post("/geomoz-api/gee/flood")
async def gee_flood(req: GEEFloodRequest, uid: str = Depends(require_gee_auth)):
    """Sentinel-1 SAR flood extent (change detection) for an event window."""
    import asyncio
    from gee_module import compute_flood_sar

    region = _region_geojson(req.province, req.district, req.geometry)
    loop   = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_flood_sar(
                region, req.event_start, req.event_end,
                req.baseline_start, req.baseline_end,
            ),
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE flood failed: {exc}")


class GEEErosionRequest(BaseModel):
    province: Optional[str] = None
    district: Optional[str] = None
    geometry: Optional[dict] = None
    year:     int           = 2023


@app.post("/geomoz-api/gee/erosion")
async def gee_erosion(req: GEEErosionRequest, uid: str = Depends(require_gee_auth)):
    """RUSLE soil-erosion risk (A = R·K·LS·C·P) classified into 5 classes."""
    import asyncio
    from gee_module import compute_erosion_rusle

    region = _region_geojson(req.province, req.district, req.geometry)
    loop   = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_erosion_rusle(region, req.year),
        )
        return result
    except Exception as exc:
        raise HTTPException(500, f"GEE erosion failed: {exc}")


class GEEGroundwaterRequest(BaseModel):
    province: Optional[str] = None
    district: Optional[str] = None
    geometry: Optional[dict] = None
    year:     int           = 2023


@app.post("/geomoz-api/gee/groundwater")
async def gee_groundwater(req: GEEGroundwaterRequest, uid: str = Depends(require_gee_auth)):
    """Groundwater-potential map (AHP weighted overlay) classified into 5 classes."""
    import asyncio
    from gee_module import compute_groundwater_ahp

    region = _region_geojson(req.province, req.district, req.geometry)
    loop   = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_groundwater_ahp(region, req.year),
        )
        return result
    except Exception as exc:
        raise HTTPException(500, f"GEE groundwater failed: {exc}")


# ── AlphaEarth Foundations ───────────────────────────────────────────────────────

class GEEEmbeddingRequest(BaseModel):
    province: Optional[str] = None
    district: Optional[str] = None
    geometry: Optional[dict] = None
    year: int = 2024
    pca_scale: int = 1000


@app.post("/geomoz-api/gee/embedding")
async def gee_embedding(req: GEEEmbeddingRequest, uid: str = Depends(require_gee_auth)):
    """AlphaEarth Foundations embedding tile — PCA-reduced to RGB."""
    import asyncio
    from gee_module import compute_embedding_tile

    region = _region_geojson(req.province, req.district, req.geometry)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_embedding_tile(region, req.year, req.pca_scale),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"AlphaEarth embedding failed: {exc}")


class GEEEmbeddingClusterRequest(BaseModel):
    province:   Optional[str] = None
    district:   Optional[str] = None
    geometry:   Optional[dict] = None
    n_clusters: int = 6
    year:       int = 2024
    scale:      int = 1000

    @field_validator('n_clusters')
    @classmethod
    def validate_clusters(cls, v):
        if not 3 <= v <= 20:
            raise ValueError('n_clusters must be between 3 and 20')
        return v


@app.post("/geomoz-api/gee/embedding/cluster")
async def gee_embedding_cluster(req: GEEEmbeddingClusterRequest, uid: str = Depends(require_gee_auth)):
    """Unsupervised K-Means clustering on 64-d embedding vectors."""
    import asyncio
    from gee_module import compute_embedding_cluster

    region = _region_geojson(req.province, req.district, req.geometry)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_embedding_cluster(region, req.n_clusters, req.year, req.scale),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"AlphaEarth cluster failed: {exc}")


class GEEEmbeddingSimilarityRequest(BaseModel):
    province:     Optional[str] = None
    district:     Optional[str] = None
    geometry:     Optional[dict] = None
    reference_lon: float
    reference_lat: float
    year:         int = 2024
    buffer_m:     int = 500
    scale:        int = 1000


@app.post("/geomoz-api/gee/embedding/similarity")
async def gee_embedding_similarity(req: GEEEmbeddingSimilarityRequest, uid: str = Depends(require_gee_auth)):
    """Cosine similarity of all pixels to a reference point's embedding."""
    import asyncio
    from gee_module import compute_embedding_similarity

    region = _region_geojson(req.province, req.district, req.geometry)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_embedding_similarity(
                region, req.reference_lon, req.reference_lat,
                req.year, req.buffer_m, req.scale,
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
        raise HTTPException(500, f"AlphaEarth similarity failed: {exc}")


class GEEEmbeddingClassifyRequest(BaseModel):
    province:        Optional[str] = None
    district:        Optional[str] = None
    geometry:        Optional[dict] = None
    training:        dict  # GeoJSON FeatureCollection with "class" property
    class_property:  str = "class"
    year:            int = 2024
    scale:           int = 1000


@app.post("/geomoz-api/gee/embedding/classify")
async def gee_embedding_classify(req: GEEEmbeddingClassifyRequest, uid: str = Depends(require_gee_auth)):
    """Supervised Random Forest classification on 64-d embeddings.

    training: GeoJSON FeatureCollection where each feature has
              a numeric 'class' property (int). Users draw a few
              polygons/labels -> classifies the rest.
    """
    import asyncio
    from gee_module import compute_embedding_classify

    region = _region_geojson(req.province, req.district, req.geometry)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_embedding_classify(
                region, req.training, req.class_property,
                req.year, req.scale,
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
        raise HTTPException(500, f"AlphaEarth classify failed: {exc}")


class GEEEmbeddingChangeRequest(BaseModel):
    province:    Optional[str] = None
    district:    Optional[str] = None
    geometry:    Optional[dict] = None
    year_before: int = 2020
    year_after:  int = 2024
    scale:       int = 1000

    @field_validator('year_before', 'year_after')
    @classmethod
    def validate_year(cls, v):
        if not 2017 <= v <= 2030:
            raise ValueError('year must be between 2017 and 2030')
        return v


@app.post("/geomoz-api/gee/embedding/change")
async def gee_embedding_change(req: GEEEmbeddingChangeRequest, uid: str = Depends(require_gee_auth)):
    """Change detection between two years using embedding cosine distance."""
    import asyncio
    from gee_module import compute_embedding_change

    region = _region_geojson(req.province, req.district, req.geometry)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_embedding_change(region, req.year_before, req.year_after, req.scale),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"AlphaEarth change failed: {exc}")


# ── SPI × NDVI drought correlation ─────────────────────────────────────────────

class GEESpiNdviRequest(BaseModel):
    province:   Optional[str] = None
    district:   Optional[str] = None
    geometry:   Optional[dict] = None
    year:       int = 2024
    clim_start: int = 2001
    samples:    int = 400

    @field_validator('year')
    @classmethod
    def validate_year(cls, v):
        if not 2001 <= v <= 2030:
            raise ValueError('year must be between 2001 and 2030 (MODIS era)')
        return v

    @field_validator('samples')
    @classmethod
    def validate_samples(cls, v):
        if not 50 <= v <= 2000:
            raise ValueError('samples must be between 50 and 2000')
        return v


@app.post("/geomoz-api/gee/spi-ndvi")
async def gee_spi_ndvi(req: GEESpiNdviRequest, uid: str = Depends(require_gee_auth)):
    """SPI (CHIRPS z-score vs climatology) × NDVI (MODIS) tiles + Pearson correlation."""
    import asyncio
    from gee_module import compute_spi_ndvi

    region = _region_geojson(req.province, req.district, req.geometry)
    loop   = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_spi_ndvi(region, req.year, req.clim_start, req.samples),
        )
        result["province"] = req.province
        result["district"] = req.district
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE SPI×NDVI failed: {exc}")


# ── Targeting × admin spatial overlap report ──────────────────────────────────

@lru_cache(maxsize=1)
def _villages():
    import geomoz
    return geomoz.read_village().to_crs("EPSG:4326")


@lru_cache(maxsize=1)
def _admin_posts():
    import geomoz
    return geomoz.read_admin_post().to_crs("EPSG:4326")


def _overlap_report(zones_fc: dict) -> dict:
    """Cross favorable-zone polygons with geomoz admin layers.

    Returns per-district areas, villages and admin posts inside the zones.
    Each section degrades gracefully (a note is added instead of failing).
    """
    import geopandas as gpd

    notes: list[str] = []
    feats = (zones_fc or {}).get("features", [])
    if not feats:
        return {
            "totalFavorableKm2": 0.0, "zoneCount": 0,
            "districts": [], "villages": [], "villageCount": 0,
            "adminPostCount": 0, "notes": ["Nenhuma zona favorável acima do limiar."],
        }

    zones = gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326")
    zones = zones[zones.geometry.notna()].copy()
    zones.geometry = zones.geometry.make_valid()
    zones = zones[zones.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if len(zones) == 0:
        return {
            "totalFavorableKm2": 0.0, "zoneCount": 0,
            "districts": [], "villages": [], "villageCount": 0,
            "adminPostCount": 0, "notes": ["Zonas favoráveis sem geometria poligonal válida."],
        }

    total_km2 = float(zones.to_crs("EPSG:32736").geometry.area.sum() / 1e6)

    # Per-district favorable area
    districts_out = []
    try:
        dist = _districts()
        dcol = find_col(dist, ["Distrito", "DISTRITO", "NAME_2", "name"])
        pcol = find_col(dist, ["Provincia", "PROVINCIA", "NAME_1"])
        cols = [c for c in [dcol, pcol] if c] + ["geometry"]
        inter = gpd.overlay(zones[["geometry"]], dist[cols], how="intersection", keep_geom_type=True)
        if len(inter) > 0 and dcol:
            inter["_km2"] = inter.to_crs("EPSG:32736").geometry.area / 1e6
            group_cols = [c for c in [pcol, dcol] if c]
            grouped = inter.groupby(group_cols)["_km2"].sum().reset_index() \
                           .sort_values("_km2", ascending=False)
            for _, row in grouped.iterrows():
                if row["_km2"] < 0.01:
                    continue
                districts_out.append({
                    "province": str(row[pcol]) if pcol else None,
                    "district": str(row[dcol]),
                    "areaKm2":  round(float(row["_km2"]), 2),
                    "pct":      round(float(row["_km2"]) / total_km2 * 100, 1) if total_km2 > 0 else 0,
                })
    except Exception as exc:
        logger.warning("Overlap: district crossing failed: %s", exc)
        notes.append(f"Cruzamento com distritos indisponível: {exc}")

    # Villages inside the zones
    villages_out: list[dict] = []
    village_count = 0
    try:
        vil = _villages()
        vcol = find_col(vil, ["Village", "VILLAGE", "Aldeia", "ALDEIA", "NAME", "Name", "name"])
        hits = gpd.sjoin(vil, zones[["geometry"]], how="inner", predicate="within")
        village_count = int(len(hits))
        if vcol:
            for _, row in hits.head(30).iterrows():
                villages_out.append({
                    "name": str(row[vcol]),
                    "lon":  round(float(row.geometry.centroid.x), 5),
                    "lat":  round(float(row.geometry.centroid.y), 5),
                })
    except Exception as exc:
        logger.warning("Overlap: village crossing failed: %s", exc)
        notes.append(f"Cruzamento com aldeias indisponível: {exc}")

    # Admin posts inside the zones
    admin_post_count = 0
    try:
        posts = _admin_posts()
        if posts.geometry.geom_type.isin(["Polygon", "MultiPolygon"]).any():
            # polygon layer → count posts whose area intersects the zones
            hits = gpd.sjoin(posts, zones[["geometry"]], how="inner", predicate="intersects")
        else:
            hits = gpd.sjoin(posts, zones[["geometry"]], how="inner", predicate="within")
        admin_post_count = int(hits.index.nunique())
    except Exception as exc:
        logger.warning("Overlap: admin-post crossing failed: %s", exc)
        notes.append(f"Cruzamento com postos administrativos indisponível: {exc}")

    return {
        "totalFavorableKm2": round(total_km2, 2),
        "zoneCount":         int(len(zones)),
        "districts":         districts_out,
        "villages":          villages_out,
        "villageCount":      village_count,
        "adminPostCount":    admin_post_count,
        "notes":             notes,
    }


class GEETargetingOverlapRequest(GEETargetingRequest):
    max_zones: int = 300

    @field_validator('max_zones')
    @classmethod
    def validate_max_zones(cls, v):
        if not 10 <= v <= 1000:
            raise ValueError('max_zones must be between 10 and 1000')
        return v


@app.post("/geomoz-api/gee/targeting-overlap")
async def gee_targeting_overlap(req: GEETargetingOverlapRequest, uid: str = Depends(require_gee_auth)):
    """Spatial-overlap report: favorable targeting zones × districts / villages / admin posts.

    Vectorizes score ≥ threshold at 300 m in GEE, then crosses the polygons
    with the geomoz administrative layers locally. Returns the report plus the
    zone GeoJSON so the client can draw it.
    """
    import asyncio
    from gee_module import compute_targeting_zones

    region = _region_geojson(req.province, req.district, req.geometry)
    loop   = asyncio.get_event_loop()

    try:
        zones_result = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: compute_targeting_zones(
                req.mineral, region, req.start_date, req.end_date, req.cloud_pct,
                req.weights_override, req.invert_override, req.score_threshold,
                req.max_zones,
            ),
        )
        report = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: _overlap_report(zones_result["zones"]),
        )
        return {
            "mineral":        zones_result["mineral"],
            "mineralName":    zones_result["mineralName"],
            "scoreThreshold": zones_result["scoreThreshold"],
            "formula":        zones_result["formula"],
            "dateRange":      zones_result["dateRange"],
            "zones":          zones_result["zones"],
            "report":         report,
            "province":       req.province,
            "district":       req.district,
        }
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"GEE targeting overlap failed: {exc}")


# ── Shapefile export ───────────────────────────────────────────────────────────

@app.get("/geomoz-api/export/shapefile")
def export_shapefile(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    layer: str = Query("geology"),
    uid: str = Depends(require_firebase_auth),
):
    """Export a layer as a zipped ESRI Shapefile (QGIS/ArcGIS-ready).

    layer = geology (clipped to province/district like /geology),
            provinces, or districts (filtered by province).
    """
    import io
    import tempfile
    import zipfile
    import geopandas as gpd

    if layer == "geology":
        gdf = _clip_geo(_geology().copy(), province, district)
        color_col = find_col(gdf, ["code2006", "Legend"])
        if color_col:
            gdf["_color"] = gdf[color_col].fillna("Unknown").astype(str).apply(color_for)
    elif layer == "provinces":
        gdf = _provinces().copy()
    elif layer == "districts":
        gdf = _districts().copy()
        if province:
            pcol = find_col(gdf, ["Provincia", "PROVINCIA", "NAME_1"])
            if pcol:
                gdf = gdf[gdf[pcol] == province]
    else:
        raise HTTPException(400, f"Camada desconhecida '{layer}'. Válidas: geology, provinces, districts")

    if len(gdf) == 0:
        raise HTTPException(404, "Nenhuma feição encontrada para a área seleccionada.")

    # Shapefiles cannot mix geometry types — keep only the polygonal parts
    gdf = gdf.explode(index_parts=False)
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if len(gdf) == 0:
        raise HTTPException(404, "A área seleccionada não contém polígonos exportáveis.")

    base = f"geomoz_{layer}" + (f"_{district or province}" if (province or district) else "")
    base = "".join(c if c.isalnum() or c in "_-" else "_" for c in base)[:60]

    try:
        with tempfile.TemporaryDirectory() as td:
            shp_path = os.path.join(td, f"{base}.shp")
            gdf.to_file(shp_path, driver="ESRI Shapefile", encoding="utf-8")
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for fname in sorted(os.listdir(td)):
                    zf.write(os.path.join(td, fname), arcname=fname)
        return Response(
            content=buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{base}.zip"'},
        )
    except Exception as exc:
        logger.error("SHP export failed: %s", exc)
        raise HTTPException(500, f"Exportação Shapefile falhou: {exc}")


# ── Static Map Image (Cartopy) ──────────────────────────────────────────────────

class GEEMapImageRequest(BaseModel):
    """Request a static map image for PDF-export embedding."""
    bounds: dict  # {"south": float, "north": float, "west": float, "east": float}
    tile_url: Optional[str] = None
    overlay_geojson: Optional[dict] = None
    overlay_label: Optional[str] = None
    legend_items: Optional[list[dict]] = None
    width_mm: float = 182.0
    height_mm: float = 100.0
    dpi: int = 200
    title: Optional[str] = None

    @field_validator('bounds')
    @classmethod
    def validate_bounds(cls, v):
        required = {"south", "north", "west", "east"}
        if not isinstance(v, dict) or not required.issubset(v.keys()):
            raise ValueError(f'bounds must contain {required}')
        if v["south"] >= v["north"]:
            raise ValueError('south must be < north')
        if v["west"] >= v["east"]:
            raise ValueError('west must be < east')
        return v

    @field_validator('dpi')
    @classmethod
    def validate_dpi(cls, v):
        if not 72 <= v <= 600:
            raise ValueError('dpi must be between 72 and 600')
        return v


@app.post("/geomoz-api/gee/map-image")
async def gee_map_image(req: GEEMapImageRequest, uid: str = Depends(require_gee_auth)):
    """
    Generate a static map image using Cartopy, suitable for PDF embedding.

    Uses the CartoDB basemap + optional GEE raster tile overlay + optional
    GeoJSON vector overlay. Returns a PNG image with:
      - Coordinate grid (lat/lon graticule with labels)
      - Scale bar
      - North arrow
      - Coastline / borders / lakes

    This endpoint replaces the browser-side html2canvas capture for
    professional, print-quality map exports.
    """
    import asyncio
    from utils.map_export import render_map_from_gee_result

    loop = asyncio.get_event_loop()

    try:
        png_bytes = await loop.run_in_executor(
            _thread_pool_executor,
            lambda: render_map_from_gee_result(
                bounds=req.bounds,
                tile_url=req.tile_url,
                overlay_geojson=req.overlay_geojson,
                overlay_label=req.overlay_label,
                legend_items=req.legend_items,
                width_mm=req.width_mm,
                height_mm=req.height_mm,
                dpi=req.dpi,
                title=req.title,
            ),
        )
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": "inline; filename=geomoz_map.png",
                "X-Map-Bounds": json.dumps(req.bounds),
            },
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.error("Map-image generation failed: %s", exc, exc_info=True)
        raise HTTPException(500, f"Geração de mapa falhou: {exc}")
