"""
Tests for mapping utilities (_color_for_value, create_base_map).
"""

from __future__ import annotations

import geopandas as gpd
import pytest
from shapely.geometry import Point


class TestColorForValue:
    """Tests for the _color_for_value helper."""

    def test_returns_valid_hex(self) -> None:
        """Should return a valid hex colour."""
        from utils.mapping import _color_for_value
        color = _color_for_value("Granito")
        assert color.startswith("#")
        assert len(color) == 7
        # Valid hex chars
        for i in range(1, 7):
            assert color[i] in "0123456789ABCDEFabcdef"

    def test_deterministic(self) -> None:
        """Same input should always return the same colour."""
        from utils.mapping import _color_for_value
        assert _color_for_value("Xisto") == _color_for_value("Xisto")

    def test_different_inputs_produce_different_colors(self) -> None:
        """Different inputs should (likely) produce different colours."""
        from utils.mapping import _color_for_value
        colors = {_color_for_value(str(i)) for i in range(30)}
        assert len(colors) >= 10  # 25-colour palette, expect diversity

    def test_handles_none(self) -> None:
        """None should return a grey fallback."""
        from utils.mapping import _color_for_value
        color = _color_for_value(None)
        assert color == "#AAAAAA"

    def test_handles_empty_string(self) -> None:
        """Empty string should return a grey fallback."""
        from utils.mapping import _color_for_value
        color = _color_for_value("")
        assert color == "#AAAAAA"

    def test_handles_nan(self) -> None:
        """'nan' string should return a grey fallback."""
        from utils.mapping import _color_for_value
        color = _color_for_value("nan")
        assert color == "#AAAAAA"


class TestCreateBaseMap:
    """Tests for create_base_map."""

    def test_returns_folium_map(self) -> None:
        """Should return a folium Map instance."""
        from utils.mapping import create_base_map
        m = create_base_map()
        assert m.__class__.__name__ == "Map"

    def test_default_location_is_mozambique(self) -> None:
        """Default centre should be Mozambique."""
        from utils.mapping import create_base_map
        m = create_base_map()
        assert m.location == [-18.0, 35.0]

    def test_default_map_has_layers(self) -> None:
        """Default map should have expected attributes."""
        from utils.mapping import create_base_map
        m = create_base_map()
        assert hasattr(m, "location")
        assert m.location == [-18.0, 35.0]

    def test_different_basemap(self) -> None:
        """Should accept different basemap names."""
        from utils.mapping import create_base_map
        m = create_base_map(basemap="OpenStreetMap")
        assert m is not None

    def test_dark_basemap(self) -> None:
        """Dark Matter basemap should work."""
        from utils.mapping import create_base_map
        m = create_base_map(basemap="CartoDB Dark Matter")
        assert m is not None


class TestGeologyLegend:
    """Tests for build_geology_legend."""

    def test_returns_string(self) -> None:
        """Should return an HTML string."""
        from utils.mapping import build_geology_legend
        gdf = gpd.GeoDataFrame(
            {"code2006": ["A1", "B2"], "geometry": [Point(0, 0), Point(1, 1)]},
            crs="EPSG:4326",
        )
        legend = build_geology_legend(gdf, color_by="code2006")
        assert isinstance(legend, str)
        assert len(legend) > 0

    def test_contains_color_boxes(self) -> None:
        """Should contain HTML colour boxes."""
        from utils.mapping import build_geology_legend
        gdf = gpd.GeoDataFrame(
            {"code2006": ["A1"], "geometry": [Point(0, 0)]},
            crs="EPSG:4326",
        )
        legend = build_geology_legend(gdf, color_by="code2006")
        assert "background:" in legend or "style=" in legend

    def test_handles_missing_column(self) -> None:
        """Should handle missing column gracefully."""
        from utils.mapping import build_geology_legend
        gdf = gpd.GeoDataFrame(
            {"geometry": [Point(0, 0)]}, crs="EPSG:4326",
        )
        legend = build_geology_legend(gdf, color_by="nonexistent")
        assert legend == ""
