"""Public-data analytical engines. EE calls run in the dispatcher's worker thread.

No local dataset downloads, arbitrary asset identifiers, silent MZ fallback,
fixed analytical values or bestEffort rescaling. Returned resolution is explicit.
"""
from datetime import date
import math
import re
from agent.public_datasets import source

# EE's CRS registry rejects the EPSG:6933 alias on the live service.
# Supply the equivalent NSIDC EASE-Grid 2.0 definition explicitly as WKT1.
# https://developers.google.com/earth-engine/apidocs/ee-projection
# https://nsidc.org/data/user-resources/help-center/guide-ease-grids
ANALYSIS_CRS = "EPSG:6933"
ANALYSIS_CRS_WKT = 'PROJCS["WGS 84 / NSIDC EASE-Grid 2.0 Global",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Cylindrical_Equal_Area"],PARAMETER["standard_parallel_1",30],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]'

S2 = "COPERNICUS/S2_SR_HARMONIZED"
WORLDCOVER = "ESA/WorldCover/v200"
ERA5 = "ECMWF/ERA5_LAND/DAILY_AGGR"
INDEX_BANDS = {"ndvi": ("B8", "B4"), "ndwi": ("B3", "B8"),
               "mndwi": ("B3", "B11"), "ndbi": ("B11", "B8"), "nbr": ("B8", "B12")}
WC_CLASSES = {10: "Árvores", 20: "Arbustos", 30: "Herbáceas", 40: "Culturas",
              50: "Áreas construídas", 60: "Solo nu/vegetação esparsa", 70: "Neve e gelo",
              80: "Água permanente", 90: "Zonas húmidas herbáceas", 95: "Mangais", 100: "Musgos e líquenes"}
WC_COLORS = ["006400", "ffbb22", "ffff4c", "f096ff", "fa0000", "b4b4b4",
             "f0f0f0", "0064c8", "0096a0", "00cf75", "fae6a0"]


def validate_period(start, end, earliest=None):
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except (ValueError, TypeError):
        raise ValueError("Indique datas válidas YYYY-MM-DD para os dois extremos do período.") from None
    if first >= last:
        raise ValueError("A data final deve ser posterior à inicial; o fim é exclusivo.")
    if earliest and start < earliest:
        raise ValueError(f"Esta fonte só está disponível desde {earliest}.")
    return first, last


def validate_geometry(geometry):
    if not isinstance(geometry, dict) or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("Seleccione um país, desenhe ou carregue uma AOI poligonal. Não é permitido processar o globo inteiro por omissão.")
    polygons = [geometry.get("coordinates")] if geometry["type"] == "Polygon" else geometry.get("coordinates")
    if not isinstance(polygons, (list, tuple)) or not polygons:
        raise ValueError("A área de estudo não contém polígonos.")
    count = 0
    normalised = []
    for polygon in polygons:
        if not isinstance(polygon, (list, tuple)) or not polygon:
            raise ValueError("Polígono vazio.")
        rings = []
        for ring in polygon:
            if not isinstance(ring, (list, tuple)) or len(ring) < 4:
                raise ValueError("Os anéis da AOI devem ser fechados e ter pelo menos quatro vértices.")
            points = []
            for point in ring:
                if not isinstance(point, (list, tuple)) or len(point) < 2:
                    raise ValueError("Coordenadas inválidas.")
                x, y = point[:2]
                if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (x, y)) or not (-180 <= x <= 180 and -90 <= y <= 90):
                    raise ValueError("Coordenadas fora de EPSG:4326.")
                points.append([x, y])
                count += 1
            if points[0] != points[-1]:
                raise ValueError("Os anéis da AOI devem ser fechados.")
            rings.append(points)
        normalised.append(rings)
    if count > 20000:
        raise ValueError("AOI demasiado complexa. Simplifique para até 20.000 vértices.")
    return {**geometry, "coordinates": normalised[0] if geometry["type"] == "Polygon" else normalised}


