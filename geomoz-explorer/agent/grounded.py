"""Evidence-grounded request routing for GeoMoz AI.

This module never claims a successful spatial analysis without a successful tool
response. The language model is not authorised to fabricate geospatial metrics.
"""
import re
import unicodedata
from typing import Any, Dict, Optional

from agent.registry import ToolDispatcher


def _normalize(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower())
                   if not unicodedata.combining(c))


def detect_intent(message: str) -> Optional[str]:
    msg = _normalize(message)
    if re.search(r"\b(ver|mostrar|visualizar|abrir|exibir)\b.*\bmapa\b", msg):
        return "show_map"
    if "smap" in msg or "humidade do solo" in msg or "umidade do solo" in msg:
        return "soil_moisture_smap"
    if "landsat" in msg and any(k in msg for k in
                                  ("ouro", "gold", "mineral", "hidrotermal", "argila", "oxido", "ferro", "sabins")):
        return "landsat_mineral"
    if ("ouro" in msg or "gold" in msg) and any(k in msg for k in
                                                 ("anomalia", "alteracao", "prospect", "mineral")):
        return "mineral"
    return None


def _as_number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None
    import math
    return float(value) if math.isfinite(value) else None


def _map_action(output: dict) -> Optional[dict]:
    if output.get("status") != "success":
        return None
    action = output.get("map_action")
    if not isinstance(action, dict):
        return None
    if action.get("type") == "ADD_LAYER" and not action.get("tileUrl"):
        return None
    return action


def _step(id_: int, name: str, output: dict) -> dict:
    status = output.get("status", "error")
    if status not in ("success", "warning", "error"):
        status = "error"
    value = output.get("mean")
    if _as_number(value) is not None:
        detail = "Média: {:.4f}".format(value)
    else:
        detail = output.get("message") or output.get("summary") or (
            "Resultado disponível" if status == "success" else "Sem dados válidos")
    return {
        "id": "step_{}".format(id_),
        "name": name,
        "status": "completed" if status == "success" else "error",
        "resultSummary": str(detail)[:240],
    }


def _report_line(title: str, output: dict) -> str:
    if output.get("status") != "success":
        return "- **{}:** não processado — {}.".format(
            title, output.get("message", "dados indisponíveis"))
    stat = output.get("mean")
    if _as_number(stat) is None:
        return "- **{}:** camada disponível; média não calculada. Não inferir estatísticas.".format(title)
    extra = ""
    if output.get("unit"):
        extra = " {}".format(output["unit"])
    return "- **{}:** média {:.4f}{}.".format(title, stat, extra)


async def run_explicit_intent(message: str, context: Dict[str, Any]) -> Optional[dict]:
    """Return None when this router does not recognise an explicit request."""
    intent = detect_intent(message)
    if intent is None:
        return None

    aoi = context.get("aoi") or {}
    label = aoi.get("label") or (
        ", ".join(v for v in (aoi.get("district"), aoi.get("province")) if v)
        or "Moçambique (Nacional)")
    period = context.get("temporalWindow") or {}
    start = period.get("startDate") or "2024-01-01"
    end = period.get("endDate") or "2024-12-31"

    if intent == "show_map":
        prior = context.get("priorMapActions") or []
        valid = [action for action in prior if isinstance(action, dict)
                 and action.get("type") == "ADD_LAYER" and action.get("tileUrl")]
        if not valid:
            return {
                "status": "warning", "plan": [], "steps": [],
                "map_actions": [], "runs": [],
                "synthesis": ("Não existe uma camada geoespacial válida da análise anterior "
                              "para visualizar. Execute primeiro o cálculo ou verifique a ligação ao GEE."),
            }
        return {
            "status": "completed", "plan": ["Mostrar camada anterior"],
            "steps": [{"id": "step_1", "name": "Visualizar no mapa", "status": "completed"}],
            "map_actions": valid, "runs": [],
            "synthesis": ("As {} camadas disponíveis foram enviadas ao mapa. "
                          "Os resultados anteriores não foram recalculados.").format(len(valid)),
        }

    if intent == "soil_moisture_smap":
        tools = [("get_soil_moisture_smap", {}, "Humidade superficial NASA SMAP (9 km)")]
        intro = ("### Humidade superficial do solo — NASA SMAP\n\n"
                 "**AOI:** {}  \n**Período:** {} a {}  \n"
                 "**Produto:** NASA/SMAP/SPL3SMP_E/006, banda soil_moisture_am "
                 "(fracção volumétrica; pixel nominal ~9 km).\n\n").format(label, start, end)
        outro = ("\nA humidade superficial, isoladamente, não determina o stress hídrico "
                 "agrícola: uma avaliação robusta deve comparar com uma climatologia "
                 "homóloga, precipitação e condições das culturas. "
                 "Não converter automaticamente humidade SMAP em NDVI.")
    else:
        # The user selected Landsat 8: preserve that choice strictly.
        satellite = "Landsat 8 L2" if intent == "landsat_mineral" else "Sentinel-2 L2A"
        suffix = "_l8" if intent == "landsat_mineral" else ""
        tools = [
            ("calculate_index", {"index": "clay" + suffix}, "Argilas SWIR1/SWIR2 — " + satellite),
            ("calculate_index", {"index": "fe_oxide" + suffix}, "Óxidos de ferro — " + satellite),
            ("calculate_index", {"index": "hydrothermal" + suffix}, "Indicador de alteração hidrotermal — " + satellite),
        ]
        intro = ("### Rastreio preliminar de alteração hidrotermal\n\n"
                 "**AOI:** {}  \n**Período:** {} a {}  \n"
                 "**Sensor:** {}.\n\n").format(label, start, end, satellite)
        outro = ("\n**Interpretação:** os rácios são indicadores espectrais preliminares, "
                 "sujeitos a solo exposto, vegetação, nuvens e confusão litológica. "
                 "Não representam concentração de ouro nem comprovam depósitos, "
                 "orientações de falhas, classe P90 ou área favorável sem validação "
                 "estatística e geológica adicional. Confirmar em campo e com geoquímica.")

    steps, runs, map_actions, report = [], [], [], []
    for n, (tool, args, title) in enumerate(tools, 1):
        try:
            result = await ToolDispatcher.execute(tool, args, context)
        except Exception as exc:
            result = {"status": "error", "message": str(exc)}
        if not isinstance(result, dict):
            result = {"status": "error", "message": "Ferramenta devolveu resposta inválida"}
        steps.append(_step(n, title, result))
        runs.append({"tool": tool, "args": args, "output": result})
        action = _map_action(result)
        if action:
            map_actions.append(action)
        report.append(_report_line(title, result))

    valid_count = sum(1 for run in runs if run["output"].get("status") == "success")
    status = "completed" if valid_count == len(runs) else (
        "partial" if valid_count else "warning")
    return {
        "status": status,
        "plan": [name for _, _, name in tools],
        "steps": steps,
        "map_actions": map_actions,
        "runs": runs,
        "synthesis": (intro + "\n".join(report) + "\n" + outro +
                      ("\n\n**Estado:** dados indisponíveis ou análise incompleta; "
                       "não foram geradas conclusões sobre resultados ausentes."
                       if valid_count != len(runs) else "")),
    }
