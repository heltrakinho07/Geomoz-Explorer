"""
Tests for GeoMoz AI Agent — Tool Registry and Planner (Standard Library unittest).
"""

import unittest
import asyncio
from unittest.mock import patch, MagicMock
from agent.registry import ToolDispatcher, TOOL_DECLARATIONS
from agent.planner import GeoMozAgent


class TestGeoMozAgent(unittest.TestCase):
    def test_tool_declarations_valid(self):
        """Ensure tool declarations have valid schemas for Gemini."""
        self.assertGreaterEqual(len(TOOL_DECLARATIONS), 10)
        for tool in TOOL_DECLARATIONS:
            self.assertIn("name", tool)
            self.assertIn("description", tool)
            self.assertIn("parameters", tool)
            self.assertEqual(tool["parameters"].get("type"), "object")

    def test_agent_resolve_aoi(self):
        """Test resolve_aoi tool execution."""
        async def _test():
            mock_api = MagicMock()
            mock_api._region_geojson.return_value = {"type": "Polygon", "coordinates": []}
            with patch.dict("sys.modules", {"api": mock_api}):
                result = await ToolDispatcher.execute("resolve_aoi", {"province": "Maputo"}, {})
                self.assertEqual(result["status"], "success")
                self.assertEqual(result["province"], "Maputo")
                self.assertEqual(result["map_action"]["type"], "SET_AOI")
        asyncio.run(_test())

    def test_agent_heuristic_fallback(self):
        """Test agent processes natural language with heuristic fallback."""
        async def _test():
            map_state = {
                "aoi": {"label": "Maputo", "province": "Maputo"},
                "temporalWindow": {"startDate": "2024-01-01", "endDate": "2024-12-31"}
            }
            with patch("agent.registry.ToolDispatcher.execute", return_value={"status": "success", "mean": "0.35"}):
                res = await GeoMozAgent.process_user_request("Encontra zonas com risco de cheia em Maputo", map_state)
                self.assertEqual(res["status"], "completed")
                self.assertGreater(len(res["steps"]), 0)
                self.assertIn("synthesis", res)
                self.assertTrue("Inundação" in res["synthesis"] or "cheia" in res["synthesis"].lower())
        asyncio.run(_test())


    def test_new_agent_tools(self):
        """Test newly registered tools dispatch correctly."""
        async def _test():
            mock_gee = MagicMock()
            mock_gee.compute_index_tile.return_value = {
                "tileUrl": "https://earthengine.googleapis.com/v1/projects/earthengine-legacy/maps/test-map/tiles/{z}/{x}/{y}",
                "name": "Mock Layer"
            }
            mock_api = MagicMock()
            mock_api._region_geojson.return_value = {"type": "Polygon", "coordinates": []}
            mock_api._geology.return_value = MagicMock(empty=True)
            mock_api._clip_geo.return_value = MagicMock(empty=True)

            with patch.dict("sys.modules", {"gee_module": mock_gee, "api": mock_api}):
                # 1. Geology tool
                geo_res = await ToolDispatcher.execute("get_geology_units", {"province": "Tete"}, {})
                self.assertEqual(geo_res["status"], "success")
                self.assertIn("map_action", geo_res)

                # 2. Flood susceptibility
                flood_res = await ToolDispatcher.execute("get_flood_susceptibility", {"province": "Zambezia"}, {})
                self.assertEqual(flood_res["status"], "success")
                self.assertEqual(flood_res["map_action"]["id"], "agent_flood_susceptibility")

                # 3. Precipitation CHIRPS
                precip_res = await ToolDispatcher.execute("get_precipitation_chirps", {"year": 2023}, {})
                self.assertEqual(precip_res["status"], "success")
                self.assertEqual(precip_res["map_action"]["id"], "agent_precipitation_chirps")

                # 4. AHP
                ahp_res = await ToolDispatcher.execute("run_multicriteria_ahp", {"theme": "groundwater"}, {})
                self.assertEqual(ahp_res["status"], "success")
                self.assertIn("agent_ahp_groundwater", ahp_res["map_action"]["id"])

                # 5. Temporal change
                change_res = await ToolDispatcher.execute("detect_temporal_change", {"index": "ndvi"}, {})
                self.assertEqual(change_res["status"], "success")
                self.assertIn("agent_change_ndvi", change_res["map_action"]["id"])

        asyncio.run(_test())


if __name__ == "__main__":
    unittest.main()

