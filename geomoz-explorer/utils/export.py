"""
Export utilities for GeoMoz Explorer.
Provides helpers to produce downloadable HTML, CSV, and GeoJSON.
"""

import io
import json
import pandas as pd
import geopandas as gpd
import folium


def map_to_html(m: folium.Map) -> bytes:
    """Render a Folium map to an HTML byte string."""
    html_str = m._repr_html_()
    # Also support full standalone HTML
    full_html = m.get_root().render()
    return full_html.encode("utf-8")


def dataframe_to_csv(df: pd.DataFrame) -> bytes:
    """Convert a DataFrame to CSV bytes."""
    buffer = io.StringIO()
    df.to_csv(buffer, index=False, encoding="utf-8")
    return buffer.getvalue().encode("utf-8")


def geodataframe_to_geojson(gdf: gpd.GeoDataFrame) -> bytes:
    """Convert a GeoDataFrame to GeoJSON bytes."""
    try:
        # Drop internal columns that should not be exported
        cols_to_drop = [c for c in gdf.columns if c.startswith("_")]
        gdf_export = gdf.drop(columns=cols_to_drop, errors="ignore")
        geojson_str = gdf_export.to_json()
        return geojson_str.encode("utf-8")
    except Exception as e:
        return json.dumps({"error": str(e)}).encode("utf-8")
