"""
GeoMoz AI Agent — ReAct Planner & Orchestrator.
Uses Gemini 2.0 Flash Function Calling with fallback to deterministic spatial heuristics.
"""

import os
from copy import deepcopy
from agent.intelligence import build_dossier
import json
import logging
import unicodedata
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from agent.registry import TOOL_DECLARATIONS, ToolDispatcher
from agent.geology_intent import is_catalogue_request, is_geology_followup, resolve_geology_scope

logger = logging.getLogger(__name__)

def _fold_text(value: str) -> str:
    """Normalise Portuguese accents for routing and province recognition."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(c)
    )


def _is_catalogue_geology_request(message: str) -> bool:
    """Route geology-only questions to verified data, not expensive GEE/LLM calls."""
    text = _fold_text(message)
    catalogue = (
        "geol", "litolog", "formac", "rocha", "granito", "basalto", "gnaiss",
        "calcario", "quartzito", "gabro", "xisto", "arenito", "litoestratigraf",
    )
    advanced = (
        "ouro", "cobre", "mineraliza", "prospect", "prospec", "favorabil",
        "targeting", "hidroterm", "indice", "espectral", "lineament",
        "fractur", "falha", "tecton", "sismic", "anomalia",
    )
    return any(word in text for word in catalogue) and not any(
        word in text for word in advanced
    )



SYSTEM_PROMPT = """És o GeoMoz Agent, a Inteligência Geoespacial da Geolithica especializada na geologia, 
hidrologia e território de Moçambique.

O teu objetivo é resolver os pedidos do utilizador montando planos determinísticos de análise espacial.
NUNCA inventes dados imaginários. Usa as ferramentas fornecidas para calcular os dados.

