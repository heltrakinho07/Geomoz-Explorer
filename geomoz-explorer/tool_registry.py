"""Deterministic GeoMoz tool registry.

The registry is the contract between GeoMoz AI and geospatial execution.
Language models must select from these tools instead of executing arbitrary
Python/GIS code. Each analysis tool maps to a validated AnalysisJob type.

This first registry intentionally exposes only workflows already covered by
the Job Engine. New tools should be added only after their underlying API has
input validation, ownership checks and tests.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Optional


_TOOLS: dict[str, dict[str, Any]] = {
    "calculate_index": {
        "id": "calculate_index",
        "name": "Calcular índice geoespacial",
        "description": (
            "Calcula um índice espectral, climático, biofísico ou de terreno "
            "registado no catálogo GeoMoz/GEE para uma AOI e período."
        ),
        "category": "remote_sensing",
        "execution": "analysis_job",
        "job_type": "gee.index",
        "requires_gee": True,
        "risk": "low",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "required": ["index"],
            "properties": {
                "index": {"type": "string", "description": "ID do índice GeoMoz."},
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "start_date": {"type": "string", "format": "date"},
                "end_date": {"type": "string", "format": "date"},
                "cloud_pct": {"type": "integer", "minimum": 0, "maximum": 100},
            },
        },
    },
    "detect_flood": {
        "id": "detect_flood",
        "name": "Detectar inundação",
        "description": (
            "Mapeia extensão potencial de cheia com Sentinel-1 SAR comparando "
            "um período de evento com uma linha de base."
        ),
        "category": "hazards",
        "execution": "analysis_job",
        "job_type": "gee.flood",
        "requires_gee": True,
        "risk": "low",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "required": ["event_start", "event_end"],
            "properties": {
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "event_start": {"type": "string", "format": "date"},
                "event_end": {"type": "string", "format": "date"},
                "baseline_start": {"type": ["string", "null"], "format": "date"},
                "baseline_end": {"type": ["string", "null"], "format": "date"},
            },
        },
    },
    "delineate_watershed": {
        "id": "delineate_watershed",
        "name": "Delimitar bacia hidrográfica",
        "description": (
            "Delimita a bacia correspondente a um ponto de saída usando "
            "HydroBASINS/HydroSHEDS."
        ),
        "category": "hydrology",
        "execution": "analysis_job",
        "job_type": "gee.watershed",
        "requires_gee": True,
        "risk": "low",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "required": ["lat", "lon"],
            "properties": {
                "lat": {"type": "number", "minimum": -90, "maximum": 90},
                "lon": {"type": "number", "minimum": -180, "maximum": 180},
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "level": {"type": "integer", "minimum": 1, "maximum": 12},
                "max_iter": {"type": "integer", "minimum": 1},
            },
        },
    },
    "run_mineral_targeting": {
        "id": "run_mineral_targeting",
        "name": "Executar targeting mineral",
        "description": (
            "Combina evidências espectrais e estruturais para produzir um "
            "mapa de favorabilidade mineral e estatísticas de alvos."
        ),
        "category": "mining",
        "execution": "analysis_job",
        "job_type": "gee.targeting",
        "requires_gee": True,
        "risk": "medium",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "required": ["mineral"],
            "properties": {
                "mineral": {"type": "string"},
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "start_date": {"type": "string", "format": "date"},
                "end_date": {"type": "string", "format": "date"},
                "cloud_pct": {"type": "integer", "minimum": 0, "maximum": 100},
                "weights_override": {"type": ["object", "null"]},
                "invert_override": {"type": ["array", "null"]},
                "score_threshold": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
    },
    "calculate_erosion_risk": {
        "id": "calculate_erosion_risk",
        "name": "Calcular risco de erosão",
        "description": "Calcula perda potencial de solo e classes de risco usando RUSLE.",
        "category": "hazards",
        "execution": "analysis_job",
        "job_type": "gee.erosion",
        "requires_gee": True,
        "risk": "low",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "properties": {
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "year": {"type": "integer", "minimum": 1981, "maximum": 2100},
            },
        },
    },
    "run_groundwater_ahp": {
        "id": "run_groundwater_ahp",
        "name": "Analisar potencial de água subterrânea",
        "description": (
            "Executa a sobreposição AHP dos factores hidrogeológicos e produz "
            "classes de potencial de água subterrânea."
        ),
        "category": "groundwater",
        "execution": "analysis_job",
        "job_type": "gee.groundwater",
        "requires_gee": True,
        "risk": "medium",
        "confirmation_required": False,
        "parameters": {
            "type": "object",
            "properties": {
                "province": {"type": ["string", "null"]},
                "district": {"type": ["string", "null"]},
                "geometry": {"type": ["object", "null"]},
                "year": {"type": "integer", "minimum": 1981, "maximum": 2100},
            },
        },
    },
}


def list_tools(
    *,
    category: Optional[str] = None,
    requires_gee: Optional[bool] = None,
) -> list[dict[str, Any]]:
    """Return public tool definitions, optionally filtered."""
    tools = list(_TOOLS.values())
    if category:
        tools = [tool for tool in tools if tool["category"] == category]
    if requires_gee is not None:
        tools = [tool for tool in tools if tool["requires_gee"] is requires_gee]
    return [deepcopy(tool) for tool in tools]


def get_tool(tool_id: str) -> Optional[dict[str, Any]]:
    tool = _TOOLS.get(tool_id)
    return deepcopy(tool) if tool else None


def resolve_job_type(tool_id: str) -> Optional[str]:
    tool = _TOOLS.get(tool_id)
    if not tool or tool.get("execution") != "analysis_job":
        return None
    return str(tool["job_type"])


def registry_summary() -> dict[str, Any]:
    categories = sorted({tool["category"] for tool in _TOOLS.values()})
    return {
        "count": len(_TOOLS),
        "categories": categories,
        "execution_model": "validated_tools_only",
        "arbitrary_code_execution": False,
    }
