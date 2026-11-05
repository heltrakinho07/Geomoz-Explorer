/** Reviewed scientist-facing copy for the GeoAnálises category catalogue.
 * Keys are stable category IDs. Never translate sensor identifiers, GEE index
 * codes or persisted analysis IDs. Missing locale → English, PT → source copy.
 */
import { resolvedPortalLocale } from "./portal";
export type AnalysisCategory = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  highlights: string[];
};
export const ANALYSIS_CATEGORY_TRANSLATIONS = {
  "en": {
    "terrain": {
      "title": "Relief, Topography & Morphology",
      "subtitle": "Copernicus GLO-30 DEM · 30 m",
      "badge": "Copernicus 30 m DEM",
      "description": "High-resolution elevation, A→B topographic profiles, automatic contour lines and terrain classification.",
      "highlights": [
        "Topographic profile (A→B)",
        "GEE contour lines",
        "Terrain classes",
        "Relative hypsometry"
      ]
    },
    "geology": {
      "title": "Economic Geology & Mineral Signatures",
      "subtitle": "Landsat-8 SWIR, ASTER & Sentinel-2",
      "badge": "Mineral exploration",
      "description": "Spectral mapping of hydrothermal alteration (Sabins & Crosta), iron oxides and hydroxides, clay minerals, shear zones and mineral prospectivity.",
      "highlights": [
        "Hydrothermal alteration (Sabins)",
        "Iron oxides (B4/B2)",
        "Clays & hydroxyls (B6/B7)",
        "Ferrous minerals",
        "Structural lineaments",
        "AI mineral targeting"
      ]
    },
    "vegetation": {
      "title": "Vegetation, Biomass & Agriculture",
      "subtitle": "Sentinel-2 & Landsat 8 · 10–20 m",
      "badge": "Sentinel-2 · 10 m",
      "description": "Monitor vegetation vigour, leaf density, biomass and chlorophyll using calibrated multispectral indices.",
      "highlights": [
        "NDVI (vegetation vigour)",
        "EVI (high biomass)",
        "SAVI (soil-adjusted)",
        "GCI (chlorophyll)",
        "Crop health"
      ]
    },
    "water": {
      "title": "Water Resources & Water Indices",
      "subtitle": "SWIR / NIR · Spectral detection and shadow suppression",
      "badge": "SWIR · Water & moisture",
      "description": "Map surface water with AWEI shadow suppression, NDWI/MNDWI indices, WRI ratio, WI2015 and leaf moisture (NDMI).",
      "highlights": [
        "NDWI (McFeeters)",
        "MNDWI (Xu)",
        "AWEI (shadow removal)",
        "WRI (water ratio)",
        "WI2015 (Fisher)",
        "NDMI (moisture)"
      ]
    },
    "fire": {
      "title": "Wildfires, Burned Areas & Land Cover",
      "subtitle": "Sentinel-2, MODIS & ESA WorldCover",
      "badge": "Observed indices & products",
      "description": "NBR, pre/post-fire dNBR, MODIS burned areas, Hansen forest loss and ESA land cover, with explicit source limitations.",
      "highlights": [
        "dNBR fire severity",
        "NBR burn scars",
        "MODIS burned areas",
        "Hansen forest loss",
        "ESA 10 m land cover"
      ]
    },
    "climate": {
      "title": "Climate, Drought & Time Series",
      "subtitle": "CHIRPS (~5 km) · MODIS LST · Historical series",
      "badge": "Climatology & risk",
      "description": "Quantify meteorological and agricultural drought using SPI × NDVI correlations, CHIRPS rainfall, LST and cyclone tracks.",
      "highlights": [
        "SPI × NDVI scatterplot",
        "Annual CHIRPS rainfall",
        "LST land temperature",
        "Cyclone tracks",
        "VHI vegetation health"
      ]
    },
    "satellite": {
      "title": "Optical Satellite & Multi-Year Mosaics",
      "subtitle": "Sentinel-2 Cloudless EOX · 2016–2024 (10 m)",
      "badge": "Sentinel-2 10 m mosaics",
      "description": "Annual cloud-free Sentinel-2 mosaics at 10 m resolution for environmental and infrastructure change analysis from 2016 to 2024.",
      "highlights": [
        "Sentinel-2 mosaics (2016–2024)",
        "10 m historical series",
        "Cyclones Idai & Freddy",
        "10 m true-colour RGB"
      ]
    },
    "urban": {
      "title": "Urban Areas, Infrastructure & Heat Islands",
      "subtitle": "SWIR, NDBI & MODIS LST",
      "badge": "Urban planning",
      "description": "Map urban expansion, impervious surfaces, building pressure and urban heat islands using surface temperature and vegetation cover.",
      "highlights": [
        "NDBI imperviousness",
        "NBI urban expansion",
        "Urban heat island (UHI)"
      ]
    }
  },
  "es": {
    "terrain": {
      "title": "Relieve, Topografía y Morfología",
      "subtitle": "MDE Copernicus GLO-30 · 30 m",
      "badge": "MDE Copernicus de 30 m",
      "description": "Altimetría de alta resolución, perfiles topográficos A→B, curvas de nivel automáticas y clasificación morfológica.",
      "highlights": [
        "Perfil topográfico (A→B)",
        "Curvas de nivel GEE",
        "Clases del relieve",
        "Hipsometría relativa"
      ]
    },
    "geology": {
      "title": "Geología Económica y Firmas Minerales",
      "subtitle": "Landsat-8 SWIR, ASTER y Sentinel-2",
      "badge": "Exploración mineral",
      "description": "Cartografía espectral de alteración hidrotermal (Sabins y Crosta), óxidos e hidróxidos de hierro, arcillas, zonas de cizalla y potencial mineral.",
      "highlights": [
        "Alteración hidrotermal (Sabins)",
        "Óxidos de hierro (B4/B2)",
        "Arcillas e hidroxilos (B6/B7)",
        "Minerales ferrosos",
        "Lineamientos estructurales",
        "Prospección mineral con IA"
      ]
    },
    "vegetation": {
      "title": "Vegetación, Biomasa y Agricultura",
      "subtitle": "Sentinel-2 y Landsat 8 · 10–20 m",
      "badge": "Sentinel-2 · 10 m",
      "description": "Monitorización del vigor vegetal, densidad foliar, biomasa y clorofila mediante índices multiespectrales calibrados.",
      "highlights": [
        "NDVI (vigor vegetal)",
        "EVI (biomasa alta)",
        "SAVI (ajuste del suelo)",
        "GCI (clorofila)",
        "Salud de cultivos"
      ]
    },
    "water": {
      "title": "Recursos Hídricos e Índices de Agua",
      "subtitle": "SWIR / NIR · Detección espectral y supresión de sombras",
      "badge": "SWIR · Agua y humedad",
      "description": "Cartografía de agua superficial con AWEI, índices NDWI/MNDWI, razón WRI, WI2015 y humedad de la vegetación (NDMI).",
      "highlights": [
        "NDWI (McFeeters)",
        "MNDWI (Xu)",
        "AWEI (sin sombras)",
        "WRI (razón de agua)",
        "WI2015 (Fisher)",
        "NDMI (humedad)"
      ]
    },
    "fire": {
      "title": "Incendios, Áreas Quemadas y Cobertura del Suelo",
      "subtitle": "Sentinel-2, MODIS y ESA WorldCover",
      "badge": "Índices y productos observados",
      "description": "NBR, dNBR pre/postincendio, áreas quemadas MODIS, pérdida forestal Hansen y cobertura ESA, con limitaciones explícitas.",
      "highlights": [
        "Severidad dNBR",
        "Cicatrices NBR",
        "Áreas quemadas MODIS",
        "Pérdida forestal Hansen",
        "Cobertura ESA 10 m"
      ]
    },
    "climate": {
      "title": "Clima, Sequías y Series Temporales",
      "subtitle": "CHIRPS (~5 km) · MODIS LST · Series históricas",
      "badge": "Climatología y riesgos",
      "description": "Análisis de sequía meteorológica y agronómica mediante SPI × NDVI, precipitación CHIRPS, temperatura LST y trayectorias de ciclones.",
      "highlights": [
        "Dispersión SPI × NDVI",
        "Precipitación CHIRPS anual",
        "Temperatura LST",
        "Trayectorias de ciclones",
        "VHI salud vegetal"
      ]
    },
    "satellite": {
      "title": "Satélite Óptico y Mosaicos Multitemporales",
      "subtitle": "Sentinel-2 Cloudless EOX · 2016–2024 (10 m)",
      "badge": "Mosaicos Sentinel-2 de 10 m",
      "description": "Mosaicos anuales Sentinel-2 sin nubes a 10 m para analizar cambios ambientales y de infraestructuras entre 2016 y 2024.",
      "highlights": [
        "Mosaicos Sentinel-2 (2016–2024)",
        "Serie histórica de 10 m",
        "Ciclones Idai y Freddy",
        "RGB de color real a 10 m"
      ]
    },
    "urban": {
      "title": "Áreas Urbanas, Infraestructuras e Islas de Calor",
      "subtitle": "SWIR, NDBI y MODIS LST",
      "badge": "Planificación urbana",
      "description": "Cartografía de expansión urbana, superficies impermeables, presión constructiva e islas de calor con temperatura superficial y cobertura verde.",
      "highlights": [
        "NDBI impermeabilidad",
        "NBI expansión urbana",
        "Isla de calor urbana (UHI)"
      ]
    }
  },
  "fr": {
    "terrain": {
      "title": "Relief, Topographie et Morphologie",
      "subtitle": "MNT Copernicus GLO-30 · 30 m",
      "badge": "MNT Copernicus 30 m",
      "description": "Altimétrie haute résolution, profils topographiques A→B, courbes de niveau automatiques et classes morphologiques.",
      "highlights": [
        "Profil topographique (A→B)",
        "Courbes de niveau GEE",
        "Classes morphologiques",
        "Hypsométrie relative"
      ]
    },
    "geology": {
      "title": "Géologie Économique et Signatures Minérales",
      "subtitle": "Landsat-8 SWIR, ASTER et Sentinel-2",
      "badge": "Exploration minérale",
      "description": "Cartographie spectrale de l'altération hydrothermale (Sabins et Crosta), des oxydes et hydroxydes de fer, des argiles et des zones de cisaillement.",
      "highlights": [
        "Altération hydrothermale (Sabins)",
        "Oxydes de fer (B4/B2)",
        "Argiles et hydroxyles (B6/B7)",
        "Minéraux ferreux",
        "Linéaments structuraux",
        "Prospection minérale par IA"
      ]
    },
    "vegetation": {
      "title": "Végétation, Biomasse et Agriculture",
      "subtitle": "Sentinel-2 et Landsat 8 · 10–20 m",
      "badge": "Sentinel-2 · 10 m",
      "description": "Suivi de la vigueur végétale, densité foliaire, biomasse et chlorophylle à l'aide d'indices multispectraux calibrés.",
      "highlights": [
        "NDVI (vigueur végétale)",
        "EVI (forte biomasse)",
        "SAVI (ajusté au sol)",
        "GCI (chlorophylle)",
        "Santé des cultures"
      ]
    },
    "water": {
      "title": "Ressources en Eau et Indices Hydriques",
      "subtitle": "SWIR / NIR · Détection spectrale et suppression des ombres",
      "badge": "SWIR · Eau et humidité",
      "description": "Cartographie des eaux de surface avec AWEI, indices NDWI/MNDWI, rapport WRI, WI2015 et humidité foliaire (NDMI).",
      "highlights": [
        "NDWI (McFeeters)",
        "MNDWI (Xu)",
        "AWEI (suppression des ombres)",
        "WRI (rapport hydrique)",
        "WI2015 (Fisher)",
        "NDMI (humidité)"
      ]
    },
    "fire": {
      "title": "Incendies, Surfaces Brûlées et Couverture du Sol",
      "subtitle": "Sentinel-2, MODIS et ESA WorldCover",
      "badge": "Indices et produits observés",
      "description": "NBR, dNBR pré/post-incendie, surfaces brûlées MODIS, perte forestière Hansen et couverture ESA, avec limites explicites.",
      "highlights": [
        "Sévérité dNBR",
        "Cicatrices NBR",
        "Surfaces brûlées MODIS",
        "Perte forestière Hansen",
        "Occupation du sol ESA 10 m"
      ]
    },
    "climate": {
      "title": "Climat, Sécheresse et Séries Temporelles",
      "subtitle": "CHIRPS (~5 km) · MODIS LST · Séries historiques",
      "badge": "Climatologie et risques",
      "description": "Analyse des sécheresses météorologiques et agricoles par corrélation SPI × NDVI, précipitations CHIRPS, température LST et trajectoires cycloniques.",
      "highlights": [
        "Nuage de points SPI × NDVI",
        "Précipitations CHIRPS annuelles",
        "Température de surface LST",
        "Trajectoires cycloniques",
        "VHI santé végétale"
      ]
    },
    "satellite": {
      "title": "Satellite Optique et Mosaïques Multitemporelles",
      "subtitle": "Sentinel-2 Cloudless EOX · 2016–2024 (10 m)",
      "badge": "Mosaïques Sentinel-2 10 m",
      "description": "Mosaïques annuelles Sentinel-2 sans nuages à 10 m pour analyser les changements environnementaux et les infrastructures de 2016 à 2024.",
      "highlights": [
        "Mosaïques Sentinel-2 (2016–2024)",
        "Séries historiques à 10 m",
        "Cyclones Idai et Freddy",
        "RVB couleurs naturelles 10 m"
      ]
    },
    "urban": {
      "title": "Zones Urbaines, Infrastructures et Îlots de Chaleur",
      "subtitle": "SWIR, NDBI et MODIS LST",
      "badge": "Aménagement urbain",
      "description": "Cartographie de l'expansion urbaine, des surfaces imperméables et des îlots de chaleur par température de surface et végétation.",
      "highlights": [
        "NDBI imperméabilisation",
        "NBI expansion urbaine",
        "Îlot de chaleur urbain (ICU)"
      ]
    }
  }
} as const;
export function localizeAnalysisCategories<T extends AnalysisCategory>(
  language: string, categories: readonly T[],
): T[] {
  const locale = resolvedPortalLocale(language);
  if(locale === "pt") return [...categories];
  const dictionary: Record<string, {title:string;subtitle:string;badge:string;description:string;highlights:readonly string[]}> =
    ANALYSIS_CATEGORY_TRANSLATIONS[locale];
  return categories.map(category => {
    const copy = dictionary[category.id];
    return copy ? { ...category, ...copy, highlights: [...copy.highlights] } : { ...category };
  });
}
