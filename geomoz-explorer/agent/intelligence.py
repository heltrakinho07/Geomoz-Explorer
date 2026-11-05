"""Request-scoped execution evidence for GeoMoz geospatial intelligence.

No model-generated value is accepted as an execution record. This module has
no GIS/provider dependency and never exports credentials or raster tile URLs.
"""
from copy import deepcopy
from datetime import date, datetime, timezone
import math
import logging
from time import monotonic
from uuid import uuid4

logger = logging.getLogger(__name__)


def safe(value):
    """Keep scientific values JSON-compatible; omit credentials recursively."""
    if isinstance(value, dict):
        return {k: safe(v) for k, v in value.items()
                if not any(s in k.casefold() for s in
                           ("token", "secret", "key", "tileurl", "map_action"))}
    if isinstance(value, list):
        return [safe(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def failure(message):
    return {"status": "error", "message": message}


def validate(name, args, declarations):
    decl = next((d for d in declarations if d["name"] == name), None)
    if not decl:
        return "Ferramenta não registada."
    if not isinstance(args, dict):
        return "Os parâmetros devem ser um objecto."
    schema = decl["parameters"]
    for required in schema.get("required", []):
        if required not in args:
            return f"Parâmetro obrigatório: {required}."
    for key, value in args.items():
        prop = schema.get("properties", {}).get(key)
        if prop is None:
            return f"Parâmetro não suportado: {key}."
        if value is None and key not in schema.get("required", []):
            continue
        kind = prop.get("type")
        valid = {"string": isinstance(value, str),
                 "number": isinstance(value, (int, float)) and not isinstance(value, bool),
                 "integer": isinstance(value, int) and not isinstance(value, bool),
                 "boolean": isinstance(value, bool),
                 "object": isinstance(value, dict), "array": isinstance(value, list)}
        if not valid.get(kind, False):
            return f"Tipo inválido: {key}."
        if isinstance(value, (int, float)) and not math.isfinite(value):
            return f"Valor não finito: {key}."
        if prop.get("enum") and value not in prop["enum"]:
            return f"Opção inválida: {key}."
        if "date" in key:
            try:
                date.fromisoformat(value)
            except (ValueError, TypeError):
                return f"Data inválida: {key}. Use YYYY-MM-DD."
    for start, end in (("start_date", "end_date"), ("start_date_1", "end_date_1"),
                       ("start_date_2", "end_date_2")):
        if args.get(start) and args.get(end) and args[start] >= args[end]:
            return "A data final deve ser posterior à inicial."
    for key, lo, hi in (("lat", -90, 90), ("lon", -180, 180),
                        ("score_threshold", 0, 1), ("max_slope_deg", 0, 90)):
        if key in args and not lo <= args[key] <= hi:
            return f"{key} deve estar entre {lo} e {hi}."
    for key in ("interval_m", "density_radius_m"):
        if key in args and args[key] <= 0:
            return f"{key} deve ser positivo."
    return None


async def execute_tool(name, args, context, declarations, implementation):
    started = monotonic()
    evidence = context.setdefault("_execution_evidence", [])
    problem = validate(name, args, declarations)
    if len(evidence) >= 16:
        problem = "Limite de 16 ferramentas por pedido atingido. Reduza a análise."
    period = context.get("temporalWindow") or {}
    if period and not problem:
        try:
            start, end = period.get("startDate"), period.get("endDate")
            if start and end and date.fromisoformat(start) >= date.fromisoformat(end):
                problem = "A data final deve ser posterior à inicial."
        except (ValueError, TypeError):
            problem = "Período de análise inválido. Use YYYY-MM-DD."
    if context.get("_aoi_error") and name != "resolve_aoi":
        problem = "Análise bloqueada: a área de estudo não foi validada."
    if name == "resolve_aoi":
        context.pop("_gaul_geometry_cache", None)
        context.pop("_administrative_metadata", None)
    if problem:
        output = failure(problem)
    else:
        try:
            output = await implementation(name, args, context)
            if not isinstance(output, dict):
                output = failure("A ferramenta devolveu um resultado inválido.")
        except Exception as exc:
            logger.error("Agent tool %s raised an unexpected %s", name, type(exc).__name__)
            output = failure("A ferramenta encontrou um erro interno. Repita o pedido ou contacte o suporte com o dossiê.")
    administrative = context.get("_administrative_metadata")
    if administrative and name not in ("list_public_datasets", "list_administrative_units", "resolve_aoi") and output.get("status") == "success":
        from agent.public_datasets import source
        output["boundarySource"] = source(administrative["dataset"])
        output["administrativeSelection"] = dict(administrative)
    action = output.get("map_action") or {}
    if action.get("type") == "ADD_LAYER" and not action.get("tileUrl"):
        output = failure("A ferramenta não devolveu uma camada raster válida.")
    success = output.get("status") == "success" and not output.get("error")
    action = output.get("map_action") or {}
    if name == "resolve_aoi":
        if success:
            previous = context.get("aoi") or {}
            # Drop a district/geometry from the previous province when changing AOI.
            context["aoi"] = {"label": output.get("label"),
                              "province": output.get("province", args.get("province")),
                              "district": output.get("district", args.get("district")),
                              "geometry": action.get("geometry")}
            context.pop("_aoi_error", None)
        else:
            context["_aoi_error"] = True
    if not success:
        output.pop("map_action", None)
    record = {"id": f"evidence_{len(evidence) + 1}", "tool": name,
              "status": "success" if success else "error",
              "parameters": safe(args), "scope": safe(deepcopy(context.get("aoi") or {})),
              "period": safe(output.get("period") or ({"year": output["year"]} if output.get("year") else
                              {"A": output["periodA"], "B": output["periodB"]} if output.get("periodA") else
                              context.get("temporalWindow") or {})),
              "executedAt": datetime.now(timezone.utc).isoformat(),
              "durationMs": round((monotonic() - started) * 1000),
              "source": safe(output.get("source")),
              "result": safe({k: v for k, v in output.items()
                              if k not in ("provenance", "geojson", "features")})}
    evidence.append(record)
    output["provenance"] = {k: v for k, v in record.items() if k != "result"}
    return output


def build_dossier(result, context):
    """Attach verifiable evidence and normalise completion across providers."""
    records = context.get("_execution_evidence", [])
    # Legacy/test dispatchers can still supply explicit tool outputs.
    if not records:
        for run in result.get("runs", []):
            output = run.get("output", {})
            records.append({"id": f"evidence_{len(records)+1}", "tool": run.get("tool"),
                            "status": "success" if output.get("status") == "success" else "error",
                            "parameters": {}, "scope": safe(context.get("aoi") or {}),
                            "period": safe(context.get("temporalWindow") or {}),
                            "source": safe(output.get("source")), "result": safe(output)})
    analytical = [r for r in records if r["tool"] not in ("resolve_aoi", "list_public_datasets", "list_administrative_units")]
    successful = [r for r in analytical if r["status"] == "success"]
    failed = [r for r in records if r["status"] != "success"]
    warnings = []
    if failed:
        result["status"] = "partial" if successful else "error"
        warnings.append("Há ferramentas sem resultado; a síntese não valida os indicadores em falta.")
        result["synthesis"] = "Análise incompleta. " + str(result.get("synthesis") or "")
    elif not analytical and result.get("status") == "completed":
        result["status"] = "unverified"
        warnings.append("Resposta sem execução de ferramentas analíticas; não constitui um resultado calculado.")
    for record in records:
        warning = record.get("result", {}).get("warning")
        if warning and str(warning) not in warnings:
            warnings.append(str(warning))
    if any(not r.get("source") for r in successful):
        warnings.append("Algumas ferramentas não comunicam a fonte no resultado. Consulte a metodologia antes de reutilizar os valores.")
    if any(r["tool"] == "run_multicriteria_ahp" for r in analytical):
        warnings.append("Favorabilidade é um modelo exploratório. A designação AHP exige matriz de comparação e razão de consistência verificadas.")
    for step, record in zip(result.get("steps", []), records):
        step["status"] = "completed" if record["status"] == "success" else "error"
        if record["status"] != "success":
            step["resultSummary"] = record["result"].get("message", "Sem resultado verificável.")
    result["intelligence"] = {"version": "1.0", "id": str(uuid4()),
                              "generatedAt": datetime.now(timezone.utc).isoformat(),
                              "status": result.get("status"),
                              "scope": safe(context.get("aoi") or {}),
                              "period": safe(context.get("temporalWindow") or {}),
                              "successfulTools": len(successful), "failedTools": len(failed),
                              "evidence": records, "limitations": warnings}
    return result


