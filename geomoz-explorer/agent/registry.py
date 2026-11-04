"""
GeoMoz Tool Registry — Deterministic Geospatial Tools for GeoMoz AI Agent.
Every tool is validated, typed, and maps to robust GEE or GeoPandas routines.
"""

import os
import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

# ── Gemini Function Calling Tool Declarations ─────────────────────────────────

TOOL_DECLARATIONS = [
    {
        "name": "resolve_aoi",
        "description": "Resolve e valida os limites geográficos (GeoJSON) de uma província ou distrito de Moçambique.",
        "parameters": {
            "type": "object",
            "properties": {
                "province": {"type": "string", "description": "Nome da província (ex: 'Maputo', 'Zambezia', 'Tete', 'Manica', 'Nampula')"},
                "district": {"type": "string", "description": "Nome do distrito (opcional, ex: 'Boane', 'Mocuba', 'Moatize')"}
            },
            "required": ["province"]
        }
    },
    {
        "name": "calculate_index",
        "description": "Calcula um índice biofísico, mineral ou climático de satélite via Google Earth Engine (Sentinel-2 / Landsat 8 / MODIS).",
        "parameters": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "string",
                    "description": "Código do índice. Opções: 'ndvi' (vigor vegetal), 'ndwi' (água/humidade), 'mndwi' (água modificada), 'clay' (argilas S2), 'fe_oxide' (óxidos de ferro S2), 'gossan' (chapéu de ferro), 'hydrothermal' (alteração geral), 'clay_l8' (argilas Landsat 8), 'fe_oxide_l8' (óxidos de ferro L8), 'hydrothermal_l8' (alteração hidrotermal Sabins L8), 'ferrous_l8' (minerais ferrosos L8), 'silica_l8' (silicificação L8), 'carbonate_chlorite_l8' (carbonatos L8), 'gossan_l8' (gossan L8), 'evi' (vegetação melhorada), 'savi' (solo ajustado), 'ndmi' (humidade foliar), 'lai' (área foliar), 'cwsi' (stress hídrico), 'spei' (seca climática), 'vci' (condição vegetal), 'vhi' (saúde vegetal), 'precipitation' (chuva CHIRPS), 'temperature_lst' (temperatura superficial MODIS), 'cyclone_risk' (risco de ciclones)",
                    "enum": [
                        "ndvi", "ndwi", "mndwi", "clay", "fe_oxide", "gossan", "hydrothermal", "ndbi",
                        "clay_l8", "fe_oxide_l8", "hydrothermal_l8", "ferrous_l8", "gossan_l8", "carbonate_chlorite_l8", "silica_l8",
                        "evi", "savi", "ndmi", "lai", "cwsi", "spei", "vci", "tci", "vhi", "ndti",
                        "precipitation", "temperature_lst", "cyclone_risk", "forest_loss", "burned_area"
                    ]
                },
                "start_date": {"type": "string", "description": "Data inicial YYYY-MM-DD (padrão: 2024-01-01)"},
                "end_date": {"type": "string", "description": "Data final YYYY-MM-DD (padrão: 2024-12-31)"}
            },
            "required": ["index"]
        }
    },
    {
        "name": "get_elevation_dem",
        "description": "Obtém o modelo digital de elevação (Copernicus DEM 30m GLO-30) para hipsometria e altimetria.",
        "parameters": {
            "type": "object",
            "properties": {
                "interval_m": {"type": "number", "description": "Equidistância para curvas de nível em metros (ex: 20, 50, 100)"}
            }
        }
    },
    {
        "name": "calculate_slope",
        "description": "Calcula a declividade topográfica do terreno em graus a partir do modelo digital de elevação.",
        "parameters": {
            "type": "object",
            "properties": {
                "max_slope_deg": {"type": "number", "description": "Limiar máximo de declividade aceitável (ex: 15 para agricultura ou energia solar)"}
            }
        }
    },
    {
        "name": "extract_lineaments",
        "description": "Deteta automaticamente falhas, fraturas e lineamentos estruturais via filtros direcionais Canny/Sobel sobre o relevo sombreado.",
        "parameters": {
            "type": "object",
            "properties": {
                "density_radius_m": {"type": "integer", "description": "Raio de densidade focal em metros (padrão: 750)"}
            }
        }
    },
    {
        "name": "run_mineral_targeting",
        "description": "Aplica um modelo multi-critério ponderado (0-100) para favorabilidade mineral geológica.",
        "parameters": {
            "type": "object",
            "properties": {
                "mineral": {
                    "type": "string",
                    "description": "Tipo de mineral alvo",
                    "enum": ["gold", "copper", "iron_oxide", "bauxite", "pegmatites", "graphite", "coal", "heavy_minerals"]
                },
                "score_threshold": {"type": "number", "description": "Limiar de corte favorável (0.0 a 1.0, padrão 0.70)"}
            },
            "required": ["mineral"]
        }
    },
    {
        "name": "delineate_watershed",
        "description": "Delimita a bacia hidrográfica a montante a partir de um ponto de exutório (latitude, longitude) via D8 e HydroATLAS.",
        "parameters": {
            "type": "object",
            "properties": {
                "lat": {"type": "number", "description": "Latitude do ponto de exutório"},
                "lon": {"type": "number", "description": "Longitude do ponto de exutório"}
            },
            "required": ["lat", "lon"]
        }
    },
    {
        "name": "get_river_network",
        "description": "Gera a rede hidrográfica com classificação de ordens de Strahler e rios vetoriais HydroSHEDS FreeFlowingRivers.",
        "parameters": {
            "type": "object",
            "properties": {
                "min_order": {"type": "integer", "description": "Ordem mínima de Strahler (1: todas as linhas, 3: rios principais)", "default": 1}
            }
        }
    },
    {
        "name": "run_alphaearth_pca",
        "description": "Processa os embeddings de 64 dimensões do modelo fundacional de satélite Google DeepMind (AlphaEarth Foundations) e reduz para 3 canais RGB.",
        "parameters": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Ano do embedding (2017 a 2024)", "default": 2024}
            }
        }
    },
    {
        "name": "calculate_zonal_statistics",
        "description": "Ainda indisponível neste agente: requer integração de raster/máscara. Não usar para estimar áreas.",
        "parameters": {
            "type": "object",
            "properties": {
                "layer_name": {"type": "string", "description": "Nome da camada a quantificar"}
            },
            "required": ["layer_name"]
        }
    },
    {
        "name": "get_geology_units",
        "description": "Consulta dados geológicos reais do GeoMoz por AOI, província, distrito ou litologia e calcula área e percentagem por unidade. Inclui acção para mostrar polígonos reais no mapa; não estima jazigos nem deve inventar litologias.",
        "parameters": {
            "type": "object",
            "properties": {
                "province": {"type": "string", "description": "Província alvo (opcional)"},
                "district": {"type": "string", "description": "Distrito alvo (opcional)"},
                "filter_str": {"type": "string", "description": "Filtro litológico (ex: 'granito', 'basalto', 'gnaisse', 'calcário')"}
            }
        }
    },
    {
        "name": "get_flood_susceptibility",
        "description": "Triagem por classes topográficas. Não calcula risco, extensão de inundação ou probabilidade de cheias.",
        "parameters": {
            "type": "object",
            "properties": {
                "province": {"type": "string", "description": "Província alvo"},
                "district": {"type": "string", "description": "Distrito alvo"}
            }
        }
    },
    {
        "name": "get_precipitation_chirps",
        "description": "Gera mapa e quantificação da precipitação anual acumulada (mm) via CHIRPS Daily (UCSB Climate Hazards Group).",
        "parameters": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Ano pluviométrico de referência (ex: 2023)", "default": 2023}
            }
        }
    },
    {
        "name": "run_multicriteria_ahp",
        "description": "Sobreposição ponderada exploratória para groundwater. Outros temas indisponíveis. Não fornece matriz AHP nem razão de consistência.",
        "parameters": {
            "type": "object",
            "properties": {
                "theme": {
                    "type": "string",
                    "description": "Domínio temático da análise",
                    "enum": ["groundwater", "solar", "agriculture", "hazard"]
                }
            },
            "required": ["theme"]
        }
    },
    {
        "name": "detect_temporal_change",
        "description": "Comparação temporal ainda indisponível neste agente. Não apresentar o mapa de um só período como diferença temporal.",
        "parameters": {
            "type": "object",
            "properties": {
                "index": {"type": "string", "description": "Índice de base ('ndvi', 'ndwi', 'nbr')", "default": "ndvi"},
                "start_date_1": {"type": "string", "description": "Início do período 1 (YYYY-MM-DD)", "default": "2020-01-01"},
                "end_date_1": {"type": "string", "description": "Fim do período 1 (YYYY-MM-DD)", "default": "2020-12-31"},
                "start_date_2": {"type": "string", "description": "Início do período 2 (YYYY-MM-DD)", "default": "2024-01-01"},
                "end_date_2": {"type": "string", "description": "Fim do período 2 (YYYY-MM-DD)", "default": "2024-12-31"}
            }
        }
    },
    {
        "name": "get_soil_moisture_smap",
        "description": "Obtém dados de humidade do solo e seca agrícola via NASA-USDA SMAP 9km (nível superficial ou zona radicular 'rootzone').",
        "parameters": {
            "type": "object",
            "properties": {
                "depth": {
                    "type": "string",
                    "description": "Profundidade: 'rootzone' (zona radicular 0-100cm) ou 'surface' (superficial 0-5cm)",
                    "enum": ["rootzone", "surface"],
                    "default": "rootzone"
                },
                "start_date": {"type": "string", "description": "Data inicial YYYY-MM-DD (padrão: 2024-01-01)"},
                "end_date": {"type": "string", "description": "Data final YYYY-MM-DD (padrão: 2024-12-31)"}
            }
        }
    },
    {
        "name": "get_water_erosion_rusle",
        "description": "Modela o risco e taxa de perda de solo por erosão hídrica em t/ha/ano via equação universal RUSLE (relevo DEM, chuva CHIRPS e coberto vegetal).",
        "parameters": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Ano de referência (padrão 2023)", "default": 2023}
            }
        }
    },
    {
        "name": "get_wildfire_activity",
        "description": "Mapeia focos de queimadas ativas e atividade de fogo via satélite NASA FIRMS VIIRS / MODIS.",
        "parameters": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "Data inicial YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "Data final YYYY-MM-DD"},
                "min_confidence": {"type": "integer", "description": "Confiança mínima (0 a 100, padrão 50)", "default": 50}
            }
        }
    }
]


