"""Regression coverage for the GEOAGENTE HTTP 500 and simple geology prompts."""
import asyncio
from unittest.mock import patch

from agent.planner import GeoMozAgent, _is_catalogue_geology_request
from agent.registry import ToolDispatcher


def test_geology_catalogue_intent_portuguese_and_english():
    assert _is_catalogue_geology_request("Quais são as formações geológicas de Tete?")
    assert _is_catalogue_geology_request("Mostra os granitos em Manica no mapa")
    assert _is_catalogue_geology_request("Qual a litologia de Zambézia?")
    assert not _is_catalogue_geology_request("Identifica mineralização de ouro em Manica")
    assert not _is_catalogue_geology_request("Extrai falhas geológicas e lineamentos")
    assert not _is_catalogue_geology_request("Olá GeoMoz, como estás?")


def test_basic_geology_avoids_ai_providers_even_with_keys():
    async def catalog(tool, args, context):
        assert tool == "get_geology_units"
        assert args["province"] == "Manica"
        return {
            "status": "success", "unitsCount": 2, "summary": "2 polígonos verificados",
            "map_action": {"type": "ADD_GEOJSON_LAYER", "id": "agent_geology", "province": "Manica"},
        }

    with (
        patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test", "GEMINI_API_KEY": "test-key"}),
        patch.object(GeoMozAgent, "_run_openai_react_loop", side_effect=AssertionError("OpenAI not needed")),
        patch.object(GeoMozAgent, "_run_gemini_react_loop", side_effect=AssertionError("Gemini not needed")),
        patch.object(ToolDispatcher, "execute", side_effect=catalog) as called,
    ):
        result = asyncio.run(
            GeoMozAgent.process_user_request(
                "Quais são as principais unidades geológicas de Manica?",
                {"aoi": None}, provider="openai", model="gpt-4o",
            )
        )

    assert result["status"] == "completed"
    assert "2 polígonos" in result["synthesis"]
    assert result["map_actions"][0]["type"] == "ADD_GEOJSON_LAYER"
    called.assert_called_once()


def test_agent_chat_endpoint_returns_stable_success_payload(client):
    async def fake_answer(**kwargs):
        return {
            "status": "completed", "provider": "deterministic-geology",
            "steps": [], "map_actions": [], "synthesis": "A geologia foi consultada.",
        }

    with patch.object(GeoMozAgent, "process_user_request", side_effect=fake_answer):
        response = client.post(
            "/geomoz-api/ai/agent-chat",
            json={
                "message": "Mostra a geologia de Tete",
                "current_map_state": {"aoi": {"province": "Tete", "geometry": None}},
                "chat_history": [], "provider": "auto",
            },
        )
    assert response.status_code == 200
    assert "geologia" in response.json()["synthesis"]


def test_agent_chat_500_returns_safe_diagnostic_not_secrets(client):
    async def crash(**kwargs):
        raise RuntimeError("private-key=EXAMPLE_DO_NOT_EXPOSE")

    with patch.object(GeoMozAgent, "process_user_request", side_effect=crash):
        response = client.post(
            "/geomoz-api/ai/agent-chat",
            json={"message": "Mostra as litologias no mapa", "current_map_state": {"aoi": {}}},
        )
    assert response.status_code == 500
    body = response.json()
    assert body["detail"]["request_id"]
    assert response.headers["X-Request-ID"] == body["detail"]["request_id"]
    assert "private-key" not in response.text
    assert "Falha interna" in body["detail"]["message"]
