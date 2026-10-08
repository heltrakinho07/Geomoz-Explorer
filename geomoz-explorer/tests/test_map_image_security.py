"""Security and validation tests for the static map-image request contract."""

from __future__ import annotations

import pytest
from pydantic import ValidationError


def _valid_payload() -> dict:
    return {
        "bounds": {
            "south": -26.0,
            "north": -25.0,
            "west": 32.0,
            "east": 33.0,
        },
        "tile_url": (
            "https://earthengine.googleapis.com/v1/projects/demo/maps/"
            "abc/tiles/{z}/{x}/{y}"
        ),
        "width_mm": 182,
        "height_mm": 100,
        "dpi": 200,
    }


def test_map_image_request_accepts_earth_engine_xyz_url() -> None:
    from api import GEEMapImageRequest

    req = GEEMapImageRequest(**_valid_payload())

    assert req.tile_url is not None
    assert req.bounds["south"] == -26.0


@pytest.mark.parametrize(
    "tile_url",
    [
        "http://earthengine.googleapis.com/v1/maps/x/tiles/{z}/{x}/{y}",
        "https://localhost:8000/tiles/{z}/{x}/{y}",
        "https://127.0.0.1/tiles/{z}/{x}/{y}",
        "https://169.254.169.254/computeMetadata/v1/{z}/{x}/{y}",
        "https://example.com/tiles/{z}/{x}/{y}",
        "https://earthengine.googleapis.com/no-placeholders",
    ],
)
def test_map_image_request_rejects_untrusted_tile_urls(tile_url: str) -> None:
    from api import GEEMapImageRequest

    payload = _valid_payload()
    payload["tile_url"] = tile_url

    with pytest.raises(ValidationError):
        GEEMapImageRequest(**payload)


def test_map_image_request_rejects_out_of_range_bounds() -> None:
    from api import GEEMapImageRequest

    payload = _valid_payload()
    payload["bounds"] = {
        "south": -95,
        "north": 10,
        "west": 20,
        "east": 30,
    }

    with pytest.raises(ValidationError):
        GEEMapImageRequest(**payload)


def test_map_image_request_rejects_excessive_render_dimensions() -> None:
    from api import GEEMapImageRequest

    payload = _valid_payload()
    payload["width_mm"] = 1000
    payload["dpi"] = 600

    with pytest.raises(ValidationError):
        GEEMapImageRequest(**payload)


def test_map_image_request_limits_legend_entries() -> None:
    from api import GEEMapImageRequest

    payload = _valid_payload()
    payload["legend_items"] = [
        {"label": f"Class {i}", "color": "#000000"}
        for i in range(31)
    ]

    with pytest.raises(ValidationError):
        GEEMapImageRequest(**payload)


def test_map_image_request_limits_overlay_size() -> None:
    from api import GEEMapImageRequest

    payload = _valid_payload()
    payload["overlay_geojson"] = {
        "type": "Feature",
        "properties": {"blob": "x" * 2_100_000},
        "geometry": {
            "type": "Point",
            "coordinates": [32.5, -25.5],
        },
    }

    with pytest.raises(ValidationError):
        GEEMapImageRequest(**payload)
