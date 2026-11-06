"""Gateway security and authenticated PDF lifecycle regression tests.

All cloud integrations are mocked: tests never contact GCP or expose secrets.
"""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import print_gateway as pg


def good_job():
    return {
        "engine": "cartopy", "map_crs": "EPSG:32736",
        "grid": {"type": "geographic", "interval_degrees": 0.5},
        "title": "Sismicidade de Manica", "paper": "A4",
        "orientation": "landscape", "dpi": 300,
        "layers": [{
            "name": "Epicentros", "color": "#c026d3",
            "geojson": {"type": "FeatureCollection", "features": [
                {"type": "Feature", "properties": {"mag": 4.2},
                 "geometry": {"type": "Point", "coordinates": [33.1, -19.4]}}
            ]}
        }],
    }


CONFIG = {
    "GEOMOZ_PRINT_BUCKET": "geomoz-private-print-ci",
    "GEOMOZ_PRINT_TASKS_QUEUE": "projects/p/locations/europe-west1/queues/q",
    "GEOMOZ_PRINT_TASKS_SERVICE_ACCOUNT": "print-tasks@example.iam.gserviceaccount.com",
    "GEOMOZ_PRINT_DISPATCH_URL": "https://api.example.com/geomoz-api/v1/prints/internal/dispatch",
    "GEOMOZ_PRINT_PYQGIS_URL": "https://qgis.example.com/v1/print/pdf",
    "GEOMOZ_PRINT_CARTOPY_URL": "https://cartopy.example.com/v1/print/pdf",
    "GEOMOZ_PRINT_WORKER_TOKEN": "x" * 40,
}


class FakeBlob:
    def __init__(self):
        self.data = None

    def upload_from_string(self, data, **kwargs):
        self.data = data

    def download_as_bytes(self):
        return self.data


class FakeBucket:
    def __init__(self):
        self.blobs = {}

    def blob(self, name):
        return self.blobs.setdefault(name, FakeBlob())


class GatewayTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(pg.router)
        app.dependency_overrides[pg._uid] = lambda: "u123"
        self.client = TestClient(app)

    def test_contract_parity(self):
        root = Path(__file__).resolve().parents[2]
        api_copy = (root / "geomoz-explorer/print_job.py").read_bytes()
        worker = (root / "services/geomoz-qgis-print/job.py").read_bytes()
        self.assertEqual(api_copy, worker, "API and renderer must accept exactly the same safe job schema.")

    def test_disabled_without_provisioning_and_rejects_untrusted_urls(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post("/geomoz-api/v1/prints", json=good_job(),
                                        headers={"Idempotency-Key": "a" * 32})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("WORKER_TOKEN", response.text)
        with patch.object(pg, "_settings", return_value=CONFIG):
            response = self.client.post("/geomoz-api/v1/prints", json=good_job(),
                                        headers={"Idempotency-Key": "bad"})
            self.assertEqual(response.status_code, 422)
            invalid = good_job()
            invalid["layers"][0]["geojson"] = {
                "type": "external", "url": "http://169.254.169.254/latest/meta-data"}
            response = self.client.post("/geomoz-api/v1/prints", json=invalid,
                                        headers={"Idempotency-Key": "a" * 32})
            self.assertEqual(response.status_code, 422)

    def test_pdf_job_create_status_and_owner_only_result(self):
        print_id = "a" * 32
        bucket = FakeBucket()
        doc = {
            "uid": "u123", "status": "queued", "engine": "cartopy",
            "paper": "A4", "createdAt": pg._iso(pg._now()),
            "expiresAt": pg._iso(pg._now() + pg.JOB_TTL),
            "outputPath": "private.pdf", "sizeBytes": 0,
        }
        with (patch.object(pg, "_settings", return_value=CONFIG),
              patch.object(pg, "_allocate", return_value=(print_id, True)) as allocate,
              patch.object(pg, "_bucket", return_value=bucket),
              patch.object(pg, "_enqueue") as enqueue,
              patch.object(pg, "_owned", return_value=doc) as owned):
            response = self.client.post("/geomoz-api/v1/prints",
                                        headers={"Idempotency-Key": "b" * 32},
                                        json=good_job())
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json()["id"], print_id)
            self.assertIn("statusUrl", response.json())
            self.assertEqual(allocate.call_count, 1)
            self.assertEqual(enqueue.call_count, 1)
            response = self.client.get("/geomoz-api/v1/prints/" + print_id)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "queued")
            response = self.client.get("/geomoz-api/v1/prints/" + print_id + "/result")
            self.assertEqual(response.status_code, 409)
            doc["status"] = "succeeded"
            bucket.blob("private.pdf").data = b"%PDF-1.4\n" + b"x" * 400
            response = self.client.get("/geomoz-api/v1/prints/" + print_id + "/result")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "application/pdf")
            self.assertEqual(response.headers["cache-control"], "private, no-store, max-age=0")
            owned.assert_called()

    def test_invalid_id_and_dispatch_unauthorized(self):
        resp = self.client.get("/geomoz-api/v1/prints/not-an-id")
        self.assertEqual(resp.status_code, 404)
        with patch.object(pg, "_settings", return_value=CONFIG):
            resp = self.client.post("/geomoz-api/v1/prints/internal/dispatch",
                                    json={"jobId": "a" * 32})
        self.assertEqual(resp.status_code, 401)

    def test_cloudrun_worker_authentication_uses_google_id_token(self):
        config = {**CONFIG, "GEOMOZ_PRINT_WORKER_AUTH_MODE": "iam"}
        url = "https://geomoz-print-cartopy-example-ew.a.run.app/v1/print/pdf"
        with patch.object(pg, "_mint_cloud_run_id_token", return_value="google-signed-id") as identity:
            headers = pg._worker_request_headers(url, config)
        self.assertEqual(headers["Authorization"], "Bearer google-signed-id")
        self.assertEqual(headers["X-Geomoz-Worker-Token"], CONFIG["GEOMOZ_PRINT_WORKER_TOKEN"])
        self.assertEqual(headers["Content-Type"], "application/json")
        identity.assert_called_once_with("https://geomoz-print-cartopy-example-ew.a.run.app")
        self.assertNotEqual(headers["Authorization"], "Bearer " + CONFIG["GEOMOZ_PRINT_WORKER_TOKEN"])
        with self.assertRaises(ValueError):
            pg._worker_request_headers("https://untrusted.example/v1/print/pdf", config)
        local = pg._worker_request_headers(url, CONFIG)
        self.assertNotIn("X-Geomoz-Worker-Token", local)
        self.assertEqual(local["Authorization"], "Bearer " + CONFIG["GEOMOZ_PRINT_WORKER_TOKEN"])

    def test_storage_paths_do_not_contain_raw_uid(self):
        a, b = pg._paths("user:private:uid", "a" * 32)
        self.assertNotIn("user:private:uid", a)
        self.assertTrue(a.endswith("/input.json"))
        self.assertTrue(b.endswith("/result.pdf"))

    def test_authenticated_dispatch_renders_and_finalizes(self):
        class FakeHTTP:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *_):
                pass
            async def post(self, url, content, headers):
                self.url = url
                self.headers = headers
                return type("Result", (), {"status_code": 200,
                      "content": b"%PDF-1.5\n" + b"p" * 120})()
        bucket = FakeBucket()
        bucket.blob("input.json").data = json.dumps(good_job()).encode()
        doc = {"engine": "cartopy", "inputPath": "input.json", "outputPath": "output.pdf"}
        with (patch.object(pg, "_verify_dispatch", return_value=CONFIG),
              patch.object(pg, "_claim_job", return_value=doc),
              patch.object(pg, "_bucket", return_value=bucket),
              patch.object(pg, "_finish") as finish,
              patch.object(pg.httpx, "AsyncClient", return_value=FakeHTTP())):
            response = self.client.post("/geomoz-api/v1/prints/internal/dispatch",
                                        json={"jobId": "a" * 32})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "succeeded")
            self.assertTrue(bucket.blob("output.pdf").data.startswith(b"%PDF-"))
            finish.assert_called_once()
            self.assertEqual(finish.call_args.args[1], "succeeded")


    def test_transactional_idempotency_and_concurrent_quota(self):
        from platform_config import get_plan_limits
        store = {}

        class Snapshot:
            def __init__(self, data):
                self.exists = data is not None
                self._data = data
            def to_dict(self):
                return dict(self._data) if self._data is not None else None

        class Ref:
            def __init__(self, path):
                self.path = path
            def collection(self, name):
                return Collection(self.path + "/" + name)
            def get(self, transaction=None):
                return Snapshot(store.get(self.path))

        class Collection:
            def __init__(self, path):
                self.path = path
            def document(self, name):
                return Ref(self.path + "/" + name)

        class Tx:
            def create(self, ref, value):
                assert ref.path not in store
                store[ref.path] = dict(value)
            def set(self, ref, value, merge=False):
                if merge:
                    store.setdefault(ref.path, {}).update(value)
                else:
                    store[ref.path] = dict(value)
            def update(self, ref, value):
                assert ref.path in store
                store[ref.path].update(value)

        class Database:
            def collection(self, name):
                return Collection(name)
            def transaction(self, **kwargs):
                return Tx()

        with (patch.object(pg, "_db", return_value=Database()),
              patch.object(pg, "require_plan_feature", return_value="pro"),
              patch("platform_config.get_plan_limits", return_value={"concurrent_jobs": 2}),
              patch.object(pg, "firestore", type("FakeFirestore", (), {"transactional": staticmethod(lambda fn: fn)})())):
            first, created = pg._allocate("owner", "a" * 32, "1" * 64, good_job(), CONFIG)
            self.assertTrue(created)
            same, created = pg._allocate("owner", "a" * 32, "1" * 64, good_job(), CONFIG)
            self.assertEqual((first, created), (same, False))
            self.assertEqual(store["printQuotas/owner"]["monthlyCount"], 1)
            with self.assertRaises(HTTPException) as err:
                pg._allocate("owner", "a" * 32, "2" * 64, good_job(), CONFIG)
            self.assertEqual(err.exception.status_code, 409)
            second, _ = pg._allocate("owner", "b" * 32, "2" * 64, good_job(), CONFIG)
            self.assertEqual(store["printQuotas/owner"]["active"], 2)
            with self.assertRaises(HTTPException) as err:
                pg._allocate("owner", "c" * 32, "3" * 64, good_job(), CONFIG)
            self.assertEqual(err.exception.status_code, 429)
            pg._finish(first, "succeeded", size=512)
            self.assertEqual(store["printQuotas/owner"]["active"], 1)
            self.assertNotIn(first, store["printQuotas/owner"]["activeJobs"])
            third, _ = pg._allocate("owner", "c" * 32, "3" * 64, good_job(), CONFIG)
            self.assertNotEqual(third, second)
            self.assertEqual(store["printQuotas/owner"]["active"], 2)

    def test_owner_isolation_and_pdf_expiration(self):
        record = {
            "uid": "alice", "status": "succeeded",
            "expiresAt": pg._iso(pg._now() + pg.JOB_TTL),
        }
        class Ref:
            def get(self):
                return type("Snap", (), {"exists": True, "to_dict": lambda self: record})()
        class Database:
            def collection(self, name):
                return self
            def document(self, name):
                return Ref()
        with patch.object(pg, "_db", return_value=Database()):
            with self.assertRaises(HTTPException) as err:
                pg._owned("a" * 32, "bob")
            self.assertEqual(err.exception.status_code, 404)
            self.assertEqual(pg._owned("a" * 32, "alice")["uid"], "alice")
            record["expiresAt"] = "2020-01-01T00:00:00+00:00"
            with self.assertRaises(HTTPException) as err:
                pg._owned("a" * 32, "alice")
            self.assertEqual(err.exception.status_code, 410)

if __name__ == "__main__":
    unittest.main()
