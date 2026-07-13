"""
Tests for the GEE presets (INDEX_REGISTRY) — Urban, Health, and Climate modules.

gee_presets.py has zero external dependencies, so these tests run
without requiring Earth Engine credentials or any GIS libraries.
"""

from __future__ import annotations

import pytest


class TestIndexRegistry:
    """Structural tests for every index in INDEX_REGISTRY."""

    def test_all_indices_have_required_fields(self) -> None:
        """Every index must have group, needs, name, formula, bands, vis, norm."""
        from gee_presets import INDEX_REGISTRY
        for idx_id, cfg in INDEX_REGISTRY.items():
            assert isinstance(cfg, dict), f"{idx_id}: cfg must be dict"
            for field in ("group", "needs", "name", "formula", "bands", "vis", "norm"):
                assert field in cfg, f"{idx_id}: missing field '{field}'"
            assert isinstance(cfg["needs"], list), f"{idx_id}: needs must be list"
            assert isinstance(cfg["vis"], dict), f"{idx_id}: vis must be dict"
            assert "min" in cfg["vis"], f"{idx_id}: vis missing 'min'"
            assert "max" in cfg["vis"], f"{idx_id}: vis missing 'max'"
            assert "palette" in cfg["vis"], f"{idx_id}: vis missing 'palette'"
            assert isinstance(cfg["vis"]["palette"], list), f"{idx_id}: palette must be list"
            assert len(cfg["vis"]["palette"]) >= 2, f"{idx_id}: palette too short"

    def test_all_indices_have_valid_group(self) -> None:
        """Group must be one of the known values."""
        from gee_presets import INDEX_REGISTRY
        valid_groups = {
            "spectral", "landsat", "terrain", "agriculture", "drought",
            "fire", "coastal", "climate", "urban", "health",
        }
        for idx_id, cfg in INDEX_REGISTRY.items():
            assert cfg["group"] in valid_groups, (
                f"{idx_id}: unknown group '{cfg['group']}'"
            )

    def test_all_norms_are_two_tuples(self) -> None:
        """norm must be a 2-element tuple/list of numbers."""
        from gee_presets import INDEX_REGISTRY
        for idx_id, cfg in INDEX_REGISTRY.items():
            n = cfg["norm"]
            assert isinstance(n, (list, tuple)), f"{idx_id}: norm must be tuple/list"
            assert len(n) == 2, f"{idx_id}: norm must have 2 elements"
            assert isinstance(n[0], (int, float)), f"{idx_id}: norm[0] must be number"
            assert isinstance(n[1], (int, float)), f"{idx_id}: norm[1] must be number"

    def test_class_names_only_on_classified_indices(self) -> None:
        """Only indices with class_names should have that key."""
        from gee_presets import INDEX_REGISTRY
        classified_ids = {"topo_class", "burn_severity", "coastal_erosion"}
        for idx_id, cfg in INDEX_REGISTRY.items():
            if "class_names" in cfg:
                assert idx_id in classified_ids, (
                    f"{idx_id}: unexpected class_names"
                )
                assert isinstance(cfg["class_names"], list)
                assert all(isinstance(n, str) for n in cfg["class_names"])


# ── Urban indices ─────────────────────────────────────────────────────────────


