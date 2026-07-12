"""
GeoMoz GEE Presets — spectral index definitions, mineral targeting presets,
and shared constants separated from the GEE runtime module.

This module has zero external dependencies and can be imported safely in tests.
"""

from __future__ import annotations

from typing import Any, Optional


# ── Index registry ─────────────────────────────────────────────────────────────
#
# Each entry has:
#   group   : "spectral" (Sentinel-2), "landsat" (L8), "terrain" (DEM-derived)
#   needs   : list of inputs ("s2","l8","dem","rivers")
#   vis     : leaflet visualization params (min/max/palette)
#   norm    : (min, max) used to normalize index to [0,1] for composite mode

INDEX_REGISTRY: dict[str, dict[str, Any]] = {
    "ndvi": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "NDVI — Vegetation (Sentinel-2)",
        "formula": "NDVI = (B8 − B4) / (B8 + B4)",
        "bands": "NIR (B8) e Vermelho (B4)",
        "vis": {"min": -0.15, "max": 0.85,
                "palette": ["8B4513","D2B48C","FFFACD","ADFF2F","32CD32","006400"]},
        "norm": (-0.2, 0.9),
    },
    "fe_oxide": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Óxidos de Ferro (B4/B2)",
        "formula": "Fe-Oxide = B4 / B2",
        "bands": "Vermelho (B4) e Azul (B2)",
        "vis": {"min": 0.8, "max": 2.6,
                "palette": ["FFFFFF","FFF7BC","FEC44F","FE9929","EC7014","CC4C02","7F2704"]},
        "norm": (0.8, 2.6),
    },
    "clay": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Argilas / SWIR (B11/B8A)",
        "formula": "Clay = B11 / B8A",
        "bands": "SWIR1 (B11) e Red-Edge3 (B8A)",
        "vis": {"min": 0.5, "max": 1.6,
                "palette": ["F7FBFF","DEEBF7","9ECAE1","4292C6","2171B5","08519C","08306B"]},
        "norm": (0.5, 1.6),
    },
    "hydrothermal": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Alteração Hidrotermal — (B11+B4)/(B8A+B3)",
        "formula": "(B11 + B4) / (B8A + B3)  [Crosta et al.]",
        "bands": "SWIR1, Vermelho, Red-Edge3, Verde",
        "vis": {"min": 0.7, "max": 2.2,
                "palette": ["FFFFCC","FFEDA0","FED976","FEB24C","FD8D3C","FC4E2A","E31A1C","BD0026","800026"]},
        "norm": (0.7, 2.2),
    },
    "bare_soil": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Índice de Solo Exposto (BSI)",
        "formula": "(B11+B4 − B8−B2) / (B11+B4 + B8+B2)",
        "bands": "SWIR1, Vermelho, NIR, Azul",
        "vis": {"min": -0.4, "max": 0.6,
                "palette": ["006400","7CFC00","FFFF00","FFA500","FF4500","8B0000"]},
        "norm": (-0.4, 0.6),
    },
    "al_oh": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Alteração Argílica/Fílica — Al-OH (B11/B12)",
        "formula": "Al-OH = B11 / B12",
        "bands": "SWIR1 (B11 ~1610 nm) e SWIR2 (B12 ~2190 nm)",
        "vis": {"min": 0.95, "max": 1.6,
                "palette": ["2b083f","5b1a78","8e2faf","c44ec0","f06ba8","ffb27f","ffe39e"]},
        "norm": (0.95, 1.6),
    },
    "ferrous": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Ferro Ferroso (Fe²⁺) — B12/B8A",
        "formula": "Ferrous = B12 / B8A",
        "bands": "SWIR2 (B12) e Red-Edge3 (B8A)",
        "vis": {"min": 0.4, "max": 1.15,
                "palette": ["052f1a","0a6b3a","3aa856","8fd17a","d7f0b0","ffffe0"]},
        "norm": (0.4, 1.15),
    },
    "gossan": {
        "group": "spectral",
        "needs": ["s2"],
        "name": "Gossan / Capa de Ferro — (B4/B2)·(B11/B12)",
        "formula": "Gossan = (B4 / B2) × (B11 / B12)",
        "bands": "Vermelho (B4), Azul (B2), SWIR1 (B11), SWIR2 (B12)",
        "vis": {"min": 1.0, "max": 3.2,
                "palette": ["ffffff","ffe9b0","ffc04d","ff8a1f","e8520f","a81a06","5c0000"]},
        "norm": (1.0, 3.2),
    },
    "ndvi_l8": {
        "group": "landsat",
        "needs": ["l8"],
        "name": "NDVI — Vegetação (Landsat 8)",
        "formula": "NDVI = (SR_B5 − SR_B4) / (SR_B5 + SR_B4)",
        "bands": "NIR (SR_B5) e Vermelho (SR_B4)",
        "vis": {"min": 0.0, "max": 0.8,
                "palette": ["ffffff","ce7e45","df923d","f1b555","fcd163","99b718","74a901",
                            "669100","528d01","3e8200","207401","056201","004c00","023b01",
                            "012e01","011d01","011301"]},
        "norm": (0.0, 0.8),
    },
    "elevation": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Elevação — DEM Copernicus GLO-30",
        "formula": "DEM smoothed (focal_mean 3m)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 2000,
                "palette": ["0a4f0a","f7f7c8","d4b06b","8d5524","ffffff"]},
        "norm": (0, 2500),
    },
    "hipsometry": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Hipsometria — Elevação Normalizada",
        "formula": "(DEM − min) / (max − min)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 1,
                "palette": ["003f5c","2f4b7c","465881","5a6a86","6f7b92",
                            "8c9aa6","b5c0c8","f7b267","f08a5d","e4572e","b71c1c"]},
        "norm": (0, 1),
    },
    "slope": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Declive (Slope) — graus",
        "formula": "ee.Terrain.slope(DEM)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 35,
                "palette": ["1a9850","91cf60","d9ef8b","fee08b","fc8d59","d73027"]},
        "norm": (0, 45),
    },
    "hillshade": {
        "group": "terrain",
        "needs": ["dem"],
        "name": "Hillshade (Sombreado de Relevo)",
        "formula": "ee.Terrain.hillshade(DEM, azimuth=315, elevation=45)",
        "bands": "Copernicus GLO-30 DEM",
        "vis": {"min": 0, "max": 255,
                "palette": ["000000","ffffff"]},
        "norm": (0, 255),
    },
    "topo_class": {
        "group": "terrain",
        "needs": ["dem", "rivers"],
        "name": "Classificação Topográfica (5 classes + água)",
        "formula": "DEM em [<5, 5–10, 10–30, 30–60, >60] m + água (HydroSHEDS)",
        "bands": "DEM + HydroSHEDS FreeFlowingRivers",
        "vis": {"min": 1, "max": 6,
                "palette": ["d0f0ff","a0e060","ffff66","ffb366","ff6666","3366ff"]},
        "norm": (1, 6),
        "class_names": [
            "Planície / < 5 m",
            "Planície Baixa / 5–10 m",
            "Planície Média / 10–30 m",
            "Colinas Baixas / 30–60 m",
            "Colinas Altas / > 60 m",
            "Água & Rios",
        ],
    },

    # ── Agriculture & Crop Health indices ──────────────────────────────────

    "evi": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "EVI — Enhanced Vegetation Index",
        "formula": "EVI = 2.5 × (B8 − B4) / (B8 + 6×B4 − 7.5×B2 + 1)",
        "bands": "NIR (B8), Vermelho (B4), Azul (B2)",
        "vis": {"min": -0.15, "max": 0.85,
                "palette": ["8B4513","D2B48C","FFFACD","ADFF2F","32CD32","006400"]},
        "norm": (-0.2, 1.0),
    },
    "ndmi": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "NDMI — Normalized Difference Moisture Index",
        "formula": "NDMI = (B8 − B11) / (B8 + B11)",
        "bands": "NIR (B8) e SWIR1 (B11)",
        "vis": {"min": -0.5, "max": 0.6,
                "palette": ["8B4513","D2B48C","FFFFCC","99CC66","339933","006600"]},
        "norm": (-0.5, 0.7),
    },
    "savi": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "SAVI — Soil Adjusted Vegetation Index",
        "formula": "SAVI = ((B8 − B4) / (B8 + B4 + 0.5)) × 1.5",
        "bands": "NIR (B8) e Vermelho (B4)",
        "vis": {"min": -0.15, "max": 0.85,
                "palette": ["8B4513","D2B48C","FFFACD","ADFF2F","32CD32","006400"]},
        "norm": (-0.2, 1.0),
    },
    "gci": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "GCI — Green Chlorophyll Index",
        "formula": "GCI = (B8 / B3) − 1",
        "bands": "NIR (B8) e Verde (B3)",
        "vis": {"min": 0.0, "max": 8.0,
                "palette": ["FFFFCC","C7E9B4","7FCDBB","41B6C4","1D91C0","225EA8","0C2C84"]},
        "norm": (0.0, 8.0),
    },

    # ── Drought indices ────────────────────────────────────────────────────

    "nddi": {
        "group": "drought",
        "needs": ["s2"],
        "name": "NDDI — Normalized Difference Drought Index",
        "formula": "NDDI = (NDVI − NDMI) / (NDVI + NDMI + 0.01)",
        "bands": "NIR (B8), Vermelho (B4), SWIR1 (B11) — derivado NDVI + NDMI",
        "vis": {"min": -0.05, "max": 0.15,
                "palette": ["006400","32CD32","FFFF00","FFA500","FF4500","8B0000"]},
        "norm": (-0.1, 0.3),
    },
    "msavi": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "MSAVI2 — Modified Soil Adjusted Vegetation Index 2",
        "formula": "MSAVI2 = (2×B8 + 1 − sqrt((2×B8 + 1)² − 8×(B8 − B4))) / 2",
        "bands": "NIR (B8) e Vermelho (B4)",
        "vis": {"min": -0.15, "max": 0.85,
                "palette": ["8B4513","D2B48C","FFFACD","ADFF2F","32CD32","006400"]},
        "norm": (-0.2, 1.0),
    },
    # ── Agriculture composites ─────────────────────────────────────────────
    # These are pseudo-indices computed as weighted composites.
    "crop_health": {
        "group": "agriculture",
        "needs": ["s2"],
        "name": "Saúde das Culturas (EVI+NDMI+NDVI)",
        "formula": "0.40×EVI + 0.35×NDMI + 0.25×NDVI",
        "bands": "EVI, NDMI, NDVI — todos normalizados para [0,1]",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["d73027","fc8d59","fee08b","d9ef8b","91cf60","1a9850","006837"]},
        "norm": (0.0, 1.0),
    },
    "drought_severity": {
        "group": "drought",
        "needs": ["s2"],
        "name": "Severidade de Seca (NDDI+NDMI inverso)",
        "formula": "0.60×NDDI + 0.40×(1 − NDMI_norm)",
        "bands": "NDDI e NDMI inverso — ambos normalizados",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["006837","1a9850","d9ef8b","fee08b","fc8d59","d73027","7f0000"]},
        "norm": (0.0, 1.0),
    },

    # ── Fire & Burn indices ──────────────────────────────────────────────────

    "nbr": {
        "group": "fire",
        "needs": ["s2"],
        "name": "NBR — Normalized Burn Ratio",
        "formula": "NBR = (B8 − B12) / (B8 + B12)",
        "bands": "NIR (B8) e SWIR2 (B12)",
        "vis": {"min": -0.3, "max": 0.8,
                "palette": ["006400","32CD32","FFFF00","FFA500","FF4500","8B0000","000000"]},
        "norm": (-0.3, 0.8),
    },
    "dnbr": {
        "group": "fire",
        "needs": ["s2"],
        "name": "dNBR — Burn Severity (pré-pós fogo)",
        "formula": "dNBR = NBR_pré − NBR_pós",
        "bands": "Duas composições NBR: pré-fogo e pós-fogo",
        "vis": {"min": -0.3, "max": 1.0,
                "palette": ["1a9850","66bd63","fee08b","fc8d59","d73027","7f0000"]},
        "norm": (-0.3, 1.0),
    },
    "burn_severity": {
        "group": "fire",
        "needs": ["s2"],
        "name": "Classificação de Severidade (dNBR)",
        "formula": "dNBR reclassificado → 5 classes USGS",
        "bands": "dNBR thresholded",
        "vis": {"min": 1, "max": 5,
                "palette": ["1a9850","91cf60","fee08b","fc8d59","d73027"]},
        "norm": (1, 5),
        "class_names": [
            "Não queimado / regrowth",
            "Severidade baixa",
            "Severidade moderada-baixa",
            "Severidade moderada-alta",
            "Severidade alta",
        ],
    },
    "forest_loss": {
        "group": "fire",
        "needs": [],
        "name": "Perda de Cobertura Florestal (Hansen)",
        "formula": "Hansen Global Forest Change v1.11 (2000–2023)",
        "bands": "Global Forest Change — bandas: treecover2000, loss, lossyear",
        "vis": {"min": 0, "max": 23,
                "palette": ["ffffff","fee5d9","fcae91","fb6a4a","de2d26","a50f15"]},
        "norm": (0, 23),
    },
    "burned_area": {
        "group": "fire",
        "needs": [],
        "name": "Área Queimada (MODIS MCD64A1)",
        "formula": "MODIS MCD64A1 — BurnDate por mês/ano",
        "bands": "MODIS Burned Area — BurnDate (dia juliano)",
        "vis": {"min": 1, "max": 366,
                "palette": ["ffffcc","ffeda0","fed976","feb24c","fd8d3c","fc4e2a","e31a1c","b10026"]},
        "norm": (1, 366),
    },
    "fire_risk": {
        "group": "fire",
        "needs": ["s2"],
        "name": "Risco de Incêndio (NDVI+NDMI+NDDI inverso)",
        "formula": "0.40×(1−NDVI_norm) + 0.35×(1−NDMI_norm) + 0.25×NDDI_norm",
        "bands": "NDVI, NDMI, NDDI — composto de risco",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["006837","1a9850","d9ef8b","fee08b","fc8d59","d73027","7f0000"]},
        "norm": (0.0, 1.0),
    },

    # ── Coastal & Marine indices ────────────────────────────────────────────

    "mangrove_health": {
        "group": "coastal",
        "needs": ["s2"],
        "name": "Saúde dos Mangais (NDVI+NDWI)",
        "formula": "0.50×NDVI_norm + 0.50×NDWI_norm — composto Sentinel-2",
        "bands": "Sentinel-2 NIR (B8), Vermelho (B4), Verde (B3)",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["d73027","fc8d59","fee08b","d9ef8b","91cf60","1a9850","006837"]},
        "norm": (0.0, 1.0),
    },
    "coastal_index": {
        "group": "coastal",
        "needs": ["dem"],
        "name": "Índice Costeiro — Exposição",
        "formula": "CVI: 0.35×costa_prox + 0.25×(1−elev_norm) + 0.25×(1−declive_norm) + 0.15×(1−NDVI_proxy_DEM)",
        "bands": "DEM Copernicus + Sentinel-2 NDVI",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["006837","91cf60","fee08b","fc8d59","d73027","7f0000"]},
        "norm": (0.0, 1.0),
    },
    "coastal_erosion": {
        "group": "coastal",
        "needs": [],
        "name": "Erosão Costeira (JRC Yearly Water)",
        "formula": "JRC GSW v1.4 — transição água/terra 1984–2021",
        "bands": "JRC Global Surface Water — transition band",
        "vis": {"min": 0, "max": 3,
                "palette": ["006400","0064c8","d73027","ffd700"]},
        "norm": (0, 3),
        "class_names": [
            "Terra estável",
            "Água permanente",
            "Erosão / perda de terra",
            "Progradação / ganho de terra",
        ],
    },
    "tsunami_risk": {
        "group": "coastal",
        "needs": ["s2", "dem"],
        "name": "Risco de Inundação Costeira (Tsunami)",
        "formula": "CVI: 0.35×(1−elev_norm) + 0.30×costa_prox + 0.20×(1−declive_norm) + 0.15×(1−NDVI_norm)",
        "bands": "DEM Copernicus + distância à costa + declive + cobertura",
        "vis": {"min": 0.0, "max": 1.0,
                "palette": ["006837","1a9850","d9ef8b","fee08b","fc8d59","d73027","7f0000"]},
        "norm": (0.0, 1.0),
    },

}


