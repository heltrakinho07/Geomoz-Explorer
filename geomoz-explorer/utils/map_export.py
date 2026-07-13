"""
map_export.py — Generate publication-quality static map images using Cartopy.

Provides a single public function ``render_map()`` that returns a PNG image
ready for embedding in PDF exports, complete with:
  - Basemap tiles (CartoDB via contextily)
  - GEE raster tile overlay (optional)
  - GeoJSON vector overlay (optional)
  - Coordinate grid with labelled lat/lon graticule
  - Scale bar (matplotlib-scalebar)
  - North arrow
  - Bounding box annotation
"""

from __future__ import annotations

import io
import logging
import math
from typing import Any, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from cartopy.mpl.gridliner import LongitudeFormatter, LatitudeFormatter
import contextily as ctx
from matplotlib_scalebar.scalebar import ScaleBar
import numpy as np
from shapely.geometry import shape

logger = logging.getLogger(__name__)


# ── Public API ─────────────────────────────────────────────────────────────────


def render_map(
    *,
    south: float,
    north: float,
    west: float,
    east: float,
    width_px: int = 1600,
    height_px: int = 900,
    dpi: int = 200,
    raster_tile_url: Optional[str] = None,
    overlay_geojson: Optional[dict] = None,
    overlay_style: Optional[dict[str, Any]] = None,
    legend_items: Optional[list[dict[str, str]]] = None,
    title: Optional[str] = None,
) -> bytes:
    """Render a static map image with cartographic elements.

    Parameters
    ----------
    south, north, west, east : float
        Geographic bounding box in decimal degrees (WGS84).
    width_px, height_px : int
        Output image size in pixels.
    dpi : int
        Output resolution (default 200 — good for print).
    raster_tile_url : str, optional
        XYZ tile URL template (e.g. a GEE ``tile_fetcher.url_format``)
        to overlay as a semi-transparent raster.
    overlay_geojson : dict, optional
        A GeoJSON ``FeatureCollection`` (or single Feature) to draw on
        the map as vector polygons/lines.
    overlay_style : dict, optional
        Styling for the vector overlay:
          ``{"color": "#1a73e8", "fillColor": "#1a73e833", "weight": 2}``
    legend_items : list[dict], optional
        Legend entries ``[{"label": "Classe A", "color": "#ff0000"}, ...]``.
        Drawn as a colour-swatch panel in the lower-left corner.
    title : str, optional
        Optional title drawn at the top of the map.

    Returns
    -------
    bytes
        PNG image data.
    """
    if abs(north - south) < 1e-8 or abs(east - west) < 1e-8:
        raise ValueError("Bounds must define a non-zero area.")

    fig, ax = _create_map_figure(
        south, north, west, east, width_px, height_px, dpi,
    )

    extents = [west, east, south, north]

    # 1. Basemap (CartoDB Voyager)
    _add_basemap(ax, extents)

    # 2. GEE / raster tile overlay
    if raster_tile_url:
        _add_raster_tile(ax, extents, raster_tile_url, zoom=10)

    # 3. Vector overlay
    if overlay_geojson:
        _add_vector_overlay(ax, overlay_geojson, overlay_style or {})

    # 4. Coordinate grid
    _add_gridlines(ax, extents)

    # 5. Scale bar
    _add_scale_bar(ax, extents)

    # 6. North arrow
    _add_north_arrow(ax)

    # 7. Legend (classification / colour swatches)
    if legend_items:
        _add_legend(ax, legend_items)

    # 8. Title
    if title:
        ax.set_title(title, fontsize=14, fontweight="bold", pad=8,
                      color="#334155")

    fig.tight_layout(pad=0.3)
    return _fig_to_png(fig, dpi)


# ── Internal helpers ────────────────────────────────────────────────────────────


def _create_map_figure(
    south: float,
    north: float,
    west: float,
    east: float,
    width_px: int,
    height_px: int,
    dpi: int,
):
    """Create a matplotlib figure + Cartopy axis in PlateCarree projection."""
    figsize_in = (width_px / dpi, height_px / dpi)
    fig = plt.figure(figsize=figsize_in, dpi=dpi)
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.PlateCarree())
    ax.set_extent([west, east, south, north], crs=ccrs.PlateCarree())

    # Coastline & borders for geographic context
    ax.add_feature(cfeature.COASTLINE, linewidth=0.6, edgecolor="#64748b")
    ax.add_feature(cfeature.BORDERS, linewidth=0.4, edgecolor="#94a3b8",
                   alpha=0.6)
    ax.add_feature(cfeature.OCEAN, facecolor="#f0f9ff", alpha=0.3)
    ax.add_feature(cfeature.LAKES, facecolor="#e0f2fe", edgecolor="#bae6fd",
                   linewidth=0.3, alpha=0.5)
    ax.add_feature(cfeature.RIVERS, edgecolor="#7dd3fc", linewidth=0.3,
                   alpha=0.5)

    return fig, ax


