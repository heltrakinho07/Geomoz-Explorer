"""
GeoMoz GEE Integration — Google Earth Engine spectral + terrain analysis.

Provides:
  - Sentinel-2 spectral indices (NDVI, Fe-Oxide, Clay, Hydrothermal, BSI)
  - Landsat-8 NDVI (alternative vegetation index)
  - Copernicus GLO-30 DEM-derived terrain indices (Elevation, Hipsometry,
    Slope, Hillshade, Topographic Classification with HydroSHEDS rivers)
  - Weighted composite of multiple normalized indices

Authentication priority:
  1. GEE_SERVICE_ACCOUNT_KEY env var (JSON string) — recommended for production
  2. Application default credentials (~/.config/earthengine/credentials)
"""

import os
import json
import logging
import threading
from typing import Optional

from gee_presets import (
    INDEX_REGISTRY, MINERAL_PRESETS,
    RUSLE_CLASSES, GWP_FACTORS, GWP_CLASSES,
    ESA_INFILTRATION, ESA_WORLDCOVER, ESA_CN,
    MZ_BBOX,
)

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_gee_initialized = False
_gee_error: Optional[str] = None


# ── Initialization ─────────────────────────────────────────────────────────────

def _init_gee() -> None:
    global _gee_initialized, _gee_error

    with _lock:
        if _gee_initialized:
            return
        if _gee_error:
            raise RuntimeError(_gee_error)

        try:
            import ee  # noqa: F401
        except ImportError:
            _gee_error = "earthengine-api package not installed."
            raise RuntimeError(_gee_error)

        sa_key_raw = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
        project_id = os.environ.get("GEE_PROJECT_ID", "").strip() or None

        # Try service account from environment variable
        key_data = None
        if sa_key_raw:
            try:
                key_data = json.loads(sa_key_raw)
            except json.JSONDecodeError as e:
                logger.warning("Failed to parse GEE_SERVICE_ACCOUNT_KEY JSON: %s", e)

        if key_data:
            try:
                from google.oauth2 import service_account

                sa_email = key_data.get("client_email", "")
                project_id = project_id or key_data.get("project_id") or None
                if not sa_email:
                    raise ValueError("client_email missing in service account JSON")

                pk = key_data.get("private_key", "")
                logger.info("Creating credentials for service account: %s", sa_email)
                # Create credentials from service account info
                creds = service_account.Credentials.from_service_account_info(
                    key_data,
                    scopes=[
                        "https://www.googleapis.com/auth/earthengine",
                        "https://www.googleapis.com/auth/cloud-platform",
                    ]
                )
                logger.info("Initializing EE with project: %s", project_id)
                ee.Initialize(creds, project=project_id)
                logger.info("EE initialized successfully")
                _gee_initialized = True
                return
            except Exception as exc:
                logger.error("Service account auth failed: %s", exc, exc_info=True)
                _gee_error = f"Service account auth failed: {exc}"
                raise RuntimeError(_gee_error)

        try:
            ee.Initialize(project=project_id)
            _gee_initialized = True
            return
        except Exception as exc:
            _gee_error = (
                "GEE not configured. "
                "Set GEE_SERVICE_ACCOUNT_KEY (service account JSON as string) or run "
                "`earthencine authenticate` and set GEE_PROJECT_ID."
            )
            raise RuntimeError(_gee_error)


def reset_gee():
    global _gee_initialized, _gee_error
    with _lock:
        _gee_initialized = False
        _gee_error = None


def gee_status() -> dict:
    global _gee_error
    try:
        _init_gee()
        import ee
        ee.String("ok").getInfo()
        sa_key = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "")
        auth_type = "service_account" if sa_key else "application_default"
        project = os.environ.get("GEE_PROJECT_ID", "")
        if not project and sa_key:
            try:
                project = json.loads(sa_key).get("project_id", "")
            except Exception:
                pass
        return {
            "connected": True,
            "auth_type": auth_type,
            "project": project,
            "message": f"GEE conectado ({auth_type})",
        }
    except Exception as exc:
        return {
            "connected": False,
            "auth_type": None,
            "project": None,
            "message": str(exc),
        }


# ── Geometry helpers ───────────────────────────────────────────────────────────

def _to_ee_region(region_geojson: Optional[dict]):
    """Convert a GeoJSON geometry dict to ee.Geometry. None → full MZ bbox."""
    import ee
    if region_geojson is None:
        w, s, e, n = MZ_BBOX
        return ee.Geometry.BBox(w, s, e, n)
    return ee.Geometry(region_geojson, opt_proj="EPSG:4326", opt_geodesic=False)


# ── Source data builders ──────────────────────────────────────────────────────

def _mask_s2_clouds(image):
    import ee
    qa = image.select("QA60")
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))
    return image.updateMask(mask).divide(10000).copyProperties(image, ["system:time_start"])


def _build_s2_composite(region, start: str, end: str, cloud_pct: int):
    import ee
    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_pct))
        .map(_mask_s2_clouds)
        .select(["B2","B3","B4","B5","B8","B8A","B11","B12"])
    )
    count = col.size().getInfo()
    if count == 0:
        raise ValueError(
            f"Sem cenas Sentinel-2 entre {start} e {end} com nuvens < {cloud_pct}%. "
            "Aumente o intervalo de datas ou a tolerância de nuvens."
        )
    return col.median(), count


def _mask_l8_clouds(image):
    import ee
    qa = image.select("QA_PIXEL")
    mask = (qa.bitwiseAnd(1 << 3).eq(0)
            .And(qa.bitwiseAnd(1 << 5).eq(0)))
    return image.updateMask(mask)


def _build_l8_composite(region, start: str, end: str, cloud_pct: int):
    import ee
    col = (
        ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUD_COVER", cloud_pct))
        .map(_mask_l8_clouds)
    )
    count = col.size().getInfo()
    if count == 0:
        raise ValueError(
            f"Sem cenas Landsat 8 entre {start} e {end} com nuvens < {cloud_pct}%. "
            "Aumente o intervalo de datas ou a tolerância de nuvens."
        )
    return col.median(), count


def _build_dem(region):
    """Copernicus GLO-30 DEM mosaic, smoothed (focal_mean 3 m, square)."""
    import ee
    dem = (
        ee.ImageCollection("COPERNICUS/DEM/GLO30")
        .select("DEM")
        .filterBounds(region)
        .mosaic()
    )
    return dem.focal_mean(3, "square", "meters").rename("DEM")


def _build_rivers_raster(region):
    """Rasterize HydroSHEDS FreeFlowingRivers within region (value 1, else 0)."""
    import ee
    rivers_fc = ee.FeatureCollection("WWF/HydroSHEDS/v1/FreeFlowingRivers").filterBounds(region)
    return ee.Image().byte().paint(rivers_fc, 1).rename("water")


# ── Index image builder ────────────────────────────────────────────────────────

