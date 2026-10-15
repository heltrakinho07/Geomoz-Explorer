"""Generate independent planar reference fixtures; pip install shapely==2.1.2.

GEOS uses Cartesian input units. These tests compare topology, area and
centroids in degrees, not GEOS degree buffers against Turf metre buffers.
"""
import json
from pathlib import Path
import shapely
from shapely.geometry import Polygon, LineString, MultiPolygon, mapping
from shapely.ops import unary_union

a = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)])
b = Polygon([(2, -1), (6, -1), (6, 3), (2, 3)])
hole = Polygon([(0, 0), (6, 0), (6, 4), (0, 4)], [[(1, 1), (3, 1), (3, 2), (1, 2)]])
irregular = Polygon([(0, 0), (6, 0), (6, 1), (1, 1), (1, 4), (0, 4)])
multi = MultiPolygon([Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]), Polygon([(3, 0), (6, 0), (6, 3), (3, 3)])])
centroids = [irregular, hole, multi, LineString([(0, 0), (1, 0), (1, 4)])]
data = {
    "generator": f"Shapely {shapely.__version__}; GEOS {shapely.geos_version_string}",
    "crs": "Cartesian coordinates in input degrees (no projection)",
    "overlay": {"a": mapping(a), "b": mapping(b),
        "intersection": mapping(a.intersection(b)), "difference": mapping(a.difference(b)),
        "union": mapping(unary_union([a, b]))},
    "centroids": [{"geometry": mapping(g), "expected": list(g.centroid.coords)[0]} for g in centroids],
    "invalid": mapping(Polygon([(0, 0), (2, 2), (0, 2), (2, 0)])),
}
target = Path(__file__).resolve().parents[1] / "artifacts/geomoz-react/src/lib/__tests__/fixtures/gis-geos-reference.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(data["generator"])
