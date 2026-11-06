"""Bounded, deterministic context resolution for geospatial follow-ups.

The user's map AOI is authoritative over previous conversation summaries.
No location is guessed from words like 'a mesma área'.
"""
import re
import unicodedata


def fold(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).casefold())
                   if not unicodedata.combining(c))


_RELATIVE = re.compile(
    r"\b(?:a mesma (?:area|regiao|zona|localidade)|"
    r"o mesmo (?:distrito|local|municipio|territorio|sitio)|"
    r"(?:nessa|nesta|naquela) (?:area|regiao|zona)|"
    r"(?:nesse|neste) (?:distrito|local|territorio)|"
    r"(?:area|regiao|local) (?:anterior|do estudo|da analise)|"
    r"same (?:area|district|region)|the same area|"
    r"(?:ali|la mesmo))\b"
)


def refers_to_current_area(message):
    text = fold(message)
    if re.search(r"\b(?:agora|mas agora) em (?:outra |novo |outra? ?provincia|outro distrito)", text):
        return False
    return bool(_RELATIVE.search(text))


def usable_aoi(aoi):
    if not isinstance(aoi, dict) or aoi.get("source") == "global":
        return False
    if aoi.get("geometry") or aoi.get("customGeometry"):
        return True
    if aoi.get("source") == "country":
        code = aoi.get("countryCode")
        level = aoi.get("adminLevel", 0)
        if not (isinstance(code, str) and len(code) == 3):
            return False
        if aoi.get("boundarySource") == "gaul2025" and level == 2:
            return (isinstance(aoi.get("admin1Code"), int)
                    and not isinstance(aoi.get("admin1Code"), bool)
                    and isinstance(aoi.get("admin2Code"), int)
                    and not isinstance(aoi.get("admin2Code"), bool))
        if aoi.get("boundarySource") == "gaul2025" and level == 1:
            return isinstance(aoi.get("admin1Code"), int) and not isinstance(aoi.get("admin1Code"), bool)
        return True
    if aoi.get("source") == "mozambique":
        return True
    return bool(aoi.get("province"))


def followup_scope(context, message):
    """Return the explicit/retained AOI or an actionable missing-area message."""
    if not refers_to_current_area(message):
        return None
    current = context.get("aoi")
    if usable_aoi(current):
        return dict(current)
    saved = (context.get("analysisMemory") or {}).get("aoi")
    if usable_aoi(saved):
        return dict(saved)
    return "Seleccione primeiro uma área de estudo; «a mesma área» não identifica um limite geográfico."
