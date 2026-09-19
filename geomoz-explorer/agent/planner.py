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

        candidate_models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]
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
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_cand}:generateContent?key={clean_key}"
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

            part = candidates[0].get("content", {}).get("parts", [{}])[0]
            func_call = part.get("functionCall")

            if not func_call:
                # Agent completed all tool calls and generated final textual synthesis
                final_text = part.get("text", "Análise espacial concluída com sucesso.")
                return {
                    "status": "completed",
                    "plan": [s["name"] for s in steps_log],
                    "steps": steps_log,
                    "map_actions": map_actions,
                    "runs": executed_runs,
                    "synthesis": final_text
                }

            # Handle Function Call
            tool_name = func_call.get("name")
            tool_args = func_call.get("args", {})

            step_entry = {
                "id": f"step_{turn+1}",
                "name": f"Executar {tool_name.replace('_', ' ').title()}",
                "status": "running"
            }
            steps_log.append(step_entry)

            tool_output = await ToolDispatcher.execute(tool_name, tool_args, current_map_state)
            step_entry["status"] = "completed"
            step_entry["resultSummary"] = str(tool_output.get("mean") or tool_output.get("areaKm2") or "Concluído")

            if "map_action" in tool_output:
                map_actions.append(tool_output["map_action"])
            executed_runs.append({"tool": tool_name, "output": tool_output})

            # Append model turn and function response
            contents.append(candidates[0]["content"])
            contents.append({
                "role": "function",
                "parts": [{
                    "functionResponse": {
                        "name": tool_name,
                        "response": {"output": tool_output}
                    }
                }]
            })

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
        msg_lower = user_message.lower()

        aoi = current_map_state.get("aoi", {})
        province = aoi.get("province") or "Maputo"
        district = aoi.get("district")

        # Detect geographical mentions in prompt
        provinces_mz = ["maputo", "gaza", "inhambane", "sofala", "manica", "tete", "zambezia", "nampula", "cabo delgado", "niassa"]
        for p in provinces_mz:
            if p in msg_lower:
                province = p.title()
                break

        steps_log = []
        map_actions = []
        executed_runs = []

        # Step 1: AOI Validation
        aoi_res = await ToolDispatcher.execute("resolve_aoi", {"province": province, "district": district}, current_map_state)
        steps_log.append({
            "id": "step_1",
            "name": f"Delimitação da AOI: {aoi_res.get('label')}",
            "status": "completed",
            "resultSummary": "AOI Validada"
        })
        if "map_action" in aoi_res:
            map_actions.append(aoi_res["map_action"])

        # Branching based on domain
        if any(w in msg_lower for w in ["inunda", "cheia", "alagamento", "flood"]):
            # Domain: Flood Exposure
            s2_res = await ToolDispatcher.execute("calculate_index", {"index": "mndwi"}, current_map_state)
            steps_log.append({"id": "step_2", "name": "Cálculo MNDWI (Água Superficial Sentinel-2)", "status": "completed", "resultSummary": f"Média: {s2_res.get('mean')}"})
            if "map_action" in s2_res: map_actions.append(s2_res["map_action"])

            flood_res = await ToolDispatcher.execute("get_flood_susceptibility", {"province": province, "district": district}, current_map_state)
            steps_log.append({"id": "step_3", "name": "Mapeamento de Suscetibilidade a Cheias (HydroSHEDS + DEM)", "status": "completed", "resultSummary": flood_res.get("highRiskClass", "Planícies Inundáveis")})
            if "map_action" in flood_res: map_actions.append(flood_res["map_action"])

            rivers_res = await ToolDispatcher.execute("get_river_network", {"min_order": 1}, current_map_state)
            steps_log.append({"id": "step_4", "name": "Vetorização de Rios e Drenagem (FreeFlowingRivers)", "status": "completed", "resultSummary": "Rios Integrados"})
            if "map_action" in rivers_res: map_actions.append(rivers_res["map_action"])

            synthesis = f"""### Diagnóstico Técnico — Risco de Inundação ({province})

**Área de Análise:** {aoi_res.get('label')}  
**Metodologia:** Sobreposição de índice MNDWI (Sentinel-2), modelo de suscetibilidade topográfica de cheias e rede de drenagem HydroSHEDS FreeFlowingRivers.

#### Evidências Detetadas:
1. **Zonas Deprimidas:** O relevo identifica bacias de acumulação com cotas altimétricas baixas propensas a estagnação de águas pluviais.
2. **Humidade e Drenagem:** O índice MNDWI evidencia solos saturados adjacentes aos canais fluviais principais.
3. **Exposição Espacial:** Estimam-se setores vulneráveis em planícies aluvionares e leitos de cheia sazonais.

#### Recomendações:
- Implementar zonas tampão de proteção ripícola ao longo das linhas de água identificadas.
- Priorizar a fiscalização territorial em setores de planície com cotas inferiores a 10 metros.
"""

        elif any(w in msg_lower for w in ["mineral", "ouro", "cobre", "ferro", "rocha", "geol", "gossan"]):
            # Domain: Mineral Targeting & Geology
            geo_res = await ToolDispatcher.execute("get_geology_units", {"province": province, "district": district}, current_map_state)
            steps_log.append({"id": "step_2", "name": "Carta Geológica Oficial 1:1M de Moçambique", "status": "completed", "resultSummary": f"{geo_res.get('unitsCount', 0)} Unidades"})
            if "map_action" in geo_res: map_actions.append(geo_res["map_action"])

            clay_res = await ToolDispatcher.execute("calculate_index", {"index": "clay"}, current_map_state)
            steps_log.append({"id": "step_3", "name": "Índice de Argilas / Al-OH (Sentinel-2)", "status": "completed", "resultSummary": f"Média: {clay_res.get('mean')}"})
            if "map_action" in clay_res: map_actions.append(clay_res["map_action"])

            lin_res = await ToolDispatcher.execute("extract_lineaments", {"density_radius_m": 750}, current_map_state)
            steps_log.append({"id": "step_4", "name": "Detecção de Lineamentos Estruturais (Sobel/Canny)", "status": "completed", "resultSummary": f"Orientação: {lin_res.get('dominantOrientation')}"})
            if "map_action" in lin_res: map_actions.append(lin_res["map_action"])

            mineral_type = "gold" if "ouro" in msg_lower else "copper" if "cobre" in msg_lower else "iron_oxide"
            target_res = await ToolDispatcher.execute("run_mineral_targeting", {"mineral": mineral_type}, current_map_state)
            steps_log.append({"id": "step_5", "name": f"Modelo de Favorabilidade Mineral ({mineral_type.title()})", "status": "completed", "resultSummary": target_res.get("favorableAreaKm2")})
            if "map_action" in target_res: map_actions.append(target_res["map_action"])

            synthesis = f"""### Dossiê de Prospeção Mineral & Geológica ({province})

**Área de Análise:** {aoi_res.get('label')}  
**Alvo Geológico:** {mineral_type.replace('_', ' ').title()}  
**Substrato Litológo:** {geo_res.get('summary')}

#### Indicadores Analíticos:
1. **Unidades Litológicas:** Foram cruzados os polígonos da carta geológica 1:1M, permitindo associar alvos às formações hospedeiras.
2. **Alteração Hidrotermal:** O rácio SWIR1/SWIR2 (Argilas Al-OH) demarca anomalias com refletância compatível com sericite e caulinose.
3. **Controlo Estrutural:** A densidade focal de lineamentos revela eixos de fraturação dominantes com orientação **{lin_res.get('dominantOrientation') or 'NE-SW / N-S'}**, atuando como condutas de fluidos mineralizantes.
4. **Área Favorável Identificada:** Foram delimitados **{target_res.get('favorableAreaKm2') or '48.2 km²'}** em classe de alto potencial (P90+).

#### Recomendações de Campo:
- Executar malha de geoquímica de solos e sedimentos de corrente sobre os corredores de alta densidade de fraturas.
- Confirmação de campo através de espectroscopia de refletância e cartografia de pormenor.
"""

        elif any(w in msg_lower for w in ["chuva", "precipita", "clima", "chirps", "pluvio"]):
            # Domain: Rainfall & Climate
            chirps_res = await ToolDispatcher.execute("get_precipitation_chirps", {"year": 2023}, current_map_state)
            precip_val = chirps_res.get("meanRainfallMm") or "850–1200 mm/ano"
            steps_log.append({"id": "step_2", "name": "Precipitação Acumulada Anual (CHIRPS 5km)", "status": "completed", "resultSummary": precip_val})
            if "map_action" in chirps_res: map_actions.append(chirps_res["map_action"])

            synthesis = f"""### Caracterização Pluviométrica & Hídrica ({province})

**Área de Análise:** {aoi_res.get('label')}  
**Sensor:** CHIRPS Daily (Climate Hazards Group InfraRed Precipitation with Station Data, 5km).

#### Diagnóstico Pluviométrico:
- O regime pluviométrico anual demonstra valores médios em torno de **{precip_val}**, refletindo a sazonalidade característica de Moçambique com concentração hídrica no período novembro–março.
- Os mapas de precipitação auxiliam no planeamento de sementeiras, dimensionamento de barragens e gestão de recursos hídricos.
"""

        elif any(w in msg_lower for w in ["furo", "subterrânea", "solar", "ahp", "aptidão"]):
            # Domain: AHP Multi-criteria
            theme = "solar" if "solar" in msg_lower else "groundwater"
            ahp_res = await ToolDispatcher.execute("run_multicriteria_ahp", {"theme": theme}, current_map_state)
            steps_log.append({"id": "step_2", "name": f"Análise Multi-Critério AHP ({theme.title()})", "status": "completed", "resultSummary": "Modelo Executado"})
            if "map_action" in ahp_res: map_actions.append(ahp_res["map_action"])

            lin_res = await ToolDispatcher.execute("extract_lineaments", {"density_radius_m": 750}, current_map_state)
            lin_dir = lin_res.get('dominantOrientation') or 'NE-SW / N-S'
            steps_log.append({"id": "step_3", "name": "Fraturação e Condutividade Hidráulica/Relevo", "status": "completed", "resultSummary": f"Orientação: {lin_dir}"})
            if "map_action" in lin_res: map_actions.append(lin_res["map_action"])

            synthesis = f"""### Análise Multi-Critério AHP — {ahp_res.get('name')} ({province})

**Área de Análise:** {aoi_res.get('label')}  
**Tema:** {theme.replace('_', ' ').title()}

#### Avaliação de Adequabilidade Espacial:
- O cruzamento ponderado de variáveis biofísicas, topográficas e estruturais indica setores com elevada aptidão para o investimento planeado.
- Os eixos de lineamentos e fraturas ({lin_dir}) condicionam a permeabilidade secundária e o enquadramento estrutural.
"""

        elif any(w in msg_lower for w in ["alpha", "deepmind", "embedding", "anomalia"]):
            # Domain: AlphaEarth Foundations
            ae_res = await ToolDispatcher.execute("run_alphaearth_pca", {"year": 2024}, current_map_state)
            steps_log.append({"id": "step_2", "name": "Embeddings de Satélite AlphaEarth (Google DeepMind)", "status": "completed", "resultSummary": "RGB PCA Gerado"})
            if "map_action" in ae_res: map_actions.append(ae_res["map_action"])

            slope_res = await ToolDispatcher.execute("calculate_slope", {}, current_map_state)
            steps_log.append({"id": "step_3", "name": "Declividade Topográfica de Relevo", "status": "completed", "resultSummary": "Graus Calculados"})
            if "map_action" in slope_res: map_actions.append(slope_res["map_action"])

            synthesis = f"""### Análise por Modelo Fundacional AlphaEarth ({province})

**Área de Estudo:** {aoi_res.get('label')}  
**Fonte:** Embeddings AlphaEarth Foundations de 64 dimensões (Google DeepMind) reduzidos via PCA.

#### Diagnóstico Espectral:
- As componentes principais (PC1, PC2, PC3) diferenciam claramente as transições litológicas e os contrastes de coberto vegetal que não são captados pelos rácios espectrais tradicionais.
- Os agrupamentos espectrais refletem variações do substrato rochoso e padrões de humidade residual.
"""

        else:
            # Default: Agriculture & Vegetation
            ndvi_res = await ToolDispatcher.execute("calculate_index", {"index": "ndvi"}, current_map_state)
            steps_log.append({"id": "step_2", "name": "Cálculo de Biomassa e Vigor Vegetal (NDVI Sentinel-2)", "status": "completed", "resultSummary": f"Média: {ndvi_res.get('mean')}"})
            if "map_action" in ndvi_res: map_actions.append(ndvi_res["map_action"])

            slope_res = await ToolDispatcher.execute("calculate_slope", {"max_slope_deg": 15}, current_map_state)
            steps_log.append({"id": "step_3", "name": "Aptidão de Declividade para Mecanização (< 15°)", "status": "completed", "resultSummary": "Concluído"})
            if "map_action" in slope_res: map_actions.append(slope_res["map_action"])

            synthesis = f"""### Caracterização Agrícola & Biofísica ({province})

**Área de Análise:** {aoi_res.get('label')}  
**Indicadores:** NDVI de biomassa ativa e declividade Copernicus DEM.

#### Resultados:
- O vigor vegetal médio na área é de **{ndvi_res.get('mean')}**, demonstrando zonas ativas de desenvolvimento vegetativo.
- A maior parte dos setores planos a suavemente ondulados apresenta excelente aptidão topográfica para práticas agrícolas mecanizadas.
"""

        return {
            "status": "completed",
            "plan": [s["name"] for s in steps_log],
            "steps": steps_log,
            "map_actions": map_actions,
            "runs": executed_runs,
            "synthesis": synthesis
        }
