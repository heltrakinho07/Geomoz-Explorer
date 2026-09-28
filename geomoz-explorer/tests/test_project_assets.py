"""Tests for private GeoMoz project assets and map snapshot helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest


class TestProjectAssets:
    def test_output_map_path_is_user_and_project_scoped(self) -> None:
        from project_assets import output_map_path

        path = output_map_path("uid-1", "project-1", "output-1")

        assert path == "users/uid-1/projects/project-1/outputs/output-1/map.png"

    def test_upload_png_returns_private_metadata(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import project_assets

        blob = MagicMock()
        bucket = MagicMock()
        bucket.blob.return_value = blob
        monkeypatch.setattr(project_assets, "_bucket", lambda: bucket)

        result = project_assets.upload_png("private/map.png", b"png-bytes")

        assert result == {
            "storage_path": "private/map.png",
            "content_type": "image/png",
            "size_bytes": 9,
        }
        blob.upload_from_string.assert_called_once_with(
            b"png-bytes",
            content_type="image/png",
        )
        assert blob.cache_control == "private, max-age=3600"

    def test_download_bytes_is_private_bucket_read(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import project_assets

        blob = MagicMock()
        blob.exists.return_value = True
        blob.download_as_bytes.return_value = b"map"
        bucket = MagicMock()
        bucket.blob.return_value = blob
        monkeypatch.setattr(project_assets, "_bucket", lambda: bucket)

        assert project_assets.download_bytes("private/map.png") == b"map"


class TestMapSnapshotHelpers:
    def test_geojson_bounds_adds_small_padding(self) -> None:
        from api import _geojson_bounds

        bounds = _geojson_bounds({
            "type": "Polygon",
            "coordinates": [[
                [32.0, -18.0],
                [34.0, -18.0],
                [34.0, -16.0],
                [32.0, -16.0],
                [32.0, -18.0],
            ]],
        })

        assert bounds is not None
        assert bounds["west"] < 32.0
        assert bounds["east"] > 34.0
        assert bounds["south"] < -18.0
        assert bounds["north"] > -16.0

    def test_snapshot_spec_supports_all_current_tile_shapes(self) -> None:
        from api import _job_snapshot_spec

        groundwater = _job_snapshot_spec({
            "type": "gee.groundwater",
            "result": {
                "tile": "https://example/{z}/{x}/{y}",
                "classes": [
                    {"label": "Alto", "color": "#91cf60"},
                ],
            },
        })
        flood = _job_snapshot_spec({
            "type": "gee.flood",
            "result": {"floodTile": "https://example/f/{z}/{x}/{y}"},
        })
        targeting = _job_snapshot_spec({
            "type": "gee.targeting",
            "result": {"tileUrl": "https://example/t/{z}/{x}/{y}"},
        })
        watershed = _job_snapshot_spec({
            "type": "gee.watershed",
            "result": {
                "tileUrl": "https://example/w/{z}/{x}/{y}",
                "geojson": {"type": "FeatureCollection", "features": []},
            },
        })

        assert groundwater["tile_url"].startswith("https://example/")
        assert groundwater["legend_items"][0]["label"] == "Alto"
        assert flood["tile_url"].startswith("https://example/f/")
        assert targeting["tile_url"].startswith("https://example/t/")
        assert watershed["overlay_geojson"]["type"] == "FeatureCollection"



class TestProjectAssetAPI:
    def test_private_map_endpoint_returns_png(
        self, client, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import project_assets
        import project_outputs

        monkeypatch.setattr(
            project_outputs,
            "get_output",
            lambda uid, output_id: {
                "id": output_id,
                "owner_id": uid,
                "project_id": "project-1",
                "assets": {
                    "map": {
                        "storage_path": "users/test-uid-123/projects/project-1/outputs/output-1/map.png",
                    }
                },
            },
        )
        monkeypatch.setattr(
            project_assets,
            "download_bytes",
            lambda path: b"fake-png-bytes",
        )

        resp = client.get("/geomoz-api/outputs/output-1/map")

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content == b"fake-png-bytes"

    def test_private_map_endpoint_rejects_output_without_asset(
        self, client, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import project_outputs

        monkeypatch.setattr(
            project_outputs,
            "get_output",
            lambda uid, output_id: {
                "id": output_id,
                "owner_id": uid,
                "project_id": "project-1",
                "assets": {},
            },
        )

        resp = client.get("/geomoz-api/outputs/output-1/map")

        assert resp.status_code == 404