def _build_index_image(index: str, region, s2=None, l8=None, dem=None, rivers=None):
    """Build the raw index image (1 band 'index'). Caller is responsible for clip."""
    import ee

    if index == "ndvi":
        return s2.normalizedDifference(["B8", "B4"]).rename("index")
    if index == "fe_oxide":
        return s2.select("B4").divide(s2.select("B2")).rename("index")
    if index == "clay":
        return s2.select("B11").divide(s2.select("B8A")).rename("index")
    if index == "hydrothermal":
        num = s2.select("B11").add(s2.select("B4"))
        den = s2.select("B8A").add(s2.select("B3"))
        return num.divide(den).rename("index")
    if index == "bare_soil":
        num = s2.select("B11").add(s2.select("B4")).subtract(s2.select("B8")).subtract(s2.select("B2"))
        den = s2.select("B11").add(s2.select("B4")).add(s2.select("B8")).add(s2.select("B2"))
        return num.divide(den).rename("index")
    if index == "al_oh":
        return s2.select("B11").divide(s2.select("B12")).rename("index")
    if index == "ferrous":
        return s2.select("B12").divide(s2.select("B8A")).rename("index")
    if index == "gossan":
        ferric = s2.select("B4").divide(s2.select("B2"))
        al_oh  = s2.select("B11").divide(s2.select("B12"))
        return ferric.multiply(al_oh).rename("index")
    if index == "ndvi_l8":
        return l8.normalizedDifference(["SR_B5", "SR_B4"]).rename("index")
    if index == "elevation":
        return dem.rename("index")
    if index == "slope":
        return ee.Terrain.slope(dem).rename("index")
    if index == "hillshade":
        return ee.Terrain.hillshade(dem).rename("index")
    if index == "hipsometry":
        stats = dem.reduceRegion(
            reducer=ee.Reducer.percentile([2, 98]),
            geometry=region,
            scale=90,
            bestEffort=True,
            maxPixels=int(1e9),
        )
        dmin = ee.Number(stats.get("DEM_p2"))
        dmax = ee.Number(stats.get("DEM_p98"))
        return dem.subtract(dmin).divide(dmax.subtract(dmin)).clamp(0, 1).rename("index")
    if index == "topo_class":
        water_safe = rivers.unmask(0)
        classified = dem.expression(
            "(w == 1) ? 6"
            ": (d < 5) ? 1"
            ": (d < 10) ? 2"
            ": (d < 30) ? 3"
            ": (d < 60) ? 4"
            ": 5",
            {"d": dem, "w": water_safe},
        ).rename("index")
        return classified

    # ── Agriculture indices ──────────────────────────────────────────────────

    if index == "evi":
        # EVI = 2.5 * ((B8 - B4) / (B8 + 6*B4 - 7.5*B2 + 1))
        nir = s2.select("B8")
        red = s2.select("B4")
        blue = s2.select("B2")
        return nir.subtract(red).multiply(2.5).divide(
            nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1)
        ).rename("index")

    if index == "ndmi":
        # NDMI = (B8 - B11) / (B8 + B11) — vegetation moisture
        return s2.normalizedDifference(["B8", "B11"]).rename("index")

    if index == "savi":
        # SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) * 1.5
        nir = s2.select("B8")
        red = s2.select("B4")
        return nir.subtract(red).divide(nir.add(red).add(0.5)).multiply(1.5).rename("index")

    if index == "gci":
        # GCI = (B8 / B3) - 1 — Green Chlorophyll Index
        return s2.select("B8").divide(s2.select("B3")).subtract(1).rename("index")

    if index == "nddi":
        # NDDI = (NDVI - NDMI) / (NDVI + NDMI + eps)
        # Uses NDMI (NIR-SWIR) as the moisture component, NOT NDWI (Green-NIR)
        # NDMI = (B8 - B11) / (B8 + B11) — sensitive to vegetation water content
        ndvi = s2.normalizedDifference(["B8", "B4"])
        ndmi = s2.normalizedDifference(["B8", "B11"])
        nddi_img = ndvi.subtract(ndmi).divide(ndvi.add(ndmi).add(0.01)).rename("index")
        # Clamp to a reasonable range for drought detection
        return nddi_img.clamp(-2, 2)

    if index == "msavi":
        # MSAVI2 = (2*B8 + 1 - sqrt((2*B8 + 1)^2 - 8*(B8 - B4))) / 2
        nir = s2.select("B8")
        red = s2.select("B4")
        a = nir.multiply(2).add(1)
        b = a.pow(2).subtract(nir.subtract(red).multiply(8)).max(0).sqrt()
        return a.subtract(b).divide(2).rename("index")

    # ── Pseudo-composites (built from sub-indices internally) ──────────────

    if index == "crop_health":
        # 0.40×EVI_norm + 0.35×NDMI_norm + 0.25×NDVI_norm
        nir = s2.select("B8")
        red = s2.select("B4")
        blue = s2.select("B2")
        evi_raw = nir.subtract(red).multiply(2.5).divide(
            nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1))
        ndmi_raw = s2.normalizedDifference(["B8", "B11"])
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        # Normalize each to [0,1]
        evi_n = evi_raw.subtract(-0.2).divide(1.2).clamp(0, 1)
        ndmi_n = ndmi_raw.subtract(-0.5).divide(1.2).clamp(0, 1)
        ndvi_n = ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1)
        return evi_n.multiply(0.40).add(ndmi_n.multiply(0.35)).add(ndvi_n.multiply(0.25)).rename("index")

    if index == "drought_severity":
        # 0.60×NDDI_norm + 0.40×(1 − NDMI_norm)
        nir = s2.select("B8")
        red = s2.select("B4")
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        ndmi_raw = s2.normalizedDifference(["B8", "B11"])
        # NDDI using NDMI (correct formula)
        nddi_raw = ndvi_raw.subtract(ndmi_raw).divide(ndvi_raw.add(ndmi_raw).add(0.01))
        nddi_n = nddi_raw.subtract(-0.1).divide(0.4).clamp(0, 1)
        ndmi_n = ndmi_raw.subtract(-0.5).divide(1.2).clamp(0, 1)
        inv_ndmi = ee.Image(1).subtract(ndmi_n)
        return nddi_n.multiply(0.60).add(inv_ndmi.multiply(0.40)).rename("index")

    # ── Fire & Burn indices ────────────────────────────────────────────────

    if index == "nbr":
        # NBR = (B8 - B12) / (B8 + B12) — Normalized Burn Ratio
        return s2.normalizedDifference(["B8", "B12"]).rename("index")

    if index == "dnbr":
        # dNBR = pre_NBR - post_NBR
        # Uses the same S2 composite for both (since single-date), but dNBR
        # is really a multi-date operation. We compute a single-date proxy first.
        nbr_img = s2.normalizedDifference(["B8", "B12"]).rename("index")
        # For a single composite this just shows NBR; real dNBR requires two API calls
        return nbr_img

    if index == "burn_severity":
        # Classify NBR into dNBR severity classes
        nbr_raw = s2.normalizedDifference(["B8", "B12"])
        return nbr_raw.expression(
            "(n < -0.1) ? 1"     # unburned / regrowth
            ": (n < 0.1) ? 1"     # unburned
            ": (n < 0.27) ? 2"    # low
            ": (n < 0.44) ? 3"    # moderate-low
            ": (n < 0.66) ? 4"    # moderate-high
            ": 5",                # high
            {"n": nbr_raw}
        ).rename("index")

    if index == "forest_loss":
        # Hansen Global Forest Change — loss year (2000–2023)
        # This is a pre-made dataset, not computed from S2/DEM
        import ee
        hansen = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
        # treecover2000 >= 30% is considered forest
        treecover = hansen.select("treecover2000")
        loss_year = hansen.select("lossyear").rename("index")
        # Mask: only show where treecover >= 30% and loss > 0
        masked = loss_year.updateMask(treecover.gte(30)).updateMask(loss_year.gt(0))
        return masked

    if index == "burned_area":
        # MODIS MCD64A1 burned area
        import ee
        burned = (ee.ImageCollection("MODIS/061/MCD64A1")
                  .filterBounds(region)
                  .select("BurnDate"))
        # Composite: take latest available month
        composite = burned.sort("system:time_start", False).first()
        return composite.rename("index").selfMask()

    if index == "fire_risk":
        # Composite: high risk = dry + low vegetation + high flammability
        nir = s2.select("B8")
        red = s2.select("B4")
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        ndmi_raw = s2.normalizedDifference(["B8", "B11"])
        ndwi_raw = s2.normalizedDifference(["B3", "B8"])
        nddi_raw = ndvi_raw.subtract(ndwi_raw).divide(ndvi_raw.add(ndwi_raw).max(0.001))
        # Normalize to [0,1] and invert where appropriate
        ndvi_n = ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1)
        ndmi_n = ndmi_raw.subtract(-0.5).divide(1.2).clamp(0, 1)
        nddi_n = nddi_raw.subtract(-0.3).divide(1.0).clamp(0, 1)
        # Fire risk = low NDVI + low NDMI + high NDDI
        inv_ndvi = ee.Image(1).subtract(ndvi_n)
        inv_ndmi = ee.Image(1).subtract(ndmi_n)
        return inv_ndvi.multiply(0.40).add(inv_ndmi.multiply(0.35)).add(nddi_n.multiply(0.25)).rename("index")


    # ── Coastal & Marine indices ────────────────────────────────────────────

    if index == "mangrove_health":
        # Mangrove health: equal-weight composite of NDVI + NDWI (Gao)
        # NDVI = (B8-B4)/(B8+B4), NDWI = (B3-B8)/(B3+B8)
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        ndwi_raw = s2.normalizedDifference(["B3", "B8"])
        # Normalize each to [0,1] then average
        ndvi_n = ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1)
        ndwi_n = ndwi_raw.subtract(-0.5).divide(1.0).clamp(0, 1)
        return ndvi_n.multiply(0.50).add(ndwi_n.multiply(0.50)).rename("index")

    if index == "coastal_index":
        # Coastal Vulnerability Index: combines proximity to coast, elevation,
        # flat slope, and DEM-derived proxy for vegetation buffer
        import ee
        jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
        coastline = jrc_water.gt(40).selfMask().clip(region).clip(region)
        coast_dist = coastline.fastDistanceTransform(True).sqrt().multiply(30).rename("dist")
        max_dist = 50000
        prox_raw = ee.Image(1).subtract(coast_dist.divide(max_dist)).clamp(0, 1)
        inv_elev = ee.Image(1).subtract(dem.divide(50).clamp(0, 1))
        slope_n = ee.Terrain.slope(dem).divide(30).clamp(0, 1)
        inv_slope = ee.Image(1).subtract(slope_n)
        # Simulated NDVI from DEM (lower in exposed coastal areas)
        ndvi_proxy = dem.expression(
            "1 - (e / 100)", {"e": dem}
        ).clamp(0, 1).rename("ndvi_proxy")
        inv_ndvi = ee.Image(1).subtract(ndvi_proxy)
        return prox_raw.multiply(0.35).add(inv_elev.multiply(0.25)).add(inv_slope.multiply(0.25)).add(inv_ndvi.multiply(0.15)).rename("index")

    if index == "coastal_erosion":
        # JRC Global Surface Water — transition band (1984–2021)
        # transition: 1 = permanent water, 2 = new permanent, 3 = lost permanent, 0 = land
        import ee
        jrc_transition = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("transition")
        # Reclassify to 4 classes: 0=no change, 1=land gain, 2=land loss, 3=permanent water
        return jrc_transition.rename("index")

    if index == "tsunami_risk":
        # Tsunami coastal inundation vulnerability index
        # Combines: low elevation (strongest weight), proximity to coast,
        # flat slope (further wave travel), low vegetation (less resistance)
        import ee
        jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
        coastline = jrc_water.gt(40).selfMask()
        coast_dist = coastline.fastDistanceTransform(True).sqrt().multiply(30).rename("dist")
        max_dist = 30000
        prox_raw = ee.Image(1).subtract(coast_dist.divide(max_dist)).clamp(0, 1)
        inv_elev = ee.Image(1).subtract(dem.divide(30).clamp(0, 1))
        slope_n = ee.Terrain.slope(dem).divide(20).clamp(0, 1)
        inv_slope = ee.Image(1).subtract(slope_n)
        # NDVI vegetation buffer — now available because needs includes s2
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        inv_ndvi = ee.Image(1).subtract(ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1))
        return inv_elev.multiply(0.35).add(prox_raw.multiply(0.30)).add(inv_slope.multiply(0.20)).add(inv_ndvi.multiply(0.15)).rename("index")



    # ── Climate & Disasters indices ─────────────────────────────────────────

    if index == "precipitation":
        # CHIRPS — mean annual precipitation
        import ee
        chirps = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                  .filterDate("2022-01-01", "2023-01-01")
                  .sum())
        return chirps.rename("index")

    if index == "temperature_lst":
        # MODIS MOD11A2 — land surface temperature
        import ee
        lst_coll = (ee.ImageCollection("MODIS/061/MOD11A2")
                     .filterDate("2022-01-01", "2023-01-01")
                     .select("LST_Day_1km"))
        lst_mean = lst_coll.mean().multiply(0.02)
        return lst_mean.rename("index")

    if index == "cyclone_tracks":
        # IBTrACS — cyclone track density (1980–2024)
        import ee
        ibtracs = ee.FeatureCollection("NOAA/IBTrACS/v4")
        # Filter for Southern Hemisphere tropical cyclones near Mozambique
        ibtracs_mz = ibtracs.filterBounds(
            ee.Geometry.Rectangle(20, -30, 60, -5)
        )
        # Create density raster
        density = ibtracs_mz.reduceToImage(
            properties=["wind_max"],
            reducer=ee.Reducer.count()
        ).rename("index").clip(region)
        return density

    if index == "cyclone_risk":
        # Composite cyclone risk index
        import ee
        # CHIRPS extreme precipitation
        chirps = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                  .filterDate("2022-01-01", "2023-01-01")
                  .sum().rename("precip"))
        precip_n = chirps.subtract(200).divide(2300).clamp(0, 1)
        # Coastal proximity (IBTrACS-based cyclone frequency near coast)
        ibtracs = ee.FeatureCollection("NOAA/IBTrACS/v4")
        ibtracs_mz = ibtracs.filterBounds(
            ee.Geometry.Rectangle(20, -30, 60, -5)
        )
        cycl_density = ibtracs_mz.reduceToImage(
            properties=["wind_max"],
            reducer=ee.Reducer.count()
        ).rename("cycl_dens").clip(region)
        cycl_n = cycl_density.subtract(0).divide(20).clamp(0, 1)
        # Low elevation = higher flood risk from storm surge
        inv_elev = ee.Image(1).subtract(dem.divide(50).clamp(0, 1))
        # Vegetation proxy from DEM (lower = more exposed)
        ndvi_proxy = dem.expression("1 - (e / 100)", {"e": dem}).clamp(0, 1).rename("ndvi_proxy")
        inv_ndvi = ee.Image(1).subtract(ndvi_proxy)
        # Weighted composite
        return precip_n.multiply(0.35).add(cycl_n.multiply(0.30)).add(inv_elev.multiply(0.20)).add(inv_ndvi.multiply(0.15)).rename("index")


    # ── Urban & Infrastructure indices ─────────────────────────────────────

    if index == "urban_expansion":
        # NBI (New Built-up Index) = B11 / (B8 + B11 + B4)
        # High values = built-up / urban areas
        nir = s2.select("B8")
        swir1 = s2.select("B11")
        red = s2.select("B4")
        nbi = swir1.divide(nir.add(swir1).add(red)).rename("index")
        return nbi

    if index == "impervious_surface":
        # NDBI (Normalized Difference Built-up Index) = (B11 - B8) / (B11 + B8)
        # High positive values = built-up / impervious surfaces
        return s2.normalizedDifference(["B11", "B8"]).rename("index")

    if index == "urban_heat_island":
        # UHI = MODIS_LST_norm - NDVI_norm
        # Urban areas have higher LST and lower NDVI than surrounding rural areas
        import ee
        # MODIS LST composite
        lst_coll = (ee.ImageCollection("MODIS/061/MOD11A2")
                     .filterDate("2022-01-01", "2023-01-01")
                     .select("LST_Day_1km"))
        lst_mean = lst_coll.mean().multiply(0.02)
        # Normalize LST to [0,1] using typical range for Mozambique
        lst_norm = lst_mean.subtract(15).divide(45).clamp(0, 1)
        # Sentinel-2 NDVI
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        ndvi_norm = ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1)
        # UHI = LST_norm - NDVI_norm (positive = urban heat island)
        uhi = lst_norm.subtract(ndvi_norm).rename("index")
        return uhi


    # ── Public Health indices ───────────────────────────────────────────────

    if index == "malaria_risk":
        # Malaria vector habitat risk: warm + wet + low elevation + water + sparse vegetation
        import ee
        # CHIRPS precipitation
        chirps = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                  .filterDate("2022-01-01", "2023-01-01")
                  .sum().rename("precip"))
        precip_n = chirps.subtract(200).divide(2300).clamp(0, 1)
        # MODIS LST
        lst_coll = (ee.ImageCollection("MODIS/061/MOD11A2")
                     .filterDate("2022-01-01", "2023-01-01")
                     .select("LST_Day_1km"))
        lst_mean = lst_coll.mean().multiply(0.02)
        temp_n = lst_mean.subtract(15).divide(45).clamp(0, 1)
        # NDWI — surface water/moisture
        ndwi_raw = s2.normalizedDifference(["B3", "B8"])
        ndwi_n = ndwi_raw.subtract(-0.5).divide(1.0).clamp(0, 1)
        # Low elevation = stagnant water breeding sites
        inv_elev = ee.Image(1).subtract(dem.divide(50).clamp(0, 1))
        # Low vegetation = less tree cover, more open water pools
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        inv_ndvi = ee.Image(1).subtract(ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1))
        # Weighted composite
        return precip_n.multiply(0.30).add(temp_n.multiply(0.25)).add(ndwi_n.multiply(0.20)).add(inv_elev.multiply(0.15)).add(inv_ndvi.multiply(0.10)).rename("index")

    if index == "healthcare_access":
        # Healthcare access proxy: proximity to built-up areas
        # Higher NDBI + ESA built-up areas = better access
        import ee
        # NDBI for built-up areas
        ndbi = s2.normalizedDifference(["B11", "B8"]).rename("ndbi")
        # ESA WorldCover built-up class (50)
        lc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
        built_up = lc.eq(50).rename("built")
        # Distance transform from built-up areas
        # Closer to built-up = higher access
        built_dist = built_up.selfMask().fastDistanceTransform(True).sqrt().multiply(30)
        max_dist = 50000
        proximity = ee.Image(1).subtract(built_dist.divide(max_dist)).clamp(0, 1).rename("index")
        # Fallback: use NDBI where no built-up detected
        ndbi_n = ndbi.subtract(-0.3).divide(0.8).clamp(0, 1)
        # Combine: use built-up proximity where available, otherwise NDBI proxy
        combined = proximity.unmask(ndbi_n.multiply(0.5))
        return combined.rename("index")

    if index == "sanitation_index":
        # Sanitation index: water availability + built infrastructure + sparse vegetation + low elevation
        import ee
        # NDWI — surface water availability
        ndwi_raw = s2.normalizedDifference(["B3", "B8"])
        ndwi_n = ndwi_raw.subtract(-0.5).divide(1.0).clamp(0, 1)
        # NDBI — built infrastructure proxy
        ndbi = s2.normalizedDifference(["B11", "B8"])
        built_n = ndbi.subtract(-0.3).divide(0.8).clamp(0, 1)
        # Inverse NDVI — areas with less vegetation (more built-up)
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        inv_ndvi = ee.Image(1).subtract(ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1))
        # Low elevation — easier water access
        inv_elev = ee.Image(1).subtract(dem.divide(100).clamp(0, 1))
        # Weighted composite
        return ndwi_n.multiply(0.40).add(built_n.multiply(0.30)).add(inv_ndvi.multiply(0.20)).add(inv_elev.multiply(0.10)).rename("index")

    if index == "epidemic_risk":
        # Epidemic risk composite: malaria conditions + flood proximity + low healthcare + high pop density
        import ee
        # Reuse malaria conditions
        chirps = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                  .filterDate("2022-01-01", "2023-01-01")
                  .sum().rename("precip"))
        precip_n = chirps.subtract(200).divide(2300).clamp(0, 1)
        lst_coll = (ee.ImageCollection("MODIS/061/MOD11A2")
                     .filterDate("2022-01-01", "2023-01-01")
                     .select("LST_Day_1km"))
        lst_mean = lst_coll.mean().multiply(0.02)
        temp_n = lst_mean.subtract(15).divide(45).clamp(0, 1)
        ndwi_raw = s2.normalizedDifference(["B3", "B8"])
        ndwi_n = ndwi_raw.subtract(-0.5).divide(1.0).clamp(0, 1)
        inv_elev = ee.Image(1).subtract(dem.divide(50).clamp(0, 1))
        ndvi_raw = s2.normalizedDifference(["B8", "B4"])
        inv_ndvi = ee.Image(1).subtract(ndvi_raw.subtract(-0.2).divide(1.1).clamp(0, 1))
        malaria_cond = precip_n.multiply(0.30).add(temp_n.multiply(0.25)).add(ndwi_n.multiply(0.20)).add(inv_elev.multiply(0.15)).add(inv_ndvi.multiply(0.10))
        # Flood proximity (JRC water occurrence)
        jrc_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
        flood_prox = jrc_water.gt(10).selfMask().fastDistanceTransform(True).sqrt().multiply(30)
        inund_prox = ee.Image(1).subtract(flood_prox.divide(30000)).clamp(0, 1).unmask(0).rename("inund")
        # Healthcare access inverse (from NDBI)
        ndbi = s2.normalizedDifference(["B11", "B8"])
        built_n = ndbi.subtract(-0.3).divide(0.8).clamp(0, 1)
        inv_access = ee.Image(1).subtract(built_n).rename("inv_access")
        # Population density proxy (NDBI + inverse NDVI)
        pop_dens = built_n.add(inv_ndvi.multiply(0.5)).rename("pop_dens")
        # Weighted composite
        return malaria_cond.multiply(0.35).add(inund_prox.multiply(0.25)).add(inv_access.multiply(0.20)).add(pop_dens.multiply(0.20)).rename("index")


    raise ValueError(f"Índice desconhecido: {index!r}")


