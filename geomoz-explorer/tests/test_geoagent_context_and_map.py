"""Contract tests: GEOAGENTE retains scope and renders large provinces."""
import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import patch

import geopandas as gpd
from shapely.geometry import box

from agent.geology_intent import (resolve_geology_scope, is_geology_followup,
                                  is_catalogue_request)
from agent.geology_data import summarize_geology, geology_features
from agent.planner import GeoMozAgent
from agent.registry import ToolDispatcher


MANICA = "Quais são as principais litologias de Manica? Mostra no mapa."


def test_geological_followup_keeps_manica_while_visual_aoi_is_cabo_delgado():
    map_state = {"aoi": {"province": "Cabo Delgado"},
                 "agentContext": {"domain": "geology", "province": "Manica",
                                  "district": None, "filter_str": None}}
    assert is_catalogue_request(MANICA)
    assert is_geology_followup("Mostra no mapa.", map_state["agentContext"])
    assert resolve_geology_scope("Mostra no mapa.", map_state)["province"] == "Manica"
    assert resolve_geology_scope("Agora só os granitos.", map_state)["filter_str"] == "granit"
    next_scope = resolve_geology_scope("E no distrito de Gondola?", map_state)
    assert next_scope["province"] == "Manica"
    assert next_scope["district"] == "Gondola"
    explicit = resolve_geology_scope("Agora geologia de Tete", map_state)
    assert explicit["province"] == "Tete"
    assert explicit["district"] is None


def test_followup_does_not_dispatch_ndvi_or_force_gee():
    async def fake_execute(tool, args, context):
        assert tool == "get_geology_units", "Map follow-up must not run GEE tools"
        assert args["province"] == "Manica"
        assert args["district"] is None
        return {"status": "success", "unitsCount": 1058,
                "summary": "1058 polígonos reais, 119 unidades.",
                "map_action": {"type": "ADD_GEOJSON_LAYER", "id": "agent_geology",
                               "province": "Manica"}}

    map_state = {"aoi": {"province": "Cabo Delgado"},
                 "agentContext": {"domain": "geology", "province": "Manica"}}
    with patch.object(ToolDispatcher, "execute", side_effect=fake_execute) as dispatcher:
        answer = asyncio.run(GeoMozAgent.process_user_request(
            "Mostra no mapa.", map_state, provider="openai",
            openai_api_key="sk-anything", model="gpt-4o"))
    assert answer["status"] == "completed"
    assert answer["agent_context"]["province"] == "Manica"
    assert answer["map_actions"][0]["province"] == "Manica"
    assert "1058" in answer["synthesis"]
    dispatcher.assert_called_once()


def test_large_province_dissolves_for_display_without_changing_stats():
    # 720 tiny source polygons -> two mapped lithological units for display.
    units = ["Granito" if i % 2 == 0 else "Basalto" for i in range(720)]
    polygons = [box(32 + (i % 40) * .005, -20 + (i // 40) * .005,
                    32.004 + (i % 40) * .005, -19.996 + (i // 40) * .005)
                for i in range(720)]
    source = gpd.GeoDataFrame({"Legend": units, "ERA": ["Pré-Câmbrico"] * 720},
                              geometry=polygons, crs="EPSG:4326")
    mock_api = SimpleNamespace(_geology=lambda: source)
    with patch.dict(sys.modules, {"api": mock_api}):
        summary = summarize_geology()
        assert summary["status"] == "success"
        assert summary["unitsCount"] == 720
        assert summary["uniqueUnits"] == 2
        result = geology_features()
    assert result["type"] == "FeatureCollection"
    assert result["generalized"] is True
    assert result["originalFeatureCount"] == 720
    assert len(result["features"]) == 2
    assert {f["properties"]["unit"] for f in result["features"]} == {"Granito", "Basalto"}
