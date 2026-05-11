"""
Mapping utilities for GeoMoz Explorer.
Builds Folium maps with layers, tooltips, and symbology.
"""

import folium
import geopandas as gpd
import json
import random
import hashlib


# ── colour palettes ────────────────────────────────────────────────────────────

GEOLOGY_PALETTE = [
    "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
    "#264653", "#A8DADC", "#F1FAEE", "#6D6875", "#B5838D",
    "#E76F51", "#52B788", "#3D405B", "#81B29A", "#F2CC8F",
    "#023047", "#8ECAE6", "#219EBC", "#FFB703", "#FB8500",
    "#606C38", "#DDA15E", "#BC6C25", "#283618", "#FEFAE0",
]


def _color_for_value(value, palette=GEOLOGY_PALETTE) -> str:
    """Deterministically assign a colour from the palette based on the value string."""
    if not value or str(value).strip() in ("", "nan", "None"):
        return "#AAAAAA"
    h = int(hashlib.md5(str(value).encode()).hexdigest(), 16)
    return palette[h % len(palette)]


# ── base map ───────────────────────────────────────────────────────────────────

def create_base_map(basemap: str = "CartoDB Positron") -> folium.Map:
    """Create a folium map centered on Mozambique."""
    tiles_map = {
        "CartoDB Positron": "CartoDB positron",
        "OpenStreetMap": "OpenStreetMap",
        "CartoDB Dark Matter": "CartoDB dark_matter",
        "Stamen Terrain": "Stamen Terrain",
    }
    tile = tiles_map.get(basemap, "CartoDB positron")
    m = folium.Map(
        location=[-18.0, 35.0],
        zoom_start=6,
        tiles=tile,
        control_scale=True,
    )
    return m


# ── layer helpers ──────────────────────────────────────────────────────────────

def _tooltip_fields_and_aliases(gdf: gpd.GeoDataFrame, layer_type: str):
    """Return (fields, aliases) for GeoJSON tooltip based on layer type."""
    if layer_type == "province":
        candidates = [("Provincia", "Província"), ("PROVINCIA", "Província"),
                      ("NAME_1", "Província"), ("name", "Nome")]
    elif layer_type == "district":
        candidates = [("Distrito", "Distrito"), ("DISTRITO", "Distrito"),
                      ("NAME_2", "Distrito"), ("name", "Nome"),
                      ("Provincia", "Província"), ("NAME_1", "Província")]
    elif layer_type == "admin_post":
        candidates = [("Posto", "Posto Administrativo"), ("POSTO", "Posto"),
                      ("NAME_3", "Posto"), ("name", "Nome"),
                      ("Distrito", "Distrito")]
    elif layer_type == "village":
        candidates = [("Localidade", "Localidade"), ("Aldeia", "Aldeia"),
                      ("name", "Nome"), ("NAME_4", "Aldeia"),
                      ("Posto", "Posto")]
    elif layer_type == "geology":
        candidates = [("Legend", "Litologia"), ("code2006", "Código"),
                      ("ERA", "Era"), ("PERIOD", "Período"),
                      ("FORMATION", "Formação"), ("name", "Nome")]
    else:
        candidates = [("name", "Nome")]

    fields, aliases = [], []
    for col, alias in candidates:
        if col in gdf.columns:
            fields.append(col)
            aliases.append(alias)
    return fields, aliases


def add_province_layer(m: folium.Map, gdf: gpd.GeoDataFrame, name: str = "Províncias"):
    """Add province layer with tooltip."""
    if gdf is None or len(gdf) == 0:
        return m
    fields, aliases = _tooltip_fields_and_aliases(gdf, "province")
    fg = folium.FeatureGroup(name=name, show=True)
    folium.GeoJson(
        gdf.__geo_interface__,
        style_function=lambda f: {
            "fillColor": "#2196F3",
            "color": "#0D47A1",
            "weight": 2,
            "fillOpacity": 0.12,
        },
        highlight_function=lambda f: {"fillOpacity": 0.35, "weight": 3},
        tooltip=folium.GeoJsonTooltip(
            fields=fields,
            aliases=aliases,
            localize=True,
            sticky=False,
        ) if fields else None,
    ).add_to(fg)
    fg.add_to(m)
    return m


def add_district_layer(m: folium.Map, gdf: gpd.GeoDataFrame, name: str = "Distritos"):
    """Add district layer with tooltip."""
    if gdf is None or len(gdf) == 0:
        return m
    fields, aliases = _tooltip_fields_and_aliases(gdf, "district")
    fg = folium.FeatureGroup(name=name, show=True)
    folium.GeoJson(
        gdf.__geo_interface__,
        style_function=lambda f: {
            "fillColor": "#4CAF50",
            "color": "#1B5E20",
            "weight": 1.5,
            "fillOpacity": 0.1,
        },
        highlight_function=lambda f: {"fillOpacity": 0.3, "weight": 2.5},
        tooltip=folium.GeoJsonTooltip(
            fields=fields,
            aliases=aliases,
            localize=True,
            sticky=False,
        ) if fields else None,
    ).add_to(fg)
    fg.add_to(m)
    return m


