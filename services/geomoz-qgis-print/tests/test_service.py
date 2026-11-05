import sys
import unittest
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
import service

class ServiceTests(unittest.TestCase):
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

    def test_compose_is_only_bound_to_localhost(self):
        compose = (root / "compose.yaml").read_text()
        self.assertIn("127.0.0.1:", compose)
        self.assertIn("read_only: true", compose)
        self.assertIn("GEOMOZ_PRINT_WORKER_TOKEN:?", compose)

if __name__ == "__main__":
    unittest.main()
