"""Public-data follow-ups retain authoritative AOI codes, not literal pronouns."""
import asyncio
from unittest.mock import AsyncMock, patch

from agent.followup_context import refers_to_current_area, followup_scope, usable_aoi
from agent.planner import GeoMozAgent
from agent.registry import ToolDispatcher


GAUL = {"source": "country", "countryCode": "MOZ", "boundarySource": "gaul2025",
        "adminLevel": 2, "admin1Code": 1484, "admin2Code": 104314,
        "label": "Montepuez, Cabo Delgado, Moçambique"}


def run(message, context, response=None):
    return asyncio.run(GeoMozAgent.process_user_request(message, context))


def test_same_area_uses_exact_previous_gaul_unit_without_name_lookup():
    msg = "Pode incorporar a análise de uso do solo para a mesma área?"
    assert refers_to_current_area(msg)
    async def execute(name, args, state):
        assert name == "get_public_landcover"
        assert state["aoi"] == GAUL
        return {"status": "success", "summary": "WorldCover 2021",
                "map_action": {"type": "ADD_LAYER", "tileUrl": "https://example.com/{z}/{x}/{y}"}}
    with patch.object(ToolDispatcher, "execute", side_effect=execute) as dispatcher, \
         patch.object(ToolDispatcher, "resolve_named_area", new_callable=AsyncMock) as lookup:
        answer = run(msg, {"aoi": GAUL, "temporalWindow": {
            "startDate": "2025-01-01", "endDate": "2026-01-01"}})
    assert answer["status"] == "completed"
    assert answer["map_actions"]
    assert "Montepuez" in answer["synthesis"]
    dispatcher.assert_awaited_once()
    lookup.assert_not_awaited()


def test_reuse_previous_area_when_current_map_is_global():
    state = {"aoi": {"source": "global"}, "analysisMemory": {
        "aoi": GAUL, "tool": "get_global_climate"}}
    assert followup_scope(state, "E na mesma área?") == GAUL
    with patch.object(ToolDispatcher, "execute", new_callable=AsyncMock,
                      return_value={"status": "success", "summary": "Uso do solo calculado."}) as execute:
        result = run("Incorporar uso do solo na mesma área", state)
    assert result["status"] == "completed"
    assert execute.call_args.args[2]["aoi"]["admin2Code"] == 104314


def test_no_prior_scope_never_guesses_maputo_or_place_name():
    with patch.object(ToolDispatcher, "resolve_named_area", new_callable=AsyncMock) as lookup, \
         patch.object(ToolDispatcher, "execute", new_callable=AsyncMock) as execute:
        result = run("Incorporar análise de uso do solo na mesma área",
                     {"aoi": {"source": "global"}})
    assert result["status"] == "needs_input"
    assert "Seleccione" in result["synthesis"]
    lookup.assert_not_awaited()
    execute.assert_not_awaited()


def test_joint_climate_and_landcover_is_bounded_and_scientifically_cautious():
    async def execute(name, args, context):
        return {"status": "success", "summary": name}
    with patch.object(ToolDispatcher, "execute", side_effect=execute) as dispatch:
        result = run("Cruzar ERA5 e uso do solo para a mesma área", {"aoi": GAUL})
    assert result["status"] == "completed"
    assert [c.args[0] for c in dispatch.await_args_list] == [
        "get_global_climate", "get_public_landcover"]
    assert len(result["runs"]) == 2
    assert "não" in result["synthesis"].lower() or "Não" in result["synthesis"]
    assert "2021" in result["synthesis"]


def test_incomplete_gaul_hierarchy_cannot_be_reused():
    assert not usable_aoi({**GAUL, "admin1Code": None})
    assert followup_scope({"analysisMemory": {"aoi": {**GAUL, "admin2Code": None}}},
                          "a mesma área") is not None
