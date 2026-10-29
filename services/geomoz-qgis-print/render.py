"""Render validated GeoMoz GeoJSON layouts as real vector PDFs through PyQGIS.

This file only executes in a QGIS Python environment (Docker/host). QGIS
is initialised in a short-lived subprocess for every job, isolating crashes,
font state, providers and project resources between users.
"""
from __future__ import annotations
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from job import parse_request

def render(job: dict, output: str) -> None:
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    from qgis.core import (
        QgsApplication, QgsFillSymbol, QgsLineSymbol, QgsMarkerSymbol,
        QgsPrintLayout, QgsLayoutExporter, QgsLayoutItemLabel, QgsLayoutItemMap,
        QgsLayoutItemScaleBar, QgsLayoutPoint, QgsLayoutSize, QgsProject,
        QgsRectangle, QgsVectorLayer, QgsCoordinateReferenceSystem, Qgis,
    )
    from qgis.PyQt.QtCore import Qt
    from qgis.PyQt.QtGui import QFont, QColor

    app = QgsApplication([], False)
    app.initQgis()
    try:
        project = QgsProject.instance()
        project.clear()
        project.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
        with tempfile.TemporaryDirectory(prefix="geomoz-qgis-layers-") as directory:
            for index, item in enumerate(job["layers"]):
                src = Path(directory) / f"layer-{index}.geojson"
                src.write_text(json.dumps(item["geojson"], ensure_ascii=False), encoding="utf-8")
                layer = QgsVectorLayer(str(src), item["name"], "ogr")
                if not layer.isValid():
                    raise RuntimeError(f"Camada inválida: {item['name']}")
                colour = item["color"]
                geom = layer.geometryType()
                if geom == 0:
                    layer.renderer().setSymbol(QgsMarkerSymbol.createSimple({
                        "name": "circle", "color": colour, "outline_color": "#0f172a", "size": "2",
                    }))
                elif geom == 1:
                    layer.renderer().setSymbol(QgsLineSymbol.createSimple({
                        "line_color": colour, "line_width": "0.5",
                    }))
                elif geom == 2:
                    layer.renderer().setSymbol(QgsFillSymbol.createSimple({
                        "color": colour, "outline_color": "#334155", "outline_width": "0.18",
                    }))
                project.addMapLayer(layer)

            layout = QgsPrintLayout(project)
            layout.initializeDefaults()
            layout.setName("GeoMoz — Layout vectorial")
            page = layout.pageCollection().pages()[0]
            page.setPageSize(job["paper"], 1 if job["orientation"] == "landscape" else 0)
            width, height = ((297, 210) if job["paper"] == "A4" else (420, 297))
            if job["orientation"] == "portrait":
                width, height = height, width
            margin = 12.0

            def label(text: str, x: float, y: float, w: float, h: float,
                      pts: int = 9, colour: str = "#0f172a", bold: bool = False):
                item = QgsLayoutItemLabel(layout)
                item.setText(text)
                font = QFont("DejaVu Sans", pts)
                font.setBold(bold)
                item.setFont(font)
                item.setFontColor(QColor(colour))
                layout.addLayoutItem(item)
                item.attemptMove(QgsLayoutPoint(x, y))
                item.attemptResize(QgsLayoutSize(w, h))
                return item

            label(job["title"], margin, margin-1, width-2*margin, 11,
                  16 if job["paper"] == "A3" else 13, "#082f49", True)
            if job["subtitle"]:
                label(job["subtitle"], margin, margin+10, width-2*margin, 8, 9, "#475569")
            header_end = margin + (24 if job["subtitle"] else 17)
            footer_y = height - 16
            legend_width = min(48.0, width * 0.22)
            map_width = width - 2*margin - legend_width - 5
            map_height = footer_y - header_end - 7

            map_item = QgsLayoutItemMap(layout)
            layout.addLayoutItem(map_item)
            map_item.attemptMove(QgsLayoutPoint(margin, header_end))
            map_item.attemptResize(QgsLayoutSize(map_width, map_height))
            map_item.setCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
            map_item.setLayers(list(reversed(project.mapLayers().values())))
            map_item.setKeepLayerSet(True)
            bbox = job["bbox"]
            map_item.zoomToExtent(QgsRectangle(*bbox))
            map_item.setFrameEnabled(True)
            map_item.setFrameStrokeColor(QColor("#94a3b8"))
            map_item.refresh()

            lx = margin + map_width + 5
            label("LEGENDA", lx, header_end, legend_width, 9, 9, "#082f49", True)
            for index, item in enumerate(job["layers"][:12]):
                yy = header_end + 10 + index*10
                label("■", lx, yy, 7, 8, 11, item["color"], True)
                label(item["name"][:40], lx+7, yy, legend_width-7, 9, 7, "#1e293b")

            label("N", lx+8, footer_y-32, 14, 8, 10, "#082f49", True)
            label("▲", lx+7, footer_y-25, 14, 11, 17, "#082f49", True)
            try:
                scale_bar = QgsLayoutItemScaleBar(layout)
                scale_bar.setStyle("Single Box")
                scale_bar.setLinkedMap(map_item)
                scale_bar.setNumberOfSegments(2)
                scale_bar.setNumberOfSegmentsLeft(0)
                scale_bar.setUnitsPerSegment(0)
                scale_bar.applyDefaultSize()
                layout.addLayoutItem(scale_bar)
                scale_bar.attemptMove(QgsLayoutPoint(margin+4, footer_y-13))
            except Exception:
                # A valid geographic map remains useful even if a scale bar
                # fails on a particular QGIS version. Never invent a scale.
                pass

            label(datetime.now(timezone.utc).strftime("%Y-%m-%d") +
                  " · " + job["attribution"], margin, height-9,
                  width - 2*margin, 6, 7, "#64748b")
            label(job["author"], width-64, height-9, 52, 6, 7, "#475569")

            exporter = QgsLayoutExporter(layout)
            settings = QgsLayoutExporter.PdfExportSettings()
            settings.dpi = job["dpi"]
            settings.forceVectorOutput = True
            # QGIS defaults to text outlines; keep labels/searchable text as
            # actual font objects while preserving vector geometries.
            settings.textRenderFormat = Qgis.TextRenderFormat.AlwaysText
            result = exporter.exportToPdf(str(output), settings)
            if result != QgsLayoutExporter.Success:
                raise RuntimeError(f"Erro QGIS ao exportar PDF (código {result}).")
            if not Path(output).is_file() or Path(output).stat().st_size < 100:
                raise RuntimeError("O QGIS não produziu um PDF válido.")
    finally:
        QgsProject.instance().clear()
        app.exitQgis()

def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: render.py input.json output.pdf", file=sys.stderr)
        return 2
    try:
        job = parse_request(Path(sys.argv[1]).read_bytes())
        render(job, sys.argv[2])
    except Exception as exc:
        print(f"GeoMoz QGIS print error: {exc}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