def grid_scale(area_m2, requested, native=10):
    if not math.isfinite(area_m2) or area_m2 <= 0:
        raise ValueError("Área de estudo vazia ou inválida.")
    if not isinstance(requested, (int, float)) or isinstance(requested, bool) or not math.isfinite(requested) or not native <= requested <= 20000:
        raise ValueError(f"Escala deve estar entre {native} e 20000 m para esta fonte.")
    return max(int(requested), int(math.ceil(math.sqrt(area_m2 / 8_000_000) / 10) * 10))


def _grid(geometry, requested=30, native=10):
    import ee
    region = (ee.Geometry(validate_geometry(geometry), "EPSG:4326", False)
              if isinstance(geometry, dict) else geometry)
    area = float(region.area(maxError=10).getInfo())
    scale = grid_scale(area, requested, native)
    return region, {"geometry": region, "scale": scale, "crs": ANALYSIS_CRS_WKT, "maxPixels": 20_000_000, "tileScale": 4}, area


def country_geometry(iso3):
    import ee
    if not isinstance(iso3, str) or not re.fullmatch(r"[A-Z]{3}", iso3):
        raise ValueError("Código de país inválido; use ISO alfa-3.")
    selected = ee.FeatureCollection("WM/geoLab/geoBoundaries/600/ADM0").filter(ee.Filter.eq("shapeGroup", iso3))
    if not selected.size().getInfo():
        raise ValueError("País não encontrado no geoBoundaries v6. Desenhe ou carregue um polígono para esta área.")
    # Keep the real polygon server-side; do not substitute the country's bbox.
    return selected.geometry(maxError=100)


def _s2_image(region, index, start, end, cloud_pct=30):
    import ee
    validate_period(start, end, "2017-03-28")
    if index not in INDEX_BANDS:
        raise ValueError("Índice não suportado. Use ndvi, ndwi, mndwi, ndbi ou nbr.")
    if not isinstance(cloud_pct, (int, float)) or isinstance(cloud_pct, bool) or not 0 <= cloud_pct <= 100:
        raise ValueError("Percentagem de nuvens deve estar entre 0 e 100.")
    def mask(image):
        scl = image.select("SCL")
        clear = scl.gte(4).And(scl.lte(6))
        return image.updateMask(clear).select(list(INDEX_BANDS[index])).multiply(0.0001)
    collection = (ee.ImageCollection(S2).filterBounds(region).filterDate(start, end)
                  .filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", cloud_pct)).map(mask))
    count = collection.size().getInfo()
    if not count:
        raise ValueError("Sem cenas Sentinel-2 no período/AOI e limiar de nuvens seleccionados.")
    image = collection.median().normalizedDifference(list(INDEX_BANDS[index])).rename("value").clip(region)
    return image, count


def _summary(image, grid):
    import ee
    reducer = (ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True)
               .combine(ee.Reducer.stdDev(), sharedInputs=True).combine(ee.Reducer.count(), sharedInputs=True))
    raw = image.rename("value").reduceRegion(reducer=reducer, **grid).getInfo() or {}
    if not raw.get("value_count") or raw.get("value_mean") is None:
        raise ValueError("Sem pixels válidos na área/período à escala de análise. Não foram estimados valores.")
    return {key.removeprefix("value_"): value for key, value in raw.items()}


def _area(image, grid):
    import ee
    result = (ee.Image.pixelArea().updateMask(image.mask().gt(0)).rename("area")
              .reduceRegion(reducer=ee.Reducer.sum(), **grid).getInfo() or {})
    value = result.get("area")
    if value is None or value <= 0:
        raise ValueError("Não existe área observada válida à escala seleccionada.")
    return value / 1e6


def _selected_area(mask, grid):
    import ee
    result = (ee.Image.pixelArea().updateMask(mask).rename("area")
              .reduceRegion(reducer=ee.Reducer.sum(), **grid).getInfo() or {})
    return (result.get("area") or 0) / 1e6