# ── Public: single-index tile ──────────────────────────────────────────────────

def compute_index_tile(
    index: str,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
) -> dict:
    """Compute one spectral / terrain index, return a Leaflet tile URL.

    region_geojson : GeoJSON geometry dict (Polygon/MultiPolygon) — used both
                     for filterBounds AND .clip() so output is precisely cut.
                     If None, falls back to the full Mozambique bbox.
    """
    import ee
    _init_gee()

    if index not in INDEX_REGISTRY:
        raise ValueError(f"Índice desconhecido '{index}'. Disponíveis: {list(INDEX_REGISTRY)}")

    cfg = INDEX_REGISTRY[index]
    region = _to_ee_region(region_geojson)

    s2 = l8 = dem = rivers = None
    scene_count = 0

    needs = cfg["needs"]
    if "s2" in needs:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs:
        l8, scene_count = _build_l8_composite(region, start_date, end_date, cloud_pct)
    if "dem" in needs:
        dem = _build_dem(region)
    if "rivers" in needs:
        rivers = _build_rivers_raster(region)

    idx_img = _build_index_image(index, region, s2=s2, l8=l8, dem=dem, rivers=rivers).clip(region)
    vis_img = idx_img.visualize(**cfg["vis"])
    map_data = vis_img.getMapId()
    tile_url = map_data["tile_fetcher"].url_format

    return {
        "tileUrl":    tile_url,
        "name":       cfg["name"],
        "formula":    cfg["formula"],
        "bands":      cfg["bands"],
        "group":      cfg["group"],
        "sceneCount": scene_count,
        "dateRange":  f"{start_date} → {end_date}" if cfg["group"] != "terrain" else "Estático (DEM)",
        "stats":      {},
        "classNames": cfg.get("class_names"),
    }


# ── Public: weighted composite of multiple indices ─────────────────────────────

def compute_composite_tile(
    weights: dict,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
) -> dict:
    """Build a weighted, normalized sum of multiple indices.

    weights : { index_id: weight_float } — only positive weights are used,
              and they are renormalized so they sum to 1.
    """
    import ee
    _init_gee()

    # Filter & normalize weights
    pos = {k: float(v) for k, v in weights.items() if v and float(v) > 0 and k in INDEX_REGISTRY}
    if not pos:
        raise ValueError("Pelo menos um índice com peso > 0 é necessário.")
    total = sum(pos.values())
    pos = {k: v / total for k, v in pos.items()}

    region = _to_ee_region(region_geojson)

    # Build shared data sources once (avoid duplicate work)
    needs_set = set()
    for k in pos:
        needs_set.update(INDEX_REGISTRY[k]["needs"])

    s2 = l8 = dem = rivers = None
    scene_count = 0
    if "s2" in needs_set:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs_set:
        l8_c, l8_n = _build_l8_composite(region, start_date, end_date, cloud_pct)
        l8 = l8_c
        scene_count = max(scene_count, l8_n)
    if "dem" in needs_set:
        dem = _build_dem(region)
    if "rivers" in needs_set:
        rivers = _build_rivers_raster(region)

    composite = None
    for k, w in pos.items():
        cfg = INDEX_REGISTRY[k]
        img = _build_index_image(k, region, s2=s2, l8=l8, dem=dem, rivers=rivers)
        nmin, nmax = cfg["norm"]
        # normalize to [0,1] using fixed registry range, then weight
        norm = img.subtract(nmin).divide(nmax - nmin).clamp(0, 1)
        weighted = norm.multiply(w)
        composite = weighted if composite is None else composite.add(weighted)

    composite = composite.clamp(0, 1).clip(region)

    vis_img = composite.visualize(min=0, max=1,
                                  palette=["2c7bb6", "abd9e9", "ffffbf", "fdae61", "d7191c"])
    map_data = vis_img.getMapId()
    tile_url = map_data["tile_fetcher"].url_format

    return {
        "tileUrl":    tile_url,
        "name":       "Composto Ponderado",
        "formula":    " + ".join(f"{w:.2f}×{k}" for k, w in pos.items()),
        "bands":      "Combinação normalizada [0,1]",
        "group":      "composite",
        "sceneCount": scene_count,
        "dateRange":  f"{start_date} → {end_date}",
        "weights":    pos,
        "stats":      {},
    }


# ── Lineaments / structural analysis ──────────────────────────────────────────

_LINEAMENT_DENSITY_PALETTE = [
    "000033", "1a0066", "330099", "6600cc", "9933cc",
    "cc3399", "ff3366", "ff6600", "ffaa00", "ffff00",
]

_SOBEL_X = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
_SOBEL_Y = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]


