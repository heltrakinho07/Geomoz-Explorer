"""Numerical contracts for global engines, using four-cell rasters offline."""
import asyncio
import math
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from agent import earth_engine_tools as engine
from agent.public_datasets import public_catalogue
from agent.planner import GeoMozAgent
from agent.registry import ToolDispatcher

GEOMETRY = {"type": "Polygon", "coordinates": [[[32, -20], [33, -20], [33, -19], [32, -19], [32, -20]]]}
GRID = {"scale": 30, "crs": engine.ANALYSIS_CRS_WKT}

class Info:
    def __init__(self, value): self.value = value
    def getInfo(self): return self.value

class Reducer:
    def __init__(self, kind): self.kind = kind
    def combine(self, *args, **kwargs): return self
    def group(self, *args, **kwargs): return Reducer("group")

class Raster:
    def __init__(self, values, valid=None):
        self.values = values
        self.valid = valid if valid is not None else [True] * len(values)
    def rename(self, name): return self
    def mask(self): return Raster([int(x) for x in self.valid])
    def _binary(self, other, op):
        other = other if isinstance(other, Raster) else Raster([other] * len(self.values))
        return Raster([op(a, b) for a, b in zip(self.values, other.values)], [a and b for a, b in zip(self.valid, other.valid)])
    def subtract(self, other): return self._binary(other, lambda a, b: a - b)
    def multiply(self, other): return self._binary(other, lambda a, b: a * b)
    def gt(self, other): return self._binary(other, lambda a, b: a > b)
    def gte(self, other): return self._binary(other, lambda a, b: a >= b)
    def lt(self, other): return self._binary(other, lambda a, b: a < b)
    def lte(self, other): return self._binary(other, lambda a, b: a <= b)
    def And(self, other): return self._binary(other, lambda a, b: bool(a and b))
    def updateMask(self, mask): return Raster(self.values, [a and b and bool(v) for a, b, v in zip(self.valid, mask.valid, mask.values)])
    def clip(self, region): return self
    def reduceRegion(self, reducer, **grid):
        values = [v for v, valid in zip(self.values, self.valid) if valid]
        if reducer.kind == "sum": return Info({"area": sum(values) if values else None})
        return Info({"value_mean": sum(values) / len(values) if values else None,
                     "value_count": len(values), "value_min": min(values) if values else None,
                     "value_max": max(values) if values else None})

FAKE_EE = SimpleNamespace(
    Image=SimpleNamespace(pixelArea=lambda: Raster([1_000_000] * 4)),
    Reducer=SimpleNamespace(mean=lambda: Reducer("summary"), minMax=lambda: Reducer("minmax"),
                            stdDev=lambda: Reducer("stdDev"), count=lambda: Reducer("count"), sum=lambda: Reducer("sum")))

