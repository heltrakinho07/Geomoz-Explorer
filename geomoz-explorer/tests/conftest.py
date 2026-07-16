"""
Pytest configuration for GeoMoz API tests.

Provides fixtures that mock external dependencies (geomoz, GEE, etc.)
so that tests run without requiring actual data or credentials.
"""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import MagicMock, patch

import geopandas as gpd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon


def _make_square_polygon(cx: float, cy: float, size_deg: float = 0.5) -> Polygon:
    """Create a square polygon centered at (cx, cy) for mock geometries."""
    h = size_deg / 2
    return Polygon([
        (cx - h, cy - h),
        (cx + h, cy - h),
        (cx + h, cy + h),
        (cx - h, cy + h),
        (cx - h, cy - h),
    ])


def _make_minimal_gdf() -> gpd.GeoDataFrame:
    """Create a minimal GeoDataFrame with one row for testing."""
    return gpd.GeoDataFrame(
        {
            "Provincia": ["Tete"],
            "NAME_1": ["Tete"],
            "Distrito": ["Moatize"],
            "NAME_2": ["Moatize"],
            "code2006": ["A1"],
            "Legend": ["Granito"],
            "ERA": ["Arcaico"],
            "PERIOD": ["Arcaico"],
            "geometry": [_make_square_polygon(33.5, -16.0)],
        },
        crs="EPSG:4326",
    ).set_geometry("geometry")


@pytest.fixture(autouse=True)
def _disable_rate_limit() -> Generator[None, None, None]:
    """Disable rate limiting for all tests."""
    with patch.dict("os.environ", {"DISABLE_RATE_LIMIT": "true"}):
        yield


@pytest.fixture(autouse=True)
def _mock_geomoz() -> Generator[None, None, None]:
    """Mock the geomoz library to return a minimal test GeoDataFrame."""

    gdf = _make_minimal_gdf()

    mock_geomoz = MagicMock()
    mock_geomoz.read_province.return_value = gdf
    mock_geomoz.read_district.return_value = gdf
    mock_geomoz.read_geology.return_value = gdf

    with patch.dict("sys.modules", {"geomoz": mock_geomoz}):
        yield


@pytest.fixture(autouse=True)
def _mock_streamlit() -> Generator[None, None, None]:
    """Mock streamlit so data_loader.py can be imported without it installed."""
    mock_st = MagicMock()
    mock_st.cache_data = lambda **kw: (lambda f: f)
    mock_st.warning = lambda msg: None
    with patch.dict("sys.modules", {"streamlit": mock_st}):
        yield


@pytest.fixture(autouse=True)
def _mock_shapely_ops() -> Generator[None, None, None]:
    """Mock shapely geometry operations to return predictable values."""
    mock_point = MagicMock()
    mock_point.x = 33.5
    mock_point.y = -16.0
    mock_point.area = 0.0

    mock_shape = MagicMock()
    mock_shape.area = 1_000_000_000.0
    mock_shape.length = 500_000.0
    mock_shape.centroid = mock_point
    mock_shape.bounds = (32.0, -17.0, 35.0, -15.0)

    with patch("shapely.geometry.shape", return_value=mock_shape), \
         patch("shapely.geometry.Point", return_value=mock_point), \
         patch("shapely.geometry.mapping", return_value={
             "type": "Polygon",
             "coordinates": [[[32.0, -17.0], [35.0, -17.0], [35.0, -15.0], [32.0, -15.0], [32.0, -17.0]]],
         }):
        yield


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create a FastAPI TestClient with mocked dependencies."""
    from api import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_province_names() -> list[str]:
    """Return a list of Mozambique province names for test assertions."""
    return [
        "Cabo Delgado", "Gaza", "Inhambane", "Manica", "Maputo",
        "Maputo Cidade", "Nampula", "Niassa", "Sofala", "Tete",
        "Zambézia",
    ]