# ── Mineral targeting (presets over weighted composite + lineaments) ──────────
#
# Each preset declares which indices to combine (positive weights) and which
# to invert (1 - x) before summing. "lineaments" is a pseudo-index computed
# from the DEM on the fly. Weights are renormalized to sum to 1.

MINERAL_PRESETS: dict[str, dict[str, Any]] = {
    "gold": {
        "name": "Ouro (hidrotermal)",
        "description": (
            "Targeting clássico de ouro orogénico/epitermal: alteração "
            "hidrotermal, capeamento de Fe-óxidos e densidade estrutural."
        ),
        "weights": {
            "hydrothermal": 0.35,
            "fe_oxide":     0.20,
            "lineaments":   0.25,
            "clay":         0.10,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "fe_oxide": {
        "name": "Ferro / Fe-óxidos",
        "description": "BIFs e capeamentos lateríticos ricos em hematita/goethita.",
        "weights": {
            "fe_oxide":   0.50,
            "bare_soil":  0.20,
            "hydrothermal": 0.15,
            "lineaments": 0.15,
        },
        "invert": [],
    },
    "copper": {
        "name": "Cobre (pórfiro / IOCG)",
        "description": "Sistemas porfiríticos / IOCG — argilas, Fe-óxidos e estruturas.",
        "weights": {
            "hydrothermal": 0.30,
            "fe_oxide":     0.25,
            "clay":         0.15,
            "lineaments":   0.20,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "pegmatite": {
        "name": "Pegmatitos (Li, Ta, gemas)",
        "description": (
            "Pegmatitos LCT — controlo estrutural forte (zonas de cisalhamento), "
            "associados a granitos com solo exposto."
        ),
        "weights": {
            "lineaments": 0.35,
            "clay":       0.20,
            "fe_oxide":   0.15,
            "bare_soil":  0.15,
            "slope":      0.15,
        },
        "invert": ["slope"],
    },
    "bauxite": {
        "name": "Bauxite",
        "description": "Lateritas em superfícies planas elevadas, ricas em argila.",
        "weights": {
            "clay":       0.35,
            "bare_soil":  0.20,
            "hipsometry": 0.20,
            "ndvi":       0.15,
            "slope":      0.10,
        },
        "invert": ["ndvi", "slope"],
    },
    "graphite": {
        "name": "Grafite",
        "description": "Xistos grafitosos — controlo estrutural + assinatura clay/hydrothermal.",
        "weights": {
            "clay":         0.25,
            "hydrothermal": 0.20,
            "lineaments":   0.30,
            "bare_soil":    0.15,
            "slope":        0.10,
        },
        "invert": ["slope"],
    },
    "coal": {
        "name": "Carvão (proxy)",
        "description": (
            "Apenas indicativo: bacias sedimentares planas, baixa elevação, "
            "solo exposto. Confirmação requer mapeamento estratigráfico."
        ),
        "weights": {
            "bare_soil":  0.30,
            "hipsometry": 0.25,
            "hydrothermal": 0.15,
            "lineaments": 0.10,
            "ndvi":       0.10,
            "slope":      0.10,
        },
        "invert": ["hipsometry", "ndvi", "slope"],
    },
    "heavy_sands": {
        "name": "Areias Pesadas (Ti, Zr)",
        "description": "Depósitos costeiros — solo exposto, baixa elevação, Fe-óxidos.",
        "weights": {
            "bare_soil":  0.35,
            "ndvi":       0.20,
            "hipsometry": 0.20,
            "fe_oxide":   0.15,
            "slope":      0.10,
        },
        "invert": ["ndvi", "hipsometry", "slope"],
    },
}


# ── RUSLE erosion-risk classes ────────────────────────────────────────────────

RUSLE_CLASSES: list[tuple[int, str, str, float, float]] = [
    (1, "Muito baixo", "1a9850", 0,   5),
    (2, "Baixo",       "91cf60", 5,   10),
    (3, "Moderado",    "fee08b", 10,  20),
    (4, "Alto",        "fc8d59", 20,  40),
    (5, "Muito alto",  "d73027", 40,  1e9),
]


# ── AHP groundwater potential factors ─────────────────────────────────────────

GWP_FACTORS: list[tuple[str, str, int, float]] = [
    ("lineament", "Densidade de lineamentos", +1, 0.25),
    ("rainfall",  "Precipitação (CHIRPS)",    +1, 0.22),
    ("slope",     "Declive",                  -1, 0.18),
    ("drainage",  "Densidade de drenagem",    -1, 0.13),
    ("twi",       "Índice de humidade (TWI)", +1, 0.12),
    ("landcover", "Uso/cobertura do solo",    +1, 0.10),
]

GWP_CLASSES: list[tuple[int, str, str]] = [
    (1, "Muito baixo", "d73027"),
    (2, "Baixo",       "fc8d59"),
    (3, "Moderado",    "fee08b"),
    (4, "Alto",        "91cf60"),
    (5, "Muito alto",  "1a9850"),
]

# Capacidade de infiltração por classe ESA WorldCover (0–1).
ESA_INFILTRATION: dict[int, float] = {
    10: 0.75, 20: 0.65, 30: 0.60, 40: 0.55, 50: 0.10,
    60: 0.35, 70: 0.0, 80: 0.50, 90: 0.90, 95: 0.80, 100: 0.45,
}


# ── ESA WorldCover classes ────────────────────────────────────────────────────

ESA_WORLDCOVER: list[tuple[int, str, str]] = [
    (10,  "Floresta / Árvores",          "006400"),
    (20,  "Arbustos",                    "ffbb22"),
    (30,  "Pradaria / Herbáceo",         "ffff4c"),
    (40,  "Agricultura",                 "f096ff"),
    (50,  "Áreas construídas",           "fa0000"),
    (60,  "Solo nu / veg. esparsa",      "b4b4b4"),
    (70,  "Neve e gelo",                 "f0f0f0"),
    (80,  "Água permanente",             "0064c8"),
    (90,  "Zonas húmidas herbáceas",     "0096a0"),
    (95,  "Mangais",                     "00cf75"),
    (100, "Musgos e líquenes",           "fae6a0"),
]

# SCS Curve Number por classe ESA WorldCover (condição média de humidade, AMC II).
ESA_CN: dict[int, int] = {
    10: 55, 20: 60, 30: 68, 40: 78, 50: 90, 60: 82,
    70: 90, 80: 100, 90: 88, 95: 80, 100: 70,
}


# ── Mozambique bounding box ───────────────────────────────────────────────────

MZ_BBOX: tuple[float, float, float, float] = (30.2, -26.9, 40.8, -10.4)