def _build_lineament_layers(region, smooth_m: int = 30, density_radius_m: int = 750):
    """Return a dict with:
      'edges_bin'  — binary edge image (1 = edge, masked elsewhere)
      'density'    — focal_mean over `density_radius_m` of edges (0..1)
      'direction'  — Sobel gradient direction in degrees (0..180, bidirectional)
    """
    import ee
    dem = _build_dem(region)
    dem_s = dem.focal_mean(smooth_m, "circle", "meters")

    # Sobel gradients for orientation
    kx = ee.Kernel.fixed(3, 3, _SOBEL_X, -1, -1, False)
    ky = ee.Kernel.fixed(3, 3, _SOBEL_Y, -1, -1, False)
    gx = dem_s.convolve(kx)
    gy = dem_s.convolve(ky)
    direction = (
        gy.atan2(gx).multiply(180.0 / 3.141592653589793)
          .add(360).mod(180)
          .rename("dir")
    )

    # Multi-azimuth Canny → union (max)
    edges = None
    for az in (0, 45, 90, 135):
        hs = ee.Terrain.hillshade(dem_s, az, 35)
        canny = ee.Algorithms.CannyEdgeDetector(image=hs, threshold=8, sigma=1)
        edges = canny if edges is None else edges.max(canny)

    edges_bin = edges.gt(0).rename("edge").selfMask()
    density = (
        edges_bin.unmask(0)
                 .focal_mean(density_radius_m, "circle", "meters")
                 .rename("density")
    )
    return {"edges_bin": edges_bin, "density": density, "direction": direction}


def compute_lineaments_tile(
    region_geojson: Optional[dict],
    smooth_m: int = 30,
    density_radius_m: int = 750,
    rose_samples: int = 4000,
) -> dict:
    """Detect topographic lineaments from the DEM and return:
      - density tile (heat-style)
      - edges tile (crisp cyan lines)
      - rose-diagram bins (18 × 10°)
      - approximate mean density inside the region
    """
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    layers = _build_lineament_layers(region, smooth_m=smooth_m,
                                     density_radius_m=density_radius_m)
    density = layers["density"].clip(region)
    edges = layers["edges_bin"].clip(region)

    # Mask out near-zero density so background is transparent (not dark navy)
    density_masked = density.updateMask(density.gt(0.003))
    density_vis = density_masked.visualize(min=0.003, max=0.35,
                                           palette=_LINEAMENT_DENSITY_PALETTE)
    edges_vis = edges.visualize(palette=["00f0ff"])

    density_map = density_vis.getMapId()
    edges_map = edges_vis.getMapId()

    # Orientation rose
    masked_dir = layers["direction"].updateMask(layers["edges_bin"])
    sample_fc = masked_dir.sample(
        region=region, scale=90, numPixels=rose_samples, dropNulls=True, seed=42,
    )
    try:
        dirs = sample_fc.aggregate_array("dir").getInfo() or []
    except Exception as exc:
        logger.warning("Failed to sample orientation directions: %s", exc)
        dirs = []

    bins = [0] * 18
    for d in dirs:
        try:
            idx = int(float(d) // 10) % 18
            bins[idx] += 1
        except Exception:
            continue
    total = sum(bins) or 1
    rose = [{"bin_deg": i * 10, "count": c, "pct": c / total}
            for i, c in enumerate(bins)]

    try:
        mean_density = density.unmask(0).reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region,
            scale=200, bestEffort=True, maxPixels=int(1e9),
        ).get("density").getInfo()
    except Exception as exc:
        logger.warning("Failed to compute lineament density: %s", exc)
        mean_density = None

    return {
        "tileUrl":        density_map["tile_fetcher"].url_format,
        "edgesTileUrl":   edges_map["tile_fetcher"].url_format,
        "name":           "Lineamentos — Densidade Estrutural",
        "formula":        "Canny multi-azimute (DEM) → densidade focal 750 m",
        "bands":          "Copernicus GLO-30 DEM",
        "group":          "structural",
        "rose":           rose,
        "sampleCount":    len(dirs),
        "meanDensity":    mean_density,
        "palette":        _LINEAMENT_DENSITY_PALETTE,
        "vis":            {"min": 0, "max": 0.35, "palette": _LINEAMENT_DENSITY_PALETTE},
    }


_TARGETING_PALETTE = [
    "0d0887", "5302a3", "8b0aa5", "b83289", "db5c68",
    "f48849", "febc2a", "ffeb24", "ffff96",
]


def _build_targeting_score(
    mineral: str,
    region,
    start_date: str,
    end_date: str,
    cloud_pct: int,
    weights_override: Optional[dict] = None,
    invert_override: Optional[list] = None,
):
    """Build the normalized [0,1] mineral favorability score image for a preset.

    Shared by compute_targeting_tile (tile + stats) and
    compute_targeting_zones (spatial overlap report).
    Returns (score, scene_count, preset, pos_weights, invert_set).
    """
    import ee

    if mineral not in MINERAL_PRESETS:
        raise ValueError(
            f"Mineral desconhecido '{mineral}'. "
            f"Disponíveis: {list(MINERAL_PRESETS)}"
        )

    preset = MINERAL_PRESETS[mineral]
    raw_weights = dict(weights_override) if weights_override else dict(preset["weights"])
    invert_set = set(invert_override if invert_override is not None else preset["invert"])

    # Validate keys: must be registry index OR the "lineaments" pseudo-index
    pos = {}
    for k, v in raw_weights.items():
        if v is None:
            continue
        f = float(v)
        if f <= 0:
            continue
        if k != "lineaments" and k not in INDEX_REGISTRY:
            continue
        pos[k] = f
    if not pos:
        raise ValueError("Preset sem pesos positivos válidos.")
    total = sum(pos.values())
    pos = {k: v / total for k, v in pos.items()}

    needs_set = set()
    for k in pos:
        if k == "lineaments":
            needs_set.add("dem")
        else:
            needs_set.update(INDEX_REGISTRY[k]["needs"])

    s2 = l8 = dem = rivers = None
    scene_count = 0
    if "s2" in needs_set:
        s2, scene_count = _build_s2_composite(region, start_date, end_date, cloud_pct)
    if "l8" in needs_set:
        l8_c, l8_n = _build_l8_composite(region, start_date, end_date, cloud_pct)
        l8 = l8_c
        scene_count = max(scene_count, l8_n)
    if "dem" in needs_set:
        dem = _build_dem(region)
    if "rivers" in needs_set:
        rivers = _build_rivers_raster(region)

    lin_density = None
    if "lineaments" in pos:
        lin_density = _build_lineament_layers(region)["density"]

    composite = None
    for k, w in pos.items():
        if k == "lineaments":
            norm = lin_density.multiply(3).clamp(0, 1)
        else:
            cfg = INDEX_REGISTRY[k]
            img = _build_index_image(k, region, s2=s2, l8=l8, dem=dem, rivers=rivers)
            nmin, nmax = cfg["norm"]
            norm = img.subtract(nmin).divide(nmax - nmin).clamp(0, 1)
        if k in invert_set:
            norm = ee.Image(1).subtract(norm)
        weighted = norm.multiply(w)
        composite = weighted if composite is None else composite.add(weighted)

    score = composite.clamp(0, 1).clip(region).rename("score")
    return score, scene_count, preset, pos, invert_set


def compute_targeting_tile(
    mineral: str,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
    weights_override: Optional[dict] = None,
    invert_override: Optional[list] = None,
    score_threshold: float = 0.7,
) -> dict:
    """Build a mineral favorability score (0–100) by combining normalized indices
    according to a per-mineral preset. Returns tile URL + favorability stats.
    """
    import ee
    _init_gee()

    region = _to_ee_region(region_geojson)
    score, scene_count, preset, pos, invert_set = _build_targeting_score(
        mineral, region, start_date, end_date, cloud_pct,
        weights_override, invert_override,
    )
    score_pct = score.multiply(100).rename("score")

    vis_img = score_pct.visualize(min=0, max=100, palette=_TARGETING_PALETTE)
    map_data = vis_img.getMapId()

    score_for_stats = score.unmask(0)
    try:
        stat_dict = score_for_stats.reduceRegion(
            reducer=ee.Reducer.mean().combine(
                ee.Reducer.percentile([90, 95, 99]), sharedInputs=True,
            ),
            geometry=region, scale=200, bestEffort=True, maxPixels=int(1e9),
        ).getInfo() or {}
    except Exception as exc:
        logger.warning("Failed to compute targeting stats: %s", exc)
        stat_dict = {}

    try:
        favorable_mask = score_for_stats.gte(score_threshold)
        area_img = favorable_mask.multiply(ee.Image.pixelArea()).rename("area")
        area_m2 = area_img.reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region,
            scale=200, bestEffort=True, maxPixels=int(1e9),
        ).get("area").getInfo()
        favorable_km2 = (area_m2 or 0) / 1e6
    except Exception as exc:
        logger.warning("Failed to compute favorable area: %s", exc)
        favorable_km2 = None

    return {
        "tileUrl":        map_data["tile_fetcher"].url_format,
        "name":           f"Potencial Mineral — {preset['name']}",
        "mineral":        mineral,
        "mineralName":    preset["name"],
        "description":    preset["description"],
        "weights":        pos,
        "inverted":       sorted(list(invert_set)),
        "formula":        " + ".join(
                              f"{w:.2f}×{'¬' if k in invert_set else ''}{k}"
                              for k, w in pos.items()
                          ),
        "group":          "targeting",
        "sceneCount":     scene_count,
        "dateRange":      f"{start_date} → {end_date}",
        "scoreThreshold": score_threshold,
        "stats": {
            "meanScore":      stat_dict.get("score_mean"),
            "p90":            stat_dict.get("score_p90"),
            "p95":            stat_dict.get("score_p95"),
            "p99":            stat_dict.get("score_p99"),
            "favorableKm2":   favorable_km2,
        },
        "palette":        _TARGETING_PALETTE,
        "vis":            {"min": 0, "max": 100, "palette": _TARGETING_PALETTE},
    }


# ── Topographic profile (A→B) ──────────────────────────────────────────────────

def _haversine_m(lon1, lat1, lon2, lat2):
    """Great-circle distance in meters between two lon/lat pairs."""
    import math
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl   = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _interpolate_polyline(coords, n_samples: int):
    """Generate n_samples (lon,lat) points evenly along a polyline by arc length."""
    if len(coords) < 2 or n_samples < 2:
        return list(coords), [0.0] * len(coords)
    seg_lens = [_haversine_m(coords[i][0], coords[i][1],
                              coords[i + 1][0], coords[i + 1][1])
                for i in range(len(coords) - 1)]
    total = sum(seg_lens)
    if total <= 0:
        return list(coords), [0.0] * len(coords)
    out_pts, out_dists = [], []
    for i in range(n_samples):
        t = (i / (n_samples - 1)) * total
        d_accum = 0.0
        for j, sl in enumerate(seg_lens):
            if d_accum + sl >= t or j == len(seg_lens) - 1:
                frac = (t - d_accum) / sl if sl > 0 else 0
                lon = coords[j][0] + frac * (coords[j + 1][0] - coords[j][0])
                lat = coords[j][1] + frac * (coords[j + 1][1] - coords[j][1])
                out_pts.append((lon, lat))
                out_dists.append(t)
                break
            d_accum += sl
    return out_pts, out_dists