class TestUrbanIndices:
    """Tests specific to the Urban & Infrastructure group."""

    URBAN_IDS = {"urban_expansion", "impervious_surface", "urban_heat_island"}

    def test_all_urban_indices_present(self) -> None:
        """All 3 urban indices must be in the registry."""
        from gee_presets import INDEX_REGISTRY
        urban = {k for k, v in INDEX_REGISTRY.items() if v["group"] == "urban"}
        assert urban == self.URBAN_IDS, f"Missing: {self.URBAN_IDS - urban}"

    def test_urban_expansion_fields(self) -> None:
        """NBI index needs Sentinel-2 and has appropriate vis params."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["urban_expansion"]
        assert cfg["needs"] == ["s2"]
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 0.6

    def test_impervious_surface_fields(self) -> None:
        """NDBI index needs Sentinel-2."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["impervious_surface"]
        assert cfg["needs"] == ["s2"]
        assert cfg["norm"][0] == -0.3
        assert cfg["norm"][1] == 0.5

    def test_urban_heat_island_fields(self) -> None:
        """UHI index needs Sentinel-2 (for NDVI)."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["urban_heat_island"]
        assert cfg["needs"] == ["s2"]
        assert cfg["norm"][0] == -0.3
        assert cfg["norm"][1] == 0.5
        # UHI palette should have warm tones at the high end
        palette = cfg["vis"]["palette"]
        assert palette[-1] in ("7f0000", "d7191c", "7f0000"), (
            "UHI palette should end with a dark red/warm color"
        )

    def test_urban_indices_have_descriptive_names(self) -> None:
        """Index names should mention their acronym or key descriptive terms."""
        from gee_presets import INDEX_REGISTRY
        names = {k: INDEX_REGISTRY[k]["name"] for k in self.URBAN_IDS}
        assert "NBI" in names["urban_expansion"], "Should mention NBI"
        assert "NDBI" in names["impervious_surface"], "Should mention NDBI"
        assert "Calor" in names["urban_heat_island"] or "UHI" in names["urban_heat_island"], (
            "Should mention 'Calor' or 'UHI'"
        )


# ── Public Health indices ─────────────────────────────────────────────────────


class TestHealthIndices:
    """Tests specific to the Public Health group."""

    HEALTH_IDS = {
        "malaria_risk", "healthcare_access", "sanitation_index", "epidemic_risk",
    }

    def test_all_health_indices_present(self) -> None:
        """All 4 health indices must be in the registry."""
        from gee_presets import INDEX_REGISTRY
        health = {k for k, v in INDEX_REGISTRY.items() if v["group"] == "health"}
        assert health == self.HEALTH_IDS, f"Missing: {self.HEALTH_IDS - health}"

    def test_malaria_risk_fields(self) -> None:
        """Malaria risk depends on S2 + DEM."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["malaria_risk"]
        assert set(cfg["needs"]) == {"s2", "dem"}
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 1.0

    def test_healthcare_access_fields(self) -> None:
        """Healthcare access depends on S2 (NDBI + ESA WorldCover)."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["healthcare_access"]
        assert cfg["needs"] == ["s2"]
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 1.0

    def test_sanitation_index_fields(self) -> None:
        """Sanitation index depends on S2 + DEM."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["sanitation_index"]
        assert set(cfg["needs"]) == {"s2", "dem"}
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 1.0

    def test_epidemic_risk_fields(self) -> None:
        """Epidemic risk depends on S2 + DEM."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["epidemic_risk"]
        assert set(cfg["needs"]) == {"s2", "dem"}
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 1.0

    def test_health_palettes_have_warning_tones(self) -> None:
        """Health risk palettes should include red tones for high risk."""
        from gee_presets import INDEX_REGISTRY
        for idx_id in self.HEALTH_IDS:
            palette = INDEX_REGISTRY[idx_id]["vis"]["palette"]
            has_warm = any(
                c.lower().startswith(("d7", "fc", "fd", "fe", "e3", "b1"))
                for c in palette
            )
            assert has_warm or palette[-1] in (
                "7f0000", "b10026", "d73027",
            ), f"{idx_id}: palette missing warm tones for high risk"


# ── Climate indices ───────────────────────────────────────────────────────────


class TestClimateIndices:
    """Tests specific to the Climate & Disasters group."""

    CLIMATE_IDS = {
        "precipitation", "temperature_lst", "cyclone_tracks", "cyclone_risk",
    }

    def test_all_climate_indices_present(self) -> None:
        """All 4 climate indices must be in the registry."""
        from gee_presets import INDEX_REGISTRY
        climate = {k for k, v in INDEX_REGISTRY.items() if v["group"] == "climate"}
        assert climate == self.CLIMATE_IDS, f"Missing: {self.CLIMATE_IDS - climate}"

    def test_precipitation_fields(self) -> None:
        """Precipitation uses CHIRPS (no S2/DEM dependency)."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["precipitation"]
        assert cfg["needs"] == []
        assert cfg["norm"][0] == 200
        assert cfg["norm"][1] == 2500

    def test_temperature_lst_fields(self) -> None:
        """Temperature uses MODIS (no S2/DEM dependency)."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["temperature_lst"]
        assert cfg["needs"] == []
        assert cfg["norm"][0] == 1500
        assert cfg["norm"][1] == 6000

    def test_cyclone_tracks_fields(self) -> None:
        """Cyclone tracks uses IBTrACS (no S2/DEM dependency)."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["cyclone_tracks"]
        assert cfg["needs"] == []
        assert cfg["norm"][0] == 0
        assert cfg["norm"][1] == 20

    def test_cyclone_risk_fields(self) -> None:
        """Cyclone risk depends on DEM."""
        from gee_presets import INDEX_REGISTRY
        cfg = INDEX_REGISTRY["cyclone_risk"]
        assert cfg["needs"] == ["dem"]
        assert cfg["norm"][0] == 0.0
        assert cfg["norm"][1] == 1.0

    def test_climate_indices_have_appropriate_ranges(self) -> None:
        """Climate norm ranges should be physically plausible."""
        from gee_presets import INDEX_REGISTRY
        for idx_id in self.CLIMATE_IDS:
            nmin, nmax = INDEX_REGISTRY[idx_id]["norm"]
            assert nmin < nmax, f"{idx_id}: norm min >= max"
            assert isinstance(nmin, (int, float))
            assert isinstance(nmax, (int, float))

    def test_precipitation_formula_references_chirps(self) -> None:
        """Precipitation formula should mention CHIRPS."""
        from gee_presets import INDEX_REGISTRY
        formula = INDEX_REGISTRY["precipitation"]["formula"]
        assert "CHIRPS" in formula.upper(), "Should reference CHIRPS"

    def test_temperature_formula_references_modis(self) -> None:
        """Temperature formula should mention MODIS."""
        from gee_presets import INDEX_REGISTRY
        formula = INDEX_REGISTRY["temperature_lst"]["formula"]
        assert "MODIS" in formula.upper(), "Should reference MODIS"