def _add_basemap(ax, extents):
    """Add CartoDB Voyager basemap tiles via contextily."""
    west, east, south, north = extents
    try:
        ctx.add_basemap(
            ax,
            source=ctx.providers.CartoDB.Voyager(scale="4000"),
            crs=ccrs.PlateCarree(),
            zoom="auto",
            attribution=False,
        )
    except Exception as exc:
        logger.warning("Basemap fetch failed (continuing without): %s", exc)


def _add_raster_tile(ax, extents, tile_url: str, zoom: int = 10):
    """Overlay a GEE or XYZ raster tile layer as a semi-transparent image.

    We fetch a static image snapshot rather than individual tiles so we
    don't need zoom-level calculation logic here.  If the tile_url looks
    like an XYZ template (contains ``{z}``, ``{x}``, ``{y}``), we pass it
    directly to contextily; otherwise we skip.
    """
    west, east, south, north = extents
    if "{z}" in tile_url and "{x}" in tile_url and "{y}" in tile_url:
        try:
            ctx.add_basemap(
                ax,
                source=tile_url,
                crs=ccrs.PlateCarree(),
                zoom=zoom,
                attribution=False,
                alpha=0.70,
            )
        except Exception as exc:
            logger.warning("Raster tile overlay failed: %s", exc)


def _add_vector_overlay(
    ax,
    geojson: dict,
    style: dict[str, Any],
):
    """Draw a GeoJSON FeatureCollection onto the Cartopy axis."""
    features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]

    color = style.get("color", "#1a73e8")
    fill_color = style.get("fillColor", "#1a73e833")
    weight = style.get("weight", 2)
    alpha = style.get("alpha", 0.5)

    # Parse fill colour (hex with optional alpha)
    face = fill_color if fill_color.startswith("#") and len(fill_color) == 9 \
           else fill_color + "33" if fill_color.startswith("#") and len(fill_color) == 7 \
           else fill_color

    for feat in features:
        geom = feat.get("geometry")
        if not geom:
            continue
        try:
            shp = shape(geom)
        except Exception as exc:
            logger.warning("Skipping invalid geometry: %s", exc)
            continue

        if shp.geom_type in ("Polygon", "MultiPolygon"):
            _draw_polygon(ax, shp, face, color, weight, alpha)
        elif shp.geom_type in ("LineString", "MultiLineString"):
            _draw_line(ax, shp, color, weight)
        elif shp.geom_type == "Point":
            _draw_point(ax, shp, color)

    # Legend-style label for the overlay
    ax.plot([], [], color=color, linewidth=weight, alpha=alpha,
            label=style.get("label", ""))


def _draw_polygon(ax, shp, face, edge, weight, alpha):
    """Draw a Shapely polygon on the map."""
    import cartopy.io.shapereader as shpreader
    try:
        ax.add_geometries(
            [shp],
            crs=ccrs.PlateCarree(),
            facecolor=face,
            edgecolor=edge,
            linewidth=weight,
            alpha=alpha,
        )
    except Exception as exc:
        logger.warning("Failed to draw polygon: %s", exc)


def _draw_line(ax, shp, color, weight):
    """Draw a Shapely linestring on the map."""
    if shp.geom_type == "MultiLineString":
        for line in shp.geoms:
            _draw_line(ax, line, color, weight)
        return
    coords = list(shp.coords)
    xs, ys = zip(*coords)
    ax.plot(xs, ys, color=color, linewidth=weight, transform=ccrs.PlateCarree())


def _draw_point(ax, shp, color):
    """Draw a Shapely point on the map."""
    ax.plot(
        shp.x, shp.y,
        marker="o", color=color, markersize=6,
        transform=ccrs.PlateCarree(),
    )


