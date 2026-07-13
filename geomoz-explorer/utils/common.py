"""
Common / shared utilities for GeoMoz Explorer.

Consolidates functions that were duplicated across api.py, utils/data_loader.py,
and utils/mapping.py into a single source of truth.
"""

import hashlib
import logging
from typing import Optional

import geopandas as gpd
from shapely.errors import TopologicalError, GEOSException

# ── Colour palette ─────────────────────────────────────────────────────────────

DEFAULT_PALETTE = [
    "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
    "#264653", "#8ECAE6", "#219EBC", "#FFB703", "#FB8500",
    "#606C38", "#DDA15E", "#BC6C25", "#52B788", "#F2CC8F",
    "#023047", "#A8DADC", "#6D6875", "#B5838D", "#E76F51",
]


def color_for(value: str, palette: Optional[list] = None) -> str:
    """
    Deterministically assign a colour from the palette based on the value string.

    Uses MD5 hashing so the same string always gets the same colour.
    """
    if not value or str(value).strip().lower() in ("", "nan", "none", "unknown"):
        return "#AAAAAA"
    pal = palette or DEFAULT_PALETTE
    h = int(hashlib.md5(str(value).encode()).hexdigest(), 16)
    return pal[h % len(pal)]


# ── Column helpers ─────────────────────────────────────────────────────────────

def find_col(gdf: gpd.GeoDataFrame, candidates: list) -> Optional[str]:
    """Return the first column name from *candidates* that exists in *gdf*."""
    if gdf is None:
        return None
    for col in candidates:
        if col in gdf.columns:
            return col
    return None


# ── Geometry helpers ───────────────────────────────────────────────────────────

def clip_geodataframe(
    gdf: gpd.GeoDataFrame,
    mask_gdf: gpd.GeoDataFrame,
    logger: Optional[logging.Logger] = None,
) -> gpd.GeoDataFrame:
    """
    Clip *gdf* to the union of geometries in *mask_gdf*.

    Returns the original *gdf* unchanged if clipping fails for any reason
    (empty mask, topological errors, etc.).
    """
    if gdf is None or mask_gdf is None or len(mask_gdf) == 0:
        return gdf

    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        area = mask_gdf.geometry.union_all()
        return gpd.clip(gdf, area)
    except (ValueError, TopologicalError, GEOSException, AttributeError) as exc:
        logger.warning("Clip failed: %s", exc)
        return gdf


def clip_to_province_or_district(
    gdf: gpd.GeoDataFrame,
    province: Optional[str] = None,
    district: Optional[str] = None,
    provinces_gdf: Optional[gpd.GeoDataFrame] = None,
    districts_gdf: Optional[gpd.GeoDataFrame] = None,
    logger: Optional[logging.Logger] = None,
) -> gpd.GeoDataFrame:
    """
    Convenience: clip *gdf* by province and/or district name strings.

    Priority: district > province.  If *provinces_gdf* / *districts_gdf* are
    omitted they will be loaded via the project's loader functions — callers
    should pass them in when they are already available to avoid redundant I/O.
    """
    if logger is None:
        logger = logging.getLogger(__name__)

    if district and districts_gdf is not None:
        dist_col = find_col(districts_gdf, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if dist_col:
            mask = districts_gdf[districts_gdf[dist_col] == district]
            if len(mask) > 0:
                # Disambiguate by province when both are given
                if province:
                    pcol = find_col(districts_gdf, ["Provincia", "PROVINCIA", "NAME_1"])
                    if pcol:
                        mask_p = mask[mask[pcol] == province]
                        if len(mask_p) > 0:
                            mask = mask_p
                return clip_geodataframe(gdf, mask, logger)

    if province and provinces_gdf is not None:
        prov_col = find_col(provinces_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if prov_col:
            mask = provinces_gdf[provinces_gdf[prov_col] == province]
            if len(mask) > 0:
                return clip_geodataframe(gdf, mask, logger)

    return gdf