def compute_profile(coords: list, n_samples: int = 200) -> dict:
    """Sample Copernicus GLO-30 DEM elevation along a polyline (A→B[→C…]).

    coords: [[lon,lat], [lon,lat], ...]  (≥2 points)
    Returns distance_m + elevation_m arrays + summary stats.
    """
    import ee
    _init_gee()

    if not coords or len(coords) < 2:
        raise ValueError("Perfil requer pelo menos 2 pontos.")
    n_samples = max(20, min(int(n_samples), 500))

    pts, dists = _interpolate_polyline(coords, n_samples)
    line = ee.Geometry.LineString(coords, proj="EPSG:4326", geodesic=False)
    dem = _build_dem(line.bounds().buffer(500))

    features = [ee.Feature(ee.Geometry.Point([p[0], p[1]]), {"i": i})
                for i, p in enumerate(pts)]
    fc = ee.FeatureCollection(features)
    sampled = dem.sampleRegions(collection=fc, scale=30, geometries=False)
    rows = sampled.getInfo().get("features", [])

    by_idx = {int(r["properties"]["i"]): r["properties"].get("DEM")
              for r in rows}
    elevations = [by_idx.get(i) for i in range(len(pts))]
    valid = [e for e in elevations if e is not None]

    if not valid:
        raise ValueError("DEM sem dados sobre o traçado (área marítima ou fora do DEM).")

    gain = loss = 0.0
    prev = None
    for e in elevations:
        if e is None:
            continue
        if prev is not None:
            d = e - prev
            if d > 0:
                gain += d
            else:
                loss -= d
        prev = e

    total_distance = dists[-1] if dists else 0.0
    return {
        "points":       [{"lon": p[0], "lat": p[1]} for p in pts],
        "distances_m":  dists,
        "elevations_m": elevations,
        "stats": {
            "totalDistanceM": total_distance,
            "minElevM":      min(valid),
            "maxElevM":      max(valid),
            "meanElevM":     sum(valid) / len(valid),
            "gainM":         gain,
            "lossM":         loss,
            "sampleCount":   len(valid),
        },
        "name":    "Perfil Topográfico — Copernicus GLO-30",
        "formula": f"DEM amostrado em {len(pts)} pontos (scale 30 m)",
    }


# ── Contour lines (equidistance configurable) ─────────────────────────────────

_CONTOUR_PALETTE = ["8b5a2b"]
_INDEX_CONTOUR_PALETTE = ["3a1c0c"]


def compute_contours_tile(
    region_geojson: Optional[dict],
    interval_m: int = 50,
    index_every: int = 5,
) -> dict:
    """Generate contour-line tiles from the DEM at a given equidistance."""
    import ee
    _init_gee()

    interval_m = max(5, min(int(interval_m), 1000))
    index_every = max(2, min(int(index_every), 10))

    region = _to_ee_region(region_geojson)
    dem = _build_dem(region).clip(region)

    try:
        mm = dem.reduceRegion(
            reducer=ee.Reducer.minMax(),
            geometry=region, scale=90, bestEffort=True, maxPixels=int(1e9),
        ).getInfo() or {}
        min_elev = mm.get("DEM_min")
        max_elev = mm.get("DEM_max")
    except Exception as exc:
        logger.warning("Failed to compute elevation min/max: %s", exc)
        min_elev = max_elev = None

    line_thresh = max(0.8, interval_m * 0.05)

    minor_mod = dem.mod(interval_m)
    minor_dist = minor_mod.min(
        ee.Image.constant(interval_m).subtract(minor_mod)
    )
    minor_mask = minor_dist.lt(line_thresh).selfMask()

    major_thresh = max(line_thresh * 1.2, 1.2)
    major_step = interval_m * index_every
    major_mod = dem.mod(major_step)
    major_dist = major_mod.min(
        ee.Image.constant(major_step).subtract(major_mod)
    )
    major_mask = major_dist.lt(major_thresh).selfMask()

    minor_vis = minor_mask.visualize(palette=_CONTOUR_PALETTE)
    major_vis = major_mask.visualize(palette=_INDEX_CONTOUR_PALETTE)

    minor_map = minor_vis.getMapId()
    major_map = major_vis.getMapId()

    intervals = []
    if min_elev is not None and max_elev is not None:
        start = (int(min_elev) // interval_m + 1) * interval_m
        cur = start
        while cur < max_elev and len(intervals) < 200:
            intervals.append(cur)
            cur += interval_m

    return {
        "tileUrl":        minor_map["tile_fetcher"].url_format,
        "indexTileUrl":   major_map["tile_fetcher"].url_format,
        "name":           f"Curvas de Nível — equidistância {interval_m} m",
        "formula":        f"DEM mod {interval_m} m < {line_thresh:.1f} m (linhas-mestras a cada {interval_m * index_every} m)",
        "intervalM":      interval_m,
        "indexEvery":     index_every,
        "indexIntervalM": interval_m * index_every,
        "minElevM":       min_elev,
        "maxElevM":       max_elev,
        "intervals":      intervals,
    }


# ── Custom topographic classes (user-defined breaks) ──────────────────────────

def compute_topo_classes_tile(
    region_geojson: Optional[dict],
    breaks:        list,
    colors:        list,
    labels:        list,
    include_water: bool = True,
    water_color:   str  = "#3366ff",
    water_label:   str  = "Água & Rios",
) -> dict:
    """Build an elevation-classified raster from user-defined break points."""
    import ee
    _init_gee()

    if not breaks or len(breaks) < 1:
        raise ValueError("Precisa de pelo menos um limite de elevação.")
    breaks_sorted = sorted(float(b) for b in breaks)
    n_classes = len(breaks_sorted) + 1
    if len(colors) != n_classes:
        raise ValueError(f"colors deve ter {n_classes} valores ({len(breaks_sorted)} limites + 1).")
    if len(labels) != n_classes:
        raise ValueError(f"labels deve ter {n_classes} valores.")

    region = _to_ee_region(region_geojson)
    dem = _build_dem(region).clip(region)

    classified = ee.Image(1)
    for b in breaks_sorted:
        classified = classified.add(dem.gte(b))
    classified = classified.toInt().rename("class")

    all_colors = [c.lstrip("#") for c in colors]
    all_labels = list(labels)
    max_class = n_classes
    water_applied = False

    if include_water:
        try:
            rivers = _build_rivers_raster(region).unmask(0)
            water_idx = n_classes + 1
            classified = classified.where(rivers.eq(1), water_idx)
            all_colors.append(water_color.lstrip("#"))
            all_labels.append(water_label)
            max_class = water_idx
            water_applied = True
        except Exception:
            water_applied = False

    vis = classified.visualize(min=1, max=max_class, palette=all_colors)
    tile_url = vis.getMapId()["tile_fetcher"].url_format

    try:
        groups_data = (
            ee.Image.pixelArea().addBands(classified)
            .reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
                geometry=region, scale=90, bestEffort=True, maxPixels=int(1e9),
            ).getInfo() or {}
        )
        groups = groups_data.get("groups", []) or []
        per_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}
    except Exception as exc:
        logger.warning("Failed to compute per-class areas: %s", exc)
        per_class = {}

    areas_km2 = [per_class.get(i + 1, 0.0) for i in range(max_class)]
    total = sum(areas_km2) or 1
    pct = [round(a / total * 100, 2) for a in areas_km2]

    return {
        "tileUrl":   tile_url,
        "name":      "Classes Topográficas (custom)",
        "formula":   f"DEM com {len(breaks_sorted)} limite(s) ({', '.join(f'{b:g}m' for b in breaks_sorted)})"
                     + (" + Água & Rios" if include_water else ""),
        "breaks":    breaks_sorted,
        "colors":    [f"#{c}" for c in all_colors],
        "labels":    all_labels,
        "areasKm2":  areas_km2,
        "areasPct":  pct,
        "hasWater":  water_applied,
    }


# ── Cobertura do Solo (ESA WorldCover 10 m) ─────────────────────────────────


def compute_landcover_tile(region_geojson: Optional[dict], stats_scale: int = 100) -> dict:
    """Cobertura do solo a partir do ESA WorldCover v200 (2021, 10 m), com análise
    de área (km²/%) por classe na região selecionada.
    """
    import ee
    _init_gee()

    region = _to_ee_region(region_geojson)
    img = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").clip(region)

    codes  = [c   for c, _, _ in ESA_WORLDCOVER]
    colors = [col for _, _, col in ESA_WORLDCOVER]

    remapped = img.remap(codes, list(range(1, len(codes) + 1))).rename("class")
    vis = remapped.visualize(min=1, max=len(codes), palette=colors)
    tile_url = vis.getMapId()["tile_fetcher"].url_format

    per_code: dict = {}
    try:
        groups_data = (
            ee.Image.pixelArea().addBands(img)
            .reduceRegion(
                reducer=ee.Reducer.sum().group(groupField=1, groupName="code"),
                geometry=region, scale=stats_scale, bestEffort=True, maxPixels=int(1e9),
            ).getInfo() or {}
        )
        for g in groups_data.get("groups", []) or []:
            per_code[int(g["code"])] = float(g.get("sum", 0)) / 1e6
    except Exception as exc:
        raise RuntimeError(f"Falha ao calcular áreas de cobertura do solo: {exc}")

    total = sum(per_code.values()) or 1.0
    classes = []
    for code, label, color in ESA_WORLDCOVER:
        area = per_code.get(code, 0.0)
        classes.append({
            "code":    code,
            "label":   label,
            "color":   f"#{color}",
            "areaKm2": round(area, 2),
            "pct":     round(area / total * 100, 2),
        })
    ranked = sorted(classes, key=lambda c: c["areaKm2"], reverse=True)

    return {
        "tileUrl":      tile_url,
        "name":         "Cobertura do Solo — ESA WorldCover 2021",
        "source":       "ESA/WorldCover/v200",
        "year":         2021,
        "resolution_m": 10,
        "totalKm2":     round(total, 2),
        "classes":      classes,
        "ranked":       ranked,
        "group":        "landcover",
    }


# ── Bacias Hidrográficas (HydroBASINS + HydroSHEDS + DEM) ───────────────────

import math as _math

_HYDROBASINS_CANDIDATES: dict = {
    lv: [
        f"WWF/HydroATLAS/v1/Basins/level{lv:02d}",
        f"WWF/HydroSHEDS/v1/Basins/hybas_af_lev{lv:02d}_v1c",
        f"WWF/HydroSHEDS/v1/Basins/hybas_af_lev{lv:02d}",
    ]
    for lv in (5, 6, 7, 8)
}


def compute_basins(region_geojson: Optional[dict], level: int = 6) -> dict:
    """Return HydroBASINS polygons (level 5–8) that intersect the region."""
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    candidates = _HYDROBASINS_CANDIDATES.get(level, _HYDROBASINS_CANDIDATES[6])
    last_error = "Collection not found"

    keep_props = ["HYBAS_ID", "UP_AREA", "SUB_AREA", "ORDER_", "MAIN_BAS", "NEXT_DOWN"]

    for coll_id in candidates:
        try:
            basins_fc = (ee.FeatureCollection(coll_id).filterBounds(region)
                         .select(keep_props, None, True))
            count     = basins_fc.size().getInfo()
            geojson   = basins_fc.limit(300).getInfo()
            styled    = basins_fc.style(color="1a73e8", fillColor="1a73e818", width=1.5)
            tile_url  = styled.getMapId()["tile_fetcher"].url_format
            return {
                "tileUrl":  tile_url,
                "geojson":  geojson,
                "count":    count,
                "level":    level,
                "source":   "hydrobasins",
                "collId":   coll_id,
            }
        except Exception as exc:
            last_error = str(exc)
            continue

    return {
        "tileUrl":  None,
        "geojson":  None,
        "count":    0,
        "level":    level,
        "source":   "unavailable",
        "error":    last_error,
    }