def _add_gridlines(ax, extents):
    """Add lat/lon grid lines with labels."""
    west, east, south, north = extents

    # Determine a nice grid spacing
    lon_span = east - west
    lat_span = north - south
    avg_span = (lon_span + lat_span) / 2

    if avg_span > 20:
        step = 5
    elif avg_span > 8:
        step = 2
    elif avg_span > 3:
        step = 1
    elif avg_span > 1:
        step = 0.5
    else:
        step = 0.1

    gl = ax.gridlines(
        crs=ccrs.PlateCarree(),
        draw_labels=True,
        linewidth=0.4,
        color="#cbd5e1",
        alpha=0.7,
        linestyle="--",
        x_inline=False,
        y_inline=False,
    )

    gl.xlocator = matplotlib.ticker.MultipleLocator(base=step)
    gl.ylocator = matplotlib.ticker.MultipleLocator(base=step)
    gl.xformatter = LongitudeFormatter()
    gl.yformatter = LatitudeFormatter()
    gl.xlabel_style = {"size": 8, "color": "#64748b"}
    gl.ylabel_style = {"size": 8, "color": "#64748b"}

    # Show only left and bottom labels
    gl.top_labels = False
    gl.right_labels = False
    gl.bottom_labels = True
    gl.left_labels = True


def _add_scale_bar(ax, extents):
    """Add a scale bar using matplotlib-scalebar.

    Calculates the correct pixel-to-meter conversion factor (dx) from
    the Cartopy map extent so the bar shows accurate real-world lengths.
    """
    west, east, south, north = extents
    mid_lat = (south + north) / 2.0

    # Approximate map width in metres at mid-latitude
    R = 6_371_000.0
    lon_span_rad = np.radians(east - west) * math.cos(math.radians(mid_lat))
    map_width_m = R * lon_span_rad

    # Pixel width of the axes
    fig = ax.get_figure()
    bbox = ax.get_window_extent().transformed(fig.dpi_scale_trans.inverted())
    pixel_width = bbox.width * fig.dpi

    # dx = metres per pixel
    dx = map_width_m / pixel_width if pixel_width > 0 else 100.0

    # Pick a nice round bar length based on map extent
    if map_width_m > 200_000:
        fixed_value = 100_000  # 100 km
    elif map_width_m > 100_000:
        fixed_value = 50_000   # 50 km
    elif map_width_m > 40_000:
        fixed_value = 20_000   # 20 km
    elif map_width_m > 20_000:
        fixed_value = 10_000   # 10 km
    elif map_width_m > 8_000:
        fixed_value = 5_000    # 5 km
    elif map_width_m > 3_000:
        fixed_value = 2_000    # 2 km
    elif map_width_m > 1_000:
        fixed_value = 1_000    # 1 km
    else:
        fixed_value = 500      # 500 m

    fixed_units = "km" if fixed_value >= 1000 else "m"
    display_value = fixed_value / 1000 if fixed_units == "km" else fixed_value
    try:
        sb = ScaleBar(
            dx,                              # metres per pixel
            units="m",
            dimension="si-length",
            fixed_value=display_value,       # bar length in display units
            fixed_units=fixed_units,
            location="lower right",
            pad=0.5,
            border_pad=0.5,
            sep=3,
            frameon=True,
            color="#334155",
            box_color="#ffffff",
            box_alpha=0.8,
        )
        ax.add_artist(sb)
    except Exception as exc:
        logger.warning("Scale bar failed: %s", exc)


def _add_north_arrow(ax):
    """Draw a simple north arrow in the top-right corner."""
    x, y = 0.92, 0.88
    size = 0.04

    # White circle background
    circle = plt.Circle(
        (x, y), size * 1.5,
        transform=ax.transAxes,
        facecolor="white",
        edgecolor="#cbd5e1",
        linewidth=0.5,
        zorder=10,
    )
    ax.add_patch(circle)

    # North triangle (blue)
    tri_n = MplPolygon(
        [
            (x, y + size * 1.1),
            (x - size * 0.5, y - size * 0.1),
            (x + size * 0.5, y - size * 0.1),
        ],
        transform=ax.transAxes,
        facecolor="#0ea5e9",
        edgecolor="none",
        zorder=11,
    )
    ax.add_patch(tri_n)

    # South triangle (grey)
    tri_s = MplPolygon(
        [
            (x, y - size * 0.9),
            (x - size * 0.5, y + size * 0.1),
            (x + size * 0.5, y + size * 0.1),
        ],
        transform=ax.transAxes,
        facecolor="#94a3b8",
        edgecolor="none",
        zorder=11,
    )
    ax.add_patch(tri_s)

    # "N" label
    ax.text(
        x, y + size * 0.2, "N",
        transform=ax.transAxes,
        fontsize=7,
        fontweight="bold",
        color="white",
        ha="center",
        va="center",
        zorder=12,
    )


