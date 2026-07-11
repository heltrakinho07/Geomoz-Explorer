"""
Tests for analysis utilities (calculate_geology_stats, summarise_geology).
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point


@pytest.fixture
def sample_geology_gdf() -> gpd.GeoDataFrame:
    """Create a minimal geology GeoDataFrame for testing."""
    return gpd.GeoDataFrame(
        {
            "Legend": ["Granito", "Xisto", "Granito", "Basalto"],
            "code2006": ["A1", "B2", "A1", "C3"],
            "ERA": ["Arcaico", "Proterozóico", "Arcaico", "Fanerozóico"],
            "PERIOD": ["Arcaico", "Proterozóico", "Arcaico", "Cretácico"],
            "geometry": [
                Point(33.5, -16.0),
                Point(34.0, -17.0),
                Point(33.8, -16.5),
                Point(34.5, -17.5),
            ],
        },
        crs="EPSG:4326",
    ).set_geometry("geometry")


class TestCalculateGeologyStats:
    """Tests for calculate_geology_stats."""

    def test_returns_dataframe(self, sample_geology_gdf) -> None:
        """Should return a DataFrame."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(sample_geology_gdf)
        assert isinstance(result, pd.DataFrame)

    def test_includes_area_column(self, sample_geology_gdf) -> None:
        """Should include an area column."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(sample_geology_gdf)
        assert "Área_km2" in result.columns

    def test_includes_percentage_column(self, sample_geology_gdf) -> None:
        """Should include a percentage column."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(sample_geology_gdf)
        assert "Percentagem" in result.columns or "Percentagem (%)" in result.columns

    def test_percentages_calculated(self, sample_geology_gdf) -> None:
        """Percentages should be calculated for each lithology."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(sample_geology_gdf)
        pct_col = next((c for c in result.columns if "Percentagem" in c), None)
        assert pct_col is not None
        # Each entry should have a percentage value
        assert all(result[pct_col] >= 0)

    def test_handles_empty_gdf(self) -> None:
        """Should return empty DataFrame for empty input."""
        from utils.analysis import calculate_geology_stats
        empty_gdf = gpd.GeoDataFrame({"geometry": []}, geometry="geometry")
        result = calculate_geology_stats(empty_gdf)
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_handles_none_input(self) -> None:
        """Should return empty DataFrame for None input."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(None)
        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0

    def test_sorted_by_area_descending(self, sample_geology_gdf) -> None:
        """Should be sorted by area descending."""
        from utils.analysis import calculate_geology_stats
        result = calculate_geology_stats(sample_geology_gdf)
        areas = result["Área_km2"].values
        assert all(areas[i] >= areas[i + 1] for i in range(len(areas) - 1))


class TestSummariseGeology:
    """Tests for summarise_geology."""

    def test_returns_dict_with_keys(self, sample_geology_gdf) -> None:
        """Should return a dict with expected keys."""
        from utils.analysis import summarise_geology
        result = summarise_geology(sample_geology_gdf)
        assert "total_features" in result
        assert "total_units" in result
        assert "dominant_lithology" in result
        assert "total_area_km2" in result

    def test_handles_empty_gdf(self) -> None:
        """Should return empty dict for empty input."""
        from utils.analysis import summarise_geology
        empty_gdf = gpd.GeoDataFrame({"geometry": []}, geometry="geometry")
        result = summarise_geology(empty_gdf)
        assert isinstance(result, dict)

    def test_handles_none_input(self) -> None:
        """Should return empty dict for None input."""
        from utils.analysis import summarise_geology
        result = summarise_geology(None)
        assert isinstance(result, dict)

    def test_dominant_lithology_is_string(self, sample_geology_gdf) -> None:
        """Dominant lithology should be a non-empty string."""
        from utils.analysis import summarise_geology
        result = summarise_geology(sample_geology_gdf)
        assert isinstance(result["dominant_lithology"], str)
        assert len(result["dominant_lithology"]) > 0

    def test_total_features_is_positive(self, sample_geology_gdf) -> None:
        """Total features should be positive."""
        from utils.analysis import summarise_geology
        result = summarise_geology(sample_geology_gdf)
        assert result["total_features"] > 0