def compute_basin_stats(basin_geometry: dict) -> dict:
    """Compute elevation, slope, NDVI, NDWI, precipitation and derived
    risk indices for one basin.

    basin_geometry : GeoJSON geometry dict (Polygon / MultiPolygon).
    """
    import ee
    _init_gee()

    region = ee.Geometry(basin_geometry)

    dem_proj = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    dem   = _build_dem(region).rename("elev")
    slope = ee.Terrain.slope(dem.setDefaultProjection(dem_proj)).rename("slope")

    has_s2 = False
    ndvi = ndwi = None
    try:
        s2, _ = _build_s2_composite(region, "2023-01-01", "2023-12-31", 60)
        ndvi = s2.normalizedDifference(["B8", "B4"]).rename("ndvi")
        ndwi = s2.normalizedDifference(["B3", "B8"]).rename("ndwi")
        has_s2 = True
    except Exception:
        pass

    has_precip = False
    chirps = None
    try:
        chirps = (
            ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
            .filterDate("2022-01-01", "2023-01-01")
            .sum()
            .rename("precip")
        )
        has_precip = True
    except Exception:
        pass

    max_px = int(1e9)
    reducer_mm = ee.Reducer.min().combine(ee.Reducer.max(), sharedInputs=True).combine(ee.Reducer.mean(), sharedInputs=True)

    elev_info  = dem.unmask(0).reduceRegion(reducer=reducer_mm, geometry=region, scale=90, bestEffort=True, maxPixels=max_px).getInfo()
    slope_info = slope.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=90, bestEffort=True, maxPixels=max_px).getInfo()

    ndvi_mean = ndwi_mean = None
    if has_s2:
        try:
            nv = ndvi.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=30, bestEffort=True, maxPixels=max_px).getInfo()
            nw = ndwi.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=30, bestEffort=True, maxPixels=max_px).getInfo()
            ndvi_mean = nv.get("ndvi")
            ndwi_mean = nw.get("ndwi")
        except Exception:
            pass

    precip_mm_yr = 800.0
    if has_precip:
        try:
            pr = chirps.unmask(0).reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=5000, bestEffort=True, maxPixels=max_px).getInfo()
            precip_mm_yr = float(pr.get("precip") or 800)
        except Exception:
            pass

    area_km2 = region.area(maxError=100).getInfo() / 1e6
    perim_km = region.perimeter(maxError=100).getInfo() / 1e3

    mean_slope = float(slope_info.get("slope") or 0)
    mean_ndvi  = float(ndvi_mean or 0.3)
    precip_n   = min(1.0, precip_mm_yr / 2000.0)
    slope_n    = min(1.0, mean_slope / 45.0)
    veg_n      = max(0.0, min(1.0, mean_ndvi))

    erosion_risk = round(slope_n * 50 + (1 - veg_n) * 30 + precip_n * 20, 1)
    flat_n       = max(0.0, 1.0 - slope_n)
    ndwi_n       = max(0.0, min(1.0, float(ndwi_mean or 0) * 2))
    flood_risk   = round(flat_n * 40 + precip_n * 40 + ndwi_n * 20, 1)
    slope_hydro  = _math.exp(-((mean_slope - 10) ** 2) / 200.0)
    hydro_pot    = round(slope_hydro * 30 + precip_n * 40 + veg_n * 30, 1)

    return {
        "areaKm2":        round(area_km2, 2),
        "perimeterKm":    round(perim_km, 2),
        "elevMinM":       round(float(elev_info.get("elev_min")  or 0), 1),
        "elevMeanM":      round(float(elev_info.get("elev_mean") or 0), 1),
        "elevMaxM":       round(float(elev_info.get("elev_max")  or 0), 1),
        "slopeMeanDeg":   round(mean_slope, 2),
        "ndviMean":       round(float(ndvi_mean), 3) if ndvi_mean is not None else None,
        "ndwiMean":       round(float(ndwi_mean), 3) if ndwi_mean is not None else None,
        "precipMmYr":     round(precip_mm_yr, 1),
        "erosionRisk":    erosion_risk,
        "floodRisk":      flood_risk,
        "hydroPotential": hydro_pot,
    }


def compute_basin_report(basin_geometry: dict) -> dict:
    """Full hydro-environmental basin report: morphometry + land cover + CHIRPS
    monthly rainfall + SCS-CN runoff potential.

    basin_geometry : GeoJSON geometry dict (Polygon / MultiPolygon).
    """
    import ee
    _init_gee()

    region = ee.Geometry(basin_geometry)
    max_px = int(1e9)

    dem_proj = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    dem   = _build_dem(region).rename("elev")
    slope = ee.Terrain.slope(dem.setDefaultProjection(dem_proj)).rename("slope")
    relief = dem.addBands(slope)
    reducer_ms = (ee.Reducer.min().combine(ee.Reducer.max(), sharedInputs=True)
                  .combine(ee.Reducer.mean(), sharedInputs=True))
    rinfo = relief.unmask(0).reduceRegion(
        reducer=reducer_ms, geometry=region, scale=90, bestEffort=True, maxPixels=max_px,
    ).getInfo()

    area_km2 = region.area(maxError=100).getInfo() / 1e6
    perim_km = region.perimeter(maxError=100).getInfo() / 1e3
    area_km2 = max(area_km2, 1e-6)

    acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    stream_cells = (
        acc.gte(200).selfMask().clip(region)
        .reduceRegion(reducer=ee.Reducer.count(), geometry=region, scale=500,
                      bestEffort=True, maxPixels=max_px).getInfo().get("b1") or 0
    )
    drainage_density = round((float(stream_cells) * 0.5) / area_km2, 3)
    compactness = round(0.2821 * perim_km / (area_km2 ** 0.5), 3)
    basin_len = max(perim_km / 2.0 - (area_km2 ** 0.5), area_km2 ** 0.5)
    form_factor = round(area_km2 / (basin_len ** 2), 3)

    # Land cover
    lc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").clip(region)
    codes  = [c   for c, _, _ in ESA_WORLDCOVER]
    colors = [col for _, _, col in ESA_WORLDCOVER]
    lc_vis = lc.remap(codes, list(range(1, len(codes) + 1))).visualize(
        min=1, max=len(codes), palette=colors)
    landcover_tile = lc_vis.getMapId()["tile_fetcher"].url_format

    per_code: dict = {}
    try:
        groups = (ee.Image.pixelArea().addBands(lc).reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName="code"),
            geometry=region, scale=100, bestEffort=True, maxPixels=max_px,
        ).getInfo() or {}).get("groups", []) or []
        for g in groups:
            per_code[int(g["code"])] = float(g.get("sum", 0)) / 1e6
    except Exception as exc:
        logger.warning("Failed to compute landcover areas: %s", exc)
        per_code = {}
    lc_total = sum(per_code.values()) or 1.0
    landcover = []
    for code, label, color in ESA_WORLDCOVER:
        a = per_code.get(code, 0.0)
        if a > 0:
            landcover.append({"code": code, "label": label, "color": f"#{color}",
                              "areaKm2": round(a, 2), "pct": round(a / lc_total * 100, 2)})
    landcover.sort(key=lambda c: c["areaKm2"], reverse=True)

    # Monthly precipitation (CHIRPS 2019–2023)
    years = 5
    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate("2019-01-01", "2024-01-01")

    def _monthly(m):
        m = ee.Number(m)
        return (chirps.filter(ee.Filter.calendarRange(m, m, "month")).sum()
                .divide(years).rename(ee.String("mon_").cat(m.int().format("%02d"))))

    monthly_img = ee.ImageCollection(ee.List.sequence(1, 12).map(_monthly)).toBands()
    mp = monthly_img.reduceRegion(reducer=ee.Reducer.mean(), geometry=region,
                                  scale=5000, bestEffort=True, maxPixels=max_px).getInfo() or {}
    precip_monthly = []
    for mm in range(1, 13):
        key = next((k for k in mp if k.endswith(f"mon_{mm:02d}")), None)
        precip_monthly.append(round(float(mp.get(key) or 0), 1))
    precip_annual = round(sum(precip_monthly), 1)

    # SCS Curve Number
    cn = lc.remap(list(ESA_CN.keys()), list(ESA_CN.values())).rename("cn")
    cn_tile = cn.visualize(min=40, max=100,
                           palette=["1a9850", "fee08b", "d73027"]).getMapId()["tile_fetcher"].url_format
    cn_mean = cn.reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=100,
                              bestEffort=True, maxPixels=max_px).getInfo().get("cn")

    return {
        "morphometry": {
            "areaKm2":          round(area_km2, 2),
            "perimeterKm":      round(perim_km, 2),
            "elevMinM":         round(float(rinfo.get("elev_min")  or 0), 1),
            "elevMeanM":        round(float(rinfo.get("elev_mean") or 0), 1),
            "elevMaxM":         round(float(rinfo.get("elev_max")  or 0), 1),
            "reliefM":          round(float(rinfo.get("elev_max") or 0) - float(rinfo.get("elev_min") or 0), 1),
            "slopeMeanDeg":     round(float(rinfo.get("slope_mean") or 0), 2),
            "slopeMaxDeg":      round(float(rinfo.get("slope_max")  or 0), 2),
            "drainageDensity":  drainage_density,
            "compactness":      compactness,
            "formFactor":       form_factor,
        },
        "landcover":      landcover,
        "landcoverTile":  landcover_tile,
        "precipMonthly":  precip_monthly,
        "precipAnnualMm": precip_annual,
        "runoff": {
            "cnMean":   round(float(cn_mean), 1) if cn_mean is not None else None,
            "cnTile":   cn_tile,
            "note":     "CN alto (vermelho) = maior escoamento / menor infiltração.",
        },
    }


def compute_drainage_tile(region_geojson: Optional[dict], threshold: int = 500) -> dict:
    """HydroSHEDS 15-arc-second flow accumulation thresholded → drainage network."""
    import ee
    _init_gee()
    region  = _to_ee_region(region_geojson)
    acc     = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    rivers  = acc.gte(threshold).selfMask().clip(region)
    vis     = rivers.visualize(palette=["1565c0"])
    tile_url = vis.getMapId()["tile_fetcher"].url_format
    return {"tileUrl": tile_url, "threshold": threshold}


def compute_river_network(region_geojson: Optional[dict]) -> dict:
    """Multi-order river network derived from HydroSHEDS flow accumulation."""
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    acc    = ee.Image("WWF/HydroSHEDS/15ACC").select("b1").clip(region)

    classified = (
        ee.Image(0)
        .where(acc.gte(100),    1)
        .where(acc.gte(500),    2)
        .where(acc.gte(2_000),  3)
        .where(acc.gte(10_000), 4)
        .where(acc.gte(50_000), 5)
    ).selfMask()

    palette = ["a8d5f7", "5badf5", "1a73e8", "0d47a1", "002171"]
    tile_all = classified.visualize(min=1, max=5, palette=palette) \
                         .getMapId()["tile_fetcher"].url_format

    tile_major = acc.gte(10_000).selfMask().visualize(palette=["002171"], opacity=0.9) \
                    .getMapId()["tile_fetcher"].url_format

    return {
        "tileUrl":       tile_all,
        "majorTileUrl":  tile_major,
        "orders": {
            "1_headwaters": 100,
            "2_small":      500,
            "3_medium":     2_000,
            "4_large":      10_000,
            "5_major":      50_000,
        },
        "palette": palette,
    }


