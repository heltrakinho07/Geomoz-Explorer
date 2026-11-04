"""GAUL hierarchy contracts: never resolve an administrative unit by name alone."""
import asyncio
import unittest
from unittest.mock import MagicMock, AsyncMock, patch

from agent import administrative_boundaries as boundaries
from agent import earth_engine_tools as engines
from agent.planner import GeoMozAgent
from agent.registry import ToolDispatcher
from agent.public_datasets import source


def mock_ee(records=None, count=1):
    collection = MagicMock()
    collection.filter.return_value = collection
    collection.size.return_value.getInfo.return_value = count
    collection.map.return_value = collection
    collection.limit.return_value.getInfo.return_value = {"features": records or []}
    ee = MagicMock()
    ee.FeatureCollection.return_value = collection
    ee.Filter.eq.side_effect = lambda key, value: (key, value)
    return ee, collection


class GAULTests(unittest.TestCase):
    def test_adm2_requires_country_parent_and_child_code(self):
        ee, collection = mock_ee()
        with patch.dict("sys.modules", {"ee": ee}):
            geometry, meta = boundaries.administrative_geometry("MOZ", 2, 100, 200)
        ee.FeatureCollection.assert_called_once_with("FAO/GAUL/2025/level2")
        self.assertEqual([call.args[0] for call in collection.filter.call_args_list],
                         [("ISO3_CODE", "MOZ"), ("GAUL1_CODE", 100), ("GAUL2_CODE", 200)])
        self.assertEqual(meta["version"], "2025")
        self.assertEqual(meta["admin2Code"], 200)
        self.assertIs(geometry, collection.geometry.return_value)

    def test_country_geometry_is_explicit_adm1_union(self):
        ee, collection = mock_ee()
        with patch.dict("sys.modules", {"ee": ee}):
            _, meta = boundaries.administrative_geometry("PRT")
        ee.FeatureCollection.assert_called_once_with(boundaries.GAUL1)
        collection.filter.assert_called_once_with(("ISO3_CODE", "PRT"))
        self.assertEqual(meta["level"], 0)
        self.assertEqual(meta["derivation"], "union_of_ADM1_by_ISO3")
        self.assertEqual(meta["mergeMaxErrorM"], 100)

    def test_invalid_or_stale_hierarchy_is_rejected(self):
        for args in (("MOZ", 2, None, 4), ("MOZ", 2, 5, None), ("MOZ", 0, 5, None),
                     ("MOZ", 1, 5, 6), ("MOZ", 1, True, None), ("moz", 0, None, None),
                     ("MOZ", 1.0, 5, None)):
            with self.assertRaises(ValueError): boundaries.validate_selection(*args)

    def test_missing_unit_does_not_fall_back_to_whole_country(self):
        ee, collection = mock_ee(count=0)
        with patch.dict("sys.modules", {"ee": ee}):
            with self.assertRaisesRegex(ValueError, "não encontrada"):
                boundaries.administrative_geometry("MOZ", 2, 100, 999)
        collection.geometry.assert_not_called()

    def test_list_adm2_cannot_ignore_parent(self):
        ee, _ = mock_ee()
        with patch.dict("sys.modules", {"ee": ee}):
            with self.assertRaisesRegex(ValueError, "primeiro"):
                boundaries.list_units("MOZ", 2)
        ee.FeatureCollection.assert_not_called()

    def test_lists_are_small_attribute_only_and_sorted(self):
        records = [{"properties": {"GAUL0_NAME": "Mozambique", "GAUL1_CODE": code, "GAUL1_NAME": name}}
                   for code, name in ((2, "Tete"), (1, "Manica"), (2, "Tete"))]
        ee, collection = mock_ee(records)
        fake_feature = MagicMock()
        collection.map.side_effect = lambda fn: (fn(fake_feature), collection)[1]
        with patch.dict("sys.modules", {"ee": ee}):
            result = boundaries.list_units("MOZ", 1)
        self.assertEqual([unit["name"] for unit in result["units"]], ["Manica", "Tete"])
        ee.Feature.assert_called_once_with(None, fake_feature.toDictionary.return_value)
        collection.limit.assert_called_once_with(boundaries.MAX_UNITS + 1)
        self.assertNotIn("geometry", str(result["units"]))
        self.assertEqual(result["source"]["license"], "CC BY 4.0")

    def test_gaul_selected_geometry_reaches_analytical_engine(self):
        aoi = {"source": "country", "countryCode": "MOZ", "boundarySource": "gaul2025",
               "adminLevel": 2, "admin1Code": 100, "admin2Code": 200, "geometry": {"type": "Polygon", "coordinates": []}}
        selected = object()
        with patch.dict("sys.modules", {"gee_module": MagicMock()}), \
             patch.object(boundaries, "administrative_geometry", return_value=(selected, {"dataset": boundaries.GAUL2, "level": 2, "version": "2025"})) as resolver, \
             patch.object(engines, "landcover", return_value={"status": "success", "warning": "2021", "year": 2021}) as engine:
            result = asyncio.run(ToolDispatcher.execute("get_public_landcover", {}, {"aoi": aoi}))
        resolver.assert_called_once_with("MOZ", 2, 100, 200)
        engine.assert_called_once_with(selected, 30)
        self.assertEqual(result["boundarySource"]["id"], boundaries.GAUL2)
        self.assertEqual(result["administrativeSelection"]["level"], 2)
        self.assertEqual(result["provenance"]["scope"]["boundaryDataset"], boundaries.GAUL2)

    def test_existing_index_tool_uses_selected_gaul_polygon_and_request_cache(self):
        geojson = {"type": "Polygon", "coordinates": [[[32, -20], [33, -20], [33, -19], [32, -19], [32, -20]]]}
        geometry = MagicMock()
        geometry.getInfo.return_value = geojson
        gee = MagicMock()
        gee.compute_index_tile.return_value = {"stats": {"mean": 0}, "tileUrl": "tiles"}
        api = MagicMock()
        api._region_geojson.return_value = geojson
        state = {"aoi": {"source": "country", "countryCode": "MOZ", "boundarySource": "gaul2025",
                         "adminLevel": 2, "admin1Code": 100, "admin2Code": 200}}
        async def run():
            await ToolDispatcher.execute("calculate_index", {"index": "ndvi"}, state)
            return await ToolDispatcher.execute("calculate_slope", {}, state)
        with patch.dict("sys.modules", {"gee_module": gee, "api": api}), \
             patch.object(boundaries, "administrative_geometry", return_value=(geometry, {"dataset": boundaries.GAUL2, "level": 2})) as resolve:
            result = asyncio.run(run())
        resolve.assert_called_once()
        self.assertEqual(api._region_geojson.call_args.kwargs["geometry"], geojson)
        self.assertEqual(result["boundarySource"]["id"], boundaries.GAUL2)

    def test_unit_listing_is_reference_not_a_computed_indicator(self):
        context = {"publicAnalysis": {"tool": "list_administrative_units", "args": {"country_code": "MOZ", "level": 1}}}
        with patch.object(ToolDispatcher, "_execute_impl", new_callable=AsyncMock,
                          return_value={"status": "success", "units": [], "source": source(boundaries.GAUL1)}) as dispatcher:
            result = asyncio.run(GeoMozAgent.process_user_request("Listar ADM1", context))
        dispatcher.assert_awaited_once()
        self.assertEqual(result["status"], "reference")
        self.assertEqual(result["intelligence"]["successfulTools"], 0)

if __name__ == "__main__": unittest.main()
