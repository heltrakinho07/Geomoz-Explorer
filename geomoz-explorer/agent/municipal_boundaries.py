"""Municipal districts of Maputo, sourced from GeoMoz national layers."""
from functools import lru_cache

from agent.administrative_boundaries import _name_key

DISTRICTS = {
    "kampfumu": ("KaMpfumu", "kampfumo", "Distrito Municipal 1", "DM 1"),
    "nhlamankulu": ("Nhlamankulu", "nlhamankulu", "Distrito Municipal 2", "DM 2"),
    "kamaxaquene": ("KaMaxaquene", "kamaxaqueni", "kamaxakeni", "Distrito Municipal 3", "DM 3"),
    "kamavota": ("KaMavota", "Distrito Municipal 4", "DM 4"),
    "kamubukwana": ("KaMubukwana", "kambukwana", "kamubucwana", "kamabukwana", "Distrito Municipal 5", "DM 5"),
    "katembe": ("KaTembe", "catembe"),
    "kanyaka": ("KaNyaka", "inhaca", "inhaka"),
}
CITY_NAMES = {"maputo", "maputo cidade", "cidade de maputo", "cidade do maputo", "maputo city"}


def _district_key(name):
    return _name_key(name).removeprefix("distrito municipal de ").removeprefix("distrito municipal da ").replace(" ", "")


def municipal_district_code(name):
    target = _district_key(name)
    return next((code for code, names in DISTRICTS.items()
                 if target in {_district_key(alias) for alias in names}), None)


@lru_cache(maxsize=1)
def municipal_districts():
    import geomoz
    from shapely.geometry import mapping
    from shapely.ops import unary_union

    districts = {}
    for loader, column, dataset in (
        (geomoz.read_district, "Distrito", "district_2017.gpkg"),
        (geomoz.read_admin_post, "Posto", "adminpost_2017.gpkg"),
    ):
        data = loader().to_crs("EPSG:4326")
        city = data[data["Provincia"].fillna("").map(_name_key).isin(CITY_NAMES)]
        keys = city[column].fillna("").map(_district_key)
        for code, names in DISTRICTS.items():
            if code in districts:
                continue
            matches = city[keys.isin({_district_key(name) for name in names})]
            if matches.empty:
                continue
            geometry = unary_union(matches.geometry.make_valid())
            if geometry.is_empty or geometry.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            districts[code] = {"code": code, "name": names[0], "bbox": list(geometry.bounds),
                               "geometry": mapping(geometry), "dataset": dataset}
        if len(districts) == len(DISTRICTS):
            break
    return districts


def municipal_district(code):
    result = municipal_districts().get(code) if isinstance(code, str) else None
    if not result:
        raise ValueError("Limite do distrito municipal indisponível na cartografia nacional GeoMoz.")
    return result
