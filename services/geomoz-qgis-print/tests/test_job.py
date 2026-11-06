import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from job import InvalidJob, MAX_FEATURES, MAX_POSITIONS, MAX_REQUEST_BYTES, parse_request, validate_job

def good():
    return {
        "title": "Mapa Geológico de Manica", "subtitle": "GeoMoz Explorer",
        "paper": "A3", "orientation": "landscape", "dpi": 300,
        "layers": [{
            "name": "Unidades litológicas", "color": "#7f4ec7",
            "geojson": {"type": "FeatureCollection", "features": [
                {"type": "Feature",
                 "geometry": {"type": "Polygon", "coordinates": [[
                     [32.8, -19.7], [33.2, -19.7], [33.2, -19.3],
                     [32.8, -19.7]]]},
                 "properties": {"litologia": "Granito"}}
            ]}
        }]
    }

class PrintJobTests(unittest.TestCase):
    def test_valid_geological_map(self):
        result = validate_job(good())
        self.assertEqual(result["paper"], "A3")
        self.assertEqual(result["layers"][0]["geojson"]["features"][0]["properties"]["litologia"], "Granito")
        self.assertGreater(result["bbox"][2], result["bbox"][0])
        self.assertEqual(result["attribution"], "Created with GeoMoz Explorer")

    def test_explicit_bbox(self):
        item = good()
        item["bbox"] = [30, -22, 36, -16]
        self.assertEqual(validate_job(item)["bbox"], item["bbox"])

    def test_reject_untrusted_url_or_provider(self):
        item = good()
        item["layers"][0]["geojson"] = {"type": "external", "url": "https://example.com"}
        with self.assertRaises(InvalidJob): validate_job(item)

    def test_reject_projected_and_nonfinite_coordinates(self):
        for coords in ([432000, 7810000], [float("nan"), -19], [True, -19]):
            with self.subTest(coords=coords):
                item = good()
                item["layers"][0]["geojson"]["features"][0]["geometry"] = {
                    "type": "Point", "coordinates": coords}
                with self.assertRaises(InvalidJob): validate_job(item)

    def test_reject_invalid_page_and_style(self):
        for key, val in (("paper", "A0"), ("dpi", 10000), ("orientation", "diagonal")):
            item = good(); item[key] = val
            with self.subTest(key=key), self.assertRaises(InvalidJob): validate_job(item)
        item = good(); item["layers"][0]["color"] = "url(http://evil)"
        with self.assertRaises(InvalidJob): validate_job(item)

    def test_reject_oversized_feature_or_vertex_collections(self):
        item = good()
        feature = item["layers"][0]["geojson"]["features"][0]
        item["layers"][0]["geojson"]["features"] = [feature] * (MAX_FEATURES + 1)
        with self.assertRaises(InvalidJob): validate_job(item)
        item = good()
        item["layers"][0]["geojson"]["features"][0]["geometry"] = {
            "type": "LineString", "coordinates": [[32.8, -19.7]] * (MAX_POSITIONS + 1)
        }
        with self.assertRaises(InvalidJob): validate_job(item)

    def test_reject_huge_or_malformed_requests(self):
        with self.assertRaises(InvalidJob): parse_request(b"x" * (MAX_REQUEST_BYTES + 1))
        with self.assertRaises(InvalidJob): parse_request(b'{"')

    def test_reject_deeply_nested_geometry(self):
        item = good()
        geom = {"type": "Point", "coordinates": [32.8, -19.7]}
        for _ in range(16):
            geom = {"type": "GeometryCollection", "geometries": [geom]}
        item["layers"][0]["geojson"]["features"][0]["geometry"] = geom
        with self.assertRaises(InvalidJob): validate_job(item)

    def test_cartopy_and_projection_grid_contract(self):
        item = good()
        item.update({
            "engine": "cartopy", "map_crs": "EPSG:32736",
            "grid": {"type": "geographic", "interval_degrees": 0.5, "interval_meters": 10000},
        })
        result = validate_job(item)
        self.assertEqual(result["engine"], "cartopy")
        self.assertEqual(result["map_crs"], "EPSG:32736")
        self.assertEqual(result["grid"]["type"], "geographic")
        item["engine"] = "pyqgis"
        item["grid"]["type"] = "both"
        self.assertEqual(validate_job(item)["grid"]["type"], "both")

    def test_print_engine_and_crs_reject_untrusted_inputs(self):
        for invalid in ("external", {"name": "pyqgis"}, None):
            item = good()
            item["engine"] = invalid
            with self.subTest(engine=invalid), self.assertRaises(InvalidJob):
                validate_job(item)
        for invalid in ("EPSG:32700", "EPSG:32761", "EPSG:3857", "file:///etc/passwd"):
            item = good()
            item["map_crs"] = invalid
            with self.subTest(crs=invalid), self.assertRaises(InvalidJob):
                validate_job(item)
        item = good()
        item["engine"] = "cartopy"
        item["grid"] = {"type": "utm"}
        with self.assertRaises(InvalidJob):
            validate_job(item)
        for invalid in (0, -1, float("nan"), "1"):
            item = good()
            item["grid"] = {"type": "geographic", "interval_degrees": invalid}
            with self.subTest(interval=invalid), self.assertRaises(InvalidJob):
                validate_job(item)

    def test_roundtrip(self):
        self.assertEqual(parse_request(json.dumps(good()).encode())["title"],
                         "Mapa Geológico de Manica")

if __name__ == "__main__":
    unittest.main()
