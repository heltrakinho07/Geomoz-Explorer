"""HydroBASINS hierarchy regression tests (offline; no GEE credentials needed)."""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from api import GEEBasinsRequest, GEEWatershedRequest
from gee_module import (
    _HYDROBASINS_CANDIDATES,
    _watershed_hydrobasins,
    compute_watershed_from_point,
)


@pytest.mark.parametrize("level", range(1, 13))
def test_all_levels_are_validated_and_have_a_real_collection(level: int) -> None:
    assert f"WWF/HydroATLAS/v1/Basins/level{level:02d}" in _HYDROBASINS_CANDIDATES[level]
    assert GEEBasinsRequest(level=level).level == level
    assert GEEWatershedRequest(lat=-19.2, lon=33.5, level=level).level == level


@pytest.mark.parametrize("level", (0, -1, 13, 99))
def test_invalid_levels_are_rejected(level: int) -> None:
    with pytest.raises(ValidationError):
        GEEBasinsRequest(level=level)
    with pytest.raises(ValidationError):
        GEEWatershedRequest(lat=-19.2, lon=33.5, level=level)


@pytest.mark.parametrize("level", (1, 4, 6, 10, 12))
def test_containing_basin_uses_exact_requested_level(level: int) -> None:
    ee_mock = MagicMock()
    examined: list[str] = []

    def fake_collection(asset_id: str) -> MagicMock:
        examined.append(asset_id)
        fc = MagicMock()
        fc.filterBounds.return_value.select.return_value.limit.return_value.getInfo.return_value = {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {"SUB_AREA": 43.5}, "geometry": {
                "type": "Polygon", "coordinates": [[[33, -20], [34, -20], [34, -19], [33, -20]]
            }}],
        }
        fc.filterBounds.return_value.select.return_value.limit.return_value.style.return_value.getMapId.return_value = {
            "tile_fetcher": MagicMock(url_format="https://example.test/tiles/{z}/{x}/{y}")
        }
        return fc

    ee_mock.FeatureCollection.side_effect = fake_collection
    with patch.dict(sys.modules, {"ee": ee_mock}):
        result = _watershed_hydrobasins(object(), -19.2, 33.5, level)

    assert result is not None
    assert result["source"] == "hydrobasins"
    assert result["level"] == level
    assert result["areaKm2"] == 43.5
    assert examined
    assert all(f"level{level:02d}" in asset or f"lev{level:02d}" in asset for asset in examined)


def test_d8_fallback_is_not_mislabelled_as_a_hydrobasins_level() -> None:
    ee_mock = MagicMock()
    with (
        patch.dict(sys.modules, {"ee": ee_mock}),
        patch("gee_module._watershed_hydrobasins", return_value=None),
        patch("gee_module._watershed_d8", return_value={"areaKm2": 37.0, "geojson": {}}),
    ):
        result = compute_watershed_from_point(-19.2, 33.5, None, level=3)

    assert result["source"] == "d8"
    assert result["requestedLevel"] == 3
    assert "level" not in result
