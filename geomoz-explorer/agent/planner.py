"""
GeoMoz AI Agent — ReAct Planner & Orchestrator.
Uses Gemini 2.0 Flash Function Calling with fallback to deterministic spatial heuristics.
"""

import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from agent.registry import TOOL_DECLARATIONS, ToolDispatcher

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """És o GeoMoz Agent, a Inteligência Geoespacial da Geolithica especializada na geologia, 
hidrologia e território de Moçambique.

O teu objetivo é resolver os pedidos do utilizador montando planos determinísticos de análise espacial.
NUNCA inventes dados imaginários. Usa as ferramentas fornecidas para calcular os dados.

Diretrizes:
1. Respeita a Área de Estudo (AOI) e o contexto atual do mapa.
2. Planeia a sequência de ferramentas lógicas (ex: Delimitação -> Satélite -> Terreno -> Multi-critério -> Estatísticas).
3. Na conclusão técnica, apresenta o parecer científico fundamentado, citando valores calculados, litologias e recomendações.
"""


class GeoMozAgent:
    """Autonomous Geospatial Agent with ReAct planning."""

    @classmethod
    async def process_user_request(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any],
        chat_history: Optional[List[Dict[str, str]]] = None,
        gemini_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Orchestrate plan, execute tools, and return map actions and synthesis."""
        # Explicit sensor requests and map follow-ups take precedence over
        # stochastic model planning. Their outputs are derived from real tool results.
        from agent.grounded import run_explicit_intent
        grounded = await run_explicit_intent(user_message, current_map_state)
        if grounded is not None:
            return grounded

        raw_key = gemini_api_key or os.getenv("GEMINI_API_KEY") or ""
        clean_key = raw_key.strip().strip("`").strip('"').strip("'")

        if clean_key and clean_key != "SUA_CHAVE_AQUI":
            try:
                return await cls._run_gemini_react_loop(user_message, current_map_state, clean_key)
            except Exception as exc:
                logger.warning("Gemini API call failed (%s). Falling back to spatial heuristic planner.", exc)

        # Resilient heuristic planner
        return await cls._run_heuristic_planner(user_message, current_map_state)

    @classmethod
    async def _run_gemini_react_loop(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any],
        api_key: str
    ) -> Dict[str, Any]:
        """Execute ReAct cycle via Gemini API using Function Calling."""
        clean_key = (api_key or "").strip().strip("`").strip('"').strip("'")

        # Context injection
        aoi = current_map_state.get("aoi", {})
        aoi_label = aoi.get("label") or "Moçambique (Geral)"
        context_str = f"Contexto Atual do Mapa: AOI='{aoi_label}', Período='{current_map_state.get('temporalWindow', {})}'"

        contents = [
            {"role": "user", "parts": [{"text": f"{context_str}\n\nInstrução do Utilizador:\n{user_message}"}]}
        ]

        gemini_tools = [{"function_declarations": TOOL_DECLARATIONS}]

        steps_log = []
        map_actions = []
        executed_runs = []

        candidate_models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"]
        working_model = candidate_models[0]

        # Multi-turn tool calling loop (up to 5 iterations)
        for turn in range(5):
            payload = {
                "contents": contents,
                "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                "tools": gemini_tools,
                "generationConfig": {"temperature": 0.2}
            }

            result_data = None
            last_err = None

            # Try working_model, or iterate through candidates if 404
            models_to_try = [working_model] + [m for m in candidate_models if m != working_model]
            for model_cand in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_cand}:generateContent"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": clean_key,
                    }
                )

                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        result_data = json.loads(resp.read().decode("utf-8"))
                        working_model = model_cand
                        break
                except urllib.error.HTTPError as http_err:
                    last_err = http_err
                    if http_err.code == 404:
                        # Model not supported or deprecated, try next candidate
                        continue
                    elif http_err.code == 429:
                        logger.warning("Google AI Studio quota / prepayment credits depleted (429). Falling back to spatial heuristic planner.")
                        raise
                    else:
                        raise

            if result_data is None:
                if last_err:
                    raise last_err
                break

            candidates = result_data.get("candidates", [])
            if not candidates:
                break

            content = candidates[0].get("content") or {}
            calls = [p.get("functionCall") for p in content.get("parts", [])
                     if isinstance(p, dict) and p.get("functionCall")]
            if not calls:
                # The model's prose may contain unsupported quantitative claims.
                return cls._grounded_llm_summary(steps_log, executed_runs, map_actions)

            # Gemini may return parallel function calls and separate thinking parts.
            contents.append(content)
            tool_responses = []
            for func_call in calls:
                tool_name = func_call.get("name") or "unknown"
                tool_args = func_call.get("args") or {}
                step_entry = {
                    "id": "step_{}".format(len(steps_log) + 1),
                    "name": "Executar {}".format(tool_name.replace("_", " ").title()),
                    "status": "running",
                }
                steps_log.append(step_entry)
                try:
                    tool_output = await ToolDispatcher.execute(tool_name, tool_args, current_map_state)
                except Exception as exc:
                    tool_output = {"status": "error", "message": str(exc)}
                if not isinstance(tool_output, dict):
                    tool_output = {"status": "error", "message": "Resposta inválida da ferramenta"}
                ok = tool_output.get("status") == "success"
                step_entry["status"] = "completed" if ok else "error"
                numeric = tool_output.get("mean")
                step_entry["resultSummary"] = (
                    str(numeric) if isinstance(numeric, (float, int)) and not isinstance(numeric, bool)
                    else tool_output.get("message") or ("Camada disponível" if ok else "Sem dados")
                )
                if ok and isinstance(tool_output.get("map_action"), dict):
                    action = tool_output["map_action"]
                    if action.get("type") != "ADD_LAYER" or action.get("tileUrl"):
                        map_actions.append(action)
                executed_runs.append({"tool": tool_name, "args": tool_args, "output": tool_output})
                response = {"name": tool_name, "response": {"output": tool_output}}
                if func_call.get("id"):
                    response["id"] = func_call["id"]
                tool_responses.append({"functionResponse": response})

            # Gemini's REST protocol requires functionResponse inside a user turn.
            contents.append({"role": "user", "parts": tool_responses})

        # Fallback if loop finishes without text
        return cls._grounded_llm_summary(steps_log, executed_runs, map_actions)

    @staticmethod
    def _grounded_llm_summary(steps_log, executed_runs, map_actions):
        """Conclude from executed tool evidence only, never from model assertions."""
        succeeded = [r for r in executed_runs if r.get("output", {}).get("status") == "success"]
        failed = [r for r in executed_runs if r.get("output", {}).get("status") != "success"]
        evidence = []
        for item in succeeded:
            name = item.get("tool", "Ferramenta")
            output = item.get("output") or {}
            stats = []
            for key in ("mean", "unitsCount", "favorableAreaKm2", "sceneCount"):
                val = output.get(key)
                if isinstance(val, (float, int)) and not isinstance(val, bool):
                    stats.append("{}={}".format(key, val))
            evidence.append("- **{}:** {}.".format(name, ", ".join(stats) or "camada disponível"))
        for item in failed:
            output = item.get("output") or {}
            evidence.append("- **{}:** não concluído — {}.".format(
                item.get("tool", "Ferramenta"), output.get("message", "dados indisponíveis")))
        if not evidence:
            evidence = ["Nenhum cálculo geoespacial verificável foi executado."]
        note = ("\n**Nota:** produtos e indicadores espectrais isolados não confirmam depósitos, "
                "falhas ou riscos. Não inferir áreas, orientações ou valores sem medições.")
        return {
            "status": ("completed" if succeeded and not failed else
                       "partial" if succeeded else "warning"),
            "plan": [s.get("name") for s in steps_log],
            "steps": steps_log,
            "map_actions": map_actions,
            "runs": executed_runs,
            "synthesis": "### Evidências computadas\n\n" + "\n".join(evidence) + "\n\n" + note,
        }

    @classmethod
    async def _run_heuristic_planner(
        cls, user_message: str, current_map_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Safe, purpose-specific fallback when no generative model is available."""
        import unicodedata
        from agent.grounded import _step, _map_action
        msg = "".join(x for x in unicodedata.normalize("NFKD", user_message.lower())
                      if not unicodedata.combining(x))
        aoi = current_map_state.get("aoi") or {}
        label = aoi.get("label") or "Moçambique (Nacional)"
        tools = []

        if any(k in msg for k in ("inund", "cheia", "alagament", "flood")):
            tools = [
                ("calculate_index", {"index": "mndwi"}, "MNDWI — água superficial"),
                ("get_flood_susceptibility", {}, "Suscetibilidade a cheias"),
            ]
        elif any(k in msg for k in ("precipit", "chuva", "chirps", "pluvio")):
            tools = [("get_precipitation_chirps", {}, "CHIRPS — precipitação")]
        elif any(k in msg for k in ("litolog", "carta geolog", "formac", "rocha")):
            tools = [("get_geology_units", {}, "Carta geológica 1:1M")]
        elif any(k in msg for k in ("mineral", "ouro", "gold", "gossan", "cobre")):
            tools = [
                ("get_geology_units", {}, "Carta geológica 1:1M"),
                ("calculate_index", {"index": "clay"}, "Argilas — Sentinel-2"),
                ("calculate_index", {"index": "fe_oxide"}, "Óxidos de ferro — Sentinel-2"),
            ]
        elif any(k in msg for k in ("furo", "subterrane", "aquifer", "solar", "ahp")):
            theme = "solar" if "solar" in msg else "groundwater"
            tools = [("run_multicriteria_ahp", {"theme": theme}, "Análise AHP — " + theme)]
        elif any(k in msg for k in ("alphaearth", "embedding", "deepmind")):
            tools = [("run_alphaearth_pca", {}, "AlphaEarth — embeddings")]
        elif any(k in msg for k in ("ndvi", "veget", "agric", "biomassa")):
            tools = [("calculate_index", {"index": "ndvi"}, "NDVI — Sentinel-2")]
        else:
            return {
                "status": "warning", "plan": [], "steps": [], "map_actions": [], "runs": [],
                "synthesis": (
                    "Não identifiquei uma análise geoespacial suficientemente específica "
                    "para executar sem alterar o seu pedido. Indique o fenómeno ou "
                    "índice (geologia, NDVI, CHIRPS, Landsat 8, SMAP, cheias, etc.). "
                    "A AOI seleccionada permanece inalterada."),
            }

        steps, map_actions, runs = [], [], []
        for i, (tool, args, title) in enumerate(tools, 1):
            try:
                output = await ToolDispatcher.execute(tool, args, current_map_state)
            except Exception as exc:
                output = {"status": "error", "message": str(exc)}
            if not isinstance(output, dict):
                output = {"status": "error", "message": "Resposta inválida da ferramenta"}
            steps.append(_step(i, title, output))
            action = _map_action(output)
            if action:
                map_actions.append(action)
            runs.append({"tool": tool, "args": args, "output": output})

        result = cls._grounded_llm_summary(steps, runs, map_actions)
        result["synthesis"] = ("**Área de estudo preservada:** " + label +
                               "\n\n" + result["synthesis"])
        result["plan"] = [name for _, _, name in tools]
        return result
