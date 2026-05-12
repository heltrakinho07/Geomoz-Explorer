"""
GeoMoz FastAPI backend — serves geomoz data as REST/GeoJSON endpoints.
Run: uvicorn api:app --host 0.0.0.0 --port 5001
"""

import json
import hashlib
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="GeoMoz API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── data loaders (cached) ──────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _provinces():
    import geomoz, geopandas as gpd
    gdf = geomoz.read_province().to_crs("EPSG:4326")
    gdf.geometry = gdf.geometry.simplify(0.01, preserve_topology=True)
    return gdf

@lru_cache(maxsize=1)
def _districts():
    import geomoz, geopandas as gpd
    gdf = geomoz.read_district().to_crs("EPSG:4326")
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True)
    return gdf

@lru_cache(maxsize=1)
def _geology():
    import geomoz, geopandas as gpd
    gdf = geomoz.read_geology().to_crs("EPSG:4326")
    gdf.geometry = gdf.geometry.simplify(0.005, preserve_topology=True)
    return gdf


def _find_col(gdf, candidates):
    for c in candidates:
        if c in gdf.columns:
            return c
    return None


def _gdf_to_geojson(gdf):
    """Convert GeoDataFrame to GeoJSON dict, dropping NaN safely."""
    import numpy as np
    cols = [c for c in gdf.columns if c != "geometry"]
    features = []
    for _, row in gdf.iterrows():
        props = {}
        for c in cols:
            v = row[c]
            if isinstance(v, float) and np.isnan(v):
                props[c] = None
            else:
                try:
                    json.dumps(v)
                    props[c] = v
                except Exception:
                    props[c] = str(v)
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": json.loads(geom.to_json()) if hasattr(geom, "to_json") else None,
        })
    return {"type": "FeatureCollection", "features": features}


def _color_for(value: str) -> str:
    palette = [
        "#E63946","#457B9D","#2A9D8F","#E9C46A","#F4A261",
        "#264653","#8ECAE6","#219EBC","#FFB703","#FB8500",
        "#606C38","#DDA15E","#BC6C25","#52B788","#F2CC8F",
        "#023047","#A8DADC","#6D6875","#B5838D","#E76F51",
    ]
    h = int(hashlib.md5(str(value).encode()).hexdigest(), 16)
    return palette[h % len(palette)]

# ── endpoints ──────────────────────────────────────────────────────────────────

@app.get("/geomoz-api/health")
def health():
    return {"status": "ok"}


@app.get("/geomoz-api/provinces")
def get_provinces():
    gdf = _provinces()
    return JSONResponse(_gdf_to_geojson(gdf))


@app.get("/geomoz-api/province-names")
def get_province_names():
    gdf = _provinces()
    col = _find_col(gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
    if not col:
        return {"names": []}
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
    return JSONResponse(_gdf_to_geojson(gdf))


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
    gdf = _geology()

    # Clip to province or district if selected
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

    # Add color property
    color_col = color_by if color_by in gdf.columns else _find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
    if color_col:
        gdf = gdf.copy()
        gdf["_color"] = gdf[color_col].fillna("Unknown").astype(str).apply(_color_for)

    return JSONResponse(_gdf_to_geojson(gdf))


@app.get("/geomoz-api/stats")
def get_stats(
    province: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
):
    import geopandas as gpd
    import numpy as np

    gdf = _geology()

    # Clip area
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

    # Area calculation in UTM 36S
    try:
        gdf_proj = gdf.to_crs("EPSG:32736")
        gdf_proj = gdf_proj.copy()
        gdf_proj["_area_m2"] = gdf_proj.geometry.area
    except Exception:
        gdf_proj = gdf.copy()
        gdf_proj["_area_m2"] = 0.0

    legend_col = _find_col(gdf_proj, ["Legend", "LEGEND", "code2006", "ERA"])
    code_col = _find_col(gdf_proj, ["code2006", "CODE2006"])
    era_col = _find_col(gdf_proj, ["ERA", "era"])
    period_col = _find_col(gdf_proj, ["PERIOD", "Period", "period"])

    total_area_km2 = round(gdf_proj["_area_m2"].sum() / 1e6, 2)

    # Top lithologies
    lithologies = []
    if legend_col:
        grouped = (
            gdf_proj.groupby(legend_col, dropna=False)["_area_m2"]
            .sum()
            .reset_index()
            .sort_values("_area_m2", ascending=False)
        )
        for _, row in grouped.head(10).iterrows():
            name = str(row[legend_col]) if row[legend_col] else "Unknown"
            area_km2 = round(row["_area_m2"] / 1e6, 2)
            pct = round(area_km2 / total_area_km2 * 100, 1) if total_area_km2 > 0 else 0
            lithologies.append({
                "name": name,
                "areaKm2": area_km2,
                "percent": pct,
                "color": _color_for(name),
            })

    dominant = lithologies[0]["name"] if lithologies else "N/A"
    unique_units = len(gdf_proj[legend_col].dropna().unique()) if legend_col else 0

    return {
        "totalFeatures": len(gdf),
        "totalUnits": unique_units,
        "totalAreaKm2": total_area_km2,
        "dominant": dominant,
        "lithologies": lithologies,
    }


@app.get("/geomoz-api/geology-colors")
def get_geology_colors(color_by: str = Query("code2006")):
    """Return unique values and their deterministic colours."""
    gdf = _geology()
    col = color_by if color_by in gdf.columns else _find_col(gdf, ["code2006", "Legend", "ERA", "PERIOD"])
    if not col:
        return {"items": []}
    vals = sorted(gdf[col].dropna().unique().tolist())
    return {
        "column": col,
        "items": [{"value": str(v), "color": _color_for(str(v))} for v in vals[:40]],
    }
