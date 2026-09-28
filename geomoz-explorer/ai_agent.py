"""GeoMoz natural-language planner backed by the OpenAI Responses API.

The model is intentionally restricted to planning. It cannot execute arbitrary
Python, shell commands, Earth Engine expressions or database queries. It may
select at most one tool from tool_registry.py; the GeoMoz API then validates
and executes that tool through the existing AnalysisJob lifecycle.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx

from tool_registry import get_tool, list_tools

logger = logging.getLogger(__name__)

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6"


class AgentNotConfigured(RuntimeError):
    """Raised when the GeoMoz planner has no server-side OpenAI credential."""


class AgentPlannerError(RuntimeError):
    """Raised when the upstream planner response cannot be used safely."""


def planner_status() -> dict[str, Any]:
    configured = bool(os.environ.get("OPENAI_API_KEY", "").strip())
    return {
        "configured": configured,
        "provider": "openai" if configured else None,
        "model": os.environ.get("GEOMOZ_AI_MODEL", DEFAULT_MODEL),
        "execution_model": "validated_tools_only",
        "max_tool_calls_per_turn": 1,
        "arbitrary_code_execution": False,
    }


def _openai_tools() -> list[dict[str, Any]]:
    """Convert the internal registry to Responses API function tools."""
    return [
        {
            "type": "function",
            "name": tool["id"],
            "description": tool["description"],
            "parameters": tool["parameters"],
            # Registry schemas deliberately allow optional GIS context fields.
            # Pydantic remains the authoritative validator after planning.
            "strict": False,
        }
        for tool in list_tools()
    ]


def _context_text(context: Optional[dict[str, Any]]) -> str:
    if not context:
        return "Nenhum contexto espacial adicional foi fornecido."

    safe: dict[str, Any] = {}
    for key in ("province", "district", "aoi_label", "map_center", "map_zoom"):
        if key in context:
            safe[key] = context[key]

    geometry = context.get("geometry")
    if isinstance(geometry, dict):
        safe["geometry_available"] = True
        safe["geometry_type"] = geometry.get("type")
    else:
        safe["geometry_available"] = False

    return json.dumps(safe, ensure_ascii=False, separators=(",", ":"))


def _extract_text(response: dict[str, Any]) -> str:
    # Some Responses payloads expose convenience output_text; keep support for
    # it while also parsing the canonical output/message content structure.
    root_text = response.get("output_text")
    if isinstance(root_text, str) and root_text.strip():
        return root_text.strip()

    chunks: list[str] = []
    for item in response.get("output") or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") in {"output_text", "text"}:
                value = content.get("text")
                if isinstance(value, str) and value.strip():
                    chunks.append(value.strip())
    return "\n".join(chunks).strip()


def _extract_tool_call(response: dict[str, Any]) -> Optional[dict[str, Any]]:
    for item in response.get("output") or []:
        if item.get("type") != "function_call":
            continue

        name = item.get("name")
        if not isinstance(name, str) or not get_tool(name):
            raise AgentPlannerError("O planner tentou usar uma ferramenta não autorizada.")

        raw_arguments = item.get("arguments") or "{}"
        try:
            arguments = (
                json.loads(raw_arguments)
                if isinstance(raw_arguments, str)
                else dict(raw_arguments)
            )
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            raise AgentPlannerError(
                "O planner devolveu parâmetros inválidos para a ferramenta."
            ) from exc

        if not isinstance(arguments, dict):
            raise AgentPlannerError("Os parâmetros da ferramenta devem ser um objecto.")

        return {
            "tool_id": name,
            "arguments": arguments,
            "call_id": item.get("call_id"),
        }
    return None


def merge_geo_context(
    arguments: dict[str, Any],
    context: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Fill missing spatial arguments from the current map/AOI context.

    The planner's explicit arguments always win. Context is additive only.
    """
    merged = dict(arguments)
    if not context:
        return merged

    for key in ("province", "district", "geometry"):
        value = context.get(key)
        if key not in merged and value is not None:
            merged[key] = value

    return merged