# Public global analytics use documented, fixed assets only.
_PUBLIC_INDEX = {"type": "string", "enum": ["ndvi", "ndwi", "mndwi", "ndbi", "nbr"]}
_PUBLIC_SCALE = {"type": "number", "description": "Escala de análise em metros; pode ser aumentada explicitamente no resultado para AOIs grandes."}
_PUBLIC_DATES = {"start_date": {"type": "string", "description": "YYYY-MM-DD; início inclusivo"},
                 "end_date": {"type": "string", "description": "YYYY-MM-DD; fim exclusivo"}}
for _decl in TOOL_DECLARATIONS:
    if _decl["name"] == "calculate_zonal_statistics":
        _decl["description"] = "Calcula de facto estatísticas e área por limiar de NDVI/NDWI/MNDWI/NDBI/NBR em Sentinel-2; percentagens referem-se à área válida, não a pixels sem observação. Disponível mundialmente dentro da cobertura do sensor."
        _decl["parameters"] = {"type": "object", "properties": {
            "index": _PUBLIC_INDEX, "layer_name": {"type": "string", "description": "Compatibilidade: código exacto do índice, não um nome livre de camada"},
            **_PUBLIC_DATES, "threshold": {"type": "number", "description": "Limiar de -1 a 1, opcional"},
            "comparison": {"type": "string", "enum": ["gte", "gt", "lte", "lt"]},
            "scale_m": _PUBLIC_SCALE, "cloud_pct": {"type": "number"}}}
    if _decl["name"] == "detect_temporal_change":
        _decl["description"] = "Calcula diferença Sentinel-2 B menos A entre dois períodos explícitos, na intersecção dos pixels válidos. Quantifica áreas de aumento/diminuição por limiar; não confirma desflorestação nem área ardida."
        _decl["parameters"] = {"type": "object", "properties": {
            "index": _PUBLIC_INDEX,
            **{key: {"type": "string", "description": "YYYY-MM-DD; fim exclusivo"}
               for key in ("start_date_1", "end_date_1", "start_date_2", "end_date_2")},
            "threshold": {"type": "number", "description": "Limiar absoluto de mudança > 0 e <= 2"},
            "scale_m": _PUBLIC_SCALE, "cloud_pct": {"type": "number"}},
            "required": ["index", "start_date_1", "end_date_1", "start_date_2", "end_date_2"]}
