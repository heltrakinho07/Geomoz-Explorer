"""Regression tests: GeoAgent must use real geology data, never fabricated fallback."""
import asyncio
import sys
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import geopandas as gpd
from shapely.geometry import box, mapping

from agent.geology_data import summarize_geology, geology_features
from agent.registry import ToolDispatcher
from agent.planner import GeoMozAgent


@pytest.fixture
def _mock_shapely_ops():
    """Override the global shapely mock: these tests must validate real polygons."""
    yield



def _sample_data():
    return gpd.GeoDataFrame(
        {"Legend": ["Granito", "Basalto"], "ERA": ["Pré-Câmbrico", "Karoo"]},
        geometry=[box(32.0, -20.0, 32.2, -19.8), box(33.0, -20.0, 33.1, -19.9)],
        crs="EPSG:4326",
    )


def test_geology_real_units_filter_and_polygon_properties():
    mock_api = SimpleNamespace(_geology=_sample_data)
    with patch.dict(sys.modules, {"api": mock_api}):
        result = summarize_geology(filter_str="granito")
        assert result["status"] == "success"
        assert result["unitsCount"] == 1
        assert result["uniqueUnits"] == 1
        assert result["totalAreaKm2"] > 0
        assert result["dominantUnits"][0]["name"] == "Granito"
        assert result["map_action"]["type"] == "ADD_GEOJSON_LAYER"
        polygons = geology_features(filter_str="granito")
        assert len(polygons["features"]) == 1
        assert polygons["features"][0]["properties"]["unit"] == "Granito"
        assert len(polygons["bbox"]) == 4


def test_geoagent_filters_by_drawn_aoi_and_handles_no_results_without_fabrication():
    mock_api = SimpleNamespace(_geology=_sample_data)
    area = mapping(box(32.0, -20.0, 32.3, -19.7))
    with patch.dict(sys.modules, {"api": mock_api}):
        result = summarize_geology(geometry=area)
        assert result["unitsCount"] == 1
        missing = summarize_geology(filter_str="litologia_inexistente")
        assert missing["status"] == "success"
        assert missing["unitsCount"] == 0
        assert "map_action" not in missing


def test_missing_dataset_is_reported_and_never_replaced_with_fixed_lithologies():
    def missing_data():
        raise FileNotFoundError("dados de geologia indisponíveis")

    with patch.dict(sys.modules, {"api": SimpleNamespace(_geology=missing_data)}):
        result = asyncio.run(ToolDispatcher.execute("get_geology_units", {}, {"aoi": {}}))
    assert result["status"] == "error"
    assert "unitsCount" not in result
    assert "map_action" not in result
    assert "14" not in result.get("message", "")


def test_chat_geology_without_gee_calls_only_grounded_catalogue_tool():
    async def fake_execute(tool, args, context):
        assert tool == "get_geology_units"
        assert args["province"] == "Manica"
        return {
            "status": "success",
            "unitsCount": 3,
            "summary": "3 polígonos reais de granito em Manica.",
            "map_action": {"type": "ADD_GEOJSON_LAYER", "id": "agent_geology", "province": "Manica"},
        }

    with patch.object(ToolDispatcher, "execute", side_effect=fake_execute) as dispatcher:
        result = asyncio.run(GeoMozAgent.process_user_request(
            "Mostra os granitos de Manica no mapa",
            {"aoi": {"label": "Moçambique"}}, provider="auto",
        ))
    assert result["status"] == "completed"
    assert result["map_actions"][0]["type"] == "ADD_GEOJSON_LAYER"
    assert "3 polígonos reais" in result["synthesis"]
    dispatcher.assert_called_once()