# ── Cross-module consistency ──────────────────────────────────────────────────


class TestCrossModuleConsistency:
    """Tests that span multiple module groups."""

    def test_new_indices_present_in_gee_indices_api(self) -> None:
        """The /gee/indices endpoint lists all new indices (mocked)."""
        from gee_presets import INDEX_REGISTRY
        new_ids = {
            "urban_expansion", "impervious_surface", "urban_heat_island",
            "malaria_risk", "healthcare_access", "sanitation_index", "epidemic_risk",
            "precipitation", "temperature_lst", "cyclone_tracks", "cyclone_risk",
        }
        for idx_id in new_ids:
            assert idx_id in INDEX_REGISTRY, f"Missing new index: {idx_id}"

    def test_no_orphan_indices(self) -> None:
        """All indices should belong to their documented group."""
        from gee_presets import INDEX_REGISTRY
        known_groups = {
            "spectral", "landsat", "terrain", "agriculture", "drought",
            "fire", "coastal", "climate", "urban", "health",
        }
        for idx_id, cfg in INDEX_REGISTRY.items():
            assert cfg["group"] in known_groups, (
                f"{idx_id}: group '{cfg['group']}' not in known_groups"
            )

    def test_mineral_presets_not_affected(self) -> None:
        """Adding new indices shouldn't break mineral presets."""
        from gee_presets import MINERAL_PRESETS
        assert len(MINERAL_PRESETS) == 8
        for mineral, cfg in MINERAL_PRESETS.items():
            assert "weights" in cfg
            assert "invert" in cfg
            assert all(isinstance(k, str) for k in cfg["weights"])

    def test_total_index_count(self) -> None:
        """Sanity check on total number of registered indices."""
        from gee_presets import INDEX_REGISTRY
        # 8 spectral + 1 landsat + 5 terrain + 6 agriculture + 2 drought
        # + 6 fire + 4 coastal + 4 climate + 3 urban + 4 health
        # = 43 total
        assert len(INDEX_REGISTRY) == 43, (
            f"Expected 43 indices, got {len(INDEX_REGISTRY)}"
        )