def _tile(image, minimum=-1, maximum=1, palette=None):
    vis = {"min": minimum, "max": maximum, "palette": palette or ["8c510a", "f6e8c3", "01665e"]}
    return image.visualize(**vis).getMapId()["tile_fetcher"].url_format


def _base(asset, grid, aoi_area, warning):
    return {"status": "success", "source": source(asset), "analysisScaleM": grid["scale"],
            "analysisCRS": ANALYSIS_CRS, "analysisCRSWKT": grid["crs"], "aoiAreaKm2": aoi_area / 1e6,
            "warning": warning + " Áreas calculadas na grelha de análise indicada, não são medições cadastrais."}


def zonal_statistics(geometry, index, start, end, threshold=None, comparison="gte", scale_m=30, cloud_pct=30):
    validate_period(start, end, "2017-03-28")
    if index not in INDEX_BANDS:
        raise ValueError("Indique o índice a calcular: ndvi, ndwi, mndwi, ndbi ou nbr. Um nome de camada livre não identifica um raster.")
    if comparison not in ("gte", "gt", "lte", "lt"):
        raise ValueError("Comparador deve ser gte, gt, lte ou lt.")
    if threshold is not None and (isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or not -1 <= threshold <= 1):
        raise ValueError("Limiar de índice deve estar entre -1 e 1.")
    region, grid, area = _grid(geometry, scale_m, 10 if index in ("ndvi", "ndwi") else 20)
    image, scenes = _s2_image(region, index, start, end, cloud_pct)
    stats = _summary(image, grid)
    valid = _area(image, grid)
    result = _base(S2, grid, area, "Estatísticas de índice sobre pixels observados; nuvens, sombras e neve são excluídas.")
    result.update({"index": index, "period": {"startDate": start, "endDate": end}, "sceneCount": scenes,
                   "stats": stats, "validAreaKm2": valid, "mean": stats["mean"],
                   "coveragePercent": min(100, valid / (area / 1e6) * 100)})
    if threshold is not None:
        selected = getattr(image, comparison)(threshold)
        selected_area = _selected_area(selected, grid)
        result.update({"threshold": threshold, "comparison": comparison, "selectedAreaKm2": selected_area,
                       "selectedPercentOfValidArea": selected_area / valid * 100})
    result["summary"] = f"{index.upper()}: média {stats['mean']:.4f}; área com dados {valid:.2f} km²; escala {grid['scale']} m."
    if threshold is not None:
        result["summary"] += f" Área {comparison} {threshold}: {selected_area:.2f} km² ({selected_area / valid * 100:.2f}% da área válida)."
    result["map_action"] = {"type": "ADD_LAYER", "id": f"agent_zonal_{index}", "name": f"{index.upper()} — estatísticas da AOI", "tileUrl": _tile(image), "opacity": 0.8}
    return result



