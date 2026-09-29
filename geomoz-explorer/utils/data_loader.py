"""
Data loading utilities for GeoMoz Explorer.
Uses Streamlit cache to avoid reloading heavy datasets on every interaction.
"""

import streamlit as st
import geopandas as gpd
import pandas as pd

from utils.common import find_col


@st.cache_data(show_spinner=False)
def load_provinces():
    """Load Mozambique province boundaries from geomoz."""
    try:
        import geomoz
        gdf = geomoz.read_province()
        if gdf is not None and len(gdf) > 0:
            gdf = gdf.to_crs("EPSG:4326")
            gdf = _simplify(gdf, tolerance=0.01)
        return gdf
    except Exception as e:
        st.warning(f"Could not load provinces: {e}")
        return None


@st.cache_data(show_spinner=False)
def load_districts():
    """Load Mozambique district boundaries from geomoz."""
    try:
        import geomoz
        gdf = geomoz.read_district()
        if gdf is not None and len(gdf) > 0:
            gdf = gdf.to_crs("EPSG:4326")
            gdf = _simplify(gdf, tolerance=0.005)
        return gdf
    except Exception as e:
        st.warning(f"Could not load districts: {e}")
        return None


@st.cache_data(show_spinner=False)
def load_admin_posts():
    """Load administrative posts from geomoz."""
    try:
        import geomoz
        gdf = geomoz.read_admin_post()
        if gdf is not None and len(gdf) > 0:
            gdf = gdf.to_crs("EPSG:4326")
            gdf = _simplify(gdf, tolerance=0.002)
        return gdf
    except Exception as e:
        st.warning(f"Could not load admin posts: {e}")
        return None


@st.cache_data(show_spinner=False)
def load_villages():
    """Load village/locality data from geomoz."""
    try:
        import geomoz
        gdf = geomoz.read_village()
        if gdf is not None and len(gdf) > 0:
            gdf = gdf.to_crs("EPSG:4326")
        return gdf
    except Exception as e:
        st.warning(f"Could not load villages: {e}")
        return None


@st.cache_data(show_spinner=False)
def load_geology():
    """Load geological data from geomoz."""
    try:
        import geomoz
        gdf = geomoz.read_geology()
        if gdf is not None and len(gdf) > 0:
            gdf = gdf.to_crs("EPSG:4326")
            gdf = _simplify(gdf, tolerance=0.005)
        return gdf
    except Exception as e:
        st.warning(f"Could not load geology: {e}")
        return None


def _simplify(gdf: gpd.GeoDataFrame, tolerance: float) -> gpd.GeoDataFrame:
    """Simplify geometries for faster web rendering."""
    try:
        gdf = gdf.copy()
        gdf["geometry"] = gdf["geometry"].simplify(tolerance, preserve_topology=True)
        return gdf
    except Exception:
        return gdf


def get_province_names(provinces_gdf) -> list:
    """Extract sorted list of province names."""
    if provinces_gdf is None:
        return []
    col = find_col(provinces_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name", "NAME"])
    if col:
        return sorted(provinces_gdf[col].dropna().unique().tolist())
    return []


def get_districts_for_province(districts_gdf, provinces_gdf, province_name: str):
    """Return districts belonging to a given province."""
    if districts_gdf is None or province_name is None:
        return None
    # Try to clip districts to province boundary
    try:
        prov_col = find_col(provinces_gdf, ["Provincia", "PROVINCIA", "NAME_1", "name", "NAME"])
        if prov_col:
            prov_geom = provinces_gdf[provinces_gdf[prov_col] == province_name]
            if len(prov_geom) == 0:
                return districts_gdf
            # Filter districts spatially
            clipped = gpd.clip(districts_gdf, prov_geom.geometry.union_all())
            return clipped if len(clipped) > 0 else districts_gdf
    except Exception:
        pass
    # Fallback: filter by province name column in districts
    dist_prov_col = find_col(districts_gdf, ["Provincia", "PROVINCIA", "NAME_1"])
    if dist_prov_col:
        filtered = districts_gdf[districts_gdf[dist_prov_col] == province_name]
        return filtered if len(filtered) > 0 else districts_gdf
    return districts_gdf


def get_district_names(districts_gdf) -> list:
    """Extract sorted list of district names."""
    if districts_gdf is None:
        return []
    col = find_col(districts_gdf, ["Distrito", "DISTRITO", "NAME_2", "name", "NAME"])
    if col:
        return sorted(districts_gdf[col].dropna().unique().tolist())
    return []


def filter_geology_by_area(geology_gdf, area_gdf):
    """Clip geology to a given area GeoDataFrame."""
    if geology_gdf is None or area_gdf is None:
        return None
    try:
        area_union = area_gdf.geometry.union_all()
        clipped = gpd.clip(geology_gdf, area_union)
        return clipped if len(clipped) > 0 else None
    except Exception as e:
        st.warning(f"Could not clip geology: {e}")
        return None



