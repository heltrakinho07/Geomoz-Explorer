"""Modes determine Earth Engine statistics cost, not whether imagery is real."""

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


class Reducer:
    def combine(self, *_args, **_kwargs):
        return self


class FakeImage:
    def __init__(self):
        self.reductions = []

    def clip(self, _region):
        return self

    def reduceRegion(self, **options):
        self.reductions.append(options)
        return SimpleNamespace(getInfo=lambda: {"index_mean": 0.41, "index_min": 0.02, "index_max": 0.83})

    def visualize(self, **_options):
        return self

    def getMapId(self):
        return {"tile_fetcher": SimpleNamespace(url_format="https://earthengine.googleapis.com/tile/{z}/{x}/{y}")}


@pytest.fixture()
def fake_gee(monkeypatch):
    import gee_module

    image = FakeImage()
    reducer = SimpleNamespace(
        mean=lambda: Reducer(),
        stdDev=lambda: Reducer(),
        percentile=lambda _: Reducer(),
        minMax=lambda: Reducer(),
    )
    fake_ee = SimpleNamespace(Reducer=reducer)
    monkeypatch.setitem(sys.modules, "ee", fake_ee)
    monkeypatch.setattr(gee_module, "_to_ee_region", lambda _: object())
    monkeypatch.setattr(gee_module, "_build_s2_composite", lambda *args: (image, 12))
    monkeypatch.setattr(gee_module, "_build_index_image", lambda *args, **kwargs: image)
    monkeypatch.setattr(gee_module, "_cache_put", lambda *args, **kwargs: None)
    monkeypatch.setattr(gee_module, "_compute_dynamic_scale", lambda _: 100)

    return gee_module, image


def _calculate(gee_module, processing_mode):
    return gee_module.compute_index_tile(
        "ndvi", None, "2025-01-01", "2025-06-01", 30,
        processing_mode=processing_mode,
    )


def test_fast_mode_retains_real_gis_map_without_stats_reduction(fake_gee):
    gee_module, img = fake_gee
    response = _calculate(gee_module, "fast")
    assert response["sceneCount"] == 12
    assert response["tileUrl"].startswith("https://earthengine.googleapis.com/")
    assert response["statisticsLevel"] == "none"
    assert response["processingMode"] == "fast"
    assert response["stats"] == {}
    assert img.reductions == []
    assert response["durationMs"] >= 0


def test_balanced_reduces_stats_just_once_at_coarse_sampling(fake_gee):
    gee_module, img = fake_gee
    result = _calculate(gee_module, "balanced")
    assert result["statisticsLevel"] == "summary"
    assert result["stats"]["mean"] == 0.41
    assert len(img.reductions) == 1
    assert img.reductions[0]["scale"] == 250


def test_detailed_preserves_full_scientific_statistics(fake_gee, monkeypatch):
    gee_module, img = fake_gee
    region = MagicMock()
    region.area.return_value.getInfo.return_value = 3_000_000.0
    monkeypatch.setattr(gee_module, "_to_ee_region", lambda _: region)
    result = _calculate(gee_module, "detailed")
    assert result["statisticsLevel"] == "detailed"
    assert result["stats"]["areaKm2"] == 3.0
    assert len(img.reductions) == 1
    assert img.reductions[0]["scale"] == 100


def test_invalid_mode_rejected_before_any_earth_engine_work(fake_gee):
    gee_module, img = fake_gee
    with pytest.raises(ValueError, match="Modo de processamento inválido"):
        _calculate(gee_module, "synthetic")
    assert img.reductions == []


def test_api_request_defaults_to_detailed_for_existing_clients():
    import api

    request = api.GEEIndexRequest(index="ndvi")
    assert request.processing_mode == "detailed"
    assert api.GEEIndexRequest(index="ndvi", processing_mode="fast").processing_mode == "fast"
    with pytest.raises(Exception):
        api.GEEIndexRequest(index="ndvi", processing_mode="invented")
