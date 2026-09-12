"""
GeoMoz FastAPI backend — serves geomoz data as REST/GeoJSON endpoints.
Run: uvicorn api:app --host 0.0.0.0 --port 5001
"""

import json
import logging
import os
import sys
import time
from collections import defaultdict
from functools import lru_cache
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import geopandas as gpd
from shapely.errors import TopologicalError, GEOSException

from fastapi import FastAPI, Query, HTTPException, Request, File, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response

try:
    import firebase_admin
    from firebase_admin import credentials, auth as firebase_auth
    try:
        firebase_admin.initialize_app()
    except ValueError:
        pass
except ImportError:
    firebase_admin = None
    firebase_auth = None

async def require_firebase_auth(request: Request) -> str:
    if firebase_auth is None:
        return "dev-local-user"
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token Firebase ausente ou inválido.")
    token = auth_header.removeprefix("Bearer ").strip()
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token Firebase inválido: {str(e)}")

async def require_gee_auth(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    uid = None
    if firebase_auth and auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        try:
            decoded = firebase_auth.verify_id_token(token)
            uid = decoded.get("uid")
        except Exception:
            pass
    from gee_module import _init_gee
    try:
        _init_gee(uid)
    except RuntimeError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return uid or "anonymous"
from pydantic import BaseModel, field_validator, constr

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


def _gdf_to_geojson_response(gdf) -> Response:
    geojson_str = gdf.to_json(na="null", show_bbox=False)
    return Response(content=geojson_str, media_type="application/json")


def _union_geom(series):
    """Safe union compatible with GeoPandas < 1.0 (unary_union) and >= 1.0 (union_all)."""
    return series.union_all() if hasattr(series, "union_all") else series.unary_union


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
                    return gpd.clip(gdf, _union_geom(mask.geometry).buffer(0))
                except (ValueError, TopologicalError, GEOSException) as e:
                    logger.warning("Failed to clip to district '%s': %s", district, e)
    elif province:
        prov_gdf = _provinces()
        prov_col = find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            mask = prov_gdf[prov_gdf[prov_col] == province]
            if len(mask) > 0:
                try:
                    return gpd.clip(gdf, _union_geom(mask.geometry).buffer(0))
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
                geom = _union_geom(sub.geometry).buffer(0).simplify(0.01, preserve_topology=True)
                return mapping(geom)

    # Priority 3: province
    if province:
        prov_gdf = _provinces()
        pcol = find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if pcol:
            sub = prov_gdf[prov_gdf[pcol] == province]
            if len(sub) > 0:
                geom = _union_geom(sub.geometry).buffer(0).simplify(0.02, preserve_topology=True)
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


# ── GEE endpoints ──────────────────────────────────────────────────────────────

@app.get("/geomoz-api/status")
def api_status():
    """Basic health check and initialization status."""
    msg = "GeoMoz API is running."
    return {"status": "ok", "message": msg}

@app.post("/geomoz-api/convert-geom")
async def convert_geom(file: UploadFile = File(...)):
    """Converts a KML, GPX or zipped Shapefile into a GeoJSON dict."""
    import tempfile
    import os
    import json
    
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['kml', 'gpx', 'zip', 'json', 'geojson']:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use KML, GPX, ZIP ou GeoJSON.")
        
    try:
        # Save uploaded file to temp
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            content = await file.read()
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
        os.remove(tmp_path)
        
        return json.loads(geojson_str)
    except Exception as e:
        logger.exception("Erro ao converter ficheiro de geometria.")
        raise HTTPException(status_code=500, detail=f"Erro na conversão: {str(e)}")



class GEEServiceAccountKeyRequest(BaseModel):
    service_account_key: Optional[str] = None
    project_id: Optional[str] = None


@app.get("/geomoz-api/gee/config")
def gee_config():
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
def gee_configure(req: GEEServiceAccountKeyRequest):
    """
    Update GEE credentials and reinitialize the connection.
    Accepts service_account_key (JSON string) and/or project_id.
    Returns the new connection status.
    """
    from gee_module import reset_gee, _init_gee, gee_status as _gee_status

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

@app.post("/geomoz-api/gee/oauth-token")
async def gee_oauth_token(req: OAuthTokenRequest, uid: str = Depends(require_firebase_auth)):
    import gee_session_store
    gee_session_store.set_token(uid, {
        "access_token": req.access_token,
        "project": req.project
    })
    return {"message": "Token guardado com sucesso."}

@app.get("/geomoz-api/gee/status")
async def gee_status_endpoint(request: Request):
    import gee_session_store
    auth_header = request.headers.get("Authorization", "")
    uid = None
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
        try:
            decoded = firebase_auth.verify_id_token(token)
            uid = decoded.get("uid")
        except Exception:
            pass
    token = gee_session_store.get_token(uid) if uid else None
    has_sa = bool(os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip())
    connected = bool(token) or has_sa
    auth_type = "oauth2" if token else ("service_account" if has_sa else None)
    return {
        "connected": connected,
        "project": (token.get("project") if token else None) or os.environ.get("GEE_PROJECT_ID", None),
        "auth_type": auth_type,
        "user_connected": bool(token),
        "server_connected": has_sa
    }

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
