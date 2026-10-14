"""Grounded geology queries for GeoMoz Agent; never invent geological units.

The dataset is provided by geomoz.read_geology() via the existing FastAPI
loader. Summaries contain no geometry so LLM tool results stay small.
The interactive map obtains polygons in a separate, size-bounded request.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

GEOLOGY_SOURCE = "GeoMoz / geomoz.read_geology() — carta geológica de Moçambique"
MAX_FILTER_LENGTH = 100
MAX_FEATURES = 700
MAX_GEOJSON_BYTES = 3_000_000
GEOLOGY_COLUMNS = (
    "Legend", "LEGEND", "Lithology", "LITOLOGIA", "LITOLOGIA_", "DESC_UNIDA",
    "DESCRICAO", "UNIT_NAME", "Formation", "FORMACAO", "code2006",
    "ERA", "PERIOD", "Simbolo",
)


def _select_geology(province=None, district=None, geometry=None, filter_str=None):
    import geopandas as gpd
    from shapely.geometry import shape
    import api

    if province and len(province) > 120 or district and len(district) > 120:
        raise ValueError("Nome da província ou distrito demasiado longo.")
    if filter_str and len(filter_str) > MAX_FILTER_LENGTH:
        raise ValueError("Filtro geológico demasiado longo.")

    if geometry:
        if not isinstance(geometry, dict):
            raise ValueError("A área de estudo deve ser GeoJSON válido.")
        if len(str(geometry)) > 300_000:
            raise ValueError("Área desenhada demasiado complexa: simplifique o polígono.")
        selected_geometry = shape(geometry)
        if selected_geometry.geom_type not in {"Polygon", "MultiPolygon"}:
            raise ValueError("A área de estudo tem de ser um polígono.")
        if not selected_geometry.is_valid:
            selected_geometry = selected_geometry.buffer(0)
        if selected_geometry.is_empty:
            raise ValueError("A área de estudo não contém geometria válida.")
    elif district:
        boundaries = api._districts()
        name_col = api.find_col(boundaries, ["Distrito", "DISTRITO", "NAME_2", "name"])
        if not name_col:
            raise ValueError("Os nomes dos distritos não estão disponíveis no catálogo.")
        selected = boundaries[boundaries[name_col].astype(str).str.casefold() == district.casefold()]
        if province and not selected.empty:
            province_col = api.find_col(boundaries, ["Provincia", "PROVINCIA", "NAME_1"])
            if province_col:
                selected = selected[selected[province_col].astype(str).str.casefold() == province.casefold()]
        if selected.empty:
            raise ValueError(f"Distrito '{district}' não encontrado para a província indicada.")
        selected_geometry = api._union_geom(selected.geometry)
    elif province:
        boundaries = api._provinces()
        col = api.find_col(boundaries, ["Provincia", "PROVINCIA", "NAME_1", "name"])
        if not col:
            raise ValueError("Os nomes das províncias não estão disponíveis no catálogo.")
        selected = boundaries[boundaries[col].astype(str).str.casefold() == province.casefold()]
        if selected.empty:
            raise ValueError(f"Província '{province}' não encontrada.")
        selected_geometry = api._union_geom(selected.geometry)
    else:
        selected_geometry = None

    gdf = api._geology().copy()
    if selected_geometry is not None:
        gdf = gpd.clip(gdf, selected_geometry)

    usable_columns = [name for name in GEOLOGY_COLUMNS if name in gdf.columns]
    if filter_str and filter_str.strip():
        needle = filter_str.strip()
        if not usable_columns:
            raise ValueError("O catálogo não contém atributos geológicos pesquisáveis.")
        mask = None
        for col in usable_columns:
            match = gdf[col].astype("string").str.contains(
                needle, case=False, regex=False, na=False
            )
            mask = match if mask is None else (mask | match)
        gdf = gdf[mask].copy()

    return gdf, usable_columns


def summarize_geology(*, province=None, district=None, geometry=None, filter_str=None) -> dict[str, Any]:
    """Return actual statistics and an instruction to request polygons separately."""
    try:
        frame, columns = _select_geology(province, district, geometry, filter_str)
        from utils.common import find_col

        name_col = find_col(frame, ["Legend", "LEGEND", "Lithology", "LITOLOGIA", "DESC_UNIDA", "DESCRICAO", "UNIT_NAME", "Formation", "FORMACAO", "code2006", "Simbolo"])
        if not name_col and columns:
            name_col = columns[0]

        if frame.empty:
            return {
                "status": "success", "source": GEOLOGY_SOURCE,
                "unitsCount": 0, "uniqueUnits": 0, "totalAreaKm2": 0,
                "dominantUnits": [], "summary": "Nenhuma unidade geológica foi encontrada para a área e o filtro seleccionados.",
            }

        projected = frame.to_crs("EPSG:6933")
        areas = projected.geometry.area / 1_000_000
        total_area = float(areas.sum())
        if name_col:
            grouped = frame[[name_col]].copy()
            grouped["_area_km2"] = areas.to_numpy()
            grouped[name_col] = grouped[name_col].fillna("Não identificada").astype(str)
            top = grouped.groupby(name_col, dropna=False).agg(
                area=("_area_km2", "sum"), polygons=("_area_km2", "size")
            ).sort_values("area", ascending=False)
            dominant = [{
                "name": str(label), "areaKm2": round(float(row["area"]), 2),
                "percent": round(float(row["area"]) / total_area * 100, 1) if total_area else 0,
                "polygons": int(row["polygons"]),
            } for label, row in top.head(8).iterrows()]
            unique_units = int(len(top))
        else:
            dominant = []
            unique_units = 0

        scope = district or province or "Moçambique"
        sample = ", ".join(f'{u["name"]} ({u["percent"]}%)' for u in dominant[:4])
        summary = (
            f"Dados reais do GeoMoz para {scope}: {len(frame)} polígonos, "
            f"{unique_units} unidades distintas, área geológica aproximada "
            f"{total_area:.1f} km². Principais unidades por área: {sample or 'sem atributos identificáveis'}. "
            "Percentagens e áreas estimadas com geometrias cartográficas simplificadas; "
            "não representam reservas minerais nem confirmação de campo."
        )
        return {
            "status": "success",
            "source": GEOLOGY_SOURCE,
            "unitsCount": int(len(frame)),
            "uniqueUnits": unique_units,
            "totalAreaKm2": round(total_area, 2),
            "dominantUnits": dominant,
            "summary": summary,
            "map_action": {
                "type": "ADD_GEOJSON_LAYER",
                "id": "agent_geology",
                "name": f"Geologia — {scope}",
                "province": province,
                "district": district,
                "filter_str": filter_str or "",
                "geometry": geometry,
            },
        }
    except Exception as exc:
        logger.warning("GeoMoz geology query failed: %s", exc)
        return {"status": "error", "source": GEOLOGY_SOURCE,
                "message": f"Não foi possível consultar a base geológica: {exc}"}


def geology_features(*, province=None, district=None, geometry=None, filter_str=None) -> dict[str, Any]:
    """Return bounded GeoJSON for an interactive map, or a clear actionable error."""
    from shapely.geometry import mapping
    from utils.common import find_col, color_for

    frame, _ = _select_geology(province, district, geometry, filter_str)
    if len(frame) > MAX_FEATURES:
        raise ValueError(
            f"A consulta encontrou {len(frame)} polígonos, acima do limite de "
            f"{MAX_FEATURES} por visualização. Seleccione um distrito ou filtre uma litologia."
        )
    name_col = find_col(frame, ["Legend", "LEGEND", "Lithology", "LITOLOGIA", "DESC_UNIDA", "DESCRICAO", "UNIT_NAME", "Formation", "FORMACAO", "code2006", "Simbolo"])
    era_col = find_col(frame, ["ERA"])
    period_col = find_col(frame, ["PERIOD"])
    litho_col = find_col(frame, ["Lithology", "LITOLOGIA", "LITOLOGIA_", "DESC_UNIDA"])
    features = []
    for _, row in frame.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        unit = str(row[name_col]) if name_col and row[name_col] is not None else "Não identificada"
        props = {
            "unit": unit,
            "_color": color_for(unit),
            "lithology": str(row[litho_col]) if litho_col and row[litho_col] is not None else None,
            "era": str(row[era_col]) if era_col and row[era_col] is not None else None,
            "period": str(row[period_col]) if period_col and row[period_col] is not None else None,
        }
        features.append({"type": "Feature", "geometry": mapping(geom), "properties": props})

    import json
    payload = {"type": "FeatureCollection", "features": features, "source": GEOLOGY_SOURCE}
    if not frame.empty:
        bounds = frame.total_bounds.tolist()
        payload["bbox"] = [float(n) for n in bounds]
    if len(json.dumps(payload, ensure_ascii=False)) > MAX_GEOJSON_BYTES:
        raise ValueError("A camada é demasiado extensa. Seleccione uma área menor ou uma litologia.")
    return payload