def temporal_pixel(geometry, index, start1, end1, start2, end2, lon, lat,
                   threshold=0.2, scale_m=30, cloud_pct=30):
    """Sample real A/B spectral indices at one map click (no synthetic values).

    The point must be inside the selected AOI. Both values are masked to the
    shared valid footprint and sampled on a common analysis grid.
    """
    import ee
    validate_period(start1, end1, "2017-03-28")
    validate_period(start2, end2, "2017-03-28")
    if end1 > start2:
        raise ValueError("Os períodos não podem sobrepor-se.")
    if index not in INDEX_BANDS:
        raise ValueError("Índice não suportado.")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
           for v in (lon, lat, threshold)):
        raise ValueError("Coordenadas ou limiar inválidos.")
    if not (-180 <= lon <= 180 and -90 <= lat <= 90 and 0 < threshold <= 2):
        raise ValueError("Coordenadas ou limiar fora dos limites permitidos.")
    region, grid, _ = _grid(geometry, scale_m, 10 if index in ("ndvi", "ndwi") else 20)
    point = ee.Geometry.Point([lon, lat])
    if not region.intersects(point, maxError=10).getInfo():
        raise ValueError("O ponto está fora da área da análise.")
    before, _ = _s2_image(region, index, start1, end1, cloud_pct)
    after, _ = _s2_image(region, index, start2, end2, cloud_pct)
    common = before.mask().gt(0).And(after.mask().gt(0))
    paired = ee.Image.cat(before.rename("A"), after.rename("B")).updateMask(common)
    values = (paired.reduceRegion(
        reducer=ee.Reducer.first(), geometry=point,
        scale=grid["scale"], crs=grid["crs"], maxPixels=10_000,
        tileScale=4).getInfo() or {})
    value_a, value_b = values.get("A"), values.get("B")
    result = {"index": index.upper(), "longitude": lon, "latitude": lat,
              "analysisScaleM": grid["scale"],
              "periodA": {"startDate": start1, "endDate": end1},
              "periodB": {"startDate": start2, "endDate": end2},
              "threshold": threshold}
    if value_a is None or value_b is None:
        return {**result, "status": "no_data", "valueA": None, "valueB": None,
                "delta": None, "classification": "no_data"}
    difference = float(value_b) - float(value_a)
    classification = ("increase" if difference >= threshold
                      else "decrease" if difference <= -threshold else "stable")
    return {**result, "status": "success", "valueA": float(value_a),
            "valueB": float(value_b), "delta": difference,
            "classification": classification}



def temporal_quality(start1, end1, start2, end2, scenes1, scenes2, valid_km2, aoi_km2):
    """Calendar-window comparability is a flag, not proof of matched phenology."""
    a0, a1 = validate_period(start1, end1, "2017-03-28")
    b0, b1 = validate_period(start2, end2, "2017-03-28")
    aligned = (a0.strftime("%m-%d"), a1.strftime("%m-%d")) == (
        b0.strftime("%m-%d"), b1.strftime("%m-%d"))
    percent = min(100.0, 100 * valid_km2 / aoi_km2) if aoi_km2 > 0 else 0
    warnings = []
    warning_codes = []
    if not aligned:
        warning_codes.append("season")
        warnings.append("As janelas A/B abrangem épocas do ano diferentes; a sazonalidade pode explicar parte da diferença.")
    if scenes1 and scenes2 and min(scenes1, scenes2) / max(scenes1, scenes2) < 0.5:
        warning_codes.append("scenes")
        warnings.append("Os números de cenas A/B diferem mais de duas vezes; avalie o desequilíbrio temporal.")
    if percent < 70:
        warning_codes.append("coverage")
        warnings.append("Menos de 70% da AOI tem pixels válidos comuns; interprete as áreas com cautela.")
    return {
        "calendarAligned": aligned,
        "durationDays": {"A": (a1-a0).days, "B": (b1-b0).days},
        "sceneCounts": {"A": scenes1, "B": scenes2},
        "commonValidCoveragePercent": percent,
        "status": "review" if warnings else "calendar_aligned",
        "warnings": warnings, "warningCodes": warning_codes,
        "note": "Calendário equivalente não garante fenologia ou condições meteorológicas equivalentes.",
    }


