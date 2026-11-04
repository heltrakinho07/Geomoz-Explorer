"""FAO GAUL 2025 boundary selection by ISO3 and stable hierarchical codes.

ADM1/ADM2 names differ by country; they are not universally provinces/districts.
Country geometry is explicitly derived by union of that country's ADM1 units.
"""
import re

GAUL1 = "FAO/GAUL/2025/level1"
GAUL2 = "FAO/GAUL/2025/level2"
MAX_UNITS = 2000


def validate_selection(country_code, level=0, admin1_code=None, admin2_code=None):
    if not isinstance(country_code, str) or not re.fullmatch(r"[A-Z]{3}", country_code):
        raise ValueError("Seleccione um país com código ISO alfa-3 válido.")
    if isinstance(level, bool) or not isinstance(level, int) or level not in (0, 1, 2):
        raise ValueError("Nível administrativo deve ser 0, 1 ou 2.")
    for code in (admin1_code, admin2_code):
        if code is not None and (isinstance(code, bool) or not isinstance(code, int) or code < 0):
            raise ValueError("Os códigos GAUL devem ser números inteiros não negativos.")
    if level >= 1 and admin1_code is None:
        raise ValueError("Seleccione uma unidade ADM1 antes de continuar.")
    if level == 2 and admin2_code is None:
        raise ValueError("Seleccione uma unidade ADM2 antes de continuar.")
    if level == 0 and (admin1_code is not None or admin2_code is not None) or level == 1 and admin2_code is not None:
        raise ValueError("A selecção contém códigos de um nível inferior. Volte a seleccionar a área.")


def _collection(country_code, level=0, admin1_code=None, admin2_code=None):
    import ee
    validate_selection(country_code, level, admin1_code, admin2_code)
    asset = GAUL2 if level == 2 else GAUL1
    selected = ee.FeatureCollection(asset).filter(ee.Filter.eq("ISO3_CODE", country_code))
    if level >= 1:
        selected = selected.filter(ee.Filter.eq("GAUL1_CODE", admin1_code))
    if level == 2:
        selected = selected.filter(ee.Filter.eq("GAUL2_CODE", admin2_code))
    return selected, asset


def administrative_geometry(country_code, level=0, admin1_code=None, admin2_code=None):
    selected, asset = _collection(country_code, level, admin1_code, admin2_code)
    if not selected.size().getInfo():
        raise ValueError("Unidade administrativa não encontrada na hierarquia FAO GAUL 2025 seleccionada. Não foi usada outra área como substituto.")
    metadata = {"dataset": asset, "version": "2025", "level": level,
                "countryCode": country_code, "admin1Code": admin1_code, "admin2Code": admin2_code,
                "mergeMaxErrorM": 100,
                "derivation": "union_of_ADM1_by_ISO3" if level == 0 else "selected_administrative_unit",
                "citation": "FAO. 2025. Global Administrative Unit Layers (GAUL). https://data.apps.fao.org. Licence: CC-BY-4.0"}
    return selected.geometry(maxError=100), metadata


def list_units(country_code, level=1, parent_code=None):
    import ee
    from agent.public_datasets import source
    validate_selection(country_code)
    if isinstance(level, bool) or not isinstance(level, int) or level not in (1, 2):
        raise ValueError("A listagem suporta apenas ADM1 ou ADM2.")
    if level == 2:
        if parent_code is None or isinstance(parent_code, bool) or not isinstance(parent_code, int) or parent_code < 0:
            raise ValueError("Seleccione primeiro uma unidade ADM1 para listar as unidades ADM2.")
        selected, asset = _collection(country_code, 1, parent_code)
        # The parent must belong to this country; matching names alone is unsafe.
        if not selected.size().getInfo():
            raise ValueError("A unidade ADM1 não pertence ao país seleccionado.")
        selected = (ee.FeatureCollection(GAUL2).filter(ee.Filter.eq("ISO3_CODE", country_code))
                    .filter(ee.Filter.eq("GAUL1_CODE", parent_code)))
        asset = GAUL2
    else:
        if parent_code is not None:
            raise ValueError("Uma listagem ADM1 não recebe código de pai.")
        selected, asset = _collection(country_code)
    fields = ["GAUL0_CODE", "GAUL0_NAME", "GAUL1_CODE", "GAUL1_NAME"]
    if level == 2:
        fields += ["GAUL2_CODE", "GAUL2_NAME"]
    # Return attributes only. Never download all boundary geometries to the chat.
    records = (selected.map(lambda feature: ee.Feature(None, feature.toDictionary(fields)))
               .limit(MAX_UNITS + 1).getInfo() or {}).get("features", [])
    if len(records) > MAX_UNITS:
        raise ValueError("Demasiadas unidades para a listagem. Restrinja a selecção administrativa.")
    units = []
    seen = set()
    for feature in records:
        props = feature.get("properties") or {}
        code = props.get(f"GAUL{level}_CODE")
        if code is None or code in seen:
            continue
        seen.add(code)
        units.append({"code": code, "name": props.get(f"GAUL{level}_NAME") or str(code),
                      "countryCode": country_code, "parentCode": props.get("GAUL1_CODE") if level == 2 else None,
                      "countryName": props.get("GAUL0_NAME"), "level": level})
    units.sort(key=lambda unit: (unit["name"].casefold(), unit["code"]))
    if not units:
        raise ValueError("Sem unidades neste nível para a selecção FAO GAUL 2025. Não foi usada outra fonte silenciosamente.")
    return {"status": "success", "units": units, "countryCode": country_code, "level": level,
            "parentCode": parent_code, "source": source(asset),
            "summary": f"FAO GAUL 2025: {len(units)} unidades ADM{level} em {country_code}.",
            "warning": "Níveis administrativos e designações variam por país; não são limites cadastrais."}
