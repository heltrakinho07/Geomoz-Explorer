"""
Spatial analysis utilities for GeoMoz Explorer.
Calculates geological statistics for a selected area.
"""

import geopandas as gpd
import pandas as pd
import numpy as np


def calculate_geology_stats(geology_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Calculate geological statistics for the provided GeoDataFrame.

    Returns a DataFrame with columns:
        Litologia, Código, Era, Período, Área_km2, Percentagem
    """
    if geology_gdf is None or len(geology_gdf) == 0:
        return pd.DataFrame()

    try:
        # Reproject to a metric CRS suitable for area calculation (UTM 36S covers most of Mozambique)
        gdf_proj = geology_gdf.to_crs("EPSG:32736")
        gdf_proj = gdf_proj.copy()
        gdf_proj["_area_m2"] = gdf_proj.geometry.area
    except Exception:
        gdf_proj = geology_gdf.copy()
        gdf_proj["_area_m2"] = 0.0

    # Determine grouping columns from available fields
    group_cols = {}
    for label, candidates in [
        ("Litologia", ["Legend", "LEGEND", "legend"]),
        ("Código", ["code2006", "CODE2006", "CODE"]),
        ("Era", ["ERA", "Era", "era"]),
        ("Período", ["PERIOD", "Period", "period"]),
    ]:
        for c in candidates:
            if c in gdf_proj.columns:
                group_cols[label] = c
                break

    if not group_cols:
        # No known columns — count by index
        stats = pd.DataFrame({
            "Unidade": [f"Unidade {i+1}" for i in range(len(gdf_proj))],
            "Área_km2": gdf_proj["_area_m2"].values / 1e6,
        })
        stats["Percentagem"] = (stats["Área_km2"] / stats["Área_km2"].sum() * 100).round(2)
        return stats.sort_values("Área_km2", ascending=False).reset_index(drop=True)

    # Primary grouping key
    primary_col = group_cols.get("Litologia") or list(group_cols.values())[0]

    # Group and aggregate
    grouped = gdf_proj.groupby(primary_col, dropna=False)["_area_m2"].sum().reset_index()
    grouped.columns = ["_primary", "area_m2"]
    grouped["Área_km2"] = (grouped["area_m2"] / 1e6).round(4)
    total = grouped["Área_km2"].sum()
    grouped["Percentagem"] = (grouped["Área_km2"] / total * 100).round(2) if total > 0 else 0.0

    # Add extra columns from first matching row for each primary value
    result_rows = []
    for _, row in grouped.iterrows():
        entry = {}
        entry["Litologia" if "Litologia" in group_cols else "Código"] = row["_primary"]
        mask = gdf_proj[primary_col] == row["_primary"]
        sample = gdf_proj[mask].iloc[0] if mask.any() else None
        for label, src_col in group_cols.items():
            if label not in entry:
                entry[label] = sample[src_col] if sample is not None else ""
        entry["Área_km2"] = row["Área_km2"]
        entry["Percentagem (%)"] = row["Percentagem"]
        result_rows.append(entry)

    df = pd.DataFrame(result_rows).sort_values("Área_km2", ascending=False).reset_index(drop=True)
    return df


def summarise_geology(geology_gdf: gpd.GeoDataFrame) -> dict:
    """Return a summary dict: total units, dominant lithology, total area."""
    if geology_gdf is None or len(geology_gdf) == 0:
        return {}

    summary = {
        "total_features": len(geology_gdf),
        "total_units": 0,
        "dominant_lithology": "N/A",
        "total_area_km2": 0.0,
    }

    stats = calculate_geology_stats(geology_gdf)
    if stats.empty:
        return summary

    summary["total_units"] = len(stats)
    summary["total_area_km2"] = round(stats["Área_km2"].sum(), 2)

    # Dominant lithology
    first_col = stats.columns[0]
    summary["dominant_lithology"] = str(stats.iloc[0][first_col])

    return summary