TOOL_DECLARATIONS += [
    {"name": "list_public_datasets", "description": "Lista fontes públicas mundiais, resoluções, cobertura, período, termos e estado de integração. Só metadados; não executa análises nem exige autenticação GEE.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "get_public_landcover", "description": "Mapa e áreas reais por classe da cobertura global WorldCover v200. Refere-se estritamente a 2021; ignora o período do projecto por ser um produto estático.",
     "parameters": {"type": "object", "properties": {"scale_m": _PUBLIC_SCALE}}},
    {"name": "get_global_climate", "description": "Clima terrestre mundial ERA5-Land: total de precipitação (mm) ou média da temperatura do ar (°C) no período. Exige todos os dias disponíveis; reanálise, não previsão.",
     "parameters": {"type": "object", "properties": {**_PUBLIC_DATES,
         "variable": {"type": "string", "enum": ["precipitation", "temperature"]}, "scale_m": _PUBLIC_SCALE}}},
]


# ── Tool Execution Dispatcher ──────────────────────────────────────────────────

class ToolDispatcher:
    """Executes deterministic GIS tools safely."""

    @staticmethod
    async def execute(tool_name: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Validate, execute and capture request-scoped scientific evidence."""
        from agent.intelligence import execute_tool
        return await execute_tool(tool_name, args, context, TOOL_DECLARATIONS,
                                  ToolDispatcher._execute_impl)

    @staticmethod
    async def _execute_impl(tool_name: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch a validated call to its underlying implementation."""
        logger.info("Executing Agent Tool '%s' with args: %s", tool_name, args)

        aoi = context.get("aoi") or {}
        if not isinstance(aoi, dict):
            aoi = {}
        province = args.get("province") or aoi.get("province")
        district = args.get("district") or aoi.get("district")
        region_geom = aoi.get("geometry") or aoi.get("customGeometry")
        period = context.get("temporalWindow", {})
        start_date = args.get("start_date") or period.get("startDate") or "2024-01-01"
        end_date = args.get("end_date") or period.get("endDate") or "2024-12-31"

        gee_token = context.get("gee_token") or args.get("gee_token")
        gee_project = context.get("gee_project") or args.get("gee_project") or os.environ.get("GEE_PROJECT_ID", "geoprocessamento-426809")

        def _ensure_gee():
            import gee_module
            try:
                gee_module._init_gee(token=gee_token, project=gee_project)
            except Exception as e:
                logger.warning("Agent GEE init attempt notice: %s", e)

        try:
            if tool_name == "list_public_datasets":
                from agent.public_datasets import public_catalogue
                return public_catalogue()

            if tool_name in ("calculate_zonal_statistics", "detect_temporal_change", "get_public_landcover", "get_global_climate"):
                # Reject incomplete analytical requests before any authentication/RPC.
                from agent import earth_engine_tools as public
                dates = context.get("temporalWindow") or {}
                if tool_name == "calculate_zonal_statistics":
                    if (args.get("index") or args.get("layer_name")) not in public.INDEX_BANDS:
                        return {"status": "error", "message": "Indique um código de índice válido: ndvi, ndwi, mndwi, ndbi ou nbr."}
                    public.validate_period(args.get("start_date") or dates.get("startDate"), args.get("end_date") or dates.get("endDate"), "2017-03-28")
                if tool_name == "get_global_climate":
                    public.validate_period(args.get("start_date") or dates.get("startDate"), args.get("end_date") or dates.get("endDate"), "1950-01-02")
                # Keep blocking Earth Engine RPCs off the async request loop.
                import asyncio
                boundary_code = aoi.get("countryCode") if aoi.get("source") == "country" else (
                    "MOZ" if aoi.get("source") == "mozambique" and not province and region_geom is None else None)
                def run_public_analysis():
                    import gee_module
                    from agent import earth_engine_tools as public
                    gee_module._init_gee(token=gee_token, project=gee_project)
                    region = region_geom
                    if boundary_code:
                        region = public.country_geometry(boundary_code)
                    elif region is None:
                        if not province:
                            raise ValueError("Seleccione um país, província ou AOI desenhada. A vista mundial não define uma área de análise.")
                        import api
                        region = api._region_geojson(province=province, district=district)
                    if isinstance(region, dict):
                        public.validate_geometry(region)
                    dates = context.get("temporalWindow") or {}
                    start = args.get("start_date") or dates.get("startDate")
                    end = args.get("end_date") or dates.get("endDate")
                    if tool_name == "calculate_zonal_statistics":
                        index = args.get("index") or args.get("layer_name")
                        return public.zonal_statistics(region, index, start, end,
                            args.get("threshold"), args.get("comparison") or "gte",
                            args.get("scale_m", 30), args.get("cloud_pct", 30))
                    if tool_name == "detect_temporal_change":
                        return public.temporal_change(region, args["index"],
                            args["start_date_1"], args["end_date_1"], args["start_date_2"], args["end_date_2"],
                            args.get("scale_m", 30), args.get("cloud_pct", 30), args.get("threshold", 0.2))
                    if tool_name == "get_public_landcover":
                        return public.landcover(region, args.get("scale_m", 30))
                    return public.climate(region, start, end, args.get("variable") or "precipitation", args.get("scale_m", 11132))
                result = await asyncio.to_thread(run_public_analysis)
                if boundary_code and result.get("status") == "success":
                    from agent.public_datasets import source
                    result["boundarySource"] = source("WM/geoLab/geoBoundaries/600/ADM0")
                    result["countryCode"] = boundary_code
                    result["warning"] += " Limite nacional geoBoundaries v6; não foi usada a caixa envolvente apresentada na selecção."
                    context["aoi"] = {**aoi, "geometry": None,
                                      "boundaryDataset": "WM/geoLab/geoBoundaries/600/ADM0"}
                return result

            if tool_name == "resolve_aoi":
                prov_name = args.get("province", "Maputo")
                dist_name = args.get("district")
                region_geojson = None
                try:
                    import api
                    region_geojson = api._region_geojson(province=prov_name, district=dist_name)
                except Exception:
                    region_geojson = None
                if region_geojson is None:
                    return {"status": "error", "message": "Limites da área de estudo indisponíveis. Seleccione uma província ou distrito válido."}
                label = f"{dist_name}, {prov_name}" if dist_name else prov_name
                return {
                    "status": "success",
                    "label": label,
                    "province": prov_name,
                    "district": dist_name,
                    "hasGeometry": region_geojson is not None,
                    "map_action": {
                        "type": "SET_AOI",
                        "province": prov_name,
                        "district": dist_name,
                        "geometry": region_geojson
                    }
                }

            elif tool_name == "calculate_index":
                import gee_module
                import api
                _ensure_gee()
                idx = args.get("index", "ndvi")
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_index_tile(
                    index=idx,
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date,
                    cloud_pct=30
                )
                mean_val = result.get("stats", {}).get("mean")
                if mean_val is None:
                    mean_val = result.get("stats", {}).get("p50")
                summary_val = f"{float(mean_val):.3f}" if mean_val is not None else "N/D"
                return {
                    "status": "success",
                    "index": idx,
                    "name": result.get("name"),
                    "tileUrl": result.get("tileUrl"),
                    "mean": summary_val,
                    "science": result.get("science"),
                    "warning": result.get("warning"),
                    "sceneCount": result.get("sceneCount"),
                    "statisticsLevel": result.get("statisticsLevel"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": f"agent_{idx}",
                        "name": result.get("name"),
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.8
                    }
                }

            elif tool_name == "get_elevation_dem":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                interval = int(args.get("interval_m", 50))
                result = gee_module.compute_contours_tile(region_geojson=region, interval_m=interval)
                return {
                    "status": "success",
                    "tileUrl": result.get("tileUrl"),
                    "elevationRange": f"{result.get('minElevM', 0):.0f}m a {result.get('maxElevM', 0):.0f}m",
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_dem_contours",
                        "name": f"Curvas de Nível ({interval}m)",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.85
                    }
                }

            elif tool_name == "calculate_slope":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_index_tile(
                    index="slope",
                    region_geojson=region,
                    start_date="2023-01-01",
                    end_date="2023-12-31"
                )
                return {
                    "status": "success",
                    "name": "Declividade Topográfica",
                    "tileUrl": result.get("tileUrl"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_slope",
                        "name": "Declividade (Graus)",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.75
                    }
                }

            elif tool_name == "extract_lineaments":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                rad = int(args.get("density_radius_m", 750))
                result = gee_module.compute_lineaments_tile(region_geojson=region, density_radius_m=rad)
                dominant_dir = None
                return {
                    "status": "success",
                    "name": result.get("name"),
                    "tileUrl": result.get("tileUrl"),
                    "edgesTileUrl": result.get("edgesTileUrl"),
                    "dominantOrientation": dominant_dir,
                    "meanDensity": result.get("meanDensity"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_lineaments",
                        "name": "Lineamentos & Fraturas",
                        "tileUrl": result.get("tileUrl"),
                        "edgesTileUrl": result.get("edgesTileUrl"),
                        "opacity": 0.85
                    }
                }

            elif tool_name == "run_mineral_targeting":
                import gee_module
                import api
                _ensure_gee()
                mineral = args.get("mineral", "gold")
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                thresh = float(args.get("score_threshold", 0.7))
                result = gee_module.compute_targeting_tile(
                    mineral=mineral,
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date,
                    score_threshold=thresh
                )
                stats = result.get("stats", {})
                fav_area = stats.get("favorableAreaKm2", 0.0)
                return {
                    "status": "success",
                    "mineral": mineral,
                    "tileUrl": result.get("tileUrl"),
                    "favorableAreaKm2": f"{fav_area:.1f} km²",
                    "p90": stats.get("p90", "N/D"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": f"agent_targeting_{mineral}",
                        "name": f"Favorabilidade — {mineral.replace('_', ' ').title()}",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.85
                    }
                }

            elif tool_name == "delineate_watershed":
                import gee_module
                _ensure_gee()
                lat = float(args.get("lat", -25.96))
                lon = float(args.get("lon", 32.58))
                result = gee_module.compute_watershed_from_point(lat=lat, lon=lon, region_geojson=None)
                return {
                    "status": "success",
                    "areaKm2": f"{result.get('areaKm2', 0)} km²",
                    "tileUrl": result.get("tileUrl"),
                    "source": result.get("source", "D8/HydroATLAS"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_watershed",
                        "name": f"Bacia Hidrográfica ({result.get('areaKm2', 0)} km²)",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.6
                    }
                }

            elif tool_name == "get_river_network":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_river_network(region_geojson=region)
                return {
                    "status": "success",
                    "tileUrl": result.get("freeFlowingTileUrl") or result.get("tileUrl"),
                    "majorTileUrl": result.get("majorTileUrl"),
                    "name": "Rede Hidrográfica FreeFlowingRivers",
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_rivers",
                        "name": "Rios & Linhas de Água (HydroSHEDS)",
                        "tileUrl": result.get("freeFlowingTileUrl") or result.get("tileUrl"),
                        "opacity": 0.9
                    }
                }

            elif tool_name == "run_alphaearth_pca":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                year = int(args.get("year", 2024))
                result = gee_module.compute_embedding_tile(region_geojson=region, year=year)
                return {
                    "status": "success",
                    "name": result.get("name"),
                    "year": year,
                    "tileUrl": result.get("tileUrl"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_alphaearth_pca",
                        "name": f"AlphaEarth Foundations PCA ({year})",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.8
                    }
                }

            elif tool_name == "get_geology_units":
                from starlette.concurrency import run_in_threadpool
                from agent.geology_data import summarize_geology

                # A national geology file may take seconds to read/clip.
                # Do not freeze the async server or other chat sessions.
                return await run_in_threadpool(
                    summarize_geology,
                    province=province, district=district,
                    geometry=region_geom, filter_str=args.get("filter_str"),
                )

            elif tool_name == "get_flood_susceptibility":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_index_tile(
                    index="topo_class",
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date
                )
                return {
                    "status": "success",
                    "name": "Triagem topográfica — classes do terreno",
                    "tileUrl": result.get("tileUrl"),
                    "warning": "Classes topográficas apenas. Não calcula extensão de inundação, exposição ou probabilidade de cheia.",
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_flood_susceptibility",
                        "name": "Classes topográficas — triagem de terreno",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.85
                    }
                }

            elif tool_name == "get_precipitation_chirps":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                if args.get("year") is not None:
                    start_date = f"{args['year']:04d}-01-01"
                    end_date = f"{args['year'] + 1:04d}-01-01"
                result = gee_module.compute_index_tile(
                    index="precipitation",
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date
                )
                return {
                    "status": "success",
                    "name": "Precipitação Anual Acumulada (CHIRPS)",
                    "tileUrl": result.get("tileUrl"),
                    "sensor": "UCSB CHIRPS 5km",
                    "meanRainfallMm": result.get("stats", {}).get("mean"),
                    "dateRange": result.get("dateRange"),
                    "science": result.get("science"),
                    "warning": result.get("warning"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_precipitation_chirps",
                        "name": "Precipitação Acumulada (CHIRPS)",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.8
                    }
                }

            elif tool_name == "run_multicriteria_ahp":
                # Formerly returned one terrain/index layer labelled as AHP.
                # Only the existing six-factor groundwater engine is supported.
                if args.get("theme") != "groundwater":
                    return {"status": "error", "message": "Modelo multicritério ainda não implementado para este tema. Não foi calculada aptidão."}
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                year = int(start_date[:4])
                result = gee_module.compute_groundwater_ahp(region_geojson=region, year=year)
                return {"status": "success", "theme": "groundwater",
                        "name": "Potencial hidrogeológico — sobreposição ponderada",
                        "source": result.get("source"), "year": year,
                        "classes": result.get("classes"), "weights": result.get("weights"),
                        "warning": "Modelo exploratório com pesos predefinidos. Matriz AHP e razão de consistência não verificadas; não confirma presença de água.",
                        "map_action": {"type": "ADD_LAYER", "id": "agent_ahp_groundwater",
                                       "name": "Potencial hidrogeológico — sobreposição ponderada",
                                       "tileUrl": result.get("tile"), "opacity": 0.85}}

            elif tool_name == "get_soil_moisture_smap":
                import gee_module
                import api
                _ensure_gee()
                depth = args.get("depth", "rootzone")
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_soil_moisture_smap(
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date,
                    depth=depth
                )
                mean_sm = result.get("stats", {}).get("mean")
                if mean_sm is None:
                    mean_sm = result.get("stats", {}).get("p50")
                summary_val = f"{float(mean_sm):.3f} m³/m³" if mean_sm is not None else "N/D"
                depth_label = "Zona Radicular (0-100cm)" if depth == "rootzone" else "Superficial (0-5cm)"
                return {
                    "status": "success",
                    "depth": depth,
                    "depthLabel": depth_label,
                    "meanSoilMoisture": summary_val,
                    "tileUrl": result.get("tileUrl"),
                    "warning": "Humidade volumétrica modelada; a classificação de seca exige referência climatológica e validação local.",
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": f"agent_smap_{depth}",
                        "name": f"Humidade do Solo NASA SMAP — {depth_label}",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.8
                    }
                }

            elif tool_name == "get_water_erosion_rusle":
                import gee_module
                import api
                _ensure_gee()
                year = int(args.get("year", 2023))
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                result = gee_module.compute_erosion_rusle(region_geojson=region, year=year)
                stats = result.get("stats", {})
                mean_loss = stats.get("meanSoilLossTha", stats.get("mean"))
                summary_val = f"{float(mean_loss):.1f} t/ha/ano" if mean_loss is not None else "N/D"
                return {
                    "status": "success",
                    "year": year,
                    "meanSoilLoss": summary_val,
                    "tileUrl": result.get("tileUrl"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": f"agent_erosion_rusle_{year}",
                        "name": f"Perda de Solo RUSLE ({year})",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.85
                    }
                }

            elif tool_name == "get_wildfire_activity":
                import gee_module
                import api
                _ensure_gee()
                region = api._region_geojson(province=province, district=district, geometry=region_geom)
                min_conf = int(args.get("min_confidence", 50))
                result = gee_module.compute_wildfire(
                    region_geojson=region,
                    start_date=start_date,
                    end_date=end_date,
                    min_confidence=min_conf
                )
                stats = result.get("stats", {})
                fire_count = stats.get("firePixels", stats.get("count", 0))
                return {
                    "status": "success",
                    "firePixelsCount": fire_count,
                    "tileUrl": result.get("tileUrl"),
                    "burnedTileUrl": result.get("burnedTileUrl"),
                    "map_action": {
                        "type": "ADD_LAYER",
                        "id": "agent_wildfire",
                        "name": f"Focos de Incêndio VIIRS ({fire_count} focos)",
                        "tileUrl": result.get("tileUrl"),
                        "opacity": 0.9
                    }
                }

            else:
                return {"status": "error", "message": f"Ferramenta desconhecida: {tool_name}"}

        except Exception as exc:
            err_str = str(exc)
            if "Earth Engine client library not initialized" in err_str or "Não foi possível inicializar o Earth Engine" in err_str:
                logger.warning("GEE not initialized during tool '%s': %s", tool_name, exc)
                return {
                    "status": "warning",
                    "message": "Requer autenticação do Google Earth Engine (conecte a sua conta nas Definições ou no topo).",
                    "mean": "Requer GEE Ativo",
                    "error": err_str
                }
            logger.exception("Error executing tool '%s': %s", tool_name, exc)
            return {"status": "error", "message": err_str}