def _add_legend(ax, items: list[dict[str, str]]):
    """Draw a colour-swatch legend panel in the lower-left corner.

    ``items``: ``[{"label": "Floresta", "color": "#00cc66"}, ...]``
    Max 15 items — longer lists are truncated with a "…" entry.
    """
    MAX_ITEMS = 15
    display = items[:MAX_ITEMS]
    truncated = len(items) > MAX_ITEMS

    n = len(display) + (1 if truncated else 0)
    # Estimated height per row in axes-fraction units
    row_h = 0.028
    swatch_w = 0.022
    gap = 0.006
    pad = 0.015
    legend_h = pad * 2 + n * row_h
    legend_w = 0.24

    # Background box (axes fraction, so anchored at (0,0) = lower-left)
    bg = MplPolygon(
        [
            (pad, pad),
            (pad + legend_w, pad),
            (pad + legend_w, pad + legend_h),
            (pad, pad + legend_h),
        ],
        transform=ax.transAxes,
        facecolor="white",
        edgecolor="#cbd5e1",
        linewidth=0.6,
        alpha=0.88,
        zorder=9,
    )
    ax.add_patch(bg)

    for i, item in enumerate(display):
        y_pos = pad + legend_h - (i + 1) * row_h + row_h * 0.3
        # Colour swatch
        try:
            color = item.get("color", "#94a3b8")
            sw = MplPolygon(
                [
                    (pad + gap, y_pos),
                    (pad + gap + swatch_w, y_pos),
                    (pad + gap + swatch_w, y_pos + row_h * 0.6),
                    (pad + gap, y_pos + row_h * 0.6),
                ],
                transform=ax.transAxes,
                facecolor=color,
                edgecolor="none",
                zorder=10,
            )
            ax.add_patch(sw)
        except Exception:
            pass

        # Label
        label = item.get("label", "")[:35]
        ax.text(
            pad + gap + swatch_w + 0.004,
            y_pos + row_h * 0.3,
            label,
            transform=ax.transAxes,
            fontsize=5.5,
            color="#334155",
            ha="left",
            va="bottom",
            zorder=10,
        )

    if truncated:
        ax.text(
            pad + gap,
            pad + 0.002,
            f"… e mais {len(items) - MAX_ITEMS} classes",
            transform=ax.transAxes,
            fontsize=5,
            fontstyle="italic",
            color="#94a3b8",
            ha="left",
            va="bottom",
            zorder=10,
        )


def _fig_to_png(fig, dpi: int) -> bytes:
    """Render the figure to PNG bytes and close."""
    buf = io.BytesIO()
    try:
        fig.savefig(
            buf,
            format="png",
            dpi=dpi,
            bbox_inches="tight",
            facecolor="white",
            edgecolor="none",
            pad_inches=0.1,
        )
        return buf.getvalue()
    finally:
        plt.close(fig)


def render_map_from_gee_result(
    bounds: dict[str, float],
    tile_url: Optional[str] = None,
    overlay_geojson: Optional[dict] = None,
    overlay_label: Optional[str] = None,
    legend_items: Optional[list[dict[str, str]]] = None,
    width_mm: float = 182.0,
    height_mm: float = 100.0,
    dpi: int = 200,
    title: Optional[str] = None,
) -> bytes:
    """Convenience wrapper around ``render_map`` that accepts dimensions in mm.

    Parameters
    ----------
    bounds : dict
        ``{"south": …, "north": …, "west": …, "east": …}``
    tile_url : str, optional
    overlay_geojson : dict, optional
    overlay_label : str, optional
        Legend label for the vector overlay.
    legend_items : list[dict], optional
        ``[{"label": "Classe A", "color": "#ff0000"}, ...]``
    width_mm, height_mm : float
        Desired map dimensions in millimetres (default: A4 content width × 100).
    dpi : int
    title : str, optional

    Returns
    -------
    bytes
        PNG image data.
    """
    px_per_mm = dpi / 25.4
    width_px = max(200, int(width_mm * px_per_mm))
    height_px = max(200, int(height_mm * px_per_mm))

    return render_map(
        south=bounds["south"],
        north=bounds["north"],
        west=bounds["west"],
        east=bounds["east"],
        width_px=width_px,
        height_px=height_px,
        dpi=dpi,
        raster_tile_url=tile_url,
        overlay_geojson=overlay_geojson,
        overlay_style={
            "color": "#0d47a1",
            "fillColor": "#1565c033",
            "weight": 2,
            "label": overlay_label or "Análise",
        },
        legend_items=legend_items,
        title=title,
    )