def temporal_histogram(geometry, index, start1, end1, start2, end2, scale_m=30, cloud_pct=30):
    """On-demand Earth Engine histograms at the original analysis grid, common footprint.

    Histogram counts are weighted raster pixels, not independently surveyed area.
    """
    import ee
    validate_period(start1, end1, "2017-03-28")
    validate_period(start2, end2, "2017-03-28")
    if end1 > start2 or index not in INDEX_BANDS:
        raise ValueError("Períodos ou índice inválidos para histogramas.")
    region, grid, _ = _grid(geometry, scale_m, 10 if index in ("ndvi", "ndwi") else 20)
    before, scenes_a = _s2_image(region, index, start1, end1, cloud_pct)
    after, scenes_b = _s2_image(region, index, start2, end2, cloud_pct)
    common = before.mask().gt(0).And(after.mask().gt(0))
    paired = ee.Image.cat(before.rename("A"), after.rename("B")).updateMask(common)
    delta = after.subtract(before).rename("Delta").updateMask(common)
    pair_hist = paired.reduceRegion(
        reducer=ee.Reducer.fixedHistogram(-1, 1.000001, 24), **grid).getInfo() or {}
    delta_hist = delta.reduceRegion(
        reducer=ee.Reducer.fixedHistogram(-2, 2.000001, 32), **grid).getInfo() or {}
    def bins(raw):
        if not isinstance(raw, list):
            return []
        return [{"min": float(row[0]), "count": float(row[1])}
                for row in raw if isinstance(row, (list, tuple)) and len(row) == 2
                and all(isinstance(v, (int, float)) and math.isfinite(v) for v in row)]
    return {
        "status": "success", "index": index.upper(), "analysisScaleM": grid["scale"],
        "periodA": {"startDate": start1, "endDate": end1},
        "periodB": {"startDate": start2, "endDate": end2},
        "sceneCounts": {"A": scenes_a, "B": scenes_b},
        "histograms": {"A": bins(pair_hist.get("A")), "B": bins(pair_hist.get("B")),
                       "Delta": bins(delta_hist.get("Delta"))},
        "note": "Contagens ponderadas de pixels válidos comuns na grelha indicada; não são áreas cadastrais.",
    }


def temporal_geotiff_download(geometry, index, start1, end1, start2, end2,
                              scale_m=30, cloud_pct=30):
    """Bound a 3-band, masked, Float32 GeoTIFF to safe direct-download limits."""
    import ee
    from gee_download_grid import bounded_download_grid
    validate_period(start1, end1, "2017-03-28")
    validate_period(start2, end2, "2017-03-28")
    if end1 > start2 or index not in INDEX_BANDS:
        raise ValueError("Períodos ou índice inválidos para GeoTIFF.")
    native = 10 if index in ("ndvi", "ndwi") else 20
    region, _, _ = _grid(geometry, scale_m, native)
    # Derive a small bounding rectangle for grid size, but clip the imagery to
    # the original polygon. Never substitute the bounding rectangle as the AOI.
    bounds = region.bounds(maxError=100).getInfo()
    grid = bounded_download_grid(bounds, scale_m, 500_000)
    before, _ = _s2_image(region, index, start1, end1, cloud_pct)
    after, _ = _s2_image(region, index, start2, end2, cloud_pct)
    common = before.mask().gt(0).And(after.mask().gt(0))
    bands = ee.Image.cat(before.rename(index.upper() + "_A"),
                         after.rename(index.upper() + "_B"),
                         after.subtract(before).rename("Delta_" + index.upper()))
    raster = bands.updateMask(common).clip(region).toFloat()
    options = {
        "name": "geomoz_" + index + "_comparison_" + start1[:4] + "_" + start2[:4],
        "dimensions": grid["dimensions"], "crs": "EPSG:4326",
        "crs_transform": grid["crsTransform"], "format": "GEO_TIFF",
        "filePerBand": False,
    }
    return {
        "status": "success", "downloadUrl": raster.getDownloadURL(options),
        "format": "GEO_TIFF", "bands": [index.upper() + "_A", index.upper() + "_B",
                                     "Delta_" + index.upper()],
        "requestedScaleM": scale_m, "estimatedGridScaleM": grid["scale"],
        "dimensions": grid["dimensions"], "resolutionAdjusted": grid["resolutionAdjusted"],
        "estimatedBytes": grid["estimatedBytes"] * 3,
        "crs": "EPSG:4326", "noData": "Masked pixels remain NoData.",
        "note": "Download limitado a 500 000 pixels. O valor de escala é aproximado no CRS geográfico; confirme resolução e grelha do ficheiro no SIG.",
    }