def compute_watershed_from_point(
    lat: float,
    lon: float,
    region_geojson: Optional[dict],
    max_iter: int = 60,
    level: int = 10,
) -> dict:
    """Delineate the basin at a clicked location."""
    import ee
    _init_gee()

    pt = ee.Geometry.Point([lon, lat])
    try:
        hb = _watershed_hydrobasins(pt, lat, lon, level)
        if hb is not None:
            return hb
    except Exception:
        pass

    return _watershed_d8(lat, lon, region_geojson, max_iter)


def _watershed_hydrobasins(pt, lat: float, lon: float, level: int):
    """Containing HydroBASINS sub-basin (instant, real boundary). None if absent."""
    import ee
    keep = ["HYBAS_ID", "SUB_AREA", "UP_AREA", "ORDER_"]
    seen: list = []
    order = [level] + [l for l in (12, 10, 8, 6) if l != level]
    for lvl in order:
        if lvl in seen or not (1 <= lvl <= 12):
            continue
        seen.append(lvl)
        cid = f"WWF/HydroATLAS/v1/Basins/level{lvl:02d}"
        try:
            fc = (ee.FeatureCollection(cid).filterBounds(pt)
                  .select(keep, None, True).limit(1))
            geojson = fc.getInfo()
            feats = geojson.get("features", [])
            if not feats:
                continue
            props = feats[0].get("properties", {})
            area_km2 = float(props.get("SUB_AREA") or 0)
            tile = (fc.style(color="0d47a1", fillColor="1565c033", width=2)
                    .getMapId()["tile_fetcher"].url_format)
            return {
                "tileUrl":   tile,
                "geojson":   geojson,
                "pourPoint": [lat, lon],
                "areaKm2":   round(float(area_km2), 2),
                "maxIter":   0,
                "level":     lvl,
                "source":    "hydrobasins",
            }
        except Exception:
            continue
    return None


def _watershed_d8(
    lat: float,
    lon: float,
    region_geojson: Optional[dict],
    max_iter: int = 60,
) -> dict:
    """Delineate a watershed from a pour point using D8 flow direction."""
    import ee
    _init_gee()

    fdir = ee.Image("WWF/HydroSHEDS/15DIR").select("b1")
    acc  = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    proj = fdir.projection()

    pour_pt = ee.Geometry.Point([lon, lat])

    min_acc  = 500
    snap_buf = pour_pt.buffer(15_000)
    snap_img = (
        acc.updateMask(acc.gte(min_acc))
        .addBands(ee.Image.pixelLonLat())
    )
    snapped = snap_img.reduceRegion(
        reducer   = ee.Reducer.max(3).setOutputs(["acc", "lon", "lat"]),
        geometry  = snap_buf,
        scale     = 500,
        maxPixels = int(1e7),
        bestEffort= True,
    )
    snap_lon = snapped.get("lon")
    snap_lat = snapped.get("lat")
    if snap_lon.getInfo() is None:
        raise RuntimeError(
            "Nenhum canal de drenagem encontrado perto do ponto. "
            "Clique mais perto de um rio/curso de água."
        )
    seed_pt = ee.Geometry.Point([snap_lon, snap_lat])

    seed_geom = ee.Geometry(seed_pt).buffer(600)
    basin = (
        ee.Image.constant(1)
        .clip(seed_geom)
        .reproject(proj)
        .toByte()
        .rename("b")
        .unmask(0)
    )

    for _ in range(max_iter):
        upstream = (
            fdir.eq(1  ).And(basin.translate(-1,  0, "pixels", proj))
            .Or(fdir.eq(2  ).And(basin.translate(-1, -1, "pixels", proj)))
            .Or(fdir.eq(4  ).And(basin.translate( 0, -1, "pixels", proj)))
            .Or(fdir.eq(8  ).And(basin.translate( 1, -1, "pixels", proj)))
            .Or(fdir.eq(16 ).And(basin.translate( 1,  0, "pixels", proj)))
            .Or(fdir.eq(32 ).And(basin.translate( 1,  1, "pixels", proj)))
            .Or(fdir.eq(64 ).And(basin.translate( 0,  1, "pixels", proj)))
            .Or(fdir.eq(128).And(basin.translate(-1,  1, "pixels", proj)))
        ).rename("b").toByte()
        basin = basin.Or(upstream).reproject(proj).unmask(0)

    basin = basin.selfMask()

    clip_region = _to_ee_region(region_geojson) or pour_pt.buffer(max_iter * 600)
    vec = basin.reduceToVectors(
        geometry       = clip_region,
        scale          = 500,
        geometryType   = "polygon",
        bestEffort     = True,
        maxPixels      = int(1e9),
        labelProperty  = "basin",
    )

    area_km2 = vec.geometry().area(maxError=100).divide(1e6)

    tile_url = (
        basin.visualize(palette=["0d47a1"], opacity=0.45)
        .getMapId()["tile_fetcher"].url_format
    )

    return {
        "tileUrl":    tile_url,
        "geojson":    vec.getInfo(),
        "pourPoint":  [lat, lon],
        "areaKm2":    round(float(area_km2.getInfo()), 2),
        "maxIter":    max_iter,
    }


# ── Geoperigos / Geohazards (cheias Sentinel-1 SAR + erosão RUSLE) ──────────────

def compute_flood_sar(
    region_geojson: Optional[dict],
    event_start: str,
    event_end: str,
    baseline_start: Optional[str] = None,
    baseline_end: Optional[str] = None,
) -> dict:
    """Flood extent from Sentinel-1 SAR (C-band, VV) — UN-SPIDER change-detection."""
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)

    if not (baseline_start and baseline_end):
        ev_start = ee.Date(event_start)
        baseline_end   = ev_start.advance(-1, "day")
        baseline_start = ev_start.advance(-60, "day")
    else:
        baseline_start = ee.Date(baseline_start)
        baseline_end   = ee.Date(baseline_end)

    def _s1(d0, d1):
        return (ee.ImageCollection("COPERNICUS/S1_GRD")
                .filterBounds(region).filterDate(d0, d1)
                .filter(ee.Filter.eq("instrumentMode", "IW"))
                .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                .select("VV"))

    after_col  = _s1(event_start, event_end)
    before_col = _s1(baseline_start, baseline_end)

    n_after = after_col.size().getInfo()
    if n_after == 0:
        raise RuntimeError(
            "Sem imagens Sentinel-1 no período do evento. Alargue as datas "
            "(o S1 passa a cada ~6–12 dias)."
        )
    n_before = before_col.size().getInfo()

    smooth = lambda img: img.focal_median(50, "circle", "meters")
    after  = smooth(after_col.median())
    before = smooth(before_col.median()) if n_before else after

    diff  = after.subtract(before)
    flood = diff.lt(-3).And(after.lt(-15))

    jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence")
    perm_water = jrc.gt(40).unmask(0)
    flood = flood.where(perm_water, 0)

    slope = ee.Terrain.slope(_build_dem(region)).clip(region)
    flood = flood.updateMask(slope.lt(5))

    flood = flood.updateMask(flood)
    conn  = flood.connectedPixelCount(25, True)
    flood = flood.updateMask(conn.gte(8)).rename("flood")

    flood_area_km2 = (
        flood.multiply(ee.Image.pixelArea()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region, scale=60,
            bestEffort=True, maxPixels=int(1e10),
        ).get("flood")
    )

    flood_tile = flood.visualize(palette=["d50000"], opacity=0.85) \
                      .getMapId()["tile_fetcher"].url_format
    perm_tile  = perm_water.selfMask().visualize(palette=["1565c0"], opacity=0.6) \
                      .getMapId()["tile_fetcher"].url_format

    area_val = flood_area_km2.getInfo()
    return {
        "floodTile":      flood_tile,
        "permWaterTile":  perm_tile,
        "areaKm2":        round((float(area_val) / 1e6) if area_val else 0.0, 2),
        "scenesEvent":    n_after,
        "scenesBaseline": n_before,
        "eventStart":     event_start,
        "eventEnd":       event_end,
        "source":         "sentinel-1",
    }


def compute_erosion_rusle(region_geojson: Optional[dict], year: int = 2023) -> dict:
    """Soil-loss risk via RUSLE: A = R·K·LS·C·P (t/ha/yr)."""
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    max_px = int(1e10)

    precip = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
              .filterDate(f"{year}-01-01", f"{year+1}-01-01").sum())
    R = precip.multiply(0.363).add(79).rename("R")

    K = ee.Image.constant(0.25).rename("K")

    dem   = _build_dem(region)
    proj  = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    slope_deg = ee.Terrain.slope(dem.setDefaultProjection(proj))
    slope_pct = slope_deg.divide(180).multiply(_math.pi).tan().multiply(100)
    LS = (slope_pct.pow(2).multiply(0.0065)
          .add(slope_pct.multiply(0.0456)).add(0.065)).rename("LS")

    try:
        ndvi = (ee.ImageCollection("MODIS/061/MOD13Q1")
                .filterDate(f"{year}-01-01", f"{year+1}-01-01")
                .select("NDVI").mean().multiply(0.0001).clamp(-0.99, 0.99))
        C = ndvi.multiply(-2).divide(ee.Image(1).subtract(ndvi)).exp().clamp(0, 1).rename("C")
    except Exception as exc:
        logger.warning("MODIS NDVI unavailable, using fallback C=0.5: %s", exc)
        C = ee.Image.constant(0.5).rename("C")

    A = R.multiply(K).multiply(LS).multiply(C).rename("A").clip(region)

    classified = ee.Image(0)
    for cid, _label, _color, lo, hi in RUSLE_CLASSES:
        classified = classified.where(A.gte(lo).And(A.lt(hi)), cid)
    classified = classified.selfMask().rename("class")

    palette = [c for _, _, c, _, _ in RUSLE_CLASSES]
    tile = classified.visualize(min=1, max=5, palette=palette, opacity=0.7) \
                     .getMapId()["tile_fetcher"].url_format

    groups = (ee.Image.pixelArea().addBands(classified).reduceRegion(
        reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
        geometry=region, scale=250, bestEffort=True, maxPixels=max_px,
    ).getInfo().get("groups", []) or [])
    by_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}

    classes = []
    for cid, label, color, lo, hi in RUSLE_CLASSES:
        a = round(by_class.get(cid, 0.0), 1)
        classes.append({"id": cid, "label": label, "color": f"#{color}",
                        "range": f"{lo}–{'∞' if hi >= 1e9 else int(hi)} t/ha/ano",
                        "areaKm2": a})

    a_mean = A.reduceRegion(reducer=ee.Reducer.mean(), geometry=region, scale=250,
                            bestEffort=True, maxPixels=max_px).get("A").getInfo()

    return {
        "tile":       tile,
        "classes":    classes,
        "meanTPerHa": round(float(a_mean), 2) if a_mean is not None else None,
        "year":       year,
        "palette":    palette,
        "source":     "RUSLE · CHIRPS+DEM+MODIS",
    }


# ── Potencial de Água Subterrânea (AHP) ──