async def plan_agent_turn(
    message: str,
    context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Plan one GeoMoz AI turn.

    Returns either:
      {"mode": "tool_call", "tool_id": ..., "arguments": ...}
    or
      {"mode": "message", "message": ...}

    Tool execution happens outside this module after normal GeoMoz validation.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise AgentNotConfigured(
            "GeoMoz Agent ainda não está configurado no servidor. "
            "Defina OPENAI_API_KEY no ambiente seguro do Cloud Run."
        )

    model = os.environ.get("GEOMOZ_AI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    instructions = (
        "Você é o GeoMoz Agent, um planner de inteligência geoespacial. "
        "Responda em português claro. Quando o utilizador pedir uma análise "
        "que corresponde a uma ferramenta disponível, seleccione exactamente "
        "essa ferramenta e forneça apenas os parâmetros necessários. Use o "
        "contexto espacial actual quando for relevante. Se uma ferramenta "
        "exigir datas, coordenadas ou outro parâmetro obrigatório que não esteja "
        "no pedido nem no contexto, faça uma pergunta curta em vez de inventar "
        "o valor ou chamar a ferramenta. Nunca invente que uma análise foi "
        "concluída: a execução real acontece depois no GeoMoz. "
        "Nunca peça nem gere Python, shell, Earth Engine arbitrário, credenciais "
        "ou comandos destrutivos. Se o pedido não puder ser executado pelas "
        "ferramentas disponíveis, explique de forma curta o que é possível."
    )

    payload = {
        "model": model,
        "instructions": instructions,
        "input": [
            {
                "role": "user",
                "content": (
                    f"Contexto GeoMoz actual: {_context_text(context)}\n\n"
                    f"Pedido do utilizador: {message}"
                ),
            }
        ],
        "tools": _openai_tools(),
        "tool_choice": "auto",
        "parallel_tool_calls": False,
        "store": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                OPENAI_RESPONSES_URL,
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.warning("GeoMoz planner network error: %s", exc)
        raise AgentPlannerError(
            "O serviço de planeamento AI está temporariamente indisponível."
        ) from exc

    if response.status_code >= 400:
        request_id = response.headers.get("x-request-id")
        logger.warning(
            "GeoMoz planner upstream error status=%s request_id=%s",
            response.status_code,
            request_id,
        )
        if response.status_code in {401, 403}:
            raise AgentPlannerError("A credencial do GeoMoz Agent não é válida.")
        if response.status_code == 429:
            raise AgentPlannerError(
                "O GeoMoz Agent atingiu temporariamente o limite de utilização."
            )
        raise AgentPlannerError(
            f"O serviço de planeamento AI respondeu com HTTP {response.status_code}."
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise AgentPlannerError("O planner AI devolveu uma resposta inválida.") from exc

    tool_call = _extract_tool_call(data)
    if tool_call:
        return {
            "mode": "tool_call",
            "tool_id": tool_call["tool_id"],
            "arguments": merge_geo_context(tool_call["arguments"], context),
            "call_id": tool_call.get("call_id"),
            "model": model,
            "response_id": data.get("id"),
        }

    text = _extract_text(data)
    return {
        "mode": "message",
        "message": text or (
            "Não encontrei uma ferramenta GeoMoz adequada para executar esse pedido."
        ),
        "model": model,
        "response_id": data.get("id"),
    }



def _compact_for_explanation(value: Any, depth: int = 0) -> Any:
    """Remove large/render-only data before sending analysis evidence to the LLM."""
    if depth > 4:
        return "[conteúdo omitido]"

    if isinstance(value, dict):
        compact: dict[str, Any] = {}
        for key, item in value.items():
            lower = str(key).lower()
            if any(token in lower for token in (
                "tileurl", "tile_url", "geojson", "coordinates",
                "access_token", "token", "training",
            )):
                continue
            compact[str(key)] = _compact_for_explanation(item, depth + 1)
        return compact

    if isinstance(value, list):
        return [_compact_for_explanation(item, depth + 1) for item in value[:20]]

    if isinstance(value, str):
        return value[:1000]

    return value


async def explain_job_result(job: dict[str, Any]) -> dict[str, Any]:
    """Explain a completed analysis using only the persisted job evidence."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise AgentNotConfigured(
            "GeoMoz Agent ainda não está configurado no servidor."
        )

    if job.get("status") != "completed":
        raise AgentPlannerError(
            "A análise precisa estar concluída antes de gerar a explicação."
        )

    evidence = {
        "analysis_type": job.get("type"),
        "parameters": _compact_for_explanation(job.get("payload") or {}),
        "result": _compact_for_explanation(job.get("result") or {}),
        "completed_at": job.get("completed_at"),
    }

    model = os.environ.get("GEOMOZ_AI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    payload = {
        "model": model,
        "instructions": (
            "Você é um analista geoespacial do GeoMoz. Explique exclusivamente "
            "o que os dados fornecidos suportam. Não invente números, causas, "
            "locais, precisão ou certeza. Diferencie resultado calculado de "
            "interpretação. Quando o output for um índice, AHP, RUSLE, targeting "
            "ou detecção remota, deixe claro que é um indicador/modelo e não "
            "verdade de campo. Responda em português, de forma concisa, usando "
            "três blocos: Resultado, Interpretação e Limitações."
        ),
        "input": [
            {
                "role": "user",
                "content": (
                    "Explique este resultado GeoMoz com base apenas nesta evidência:\n"
                    + json.dumps(evidence, ensure_ascii=False, default=str)
                ),
            }
        ],
        "store": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(
                OPENAI_RESPONSES_URL,
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.warning("GeoMoz explanation network error: %s", exc)
        raise AgentPlannerError(
            "O serviço de explicação AI está temporariamente indisponível."
        ) from exc

    if response.status_code >= 400:
        logger.warning(
            "GeoMoz explanation upstream error status=%s request_id=%s",
            response.status_code,
            response.headers.get("x-request-id"),
        )
        raise AgentPlannerError(
            f"O serviço de explicação AI respondeu com HTTP {response.status_code}."
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise AgentPlannerError("A explicação AI devolveu uma resposta inválida.") from exc

    text = _extract_text(data)
    if not text:
        raise AgentPlannerError("A explicação AI veio vazia.")

    return {
        "explanation": text,
        "model": model,
        "response_id": data.get("id"),
    }
