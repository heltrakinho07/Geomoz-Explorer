"""Offline regressions for evidence, scope isolation and scientific honesty."""
import asyncio
from copy import deepcopy
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from agent.intelligence import build_dossier
from agent.planner import GeoMozAgent
from agent.registry import ToolDispatcher


class IntelligenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_zonal_statistics_never_fabricate_areas(self):
        result = await ToolDispatcher.execute("calculate_zonal_statistics", {"layer_name": "NDVI"}, {})
        self.assertEqual(result["status"], "error")
        self.assertNotIn("highExposureKm2", result)
        self.assertNotIn("map_action", result)

    async def test_invalid_parameters_do_not_reach_gis(self):
        for args in ({"index": "imaginary"}, {"index": "ndvi", "start_date": "bad"},
                     {"index": "ndvi", "start_date": "2025-01-02", "end_date": "2025-01-01"},
                     {"index": "ndvi", "gee_token": "secret"}):
            with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock) as impl:
                result = await ToolDispatcher.execute("calculate_index", args, {})
                self.assertEqual(result["status"], "error")
                impl.assert_not_called()

    async def test_scope_propagates_and_stale_district_is_removed(self):
        state = {"aoi": {"province": "Maputo", "district": "Boane"}}
        original = deepcopy(state)
        seen = []
        async def implementation(name, args, context):
            if name == "resolve_aoi":
                self.assertEqual(args, {"province": "Manica", "district": None})
                return {"status": "success", "province": "Manica", "label": "Manica",
                        "map_action": {"type": "SET_AOI", "geometry": {"type": "Polygon"}}}
            seen.append(deepcopy(context["aoi"]))
            return {"status": "success", "mean": 0}
        with patch.object(ToolDispatcher, "_execute_impl", side_effect=implementation):
            result = await GeoMozAgent.process_user_request("NDVI em Manica", state)
        self.assertEqual(state, original)
        self.assertTrue(seen)
        self.assertTrue(all(a["province"] == "Manica" and a["district"] is None for a in seen))
        self.assertEqual(result["intelligence"]["scope"]["province"], "Manica")

    async def test_aoi_failure_stops_heuristic(self):
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "error", "message": "Limites indisponíveis"}) as impl:
            result = await GeoMozAgent.process_user_request("NDVI em Tete", {})
        self.assertEqual(impl.await_count, 1)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["map_actions"], [])

    async def test_missing_scope_and_unknown_request_do_not_run_ndvi(self):
        for message in ("NDVI", "Como estás?"):
            with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock) as impl:
                result = await GeoMozAgent.process_user_request(message, {})
                self.assertEqual(result["status"], "needs_input")
                impl.assert_not_called()

    async def test_partial_results_are_not_success(self):
        context = {}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          side_effect=[{"status": "success", "mean": 0.2},
                                       {"status": "error", "message": "Sem dados"}]):
            await ToolDispatcher.execute("calculate_index", {"index": "ndvi"}, context)
            await ToolDispatcher.execute("calculate_slope", {}, context)
        result = build_dossier({"status": "completed", "steps": [{}, {}]}, context)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["steps"][1]["status"], "error")
        self.assertEqual(result["intelligence"]["successfulTools"], 1)

    async def test_failed_map_action_is_discarded(self):
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "error", "map_action": {"type": "ADD_LAYER"}}):
            result = await ToolDispatcher.execute("calculate_slope", {}, {})
        self.assertNotIn("map_action", result)

    async def test_evidence_excludes_credentials(self):
        state = {"gee_token": "PRIVATE", "aoi": {"province": "Tete", "access_token": "PRIVATE"}}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "mean": 0, "api_key": "PRIVATE",
                                        "tileUrl": "PRIVATE", "warning": "Cobertura insuficiente"}):
            await ToolDispatcher.execute("calculate_index", {"index": "ndvi"}, state)
        result = build_dossier({"status": "completed"}, state)
        self.assertNotIn("PRIVATE", str(result["intelligence"]))
        self.assertIn("Cobertura insuficiente", result["intelligence"]["limitations"])
        self.assertEqual(result["intelligence"]["evidence"][0]["result"]["mean"], 0)

    async def test_execution_budget(self):
        state = {}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success"}) as impl:
            for _ in range(17):
                result = await ToolDispatcher.execute("calculate_slope", {}, state)
        self.assertEqual(impl.await_count, 16)
        self.assertEqual(result["status"], "error")

    async def test_precipitation_honours_year_and_computed_value(self):
        gee = MagicMock()
        gee.compute_index_tile.return_value = {"stats": {"mean": 0}, "tileUrl": "https://example.org/tiles"}
        api = MagicMock()
        with patch.dict("sys.modules", {"gee_module": gee, "api": api}):
            result = await ToolDispatcher.execute("get_precipitation_chirps", {"year": 2025}, {"_gee_uid": "user-test"})
        self.assertEqual(result["meanRainfallMm"], 0)
        self.assertEqual(gee.compute_index_tile.call_args.kwargs["start_date"], "2025-01-01")
        self.assertEqual(gee.compute_index_tile.call_args.kwargs["end_date"], "2026-01-01")

    async def test_index_mean_zero_is_preserved(self):
        gee = MagicMock()
        gee.compute_index_tile.return_value = {"stats": {"mean": 0, "p50": 0.5}, "tileUrl": "https://example.org/tiles"}
        with patch.dict("sys.modules", {"gee_module": gee, "api": MagicMock()}):
            result = await ToolDispatcher.execute("calculate_index", {"index": "ndvi"}, {"_gee_uid": "user-test"})
        self.assertEqual(result["mean"], "0.000")

    async def test_geology_evidence_uses_requested_scope(self):
        async def implementation(name, args, context):
            return {"status": "success", "unitsCount": 2, "source": "GeoMoz",
                    "summary": "Duas unidades reais."}
        with patch.object(ToolDispatcher, "_execute_impl", side_effect=implementation):
            result = await GeoMozAgent.process_user_request(
                "Geologia de Manica", {"aoi": {"province": "Cabo Delgado"}})
        self.assertEqual(result["intelligence"]["scope"]["province"], "Manica")
        self.assertEqual(result["intelligence"]["evidence"][0]["scope"]["province"], "Manica")

    async def test_gemini_executes_all_function_calls_in_a_turn(self):
        import io
        import json
        first = {"candidates": [{"content": {"role": "model", "parts": [
            {"functionCall": {"name": "calculate_index", "args": {"index": "ndvi"}}},
            {"functionCall": {"name": "calculate_slope", "args": {}}}]}}]}
        second = {"candidates": [{"content": {"role": "model", "parts": [{"text": "Resultados disponíveis."}]}}]}
        with patch("urllib.request.urlopen", side_effect=[io.BytesIO(json.dumps(first).encode()),
                                                          io.BytesIO(json.dumps(second).encode())]), \
             patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "mean": 0}) as impl:
            result = await GeoMozAgent.process_user_request("Avaliar vegetação e relevo", {},
                                                         gemini_api_key="test", provider="gemini")
        self.assertEqual(impl.await_count, 2)
        self.assertEqual(result["intelligence"]["successfulTools"], 2)
        self.assertEqual(result["provider"], "gemini")

    def test_response_without_tools_is_unverified(self):
        result = build_dossier({"status": "completed", "synthesis": "O território é favorável."}, {})
        self.assertEqual(result["status"], "unverified")


if __name__ == "__main__":
    unittest.main()
