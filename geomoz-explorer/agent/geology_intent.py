"""Geology conversational scope resolution, independent from the LLM provider."""
from __future__ import annotations

import re
import unicodedata
from typing import Any

PROVINCES = (
    "Cabo Delgado", "Maputo", "Gaza", "Inhambane", "Sofala",
    "Manica", "Tete", "Zambézia", "Nampula", "Niassa",
)

LITHOLOGIES = {
    "granito": "granit", "basalto": "basalt", "gnaisse": "gnaiss",
    "calcario": "calc", "quartzito": "quartzit", "gabro": "gabr",
    "xisto": "xist", "arenito": "arenit", "migmatito": "migmatit",
}
GEOLOGY_TERMS = ("geol", "litolog", "formac", "rocha", "granito", "basalto",
                 "gnaiss", "calcario", "quartzito", "gabro", "xisto",
                 "arenito", "migmatito")
ADVANCED_TERMS = ("ouro", "cobre", "mineraliza", "prospect", "prospec",
                  "favorabil", "targeting", "hidroterm", "indice", "espectral",
                  "lineament", "fractur", "falha", "tecton", "sismic", "anomalia")
FOLLOWUP_TERMS = ("mostra", "mostrar", "visualiz", "mapa", "apresenta",
                  "filtra", "apenas", "so ", "agora", "e no ", "e na ",
                  "amplia", "aproxima", "ver camada", "detalhe")


def fold(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.casefold())
                   if not unicodedata.combining(c))


def _province_mentioned(message: str) -> str | None:
    text = fold(message)
    for province in sorted(PROVINCES, key=len, reverse=True):
        if re.search(r"(?<!\w)" + re.escape(fold(province)) + r"(?!\w)", text):
            return province
    return None


def _district_mentioned(message: str) -> str | None:
    match = re.search(
        r"\bdistrito\s+(?:de|do|da)?\s*([\wÀ-ÿ][\wÀ-ÿ\s-]{0,65})",
        message, flags=re.IGNORECASE,
    )
    if match is None:
        return None
    raw = re.split(r"[?.,;!]|(?:\s+(?:no|na|com|e|para|mostra|mapa)\b)",
                   match.group(1), maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return raw.title() if raw else None


def _lithology_mentioned(message: str) -> str | None:
    text = fold(message)
    for term, value in LITHOLOGIES.items():
        if re.search(r"(?<!\w)" + re.escape(term) + r"\w{0,4}(?!\w)", text):
            return value
    return None


def is_catalogue_request(message: str) -> bool:
    text = fold(message)
    return any(term in text for term in GEOLOGY_TERMS) and not any(
        term in text for term in ADVANCED_TERMS
    )


def is_geology_followup(message: str, agent_context: dict[str, Any] | None) -> bool:
    if not agent_context or agent_context.get("domain") != "geology":
        return False
    text = fold(message).strip()
    if any(term in text for term in ADVANCED_TERMS):
        return False
    return any(term in text for term in FOLLOWUP_TERMS) or (
        len(text) < 90 and (_district_mentioned(message) is not None
                            or _province_mentioned(message) is not None)
    )


def resolve_geology_scope(message: str, current_map_state: dict[str, Any]) -> dict[str, Any]:
    """Resolve explicit question > previous conversation > selected map AOI.

    Previous context only wins for follow-ups; a new explicit geology question
    without an area uses the actively selected AOI, not a stale previous query.
    """
    active_aoi = current_map_state.get("aoi") or {}
    if not isinstance(active_aoi, dict):
        active_aoi = {}
    previous = current_map_state.get("agentContext") or {}
    if not isinstance(previous, dict) or previous.get("domain") != "geology":
        previous = {}

    continuation = is_geology_followup(message, previous)
    basis = previous if continuation else active_aoi
    mentioned_province = _province_mentioned(message)
    mentioned_district = _district_mentioned(message)
    province = mentioned_province or basis.get("province") or None
    district = mentioned_district or (
        None if mentioned_province else basis.get("district")
    )
    # An explicitly named district must not inherit a competing old district.
    lithology = _lithology_mentioned(message)
    filter_str = lithology if lithology else (previous.get("filter_str") if continuation else None)
    # Only keep a drawn geometry when it is the actual query's AOI.
    geometry = basis.get("geometry") or basis.get("customGeometry")
    if mentioned_province or mentioned_district:
        geometry = None

    context = {
        "domain": "geology",
        "province": province,
        "district": district,
        "filter_str": filter_str,
        "geometry": geometry,
    }
    return context
