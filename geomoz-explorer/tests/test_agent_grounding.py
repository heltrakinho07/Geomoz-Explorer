"""Regression tests for evidence-grounded GeoMoz AI behaviour."""
import unittest
from unittest.mock import AsyncMock, patch

from agent.grounded import detect_intent, run_explicit_intent
from agent.planner import GeoMozAgent


CONTEXT = {
    "aoi": {"label": "Moçambique (Nacional)", "province": None, "district": None},
    "temporalWindow": {"startDate": "2024-01-01", "endDate": "2024-12-31"},
}


class TestAgentGrounding(unittest.IsolatedAsyncioTestCase):
    def test_intent_detection(self):
        self.assertEqual(detect_intent("Identificar anomalias de alteração hidrotermal Landsat 8 para ouro"),
                         "landsat_mineral")
        self.assertEqual(detect_intent("Avaliar o stress hídrico e humidade do solo NASA SMAP"),
                         "soil_moisture_smap")
        self.assertEqual(detect_intent("Caracterização agrícola ver no mapa"), "show_map")

    async def test_landsat_preserves_sensor_and_national_aoi(self):
        with patch("agent.grounded.ToolDispatcher.execute", new_callable=AsyncMock) as call:
            call.return_value = {
                "status": "success", "mean": 0.81,
                "tileUrl": "https://example.org/tiles/{z}/{x}/{y}",
                "map_action": {"type": "ADD_LAYER", "id": "l8",
                               "name": "Landsat", "tileUrl": "https://example.org/tiles/{z}/{x}/{y}"},
            }
            result = await GeoMozAgent.process_user_request(
                "Identificar anomalias de alteração hidrotermal Landsat 8 para ouro",
                CONTEXT)
            self.assertEqual(result["status"], "completed")
            self.assertEqual([args.args[1]["index"] for args in call.await_args_list],
                             ["clay_l8", "fe_oxide_l8", "hydrothermal_l8"])
            self.assertIn("Moçambique (Nacional)", result["synthesis"])
            self.assertNotIn("48.2", result["synthesis"])
            self.assertEqual(len(result["map_actions"]), 3)

    async def test_smap_not_replaced_by_ndvi(self):
        with patch("agent.grounded.ToolDispatcher.execute", new_callable=AsyncMock) as call:
            call.return_value = {"status": "warning", "message": "Requer autenticação GEE", "mean": None}
            result = await run_explicit_intent(
                "Avaliar o stress hídrico e humidade do solo NASA SMAP", CONTEXT)
            self.assertEqual(call.await_args.args[0], "get_soil_moisture_smap")
            self.assertEqual(result["status"], "warning")
            self.assertFalse(result["map_actions"])
            self.assertIn("não processado", result["synthesis"])
            self.assertNotIn("NDVI", result["plan"][0])

    async def test_map_follow_up_reuses_real_layer(self):
        url = "https://example.org/tiles/{z}/{x}/{y}"
        context = {**CONTEXT, "priorMapActions":
                   [{"type": "ADD_LAYER", "id": "soil", "tileUrl": url},
                    {"type": "ADD_LAYER", "id": "bad", "tileUrl": None}]}
        result = await run_explicit_intent("ver no mapa", context)
        self.assertEqual(len(result["map_actions"]), 1)
        self.assertEqual(result["map_actions"][0]["tileUrl"], url)
        self.assertIn("não foram recalculados", result["synthesis"])

    async def test_all_failed_never_claims_success(self):
        with patch("agent.grounded.ToolDispatcher.execute", new_callable=AsyncMock) as call:
            call.return_value = {"status": "error", "message": "Sem dados", "mean": "Requer GEE Ativo"}
            result = await run_explicit_intent("Landsat 8 alteração hidrotermal para ouro", CONTEXT)
            self.assertEqual(result["status"], "warning")
            self.assertEqual(len(result["map_actions"]), 0)
            self.assertTrue(all(s["status"] == "error" for s in result["steps"]))
            self.assertNotIn("48.2 km²", result["synthesis"])
            self.assertNotIn("NE-SW / N-S", result["synthesis"])


if __name__ == "__main__":
    unittest.main()
