"""
GeoMoz FastAPI backend — serves geomoz data as REST/GeoJSON endpoints.
Run: uvicorn api:app --host 0.0.0.0 --port 5001
"""

import json
import hashlib
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI(title="GeoMoz API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── data loaders (cached) ──────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _provinces():
    import geomoz
    gdf = geomoz.read_province().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.01, preserve_topology=True)
    return gdf

@lru_cache(maxsize=1)
def _districts():
    import geomoz
    gdf = geomoz.read_district().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True)
    return gdf

@lru_cache(maxsize=1)
def _geology():
    import geomoz
    gdf = geomoz.read_geology().to_crs("EPSG:4326")
    gdf = gdf.copy()
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True)
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


# ── province bbox helper ───────────────────────────────────────────────────────

def _province_bbox(province: Optional[str]) -> tuple[float, float, float, float]:
    """Return (west, south, east, north) for a province, or full MZ if None."""
    if province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            mask = prov_gdf[prov_col] == province
            if mask.any():
                bounds = prov_gdf[mask].total_bounds  # (minx, miny, maxx, maxy)
                # add small buffer
                return (bounds[0] - 0.05, bounds[1] - 0.05, bounds[2] + 0.05, bounds[3] + 0.05)
    return (30.2, -26.9, 40.8, -10.4)  # full Mozambique


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
                except Exception:
                    pass
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
                except Exception:
                    pass
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
                except Exception:
                    pass
    elif province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            area = prov_gdf[prov_gdf[prov_col] == province]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except Exception:
                    pass

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
                except Exception:
                    pass
    elif province:
        prov_gdf = _provinces()
        prov_col = _find_col(prov_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            area = prov_gdf[prov_gdf[prov_col] == province]
            if len(area) > 0:
                try:
                    gdf = gpd.clip(gdf, area.geometry.union_all())
                except Exception:
                    pass

    if len(gdf) == 0:
        return {"totalFeatures": 0, "totalUnits": 0, "totalAreaKm2": 0, "dominant": "N/A", "lithologies": []}

    try:
        gdf_proj = gdf.to_crs("EPSG:32736")
        gdf_proj = gdf_proj.copy()
        gdf_proj["_area_m2"] = gdf_proj.geometry.area
    except Exception:
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
    from gee_module import gee_status as _gee_status, INDEX_REGISTRY
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


@app.post("/geomoz-api/gee/index")
async def gee_index(req: GEEIndexRequest):
    """
    Compute a Sentinel-2 spectral index via Google Earth Engine.

    Returns a GEE-hosted tile URL (valid ~24 h) for use in Leaflet as a TileLayer.
    Processing time: typically 5–20 s for a province-sized area.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from gee_module import compute_index_tile, INDEX_REGISTRY

    if req.index not in INDEX_REGISTRY:
        raise HTTPException(400, f"Unknown index '{req.index}'. Valid: {list(INDEX_REGISTRY)}")

    # Get bounding box (province or full MZ)
    bbox = _province_bbox(req.province)

    executor = ThreadPoolExecutor(max_workers=4)
    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            executor,
            lambda: compute_index_tile(req.index, bbox, req.start_date, req.end_date, req.cloud_pct),
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


@app.get("/geomoz-api/gee/indices")
def gee_indices():
    """List available spectral indices and their metadata."""
    from gee_module import INDEX_REGISTRY
    return {
        "indices": [
            {
                "id":      k,
                "name":    v["name"],
                "formula": v["formula"],
                "bands":   v["bands"],
            }
            for k, v in INDEX_REGISTRY.items()
        ]
    }
