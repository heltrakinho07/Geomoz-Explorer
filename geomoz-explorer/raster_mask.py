"""Validated RFC 7946 polygon cutlines for authenticated GeoMoz GDAL jobs.

This module never trusts a filesystem path supplied by the caller. The
cutline is an uploaded GeoJSON FeatureCollection, normalised to lon/lat and
written as a private temporary file in the job directory.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

MAX_CUTLINE_BYTES = 8 * 1024 * 1024
MAX_CUTLINE_FEATURES = 10000
MAX_CUTLINE_VERTICES = 100000
_EPSG = re.compile(r"EPSG:[1-9][0-9]{2,5}\Z", re.ASCII)


def normalise_cutline(raw: str | None) -> str:
    if not isinstance(raw, str) or not raw:
        raise ValueError("Seleccione uma camada poligonal GeoJSON como máscara.")
    if len(raw.encode("utf-8")) > MAX_CUTLINE_BYTES:
        raise ValueError("A máscara excede o limite de 8 MB.")
    try:
        collection = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValueError("A máscara deve conter GeoJSON válido.") from exc
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise ValueError("A máscara deve ser um GeoJSON FeatureCollection.")
    features = collection.get("features")
    if not isinstance(features, list) or not 0 < len(features) <= MAX_CUTLINE_FEATURES:
        raise ValueError("A máscara deve conter entre 1 e 10000 feições.")
    count = 0

    def coordinate(vertex: Any) -> list[float]:
        nonlocal count
        if not isinstance(vertex, (list, tuple)) or len(vertex) < 2:
            raise ValueError("Coordenadas inválidas na máscara.")
        if any(isinstance(v, bool) or not isinstance(v, (int, float))
               for v in vertex[:2]):
            raise ValueError("Coordenadas inválidas na máscara.")
        lon, lat = float(vertex[0]), float(vertex[1])
        if not all(math.isfinite(v) for v in (lon, lat)) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("A máscara GeoJSON deve estar em WGS84 (longitude, latitude).")
        count += 1
        if count > MAX_CUTLINE_VERTICES:
            raise ValueError("A máscara excede o limite de 100000 vértices.")
        return [lon, lat]

    def ring(values: Any) -> list[list[float]]:
        if not isinstance(values, list) or len(values) < 4:
            raise ValueError("Os anéis dos polígonos devem ter pelo menos 4 vértices.")
        result = [coordinate(v) for v in values]
        if result[0] != result[-1]:
            raise ValueError("A máscara contém um anel não fechado.")
        return result

    clean = []
    for feat in features:
        if not isinstance(feat, dict) or feat.get("type") != "Feature":
            raise ValueError("A máscara deve conter feições GeoJSON.")
        geom = feat.get("geometry")
        if not isinstance(geom, dict):
            raise ValueError("A máscara deve conter geometrias poligonais.")
        kind = geom.get("type")
        coords = geom.get("coordinates")
        if kind == "Polygon":
            if not isinstance(coords, list) or not coords:
                raise ValueError("Polígono vazio na máscara.")
            cleaned_coords = [ring(r) for r in coords]
        elif kind == "MultiPolygon":
            if not isinstance(coords, list) or not coords:
                raise ValueError("Multipolígono vazio na máscara.")
            cleaned_coords = []
            for polygon in coords:
                if not isinstance(polygon, list) or not polygon:
                    raise ValueError("Polígono vazio na máscara.")
                cleaned_coords.append([ring(r) for r in polygon])
        else:
            raise ValueError("A máscara deve conter apenas Polygon/MultiPolygon.")
        clean.append({"type": "Feature", "properties": {}, "geometry": {
            "type": kind, "coordinates": cleaned_coords,
        }})
    result = json.dumps({"type": "FeatureCollection", "features": clean}, separators=(",", ":"))
    if len(result.encode("utf-8")) > MAX_CUTLINE_BYTES:
        raise ValueError("A máscara excede o limite de 8 MB.")
    return result


def cutline_warp_args(input_path: Path, output_path: Path, mask_path: Path,
                      params: dict[str, Any]) -> list[str]:
    if mask_path.parent != input_path.parent or mask_path.name != "mask.geojson":
        raise ValueError("Caminho de máscara não autorizado.")
    args = ["gdalwarp", "-overwrite", "-of", "GTiff", "-co", "COMPRESS=DEFLATE",
            "-cutline", str(mask_path)]
    dst_crs = params.get("dst_crs")
    if dst_crs not in (None, ""):
        if not isinstance(dst_crs, str) or not _EPSG.fullmatch(dst_crs.strip().upper()):
            raise ValueError("SRC de destino inválido (esperado EPSG:32736, por exemplo).")
        args += ["-t_srs", dst_crs.strip().upper()]
    resampling = params.get("resampling", "nearest")
    if resampling not in {"nearest", "bilinear", "cubic"}:
        raise ValueError("Método de reamostragem inválido.")
    args += ["-r", "near" if resampling == "nearest" else resampling]
    for key, option in (("crop", "-crop_to_cutline"), ("alpha", "-dstalpha")):
        val = params.get(key, True)
        if not isinstance(val, bool):
            raise ValueError(key + " deve ser booleano.")
        if val:
            args.append(option)
    touched = params.get("all_touched", False)
    if not isinstance(touched, bool):
        raise ValueError("all_touched deve ser booleano.")
    if touched:
        args += ["-wo", "CUTLINE_ALL_TOUCHED=TRUE"]
    x, y = params.get("x_resolution"), params.get("y_resolution")
    if x is not None or y is not None:
        try:
            rx, ry = float(x), float(y)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("Resolução X/Y inválida.") from exc
        if not all(math.isfinite(v) and v > 0 for v in (rx, ry)):
            raise ValueError("Resolução X/Y deve ser positiva e finita.")
        args += ["-tr", str(rx), str(ry)]
    nodata = params.get("nodata")
    if nodata is not None:
        try:
            value = float(nodata)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("NoData inválido.") from exc
        if not math.isfinite(value):
            raise ValueError("NoData deve ser finito.")
        args += ["-dstnodata", str(value)]
    args += [str(input_path), str(output_path)]
    return args
