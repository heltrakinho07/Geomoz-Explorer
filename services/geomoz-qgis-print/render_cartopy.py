"""Cartopy headless PDF renderer, using validated local WGS84 GeoJSON only."""
from __future__ import annotations
import math
import os
import sys
from pathlib import Path

def _projection(map_crs):
    import cartopy.crs as ccrs
    if map_crs == "EPSG:4326":
        return ccrs.PlateCarree()
    code = int(map_crs.split(":")[1])
    return ccrs.UTM(code % 100, southern_hemisphere=code // 100 == 327)

def _ticks(minimum, maximum, requested):
    """Keep geographic grid density bounded for regional/global maps."""
    step = max(requested, (maximum - minimum) / 12)
    start = math.ceil(minimum / step) * step
    count = min(15, max(0, math.ceil((maximum - start) / step) + 1))
    return [start + i * step for i in range(count) if start + i * step <= maximum + 1e-8]

def render(job, output):
    os.environ.setdefault("MPLBACKEND", "Agg")
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/geomoz-matplotlib")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch
    from matplotlib.ticker import FixedLocator
    import cartopy.crs as ccrs
    from shapely.geometry import shape

    page_width, page_height = (297, 210) if job["paper"] == "A4" else (420, 297)
    if job["orientation"] == "portrait":
        page_width, page_height = page_height, page_width
    fig = plt.figure(figsize=(page_width / 25.4, page_height / 25.4), facecolor="white")
    try:
        fig.text(0.065, 0.935, job["title"], fontsize=16, color="#082f49",
                 weight="bold", va="top")
        if job["subtitle"]:
            fig.text(0.065, 0.89, job["subtitle"], fontsize=9, color="#475569")
        ax = fig.add_axes([0.09, 0.16, 0.70, 0.66],
                          projection=_projection(job["map_crs"]))
        geographic = ccrs.PlateCarree()
        ax.set_extent(job["bbox"], crs=geographic)
        legend = []
        for layer in job["layers"]:
            color = layer["color"]
            point_x, point_y, lines, polygons = [], [], [], []
            for feature in layer["geojson"]["features"]:
                if not feature["geometry"]:
                    continue
                geometry = shape(feature["geometry"])
                if geometry.is_empty:
                    continue
                stack = list(geometry.geoms) if hasattr(geometry, "geoms") else [geometry]
                while stack:
                    part = stack.pop()
                    if hasattr(part, "geoms"):
                        stack.extend(part.geoms)
                    elif part.geom_type == "Point":
                        point_x.append(part.x)
                        point_y.append(part.y)
                    elif part.geom_type in ("LineString", "LinearRing"):
                        lines.append(part)
                    elif part.geom_type == "Polygon":
                        polygons.append(part)
            if polygons:
                ax.add_geometries(polygons, geographic, facecolor=color,
                                  edgecolor="#334155", linewidth=0.45)
                legend.append(Patch(facecolor=color, edgecolor="#334155", label=layer["name"]))
            if lines:
                ax.add_geometries(lines, geographic, facecolor="none",
                                  edgecolor=color, linewidth=1.1)
                if not polygons:
                    legend.append(Line2D([], [], color=color, label=layer["name"]))
            if point_x:
                ax.scatter(point_x, point_y, transform=geographic, color=color,
                           s=18, marker="o", edgecolor="#334155", linewidth=0.4)
                if not polygons and not lines:
                    legend.append(Line2D([], [], linestyle="", marker="o", color=color,
                                         label=layer["name"]))
        if job["grid"]["type"] == "geographic":
            west, south, east, north = job["bbox"]
            step = job["grid"]["interval_degrees"]
            gl = ax.gridlines(crs=geographic, draw_labels=True, linewidth=0.45,
                              color="#64748b", alpha=0.55, linestyle="--",
                              xlocs=FixedLocator(_ticks(west, east, step)),
                              ylocs=FixedLocator(_ticks(south, north, step)))
            gl.top_labels = False
            gl.right_labels = False
            gl.xlabel_style = {"size": 7}
            gl.ylabel_style = {"size": 7}
        ax.spines["geo"].set_edgecolor("#64748b")
        if legend:
            fig.legend(handles=legend, loc="upper left",
                       bbox_to_anchor=(0.81, 0.78), frameon=False,
                       title="Legenda", fontsize=8, title_fontsize=9)
        fig.text(0.065, 0.065, job["attribution"], fontsize=7, color="#475569")
        fig.text(0.93, 0.065, job["author"], ha="right", fontsize=7, color="#475569")
        fig.text(0.065, 0.105, "CRS: " + job["map_crs"], fontsize=7, color="#475569")
        fig.savefig(output, format="pdf", dpi=job["dpi"],
                    metadata={"Title": job["title"], "Author": job["author"]})
    finally:
        plt.close(fig)
    if not Path(output).is_file() or Path(output).stat().st_size < 100:
        raise RuntimeError("O Cartopy não produziu um PDF válido.")

def main():
    if len(sys.argv) != 3:
        print("Usage: render_cartopy.py input.json output.pdf", file=sys.stderr)
        return 2
    from job import parse_request
    try:
        job = parse_request(Path(sys.argv[1]).read_bytes())
        if job["engine"] != "cartopy":
            raise ValueError("Motor Cartopy não seleccionado.")
        render(job, sys.argv[2])
    except Exception as exc:
        print("GeoMoz Cartopy print error:", str(exc), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
