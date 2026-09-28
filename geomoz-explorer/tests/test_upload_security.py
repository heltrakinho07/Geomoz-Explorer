"""Security boundaries for authenticated file conversion and exports."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient


class TestProtectedUtilityEndpoints:
    def test_geometry_conversion_requires_auth(
        self, client: TestClient,
    ) -> None:
        from api import app, require_firebase_auth

        app.dependency_overrides.pop(require_firebase_auth, None)
        resp = client.post(
            "/geomoz-api/convert-geom",
            files={"file": ("area.kml", b"<kml></kml>", "application/vnd.google-earth.kml+xml")},
        )

        assert resp.status_code == 401

    def test_shapefile_export_requires_auth(
        self, client: TestClient,
    ) -> None:
        from api import app, require_firebase_auth

        app.dependency_overrides.pop(require_firebase_auth, None)
        resp = client.get("/geomoz-api/export/shapefile")

        assert resp.status_code == 401

    def test_geometry_conversion_rejects_archive_upload(
        self, client: TestClient,
    ) -> None:
        resp = client.post(
            "/geomoz-api/convert-geom",
            files={"file": ("shapes.zip", b"PK-not-a-real-archive", "application/zip")},
        )

        assert resp.status_code == 400
        assert "KML, GPX ou GeoJSON" in resp.json()["detail"]

    def test_geometry_conversion_enforces_10mb_limit(
        self, client: TestClient,
    ) -> None:
        too_large = io.BytesIO(b"x" * (10 * 1024 * 1024 + 1))

        resp = client.post(
            "/geomoz-api/convert-geom",
            files={"file": ("large.kml", too_large, "application/vnd.google-earth.kml+xml")},
        )

        assert resp.status_code == 413
        assert "10 MB" in resp.json()["detail"]
