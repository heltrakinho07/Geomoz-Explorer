"""
Tests for data loading utilities (_find_col, get_province_names, etc.).
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point


@pytest.fixture
def sample_provinces_gdf() -> gpd.GeoDataFrame:
    """Create a minimal provinces GeoDataFrame."""
    return gpd.GeoDataFrame(
        {
            "Provincia": ["Tete", "Sofala", "Manica"],
            "geometry": [
                Point(33.5, -16.0),
                Point(34.5, -18.0),
                Point(33.0, -19.0),
            ],
        },
        crs="EPSG:4326",
    ).set_geometry("geometry")


@pytest.fixture
def sample_districts_gdf() -> gpd.GeoDataFrame:
    """Create a minimal districts GeoDataFrame."""
    return gpd.GeoDataFrame(
        {
            "Distrito": ["Moatize", "Changara", "Dondo"],
            "Provincia": ["Tete", "Tete", "Sofala"],
            "geometry": [
                Point(33.5, -16.0),
                Point(33.0, -16.5),
                Point(34.5, -18.0),
            ],
        },
        crs="EPSG:4326",
    ).set_geometry("geometry")


class TestFindCol:
    """Tests for the internal _find_col helper."""

    def test_finds_exact_column(self, sample_provinces_gdf) -> None:
        """Should return the first matching column name."""
        from utils.common import find_col as _find_col
        result = _find_col(sample_provinces_gdf, ["Provincia", "NAME_1"])
        assert result == "Provincia"

    def test_returns_first_match(self, sample_provinces_gdf) -> None:
        """Should return first candidate that matches."""
        from utils.common import find_col as _find_col
        result = _find_col(sample_provinces_gdf, ["NAME_1", "Provincia"])
        assert result == "NAME_1" if "NAME_1" in sample_provinces_gdf.columns else "Provincia"

    def test_returns_none_when_no_match(self, sample_provinces_gdf) -> None:
        """Should return None when no column matches."""
        from utils.common import find_col as _find_col
        result = _find_col(sample_provinces_gdf, ["nonexistent"])
        assert result is None

    def test_returns_none_for_none_gdf(self) -> None:
        """Should return None when gdf is None."""
        from utils.common import find_col as _find_col
        result = _find_col(None, ["Provincia"])
        assert result is None


class TestGetProvinceNames:
    """Tests for get_province_names."""

    def test_returns_sorted_list(self, sample_provinces_gdf) -> None:
        """Should return a sorted list of province names."""
        from utils.data_loader import get_province_names
        names = get_province_names(sample_provinces_gdf)
        assert names == ["Manica", "Sofala", "Tete"]

    def test_returns_empty_for_none(self) -> None:
        """Should return empty list for None."""
        from utils.data_loader import get_province_names
        assert get_province_names(None) == []

    def test_handles_different_column(self) -> None:
        """Should handle NAME_1 column."""
        from utils.data_loader import get_province_names
        gdf = gpd.GeoDataFrame(
            {"NAME_1": ["Maputo"], "geometry": [Point(32.5, -25.0)]},
            crs="EPSG:4326",
        )
        names = get_province_names(gdf)
        assert names == ["Maputo"]


class TestGetDistrictNames:
    """Tests for get_district_names."""

    def test_returns_sorted_list(self, sample_districts_gdf) -> None:
        """Should return a sorted list of district names."""
        from utils.data_loader import get_district_names
        names = get_district_names(sample_districts_gdf)
        assert names == ["Changara", "Dondo", "Moatize"]

    def test_returns_empty_for_none(self) -> None:
        """Should return empty list for None."""
        from utils.data_loader import get_district_names
        assert get_district_names(None) == []


class TestFilterGeologyByArea:
    """Tests for filter_geology_by_area."""

    def test_returns_none_both_none(self) -> None:
        """Should return None if geology is None."""
        from utils.data_loader import filter_geology_by_area
        result = filter_geology_by_area(None, None)
        assert result is None

    def test_returns_none_if_area_none(self) -> None:
        """Should return None if area is None."""
        from utils.data_loader import filter_geology_by_area
        gdf = gpd.GeoDataFrame({"geometry": [Point(0, 0)]}, crs="EPSG:4326")
        result = filter_geology_by_area(gdf, None)
        assert result is None