def add_admin_post_layer(m: folium.Map, gdf: gpd.GeoDataFrame, name: str = "Postos Administrativos"):
    """Add admin post layer with tooltip."""
    if gdf is None or len(gdf) == 0:
        return m
    fields, aliases = _tooltip_fields_and_aliases(gdf, "admin_post")
    fg = folium.FeatureGroup(name=name, show=True)
    folium.GeoJson(
        gdf.__geo_interface__,
        style_function=lambda f: {
            "fillColor": "#FF9800",
            "color": "#E65100",
            "weight": 1,
            "fillOpacity": 0.08,
        },
        highlight_function=lambda f: {"fillOpacity": 0.25, "weight": 2},
        tooltip=folium.GeoJsonTooltip(
            fields=fields,
            aliases=aliases,
            localize=True,
            sticky=False,
        ) if fields else None,
    ).add_to(fg)
    fg.add_to(m)
    return m


def add_village_layer(m: folium.Map, gdf: gpd.GeoDataFrame, name: str = "Aldeias"):
    """Add village layer. Points rendered as circle markers for performance."""
    if gdf is None or len(gdf) == 0:
        return m
    fields, aliases = _tooltip_fields_and_aliases(gdf, "village")
    fg = folium.FeatureGroup(name=name, show=True)

    # If geometry is points, use CircleMarker; otherwise GeoJson
    geom_types = gdf.geometry.geom_type.unique()
    if all(t == "Point" for t in geom_types):
        for _, row in gdf.iterrows():
            tooltip_html = "<br>".join(
                f"<b>{al}:</b> {row.get(f, '')}"
                for f, al in zip(fields, aliases)
                if f in gdf.columns
            )
            folium.CircleMarker(
                location=[row.geometry.y, row.geometry.x],
                radius=3,
                color="#9C27B0",
                fill=True,
                fill_color="#CE93D8",
                fill_opacity=0.7,
                tooltip=folium.Tooltip(tooltip_html) if tooltip_html else None,
            ).add_to(fg)
    else:
        folium.GeoJson(
            gdf.__geo_interface__,
            style_function=lambda f: {
                "fillColor": "#9C27B0",
                "color": "#4A148C",
                "weight": 1,
                "fillOpacity": 0.1,
            },
            tooltip=folium.GeoJsonTooltip(
                fields=fields,
                aliases=aliases,
            ) if fields else None,
        ).add_to(fg)

    fg.add_to(m)
    return m


def add_geology_layer(m: folium.Map, gdf: gpd.GeoDataFrame, color_by: str = "code2006",
                       name: str = "Geologia", show: bool = True):
    """Add geology layer coloured by a categorical field."""
    if gdf is None or len(gdf) == 0:
        return m

    fields, aliases = _tooltip_fields_and_aliases(gdf, "geology")
    color_col = color_by if color_by in gdf.columns else (fields[0] if fields else None)

    def style_fn(feature):
        val = feature["properties"].get(color_col, "") if color_col else ""
        return {
            "fillColor": _color_for_value(val),
            "color": "#333333",
            "weight": 0.5,
            "fillOpacity": 0.65,
        }

    fg = folium.FeatureGroup(name=name, show=show)
    folium.GeoJson(
        gdf.__geo_interface__,
        style_function=style_fn,
        highlight_function=lambda f: {"fillOpacity": 0.85, "weight": 1.5},
        tooltip=folium.GeoJsonTooltip(
            fields=fields,
            aliases=aliases,
            localize=True,
            sticky=False,
        ) if fields else None,
    ).add_to(fg)
    fg.add_to(m)
    return m


def add_selected_area_layer(m: folium.Map, gdf: gpd.GeoDataFrame, label: str = "Área selecionada"):
    """Highlight the selected province or district on the map."""
    if gdf is None or len(gdf) == 0:
        return m
    fg = folium.FeatureGroup(name=label, show=True)
    folium.GeoJson(
        gdf.__geo_interface__,
        style_function=lambda f: {
            "fillColor": "none",
            "color": "#FF1744",
            "weight": 3,
            "dashArray": "6 4",
            "fillOpacity": 0,
        },
    ).add_to(fg)
    # Zoom to the selected area
    try:
        bounds = gdf.total_bounds  # [minx, miny, maxx, maxy]
        m.fit_bounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]])
    except Exception:
        pass
    fg.add_to(m)
    return m


def build_geology_legend(gdf: gpd.GeoDataFrame, color_by: str = "code2006") -> str:
    """Return an HTML legend string for geology colours."""
    if gdf is None or color_by not in gdf.columns:
        return ""
    unique_vals = gdf[color_by].dropna().unique()
    rows = ""
    for val in sorted(unique_vals)[:30]:  # cap at 30 items
        color = _color_for_value(str(val))
        rows += (
            f'<div style="display:flex;align-items:center;margin-bottom:3px;">'
            f'<div style="width:14px;height:14px;background:{color};'
            f'border:1px solid #555;margin-right:6px;flex-shrink:0;"></div>'
            f'<span style="font-size:11px;">{val}</span></div>'
        )
    legend_html = (
        '<div style="background:white;padding:10px;border-radius:6px;'
        'border:1px solid #ccc;max-height:300px;overflow-y:auto;">'
        f'<b style="font-size:12px;">Geologia — {color_by}</b><br><br>'
        f'{rows}</div>'
    )
    return legend_html