def temporal_change(geometry, index, start1, end1, start2, end2, scale_m=30, cloud_pct=30, threshold=0.2):
    validate_period(start1, end1, "2017-03-28")
    validate_period(start2, end2, "2017-03-28")
    if end1 > start2:
        raise ValueError("Os períodos devem ser cronológicos e não se sobrepor (fim A <= início B).")
    if not isinstance(threshold, (int, float)) or isinstance(threshold, bool) or not 0 < threshold <= 2:
        raise ValueError("Limiar absoluto de mudança deve ser maior que 0 e até 2.")
    region, grid, area = _grid(geometry, scale_m, 10 if index in ("ndvi", "ndwi") else 20)
    before, scenes1 = _s2_image(region, index, start1, end1, cloud_pct)
    after, scenes2 = _s2_image(region, index, start2, end2, cloud_pct)
    common = before.mask().gt(0).And(after.mask().gt(0))
    delta = after.subtract(before).updateMask(common).rename("value")
    stats = _summary(delta, grid)
    valid = _area(delta, grid)
    increase = _selected_area(delta.gte(threshold), grid)
    decrease = _selected_area(delta.lte(-threshold), grid)
    # Thresholded overlay: neutral pixels remain transparent, not opaque white.
    # Keep the original delta for statistics and a selectable continuous view.
    changed_mask = delta.gte(threshold).Or(delta.lte(-threshold))
    changed_classes = delta.gte(threshold).subtract(delta.lte(-threshold)).updateMask(changed_mask)
    # Render both real observation windows with an identical palette and on the
    # same common-valid footprint. Swipe comparison never substitutes one period
    # for the other or treats no-data as vegetation loss.
    period_a_visual = before.updateMask(common)
    period_b_visual = after.updateMask(common)
    comparison_palette = ["8c510a", "dfc27d", "f6e8c3", "80cdc1", "01665e"]
    quality = temporal_quality(start1, end1, start2, end2, scenes1, scenes2, valid, area / 1e6)
    neutral = max(0.0, valid - increase - decrease)
    result = _base(S2, grid, area, "Diferença de índice B − A; não confirma desflorestação, urbanização ou área ardida. Compare épocas sazonais equivalentes. Valores só na intersecção dos pixels válidos dos dois períodos.")
    result.update({"index": index, "formula": "delta = periodB - periodA", "threshold": threshold,
                   "periodA": {"startDate": start1, "endDate": end1}, "periodB": {"startDate": start2, "endDate": end2},
                   "sceneCounts": {"A": scenes1, "B": scenes2}, "stats": stats,
                   "commonValidAreaKm2": valid, "increaseAreaKm2": increase, "decreaseAreaKm2": decrease,
                   "neutralAreaKm2": neutral, "quality": quality,
                   "mean": stats["mean"], "coveragePercent": min(100, valid / (area / 1e6) * 100),
                   "summary": f"Δ{index.upper()} (B − A): média {stats['mean']:.4f}; aumento ≥ {threshold}: {increase:.2f} km²; diminuição ≤ −{threshold}: {decrease:.2f} km²; suporte comum {valid:.2f} km² à escala {grid['scale']} m.",
                   "map_action": {
                       "type": "ADD_LAYER", "id": f"agent_change_{index}",
                       "name": f"Δ{index.upper()} — B − A",
                       "tileUrl": _tile(changed_classes, -1, 1, ["d73027", "1a9850"]),
                       "opacity": 0.9,
                       "temporalChange": {
                           "index": index.upper(), "threshold": threshold,
                           "periodA": {"startDate": start1, "endDate": end1},
                           "periodB": {"startDate": start2, "endDate": end2},
                           "continuousTileUrl": _tile(delta, -0.4, 0.4, ["b2182b", "f7f7f7", "1a9850"]),
                           "continuousRange": [-0.4, 0.4],
                           "periodATileUrl": _tile(period_a_visual, -0.2, 0.9, comparison_palette),
                           "periodBTileUrl": _tile(period_b_visual, -0.2, 0.9, comparison_palette),
                           "comparisonRange": [-0.2, 0.9],
                           "comparisonPalette": comparison_palette,
                       },
                   }})
    return result