Diretrizes:
1. Respeita a Área de Estudo (AOI) e o contexto atual do mapa.
2. Planeia a sequência de ferramentas lógicas (ex: Delimitação -> Satélite -> Terreno -> Multi-critério -> Estatísticas).
3. Na conclusão técnica, cita apenas valores devolvidos por ferramentas bem-sucedidas. Distingue observações, inferências e limitações. Uma imagem no mapa não prova uma hipótese.
6. Não calcules uma percentagem de confiança sem validação. Não apresentes índices espectrais como reservas minerais, NDVI como biomassa medida ou suscetibilidade como previsão de cheia.
7. Se faltarem área, período ou dados indispensáveis, solicita-os. Não substituas silenciosamente a área por Maputo. Não afirmes estatísticas zonais sem cálculo real.
4. Consultas geológicas devem começar por get_geology_units; nunca afirmes a presença de uma litologia ou jazigo sem resultados dessa ferramenta. Se houver falha de leitura, informa-a sem fabricar números.
5. Quando o utilizador pedir só unidades, litologias, formações ou geologia no mapa, não lances índices GEE ou targeting mineral desnecessários.
"""


class GeoMozAgent:
    """Autonomous Geospatial Agent with ReAct planning."""

    @classmethod
    async def process_user_request(cls, user_message, current_map_state,
                                   chat_history=None, gemini_api_key=None,
                                   openai_api_key=None, provider="auto", model=None):
        # Each request owns its evidence and mutable scope. Never mutate caller state.
        context = deepcopy(current_map_state) if isinstance(current_map_state, dict) else {}
        context.pop("_execution_evidence", None)
        context.pop("_aoi_error", None)
        result = await cls._process_user_request(
            user_message, context, chat_history, gemini_api_key,
            openai_api_key, provider, model)
        return build_dossier(result, context)

    @classmethod
    async def _process_user_request(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any],
        chat_history: Optional[List[Dict[str, str]]] = None,
        gemini_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        provider: Optional[str] = "auto",
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Orchestrate plan, execute tools, and return map actions and synthesis."""
        current_map_state = current_map_state if isinstance(current_map_state, dict) else {}
        # Published GeoMoz geology is a deterministic public catalogue. Even if
        # an OpenAI/Gemini key is configured, catalogue-only questions must not
        # depend on third-party model availability or Google Earth Engine login.
        context = current_map_state.get("agentContext")
        if is_catalogue_request(user_message) or is_geology_followup(user_message, context):
            return await cls._run_heuristic_planner(user_message, current_map_state)

        clean_openai = (openai_api_key or os.getenv("OPENAI_API_KEY") or "").strip().strip("`").strip('"').strip("'")
        clean_gemini = (gemini_api_key or os.getenv("GEMINI_API_KEY") or "").strip().strip("`").strip('"').strip("'")
        chosen_provider = (provider or "auto").lower()

        # 1. Explicit or auto-detected OpenAI
        if chosen_provider == "openai" or (chosen_provider == "auto" and clean_openai and (clean_openai.startswith("sk-") or not clean_gemini)):
            if clean_openai and clean_openai != "SUA_CHAVE_AQUI":
                try:
                    return await cls._run_openai_react_loop(
                        user_message=user_message,
                        current_map_state=current_map_state,
                        api_key=clean_openai,
                        chat_history=chat_history,
                        model=model
                    )
                except Exception as exc:
                    logger.warning("OpenAI API call failed (%s). Falling back.", exc)

        # 2. Explicit or fallback Gemini
        if clean_gemini and clean_gemini != "SUA_CHAVE_AQUI":
            try:
                return await cls._run_gemini_react_loop(
                    user_message=user_message,
                    current_map_state=current_map_state,
                    api_key=clean_gemini,
                    chat_history=chat_history,
                    model=model
                )
            except Exception as exc:
                logger.warning("Gemini API call failed (%s). Falling back to spatial heuristic planner.", exc)

        # 3. Resilient heuristic planner (zero API key / offline fallback)
        return await cls._run_heuristic_planner(user_message, current_map_state)

    @classmethod
    async def _run_openai_react_loop(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any],
        api_key: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute ReAct cycle via OpenAI API using native Function Calling / Tools."""
        import openai
        client = openai.AsyncOpenAI(api_key=api_key)
        chosen_model = model if model and model.startswith(("gpt-", "o3", "o4")) else "gpt-4o"

        aoi = current_map_state.get("aoi") or {}
        if not isinstance(aoi, dict):
            aoi = {}
        aoi_label = aoi.get("label") or "Moçambique (Geral)"
        temporal = current_map_state.get("temporalWindow", {})
        context_str = f"Contexto Atual do Mapa: AOI='{aoi_label}', Período={temporal}"

        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": decl["name"],
                    "description": decl["description"],
                    "parameters": decl["parameters"],
                }
            }
            for decl in TOOL_DECLARATIONS
        ]

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ]

        # Multi-turn context memory
        if chat_history:
            for h in chat_history:
                role = "user" if (h.get("role") == "user" or h.get("sender") == "user") else "assistant"
                txt = h.get("content") or h.get("text") or ""
                if txt:
                    messages.append({"role": role, "content": txt})

        messages.append({
            "role": "user",
            "content": f"{context_str}\n\nInstrução do Utilizador:\n{user_message}"
        })

        steps_log = []
        map_actions = []
        executed_runs = []

        for turn in range(5):
            call_kwargs: Dict[str, Any] = {
                "model": chosen_model,
                "messages": messages,
                "tools": openai_tools,
                "tool_choice": "auto",
            }
            # Reasoning models (o1, o3-mini) do not accept temperature
            if not chosen_model.startswith(("o", "gpt-5")):
                call_kwargs["temperature"] = 0.2

            response = await client.chat.completions.create(**call_kwargs)

            choice = response.choices[0]
            msg = choice.message

            if not msg.tool_calls:
                final_text = msg.content or "Análise geoespacial concluída com sucesso."
                return {
                    "status": "completed",
                    "provider": "openai",
                    "model": response.model,
                    "plan": [s["name"] for s in steps_log],
                    "steps": steps_log,
                    "map_actions": map_actions,
                    "runs": executed_runs,
                    "synthesis": final_text
                }

            # Append the assistant's tool-calls message
            messages.append(msg)

            for tool_call in msg.tool_calls:
                tool_name = tool_call.function.name
                try:
                    tool_args = json.loads(tool_call.function.arguments or "{}")
                except Exception:
                    tool_args = {}

                step_entry = {
                    "id": f"step_{len(steps_log)+1}",
                    "name": f"Executar {tool_name.replace('_', ' ').title()}",
                    "status": "running"
                }
                steps_log.append(step_entry)

                tool_output = await ToolDispatcher.execute(tool_name, tool_args, current_map_state)
                step_entry["status"] = "error" if tool_output.get("status") in ("error", "warning") or tool_output.get("error") else "completed"
                step_entry["resultSummary"] = str(
                    tool_output.get("mean")
                    or tool_output.get("areaKm2")
                    or tool_output.get("meanSoilMoisture")
                    or tool_output.get("meanSoilLoss")
                    or "Concluído"
                )

                if "map_action" in tool_output:
                    map_actions.append(tool_output["map_action"])
                executed_runs.append({"tool": tool_name, "output": tool_output})

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_output, ensure_ascii=False)
                })

        return {
            "status": "completed",
            "provider": "openai",
            "model": chosen_model,
            "plan": [s["name"] for s in steps_log],
            "steps": steps_log,
            "map_actions": map_actions,
            "runs": executed_runs,
            "synthesis": "Análise geoespacial multi-critério processada pelo GeoMoz Agent."
        }

    @classmethod
    async def _run_gemini_react_loop(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any],
        api_key: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute ReAct cycle via Gemini API using Function Calling."""
        clean_key = (api_key or "").strip().strip("`").strip('"').strip("'")

        # Context injection
        aoi = current_map_state.get("aoi") or {}
        if not isinstance(aoi, dict):
            aoi = {}
        aoi_label = aoi.get("label") or "Moçambique (Geral)"
        context_str = f"Contexto Atual do Mapa: AOI='{aoi_label}', Período='{current_map_state.get('temporalWindow', {})}'"

        contents = []
        if chat_history:
            for h in chat_history:
                role = "user" if (h.get("role") == "user" or h.get("sender") == "user") else "model"
                txt = h.get("content") or h.get("text") or ""
                if txt:
                    contents.append({"role": role, "parts": [{"text": txt}]})
        contents.append(
            {"role": "user", "parts": [{"text": f"{context_str}\n\nInstrução do Utilizador:\n{user_message}"}]}
        )

        gemini_tools = [{"function_declarations": TOOL_DECLARATIONS}]

        steps_log = []
        map_actions = []
        executed_runs = []

        candidate_models = (
            [model] if model and model.startswith("gemini-")
            else ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"]
        )
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

            parts = candidates[0].get("content", {}).get("parts", [])
            calls = [p["functionCall"] for p in parts if p.get("functionCall")]
            if not calls:
                final_text = "\n".join(p.get("text", "") for p in parts)
                return {"status": "completed", "provider": "gemini", "model": working_model,
                        "plan": [s["name"] for s in steps_log], "steps": steps_log,
                        "map_actions": map_actions, "runs": executed_runs,
                        "synthesis": final_text or "Sem síntese devolvida pelo modelo."}
            contents.append(candidates[0]["content"])
            responses = []
            for call in calls:
                tool_name = call.get("name", "")
                tool_args = call.get("args", {})
                tool_output = await ToolDispatcher.execute(tool_name, tool_args, current_map_state)
                success = tool_output.get("status") == "success"
                steps_log.append({"id": f"step_{len(steps_log)+1}",
                                  "name": f"Executar {tool_name.replace('_', ' ')}",
                                  "status": "completed" if success else "error",
                                  "resultSummary": str(tool_output.get("message") or tool_output.get("mean") or "Resultado registado")})
                if success and tool_output.get("map_action"):
                    map_actions.append(tool_output["map_action"])
                executed_runs.append({"tool": tool_name, "output": tool_output})
                responses.append({"functionResponse": {"name": tool_name,
                                                       "response": {"output": tool_output}}})
            contents.append({"role": "user", "parts": responses})

        # Fallback if loop finishes without text
        return {
            "status": "completed",
            "plan": [s["name"] for s in steps_log],
            "steps": steps_log,
            "map_actions": map_actions,
            "runs": executed_runs,
            "synthesis": "Análise geoespacial executada através do catálogo de ferramentas do GeoMoz."
        }

    @classmethod
    async def _run_heuristic_planner(
        cls,
        user_message: str,
        current_map_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Deterministic fallback planner when Gemini API key is unavailable."""
        msg_lower = user_message.casefold()
        folded_message = _fold_text(user_message)

        aoi = current_map_state.get("aoi") or {}
        if not isinstance(aoi, dict):
            aoi = {}
        province = aoi.get("province")
        district = aoi.get("district")

        # Detect geographical mentions in prompt
        provinces_mz = ["maputo", "gaza", "inhambane", "sofala", "manica", "tete", "zambezia", "nampula", "cabo delgado", "niassa"]
        for p in provinces_mz:
            if p in folded_message:
                if _fold_text(str(aoi.get("province") or "")) != p:
                    district = None
                province = p.title()
                break

        steps_log = []
        map_actions = []
        executed_runs = []

        # Follow-up commands retain the previous geological query instead of
        # falling through to the default NDVI/agriculture workflow.
        if is_catalogue_request(user_message) or is_geology_followup(
            user_message, current_map_state.get("agentContext")
        ):
            scope = resolve_geology_scope(user_message, current_map_state)
            geo_context = current_map_state
            geo_context["aoi"] = {
                "province": scope["province"], "district": scope["district"],
                "geometry": scope["geometry"],
                "label": ", ".join(filter(None, [scope["district"], scope["province"]])) or "Moçambique",
            }
            result = await ToolDispatcher.execute(
                "get_geology_units",
                {"province": scope["province"], "district": scope["district"],
                 "filter_str": scope["filter_str"]},
                geo_context,
            )
            if result.get("status") != "success":
                message = result.get("message", "O catálogo geológico está indisponível.")
                return {
                    "status": "error", "provider": "deterministic-geology",
                    "plan": ["Consultar a base geológica do GeoMoz"],
                    "steps": [{"id": "geology", "name": "Consulta ao catálogo geológico",
                               "status": "error", "resultSummary": message}],
                    "map_actions": [], "runs": [], "agent_context": scope,
                    "synthesis": message,
                }
            return {
                "status": "completed", "provider": "deterministic-geology",
                "plan": ["Consultar e quantificar unidades geológicas reais"],
                "steps": [{"id": "geology", "name": "Consulta espacial à carta geológica",
                           "status": "completed",
                           "resultSummary": f'{result.get("unitsCount", 0)} polígonos reais'}],
                "map_actions": [result["map_action"]] if result.get("map_action") else [],
                "runs": [{"tool": "get_geology_units",
                          "output": {k: v for k, v in result.items() if k != "map_action"}}],
                "agent_context": scope,
                "synthesis": result.get("summary", "Consulta geológica concluída."),
            }

        # Deterministic domain plans use the same audited tools as model plans.
        text = folded_message
        if any(w in text for w in ("inunda", "cheia", "alagamento", "flood")):
            plan = [("calculate_index", {"index": "mndwi"}, "Água superficial (MNDWI)"),
                    ("get_flood_susceptibility", {}, "Triagem topográfica de cheias"),
                    ("get_river_network", {}, "Rede hidrográfica")]
        elif any(w in text for w in ("smap", "humidade", "umidade", "stress hidrico")):
            plan = [("get_soil_moisture_smap", {}, "Humidade volumétrica do solo (SMAP)")]
        elif any(w in text for w in ("rusle", "erosao")):
            period_start = str((current_map_state.get("temporalWindow") or {}).get("startDate") or "2024")
            year = int(period_start[:4]) if period_start[:4].isdigit() else 2024
            plan = [("get_water_erosion_rusle", {"year": year}, "Erosão hídrica modelada (RUSLE)")]
        elif any(w in text for w in ("incend", "fogo", "wildfire")):
            plan = [("get_wildfire_activity", {}, "Actividade de incêndios")]
        elif any(w in text for w in ("ouro", "cobre", "mineral", "prospec", "hidroterm")):
            mineral = "copper" if "cobre" in text else "gold"
            plan = [("get_geology_units", {"province": province, "district": district}, "Carta geológica"),
                    ("calculate_index", {"index": "clay"}, "Índice espectral de alteração"),
                    ("extract_lineaments", {}, "Densidade de lineamentos"),
                    ("run_mineral_targeting", {"mineral": mineral}, "Favorabilidade mineral exploratória")]
        elif any(w in text for w in ("chuva", "precipit", "pluvio")):
            plan = [("get_precipitation_chirps", {}, "Precipitação acumulada (CHIRPS)")]
        elif any(w in text for w in ("ahp", "solar", "subterranea", "hidrogeolog", "aptidao")):
            theme = "solar" if "solar" in text else "groundwater"
            plan = [("run_multicriteria_ahp", {"theme": theme}, "Sobreposição territorial ponderada")]
        elif any(w in text for w in ("alphaearth", "embedding")):
            plan = [("run_alphaearth_pca", {}, "Representação de embeddings AlphaEarth")]
        elif any(w in text for w in ("lineament", "fratur", "fractur", "falha")):
            plan = [("extract_lineaments", {}, "Densidade de lineamentos do relevo")]
        elif any(w in text for w in ("alteracao temporal", "mudanca temporal", "desmat", "desflorest")):
            plan = [("detect_temporal_change", {}, "Comparação temporal")]
        elif any(w in text for w in ("decliv", "slope")):
            plan = [("calculate_slope", {}, "Declive do terreno")]
        elif any(w in text for w in ("curvas", "elevacao", "altimetr")):
            plan = [("get_elevation_dem", {}, "Curvas de nível do terreno")]
        elif any(w in text for w in ("agric", "vegeta", "ndvi", "biomassa", "cultivo")):
            plan = [("calculate_index", {"index": "ndvi"}, "Vigor da vegetação (NDVI)")]
        else:
            return {"status": "needs_input", "steps": [], "runs": [], "map_actions": [],
                    "synthesis": "Indique a análise pretendida: geologia, vegetação, precipitação, relevo, humidade do solo ou potencial hidrogeológico. Para outros pedidos, configure um fornecedor de IA nas definições."}

        if not province and not (aoi.get("geometry") or aoi.get("customGeometry")):
            return {"status": "needs_input", "steps": [], "runs": [], "map_actions": [],
                    "synthesis": "Seleccione uma província, distrito ou desenhe uma área de estudo para iniciar a análise."}

        async def execute_recorded(name, args, label):
            output = await ToolDispatcher.execute(name, args, current_map_state)
            executed_runs.append({"tool": name, "output": output})
            success = output.get("status") == "success"
            values = [f"{key}: {output[key]}" for key in
                      ("mean", "areaKm2", "unitsCount", "meanRainfallMm", "meanSoilMoisture", "meanSoilLoss")
                      if output.get(key) is not None]
            summary = (output.get("summary") or "; ".join(values) or "Camada disponível no mapa.") if success else output.get("message", "Sem resultado.")
            steps_log.append({"id": f"step_{len(steps_log)+1}", "name": label,
                              "status": "completed" if success else "error", "resultSummary": summary})
            if success and output.get("map_action"):
                map_actions.append(output["map_action"])
            return success

        # A drawn polygon is already an explicit scope; never replace it by an
        # administrative boundary unless the prompt selects a new province.
        drawn = aoi.get("geometry") or aoi.get("customGeometry")
        if not (drawn and province == aoi.get("province")):
            if not await execute_recorded("resolve_aoi", {"province": province, "district": district}, "Delimitação da área de estudo"):
                return {"status": "error", "steps": steps_log, "runs": executed_runs,
                        "map_actions": [], "synthesis": steps_log[-1]["resultSummary"]}

        for name, args, label in plan:
            await execute_recorded(name, args, label)
        synthesis = "Resultados das ferramentas:\n" + "\n".join(
            f"- {step['name']}: {step['resultSummary']}" for step in steps_log)
        return {"status": "completed", "provider": "deterministic",
                "plan": [step["name"] for step in steps_log], "steps": steps_log,
                "map_actions": map_actions, "runs": executed_runs, "synthesis": synthesis}