def compute_groundwater_ahp(region_geojson: Optional[dict], year: int = 2023) -> dict:
    """Groundwater-potential map (AHP weighted overlay) classified into 5 classes."""
    import ee
    _init_gee()
    region = _to_ee_region(region_geojson)
    max_px = int(1e10)

    dem   = _build_dem(region)
    proj  = ee.ImageCollection("COPERNICUS/DEM/GLO30").select("DEM").first().projection()
    slope = ee.Terrain.slope(dem.setDefaultProjection(proj)).rename("slope")

    lin_density = _build_lineament_layers(region)["density"].rename("lineament")

    precip = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
              .filterDate(f"{year}-01-01", f"{year+1}-01-01").sum().rename("rainfall"))

    acc = ee.Image("WWF/HydroSHEDS/15ACC").select("b1")
    streams = acc.gte(200).unmask(0)
    drainage = streams.focal_mean(3000, "circle", "meters").rename("drainage")

    cell_area = ee.Image.pixelArea()
    a = acc.add(1).multiply(cell_area)
    tan_b = slope.divide(180).multiply(_math.pi).tan().max(0.001)
    twi = a.divide(tan_b).log().rename("twi")

    lc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    lc_score = (lc.remap(list(ESA_INFILTRATION.keys()),
                         [int(v * 100) for v in ESA_INFILTRATION.values()])
                .divide(100).rename("landcover"))

    raw = {"lineament": lin_density, "rainfall": precip, "slope": slope,
           "drainage": drainage, "twi": twi, "landcover": lc_score}

    stack = ee.Image.cat([raw[k].toFloat() for k, *_ in GWP_FACTORS])
    mm = stack.reduceRegion(
        reducer=ee.Reducer.minMax(), geometry=region, scale=1000,
        bestEffort=True, maxPixels=max_px,
    ).getInfo()

    gwpi = ee.Image.constant(0)
    for key, _label, sign, weight in GWP_FACTORS:
        vmin = mm.get(f"{key}_min")
        vmax = mm.get(f"{key}_max")
        if vmin is None or vmax is None or vmax == vmin:
            continue
        norm = raw[key].subtract(vmin).divide(vmax - vmin).clamp(0, 1)
        if sign < 0:
            norm = ee.Image(1).subtract(norm)
        gwpi = gwpi.add(norm.multiply(weight))
    gwpi = gwpi.clip(region).rename("gwpi")

    breaks = [0.33, 0.42, 0.50, 0.58]
    classified = (ee.Image(1)
                  .where(gwpi.gte(breaks[0]), 2)
                  .where(gwpi.gte(breaks[1]), 3)
                  .where(gwpi.gte(breaks[2]), 4)
                  .where(gwpi.gte(breaks[3]), 5)
                  .rename("class"))

    palette = [c for _, _, c in GWP_CLASSES]
    tile = classified.visualize(min=1, max=5, palette=palette, opacity=0.7) \
                     .getMapId()["tile_fetcher"].url_format

    groups = (ee.Image.pixelArea().addBands(classified).reduceRegion(
        reducer=ee.Reducer.sum().group(groupField=1, groupName="class"),
        geometry=region, scale=500, bestEffort=True, maxPixels=max_px,
    ).getInfo().get("groups", []) or [])
    by_class = {int(g["class"]): float(g.get("sum", 0)) / 1e6 for g in groups}

    classes = [{"id": cid, "label": label, "color": f"#{color}",
                "areaKm2": round(by_class.get(cid, 0.0), 1)}
               for cid, label, color in GWP_CLASSES]

    weights = [{"key": k, "label": lbl, "weight": w, "favours": "alto" if s > 0 else "baixo"}
               for k, lbl, s, w in GWP_FACTORS]

    return {
        "tile":     tile,
        "classes":  classes,
        "weights":  weights,
        "year":     year,
        "palette":  palette,
        "source":   "AHP · lineamentos+chuva+declive+drenagem+TWI+cobertura",
    }


# ── SPI × NDVI drought correlation ─────────────────────────────────────────────

_SPI_PALETTE  = ["7f0000", "d73027", "fdae61", "fee08b", "d9ef8b", "66bd63", "1a9850", "2166ac"]
_NDVI_PALETTE = ["8c510a", "d8b365", "f6e8c3", "c7e9c0", "74c476", "238b45", "00441b"]


def compute_spi_ndvi(
    region_geojson: Optional[dict],
    year: int = 2024,
    clim_start: int = 2001,
    samples: int = 400,
) -> dict:
    """SPI (anomalia temporal de precipitação CHIRPS) × NDVI MODIS + correlação.

    SPI  : z-score por pixel do total anual de precipitação do ano de análise
           face à climatologia clim_start..(year−1) — aproximação do SPI-12.
    NDVI : média anual MODIS MOD13A2 (×0.0001).
    Amostra N pontos de ambas as bandas para scatter + Pearson r (server-side).
    """
    import ee
    _init_gee()

    if not (1990 <= clim_start <= year - 5):
        raise ValueError("clim_start deve estar entre 1990 e (ano − 5) para uma climatologia mínima.")

    region = _to_ee_region(region_geojson)

    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").select("precipitation")

    def _annual_total(y):
        start = ee.Date.fromYMD(y, 1, 1)
        return chirps.filterDate(start, start.advance(1, "year")).sum()

    clim_years = ee.List.sequence(clim_start, year - 1)
    clim = ee.ImageCollection(clim_years.map(lambda y: _annual_total(ee.Number(y))))
    clim_mean = clim.mean()
    clim_std  = clim.reduce(ee.Reducer.stdDev()).max(1e-3)

    year_total = _annual_total(ee.Number(year))
    spi = (year_total.subtract(clim_mean).divide(clim_std)
           .clamp(-3, 3).rename("SPI"))

    ndvi = (ee.ImageCollection("MODIS/061/MOD13A2")
            .filterDate(f"{year}-01-01", f"{year + 1}-01-01")
            .select("NDVI").mean().multiply(0.0001).rename("NDVI"))

    spi_clip, ndvi_clip = spi.clip(region), ndvi.clip(region)
    spi_tile = spi_clip.visualize(min=-2, max=2, palette=_SPI_PALETTE) \
                       .getMapId()["tile_fetcher"].url_format
    ndvi_tile = ndvi_clip.visualize(min=0, max=0.9, palette=_NDVI_PALETTE) \
                         .getMapId()["tile_fetcher"].url_format

    both = ndvi.addBands(spi)
    max_px = int(1e9)

    # Pearson r (server-side, all pixels at 5 km)
    pearson_r = p_value = None
    try:
        corr = both.select(["SPI", "NDVI"]).reduceRegion(
            reducer=ee.Reducer.pearsonsCorrelation(),
            geometry=region, scale=5000, bestEffort=True, maxPixels=max_px,
        ).getInfo() or {}
        pearson_r = corr.get("correlation")
        p_value   = corr.get("p-value")
    except Exception as exc:
        logger.warning("SPI×NDVI: Pearson correlation failed: %s", exc)

    # Region means
    mean_spi = mean_ndvi = None
    try:
        means = both.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=region, scale=5000, bestEffort=True, maxPixels=max_px,
        ).getInfo() or {}
        mean_spi, mean_ndvi = means.get("SPI"), means.get("NDVI")
    except Exception as exc:
        logger.warning("SPI×NDVI: region means failed: %s", exc)

    # Drought area (SPI < −1) as share of analysed area
    drought_km2 = total_km2 = None
    try:
        px = ee.Image.pixelArea()
        area_img = (px.updateMask(spi.lt(-1)).rename("droughtArea")
                    .addBands(px.updateMask(spi.mask()).rename("totalArea")))
        areas = area_img.reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=region, scale=5000, bestEffort=True, maxPixels=max_px,
        ).getInfo() or {}
        drought_km2 = (areas.get("droughtArea") or 0) / 1e6
        total_km2   = (areas.get("totalArea") or 0) / 1e6
    except Exception as exc:
        logger.warning("SPI×NDVI: drought area failed: %s", exc)

    # Scatter samples (client-side pairs for the chart)
    pairs = []
    try:
        fc = both.sample(
            region=region, scale=5000,
            numPixels=max(50, min(samples, 2000)),
            seed=42, geometries=False,
        ).getInfo() or {}
        for f in fc.get("features", []):
            p = f.get("properties", {})
            s, n = p.get("SPI"), p.get("NDVI")
            if s is not None and n is not None:
                pairs.append({"spi": round(float(s), 3), "ndvi": round(float(n), 3)})
    except Exception as exc:
        logger.warning("SPI×NDVI: sampling failed: %s", exc)

    # OLS trendline over the sampled pairs (NDVI = a·SPI + b)
    slope = intercept = None
    if len(pairs) >= 10:
        try:
            import numpy as np
            xs = np.array([p["spi"] for p in pairs])
            ys = np.array([p["ndvi"] for p in pairs])
            slope_f, intercept_f = np.polyfit(xs, ys, 1)
            slope, intercept = round(float(slope_f), 4), round(float(intercept_f), 4)
        except Exception as exc:
            logger.warning("SPI×NDVI: trendline fit failed: %s", exc)

    drought_pct = (round(drought_km2 / total_km2 * 100, 1)
                   if drought_km2 is not None and total_km2 else None)

    return {
        "spiTileUrl":   spi_tile,
        "ndviTileUrl":  ndvi_tile,
        "name":         f"SPI × NDVI — {year}",
        "formula":      f"SPI = (P{year} − μ{clim_start}–{year - 1}) / σ · NDVI = MOD13A2 média anual",
        "bands":        "UCSB-CHG/CHIRPS/DAILY · MODIS/061/MOD13A2",
        "year":         year,
        "climStart":    clim_start,
        "pairs":        pairs,
        "stats": {
            "pearsonR":   pearson_r,
            "pValue":     p_value,
            "meanSpi":    mean_spi,
            "meanNdvi":   mean_ndvi,
            "droughtKm2": round(drought_km2, 1) if drought_km2 is not None else None,
            "droughtPct": drought_pct,
            "slope":      slope,
            "intercept":  intercept,
            "sampleCount": len(pairs),
        },
        "spiPalette":   [f"#{c}" for c in _SPI_PALETTE],
        "ndviPalette":  [f"#{c}" for c in _NDVI_PALETTE],
    }


# ── Targeting overlap — favorable zones as vectors ─────────────────────────────

def compute_targeting_zones(
    mineral: str,
    region_geojson: Optional[dict],
    start_date: str = "2023-01-01",
    end_date: str = "2023-12-31",
    cloud_pct: int = 30,
    weights_override: Optional[dict] = None,
    invert_override: Optional[list] = None,
    score_threshold: float = 0.7,
    max_zones: int = 300,
) -> dict:
    """Vectorize favorable targeting zones (score ≥ threshold) as GeoJSON.

    The polygons are extracted at 300 m so the spatial-overlap report
    (districts / villages / admin posts) stays light. The caller (API layer)
    crosses them with the geomoz admin layers.
    """
    import ee
    _init_gee()

    region = _to_ee_region(region_geojson)
    score, scene_count, preset, pos, invert_set = _build_targeting_score(
        mineral, region, start_date, end_date, cloud_pct,
        weights_override, invert_override,
    )

    mask = score.gte(score_threshold).selfMask()
    vectors = mask.reduceToVectors(
        geometry=region,
        scale=300,
        geometryType="polygon",
        eightConnected=True,
        labelProperty="zone",
        bestEffort=True,
        maxPixels=int(1e9),
    ).limit(max_zones)

    zones_geojson = vectors.getInfo()

    return {
        "zones":          zones_geojson,
        "mineral":        mineral,
        "mineralName":    preset["name"],
        "scoreThreshold": score_threshold,
        "sceneCount":     scene_count,
        "formula":        " + ".join(
                              f"{w:.2f}×{'¬' if k in invert_set else ''}{k}"
                              for k, w in pos.items()
                          ),
        "dateRange":      f"{start_date} → {end_date}",
    }
