"""GEE agent calls must use the verified user's private credential store."""
import asyncio
import unittest
from unittest.mock import MagicMock, patch
from agent.registry import ToolDispatcher
from agent import administrative_boundaries as boundaries


class AgentGEEIdentityTests(unittest.TestCase):
    def test_fao_uses_private_store_for_each_user(self):
        gee = MagicMock()
        with patch.dict("sys.modules", {"gee_module": gee}), \
             patch.object(boundaries, "list_units", return_value={"status": "success", "units": []}):
            for uid in ("alice", "bob"):
                result = asyncio.run(ToolDispatcher._execute_impl("list_administrative_units",
                    {"country_code": "MOZ", "level": 1},
                    {"_gee_uid": uid, "gee_token": "ignored", "gee_project": "ignored"}))
                self.assertEqual(result["status"], "success")
                gee._init_gee.assert_called_with(uid=uid, project=None, token=None)

    def test_anonymous_fao_does_not_use_existing_global_session(self):
        gee = MagicMock()
        with patch.dict("sys.modules", {"gee_module": gee}), \
             patch.object(boundaries, "list_units") as listing:
            result = asyncio.run(ToolDispatcher._execute_impl("list_administrative_units",
                {"country_code": "MOZ", "level": 1}, {"gee_token": "legacy"}))
        self.assertEqual(result["status"], "error")
        gee._init_gee.assert_not_called()
        listing.assert_not_called()

    def test_failed_private_auth_stops_legacy_computation(self):
        gee = MagicMock()
        gee._init_gee.side_effect = RuntimeError("Credenciais indisponíveis")
        with patch.dict("sys.modules", {"gee_module": gee, "api": MagicMock()}):
            result = asyncio.run(ToolDispatcher._execute_impl("calculate_index",
                {"index": "ndvi"}, {"_gee_uid": "alice"}))
        self.assertEqual(result["status"], "error")
        gee.compute_index_tile.assert_not_called()

if __name__ == "__main__":
    unittest.main()
