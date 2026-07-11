"""
Tests for export utilities (map_to_html, dataframe_to_csv, geodataframe_to_geojson).
"""

from __future__ import annotations

import json

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point


class TestDataFrameToCSV:
    """Tests for dataframe_to_csv."""

    def test_returns_bytes(self) -> None:
        """Should return bytes."""
        from utils.export import dataframe_to_csv
        df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        result = dataframe_to_csv(df)
        assert isinstance(result, bytes)

    def test_contains_data(self) -> None:
        """CSV should contain the data."""
        from utils.export import dataframe_to_csv
        df = pd.DataFrame({"name": ["Tete", "Maputo"]})
        result = dataframe_to_csv(df)
        assert b"Tete" in result
        assert b"Maputo" in result

    def test_includes_header(self) -> None:
        """CSV should include the column name as header."""
        from utils.export import dataframe_to_csv
        df = pd.DataFrame({"province": ["Tete"]})
        result = dataframe_to_csv(df)
        assert b"province" in result


class TestGeoDataFrameToGeoJSON:
    """Tests for geodataframe_to_geojson."""

    @pytest.fixture
    def sample_gdf(self) -> gpd.GeoDataFrame:
        return gpd.GeoDataFrame(
            {"name": ["Test"], "geometry": [Point(33.5, -16.0)]},
            crs="EPSG:4326",
        )

    def test_returns_bytes(self, sample_gdf) -> None:
        """Should return bytes."""
        from utils.export import geodataframe_to_geojson
        result = geodataframe_to_geojson(sample_gdf)
        assert isinstance(result, bytes)

    def test_valid_geojson(self, sample_gdf) -> None:
        """Should produce valid GeoJSON."""
        from utils.export import geodataframe_to_geojson
        result = geodataframe_to_geojson(sample_gdf)
        data = json.loads(result.decode("utf-8"))
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 1

    def test_excludes_internal_columns(self) -> None:
        """Should exclude columns starting with underscore."""
        from utils.export import geodataframe_to_geojson
        gdf = gpd.GeoDataFrame(
            {"_internal": [1], "name": ["Test"], "geometry": [Point(0, 0)]},
            crs="EPSG:4326",
        )
        result = geodataframe_to_geojson(gdf)
        data = json.loads(result.decode("utf-8"))
        props = data["features"][0]["properties"]
        assert "_internal" not in props
        assert "name" in props


class TestMapToHTML:
    """Tests for map_to_html."""

    def test_returns_bytes(self) -> None:
        """Should return bytes."""
        from utils.export import map_to_html
        import folium
        m = folium.Map(location=[0, 0])
        result = map_to_html(m)
        assert isinstance(result, bytes)

    def test_contains_map_elements(self) -> None:
        """HTML should contain map-related elements."""
        from utils.export import map_to_html
        import folium
        m = folium.Map(location=[0, 0])
        result = map_to_html(m)
        assert b"leaflet" in result.lower() or b"map" in result.lower()