class PublicDataTests(unittest.TestCase):
    def test_reduction_grid_sends_explicit_wkt_and_preserves_metric_scale(self):
        region = MagicMock()
        region.area.return_value.getInfo.return_value = 1_000_000
        with patch.dict("sys.modules", {"ee": SimpleNamespace()}):
            selected, grid, area = engine._grid(region, 30)
        self.assertIs(selected, region)
        self.assertTrue(grid["crs"].startswith("PROJCS["))
        self.assertEqual(grid["scale"], 30)
        self.assertEqual(area, 1_000_000)
        meta = engine._base(engine.WORLDCOVER, grid, area, "")
        self.assertEqual(meta["analysisCRS"], "EPSG:6933")
        self.assertEqual(meta["analysisCRSWKT"], grid["crs"])

    def test_wkt_is_equivalent_to_epsg_6933_in_independent_proj_parser(self):
        try:
            from pyproj import CRS
        except ImportError:
            self.skipTest("PROJ validation runs in the full Python API CI")
        supplied = CRS.from_wkt(engine.ANALYSIS_CRS_WKT)
        self.assertTrue(supplied.equals(CRS.from_epsg(6933), ignore_axis_order=True))
        self.assertEqual(supplied.axis_info[0].unit_name, "metre")

    def test_temporal_delta_uses_b_minus_a_on_common_observations(self):
        before = Raster([.2, .8, .1, .5], [True, True, False, True])
        after = Raster([.6, .4, .9, .7], [True, True, True, False])
        with patch.dict("sys.modules", {"ee": FAKE_EE}), patch.object(engine, "_grid", return_value=("region", GRID, 4_000_000)), \
             patch.object(engine, "_s2_image", side_effect=[(before, 3), (after, 4)]), patch.object(engine, "_tile", return_value="tiles"):
            result = engine.temporal_change(GEOMETRY, "ndvi", "2020-01-01", "2021-01-01", "2025-01-01", "2026-01-01")
        self.assertAlmostEqual(result["mean"], 0)
        self.assertEqual(result["commonValidAreaKm2"], 2)
        self.assertEqual(result["increaseAreaKm2"], 1)
        self.assertEqual(result["decreaseAreaKm2"], 1)
        self.assertEqual(result["coveragePercent"], 50)
        self.assertIn("B - A".replace("-", "−"), result["summary"])

    def test_zonal_percentage_denominator_excludes_clouds_and_preserves_zero(self):
        image = Raster([0, .5, .9, .8], [True, True, False, False])
        with patch.dict("sys.modules", {"ee": FAKE_EE}), patch.object(engine, "_grid", return_value=("region", GRID, 4_000_000)), \
             patch.object(engine, "_s2_image", return_value=(image, 5)), patch.object(engine, "_tile", return_value="tiles"):
            result = engine.zonal_statistics(GEOMETRY, "ndvi", "2025-01-01", "2026-01-01", threshold=.3)
        self.assertEqual(result["mean"], .25)
        self.assertEqual(result["validAreaKm2"], 2)
        self.assertEqual(result["selectedAreaKm2"], 1)
        self.assertEqual(result["selectedPercentOfValidArea"], 50)

    def test_no_data_is_an_error_not_zero_area_change(self):
        masked = Raster([0] * 4, [False] * 4)
        with patch.dict("sys.modules", {"ee": FAKE_EE}), patch.object(engine, "_grid", return_value=("region", GRID, 4_000_000)), \
             patch.object(engine, "_s2_image", return_value=(masked, 5)):
            with self.assertRaisesRegex(ValueError, "Sem pixels válidos"):
                engine.zonal_statistics(GEOMETRY, "ndvi", "2025-01-01", "2026-01-01")

    def test_grid_accepts_district_geometry_from_shapely_mapping(self):
        district = {"type": "MultiPolygon",
                    "coordinates": ((((38, -14), (39, -14), (39, -13), (38, -14)),),)}
        ee = MagicMock()
        region = ee.Geometry.return_value
        region.area.return_value.getInfo.return_value = 1_000_000
        with patch.dict("sys.modules", {"ee": ee}):
            result, _, _ = engine._grid(district)
        self.assertIs(result, region)
        ee.Geometry.assert_called_once_with(
            {"type": "MultiPolygon", "coordinates": [[[[38, -14], [39, -14], [39, -13], [38, -14]]]]},
            "EPSG:4326", False,
        )

    def test_invalid_geometry_periods_and_scale_fail_before_ee_rpc(self):
        for geometry in (None, {}, {"type": "Point", "coordinates": [32, -20]},
                         {"type": "Polygon", "coordinates": [[[999, 0], [0, 1], [0, 2], [999, 0]]]}):
            with self.assertRaises(ValueError): engine.validate_geometry(geometry)
        for args in (("2016-01-01", "2017-01-01"), ("2025-01-01", "2024-01-01"), ("bad", "2025-01-01")):
            with self.assertRaises(ValueError): engine.validate_period(*args, earliest="2017-03-28")
        with self.assertRaisesRegex(ValueError, "sobrepor"):
            engine.temporal_change(GEOMETRY, "ndvi", "2020-01-01", "2021-01-01", "2020-02-01", "2021-02-01")
        self.assertEqual(engine.grid_scale(900_000_000, 30), 30)
        self.assertGreater(engine.grid_scale(100_000_000_000, 30), 30)
        with self.assertRaises(ValueError): engine.grid_scale(1000, 5, native=10)

    def test_country_uses_iso3_boundary_not_display_bbox(self):
        selected = MagicMock()
        selected.size.return_value.getInfo.return_value = 1
        ee = MagicMock()
        ee.FeatureCollection.return_value.filter.return_value = selected
        with patch.dict("sys.modules", {"ee": ee}):
            result = engine.country_geometry("PRT")
        ee.FeatureCollection.assert_called_once_with("WM/geoLab/geoBoundaries/600/ADM0")
        ee.Filter.eq.assert_called_once_with("shapeGroup", "PRT")
        selected.geometry.assert_called_once_with(maxError=100)
        self.assertIs(result, selected.geometry.return_value)

    def test_catalogue_distinguishes_connected_from_catalogue_only(self):
        data = public_catalogue()
        self.assertGreaterEqual(len(data["datasets"]), 11)
        worldcover = next(row for row in data["datasets"] if row["id"] == engine.WORLDCOVER)
        self.assertEqual(worldcover["period"], "2021 (produto estático)")
        self.assertEqual(worldcover["connection"], "implemented")
        self.assertTrue(all(row.get("catalogUrl") and row.get("license") for row in data["datasets"]))

    def test_climate_precipitation_units_and_incomplete_period(self):
        collection = MagicMock()
        collection.filterBounds.return_value.filterDate.return_value.select.return_value = collection
        collection.size.return_value.getInfo.return_value = 2
        collection.sum.return_value = Raster([.001, .002, .003, .004])
        ee = SimpleNamespace(**vars(FAKE_EE), ImageCollection=lambda asset: collection)
        with patch.dict("sys.modules", {"ee": ee}), patch.object(engine, "_grid", return_value=("region", GRID, 4_000_000)), \
             patch.object(engine, "_tile", return_value="tiles"):
            result = engine.climate(GEOMETRY, "2025-01-01", "2025-01-03")
            self.assertEqual(result["mean"], 2.5)  # m -> mm, two-day sum not annualised.
            collection.size.return_value.getInfo.return_value = 1
            with self.assertRaisesRegex(ValueError, "incompleto"):
                engine.climate(GEOMETRY, "2025-01-01", "2025-01-03")

    def test_chat_uses_custom_dates_and_retains_selected_fao_area(self):
        state = {"aoi": {"source": "country", "countryCode": "MOZ",
                         "boundarySource": "gaul2025", "label": "Chimoio, Manica",
                         "adminLevel": 2, "admin2Code": 7},
                 "temporalWindow": {"startDate": "2025-01-01", "endDate": "2026-01-01"}}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "mean": 0.35}) as execute:
            result = asyncio.run(GeoMozAgent.process_user_request(
                "Calcular estatísticas zonais de NDVI em Chimoio entre 2025-05-01 e 2025-09-01",
                state, openai_api_key="sk-test"))
        tool, args, context = execute.await_args.args
        self.assertEqual(tool, "calculate_zonal_statistics")
        self.assertEqual(args["start_date"], "2025-05-01")
        self.assertEqual(args["end_date"], "2025-09-01")
        self.assertEqual(context["aoi"]["admin2Code"], 7)
        self.assertEqual(result["intelligence"]["period"]["startDate"], "2025-05-01")
        self.assertEqual(state["temporalWindow"]["startDate"], "2025-01-01")

    def test_chat_asks_for_a_mismatched_area_before_running_worldcover(self):
        with patch.object(ToolDispatcher, "execute", new_callable=AsyncMock) as execute:
            result = asyncio.run(GeoMozAgent.process_user_request(
                "Mapear WorldCover em Lisboa", {"aoi": {"label": "Chimoio, Manica"}}))
        execute.assert_not_awaited()
        self.assertIn("Seleccione no mapa", result["synthesis"])

    def test_maputo_city_worldcover_uses_fao_boundary_instead_of_selected_area(self):
        from agent import administrative_boundaries as boundaries

        state = {"_gee_uid": "user-test",
                 "aoi": {"source": "mozambique", "label": "Maringue, Sofala", "geometry": GEOMETRY}}
        units = [
            {"name": "Maputo", "code": 10, "countryName": "Mozambique", "level": 1},
            {"name": "Maputo City", "code": 11, "countryName": "Mozambique", "level": 1},
        ]
        with patch.dict("sys.modules", {"gee_module": MagicMock(), "ee": MagicMock()}), \
             patch.object(boundaries, "_read_units", return_value=units) as read, \
             patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "summary": "Cobertura 2021"}) as execute:
            result = asyncio.run(GeoMozAgent.process_user_request(
                "podes ver o uso e cobertura de solo para cidade de maputo",
                state, provider="openai", openai_api_key="sk-test"))
        read.assert_called_once()
        self.assertEqual(result["provider"], "public-data-engine")
        tool, _, context = execute.await_args.args
        self.assertEqual(tool, "get_public_landcover")
        self.assertEqual(context["aoi"]["admin1Code"], 11)
        self.assertEqual(context["aoi"]["boundarySource"], "gaul2025")
        self.assertNotIn("geometry", context["aoi"])
        self.assertEqual(state["aoi"]["label"], "Maringue, Sofala")

    def test_city_request_does_not_substitute_a_province_with_the_same_name(self):
        from agent import administrative_boundaries as boundaries

        state = {"_gee_uid": "user-test",
                 "aoi": {"source": "country", "countryCode": "MOZ", "label": "Maputo"}}
        province = {"name": "Maputo", "code": 10, "countryName": "Mozambique", "level": 1}
        with patch.dict("sys.modules", {"gee_module": MagicMock(), "ee": MagicMock()}), \
             patch.object(boundaries, "_read_units", side_effect=[[province], []]), \
             patch.object(ToolDispatcher, "execute", new_callable=AsyncMock) as execute:
            result = asyncio.run(GeoMozAgent.process_user_request(
                "Cobertura do solo na cidade de Maputo", state))
        execute.assert_not_awaited()
        self.assertIn("Não encontrei", result["synthesis"])

    def test_structured_request_bypasses_llm_but_uses_audited_dispatcher(self):
        state = {"aoi": {"source": "country", "countryCode": "PRT", "geometry": GEOMETRY},
                 "publicAnalysis": {"tool": "get_public_landcover", "args": {}}}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "summary": "Cobertura 2021", "year": 2021, "source": "ESA"}) as implementation:
            result = asyncio.run(GeoMozAgent.process_user_request("WorldCover", state, openai_api_key="sk-test"))
        implementation.assert_awaited_once()
        self.assertEqual(result["provider"], "public-data-engine")
        self.assertEqual(result["intelligence"]["evidence"][0]["period"], {"year": 2021})

    def test_dispatcher_replaces_country_bbox_with_actual_boundary(self):
        boundary = object()
        state = {"_gee_uid": "user-test", "aoi": {"source": "country", "countryCode": "PRT", "geometry": GEOMETRY}}
        with patch.dict("sys.modules", {"gee_module": MagicMock()}), \
             patch.object(engine, "country_geometry", return_value=boundary) as resolve, \
             patch.object(engine, "landcover", return_value={"status": "success", "warning": "2021", "year": 2021}) as calculate:
            result = asyncio.run(ToolDispatcher.execute("get_public_landcover", {}, state))
        resolve.assert_called_once_with("PRT")
        calculate.assert_called_once_with(boundary, 30)
        self.assertEqual(result["boundarySource"]["id"], "WM/geoLab/geoBoundaries/600/ADM0")
        self.assertIsNone(state["aoi"]["geometry"])
        self.assertEqual(result["provenance"]["period"], {"year": 2021})

    def test_landcover_groups_use_classified_valid_area(self):
        image = MagicMock()
        collection = MagicMock()
        collection.first.return_value.select.return_value.clip.return_value = image
        px = MagicMock()
        px.rename.return_value.addBands.return_value.reduceRegion.return_value.getInfo.return_value = {
            "groups": [{"class": 10, "sum": 3_000_000}, {"class": 80, "sum": 1_000_000}]}
        ee = SimpleNamespace(ImageCollection=lambda asset: collection,
                             Image=SimpleNamespace(pixelArea=lambda: px), Reducer=FAKE_EE.Reducer)
        with patch.dict("sys.modules", {"ee": ee}), patch.object(engine, "_grid", return_value=("region", GRID, 5_000_000)), \
             patch.object(engine, "_tile", return_value="tiles"):
            result = engine.landcover(GEOMETRY)
        self.assertEqual(result["year"], 2021)
        self.assertEqual(result["validAreaKm2"], 4)
        self.assertEqual(result["classes"][0]["percentOfValidArea"], 75)
        self.assertEqual(result["classes"][1]["name"], "Água permanente")

    def test_catalogue_does_not_authenticate_gee_or_claim_a_calculation(self):
        with patch.dict("sys.modules", {"gee_module": MagicMock()}) as modules:
            result = asyncio.run(GeoMozAgent.process_user_request("Quais fontes públicas mundiais existem?", {}))
        self.assertEqual(result["status"], "reference")
        self.assertEqual(result["intelligence"]["successfulTools"], 0)

if __name__ == "__main__": unittest.main()

