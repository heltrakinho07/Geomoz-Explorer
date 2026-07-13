"""
Tests for the AlphaEarth Foundations endpoints.

These tests validate:
  - Pydantic request models (field validation)
  - Route existence and error handling
  - GEE integration (mocked)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

# ── Helper: mock GEE response ──────────────────────────────────────────────────

MOCK_ALPHAEARTH_TILE_RESPONSE = {
    "tileUrl": "https://earthengine.googleapis.com/v1/projects/eengine-project/maps/abc123/tiles/{z}/{x}/{y}",
    "name": "AlphaEarth Foundations — PCA (2024)",
    "description": "Redução PCA das 64 bandas de embedding para 3 canais RGB",
    "year": 2024,
    "bands": "64 bandas (A00–A63) → PCA para RGB",
    "group": "alphaearth",
    "source": "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL",
}

MOCK_CLUSTER_RESPONSE = {
    "tileUrl": "https://earthengine.googleapis.com/v1/...",
    "name": "AlphaEarth — K-Means (6 clusters, 2024)",
    "description": "Clusters não-supervisionados sobre as 64 bandas de embedding",
    "year": 2024,
    "nClusters": 6,
    "clusters": [
        {"cluster": 0, "areaKm2": 15000.0, "color": "#a1b2c3"},
        {"cluster": 1, "areaKm2": 8500.0, "color": "#d4e5f6"},
    ],
    "totalKm2": 23500.0,
    "source": "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL",
    "trainPixels": 5000,
    "palette": ["#a1b2c3", "#d4e5f6"],
}

MOCK_SIMILARITY_RESPONSE = {
    "tileUrl": "https://earthengine.googleapis.com/v1/...",
    "name": "Similaridade ao ponto (-18.5, 35.0) — 2024",
    "description": "Similaridade coseno (0–1) ao embedding de referência",
    "year": 2024,
    "referenceLon": 35.0,
    "referenceLat": -18.5,
    "referenceBufM": 500,
    "highAreaKm2": 3200.0,
    "highThreshold": 0.85,
    "source": "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL",
    "palette": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
}

MOCK_CLASSIFY_RESPONSE = {
    "tileUrl": "https://earthengine.googleapis.com/v1/...",
    "name": "AlphaEarth — Random Forest (2 classes, 2024)",
    "description": "Classificação supervisionada (Random Forest, 3 amostras) sobre embeddings",
    "year": 2024,
    "nClasses": 2,
    "nTrain": 3,
    "classes": [
        {"class": 1, "areaKm2": 12000.0, "color": "#22c55e"},
        {"class": 2, "areaKm2": 8000.0, "color": "#ef4444"},
    ],
    "totalKm2": 20000.0,
    "source": "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL",
    "palette": ["#22c55e", "#ef4444"],
}

MOCK_CHANGE_RESPONSE = {
    "tileUrl": "https://earthengine.googleapis.com/v1/...",
    "name": "AlphaEarth — Change Detection 2020→2024",
    "description": "Distância coseno entre embeddings anuais — 0 = igual, 1 = totalmente diferente",
    "yearBefore": 2020,
    "yearAfter": 2024,
    "meanChange": 0.0823,
    "highChangeKm2": 450.0,
    "changeThreshold": 0.15,
    "source": "GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL",
    "palette": ["#f7fcfd", "#e5f5f9", "#ccece6", "#99d8c9", "#66c2a4", "#41ae76", "#238b45", "#005824"],
}

# ── Request Models ─────────────────────────────────────────────────────────────


class TestAlphaEarthEmbeddingRequest:
    """Tests for the GEEEmbeddingRequest model."""

    def test_valid_request(self) -> None:
        """Should accept valid parameters with default year."""
        from api import GEEEmbeddingRequest
        req = GEEEmbeddingRequest()
        assert req.year == 2024
        assert req.pca_scale == 1000

    def test_valid_custom_year(self) -> None:
        """Should accept a custom year in range [2017, 2030]."""
        from api import GEEEmbeddingRequest
        req = GEEEmbeddingRequest(year=2020)
        assert req.year == 2020

    def test_valid_with_province(self) -> None:
        """Should accept province and district fields."""
        from api import GEEEmbeddingRequest
        req = GEEEmbeddingRequest(province="Tete", district="Moatize")
        assert req.province == "Tete"
        assert req.district == "Moatize"


class TestAlphaEarthClusterRequest:
    """Tests for the GEEEmbeddingClusterRequest model."""

    def test_valid_defaults(self) -> None:
        """Should accept valid defaults."""
        from api import GEEEmbeddingClusterRequest
        req = GEEEmbeddingClusterRequest()
        assert req.n_clusters == 6
        assert req.year == 2024
        assert req.scale == 1000

    def test_valid_custom_clusters(self) -> None:
        """Should accept n_clusters in [3, 20]."""
        from api import GEEEmbeddingClusterRequest
        req = GEEEmbeddingClusterRequest(n_clusters=10)
        assert req.n_clusters == 10

    def test_clusters_too_low_raises(self) -> None:
        """Should reject n_clusters < 3."""
        from api import GEEEmbeddingClusterRequest
        with pytest.raises(ValidationError):
            GEEEmbeddingClusterRequest(n_clusters=2)

    def test_clusters_too_high_raises(self) -> None:
        """Should reject n_clusters > 20."""
        from api import GEEEmbeddingClusterRequest
        with pytest.raises(ValidationError):
            GEEEmbeddingClusterRequest(n_clusters=25)


class TestAlphaEarthSimilarityRequest:
    """Tests for the GEEEmbeddingSimilarityRequest model."""

    def test_valid_request(self) -> None:
        """Should accept valid coordinates."""
        from api import GEEEmbeddingSimilarityRequest
        req = GEEEmbeddingSimilarityRequest(
            reference_lon=35.0, reference_lat=-18.5
        )
        assert req.reference_lon == 35.0
        assert req.reference_lat == -18.5
        assert req.year == 2024
        assert req.buffer_m == 500

    def test_valid_custom_buffer(self) -> None:
        """Should accept custom buffer_m."""
        from api import GEEEmbeddingSimilarityRequest
        req = GEEEmbeddingSimilarityRequest(
            reference_lon=34.0, reference_lat=-19.0, buffer_m=1000
        )
        assert req.buffer_m == 1000


class TestAlphaEarthClassifyRequest:
    """Tests for the GEEEmbeddingClassifyRequest model."""

    def test_valid_request(self) -> None:
        """Should accept a training GeoJSON with class property."""
        from api import GEEEmbeddingClassifyRequest
        training = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"class": 1},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[33.0, -16.0], [34.0, -16.0], [34.0, -15.0], [33.0, -15.0], [33.0, -16.0]]],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"class": 2},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[34.0, -16.0], [35.0, -16.0], [35.0, -15.0], [34.0, -15.0], [34.0, -16.0]]],
                    },
                },
            ],
        }
        req = GEEEmbeddingClassifyRequest(training=training)
        assert req.year == 2024
        assert req.class_property == "class"

    def test_default_class_property(self) -> None:
        """Default class property should be 'class'."""
        from api import GEEEmbeddingClassifyRequest
        training = {"type": "FeatureCollection", "features": []}
        req = GEEEmbeddingClassifyRequest(training=training)
        assert req.class_property == "class"


class TestAlphaEarthChangeRequest:
    """Tests for the GEEEmbeddingChangeRequest model."""

    def test_valid_request(self) -> None:
        """Should accept valid year range."""
        from api import GEEEmbeddingChangeRequest
        req = GEEEmbeddingChangeRequest(year_before=2020, year_after=2024)
        assert req.year_before == 2020
        assert req.year_after == 2024
        assert req.scale == 1000

    def test_valid_custom_scale(self) -> None:
        """Should accept custom scale."""
        from api import GEEEmbeddingChangeRequest
        req = GEEEmbeddingChangeRequest(
            year_before=2019, year_after=2023, scale=500
        )
        assert req.scale == 500

    def test_year_before_too_early_raises(self) -> None:
        """Should reject year_before < 2017."""
        from api import GEEEmbeddingChangeRequest
        with pytest.raises(ValidationError):
            GEEEmbeddingChangeRequest(year_before=2015, year_after=2024)

    def test_year_after_too_late_raises(self) -> None:
        """Should reject year_after > 2030."""
        from api import GEEEmbeddingChangeRequest
        with pytest.raises(ValidationError):
            GEEEmbeddingChangeRequest(year_before=2020, year_after=2035)


# ── Endpoints (mocked GEE) ─────────────────────────────────────────────────────


class TestAlphaEarthEmbeddingEndpoint:
    """Tests for POST /geomoz-api/gee/embedding."""

    ENDPOINT = "/geomoz-api/gee/embedding"

    def test_returns_tile_url(self, client: TestClient) -> None:
        """Should return tile URL with PCA-reduced embedding."""
        with patch("gee_module.compute_embedding_tile") as mock_fn:
            mock_fn.return_value = dict(MOCK_ALPHAEARTH_TILE_RESPONSE)
            resp = client.post(self.ENDPOINT, json={"year": 2024})
        assert resp.status_code == 200
        data = resp.json()
        assert data["tileUrl"].startswith("https://earthengine")
        assert data["year"] == 2024
        assert data["group"] == "alphaearth"
        mock_fn.assert_called_once()

    def test_returns_400_for_gee_error(self, client: TestClient) -> None:
        """Should return 400 when GEE computation raises ValueError."""
        with patch("gee_module.compute_embedding_tile") as mock_fn:
            mock_fn.side_effect = ValueError("Embedding not available for year 2010")
            resp = client.post(self.ENDPOINT, json={"year": 2010})
        assert resp.status_code == 400
        assert "Embedding" in resp.json()["detail"]

    def test_returns_503_for_gee_down(self, client: TestClient) -> None:
        """Should return 503 when GEE is not initialized."""
        with patch("gee_module.compute_embedding_tile") as mock_fn:
            mock_fn.side_effect = RuntimeError("GEE not configured")
            resp = client.post(self.ENDPOINT, json={"year": 2024})
        assert resp.status_code == 503

    def test_accepts_province_in_body(self, client: TestClient) -> None:
        """Should accept province parameter in request body."""
        with patch("gee_module.compute_embedding_tile") as mock_fn:
            mock_fn.return_value = dict(MOCK_ALPHAEARTH_TILE_RESPONSE)
            resp = client.post(self.ENDPOINT, json={"year": 2024, "province": "Tete"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("province") == "Tete"

    def test_accepts_province_query_string(self, client: TestClient) -> None:
        """Should accept province via query string param (if endpoint supports it)."""
        # Note: Pydantic model params read from body for POST.
        # This test verifies the endpoint doesn't crash when query params are present.
        with patch("gee_module.compute_embedding_tile") as mock_fn:
            mock_fn.return_value = dict(MOCK_ALPHAEARTH_TILE_RESPONSE)
            resp = client.post(f"{self.ENDPOINT}?province=Tete", json={"year": 2024})
        # Should return 200 even without province in body
        assert resp.status_code == 200


class TestAlphaEarthClusterEndpoint:
    """Tests for POST /geomoz-api/gee/embedding/cluster."""

    ENDPOINT = "/geomoz-api/gee/embedding/cluster"

    def test_returns_clusters(self, client: TestClient) -> None:
        """Should return cluster metadata and tile URL."""
        with patch("gee_module.compute_embedding_cluster") as mock_fn:
            mock_fn.return_value = dict(MOCK_CLUSTER_RESPONSE)
            resp = client.post(self.ENDPOINT, json={"n_clusters": 6, "year": 2024})
        assert resp.status_code == 200
        data = resp.json()
        assert data["nClusters"] == 6
        assert len(data["clusters"]) == 2
        assert data["totalKm2"] > 0
        mock_fn.assert_called_once()

    def test_validates_n_clusters(self, client: TestClient) -> None:
        """Should return 422 for n_clusters out of range."""
        resp = client.post(self.ENDPOINT, json={"n_clusters": 1})
        assert resp.status_code == 422

    def test_returns_503_for_gee_error(self, client: TestClient) -> None:
        """Should return 503 when GEE clusterer fails."""
        with patch("gee_module.compute_embedding_cluster") as mock_fn:
            mock_fn.side_effect = RuntimeError("GEE not configured")
            resp = client.post(self.ENDPOINT, json={"n_clusters": 6, "year": 2024})
        assert resp.status_code == 503


class TestAlphaEarthSimilarityEndpoint:
    """Tests for POST /geomoz-api/gee/embedding/similarity."""

    ENDPOINT = "/geomoz-api/gee/embedding/similarity"

    def test_returns_similarity(self, client: TestClient) -> None:
        """Should return similarity heatmap tile URL."""
        with patch("gee_module.compute_embedding_similarity") as mock_fn:
            mock_fn.return_value = dict(MOCK_SIMILARITY_RESPONSE)
            resp = client.post(
                self.ENDPOINT,
                json={"reference_lon": 35.0, "reference_lat": -18.5, "year": 2024},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["referenceLon"] == 35.0
        assert data["referenceLat"] == -18.5
        assert data["highAreaKm2"] > 0
        mock_fn.assert_called_once()

    def test_requires_coordinates(self, client: TestClient) -> None:
        """Should return 422 when reference coordinates are missing."""
        resp = client.post(self.ENDPOINT, json={"year": 2024})
        assert resp.status_code == 422

    def test_returns_400_for_invalid_point(self, client: TestClient) -> None:
        """Should return 400 when the reference point has no data."""
        with patch("gee_module.compute_embedding_similarity") as mock_fn:
            mock_fn.side_effect = ValueError(
                "Não foi possível extrair embedding no ponto"
            )
            resp = client.post(
                self.ENDPOINT,
                json={"reference_lon": 50.0, "reference_lat": 0.0, "year": 2024},
            )
        assert resp.status_code == 400
        assert "embedding" in resp.json()["detail"].lower()

    def test_returns_500_for_unexpected(self, client: TestClient) -> None:
        """Should return 500 on unexpected errors."""
        with patch("gee_module.compute_embedding_similarity") as mock_fn:
            mock_fn.side_effect = Exception("Unexpected error")
            resp = client.post(
                self.ENDPOINT,
                json={"reference_lon": 35.0, "reference_lat": -18.5, "year": 2024},
            )
        assert resp.status_code == 500


class TestAlphaEarthClassifyEndpoint:
    """Tests for POST /geomoz-api/gee/embedding/classify."""

    ENDPOINT = "/geomoz-api/gee/embedding/classify"

    def test_returns_classification(self, client: TestClient) -> None:
        """Should return classified tile with per-class areas."""
        training = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"class": 1},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[33.0, -16.0], [34.0, -16.0], [34.0, -15.0], [33.0, -15.0], [33.0, -16.0]]],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {"class": 2},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[34.0, -16.0], [35.0, -16.0], [35.0, -15.0], [34.0, -15.0], [34.0, -16.0]]],
                    },
                },
            ],
        }
        with patch("gee_module.compute_embedding_classify") as mock_fn:
            mock_fn.return_value = dict(MOCK_CLASSIFY_RESPONSE)
            resp = client.post(
                self.ENDPOINT,
                json={"training": training, "year": 2024},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["nClasses"] == 2
        assert data["nTrain"] == 3
        assert len(data["classes"]) == 2
        mock_fn.assert_called_once()

    def test_requires_training_data(self, client: TestClient) -> None:
        """Should return 422 when training data is missing."""
        resp = client.post(self.ENDPOINT, json={"year": 2024})
        assert resp.status_code == 422

    def test_returns_400_for_insufficient_samples(self, client: TestClient) -> None:
        """Should return 400 when too few training samples."""
        training = {"type": "FeatureCollection", "features": []}
        with patch("gee_module.compute_embedding_classify") as mock_fn:
            mock_fn.side_effect = ValueError(
                "São necessárias pelo menos 2 amostras de treino"
            )
            resp = client.post(
                self.ENDPOINT,
                json={"training": training, "year": 2024},
            )
        assert resp.status_code == 400
        assert "amostras" in resp.json()["detail"]


class TestAlphaEarthChangeEndpoint:
    """Tests for POST /geomoz-api/gee/embedding/change."""

    ENDPOINT = "/geomoz-api/gee/embedding/change"

    def test_returns_change_detection(self, client: TestClient) -> None:
        """Should return change detection tile with stats."""
        with patch("gee_module.compute_embedding_change") as mock_fn:
            mock_fn.return_value = dict(MOCK_CHANGE_RESPONSE)
            resp = client.post(
                self.ENDPOINT,
                json={"year_before": 2020, "year_after": 2024},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["yearBefore"] == 2020
        assert data["yearAfter"] == 2024
        assert data["meanChange"] == 0.0823
        assert data["highChangeKm2"] == 450.0
        mock_fn.assert_called_once()

    def test_validates_year_before_range(self, client: TestClient) -> None:
        """Should return 422 for year_before < 2017."""
        resp = client.post(
            self.ENDPOINT,
            json={"year_before": 2010, "year_after": 2024},
        )
        assert resp.status_code == 422

    def test_validates_year_after_range(self, client: TestClient) -> None:
        """Should return 422 for year_after > 2030."""
        resp = client.post(
            self.ENDPOINT,
            json={"year_before": 2020, "year_after": 2040},
        )
        assert resp.status_code == 422

    def test_returns_503_for_gee_down(self, client: TestClient) -> None:
        """Should return 503 when GEE is down."""
        with patch("gee_module.compute_embedding_change") as mock_fn:
            mock_fn.side_effect = RuntimeError("GEE not configured")
            resp = client.post(
                self.ENDPOINT,
                json={"year_before": 2020, "year_after": 2024},
            )
        assert resp.status_code == 503

    def test_returns_400_for_invalid_params(self, client: TestClient) -> None:
        """Should return 400 for ValueError from the module."""
        with patch("gee_module.compute_embedding_change") as mock_fn:
            mock_fn.side_effect = ValueError("Ano inválido")
            resp = client.post(
                self.ENDPOINT,
                json={"year_before": 2020, "year_after": 2024},
            )
        assert resp.status_code == 400
