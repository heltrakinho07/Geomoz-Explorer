"""GeoMoz cartographic print-job schema, with no runtime QGIS dependency.

Input is deliberately local GeoJSON only: no remote URLs, QGIS expressions,
QML snippets, paths, scripts or provider strings supplied by the user.
"""
from __future__ import annotations
import json
import math
import re
from typing import Any

MAX_REQUEST_BYTES = 4 * 1024 * 1024
MAX_LAYERS = 12
MAX_FEATURES = 5000
MAX_POSITIONS = 100_000
_ALLOWED_PAPER = {"A4", "A3"}
_ALLOWED_ORIENTATION = {"landscape", "portrait"}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_TYPES = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}

class InvalidJob(ValueError):
    """Bad or unsafe print request."""

def _text(value: Any, name: str, maximum: int, *, required: bool = False) -> str:
    if not isinstance(value, str):
        raise InvalidJob(f"{name}: texto obrigatório.")
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise InvalidJob(f"{name}: comprimento inválido.")
    if any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise InvalidJob(f"{name}: carácter de controlo não permitido.")
    return value

def _coordinates(value: Any, stats: dict, depth: int = 0) -> None:
    if depth > 12 or not isinstance(value, list) or not value:
        raise InvalidJob("Coordenadas vazias ou demasiado aninhadas.")
    if isinstance(value[0], (int, float)) and not isinstance(value[0], bool):
        if len(value) < 2 or not all(
            isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c)
            for c in value[:2]
        ) or abs(value[0]) > 180 or abs(value[1]) > 90:
            raise InvalidJob("Coordenadas devem ser longitude/latitude em EPSG:4326.")
        stats["positions"] += 1
        if stats["positions"] > MAX_POSITIONS:
            raise InvalidJob("Demasiados vértices para uma impressão.")
        lon, lat = value[:2]
        stats["bounds"][0] = min(stats["bounds"][0], lon)
        stats["bounds"][1] = min(stats["bounds"][1], lat)
        stats["bounds"][2] = max(stats["bounds"][2], lon)
        stats["bounds"][3] = max(stats["bounds"][3], lat)
        return
    for nested in value:
        _coordinates(nested, stats, depth + 1)

def _geometry(value: Any, stats: dict, depth: int = 0) -> None:
    if depth > 12 or not isinstance(value, dict):
        raise InvalidJob("Geometria demasiado complexa.")
    kind = value.get("type")
    if kind == "GeometryCollection":
        parts = value.get("geometries")
        if not isinstance(parts, list) or len(parts) > MAX_FEATURES:
            raise InvalidJob("Colecção de geometrias inválida.")
        for part in parts:
            _geometry(part, stats, depth + 1)
    elif kind in _TYPES:
        _coordinates(value.get("coordinates"), stats)
    else:
        raise InvalidJob("Tipo de geometria GeoJSON não suportado.")

def validate_job(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise InvalidJob("O pedido deve ser um objecto JSON.")
    paper = raw.get("paper", "A4")
    orientation = raw.get("orientation", "landscape")
    if paper not in _ALLOWED_PAPER or orientation not in _ALLOWED_ORIENTATION:
        raise InvalidJob("Formato de papel ou orientação inválidos.")
    title = _text(raw.get("title", ""), "Título", 150, required=True)
    subtitle = _text(raw.get("subtitle", ""), "Subtítulo", 240)
    author = _text(raw.get("author", "GeoMoz Explorer"), "Autor", 100)
    attribution = _text(raw.get("attribution", "Created with GeoMoz Explorer"), "Créditos", 300)
    dpi = raw.get("dpi", 300)
    if type(dpi) is not int or dpi not in (150, 300, 600):
        raise InvalidJob("DPI deve ser 150, 300 ou 600.")
    layers = raw.get("layers")
    if not isinstance(layers, list) or not 1 <= len(layers) <= MAX_LAYERS:
        raise InvalidJob(f"Seleccione entre 1 e {MAX_LAYERS} camadas vectoriais.")
    stats = {"features": 0, "positions": 0, "bounds": [180.0, 90.0, -180.0, -90.0]}
    normalized = []
    for layer in layers:
        if not isinstance(layer, dict):
            raise InvalidJob("Definição de camada inválida.")
        name = _text(layer.get("name"), "Nome da camada", 100, required=True)
        color = layer.get("color", "#0284c7")
        if not isinstance(color, str) or not _HEX.fullmatch(color):
            raise InvalidJob("Cor inválida. Utilize #RRGGBB.")
        geojson = layer.get("geojson")
        if not isinstance(geojson, dict) or geojson.get("type") != "FeatureCollection":
            raise InvalidJob("Só são aceites camadas GeoJSON FeatureCollection.")
        features = geojson.get("features")
        if not isinstance(features, list):
            raise InvalidJob("Lista de feições inválida.")
        stats["features"] += len(features)
        if stats["features"] > MAX_FEATURES:
            raise InvalidJob(f"Limite de {MAX_FEATURES} feições excedido.")
        checked = []
        for feature in features:
            if not isinstance(feature, dict) or feature.get("type") != "Feature":
                raise InvalidJob("Feição GeoJSON inválida.")
            if feature.get("geometry") is not None:
                _geometry(feature["geometry"], stats)
            props = feature.get("properties")
            if props is not None and not isinstance(props, dict):
                raise InvalidJob("Atributos de feição inválidos.")
            checked.append({"type": "Feature", "geometry": feature.get("geometry"),
                            "properties": props or {}})
        normalized.append({"name": name, "color": color,
                           "geojson": {"type": "FeatureCollection", "features": checked}})
    bbox = raw.get("bbox")
    if bbox is not None:
        if (not isinstance(bbox, list) or len(bbox) != 4 or
                any(not isinstance(v, (int, float)) or isinstance(v, bool) or
                    not math.isfinite(v) for v in bbox)):
            raise InvalidJob("Envelope geográfico inválido.")
        w, s, e, n = bbox
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise InvalidJob("Envelope fora dos limites geográficos WGS84.")
    elif stats["positions"]:
        w, s, e, n = stats["bounds"]
        # Very small extents need non-zero width and height in QgsRectangle.
        margin = max((e-w), (n-s), 0.002) * 0.08
        bbox = [max(-180,w-margin), max(-90,s-margin),
                min(180,e+margin), min(90,n+margin)]
    else:
        raise InvalidJob("Não existem geometrias e o envelope não foi definido.")
    return {"schema": 1, "paper": paper, "orientation": orientation, "dpi": dpi,
            "title": title, "subtitle": subtitle, "author": author,
            "attribution": attribution, "layers": normalized, "bbox": bbox}

def parse_request(payload: bytes) -> dict:
    if len(payload) > MAX_REQUEST_BYTES:
        raise InvalidJob("Pedido de impressão excede 4 MB.")
    try:
        return validate_job(json.loads(payload))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidJob("O pedido não contém JSON válido.") from exc
