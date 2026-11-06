"""Bounded Copernicus GLO-30 exports for the GIS Workspace."""

from math import ceil, isfinite
from typing import Literal

from pydantic import BaseModel, Field
from pyproj import Geod, Transformer
from shapely.errors import GEOSException
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient


MAX_PIXELS = 3_000_000
MAX_AXIS = 9_900
NODATA = -9999.0


class WorkspaceDemRequest(BaseModel):
    geometry: dict | None = None
    boundarySource: Literal["gaul2025"] | None = None
    countryCode: str | None = Field(default=None, min_length=3, max_length=3)
    adminLevel: int = Field(default=0, ge=0, le=2)
    admin1Code: int | None = Field(default=None, ge=0)
    admin2Code: int | None = Field(default=None, ge=0)
    province: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    scale: int = Field(default=30, ge=30, le=500)
    crs: Literal["EPSG:4326", "EPSG:32736", "EPSG:32737"] = "EPSG:4326"
    clip: bool = True
    product: Literal["elevation", "slope", "aspect", "hillshade"] = "elevation"


def resolve_workspace_area(req, legacy_resolver):
    """Resolve an administrative AOI server-side; never trust a client-supplied outline.

    GAUL identifiers must be a valid parent-child chain, and no alternative
    geometry or free-text province is allowed to bypass that selection.
    """
    has_admin = bool(req.boundarySource or req.countryCode or req.admin1Code is not None or req.admin2Code is not None)
    if not has_admin:
        if req.adminLevel != 0:
            raise ValueError("Seleccione a fonte FAO GAUL para usar níveis administrativos.")
        return legacy_resolver(req.province, req.district, req.geometry)
    if req.boundarySource != "gaul2025" or not req.countryCode:
        raise ValueError("A área administrativa exige país e fonte FAO GAUL 2025.")
    if req.geometry is not None or req.province or req.district:
        raise ValueError("Não misture limites FAO GAUL com geometrias ou distritos de outra fonte.")
    from agent.administrative_boundaries import administrative_geometry, validate_selection
    validate_selection(req.countryCode, req.adminLevel, req.admin1Code, req.admin2Code)
    geometry, _metadata = administrative_geometry(
        req.countryCode, req.adminLevel, req.admin1Code, req.admin2Code
    )
    # The export endpoint checks and bounds the resulting polygon before
    # creating a GEE download. Simplification avoids oversized server responses.
    return geometry.simplify(maxError=100).getInfo()


def inspect_area(geometry, scale, crs):
    try:
        polygon = shape(geometry)
    except (AttributeError, TypeError, ValueError, KeyError, IndexError, GEOSException) as exc:
        raise ValueError("Seleccione um polígono ou multipolígono GeoJSON válido.") from exc
    if polygon.geom_type not in ("Polygon", "MultiPolygon") or polygon.is_empty or not polygon.is_valid:
        raise ValueError("A área deve ser um polígono válido, sem auto-intersecções.")
    parts = [polygon] if polygon.geom_type == "Polygon" else polygon.geoms
    rings = [ring for part in parts for ring in (part.exterior, *part.interiors)]
    if sum(len(ring.coords) for ring in rings) > 10_000:
        raise ValueError("Simplifique a área para um máximo de 10 000 vértices.")
    if any(not all(isfinite(value) for value in point) for ring in rings for point in ring.coords):
        raise ValueError("A área contém coordenadas inválidas.")

    west, south, east, north = polygon.bounds
    if not (-180 <= west < east <= 180 and -90 < south < north < 90) or east - west >= 180:
        raise ValueError("Use uma área em WGS84 que não atravesse o antimeridiano.")
    if crs != "EPSG:4326":
        zone_west = 30 if crs == "EPSG:32736" else 36
        if not (zone_west <= west < east <= zone_west + 6 and -80 <= south < north <= 0):
            raise ValueError("A área deve estar dentro da zona UTM seleccionada. Use WGS84 para áreas entre zonas.")
        bounds = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform_bounds(west, south, east, north)
        width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    else:
        width, height = (east - west) * 111_320, (north - south) * 111_320

    columns, rows = ceil(width / scale) + 2, ceil(height / scale) + 2
    pixels = columns * rows
    if pixels > MAX_PIXELS or max(columns, rows) > MAX_AXIS:
        raise ValueError("O recorte excede 3 milhões de píxeis ou 9 900 por eixo. Reduza a área ou aumente a escala.")
    geod = Geod(ellps="WGS84")
    area = sum(abs(geod.geometry_area_perimeter(orient(part))[0]) for part in parts)
    return mapping(polygon), {
        "areaKm2": area / 1e6, "pixels": pixels, "columns": columns, "rows": rows,
        "estimatedBytes": pixels * 4,
    }


def prepare_dem(req, geometry, preview):
    """Run under the GEE session lock. Return the estimate or a private download URL."""
    import ee

    geojson, estimate = inspect_area(geometry, req.scale, req.crs)
    region = ee.Geometry(geojson, proj="EPSG:4326", geodesic=False)
    bounds = region.bounds(1, proj="EPSG:4326")
    export_area = region if req.clip else bounds
    collection = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").filterBounds(bounds.buffer(1500))
    if not collection.size().getInfo():
        raise ValueError("O Copernicus GLO-30 não tem cobertura nesta área.")
    # A mosaic's default projection is normally one degree. Derive terrain on
    # the source grid before clipping and resampling for export.
    dem = collection.mosaic().setDefaultProjection(collection.first().projection())
    if preview:
        coverage = dem.mask().unmask(0, sameFootprint=False).reduceRegion(
            reducer=ee.Reducer.mean(), geometry=export_area, scale=max(90, req.scale),
            maxPixels=MAX_PIXELS,
        ).getInfo().get("DEM")
        return {**estimate, "coverage": coverage, "coverageScale": max(90, req.scale), "geometry": geojson}

    image = dem if req.product == "elevation" else ee.Terrain.products(dem).select(req.product)
    if req.clip:
        image = image.clip(region)
    return image.toFloat().unmask(NODATA, sameFootprint=False).getDownloadURL({
        "region": bounds,
        "crs": req.crs,
        "scale": req.scale,
        "format": "GEO_TIFF",
    })


def write_dem_geotiff(raw):
    """Attach the NoData marker used during GEE export to the output TIFF."""
    import numpy as np
    from rasterio.errors import RasterioIOError
    from rasterio.io import MemoryFile

    try:
        with MemoryFile(raw) as source, source.open() as raster:
            if raster.count != 1 or raster.width * raster.height > MAX_PIXELS or raster.crs is None:
                raise ValueError("O Earth Engine devolveu uma grelha inválida.")
            data = raster.read(1)
            if not np.any(np.isfinite(data) & (data != NODATA)):
                raise ValueError("O produto não contém píxeis válidos na escala seleccionada.")
            profile = raster.profile
        profile.update(nodata=NODATA, compress="deflate")
        with MemoryFile() as target:
            with target.open(**profile) as raster:
                raster.write(data, 1)
            return target.read()
    except RasterioIOError as exc:
        raise ValueError("O Earth Engine devolveu um GeoTIFF inválido.") from exc
