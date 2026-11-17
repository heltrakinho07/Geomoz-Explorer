"""Versioned, bounded input contract shared by the API and the GemPy worker.

Coordinates: X east, Y north, Z elevation upwards, metres. Orientations use
dip direction clockwise from north (not strike), dip 0–90 and polarity ±1.
No executable Python, pickle, remote URLs or arbitrary engine options accepted.
"""
import json
import math
import re

MAX_INPUT_BYTES = 1_000_000
MAX_RESULT_BYTES = 16_000_000
MAX_CONTACTS = 250
MAX_ORIENTATIONS = 100
NAME = re.compile(r"^[\w .-]{1,64}$", re.UNICODE)


class InvalidModel(ValueError):
    pass


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InvalidModel(f"{label}: número finito obrigatório.")
    return float(value)


def validate_model(data):
    if not isinstance(data, dict) or (type(data.get("schemaVersion")) is not int or data["schemaVersion"] != 1):
        raise InvalidModel("Formato de modelo não suportado (schemaVersion = 1).")
    allowed = {"schemaVersion", "name", "crs", "extent", "resolution", "interfaces", "contacts", "orientations"}
    if set(data) - allowed:
        raise InvalidModel("O modelo contém campos não suportados.")
    name = data.get("name")
    if not isinstance(name, str) or not NAME.fullmatch(name.strip()):
        raise InvalidModel("Nome do modelo inválido (1–64 caracteres).")
    crs = data.get("crs")
    if crs != "LOCAL":
        if not isinstance(crs, str) or not re.fullmatch(r"EPSG:\d{4,6}", crs):
            raise InvalidModel("Use LOCAL ou um EPSG projectado em metros.")
        from pyproj import CRS
        try:
            system = CRS.from_user_input(crs)
        except Exception as exc:
            raise InvalidModel("EPSG desconhecido.") from exc
        if not system.is_projected or any(abs(axis.unit_conversion_factor - 1) > 1e-9 for axis in system.axis_info):
            raise InvalidModel("O CRS deve ser projectado em metros; longitude/latitude não são aceites.")
    bounds = data.get("extent")
    if not isinstance(bounds, list) or len(bounds) != 6:
        raise InvalidModel("Extensão: X mínimo/máximo, Y mínimo/máximo, Z mínimo/máximo.")
    bounds = [number(v, "Extensão") for v in bounds]
    for i in (0, 2, 4):
        if not 1 <= bounds[i + 1] - bounds[i] <= 100_000 or max(abs(bounds[i]), abs(bounds[i + 1])) > 100_000_000:
            raise InvalidModel("Cada dimensão deve medir entre 1 m e 100 km, com mínimo inferior ao máximo.")
    resolution = data.get("resolution")
    if type(resolution) is not int or resolution not in (16, 24, 32):
        raise InvalidModel("Resolução suportada: 16, 24 ou 32 células por eixo.")
    interfaces = data.get("interfaces")
    if not isinstance(interfaces, list) or not 1 <= len(interfaces) <= 8:
        raise InvalidModel("Defina entre 1 e 8 interfaces, da unidade mais recente à mais antiga.")
    names = set()
    clean_interfaces = []
    for unit in interfaces:
        if not isinstance(unit, dict) or set(unit) != {"name", "color", "kind"}:
            raise InvalidModel("Cada interface requer name, color e kind.")
        label = unit["name"]
        if not isinstance(label, str) or not NAME.fullmatch(label) or label.lower() == "basement" or label in names:
            raise InvalidModel("Nomes de interfaces inválidos, repetidos ou reservados (basement).")
        if unit["kind"] not in ("layer", "fault") or not isinstance(unit["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", unit["color"]):
            raise InvalidModel("Tipo ou cor da interface inválidos.")
        names.add(label)
        clean_interfaces.append(dict(unit))
    if sum(u["kind"] == "fault" for u in interfaces) > 1 or not any(u["kind"] == "layer" for u in interfaces):
        raise InvalidModel("Esta versão aceita uma sequência estratigráfica e, opcionalmente, uma falha.")
    cleaned = {}
    for key, limit in (("contacts", MAX_CONTACTS), ("orientations", MAX_ORIENTATIONS)):
        rows = data.get(key)
        if not isinstance(rows, list) or not 1 <= len(rows) <= limit:
            raise InvalidModel(f"{key}: entre 1 e {limit} registos.")
        columns = {"x", "y", "z", "formation"} | ({"azimuth", "dip", "polarity"} if key == "orientations" else set())
        output, seen = [], set()
        for row in rows:
            if not isinstance(row, dict) or set(row) != columns or not isinstance(row.get("formation"), str) or row["formation"] not in names:
                raise InvalidModel(f"{key}: colunas inválidas ou formação desconhecida.")
            point = {axis: number(row[axis], axis) for axis in ("x", "y", "z")}
            for i, axis in enumerate(("x", "y", "z")):
                if not bounds[2 * i] <= point[axis] <= bounds[2 * i + 1]:
                    raise InvalidModel(f"{key}: ponto fora da extensão do modelo.")
            identity = (row["formation"], point["x"], point["y"], point["z"])
            if identity in seen:
                raise InvalidModel(f"{key}: pontos duplicados na mesma interface.")
            seen.add(identity)
            point["formation"] = row["formation"]
            if key == "orientations":
                point.update({k: number(row[k], k) for k in ("azimuth", "dip", "polarity")})
                if not 0 <= point["azimuth"] < 360 or not 0 <= point["dip"] <= 90 or point["polarity"] not in (-1, 1):
                    raise InvalidModel("Orientação: azimute [0,360[, inclinação [0,90], polaridade ±1.")
            output.append(point)
        cleaned[key] = output
    for unit in interfaces:
        points = [r for r in cleaned["contacts"] if r["formation"] == unit["name"]]
        if len(points) < 3:
            raise InvalidModel(f"{unit['name']}: pelo menos 3 contactos distintos.")
        # Collinear points do not constrain a surface in this initial workflow.
        vectors = [[p[a] - points[0][a] for a in ("x", "y", "z")] for p in points[1:]]
        a = vectors[0]
        if not any(sum(v * v for v in (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])) > 1e-12 for b in vectors[1:]):
            raise InvalidModel(f"{unit['name']}: os contactos não podem ser todos colineares.")
        if not any(r["formation"] == unit["name"] for r in cleaned["orientations"]):
            raise InvalidModel(f"{unit['name']}: pelo menos uma orientação é necessária.")
    return {"schemaVersion": 1, "name": name.strip(), "crs": crs, "extent": bounds,
            "resolution": resolution, "interfaces": clean_interfaces, **cleaned}


def parse_model(raw):
    if len(raw) > MAX_INPUT_BYTES:
        raise InvalidModel("O modelo excede 1 MB.")
    try:
        return validate_model(json.loads(raw))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise InvalidModel("JSON do modelo inválido.") from exc
