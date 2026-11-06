import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
import service

class ServiceTests(unittest.TestCase):
    def test_cloud_run_iam_mode_requires_second_worker_secret(self):
        # Cloud Run handles IAM; this is the worker's independent secret check.
        handler = service.Handler.__new__(service.Handler)
        handler.path = "/v1/print/pdf"
        handler.headers = {"X-Geomoz-Worker-Token": "correct-secret"}
        handler._error = MagicMock()
        with patch.object(service, "TOKEN", "correct-secret"), \
                patch.object(service, "WORKER_AUTH", "iam"):
            handler.do_POST()
        handler._error.assert_called_once()
        self.assertEqual(handler._error.call_args.args[0], 413)
        handler._error.reset_mock()
        handler.headers = {"X-Geomoz-Worker-Token": "bad-secret"}
        with patch.object(service, "TOKEN", "correct-secret"), \
                patch.object(service, "WORKER_AUTH", "iam"):
            handler.do_POST()
        self.assertEqual(handler._error.call_args.args[0], 401)
        handler._error.reset_mock()
        handler.headers = {"Authorization": "Bearer correct-secret"}
        with patch.object(service, "TOKEN", "correct-secret"), \
                patch.object(service, "WORKER_AUTH", "iam"):
            handler.do_POST()
        self.assertEqual(handler._error.call_args.args[0], 401)

    def test_does_not_accept_missing_token_on_post(self):
        source = (root / "service.py").read_text()
        self.assertIn("compare_digest", source)
        self.assertIn("len(TOKEN) < 32", source)
        self.assertNotIn("Access-Control-Allow-Origin: *", source)

    def test_renderer_initialization_is_isolated(self):
        source = (root / "service.py").read_text()
        self.assertIn("subprocess.run(", source)
        self.assertIn("timeout=90", source)
        self.assertIn("BoundedSemaphore(value=1)", source)
        self.assertIn("MAX_REQUEST_BYTES", source)

    def test_workers_reject_cross_engine_jobs_and_expose_no_browser_secret(self):
        code = (root / "service.py").read_text()
        self.assertIn('job["engine"] != WORKER_ENGINE', code)
        self.assertIn('"render_cartopy.py"', code)
        self.assertIn('WORKER_ENGINE not in {"pyqgis", "cartopy"}', code)
        compose = (root / "compose.yaml").read_text()
        self.assertIn("GEOMOZ_PRINT_ENGINE: cartopy", compose)
        self.assertIn("GEOMOZ_PRINT_ENGINE: pyqgis", compose)
        self.assertIn("127.0.0.1:", compose)
        self.assertIn("read_only: true", compose)

    def test_compose_is_only_bound_to_localhost(self):
        compose = (root / "compose.yaml").read_text()
        self.assertIn("127.0.0.1:", compose)
        self.assertIn("read_only: true", compose)
        self.assertIn("GEOMOZ_PRINT_WORKER_TOKEN:?", compose)

if __name__ == "__main__":
    unittest.main()