def landcover(geometry, scale_m=30):
    import ee
    region, grid, area = _grid(geometry, scale_m)
    image = ee.ImageCollection(WORLDCOVER).first().select("Map").clip(region)
    grouped = (ee.Image.pixelArea().rename("area").addBands(image.rename("class"))
               .reduceRegion(reducer=ee.Reducer.sum().group(groupField=1, groupName="class"), **grid).getInfo() or {})
    groups = grouped.get("groups") or []
    valid = sum(float(row["sum"]) for row in groups) / 1e6
    if valid <= 0:
        raise ValueError("WorldCover sem cobertura válida na área escolhida.")
    classes = [{"id": int(row["class"]), "name": WC_CLASSES.get(int(row["class"]), "Classe não identificada"),
                "areaKm2": row["sum"] / 1e6, "percentOfValidArea": row["sum"] / 1e6 / valid * 100} for row in groups]
    classes.sort(key=lambda row: row["areaKm2"], reverse=True)
    display = image.remap(list(WC_CLASSES), list(range(11)))
    result = _base(WORLDCOVER, grid, area, "Cobertura de 2021 (WorldCover v200), independentemente do período seleccionado no projecto. Classificação automática sujeita a erro.")
    result.update({"year": 2021, "validAreaKm2": valid, "classes": classes,
                   "summary": "WorldCover 2021: " + "; ".join(f"{c['name']}: {c['areaKm2']:.2f} km² ({c['percentOfValidArea']:.1f}%)" for c in classes),
                   "map_action": {"type": "ADD_LAYER", "id": "agent_worldcover_2021", "name": "WorldCover 2021 — cobertura do solo", "tileUrl": _tile(display, 0, 10, WC_COLORS), "opacity": 0.8}})
    return result


def climate(geometry, start, end, variable="precipitation", scale_m=11132):
    import ee
    first, last = validate_period(start, end, "1950-01-02")
    if variable not in ("precipitation", "temperature"):
        raise ValueError("Variável climática inválida.")
    region, grid, area = _grid(geometry, scale_m, 11132)
    band = "total_precipitation_sum" if variable == "precipitation" else "temperature_2m"
    collection = ee.ImageCollection(ERA5).filterBounds(region).filterDate(start, end).select(band)
    count = collection.size().getInfo()
    expected = (last - first).days
    if count != expected:
        raise ValueError(f"Período ERA5-Land incompleto: {count} dias disponíveis de {expected}. Escolha um período integralmente disponível.")
    image = collection.sum().multiply(1000) if variable == "precipitation" else collection.mean().subtract(273.15)
    image = image.rename("value").clip(region)
    stats = _summary(image, grid)
    unit = "mm no período" if variable == "precipitation" else "°C (média no período)"
    result = _base(ERA5, grid, area, "Reanálise climática modelada, não observações de estação nem previsão meteorológica. Precipitação pode apresentar artefactos de acumulação do produto original; não são corrigidos silenciosamente.")
    result.update({"variable": variable, "unit": unit, "period": {"startDate": start, "endDate": end},
                   "dayCount": count, "stats": stats, "mean": stats["mean"],
                   "summary": f"ERA5-Land: média espacial {stats['mean']:.2f} {unit}; {count} dias; grelha {grid['scale']} m.",
                   "map_action": {"type": "ADD_LAYER", "id": f"agent_era5_{variable}", "name": f"ERA5-Land — {variable} ({unit})", "tileUrl": _tile(image, 0 if variable == "precipitation" else -20, 1500 if variable == "precipitation" else 45, ["fff7fb", "74a9cf", "023858"]), "opacity": 0.8}})
    return result
