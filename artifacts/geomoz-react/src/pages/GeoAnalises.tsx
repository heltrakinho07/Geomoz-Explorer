import { useProject } from "@/context/ProjectContext";
/**
 * GeoAnálises — Sentinel-2 spectral analysis module.
 *
 * Two modes:
 *  GEE Mode  — real Sentinel-2 imagery from Google Earth Engine (requires credentials)
 *  Proxy Mode — synthetic spectral maps derived from geological attributes (always available)
 *
 * GEE tile URLs returned by the Python API are valid for ~24 h and served
 * directly by Google's infrastructure — Leaflet fetches them with no additional auth.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  MapContainer, TileLayer, GeoJSON, WMSTileLayer, ScaleControl,
  Polyline, CircleMarker, useMapEvents, Pane,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  FolderPlus, FolderKanban, Satellite, BarChart2, Layers, Info, ChevronDown, ChevronUp,
  Cpu, FlaskConical, CloudSun, Droplets, Flame,
  CheckCircle2, XCircle, Loader2, Play, RefreshCw,
  ExternalLink, ShieldCheck,
  Mountain, TrendingUp, Trees, Sliders, MapPin,
  Activity, Target, Compass, Gem,
  TrendingDown, Route, Waves, X, FileDown,
  Sprout, ChevronLeft, ChevronRight, Navigation, Building2,
  AlertTriangle, Sparkles, ArrowLeft, LayoutGrid, Search, Globe, SlidersHorizontal,
  Clock, Columns2, LogIn,
} from "lucide-react";
import SplitScreenCompare, { type CompareMode } from "@/components/SplitScreenCompare";
import PixelInspectorHUD, { type AnalysisContext } from "@/components/PixelInspectorHUD";
import { sampleTerrariumElevation } from "@/lib/dem-terrain";

import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Area, ComposedChart,
  Scatter, CartesianGrid,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

import { useGeeAuth } from "@/hooks/useGeeAuth";
import GeeCredentialsDialog from "@/components/GeeCredentialsDialog";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import { computeSpectralValue, applyColormap, SpectralIndex, GEE_ONLY_INDICES } from "@/lib/geoml";
import { apiUrl, apiFetch } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import ZoneSelect from "@/components/ZoneSelect";
import DraggablePanel from "@/components/DraggablePanel";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI } from "@/lib/aoi";
import RasterVisPanel, { DEFAULT_VIS_PARAMS } from "@/components/RasterVisPanel";
import type { RasterVisParams } from "@/components/RasterVisPanel";
import StoryMapModal, { type DynamicAnalysisContext } from "@/components/StoryMapModal";
import {
  fetchMapImage, createPDFContext, drawCover, addPDFFooter,
  MARGIN, CONTENT_W, addMapImage,
} from "@/lib/pdf-export";

// ── Types ─────────────────────────────────────────────────────────────────────

type SpectralTab = "s2" | "lineaments" | "targeting"
                  | "profile" | "contours" | "topo_custom" | "landcover"
                  | "spi_ndvi" | SpectralIndex;

type IndexGroup = "spectral" | "landsat" | "terrain" | "agriculture" | "drought" | "fire" | "coastal" | "climate" | "urban" | "health" | "water" | "biophysical";

interface LandCoverClass {
  code: number;
  label: string;
  color: string;
  areaKm2: number;
  pct: number;
}

interface LandCoverResult {
  tileUrl: string;
  name: string;
  source: string;
  year: number;
  resolution_m: number;
  totalKm2: number;
  classes: LandCoverClass[];
  ranked: LandCoverClass[];
  province?: string | null;
  district?: string | null;
}

interface RoseBin { bin_deg: number; count: number; pct: number; }

interface LineamentsResult {
  tileUrl: string;
  edgesTileUrl: string;
  name: string;
  formula: string;
  rose: RoseBin[];
  sampleCount: number;
  meanDensity: number | null;
  province?: string | null;
  district?: string | null;
}

interface MineralPreset {
  id: string;
  name: string;
  description: string;
  weights: Record<string, number>;
  invert: string[];
}

interface ProfileResult {
  points:        { lon: number; lat: number }[];
  distances_m:   number[];
  elevations_m:  (number | null)[];
  stats: {
    totalDistanceM: number;
    minElevM:       number;
    maxElevM:       number;
    meanElevM:      number;
    gainM:          number;
    lossM:          number;
    sampleCount:    number;
  };
  name:    string;
  formula: string;
}

interface TopoClassConfig {
  label: string;
  color: string;
}
interface TopoClassesResult {
  tileUrl:    string;
  name:       string;
  formula:    string;
  breaks:     number[];
  colors:     string[];
  labels:     string[];
  areasKm2:   number[];
  areasPct:   number[];
  hasWater:   boolean;
}

interface ContoursResult {
  tileUrl:         string;
  indexTileUrl:    string;
  name:            string;
  formula:         string;
  intervalM:       number;
  indexEvery:      number;
  indexIntervalM:  number;
  minElevM:        number | null;
  maxElevM:        number | null;
  intervals:       number[];
  province?:       string | null;
  district?:       string | null;
}

interface TargetingResult {
  tileUrl: string;
  name: string;
  mineral: string;
  mineralName: string;
  description: string;
  weights: Record<string, number>;
  inverted: string[];
  formula: string;
  sceneCount: number;
  dateRange: string;
  scoreThreshold: number;
  stats: {
    meanScore?: number | null;
    p90?: number | null;
    p95?: number | null;
    p99?: number | null;
    favorableKm2?: number | null;
  };
  province?: string | null;
  district?: string | null;
}

interface SpiNdviResult {
  spiTileUrl:  string;
  ndviTileUrl: string;
  name:        string;
  formula:     string;
  bands:       string;
  year:        number;
  climStart:   number;
  pairs:       { spi: number; ndvi: number }[];
  stats: {
    pearsonR?:    number | null;
    pValue?:      number | null;
    meanSpi?:     number | null;
    meanNdvi?:    number | null;
    droughtKm2?:  number | null;
    droughtPct?:  number | null;
    slope?:       number | null;
    intercept?:   number | null;
    sampleCount:  number;
  };
  spiPalette:  string[];
  ndviPalette: string[];
}

interface OverlapDistrict { province: string | null; district: string; areaKm2: number; pct: number; }
interface OverlapVillage  { name: string; lon: number; lat: number; }

interface OverlapResult {
  mineralName:    string;
  scoreThreshold: number;
  formula:        string;
  dateRange:      string;
  zones:          GeoJSON.FeatureCollection;
  report: {
    totalFavorableKm2: number;
    zoneCount:         number;
    districts:         OverlapDistrict[];
    villages:          OverlapVillage[];
    villageCount:      number;
    adminPostCount:    number;
    notes:             string[];
  };
}

interface GeeStatus {
  connected: boolean;
  auth_type: string | null;
  project: string | null;
  message: string;
  indices: string[];
}

interface GeeResult {
  tileUrl: string;
  name: string;
  formula: string;
  bands: string;
  sceneCount: number;
  dateRange: string;
  stats: Record<string, number>;
  province?: string | null;
}

interface IndexDef {
  id: SpectralIndex;
  label: string;
  short: string;
  icon: React.ReactNode;
  group: IndexGroup;
  formula: string;
  bands: string;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
}

const INDEX_DEFS: IndexDef[] = [
  // ── Sentinel-2 spectral ────────────────────────────────────────────────
  { id: "ndvi", label: "NDVI", short: "Vegetação", icon: <CloudSun size={13} />, group: "spectral",
    formula: "NDVI = (B8 − B4) / (B8 + B4)",
    bands: "NIR (B8) · Vermelho (B4)",
    interpretation: "Índice de Vegetação por Diferença Normalizada. Valores elevados indicam vegetação densa e vigorosa; valores baixos indicam solo exposto e corpos de água.",
    lowLabel: "Solo / água", highLabel: "Vegetação densa" },
  { id: "bare_soil", label: "Solo Exposto", short: "BSI", icon: <BarChart2 size={13} />, group: "spectral",
    formula: "(B11+B4−B8−B2) / (B11+B4+B8+B2)",
    bands: "B11 · B4 · NIR (B8) · Azul (B2)",
    interpretation: "Índice de Solo Exposto (Bare Soil Index) para monitorização ambiental, erosão e degradação territorial.",
    lowLabel: "Vegetação / escuro", highLabel: "Solo exposto" },

  // ── Landsat 8 ──────────────────────────────────────────────────────────
  { id: "ndvi_l8", label: "NDVI L8", short: "NDVI L8", icon: <Trees size={13} />, group: "landsat",
    formula: "NDVI = (SR_B5 − SR_B4) / (SR_B5 + SR_B4)",
    bands: "NIR (SR_B5) · Vermelho (SR_B4)",
    interpretation: "NDVI Landsat 8 (resolução 30 m, série temporal desde 2013). Complementar ao Sentinel-2.",
    lowLabel: "Rocha / água", highLabel: "Vegetação densa" },

  // ── Terrain (Copernicus GLO-30 DEM + HydroSHEDS) ───────────────────────
  { id: "elevation", label: "Elevação", short: "Elevação", icon: <Mountain size={13} />, group: "terrain",
    formula: "DEM Copernicus GLO-30 (focal_mean 3 m)",
    bands: "Copernicus DEM GLO-30 (30 m)",
    interpretation: "Modelo digital de elevação em metros acima do nível do mar. Base para todos os índices de relevo.",
    lowLabel: "Planície / costa", highLabel: "Montanha" },
  { id: "hipsometry", label: "Hipsometria", short: "Hipsometria", icon: <TrendingUp size={13} />, group: "terrain",
    formula: "(DEM − min) / (max − min) — normalizada no recorte",
    bands: "Copernicus DEM GLO-30",
    interpretation: "Distribuição relativa de altitudes dentro da área seleccionada. Realça contrastes topográficos locais.",
    lowLabel: "Cotas baixas", highLabel: "Cotas altas" },
  { id: "topo_class", label: "Classes Topo", short: "Classes Topo", icon: <Layers size={13} />, group: "terrain",
    formula: "DEM em [<5, 5–10, 10–30, 30–60, >60] m + rios HydroSHEDS",
    bands: "Copernicus DEM + HydroSHEDS FreeFlowingRivers",
    interpretation: "Classificação topográfica em 5 classes morfológicas + máscara de água. Replica a metodologia do script GEE de Sofala.",
    lowLabel: "Planície", highLabel: "Colinas altas + água" },

  // ── Agriculture & Drought (GEE-only, no proxy) ─────────────────────────
  { id: "evi", label: "EVI", short: "EVI", icon: <CloudSun size={13} />, group: "agriculture",
    formula: "EVI = 2.5 × (B8 − B4) / (B8 + 6×B4 − 7.5×B2 + 1)",
    bands: "NIR (B8) · Vermelho (B4) · Azul (B2)",
    interpretation: "Enhanced Vegetation Index — corrige influência atmosférica e do solo. Melhor que NDVI em áreas de alta biomassa (<floresta, culturas densas).",
    lowLabel: "Baixa actividade", highLabel: "Alta biomassa" },
  { id: "ndmi", label: "NDMI", short: "NDMI", icon: <Droplets size={13} />, group: "agriculture",
    formula: "NDMI = (B8 − B11) / (B8 + B11)",
    bands: "NIR (B8) · SWIR1 (B11)",
    interpretation: "Normalized Difference Moisture Index — sensível ao conteúdo de água na vegetação. Detecta stress hídrico antes do NDVI. Crítico para monitoria de secas e irrigação.",
    lowLabel: "Solo seco", highLabel: "Vegetação húmida" },
  { id: "savi", label: "SAVI", short: "SAVI", icon: <Flame size={13} />, group: "agriculture",
    formula: "SAVI = ((B8 − B4) / (B8 + B4 + 0.5)) × 1.5",
    bands: "NIR (B8) · Vermelho (B4)",
    interpretation: "Soil Adjusted Vegetation Index — reduz o efeito do solo exposto (útil em savanas e zonas áridas de Moçambique como o sul e o interior).",
    lowLabel: "Solo nu", highLabel: "Vegetação densa" },
  { id: "gci", label: "GCI", short: "GCI", icon: <Sprout size={13} />, group: "agriculture",
    formula: "GCI = (B8 / B3) − 1",
    bands: "NIR (B8) · Verde (B3)",
    interpretation: "Green Chlorophyll Index — estima o teor de clorofila nas folhas. Correlaciona-se com a produtividade das culturas e necessidades de fertilização.",
    lowLabel: "Folhas senescentes", highLabel: "Alta clorofila" },
  { id: "msavi", label: "MSAVI2", short: "MSAVI2", icon: <BarChart2 size={13} />, group: "agriculture",
    formula: "MSAVI2 = (2×B8 + 1 − sqrt((2×B8 + 1)² − 8×(B8 − B4))) / 2",
    bands: "NIR (B8) · Vermelho (B4)",
    interpretation: "Modified SAVI2 — minimiza ainda mais o ruído do solo. Recomendado para monitoria de culturas em zonas semi-áridas.",
    lowLabel: "Solo nu", highLabel: "Vegetação" },

  // ── Drought indices ─────────────────────────────────────────────────────
  { id: "nddi", label: "NDDI", short: "NDDI", icon: <TrendingDown size={13} />, group: "drought",
    formula: "NDDI = (NDVI − NDMI) / (NDVI + NDMI + 0.01)",
    bands: "NIR (B8) · Vermelho (B4) · SWIR1 (B11)",
    interpretation: "Normalized Difference Drought Index — combina NDVI e NDMI (humidade da vegetação) para realçar áreas secas. Usa NDMI (NIR-SWIR) como componente de humidade, não NDWI (Green-NIR). Alto NDDI = stress hídrico severo.",
    lowLabel: "Sem stress", highLabel: "Seca severa" },
  { id: "crop_health", label: "Saúde Cult.", short: "Saúde", icon: <Activity size={13} />, group: "agriculture",
    formula: "0.40×EVI + 0.35×NDMI + 0.25×NDVI",
    bands: "EVI, NDMI, NDVI — composto normalizado",
    interpretation: "Índice composto de saúde das culturas. Combina vigor vegetativo (EVI), teor de humidade (NDMI) e cobertura verde (NDVI). Ideal para monitoria agrícola integrada.",
    lowLabel: "Cultura degradada", highLabel: "Cultura saudável" },
  { id: "drought_severity", label: "Seca", short: "Seca", icon: <Flame size={13} />, group: "drought",
    formula: "0.60×NDDI + 0.40×(1 − NDMI_norm)",
    bands: "NDDI + NDMI inverso — composto normalizado",
    interpretation: "Índice composto de severidade de seca. Quanto maior o valor, pior a condição. Combina o NDDI (stress espectral) com a falta de humidade na vegetação (NDMI inverso).",
    lowLabel: "Sem seca", highLabel: "Seca severa" },

  // ── Fire & Deforestation (GEE-only, no proxy) ───────────────────────────
  { id: "nbr", label: "NBR", short: "NBR", icon: <Flame size={13} />, group: "fire",
    formula: "NBR = (B8 − B12) / (B8 + B12)",
    bands: "NIR (B8) · SWIR2 (B12)",
    interpretation: "Normalized Burn Ratio — detecta áreas queimadas e severidade. Contrasta NIR (vegetação saudável) com SWIR (solo queimado, carvão).",
    lowLabel: "Vegetação", highLabel: "Área queimada" },
  { id: "dnbr", label: "dNBR", short: "dNBR", icon: <Activity size={13} />, group: "fire",
    formula: "dNBR = NBR_pós-fogo − NBR_pré-fogo",
    bands: "Duas composições NBR no tempo",
    interpretation: "Differenced NBR — diferença entre NBR pré e pós-fogo. Quanto maior o valor, mais severa a queimada. Método USGS padrão.",
    lowLabel: "Não queimado", highLabel: "Severo" },
  { id: "burn_severity", label: "Severidade", short: "Severidade", icon: <Target size={13} />, group: "fire",
    formula: "dNBR reclassificado → 5 classes USGS",
    bands: "dNBR com thresholds USGS",
    interpretation: "Classificação USGS de severidade de queimadas: não queimado (<0.1), baixo (0.1–0.27), moderado-baixo (0.27–0.44), moderado-alto (0.44–0.66), alto (>0.66).",
    lowLabel: "Não queimado", highLabel: "Alta severidade" },
  { id: "burned_area", label: "Área Queimada", short: "MODIS BA", icon: <BarChart2 size={13} />, group: "fire",
    formula: "MODIS MCD64A1 — BurnDate mensal",
    bands: "MODIS Aqua/Terra — 500 m",
    interpretation: "Áreas queimadas detectadas pelo MODIS MCD64A1. Dados mensais a 500 m desde 2001. Ideal para análise histórica de padrões de fogo.",
    lowLabel: "Não queimado", highLabel: "Queimado" },
  { id: "forest_loss", label: "Perda Florestal", short: "Hansen", icon: <Trees size={13} />, group: "fire",
    formula: "Hansen Global Forest Change v1.11 (2000–2023)",
    bands: "Landsat — 30 m — treecover e lossyear",
    interpretation: "Perda de cobertura florestal detectada por ano (2001–2023). Dados de referência para desflorestação em Moçambique. Áreas com ≥30% de copa em 2000.",
    lowLabel: "Sem perda", highLabel: "Perda 2023" },
  { id: "fire_risk", label: "Risco Incêndio", short: "Fogo Risco", icon: <TrendingUp size={13} />, group: "fire",
    formula: "0.40×(1−NDVI) + 0.35×(1−NDMI) + 0.25×NDDI",
    bands: "NDVI, NDMI, NDDI — composto normalizado",
    interpretation: "Índice composto de risco de incêndio. Combina baixa vegetação verde (NDVI baixo), baixa humidade (NDMI baixo) e stress hídrico (NDDI alto). Ideal para alerta precoce.",
    lowLabel: "Risco baixo", highLabel: "Risco alto" },

  // ── Water & Moisture indices ─────────────────────────────────────────
  { id: "ndwi", label: "NDWI", short: "NDWI", icon: <Droplets size={13} />, group: "water",
    formula: "NDWI = (B3 − B8) / (B3 + B8)",
    bands: "Verde (B3) · NIR (B8)",
    interpretation: "Índice de Diferença Normalizada de Água (McFeeters, 1996). Delineia corpos de água abertos e elimina feições de solo e vegetação terrestre. Valores > 0 indicam lâmina de água.",
    lowLabel: "Solo / vegetação", highLabel: "Água aberta" },
  { id: "mndwi", label: "MNDWI", short: "MNDWI", icon: <Waves size={13} />, group: "water",
    formula: "MNDWI = (B3 − B11) / (B3 + B11)",
    bands: "Verde (B3) · SWIR1 (B11)",
    interpretation: "NDWI Modificado (Xu, 2006). Substitui NIR por SWIR1, suprimindo com maior eficácia ruídos de solo exposto e áreas urbanas/construídas. Ideal para albufeiras e rios em zonas povoadas.",
    lowLabel: "Solo / urbano", highLabel: "Corpo de água" },
  { id: "awei_nsh", label: "AWEI (s/ Sombra)", short: "AWEI nsh", icon: <Droplets size={13} />, group: "water",
    formula: "4×(B3 − B11) − (0.25×B8 + 2.75×B12)",
    bands: "Verde (B3) · NIR (B8) · SWIR1 (B11) · SWIR2 (B12)",
    interpretation: "Automated Water Extraction Index sem sombra (Feyisa et al., 2014). Otimizado para extração estável e precisa de corpos de água em áreas abertas e planas sem relevo acidentado. Valores > 0 indicam água.",
    lowLabel: "Superfície seca", highLabel: "Água" },
  { id: "awei_sh", label: "AWEI (c/ Sombra)", short: "AWEI sh", icon: <Waves size={13} />, group: "water",
    formula: "B2 + 2.5×B3 − 1.5×(B8 + B11) − 0.25×B12",
    bands: "Azul (B2) · Verde (B3) · NIR (B8) · SWIR1 (B11) · SWIR2 (B12)",
    interpretation: "Automated Water Extraction Index com supressão de sombras (Feyisa et al., 2014). Desenvolvido especificamente para remover confusão entre corpos de água e sombras de nuvens, edifícios ou montanhas. Valores > 0 indicam água.",
    lowLabel: "Sombra / solo", highLabel: "Água pura" },
  { id: "wri", label: "WRI", short: "WRI", icon: <Activity size={13} />, group: "water",
    formula: "WRI = (B3 + B4) / (B8 + B11)",
    bands: "Verde (B3) · Vermelho (B4) · NIR (B8) · SWIR1 (B11)",
    interpretation: "Water Ratio Index (Shen & Li, 2010). Razão espectral onde comprimentos de onda visíveis são contrastados com infravermelho. Valores > 1.0 delimitam corpos hídricos superficiais.",
    lowLabel: "Terra firme (<1.0)", highLabel: "Água (>1.0)" },
  { id: "wi2015", label: "WI2015", short: "WI2015", icon: <TrendingUp size={13} />, group: "water",
    formula: "1.7204 + 171×B3 + 3×B4 − 70×B8 − 45×B11 − 71×B12",
    bands: "Verde (B3) · Vermelho (B4) · NIR (B8) · SWIR1 (B11) · SWIR2 (B12)",
    interpretation: "Water Index 2015 (Fisher et al., 2016). Modelo empírico multiespectral calibrado com coeficientes de regressão de alta precisão para classificação fiável de corpos de água.",
    lowLabel: "Não-água", highLabel: "Água detectada" },

  // ── Climate & Disasters indices ──────────────────────────────────────
  { id: "precipitation", label: "Precipitação", short: "CHIRPS", icon: <Droplets size={13} />, group: "climate",
    formula: "CHIRPS — soma anual (mm)",
    bands: "UCSB-CHG/CHIRPS/DAILY",
    interpretation: "Precipitação anual acumulada do CHIRPS. Dados diários a ~5 km. Essencial para monitoria de cheias, secas e agricultura.",
    lowLabel: "Seca", highLabel: "Chuva intensa" },
  { id: "temperature_lst", label: "Temperatura", short: "Temp.", icon: <Flame size={13} />, group: "climate",
    formula: "MODIS MOD11A2 — LST diurno médio (°C)",
    bands: "MODIS/061/MOD11A2 — LST_Day_1km",
    interpretation: "Temperatura superficial diurna média do MODIS. Identifica ondas de calor, stress térmico em culturas e áreas urbanas quentes.",
    lowLabel: "Frio", highLabel: "Calor extremo" },
  { id: "cyclone_tracks", label: "Rotas Ciclones", short: "IBTrACS", icon: <Navigation size={13} />, group: "climate",
    formula: "IBTrACS v4 — passagens históricas (1980–2024)",
    bands: "NOAA/IBTrACS/v4 — tracks de ciclones",
    interpretation: "Densidade histórica de passagens de ciclones tropicais do IBTrACS. Fundamental para avaliar zonas de maior recorrência em Moçambique.",
    lowLabel: "Raro", highLabel: "Frequente" },
  { id: "cyclone_risk", label: "Risco Ciclone", short: "Risco Ciclone", icon: <Target size={13} />, group: "climate",
    formula: "0.35×precip + 0.30×ciclones + 0.20×(1−elev) + 0.15×(1−NDVI)",
    bands: "CHIRPS · IBTrACS · DEM · proxy NDVI",
    interpretation: "Risco composto de ciclone: combina precipitação extrema (CHIRPS), densidade histórica de ciclones (IBTrACS), baixa elevação e falta de vegetação tampão.",
    lowLabel: "Risco baixo", highLabel: "Risco alto" },

  // ── Urban & Infrastructure indices ────────────────────────────────────
  { id: "urban_expansion", label: "Expansão Urbana", short: "NBI", icon: <Building2 size={13} />, group: "urban",
    formula: "NBI = B11 / (B8 + B11 + B4) — New Built-up Index",
    bands: "SWIR1 (B11) · NIR (B8) · Vermelho (B4)",
    interpretation: "Detecta áreas construídas (edifícios, asfalto, infraestruturas). Utiliza o New Built-up Index (NBI) com base na alta reflectância SWIR de materiais construídos.",
    lowLabel: "Vegetação / solo", highLabel: "Área construída" },
  { id: "impervious_surface", label: "Impermeável", short: "NDBI", icon: <Building2 size={13} />, group: "urban",
    formula: "NDBI = (B11 − B8) / (B11 + B8) — Normalized Difference Built-up Index",
    bands: "SWIR1 (B11) · NIR (B8)",
    interpretation: "Superfícies impermeáveis (asfalto, telhados, betão) identificadas pelo NDBI. Valores positivos indicam áreas urbanizadas. Essencial para planeamento urbano e drenagem.",
    lowLabel: "Permeável / vegetação", highLabel: "Impermeável / construído" },
  { id: "urban_heat_island", label: "Ilha Calor", short: "UHI", icon: <Flame size={13} />, group: "urban",
    formula: "UHI = LST_norm − NDVI_norm — contraste térmico",
    bands: "MODIS MOD11A2 (LST) · Sentinel-2 (NDVI)",
    interpretation: "Ilha de Calor Urbana — diferença entre temperatura superficial (MODIS LST) e vigor vegetativo (NDVI). Áreas urbanas densas aparecem mais quentes que zonas rurais/russas.",
    lowLabel: "Rural / fresco", highLabel: "Urbano / quente" },

  // ── New GEE Scripts: índices de seca (drought) ───────────────────────────
  { id: "vci", label: "VCI", short: "VCI", icon: <CloudSun size={13} />, group: "drought",
    formula: "VCI = (NDVI − NDVI_min) / (NDVI_max − NDVI_min) × 100",
    bands: "MODIS MOD13A2 — NDVI multi-anual",
    interpretation: "Vegetation Condition Index — compara NDVI actual com série histórica. Quanto menor o VCI, pior a condição da vegetação. < 35 = seca severa, 35–70 = stress moderado, > 70 = normal.",
    lowLabel: "Seca severa", highLabel: "Vegetação normal" },
  { id: "tci", label: "TCI", short: "TCI", icon: <Flame size={13} />, group: "drought",
    formula: "TCI = (LST_max − LST) / (LST_max − LST_min) × 100",
    bands: "MODIS MOD11A2 — LST multi-anual",
    interpretation: "Temperature Condition Index — avalia stress térmico da vegetação. TCI baixo = temperatura acima da normal (stress térmico). Combina com VCI para formar VHI.",
    lowLabel: "Stress térmico", highLabel: "Temperatura normal" },
  { id: "vhi", label: "VHI", short: "VHI", icon: <Activity size={13} />, group: "drought",
    formula: "VHI = 0.5 × VCI + 0.5 × TCI",
    bands: "MODIS NDVI + MODIS LST",
    interpretation: "Vegetation Health Index — média ponderada de VCI e TCI. Indicador composto de seca agrícola. < 35 = seca, 35–70 = stress, > 70 = saudável.",
    lowLabel: "Seca", highLabel: "Saudável" },
  { id: "spei", label: "SPEI", short: "SPEI", icon: <Droplets size={13} />, group: "drought",
    formula: "SPEI = anomalia padronizada precipitação-evapotranspiração",
    bands: "CSIC/SPEI — 12 meses",
    interpretation: "Standardised Precipitation-Evapotranspiration Index — balanço hídrico climático multi-escala. SPEI < −1 = seca moderada, < −1.5 = seca severa, < −2 = seca extrema.",
    lowLabel: "Seca extrema", highLabel: "Húmido" },

  // ── New GEE Scripts: agricultura (CWLS) ──────────────────────────────────
  { id: "cwsi", label: "CWSI", short: "CWSI", icon: <Droplets size={13} />, group: "agriculture",
    formula: "CWSI = 1 − (ET / PET)",
    bands: "MODIS MOD16A2GF — ET · PET",
    interpretation: "Crop Water Stress Index — quão próximo a cultura está da evapotranspiração potencial. 0 = sem stress (ET = PET), 1 = stress máximo (ET ≈ 0). Crítico para irrigação e monitoria de secas.",
    lowLabel: "Sem stress", highLabel: "Stress hídrico" },

  // ── New GEE Scripts: água (NDTI) ─────────────────────────────────────────
  { id: "ndti", label: "NDTI", short: "NDTI", icon: <Droplets size={13} />, group: "water",
    formula: "NDTI = (B4 − B3) / (B4 + B3)",
    bands: "Sentinel-2 — Vermelho (B4) · Verde (B3) — máscara NDWI",
    interpretation: "Normalized Difference Turbidity Index — turbidez em corpos de água após mascaramento por NDWI (> 0.1). Valores altos = água turva (sedimentos suspensos, eutrofização).",
    lowLabel: "Água clara", highLabel: "Água turva" },

  // ── New GEE Scripts: clima (wind_speed) ──────────────────────────────────
  { id: "wind_speed", label: "Vento", short: "Vento", icon: <Navigation size={13} />, group: "climate",
    formula: "|V| = sqrt(u² + v²) — ERA5",
    bands: "ERA5 Daily — u10 · v10",
    interpretation: "Velocidade média do vento (m/s) derivada do ERA5. Combina as componentes zonal (u) e meridional (v). Essencial para energia eólica, dispersão de poluentes e risco de incêndio.",
    lowLabel: "Calmo", highLabel: "Vento forte" },

  // ── New GEE Scripts: urbano (night_light) ────────────────────────────────
  { id: "night_light", label: "Luz Noturna", short: "VIIRS", icon: <Building2 size={13} />, group: "urban",
    formula: "avg_rad — VIIRS DNB mensal",
    bands: "VIIRS Stray Light Corrected Nighttime Day/Night Band",
    interpretation: "Intensidade luminosa nocturna (VIIRS DNB). Correlaciona-se com densidade populacional, actividade económica e electrificação. Valores altos = áreas urbanas densas / industriais.",
    lowLabel: "Escuro / rural", highLabel: "Luz intensa" },

  // ── New GEE Scripts: biofísicos (LAI · Canopy Height) ────────────────────
  { id: "lai", label: "LAI", short: "LAI", icon: <Sprout size={13} />, group: "biophysical",
    formula: "LAI = 3.618 × EVI − 0.118",
    bands: "Landsat 8/9 — EVI derivado",
    interpretation: "Leaf Area Index — área foliar por unidade de área. Derivado empiricamente do EVI. LAI < 1 = vegetação esparsa, 1–3 = vegetação moderada, > 3 = floresta densa / culturas.",
    lowLabel: "Vegetação esparsa", highLabel: "Floresta densa" },
  { id: "canopy_height", label: "Altura Dossel", short: "Dossel", icon: <Trees size={13} />, group: "biophysical",
    formula: "Meta Forest Monitoring — altura em metros",
    bands: "Meta/forest-monitoring — inferência multi-sensor",
    interpretation: "Altura do dossel florestal (m) — modelo global Meta. Mapeia estrutura vertical da vegetação: < 5 m = arbustos/capoeira, 5–15 m = floresta secundária, > 15 m = floresta primária.",
    lowLabel: "Arbustos / baixo", highLabel: "Floresta alta" },
];

const TERRAIN_CLASS_NAMES = [
  "Planície / < 5 m",
  "Planície Baixa / 5–10 m",
  "Planície Média / 10–30 m",
  "Colinas Baixas / 30–60 m",
  "Colinas Altas / > 60 m",
  "Água & Rios",
];

// ── Colormap legend ────────────────────────────────────────────────────────────

function ColormapLegend({ index }: { index: SpectralIndex }) {
  const def = INDEX_DEFS.find(d => d.id === index)!;
  const stops = Array.from({ length: 10 }, (_, i) =>
    applyColormap(i / 9, index)
  ).join(", ");
  return (
    <div>
      <div className="h-3.5 w-full rounded" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <div className="flex justify-between text-xs text-slate-400 mt-0.5">
        <span>{def.lowLabel}</span>
        <span>{def.highLabel}</span>
      </div>
    </div>
  );
}

// ── Comprehensive Index Legend View ──────────────────────────────────────────

function IndexLegendView({
  activeTab,
  activeDef,
  topoClassesTile,
  contoursTile,
  lineamentsTile,
  targetingTile,
  spiNdviResult,
  spiLayerMode,
  geeReady,
}: {
  activeTab: string;
  activeDef?: (typeof INDEX_DEFS)[number];
  topoClassesTile?: TopoClassesResult | null;
  contoursTile?: ContoursResult | null;
  lineamentsTile?: LineamentsResult | null;
  targetingTile?: TargetingResult | null;
  spiNdviResult?: SpiNdviResult | null;
  spiLayerMode?: "spi" | "ndvi";
  geeReady?: boolean;
}) {
  if (activeTab === "topo_class" || activeTab === "topo_custom") {
    const classes = [
      { name: "Planície (< 5 m)", color: "#1a9850" },
      { name: "Terraço (5–15 m)", color: "#66bd63" },
      { name: "Vertente Suave (15–30 m)", color: "#fee08b" },
      { name: "Colinas Baixas (30–60 m)", color: "#fdae61" },
      { name: "Colinas Altas (> 60 m)", color: "#a50026" },
      { name: "Água & Rios", color: "#3690c0" },
    ];
    return (
      <div className="space-y-1 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">6 Classes Morfológicas (GLO-30)</div>
        <div className="space-y-1">
          {classes.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-1.5 py-0.5">
              <div className="flex items-center gap-1.5 truncate">
                <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: c.color }} />
                <span className="text-slate-700 dark:text-slate-300 truncate text-[11px]">{c.name}</span>
              </div>
              {topoClassesTile?.areasPct && topoClassesTile.areasPct[i] != null && (
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {topoClassesTile.areasPct[i].toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }


  if (activeTab === "landcover") {
    const classes = [
      { name: "Árvores / Floresta (10)", color: "#006400" },
      { name: "Matagal / Arbustos (20)", color: "#ffbb22" },
      { name: "Pastagens (30)", color: "#ffff4c" },
      { name: "Culturas Agrícolas (40)", color: "#f096ff" },
      { name: "Edificado / Urbano (50)", color: "#fa0000" },
      { name: "Solo Desnudo (60)", color: "#b4b4b4" },
      { name: "Corpos de Água (80)", color: "#0064c8" },
      { name: "Zonas Húmidas (90)", color: "#0096a0" },
      { name: "Mangais (95)", color: "#00cf75" },
    ];
    return (
      <div className="space-y-1 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">ESA WorldCover 10 m</div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
          {classes.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <span className="inline-block w-2.5 h-2.5 rounded shrink-0" style={{ background: c.color }} />
              <span className="text-slate-700 dark:text-slate-300 truncate text-[10px]">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === "contours") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">Curvas Altimétricas (DEM GLO-30)</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
          <span className="inline-block w-5 h-1 bg-amber-900 rounded shrink-0" />
          <span>Curva-mestra ({contoursTile?.indexIntervalM || 250} m com cota)</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
          <span className="inline-block w-5 h-0.5 bg-amber-600 rounded shrink-0" />
          <span>Curva normal ({contoursTile?.intervalM || 50} m)</span>
        </div>
        {contoursTile && (
          <div className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-100">
            Variação: {contoursTile.minElevM?.toFixed(0) ?? "0"} m → {contoursTile.maxElevM?.toFixed(0) ?? "—"} m
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "lineaments") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">Feições Estruturais (Filtros Direcionais)</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
          <span className="inline-block w-5 h-0.5 bg-fuchsia-600 rounded shrink-0" />
          <span>Fraturas & Falhas Mapeadas</span>
        </div>
        <div className="mt-2">
          <div className="text-[9px] text-slate-400 mb-0.5">Densidade Estrutural (km/km²)</div>
          <div className="h-2.5 rounded bg-gradient-to-r from-blue-600 via-fuchsia-500 to-rose-600" />
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            <span>Baixa densidade</span>
            <span>Alta densidade</span>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "targeting") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">Favorabilidade Mineral (0–100)</div>
        <div className="h-3 rounded-full bg-gradient-to-r from-[#0d47a1] via-[#7b1fa2] via-[#e53935] via-[#fdd835] to-[#fffde7]" />
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>0 · Baixo potencial</span>
          <span>100 · Alvo prioritário</span>
        </div>
      </div>
    );
  }

  if (activeTab === "profile") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">Traçado Topográfico A→B</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
          <span>Pontos de Controle no Relevo</span>
        </div>
        <div className="text-[10px] text-slate-400 leading-relaxed">
          Clique em 2 ou mais pontos no mapa para traçar a linha de perfil altimétrico.
        </div>
      </div>
    );
  }

  if (activeTab === "spi_ndvi") {
    return (
      <div className="space-y-2 text-xs">
        <div>
          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">SPI (Precipitação Padronizada)</div>
          <div className="h-2.5 rounded bg-gradient-to-r from-red-600 via-amber-400 to-blue-600" />
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            <span>−2 · Seca Extrema</span>
            <span>+2 · Muito Húmido</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 font-semibold mb-0.5">NDVI (Índice de Vegetação)</div>
          <div className="h-2.5 rounded bg-gradient-to-r from-[#8b5a2b] via-[#f0dc82] to-[#006400]" />
          <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
            <span>0 · Solo Nu</span>
            <span>0.9 · Vegetação Densa</span>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "s2") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="text-[10px] text-slate-500 font-semibold mb-1">Composição de Cor Real (RGB)</div>
        <div className="text-[11px] text-slate-700 dark:text-slate-300">
          Banda 4 (Vermelho) · Banda 3 (Verde) · Banda 2 (Azul)
        </div>
        <div className="text-[10px] text-slate-400">
          Mosaico Sentinel-2 Cloudless sem nuvens (Copernicus 10 m).
        </div>
      </div>
    );
  }

  if (activeDef) {
    const stops = Array.from({ length: 10 }, (_, i) =>
      applyColormap(i / 9, activeDef.id as SpectralIndex)
    ).join(", ");
    return (
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded shadow-2xs" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <div className="flex justify-between text-[10px] text-slate-500 font-medium mt-0.5">
          <span>{activeDef.lowLabel}</span>
          <span>{activeDef.highLabel}</span>
        </div>
        {activeDef.formula && (
          <div className="text-[10px] text-slate-400 truncate mt-1">
            <span className="font-mono text-slate-500">{activeDef.formula}</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── GEE Status badge ───────────────────────────────────────────────────────────

function GeeStatusBadge({ status }: { status: GeeStatus | null; loading: boolean }) {
  if (!status) return null;
  return status.connected ? (
    <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
      <CheckCircle2 size={11} /> GEE Conectado · {status.project || status.auth_type}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
      <XCircle size={11} /> GEE Desligado
    </span>
  );
}

// ── GEE Setup Guide ────────────────────────────────────────────────────────────

function GeeSetupGuide({ onRetry }: { onRetry: () => void }) {
  const steps = [
    {
      n: 1, title: "Conta Google Earth Engine",
      desc: "Aceda a earthengine.google.com e registe-se (gratuito para uso não-comercial).",
      link: "https://earthengine.google.com/",
    },
    {
      n: 2, title: "Criar Projecto GCP",
      desc: "Em console.cloud.google.com, crie um projecto e active a API 'Earth Engine'.",
      link: "https://console.cloud.google.com/",
    },
    {
      n: 3, title: "Criar Service Account",
      desc: "Em IAM → Service Accounts, crie uma conta com o papel 'Earth Engine Resource Viewer'. Descarregue a chave JSON.",
      link: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    },
    {
      n: 4, title: "Registar o Service Account no GEE",
      desc: "Em code.earthengine.google.com → Assets → Service Accounts, registe o email do service account.",
      link: "https://code.earthengine.google.com/",
    },
    {
      n: 5, title: "Configurar Secrets no Replit",
      desc: 'Adicione o secret GEE_SERVICE_ACCOUNT_KEY com o conteúdo completo do ficheiro JSON da chave. Opcionalmente, defina GEE_PROJECT_ID.',
      link: null,
    },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
          <XCircle size={20} className="text-red-500" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Google Earth Engine não configurado</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure as credenciais para activar análise real com Sentinel-2.
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map(s => (
          <li key={s.n} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{s.title}</span>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-600">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-emerald-300 leading-relaxed">
        <div className="text-slate-500 mb-1"># Secret a configurar no Replit:</div>
        <div>GEE_SERVICE_ACCOUNT_KEY = {"{"} ...conteúdo do .json... {"}"}</div>
        <div>GEE_PROJECT_ID = my-gcp-project-id   <span className="text-slate-500"># opcional</span></div>
      </div>

      <button
        onClick={onRetry}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <RefreshCw size={14} /> Verificar ligação GEE
      </button>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 text-center">
          Sem credenciais GEE, o módulo usa o <strong>Modo Proxy</strong> (índices sintéticos derivados de dados geológicos).
        </p>
      </div>
    </div>
  );
}

function GeeErrorAlert({
  error,
  onReconnect,
}: {
  error: string;
  onReconnect?: () => Promise<void>;
}) {
  const [reconnecting, setReconnecting] = useState(false);
  const isAuthError =
    error.includes("expirou") ||
    error.includes("credentials do not contain") ||
    error.includes("refresh the access token") ||
    error.includes("RefreshError") ||
    error.includes("401") ||
    error.includes("permissão") ||
    error.includes("roles/serviceusage");

  return (
    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300 leading-relaxed space-y-2">
      <div>
        <strong>Erro:</strong> {error}
      </div>
      {isAuthError && (
        <div className="pt-1 flex flex-wrap items-center gap-2">
          {onReconnect && (
            <button
              type="button"
              disabled={reconnecting}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 shadow-sm"
              onClick={async () => {
                setReconnecting(true);
                try {
                  await onReconnect();
                } finally {
                  setReconnecting(false);
                }
              }}
            >
              {reconnecting ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> A conectar...
                </>
              ) : (
                <>
                  <LogIn size={12} /> Reconectar Conta Google
                </>
              )}
            </button>
          )}
          <a
            href="/settings"
            className="inline-flex items-center text-xs font-medium text-red-700 dark:text-red-300 underline hover:no-underline px-1 py-0.5"
          >
            Abrir Definições / Chave de Serviço →
          </a>
        </div>
      )}
    </div>
  );
}

// ── GEE Analysis Panel ─────────────────────────────────────────────────────────

// ── Geospatial Analytics Dashboard Panel ──────────────────────────────────────────

function GeospatialAnalyticsPanel({
  activeIndex,
  province,
  district,
  geometry,
  geeStatus,
  result,
  isCalculating,
  startDate,
  endDate,
  cloudPct,
  onOpenCompare,
  onOpenStoryMap,
}: {
  activeIndex: SpectralIndex;
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  geeStatus: GeeStatus;
  result: GeeResult | null;
  isCalculating?: boolean;
  startDate: string;
  endDate: string;
  cloudPct: number;
  onOpenCompare?: () => void;
  onOpenStoryMap?: () => void;
}) {
  const { activeProject, saveRunToActiveProject } = useProject();
  const { toast } = useToast();
  const [savingRun, setSavingRun] = useState(false);
  const [runSaved, setRunSaved]   = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  useEffect(() => {
    setRunSaved(false);
  }, [activeIndex, result]);

  const def = INDEX_DEFS.find(d => d.id === activeIndex)!;

  async function handleSaveRunToProject() {
    if (!activeProject) {
      toast({
        variant: "destructive",
        title: "Nenhum projeto selecionado",
        description: "Selecione ou crie um projeto no menu superior para guardar esta análise.",
      });
      return;
    }
    if (!result) return;

    setSavingRun(true);
    try {
      await saveRunToActiveProject({
        name: `${def.short} (${def.label})`,
        type: "remote_sensing",
        sensor: "Sentinel-2 (Copernicus)",
        code: activeIndex,
        formula: def.formula || "",
        dateRange: {
          start: startDate,
          end: endDate,
        },
        metrics: {
          min: result.stats.p10 ?? result.stats.min,
          max: result.stats.p90 ?? result.stats.max,
          mean: result.stats.mean ?? result.stats.p50,
          cloudCoverPercentage: cloudPct,
        },
        tileUrl: result.tileUrl,
        notes: `Clipping: ${district ? `${district}, ${province}` : province || "Moçambique"} | Cenas: ${result.sceneCount}`,
      });
      setRunSaved(true);
      toast({
        title: "Análise guardada com sucesso!",
        description: `Adicionada ao projeto "${activeProject.name}".`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erro ao guardar análise",
        description: e.message || "Tente novamente.",
      });
    } finally {
      setSavingRun(false);
    }
  }

  const stats = result?.stats || {};
  const hasStats = Object.keys(stats).length > 0;

  return (
    <div className="space-y-4">
      {/* Header with Title and Sensor Resolution */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            {def.short}
          </span>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{def.label}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {def.group === "spectral" ? "Sentinel-2 · 10–20 m" : def.group === "landsat" ? "Landsat 8 · 30 m" : def.group === "terrain" ? "Copernicus DEM · 30 m" : "Multi-sensor"}
        </p>
      </div>

      {/* Loading state banner */}
      {isCalculating && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-3 text-xs text-sky-700 dark:text-sky-300 leading-relaxed flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-sky-600 shrink-0" />
          <span>O GEE está a processar a composição multitemporal e a extrair as estatísticas zonais (5–20 s)…</span>
        </div>
      )}

      {/* Status banner when result is available */}
      {result && !isCalculating && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
              <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span>Processamento GEE Concluído</span>
            </div>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono">
              24h Ativo
            </span>
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 space-y-0.5">
            <div><strong>{result.sceneCount}</strong> cenas Sentinel-2 calibradas</div>
            <div>Período: <strong>{result.dateRange}</strong></div>
          </div>
        </div>
      )}

      {/* Quantitative Analytics Dashboard Cards */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Métricas Geoestatísticas</span>
          {result && <span className="text-[10px] text-sky-600 dark:text-sky-400 font-normal">Recorte Zonal</span>}
        </h4>

        {hasStats ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Área Recortada</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-0.5 truncate">
                {stats.areaKm2 ? `${stats.areaKm2.toLocaleString()} km²` : district ? `${district}` : province ? `${province}` : "Moçambique"}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Média (μ)</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-0.5">
                {stats.mean != null ? stats.mean.toFixed(3) : "—"}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Mediana (P50)</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-0.5">
                {stats.p50 != null ? stats.p50.toFixed(3) : "—"}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Desvio Padrão (σ)</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-0.5">
                {stats.stdDev != null ? stats.stdDev.toFixed(3) : "—"}
              </div>
            </div>

            <div className="col-span-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold mb-1">
                <span>Distribuição Percentil (P10 → P90)</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {stats.p10 != null && stats.p90 != null ? `[${stats.p10.toFixed(2)}, ${stats.p90.toFixed(2)}]` : "—"}
                </span>
              </div>
              {/* Distribution visual bar */}
              <div className="relative h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-gradient-to-r from-sky-400 via-emerald-400 to-indigo-500 rounded-full"
                  style={{ left: "10%", right: "10%" }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                <span>P10: {stats.p10 != null ? stats.p10.toFixed(2) : "—"}</span>
                <span>P25: {stats.p25 != null ? stats.p25.toFixed(2) : "—"}</span>
                <span>P75: {stats.p75 != null ? stats.p75.toFixed(2) : "—"}</span>
                <span>P90: {stats.p90 != null ? stats.p90.toFixed(2) : "—"}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center">
            <BarChart2 size={24} className="mx-auto text-slate-400 mb-1.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">Aguardando cálculo zonal</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Clique em <strong>Calcular {def.short}</strong> na barra lateral esquerda para gerar as métricas geoestatísticas.
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons: Compare & Save to Project */}
      <div className="space-y-2 pt-1">
        {onOpenCompare && (
          <button
            type="button"
            onClick={onOpenCompare}
            className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
            title="Comparar este índice entre o período padrão 2023 e o período recente"
          >
            <Columns2 size={13} />
            <span>Comparar {def.short} (2023 ⟷ Recente)</span>
          </button>
        )}

        {result && (
          <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 truncate">
                <FolderKanban size={14} className="text-sky-600 shrink-0" />
                <span className="truncate">
                  {activeProject ? (
                    <>Projeto: <span className="text-sky-700 dark:text-sky-300 font-bold">{activeProject.name}</span></>
                  ) : (
                    <span className="text-slate-500 font-normal">Nenhum projeto ativo</span>
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveRunToProject}
              disabled={savingRun || runSaved || !activeProject}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                runSaved
                  ? "bg-emerald-600 text-white"
                  : activeProject
                  ? "bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
              }`}
            >
              {savingRun ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>A guardar no estudo…</span>
                </>
              ) : runSaved ? (
                <>
                  <CheckCircle2 size={13} />
                  <span>Guardado no Estudo</span>
                </>
              ) : (
                <>
                  <FolderPlus size={13} />
                  <span>{activeProject ? "Guardar Análise no Projeto Ativo" : "Selecione um Estudo no Menu Superior"}</span>
                </>
              )}
            </button>

            {onOpenStoryMap && (
              <button
                type="button"
                onClick={onOpenStoryMap}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-xs transition-all cursor-pointer"
              >
                <Sparkles size={13} />
                <span>Apresentação Executiva (StoryMap)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Escala / Legenda do Índice */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Escala Espectral
        </h4>
        <ColormapLegend index={activeIndex} />
      </div>

      {/* Collapsible Methodology, Geoscientific Interpretation & Formula */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setMethodologyOpen(v => !v)}
          className="w-full flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Info size={13} className="text-sky-500" />
            <span>Interpretação Geocientífica & Fórmula</span>
          </div>
          {methodologyOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {methodologyOpen && (
          <div className="p-3 space-y-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Interpretação Geocientífica
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {def.interpretation}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Fórmula Matemática
              </span>
              <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed overflow-x-auto">
                {def.formula}
              </code>
              <p className="text-[11px] text-slate-400 mt-1.5">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Bandas: </span>{def.bands}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RoseDiagram({ rose }: { rose: RoseBin[] }) {
  const size = 200;
  const r = 78;
  const cx = size / 2, cy = size / 2;
  const max = Math.max(0.0001, ...rose.map(b => b.pct));
  // 18 bins × 10° each, doubled for 360° visualization (bidirectional)
  const wedges = rose.flatMap((b, i) => {
    const len = (b.pct / max) * r;
    return [0, 1].map(side => {
      const a0 = ((b.bin_deg + side * 180) - 90) * Math.PI / 180;
      const a1 = ((b.bin_deg + 10 + side * 180) - 90) * Math.PI / 180;
      const x0 = cx + len * Math.cos(a0), y0 = cy + len * Math.sin(a0);
      const x1 = cx + len * Math.cos(a1), y1 = cy + len * Math.sin(a1);
      return (
        <path key={`${i}-${side}`}
          d={`M ${cx} ${cy} L ${x0} ${y0} A ${len} ${len} 0 0 1 ${x1} ${y1} Z`}
          fill="#a855f7" fillOpacity={0.55} stroke="#7e22ce" strokeWidth={0.4} />
      );
    });
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full">
      {/* Reference circles */}
      {[r * 0.33, r * 0.66, r].map((rr, k) => (
        <circle key={k} cx={cx} cy={cy} r={rr} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
      ))}
      {/* Cardinal axes */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#cbd5e1" strokeWidth={0.6} />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#cbd5e1" strokeWidth={0.6} />
      {wedges}
      <text x={cx} y={cy - r - 4} fontSize={9} fill="#64748b" textAnchor="middle">N</text>
      <text x={cx + r + 4} y={cy + 3} fontSize={9} fill="#64748b" textAnchor="start">E</text>
      <text x={cx} y={cy + r + 9} fontSize={9} fill="#64748b" textAnchor="middle">S</text>
      <text x={cx - r - 4} y={cy + 3} fontSize={9} fill="#64748b" textAnchor="end">W</text>
    </svg>
  );
}

function dominantOrientation(rose: RoseBin[]): string {
  if (!rose.length) return "—";
  const top = rose.reduce((a, b) => (b.count > a.count ? b : a));
  const deg = top.bin_deg;
  // Compass quadrant label
  if (deg < 22.5 || deg >= 157.5) return "N–S";
  if (deg < 67.5)  return "NE–SW";
  if (deg < 112.5) return "E–W";
  return "NW–SE";
}

function LineamentsPanel({
  province, district, geometry, onResult,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: LineamentsResult | null) => void;
}) {
  const [smoothM, setSmoothM]   = useState(30);
  const [radiusM, setRadiusM]   = useState(750);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<LineamentsResult | null>(null);

  async function run() {
    setRunning(true); setError(null); onResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/lineaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province: province || null, district: district || null, geometry: geometry ?? null,
          smooth_m: smoothM, density_radius_m: radiusM, rose_samples: 4000,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: LineamentsResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
          Parâmetros Estruturais
        </h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Suavização DEM — <strong className="text-slate-700 dark:text-slate-200">{smoothM} m</strong>
            </label>
            <input type="range" min={10} max={120} step={10} value={smoothM}
              onChange={e => setSmoothM(Number(e.target.value))}
              className="w-full accent-fuchsia-500" />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Filtra ruído. 30 m = detalhe fino, 120 m = grandes lineamentos.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Raio densidade — <strong className="text-slate-700 dark:text-slate-200">{radiusM} m</strong>
            </label>
            <input type="range" min={250} max={2500} step={250} value={radiusM}
              onChange={e => setRadiusM(Number(e.target.value))}
              className="w-full accent-fuchsia-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin size={12} className="text-fuchsia-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-fuchsia-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A detectar estruturas…</>
          : <><Activity size={14} /> Detectar Lineamentos</>}
      </button>

      {running && (
        <div className="bg-fuchsia-50 dark:bg-fuchsia-950/40 border border-fuchsia-200 dark:border-fuchsia-800 rounded-xl p-3 text-xs text-fuchsia-700 dark:text-fuchsia-300 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          Hillshade multi-azimute + Canny + Sobel. Tipicamente 15–40 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-fuchsia-50 dark:bg-fuchsia-950/40 border border-fuchsia-200 dark:border-fuchsia-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 size={13} className="text-fuchsia-600 dark:text-fuchsia-400" />
              <span className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">Lineamentos detectados</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <div className="bg-white/70 dark:bg-slate-800/80 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Orientação</div>
                <div className="text-sm font-bold text-fuchsia-700 dark:text-fuchsia-400">{dominantOrientation(result.rose)}</div>
              </div>
              <div className="bg-white/70 dark:bg-slate-800/80 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Densidade média</div>
                <div className="text-sm font-bold text-fuchsia-700 dark:text-fuchsia-400">
                  {result.meanDensity != null ? result.meanDensity.toFixed(3) : "—"}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Compass size={12} /> Rosa de Direcções
            </h5>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
              <RoseDiagram rose={result.rose} />
              <p className="text-[10px] text-center text-slate-400 mt-1">
                {result.sampleCount.toLocaleString()} pixels amostrados
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mineral Targeting Panel ────────────────────────────────────────────────────

function FavorabilityGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const ang = (clamped / 100) * 180 - 180;          // -180..0 (left → right)
  const r = 70, cx = 90, cy = 90;
  const ax = cx + r * Math.cos((ang) * Math.PI / 180);
  const ay = cy + r * Math.sin((ang) * Math.PI / 180);
  // Gradient stops along the 180° arc
  return (
    <svg viewBox="0 0 180 110" className="w-full">
      <defs>
        <linearGradient id="favgrad" x1="0" x2="1">
          <stop offset="0%"   stopColor="#0d0887" />
          <stop offset="25%"  stopColor="#8b0aa5" />
          <stop offset="50%"  stopColor="#db5c68" />
          <stop offset="75%"  stopColor="#febc2a" />
          <stop offset="100%" stopColor="#ffff96" />
        </linearGradient>
      </defs>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#favgrad)" strokeWidth={14} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#0f172a" />
      <text x={cx} y={cy + 28} fontSize={26} fontWeight={700}
        fill="#0f172a" textAnchor="middle">{clamped.toFixed(0)}</text>
      <text x={cx} y={cy - r - 4} fontSize={9} fill="#94a3b8" textAnchor="middle">
        FAVORABILIDADE
      </text>
    </svg>
  );
}

function TargetingPanel({
  province, district, geometry, onResult, onOverlap,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: TargetingResult | null) => void;
  onOverlap: (r: OverlapResult | null) => void;
}) {
  const [presets, setPresets]   = useState<MineralPreset[]>([]);
  const [mineral, setMineral]   = useState("gold");
  const [startDate, setStart]   = useState("2023-11-01");
  const [endDate, setEnd]       = useState(() => new Date().toISOString().split("T")[0]);
  const [cloudPct, setCloudPct] = useState(30);
  const [threshold, setTh]      = useState(0.7);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<TargetingResult | null>(null);
  const [overlapRes, setOverlapRes]         = useState<OverlapResult | null>(null);
  const [overlapRunning, setOverlapRunning] = useState(false);
  const [overlapError, setOverlapError]     = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/geomoz-api/gee/minerals").then(r => r.json())
      .then(d => setPresets(d.minerals ?? [])).catch(() => {});
  }, []);

  const current = presets.find(p => p.id === mineral);

  async function run() {
    setRunning(true); setError(null); onResult(null);
    setOverlapRes(null); setOverlapError(null); onOverlap(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/targeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mineral, province: province || null, district: district || null, geometry: geometry ?? null,
          start_date: startDate, end_date: endDate, cloud_pct: cloudPct,
          score_threshold: threshold,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: TargetingResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  async function runOverlap() {
    setOverlapRunning(true); setOverlapError(null); setOverlapRes(null); onOverlap(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/targeting-overlap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mineral, province: province || null, district: district || null, geometry: geometry ?? null,
          start_date: startDate, end_date: endDate, cloud_pct: cloudPct,
          score_threshold: threshold,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: OverlapResult = await res.json();
      setOverlapRes(data); onOverlap(data);
    } catch (e) {
      setOverlapError(String(e instanceof Error ? e.message : e));
    } finally { setOverlapRunning(false); }
  }

  function downloadOverlapCsv() {
    if (!overlapRes) return;
    const rows = [
      ["Provincia", "Distrito", "Area_km2", "Percentagem"],
      ...overlapRes.report.districts.map(d => [`"${d.province ?? ""}"`, `"${d.district}"`, d.areaKm2, d.pct]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GeoMoz_Cruzamento_${overlapRes.mineralName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Alvo Mineral
        </h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Mineral</label>
            <div className="relative">
              <select value={mineral} onChange={e => setMineral(e.target.value)}
                className="w-full appearance-none text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500">
                {presets.map(p => <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {current && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              {current.description}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Data início</label>
            <input type="date" value={startDate} onChange={e => setStart(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEnd(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Nuvens máx — <strong className="text-slate-700 dark:text-slate-200">{cloudPct}%</strong>
            </label>
            <input type="range" min={5} max={80} value={cloudPct}
              onChange={e => setCloudPct(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Limiar favorável — <strong className="text-slate-700 dark:text-slate-200">{Math.round(threshold * 100)}</strong>
            </label>
            <input type="range" min={0.4} max={0.9} step={0.05} value={threshold}
              onChange={e => setTh(Number(e.target.value))}
              className="w-full accent-amber-500" />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Área favorável = pixels com score ≥ limiar.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin size={12} className="text-amber-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      {current && (
        <div>
          <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Pesos do modelo
          </h5>
          <div className="space-y-1">
            {Object.entries(current.weights).map(([k, v]) => {
              const inv = current.invert.includes(k);
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-slate-600 dark:text-slate-300 truncate">
                    {inv && <span className="text-rose-500 mr-0.5">¬</span>}{k}
                  </span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${v * 100}%` }} />
                  </div>
                  <span className="font-mono text-slate-500 dark:text-slate-400 w-9 text-right">{(v * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={run} disabled={running || !mineral}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-amber-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A calcular favorabilidade…</>
          : <><Target size={14} /> Calcular Potencial Mineral</>}
      </button>

      {running && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A combinar Sentinel-2 + DEM + lineamentos. Pode demorar 30–60 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Gem size={13} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{result.mineralName}</span>
            </div>
            <FavorabilityGauge score={(result.stats.meanScore ?? 0) * 100} />
            <p className="text-[10px] text-center text-slate-400 -mt-2">
              Score médio da região
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P90</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {result.stats.p90 != null ? (result.stats.p90 * 100).toFixed(0) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P95</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {result.stats.p95 != null ? (result.stats.p95 * 100).toFixed(0) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P99</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {result.stats.p99 != null ? (result.stats.p99 * 100).toFixed(0) : "—"}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <div className="text-[10px] text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              Área favorável (score ≥ {Math.round(result.scoreThreshold * 100)})
            </div>
            <div className="text-xl font-bold text-amber-800 dark:text-amber-200 mt-0.5">
              {result.stats.favorableKm2 != null
                ? `${result.stats.favorableKm2.toFixed(1)} km²`
                : "—"}
            </div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-mono break-all">
              {result.formula}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-700 dark:text-slate-200">Aviso:</strong> Targeting heurístico — combina
            sensoriamento remoto + DEM. Resultado é indicativo e não substitui
            campanhas geofísicas / amostragem geoquímica.
          </div>

          {/* Spatial overlap report */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <button onClick={runOverlap} disabled={overlapRunning}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200 cursor-pointer">
              {overlapRunning
                ? <><Loader2 size={14} className="animate-spin" /> A cruzar com camadas admin…</>
                : <><Layers size={14} /> Cruzamento Espacial (relatório)</>}
            </button>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Vetoriza as zonas com score ≥ {Math.round(threshold * 100)} e cruza com
              distritos, aldeias e postos administrativos.
            </p>
          </div>

          {overlapRunning && (
            <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              A vetorizar zonas favoráveis (300 m) e a intersectar com as camadas administrativas. 30–90 s.
            </div>
          )}

          {overlapError && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
              <strong>Erro:</strong> {overlapError}
            </div>
          )}

          {overlapRes && !overlapRunning && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-indigo-500 dark:text-indigo-400 uppercase">Zonas</div>
                  <div className="text-sm font-bold text-indigo-800 dark:text-indigo-200">{overlapRes.report.zoneCount}</div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-indigo-500 dark:text-indigo-400 uppercase">Área favorável</div>
                  <div className="text-sm font-bold text-indigo-800 dark:text-indigo-200">
                    {overlapRes.report.totalFavorableKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km²
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Aldeias dentro</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{overlapRes.report.villageCount}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Postos admin</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{overlapRes.report.adminPostCount}</div>
                </div>
              </div>

              {overlapRes.report.districts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Área favorável por distrito
                    </h5>
                    <button onClick={downloadOverlapCsv}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer">
                      ⇩ CSV
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                    {overlapRes.report.districts.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 text-slate-700 dark:text-slate-200 truncate" title={`${d.district} · ${d.province ?? ""}`}>
                          {d.district}
                          {d.province && <span className="text-slate-400"> · {d.province}</span>}
                        </span>
                        <div className="w-14 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, d.pct)}%` }} />
                        </div>
                        <span className="font-mono text-slate-500 dark:text-slate-400 w-16 text-right shrink-0">
                          {d.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km²
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overlapRes.report.villages.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                    Aldeias nas zonas favoráveis {overlapRes.report.villageCount > overlapRes.report.villages.length
                      ? `(primeiras ${overlapRes.report.villages.length} de ${overlapRes.report.villageCount})` : ""}
                  </h5>
                  <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
                    {overlapRes.report.villages.map((v, i) => (
                      <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full px-2 py-0.5">
                        {v.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {overlapRes.report.notes.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-2 text-[10px] text-amber-700 dark:text-amber-300 space-y-0.5">
                  {overlapRes.report.notes.map((n, i) => <div key={i}>{n}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SPI × NDVI (drought correlation) ───────────────────────────────────────────

function SpiNdviPanel({
  province, district, geometry, onResult,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: SpiNdviResult | null) => void;
}) {
  const [year, setYear]       = useState(2025);
  const [samples, setSamples] = useState(400);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<SpiNdviResult | null>(null);

  const years = Array.from({ length: 2026 - 2006 + 1 }, (_, i) => 2026 - i);

  async function run() {
    setRunning(true); setError(null); onResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/spi-ndvi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province: province || null, district: district || null, geometry: geometry ?? null,
          year, samples,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: SpiNdviResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  const r = result?.stats.pearsonR;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          SPI × NDVI — Seca
        </h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Ano de análise</label>
            <div className="relative">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full appearance-none text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500">
                {years.map(y => <option key={y} value={y} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{y}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Climatologia de referência: 2001 → {year - 1} (CHIRPS)
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Amostras para o scatter — <strong className="text-slate-700 dark:text-slate-200">{samples}</strong>
            </label>
            <input type="range" min={100} max={1000} step={50} value={samples}
              onChange={e => setSamples(Number(e.target.value))}
              className="w-full accent-orange-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin size={12} className="text-orange-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500 dark:text-slate-400">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-orange-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A calcular SPI × NDVI…</>
          : <><Droplets size={14} /> Calcular SPI × NDVI</>}
      </button>

      {running && (
        <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A somar precipitação CHIRPS de {year - 2001 + 1} anos, calcular anomalia e amostrar NDVI MODIS. Tipicamente 15–40 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-900/60 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Droplets size={13} className="text-orange-600" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">{result.name}</span>
            </div>
            <div className="text-center py-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Correlação Pearson (SPI vs NDVI)</div>
              <div className={`text-3xl font-bold ${r != null && Math.abs(r) >= 0.5 ? "text-orange-700 dark:text-orange-400" : "text-slate-700 dark:text-slate-200"}`}>
                {r != null ? r.toFixed(2) : "—"}
              </div>
              <div className="text-[10px] text-slate-400">
                {r == null ? "" :
                  Math.abs(r) >= 0.7 ? "correlação forte" :
                  Math.abs(r) >= 0.4 ? "correlação moderada" :
                  Math.abs(r) >= 0.2 ? "correlação fraca" : "sem correlação relevante"}
                {result.stats.pValue != null ? ` · p ${result.stats.pValue < 0.001 ? "< 0.001" : `= ${result.stats.pValue.toFixed(3)}`}` : ""}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">SPI médio</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {result.stats.meanSpi != null ? result.stats.meanSpi.toFixed(2) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">NDVI médio</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {result.stats.meanNdvi != null ? result.stats.meanNdvi.toFixed(2) : "—"}
              </div>
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 rounded-xl p-3">
            <div className="text-[10px] text-orange-700 dark:text-orange-300 uppercase tracking-wider">
              Área em seca (SPI &lt; −1)
            </div>
            <div className="text-xl font-bold text-orange-800 dark:text-orange-200 mt-0.5">
              {result.stats.droughtPct != null ? `${result.stats.droughtPct}%` : "—"}
              {result.stats.droughtKm2 != null && (
                <span className="text-xs font-normal text-orange-600 dark:text-orange-400 ml-1.5">
                  ({result.stats.droughtKm2.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} km²)
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            <strong className="text-slate-700 dark:text-slate-200">Interpretação:</strong> SPI &lt; −1 indica seca
            meteorológica; correlação positiva SPI–NDVI sugere vegetação dependente da chuva
            (stress hídrico em anos secos). Correlação nula sugere vegetação com acesso a
            água subterrânea / irrigação.
          </div>
        </div>
      )}
    </div>
  );
}

function SpiNdviChart({ result }: { result: SpiNdviResult }) {
  const { slope, intercept } = result.stats;
  const trend = (slope != null && intercept != null)
    ? [-2.5, 2.5].map(x => ({ spi: x, trend: Math.max(0, Math.min(1, slope * x + intercept)) }))
    : [];
  const data = result.pairs.map(p => ({ ...p }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 5, right: 12, bottom: 8, left: -14 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" dataKey="spi" name="SPI" domain={[-3, 3]}
          tick={{ fontSize: 10, fill: "#94a3b8" }} tickCount={7}
          label={{ value: "SPI (anomalia de precipitação)", position: "insideBottom", offset: -4, fontSize: 10, fill: "#64748b" }} />
        <YAxis type="number" dataKey="ndvi" name="NDVI" domain={[0, 1]}
          tick={{ fontSize: 10, fill: "#94a3b8" }} tickCount={6} />
        <Tooltip
          formatter={(v: number, n: string) => [Number(v).toFixed(3), n === "ndvi" ? "NDVI" : n === "spi" ? "SPI" : n]}
          labelFormatter={() => ""}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <ReferenceLine x={-1} stroke="#dc2626" strokeDasharray="4 3"
          label={{ value: "seca", fontSize: 9, fill: "#dc2626", position: "insideTopLeft" }} />
        <Scatter data={data} dataKey="ndvi" fill="#ea580c" fillOpacity={0.55} shape="circle" isAnimationActive={false} />
        {trend.length > 0 && (
          <Line data={trend} dataKey="trend" type="linear" stroke="#0f172a" strokeWidth={1.8}
            strokeDasharray="6 3" dot={false} isAnimationActive={false} legendType="none" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Topographic Profile (A→B) ──────────────────────────────────────────────────

type LonLat = [number, number];   // [lon, lat]

function ProfileClickHandler({
  enabled, onPick,
}: {
  enabled: boolean;
  onPick: (p: LonLat) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick([e.latlng.lng, e.latlng.lat]);
    },
  });
  return null;
}

function GeoAnalisesCoordTracker({
  onMove,
}: {
  onMove: (lat: number | null, lng: number | null, ele?: number | null) => void;
}) {
  const timerRef = useRef<any>(null);
  useMapEvents({
    mousemove(e) {
      const { lat, lng } = e.latlng;
      onMove(lat, lng, null);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          const ele = await sampleTerrariumElevation(lat, lng, 10);
          onMove(lat, lng, ele);
        } catch {}
      }, 60);
    },
    mouseout() {
      if (timerRef.current) clearTimeout(timerRef.current);
      onMove(null, null, null);
    },
  });
  return null;
}

function ProfileChart({ result, onCursorChange }: {
  result: ProfileResult;
  onCursorChange?: (idx: number | null) => void;
}) {
  const data = result.distances_m.map((d, i) => ({
    distance_km: d / 1000,
    elev: result.elevations_m[i],
  }));
  const yMin = Math.floor(result.stats.minElevM / 50) * 50;
  const yMax = Math.ceil(result.stats.maxElevM / 50) * 50;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 18 }}
        onMouseMove={(s: { activeTooltipIndex?: number; isTooltipActive?: boolean }) => {
          if (!onCursorChange) return;
          if (s?.isTooltipActive && typeof s.activeTooltipIndex === "number") {
            onCursorChange(s.activeTooltipIndex);
          } else {
            onCursorChange(null);
          }
        }}
        onMouseLeave={() => onCursorChange?.(null)}
      >
        <defs>
          <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0ea5e9" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="distance_km" type="number"
          domain={[0, "dataMax"]}
          tickFormatter={v => `${v.toFixed(1)} km`}
          fontSize={10} stroke="#94a3b8"
          label={{ value: "Distância (km)", position: "insideBottom", offset: -8, fontSize: 10, fill: "#64748b" }}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={v => `${v}`}
          fontSize={10} stroke="#94a3b8"
          label={{ value: "Elevação (m)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748b" }}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
          formatter={(v: number) => [`${(v ?? 0).toFixed(1)} m`, "Elevação"]}
          labelFormatter={l => `${Number(l).toFixed(2)} km`}
        />
        <ReferenceLine y={result.stats.meanElevM} stroke="#64748b" strokeDasharray="3 3"
          label={{ value: `média ${result.stats.meanElevM.toFixed(0)} m`, position: "right", fontSize: 9, fill: "#64748b" }} />
        <Area type="monotone" dataKey="elev" stroke="none" fill="url(#elevFill)" />
        <Line type="monotone" dataKey="elev" stroke="#0369a1" strokeWidth={1.8} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ProfilePanel({
  points, samples, onSamplesChange, onReset, onRun, running, error, result,
}: {
  points:           LonLat[];
  samples:          number;
  onSamplesChange:  (n: number) => void;
  onReset:          () => void;
  onRun:            () => void;
  running:          boolean;
  error:            string | null;
  result:           ProfileResult | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Perfil Topográfico
        </h4>
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/50 rounded-xl p-3 text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
          <strong>Como usar:</strong> Clique no mapa para colocar pontos A → B (ou mais).
          Cada clique adiciona um ponto. Mínimo 2.
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pontos ({points.length})
          </h5>
          {points.length > 0 && (
            <button onClick={onReset}
              className="text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer">
              <X size={11} /> Limpar
            </button>
          )}
        </div>
        {points.length === 0 ? (
          <div className="text-xs text-slate-400 italic px-3 py-4 bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-center">
            Clique no mapa para começar
          </div>
        ) : (
          <div className="space-y-1">
            {points.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2 py-1.5">
                <span className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-[10px]">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {p[1].toFixed(3)}, {p[0].toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
          Amostragem — <strong className="text-slate-700 dark:text-slate-200">{samples} pontos</strong>
        </label>
        <input type="range" min={50} max={500} step={50} value={samples}
          onChange={e => onSamplesChange(Number(e.target.value))}
          className="w-full accent-sky-500" />
        <p className="text-[10px] text-slate-400 mt-0.5">
          Mais pontos = perfil mais detalhado (DEM nativo 30 m).
        </p>
      </div>

      <button onClick={onRun} disabled={running || points.length < 2}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A amostrar DEM…</>
          : <><Route size={14} /> Calcular Perfil</>}
      </button>

      {running && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/50 rounded-xl p-3 text-xs text-sky-700 dark:text-sky-300">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A amostrar elevações no DEM Copernicus GLO-30. ~5–15 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Distância</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {(result.stats.totalDistanceM / 1000).toFixed(2)} km
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Amplitude</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {(result.stats.maxElevM - result.stats.minElevM).toFixed(0)} m
              </div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase flex items-center justify-center gap-1">
                <TrendingUp size={9} /> Subida
              </div>
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                +{result.stats.gainM.toFixed(0)} m
              </div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-rose-600 dark:text-rose-400 uppercase flex items-center justify-center gap-1">
                <TrendingDown size={9} /> Descida
              </div>
              <div className="text-sm font-bold text-rose-700 dark:text-rose-300">
                −{result.stats.lossM.toFixed(0)} m
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Mín</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{result.stats.minElevM.toFixed(0)} m</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Máx</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{result.stats.maxElevM.toFixed(0)} m</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contours Panel ─────────────────────────────────────────────────────────────

const CONTOUR_INTERVALS = [10, 20, 25, 50, 100, 200, 500];

function ContoursPanel({
  province, district, geometry, onResult,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: ContoursResult | null) => void;
}) {
  const [intervalM, setIntervalM]   = useState(50);
  const [indexEvery, setIndexEvery] = useState(5);
  const [running, setRunning]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<ContoursResult | null>(null);

  async function run() {
    setRunning(true); setError(null); onResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/contours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province: province || null, district: district || null, geometry: geometry ?? null,
          interval_m: intervalM, index_every: indexEvery,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: ContoursResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Curvas de Nível
        </h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Equidistância
            </label>
            <div className="grid grid-cols-4 gap-1">
              {CONTOUR_INTERVALS.map(v => (
                <button key={v} onClick={() => setIntervalM(v)}
                  className={`text-xs py-1.5 rounded-md border transition-colors cursor-pointer ${
                    intervalM === v
                      ? "bg-amber-600 text-white border-amber-600 font-semibold"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500"
                  }`}>
                  {v} m
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              50 m é o padrão cartográfico para escala 1:100 000.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
              Linhas-mestras (índice) — a cada{" "}
              <strong className="text-slate-700 dark:text-slate-200">{indexEvery}×</strong> ({intervalM * indexEvery} m)
            </label>
            <input type="range" min={2} max={10} value={indexEvery}
              onChange={e => setIndexEvery(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin size={12} className="text-amber-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500 dark:text-slate-400">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-amber-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A gerar curvas…</>
          : <><Waves size={14} /> Gerar Curvas de Nível</>}
      </button>

      {running && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A processar DEM e gerar tiles. ~10–20 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-2">
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {result.intervals.length} curvas geradas
              </span>
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300">
              Elevação na região: {result.minElevM?.toFixed(0) ?? "—"} m →{" "}
              {result.maxElevM?.toFixed(0) ?? "—"} m
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5">
            <div className="flex items-center gap-2 text-xs mb-1.5">
              <span className="inline-block w-6 h-0.5 bg-[#8b5a2b]" />
              <span className="text-slate-600 dark:text-slate-300">Curva ({result.intervalM} m)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block w-6 h-[2px] bg-[#3a1c0c] dark:bg-[#d97706]" />
              <span className="text-slate-600 dark:text-slate-300">Linha-mestra ({result.indexIntervalM} m)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Land Cover Panel (ESA WorldCover) ──────────────────────────────────────────

function LandCoverPanel({
  province, district, geometry, onResult,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: LandCoverResult | null) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<LandCoverResult | null>(null);

  async function run() {
    setRunning(true); setError(null); onResult(null); setResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/landcover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province: province || null, district: district || null, geometry: geometry ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: LandCoverResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  const ranked = result?.ranked.filter(c => c.areaKm2 > 0) ?? [];
  const maxPct = Math.max(0.0001, ...ranked.map(c => c.pct));

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Cobertura do Solo
        </h4>
        <div className="bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/50 rounded-xl p-3 text-xs text-lime-800 dark:text-lime-300 leading-relaxed">
          Classificação <strong>ESA WorldCover 2021</strong> a 10 m — 11 classes
          de uso e cobertura do solo (florestas, agricultura, água, mangais…).
        </div>
        <div className="mt-2.5">
          <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Área (clipping)</label>
          <div className="text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <MapPin size={12} className="text-lime-600" />
            {district
              ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
              : province
                ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                : <span className="text-slate-500 dark:text-slate-400">Moçambique (toda)</span>}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-lime-600 hover:bg-lime-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-lime-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A classificar cobertura…</>
          : <><Sprout size={14} /> Calcular Cobertura do Solo</>}
      </button>

      {running && (
        <div className="bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/50 rounded-xl p-3 text-xs text-lime-700 dark:text-lime-300 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A computar áreas por classe a partir do ESA WorldCover (10 m). ~5–20 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-lime-50 dark:bg-lime-950/40 border border-lime-200 dark:border-lime-900/50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-lime-600 dark:text-lime-400" />
              <span className="text-xs font-semibold text-lime-700 dark:text-lime-300">Cobertura calculada</span>
            </div>
            <div className="text-xs text-lime-700 dark:text-lime-300">
              Área total: <strong>{result.totalKm2.toLocaleString(undefined, { maximumFractionDigits: 0 })} km²</strong>
              {" · "}{ranked.length} classes presentes
            </div>
          </div>

          {/* Complete area analysis (ranked, only classes > 0) */}
          <div>
            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Análise de Área (km² · %)
            </h5>
            <div className="space-y-1.5">
              {ranked.map(c => (
                <div key={c.code} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{c.label}</span>
                    <span className="text-slate-400 font-mono">{c.areaKm2.toLocaleString(undefined, { maximumFractionDigits: 1 })} km²</span>
                    <span className="w-11 text-right font-semibold text-lime-700 dark:text-lime-400">{c.pct.toFixed(1)}%</span>
                  </div>
                  <div className="ml-5 mt-0.5 bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.pct / maxPct) * 100}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full legend (official order, all 11 classes) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Legenda (ESA WorldCover)
            </h5>
            <div className="grid grid-cols-1 gap-0.5">
              {result.classes.map(c => (
                <div key={c.code} className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: c.color }} />
                  <span className="truncate">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface GeoAnalisesProps {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange?: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
  viewMode?: "2d" | "3d";
  onViewModeChange?: (mode: "2d" | "3d") => void;
}

// Defaults for custom topographic classes (user can edit)
const DEFAULT_TOPO_BREAKS = [5, 10, 30, 60];
const DEFAULT_TOPO_CLASSES: TopoClassConfig[] = [
  { label: "Planície",        color: "#d0f0ff" },
  { label: "Planície Baixa",  color: "#a0e060" },
  { label: "Planície Média",  color: "#ffff66" },
  { label: "Colinas Baixas",  color: "#ffb366" },
  { label: "Colinas Altas",   color: "#ff6666" },
];

function TopoClassesPanel({
  province, district, geometry, onResult,
}: {
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  onResult: (r: TopoClassesResult | null) => void;
}) {
  const [breaks, setBreaks]     = useState<number[]>(DEFAULT_TOPO_BREAKS);
  const [classes, setClasses]   = useState<TopoClassConfig[]>(DEFAULT_TOPO_CLASSES);
  const [waterOn, setWaterOn]   = useState(true);
  const [waterColor]            = useState("#3366ff");
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<TopoClassesResult | null>(null);

  // Keep classes length = breaks.length + 1
  function setBreakAt(i: number, v: number) {
    const next = [...breaks]; next[i] = v; setBreaks(next);
  }
  function addClass() {
    const lastBreak = breaks.length ? breaks[breaks.length - 1] : 0;
    const newBreak = lastBreak + 50;
    setBreaks([...breaks, newBreak]);
    setClasses([...classes, { label: `Classe ${classes.length + 1}`, color: "#888888" }]);
  }
  function removeLast() {
    if (breaks.length <= 1) return;
    setBreaks(breaks.slice(0, -1));
    setClasses(classes.slice(0, -1));
  }
  function setLabel(i: number, v: string) {
    const next = [...classes]; next[i] = { ...next[i], label: v }; setClasses(next);
  }
  function setColor(i: number, v: string) {
    const next = [...classes]; next[i] = { ...next[i], color: v }; setClasses(next);
  }

  // Breaks must be strictly increasing — labels/colors[i] map to range (breaks[i-1], breaks[i])
  const breaksSorted = breaks.every((b, i) => i === 0 || b > breaks[i - 1]);

  async function run() {
    if (!breaksSorted) {
      setError("Os limites devem estar em ordem estritamente crescente.");
      return;
    }
    setRunning(true); setError(null); onResult(null); setResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/topo-classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          province, district, geometry: geometry ?? null,
          breaks,
          colors: classes.map(c => c.color),
          labels: classes.map(c => c.label),
          include_water: waterOn,
          water_color: waterColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      const data: TopoClassesResult = await res.json();
      setResult(data); onResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally { setRunning(false); }
  }

  const n = classes.length;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Classes Topográficas (Personalizadas)
        </h4>
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
          Defina os <strong>limites de elevação (m)</strong>. {breaks.length} limite(s) → {n} classe(s).
          Cada classe tem cor e nome editáveis.
        </div>
      </div>

      <div className="space-y-1.5">
        {classes.map((c, i) => {
          const lo = i === 0 ? null : breaks[i - 1];
          const hi = i < breaks.length ? breaks[i] : null;
          const rangeLabel =
            lo == null ? `< ${hi} m` :
            hi == null ? `≥ ${lo} m` :
            `${lo}–${hi} m`;
          return (
            <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2 py-1.5">
              <input
                type="color"
                value={c.color}
                onChange={e => setColor(i, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0"
              />
              <input
                type="text"
                value={c.label}
                onChange={e => setLabel(i, e.target.value)}
                className="flex-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-0"
              />
              <span className="text-[10px] font-mono text-slate-400 w-16 text-right shrink-0">{rangeLabel}</span>
            </div>
          );
        })}
      </div>

      <div>
        <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Limites (m)</h5>
        <div className="grid grid-cols-4 gap-1.5">
          {breaks.map((b, i) => (
            <input
              key={i}
              type="number"
              value={b}
              onChange={e => setBreakAt(i, Number(e.target.value))}
              className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={addClass}
            className="flex-1 text-xs py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800 rounded cursor-pointer">
            + Adicionar classe
          </button>
          <button onClick={removeLast} disabled={breaks.length <= 1}
            className="flex-1 text-xs py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 rounded cursor-pointer">
            − Remover última
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={waterOn} onChange={e => setWaterOn(e.target.checked)}
          className="accent-emerald-500" />
        <span className="inline-block w-3 h-3 rounded" style={{ background: waterColor }} />
        Incluir Água &amp; Rios (HydroSHEDS)
      </label>

      {!breaksSorted && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle size={11} className="inline mr-1" /> Os limites têm de ser estritamente crescentes (cada um maior que o anterior).
        </div>
      )}

      <button onClick={run} disabled={running || !breaksSorted}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200 cursor-pointer">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A classificar DEM…</>
          : <><Play size={14} /> Aplicar Classes</>}
      </button>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Distribuição (km² · %)</div>
          {result.labels.map((lbl, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: result.colors[i] }} />
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{lbl}</span>
              <span className="text-slate-400 font-mono">{result.areasKm2[i].toFixed(1)} km²</span>
              <span className="w-10 text-right font-semibold text-emerald-700 dark:text-emerald-400">{result.areasPct[i].toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface GeoAnaliseCategory {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  gradient: string;
  description: string;
  highlights: string[];
  defaultTab: SpectralTab;
  tabIds: SpectralTab[];
}

export const GEO_CATEGORIES: GeoAnaliseCategory[] = [
  {
    id: "terrain",
    title: "Relevo, Topografia & Morfologia 3D",
    subtitle: "DEM Copernicus GLO-30 · 30 m",
    badge: "DEM Copernicus 30m",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Mountain,
    gradient: "from-amber-500 to-orange-600",
    description: "Altimetria digital de alta resolução, cortes topográficos tridimensionais (A→B), curvas de nível automáticas e divisão em classes morfológicas.",
    highlights: ["Perfil Topográfico 3D (A→B)", "Curvas de Nível GEE", "Classes Morfológicas", "Hipsometria Relativa"],
    defaultTab: "elevation",
    tabIds: ["elevation", "hipsometry", "topo_class", "topo_custom", "profile", "contours"],
  },
  {
    id: "vegetation",
    title: "Vegetação, Biomassa & Agricultura",
    subtitle: "Sentinel-2 & Landsat 8 · 10–20 m",
    badge: "Sentinel-2 · 10m",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: Sprout,
    gradient: "from-emerald-500 to-green-600",
    description: "Monitoramento contínuo de vigor vegetal, densidade foliar, estimativa de biomassa e clorofila com índices multiespectrais calibrados.",
    highlights: ["NDVI (Vigor 10m)", "EVI (Alta Biomassa)", "SAVI (Ajuste Solo)", "GCI (Clorofila)", "Saúde Culturas"],
    defaultTab: "ndvi",
    tabIds: ["ndvi", "evi", "savi", "msavi", "gci", "crop_health", "ndvi_l8"],
  },
  {
    id: "water",
    title: "Recursos Hídricos & Índices de Água",
    subtitle: "SWIR / NIR · Detecção Espectral e Supressão de Sombras",
    badge: "SWIR · Água & Humidade",
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    icon: Droplets,
    gradient: "from-cyan-500 to-blue-600",
    description: "Mapeamento rigoroso da lâmina de água superficial, extração de corpos hídricos com supressão de sombras (AWEI), índices normalizados (NDWI, MNDWI), razão espectral (WRI), modelo empírico WI2015 e humidade foliar (NDMI).",
    highlights: ["NDWI (McFeeters)", "MNDWI (Xu)", "AWEI (Sem/Com Sombra)", "WRI (Razão Água)", "WI2015 (Fisher)", "NDMI (Humidade)"],
    defaultTab: "ndwi",
    tabIds: ["ndwi", "mndwi", "ndmi", "nddi", "awei_nsh", "awei_sh", "wri", "wi2015"],
  },
  {
    id: "fire",
    title: "Incêndios, Queimadas & Uso do Solo",
    subtitle: "Sentinel-2, MODIS & ESA WorldCover",
    badge: "Multi-Sensor · Fogo & Solo",
    badgeColor: "bg-rose-100 text-rose-800 border-rose-200",
    icon: Flame,
    gradient: "from-rose-500 to-red-600",
    description: "Detecção e estimativa de severidade de queimadas por dNBR (USGS), histórico de áreas queimadas MODIS, perda florestal Hansen e uso do solo ESA 10m.",
    highlights: ["dNBR Severidade Fogo", "Cicatrizes NBR", "Área Queimada MODIS", "Perda Florestal Hansen", "Uso do Solo ESA 10m"],
    defaultTab: "nbr",
    tabIds: ["nbr", "dnbr", "burn_severity", "burned_area", "forest_loss", "fire_risk", "landcover"],
  },
  {
    id: "climate",
    title: "Clima, Secas & Séries Temporais",
    subtitle: "CHIRPS (~5 km) · MODIS LST · Séries Históricas",
    badge: "Climatologia & Riscos",
    badgeColor: "bg-amber-600 text-amber-900 border-amber-300",
    icon: CloudSun,
    gradient: "from-amber-600 to-amber-700",
    description: "Análise quantitativa de secas meteorológicas e agronômicas através da correlação cruzada SPI × NDVI, precipitação CHIRPS, temperatura LST e rotas de ciclones.",
    highlights: ["Dispersão SPI × NDVI", "Precipitação Anual CHIRPS", "Temperatura Solo LST", "Rotas de Ciclones", "VHI Saúde Vegetal"],
    defaultTab: "spi_ndvi",
    tabIds: ["spi_ndvi", "precipitation", "temperature_lst", "cyclone_tracks", "cyclone_risk", "vci", "tci", "vhi", "spei"],
  },
  {
    id: "satellite",
    title: "Satélite Óptico & Mosaicos Multitemporais",
    subtitle: "Sentinel-2 Cloudless EOX · 2016–2024 (10 m)",
    badge: "Mosaicos Sentinel-2 10m",
    badgeColor: "bg-sky-100 text-sky-800 border-sky-300 font-bold",
    icon: Satellite,
    gradient: "from-sky-500 to-indigo-600",
    description: "Mosaicos anuais de alta resolução (10 m) sem nuvens do Sentinel-2 cobrindo a série 2016 a 2024 para análise de grandes transformações ambientais e de infraestruturas.",
    highlights: ["Mosaicos Sentinel-2 (2016–2024)", "Série Histórica 10m", "Ciclones Idai & Freddy", "RGB Cor Real 10 m"],
    defaultTab: "s2",
    tabIds: ["s2"],
  },
  {
    id: "urban",
    title: "Urbano, Infraestruturas & Ilhas de Calor",
    subtitle: "SWIR, NDBI & MODIS LST",
    badge: "Planeamento Urbano",
    badgeColor: "bg-stone-100 text-stone-800 border-stone-200",
    icon: Building2,
    gradient: "from-stone-600 to-slate-700",
    description: "Mapeamento da mancha urbana, superfícies impermeáveis, pressão construtiva e ilha de calor urbana (UHI) contrastando temperatura superficial e cobertura verde.",
    highlights: ["NDBI Impermeável", "NBI Expansão Urbana", "Ilha de Calor (UHI)"],
    defaultTab: "urban_expansion",
    tabIds: ["urban_expansion", "impervious_surface", "urban_heat_island"],
  },
];

export default function GeoAnalises({
  aoi, province, district, onProvinceChange, onDistrictChange, onAOIChange,
  viewMode: propViewMode, onViewModeChange,
}: GeoAnalisesProps) {
  const [internalViewMode, setInternalViewMode] = useState<"2d" | "3d">("3d");
  const viewMode = propViewMode ?? internalViewMode;
  const handleViewModeChange = onViewModeChange ?? setInternalViewMode;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");

  const [geeCredsOpen, setGeeCredsOpen] = useState(false);
  const [storyMapOpen, setStoryMapOpen] = useState(false);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const { geeConnected, geeProject } = useGeeAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab]     = useState<SpectralTab>("s2");
  const [showS2, setShowS2]           = useState(false);
  const [selectedYear, setSelectedYear] = useState("2024");
  const [compareActive, setCompareActive] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [compareLeftYear, setCompareLeftYear] = useState("2023");
  const [compareRightYear, setCompareRightYear] = useState("2024");
  const [compareMode, setCompareMode] = useState<CompareMode>("temporal_gee");
  const [compareStartDateLeft, setCompareStartDateLeft] = useState("2023-11-01");
  const [compareEndDateLeft, setCompareEndDateLeft] = useState("2023-12-31");
  const [compareStartDateRight, setCompareStartDateRight] = useState("2024-01-01");
  const [compareEndDateRight, setCompareEndDateRight] = useState(() => new Date().toISOString().split("T")[0]);
  const safeCompareLeftYear = String(Math.min(Math.max(parseInt(compareStartDateLeft.slice(0, 4) || compareLeftYear) || 2023, 2016), 2024));
  const safeCompareRightYear = String(Math.min(Math.max(parseInt(compareStartDateRight.slice(0, 4) || compareRightYear) || 2024, 2016), 2024));
  const [geeTileLeft, setGeeTileLeft] = useState<string | null>(null);
  const [geeTileRight, setGeeTileRight] = useState<string | null>(null);
  const [isProcessingCompareGee, setIsProcessingCompareGee] = useState(false);
  const [compareGeeError, setCompareGeeError] = useState<string | null>(null);
  const lastCompareKeyRef = useRef<string>("");
  const [coords2D, setCoords2D] = useState<{ lat: number; lng: number } | null>(null);
  const [elevation2D, setElevation2D] = useState<number | null>(null);
  const [hoveredProxyValue, setHoveredProxyValue] = useState<number | null>(null);
  const [geeStatus, setGeeStatus]     = useState<GeeStatus | null>(null);
  const [geeLoading, setGeeLoading]   = useState(false);
  const [geeTile, setGeeTile]         = useState<GeeResult | null>(null);
  const [geeStartDate, setGeeStartDate] = useState("2023-01-01");
  const [geeEndDate, setGeeEndDate]     = useState(() => new Date().toISOString().split("T")[0]);
  const [geeCloudPct, setGeeCloudPct]   = useState(30);

  // Sanitize activeTab against removed coastal indices
  useEffect(() => {
    const invalidTabs = ["mangrove_health", "coastal_index", "coastal_erosion", "tsunami_risk"];
    if (invalidTabs.includes(activeTab as string)) {
      setActiveTab("ndwi");
    }
  }, [activeTab]);
  const [lineamentsTile, setLineamentsTile] = useState<LineamentsResult | null>(null);
  const [targetingTile, setTargetingTile]   = useState<TargetingResult | null>(null);
  const [contoursTile, setContoursTile]     = useState<ContoursResult | null>(null);
  const [topoClassesTile, setTopoClassesTile] = useState<TopoClassesResult | null>(null);
  const [landCoverTile, setLandCoverTile]   = useState<LandCoverResult | null>(null);
  const [spiNdviResult, setSpiNdviResult]   = useState<SpiNdviResult | null>(null);
  const [spiLayerMode, setSpiLayerMode]     = useState<"spi" | "ndvi">("spi");
  const [showSpiChart, setShowSpiChart]     = useState(true);
  const [overlapResult, setOverlapResult]   = useState<OverlapResult | null>(null);
  const [rightPanelDocked, setRightPanelDocked] = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [openGroup, setOpenGroup]           = useState<string | null>(null);
  const [profilePoints, setProfilePoints]   = useState<LonLat[]>([]);
  const [profileSamples, setProfileSamples] = useState(200);
  const [profileResult, setProfileResult]   = useState<ProfileResult | null>(null);
  const [profileCursorIdx, setProfileCursorIdx] = useState<number | null>(null);
  const [profileRunning, setProfileRunning] = useState(false);
  const [profileError, setProfileError]     = useState<string | null>(null);
  const [showEdges, setShowEdges]     = useState(true);
  const [useGEE, setUseGEE]           = useState(true);
  const geeReady = Boolean((geeStatus?.connected || geeConnected) && useGEE);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [visParams, setVisParams] = useState<RasterVisParams>(DEFAULT_VIS_PARAMS);
  const [visPanelOpen, setVisPanelOpen] = useState(false);
  const [visApplying, setVisApplying] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Compute API params from AOI (includes geometry for global/custom areas)
  const apiParams = useMemo(() => aoiToAPI(aoi), [aoi]);

  const activeOverlayUrl = useMemo(() => {
    if (activeTab === "s2" && showS2) {
      return `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${selectedYear}_3857/default/g/{z}/{y}/{x}.jpg`;
    }
    if (geeTile?.tileUrl) return geeTile.tileUrl;
    if (contoursTile?.tileUrl) return contoursTile.tileUrl;
    if (topoClassesTile?.tileUrl) return topoClassesTile.tileUrl;
    if (landCoverTile?.tileUrl) return landCoverTile.tileUrl;
    if (lineamentsTile?.tileUrl) return lineamentsTile.tileUrl;
    if (targetingTile?.tileUrl) return targetingTile.tileUrl;
    if (spiNdviResult) {
      return spiLayerMode === "spi" ? spiNdviResult.spiTileUrl : spiNdviResult.ndviTileUrl;
    }
    return null;
  }, [activeTab, showS2, selectedYear, geeTile, contoursTile, topoClassesTile, landCoverTile, lineamentsTile, targetingTile, spiNdviResult, spiLayerMode]);

  const geologyGeoJSON = null;
  const isFetching = false;

  // Fetch GEE status on mount
  // ── PDF Export (universal for all analysis types) ────────────────
  async function exportGeoAnalisesPdf() {
    if (!mapContainerRef.current) return;
    const ctx = createPDFContext(`${activeTab} — ${province ?? "Moçambique"}`);
    drawCover(ctx, `Relatório de Análise — ${activeTab}`, [
      `Análise: ${activeTab}`,
      `${province ? `Província: ${province}` : "Área: Moçambique"}`,
      ctx.date,
    ]);
    try {
      // Determine tile URL from the active analysis result
      const analysisTile =
        geeTile?.tileUrl ??
        lineamentsTile?.tileUrl ??
        targetingTile?.tileUrl ??
        contoursTile?.tileUrl ??
        topoClassesTile?.tileUrl ??
        landCoverTile?.tileUrl ??
        spiNdviResult?.spiTileUrl ??
        undefined;
      const analysisLegendItems =
        activeTab === "landcover"
          ? landCoverTile?.classes?.map(c => ({ label: c.label, color: c.color }))
          : (activeTab === "topo_class" || activeTab === "topo_custom") && topoClassesTile
            ? topoClassesTile.labels?.map((label, i) => ({
                label,
                color: topoClassesTile.colors?.[i] ?? "#888",
              }))
            : undefined;
      const imgData = await fetchMapImage(
        { south: -26.9, north: -10.4, west: 30.2, east: 41 },
        { tileUrl: analysisTile,
          legendItems: analysisLegendItems,
          title: `Análise ${activeTab} — ${province ?? "Moçambique"}`, dpi: 200 },
      );
      addMapImage(ctx, imgData, 100);
    } catch (e) {
      console.warn("Map fetch failed:", e);
    }
    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_Analises_${activeTab}_${province ?? "MZ"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const checkGee = useCallback(async () => {
    setGeeLoading(true);
    try {
      const res = await apiFetch("/geomoz-api/gee/status");
      const data: GeeStatus = await res.json();
      setGeeStatus(data);

    } catch {
      setGeeStatus({ connected: false, auth_type: null, project: null, message: "API indisponível", indices: [] });

    } finally {
      setGeeLoading(false);
    }
  }, []);

  useEffect(() => { checkGee(); if(geeConnected) setGeeCredsOpen(false); }, [checkGee, geeConnected]);

  // Enable GEE mode when user has active GEE connection, or fallback to proxy if disconnected
  useEffect(() => {
    if (geeConnected) {
      setUseGEE(true);
      if (!geeStatus?.connected) {
        setGeeStatus((prev) => ({
          connected: true,
          project: geeProject || prev?.project || "geoprocessamento-426809",
          auth_type: prev?.auth_type || "oauth2",
          message: "Conectado via Quota de Utilizador",
          indices: prev?.indices || [],
        }));
      }
    } else if (geeStatus && !geeStatus.connected) {
      setUseGEE(false);
    }
  }, [geeStatus, geeConnected, geeProject]);

  // Clear GEE tiles when switching index
  useEffect(() => {
    setGeeTile(null);
    setLineamentsTile(null);
    setTargetingTile(null);
    if (activeTab !== "contours") setContoursTile(null);
    if (activeTab !== "topo_custom") setTopoClassesTile(null);
    if (activeTab !== "landcover") setLandCoverTile(null);
    if (activeTab !== "spi_ndvi") setSpiNdviResult(null);
    if (activeTab !== "targeting") setOverlapResult(null);
    if (activeTab !== "profile") {
      setProfileError(null);
      setProfileCursorIdx(null);
    }
  }, [activeTab]);

  const runCompareGee = useCallback(async () => {
    if (!geeReady) {
      setCompareGeeError("Google Earth Engine não conectado. Ligue a sua conta Google no topo.");
      toast({
        title: "Google Earth Engine não conectado",
        description: "Ligue a sua conta Google no topo para processar análises bi-temporais GEE. Pode também usar a comparação ótica Sentinel-2.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingCompareGee(true);
    setCompareGeeError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const aoiPayload = aoiToAPI(aoi);
      const targetIndex =
        activeTab === "s2" || activeTab === "lineaments" || activeTab === "targeting" || activeTab === "profile" || activeTab === "contours" || activeTab === "topo_custom" || activeTab === "landcover" || activeTab === "spi_ndvi"
          ? "ndvi"
          : activeTab;

      const [resLeft, resRight] = await Promise.all([
        apiFetch("/geomoz-api/gee/index", {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: targetIndex,
            province: province || null,
            district: district || null,
            geometry: aoiPayload.geometry ?? null,
            start_date: compareStartDateLeft,
            end_date: compareEndDateLeft,
            cloud_pct: 30,
          }),
        }),
        apiFetch("/geomoz-api/gee/index", {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: targetIndex,
            province: province || null,
            district: district || null,
            geometry: aoiPayload.geometry ?? null,
            start_date: compareStartDateRight,
            end_date: compareEndDateRight,
            cloud_pct: 30,
          }),
        }),
      ]);

      if (!resLeft.ok) {
        const err = await resLeft.json().catch(() => ({ detail: resLeft.statusText }));
        throw new Error(`Erro no período 1 (${compareStartDateLeft.slice(0, 4)}): ${err.detail || "Falha GEE"}`);
      }
      if (!resRight.ok) {
        const err = await resRight.json().catch(() => ({ detail: resRight.statusText }));
        throw new Error(`Erro no período 2 (${compareStartDateRight.slice(0, 4)}): ${err.detail || "Falha GEE"}`);
      }

      const [dataLeft, dataRight] = await Promise.all([resLeft.json(), resRight.json()]);
      const leftUrl = dataLeft.tileUrl || dataLeft.tile_url || null;
      const rightUrl = dataRight.tileUrl || dataRight.tile_url || null;

      if (!leftUrl || !rightUrl) {
        throw new Error("O Google Earth Engine não retornou as URLs de mosaico esperadas.");
      }

      setGeeTileLeft(leftUrl);
      setGeeTileRight(rightUrl);
      setCompareGeeError(null);
      toast({
        title: "Comparação GEE Calculada",
        description: `Mosaicos de ${targetIndex.toUpperCase()} gerados para ${compareStartDateLeft.slice(0, 4)} vs ${compareStartDateRight.slice(0, 4)}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? (err.name === "AbortError" ? "Tempo limite excedido ao contactar o GEE (timeout 35s)." : err.message) : String(err);
      setCompareGeeError(msg);
      console.error("Erro ao comparar períodos GEE:", err);
      toast({
        title: "Erro na Comparação GEE",
        description: msg,
        variant: "destructive",
      });
    } finally {
      clearTimeout(timeoutId);
      setIsProcessingCompareGee(false);
    }
  }, [geeReady, activeTab, province, district, aoi, compareStartDateLeft, compareEndDateLeft, compareStartDateRight, compareEndDateRight, toast]);

  // Trigger comparison without infinite loop
  useEffect(() => {
    if (!compareActive) {
      lastCompareKeyRef.current = "";
      return;
    }
    if (compareMode !== "temporal_gee") return;

    if (!geeReady) {
      if (lastCompareKeyRef.current !== "unconnected_fallback") {
        lastCompareKeyRef.current = "unconnected_fallback";
        if (geeTile?.tileUrl || activeOverlayUrl) {
          setCompareMode("analysis_vs_satellite");
        } else {
          setCompareMode("s2_temporal");
        }
        toast({
          title: "Modo Comparação Ativo",
          description: "GEE não autenticado. A comparar via Sentinel-2 (2023 ⟷ Recente). Para bi-temporal GEE, ligue a conta Google no topo.",
        });
      }
      return;
    }

    const currentKey = `${activeTab}_${province || ""}_${district || ""}_${compareStartDateLeft}_${compareEndDateLeft}_${compareStartDateRight}_${compareEndDateRight}`;
    if (lastCompareKeyRef.current !== currentKey && !isProcessingCompareGee) {
      lastCompareKeyRef.current = currentKey;
      runCompareGee();
    }
  }, [
    compareActive,
    compareMode,
    geeReady,
    activeTab,
    province,
    district,
    compareStartDateLeft,
    compareEndDateLeft,
    compareStartDateRight,
    compareEndDateRight,
    isProcessingCompareGee,
    runCompareGee,
    geeTile,
    activeOverlayUrl,
    toast,
  ]);

  const runProfile = useCallback(async () => {
    if (profilePoints.length < 2) return;
    setProfileRunning(true); setProfileError(null); setProfileResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: profilePoints, samples: profileSamples }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE");
      }
      setProfileResult(await res.json());
    } catch (e) {
      setProfileError(String(e instanceof Error ? e.message : e));
    } finally { setProfileRunning(false); }
  }, [profilePoints, profileSamples]);

  // Synthetic spectral overlay disabled for data security
  const spectralGeoJSON = null;

  const activeDef = INDEX_DEFS.find(d => d.id === activeTab);
  // Parse available bands from the active index definition
  const activeDefBands = activeDef?.bands ? activeDef.bands.split(/[·,]/).map(b => b.trim()).filter(Boolean) : [];
  const isComposite   = false;
  void isComposite;
  const isLineaments  = activeTab === "lineaments";
  const isTargeting   = activeTab === "targeting";
  const isProfile     = activeTab === "profile";
  const isContours    = activeTab === "contours";
  const isTopoCustom  = activeTab === "topo_custom";
  const isLandCover   = activeTab === "landcover";
  const isSpiNdvi     = activeTab === "spi_ndvi";

  const isTerrain     = activeDef?.group === "terrain";
  const isGeeOnly     = (activeDef && GEE_ONLY_INDICES.includes(activeDef.id))
                        || isProfile || isContours || isLandCover
                        || isSpiNdvi;
  const isTopoClass   = activeTab === "topo_class";
  const spectralKey = `spectral-${activeTab}-${province}-${district}`;
  const geeTileKey  = `gee-${activeTab}-${geeTile?.tileUrl ?? ""}`;

  const [isCalculatingActiveIndex, setIsCalculatingActiveIndex] = useState(false);
  const [activeIndexError, setActiveIndexError] = useState<string | null>(null);

  const activeIndexLabel = activeDef?.short || activeDef?.label || (
    activeTab === "s2" ? "S-2 Cloudless" :
    activeTab === "lineaments" ? "Lineamentos" :
    activeTab === "targeting" ? "Targeting" :
    activeTab === "profile" ? "Perfil A→B" :
    activeTab === "contours" ? "Curvas Nível" :
    activeTab === "topo_custom" ? "Classes Custom" :
    activeTab === "landcover" ? "Cobertura Solo" :
    activeTab === "spi_ndvi" ? "SPI × NDVI" :
    activeTab
  );

  const hasActiveResult = Boolean(
    (geeTile && activeDef && !isLineaments && !isProfile && !isContours && !isTopoCustom && !isLandCover && !isTargeting && !isSpiNdvi) ||
    (isLineaments && lineamentsTile) ||
    (isContours && contoursTile) ||
    (isTopoCustom && topoClassesTile) ||
    (isLandCover && landCoverTile) ||
    (isTargeting && targetingTile) ||
    (isProfile && profileResult) ||
    (isSpiNdvi && spiNdviResult) ||
    (activeTab === "s2" && showS2)
  );

  const handleCalculateActiveIndex = async () => {
    setIsCalculatingActiveIndex(true);
    setActiveIndexError(null);
    try {
      if (activeDef && !isLineaments && !isProfile && !isContours && !isTopoCustom && !isLandCover && !isTargeting && !isSpiNdvi && activeTab !== "s2") {
        setGeeTile(null);
        const res = await apiFetch("/geomoz-api/gee/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            index: activeTab,
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            start_date: geeStartDate,
            end_date: geeEndDate,
            cloud_pct: geeCloudPct,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }));
          throw new Error(err.detail ?? "Erro GEE desconhecido");
        }
        const data: GeeResult = await res.json();
        setGeeTile(data);
        setUseGEE(true);
      } else if (isLineaments) {
        setLineamentsTile(null);
        const res = await apiFetch("/geomoz-api/gee/lineaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            sigma: 1.0,
            threshold: 0.1,
            min_len_m: 500,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao calcular lineamentos");
        setLineamentsTile(await res.json());
      } else if (isContours) {
        setContoursTile(null);
        const res = await apiFetch("/geomoz-api/gee/contours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            interval_m: 50,
            index_interval_m: 250,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao calcular curvas de nível");
        setContoursTile(await res.json());
      } else if (isTopoCustom) {
        setTopoClassesTile(null);
        const res = await apiFetch("/geomoz-api/gee/topo-classes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao classificar relevo");
        setTopoClassesTile(await res.json());
      } else if (isLandCover) {
        setLandCoverTile(null);
        const res = await apiFetch("/geomoz-api/gee/landcover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            year: 2021,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao calcular cobertura do solo");
        setLandCoverTile(await res.json());
      } else if (isTargeting) {
        setTargetingTile(null);
        const res = await apiFetch("/geomoz-api/gee/targeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            mineral_type: "gold",
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao calcular alvo mineral");
        setTargetingTile(await res.json());
      } else if (isProfile) {
        if (profilePoints.length >= 2) {
          await runProfile();
        } else {
          toast({
            title: "Traçado do perfil necessário",
            description: "Clique em 2 ou mais pontos no mapa para traçar a linha A→B antes de calcular.",
          });
        }
      } else if (isSpiNdvi) {
        setSpiNdviResult(null);
        const res = await apiFetch("/geomoz-api/gee/spi-ndvi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            province: province || null,
            district: district || null,
            geometry: apiParams.geometry ?? null,
            year: 2023,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Erro ao calcular SPI × NDVI");
        setSpiNdviResult(await res.json());
      } else if (activeTab === "s2") {
        setShowS2(true);
      }
    } catch (err: any) {
      console.error("Calculate index error:", err);
      setActiveIndexError(err?.message || "Erro ao calcular índice.");
    } finally {
      setIsCalculatingActiveIndex(false);
    }
  };

  const activeAnalysisContext: AnalysisContext | null = useMemo(() => {
    if (activeTab === "s2" || showS2) {
      return {
        label: `Sentinel-2 Óptico (${selectedYear})`,
        category: "Satélite Óptico",
        classLabel: "RGB Natural",
      };
    }
    if (isLineaments) {
      return {
        label: "Lineamentos Estruturais (SRTM/GLO-30)",
        category: "Relevo & Estruturas",
        classLabel: lineamentsTile ? `${lineamentsTile.sampleCount || 0} amostras` : undefined,
      };
    }
    if (isContours) {
      return {
        label: `Curvas de Nível (${contoursTile?.intervalM ?? 20} m)`,
        category: "Topografia",
        classLabel: "Isolinhas DEM",
      };
    }
    if (isProfile) {
      return {
        label: "Perfil Topográfico 3D (A→B)",
        category: "Morfologia",
        classLabel: "Corte Altimétrico",
      };
    }
    if (isTargeting) {
      return {
        label: `Targeting Mineral: ${targetingTile?.mineralName ?? "Multi-critério"}`,
        category: "Prospeção Mineral",
        classLabel: "Favorabilidade",
      };
    }
    if (isLandCover) {
      return {
        label: "Cobertura do Solo (ESA WorldCover)",
        category: "Uso do Solo",
        classLabel: "10 m Global",
      };
    }
    if (activeDef) {
      return {
        label: activeDef.label,
        category: selectedCategory ?? "GeoAnálise",
        classLabel: activeDef.short,
        value: hoveredProxyValue !== null ? Number(hoveredProxyValue.toFixed(2)) : undefined,
      };
    }
    return null;
  }, [
    activeDef,
    activeTab,
    showS2,
    selectedYear,
    isLineaments,
    lineamentsTile,
    isContours,
    contoursTile,
    isProfile,
    isTargeting,
    targetingTile,
    isLandCover,
    selectedCategory,
    hoveredProxyValue,
  ]);

  // Tabs grouped by category — rendered below with section labels
  const tabGroups: { name: string; badge: string; badgeColor: string; tabs: { id: string; label: string; icon: React.ReactNode }[] }[] = [
    { name: "Mosaico Óptico",         badge: "Sentinel-2 · EOX",    badgeColor: "bg-sky-100 text-sky-700",
      tabs: [{ id: "s2", label: "S-2 Cloudless", icon: <Satellite size={13} /> }] },
    { name: "Vegetação & Solo",        badge: "Sentinel-2 · 10–20 m", badgeColor: "bg-emerald-100 text-emerald-700",
      tabs: INDEX_DEFS.filter(d => d.group === "spectral").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Landsat 8",              badge: "Landsat · 30 m",       badgeColor: "bg-orange-100 text-orange-700",
      tabs: INDEX_DEFS.filter(d => d.group === "landsat").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Relevo & Morfologia",    badge: "DEM GLO-30 · 30 m",   badgeColor: "bg-amber-100 text-amber-700",
      tabs: [
        ...INDEX_DEFS.filter(d => d.group === "terrain").map(d => ({ id: d.id, label: d.short, icon: d.icon })),
        { id: "topo_custom", label: "Classes Custom", icon: <Sliders size={13} /> },
        { id: "profile",     label: "Perfil A→B",     icon: <Route size={13} /> },
        { id: "contours",    label: "Curvas Nível",   icon: <Waves size={13} /> },
      ]},
    { name: "Uso & Cobertura",        badge: "ESA WorldCover · 10 m", badgeColor: "bg-lime-100 text-lime-700",
      tabs: [{ id: "landcover", label: "Cobertura do Solo", icon: <Sprout size={13} /> }] },
    { name: "Agricultura",              badge: "Sentinel-2 · 10–20 m",  badgeColor: "bg-green-100 text-green-700",
      tabs: [
        ...INDEX_DEFS.filter(d => d.group === "agriculture").map(d => ({ id: d.id, label: d.short, icon: d.icon })),
      ]},
    { name: "Seca & Stress Hídrico",    badge: "Sentinel-2 · 10–20 m",  badgeColor: "bg-orange-100 text-orange-700",
      tabs: [
        ...INDEX_DEFS.filter(d => d.group === "drought").map(d => ({ id: d.id, label: d.short, icon: d.icon })),
        { id: "spi_ndvi", label: "SPI × NDVI", icon: <Droplets size={13} /> },
      ]},
    { name: "Incêndios & Desflorestação", badge: "Multi-sensor",          badgeColor: "bg-red-100 text-red-700",
      tabs: INDEX_DEFS.filter(d => d.group === "fire").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Recursos Hídricos & Índices de Água",  badge: "Sentinel-2 · SWIR/NIR", badgeColor: "bg-cyan-100 text-cyan-700",
      tabs: INDEX_DEFS.filter(d => d.group === "water").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Clima & Desastres",          badge: "Multi-sensor",          badgeColor: "bg-violet-100 text-violet-700",
      tabs: INDEX_DEFS.filter(d => d.group === "climate").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Urbano & Infraestruturas",    badge: "Multi-sensor",          badgeColor: "bg-stone-100 text-stone-700",
      tabs: INDEX_DEFS.filter(d => d.group === "urban").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Saúde Pública",                badge: "Multi-sensor",          badgeColor: "bg-rose-100 text-rose-700",
      tabs: INDEX_DEFS.filter(d => d.group === "health").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
    { name: "Biofísicos",                  badge: "Multi-sensor · L8/S2", badgeColor: "bg-emerald-100 text-emerald-700",
      tabs: INDEX_DEFS.filter(d => d.group === "biophysical").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },

  ];

  // Keep the accordion group of the active analysis expanded.
  useEffect(() => {
    const g = tabGroups.find(grp => grp.tabs.some(t => t.id === activeTab));
    if (g) setOpenGroup(g.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const activeCategory = useMemo(() => {
    if (selectedCategory) {
      const found = GEO_CATEGORIES.find(c => c.id === selectedCategory);
      if (found) return found;
    }
    return GEO_CATEGORIES.find(c => c.tabIds.includes(activeTab)) || GEO_CATEGORIES[0];
  }, [selectedCategory, activeTab]);

  const filteredCategories = useMemo(() => {
    if (!categoryFilter.trim()) return GEO_CATEGORIES;
    const q = categoryFilter.toLowerCase();
    return GEO_CATEGORIES.filter(cat =>
      cat.title.toLowerCase().includes(q) ||
      cat.subtitle.toLowerCase().includes(q) ||
      cat.description.toLowerCase().includes(q) ||
      cat.highlights.some(h => h.toLowerCase().includes(q)) ||
      cat.tabIds.some(t => {
        const def = INDEX_DEFS.find(d => d.id === t);
        return t.toLowerCase().includes(q) || (def && (def.label.toLowerCase().includes(q) || def.short.toLowerCase().includes(q)));
      })
    );
  }, [categoryFilter]);

  const dynamicStoryMapContext = useMemo<DynamicAnalysisContext>(() => {
    return {
      analysisId: activeTab,
      analysisTitle: activeDef?.label || activeIndexLabel,
      analysisSubtitle: activeDef?.short || activeDef?.group,
      category: activeCategory?.title || activeDef?.group,
      province: province,
      district: district,
      aoiLabel: aoi?.label || (district ? `${district}, ${province}` : province || "Moçambique"),
      source: activeDef?.group === "landsat" ? "Landsat-8/9 OLI" : "Sentinel-2 MSI (Copernicus)",
      dateRange: geeTile?.dateRange || `${geeStartDate} a ${geeEndDate}`,
      cloudPct: geeCloudPct,
      formula: activeDef?.formula,
      bands: activeDef?.bands,
      interpretation: activeDef?.interpretation,
      stats: geeTile?.stats ? {
        min: geeTile.stats.min,
        max: geeTile.stats.max,
        mean: geeTile.stats.mean,
        median: geeTile.stats.median,
        stdDev: geeTile.stats.stdDev,
        p10: geeTile.stats.p10,
        p90: geeTile.stats.p90,
        p95: geeTile.stats.p95,
        areaKm2: geeTile.stats.areaKm2,
        sampleCount: geeTile.stats.sampleCount,
      } : undefined,
    };
  }, [activeTab, activeDef, activeIndexLabel, activeCategory, province, district, aoi, geeTile, geeStartDate, geeEndDate, geeCloudPct]);

  // Composite, lineaments, targeting & GEE-only indices require GEE
  const requiresGee = isLineaments || isTargeting || isProfile || isContours || isTopoCustom || isLandCover || isSpiNdvi || isGeeOnly;
  void requiresGee;
  /** Re-render the GEE tile with custom visParams. */
  const handleApplyVis = useCallback(async (newParams: RasterVisParams) => {
    if (!geeTile) return;
    setVisApplying(true);
    setVisParams(newParams);
    const def = INDEX_DEFS.find(d => d.id === activeTab);
    try {
      const res = await apiFetch("/geomoz-api/gee/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: activeTab,
          province, district,
          geometry: apiParams?.geometry ?? null,
          vis_params: {
            bands: newParams.bands.filter(Boolean),
            min: newParams.min,
            max: newParams.max,
            gamma: newParams.gamma,
            opacity: newParams.opacity,
            palette: newParams.mode === "grayscale" ? [] : undefined,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.tileUrl) {
          setGeeTile(prev => prev ? { ...prev, tileUrl: data.tileUrl } : null);
        }
      }
    } catch (_e) { /* silent */ }
    finally { setVisApplying(false); }
  }, [geeTile, activeTab, province, district, apiParams]);

  /** Import current visParams into the panel. */
  const handleImportVis = useCallback((newParams: RasterVisParams) => {
    setVisParams(newParams);
  }, []);

  const handleLiveCssChange = useCallback((partial: Partial<RasterVisParams>) => {
    setVisParams(prev => ({ ...prev, ...partial }));
  }, []);

  const profileCursorLatLon = (isProfile && profileResult && profileCursorIdx != null
    && profileCursorIdx >= 0 && profileCursorIdx < profileResult.points.length)
    ? profileResult.points[profileCursorIdx]
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <GeeCredentialsDialog open={geeCredsOpen} onOpenChange={setGeeCredsOpen} />
      <StoryMapModal
        open={storyMapOpen}
        onOpenChange={setStoryMapOpen}
        context={dynamicStoryMapContext}
      />
      {selectedCategory === null ? (
        /* ════════════════════════════════════════════════════════════════════
           CATALOG VIEW (Cards Persuasivos e Modernos)
           ════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50 dark:bg-slate-950">

          {/* Catalog Content */}
          <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-sky-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-md relative overflow-hidden">
              <div className="relative z-10 max-w-xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-semibold mb-2 border border-sky-400/30">
                  <Sparkles size={11} /> Módulos Analíticos Dedicados
                </div>
                <h2 className="text-lg font-bold text-white mb-1">
                  Selecione uma especialidade analítica
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Cada ambiente de trabalho é isolado e focado: camadas espectrais dedicadas, controles sob medida e projeção tridimensional DEM 30m em tempo real.
                </p>

                {/* Multitemporal Quick Access Banner Buttons */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/15">
                  <span className="text-[11px] text-sky-200 font-semibold flex items-center gap-1 mr-1">
                    <Satellite size={12} className="text-sky-300" /> Acesso Rápido:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("satellite");
                      setActiveTab("s2");
                      setShowS2(true);
                      setCompareActive(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <Satellite size={12} />
                    <span>Mosaicos Sentinel-2 (2016–2024)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("satellite");
                      setActiveTab("s2");
                      setCompareActive(true);
                      setShowS2(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <Columns2 size={12} />
                    <span>Comparador Split-Screen (Antes / Depois)</span>
                  </button>
                </div>
              </div>

              <div className="relative z-10 w-full sm:w-72">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    placeholder="Filtrar especialidade ou índice…"
                    className="w-full pl-9 pr-3 py-2 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all"
                  />
                  {categoryFilter && (
                    <button onClick={() => setCategoryFilter("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredCategories.map(cat => {
                const IconComponent = cat.icon;
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setActiveTab(cat.defaultTab);
                      if (cat.id === "optical" || cat.id === "satellite") {
                        setShowS2(true);
                      }
                    }}
                    className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-xl transition-all duration-200 p-5 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3.5">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform`}>
                          <IconComponent size={20} />
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cat.badgeColor}`}>
                          {cat.badge}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium mb-2.5">
                        {cat.subtitle}
                      </p>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 line-clamp-3">
                        {cat.description}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {cat.highlights.map((h, i) => (
                          <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300">
                      <span>Abrir Análise Especializada</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           DEDICATED CATEGORY WORKSPACE (Ambiente Especializado)
           ════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Workspace Top Header Bar */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-between gap-2 shrink-0 z-[550]">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-400 bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-sky-200 dark:hover:border-sky-600 px-3 py-1.5 rounded-xl transition-all shrink-0 shadow-2xs cursor-pointer"
                title="Voltar ao catálogo de especialidades"
              >
                <ArrowLeft size={13} />
                <span>Voltar ao Catálogo</span>
              </button>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${activeCategory.gradient} flex items-center justify-center text-white shrink-0 shadow-2xs`}>
                  <activeCategory.icon size={14} />
                </div>
                <div className="min-w-0 hidden lg:block">
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{activeCategory.title}</h2>
                  <span className="text-[10px] text-slate-400 truncate block">{activeCategory.badge}</span>
                </div>
              </div>
            </div>

            {/* Subtabs for only this category */}
            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto px-2 py-0.5 no-scrollbar">
              {activeCategory.tabIds.map(tabId => {
                const def = INDEX_DEFS.find(d => d.id === tabId);
                const label = def?.short || (tabId === "s2" ? "S-2 Cloudless" : tabId === "lineaments" ? "Lineamentos" : tabId === "targeting" ? "Targeting" : tabId === "profile" ? "Perfil A→B" : tabId === "contours" ? "Curvas Nível" : tabId === "topo_custom" ? "Classes Custom" : tabId === "landcover" ? "Cobertura Solo" : tabId === "spi_ndvi" ? "SPI × NDVI" : tabId);
                const icon = def?.icon || (tabId === "s2" ? <Satellite size={12} /> : tabId === "lineaments" ? <Activity size={12} /> : tabId === "targeting" ? <Target size={12} /> : tabId === "profile" ? <Route size={12} /> : tabId === "contours" ? <Waves size={12} /> : tabId === "topo_custom" ? <Sliders size={12} /> : tabId === "landcover" ? <Sprout size={12} /> : <Droplets size={12} />);
                const isActive = activeTab === tabId;

                return (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-sky-500 text-white shadow-xs font-semibold"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
                    }`}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Right Header Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => setStoryMapOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-semibold shadow-2xs cursor-pointer transition-all"
                title="Apresentação Executiva (StoryMap)"
              >
                <Sparkles size={13} className="text-sky-500" />
                <span className="hidden sm:inline">Apresentação Executiva</span>
                <span className="sm:hidden">StoryMap</span>
              </button>

              <button
                onClick={exportGeoAnalisesPdf}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium shadow-2xs cursor-pointer"
                title="Exportar Relatório PDF"
              >
                <FileDown size={13} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>

          {/* Main workspace content */}
          <div className="flex flex-1 overflow-hidden relative">
            {/* Mobile backdrop */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[650] md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Desktop Sidebar Toggle Button */}
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen(v => !v)}
              style={{ left: desktopSidebarOpen ? "18rem" : "0px" }}
              title={desktopSidebarOpen ? "Recolher painel lateral" : "Expandir painel lateral"}
              className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-800 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer"
            >
              {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>

            {/* Controls sidebar */}
            <div
              className={`fixed md:relative inset-y-0 left-0 z-[700] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 transition-all duration-300 shadow-xl md:shadow-none ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
              } ${
                desktopSidebarOpen ? "md:w-72 overflow-y-auto" : "md:w-0 overflow-hidden md:border-r-0"
              }`}
            >
              {/* Mobile Header with Close Button */}
              <div className="md:hidden px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-sky-500" />
                  Filtros & Parâmetros
                </span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Area filter — AOI global & Parâmetros GEE */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Área de Estudo</h4>
                  <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
                </div>

                {/* Parâmetros Temporais & GEE definidos logo na Área de Estudo */}
                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Parâmetros GEE
                    </h5>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      S-2 / L8
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Data início</label>
                      <input
                        type="date"
                        value={geeStartDate}
                        onChange={e => setGeeStartDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Data fim</label>
                      <input
                        type="date"
                        value={geeEndDate}
                        onChange={e => setGeeEndDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                      <span>Cobertura de nuvens máx:</span>
                      <strong className="text-slate-700 dark:text-slate-200">{geeCloudPct}%</strong>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      value={geeCloudPct}
                      onChange={e => setGeeCloudPct(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                  </div>

                  {/* Botão Recalcular Análise com o período selecionado */}
                  <button
                    type="button"
                    onClick={handleCalculateActiveIndex}
                    disabled={isCalculatingActiveIndex}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                    title={`Recalcular análise para o período ${geeStartDate} a ${geeEndDate}`}
                  >
                    {isCalculatingActiveIndex ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>A recalcular período...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} />
                        <span>Recalcular Análise ({geeStartDate} a {geeEndDate})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Category subtabs list */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Índices da Categoria
                </h4>
                <div className="space-y-1">
                  {activeCategory.tabIds.map(tabId => {
                    const def = INDEX_DEFS.find(d => d.id === tabId);
                    const label = def?.short || (tabId === "s2" ? "S-2 Cloudless" : tabId === "lineaments" ? "Lineamentos" : tabId === "targeting" ? "Targeting" : tabId === "profile" ? "Perfil A→B" : tabId === "contours" ? "Curvas Nível" : tabId === "topo_custom" ? "Classes Custom" : tabId === "landcover" ? "Cobertura Solo" : tabId === "spi_ndvi" ? "SPI × NDVI" : tabId);
                    const icon = def?.icon || (tabId === "s2" ? <Satellite size={13} /> : tabId === "lineaments" ? <Activity size={13} /> : tabId === "targeting" ? <Target size={13} /> : tabId === "profile" ? <Route size={13} /> : tabId === "contours" ? <Waves size={13} /> : tabId === "topo_custom" ? <Sliders size={13} /> : tabId === "landcover" ? <Sprout size={13} /> : <Droplets size={13} />);
                    const isActive = activeTab === tabId;
                    return (
                      <button
                        key={tabId}
                        onClick={() => setActiveTab(tabId)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                          isActive
                            ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {icon}
                          <span className="truncate">{label}</span>
                        </div>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* GEE status / real vs proxy switch */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">Modo GEE</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    geeReady ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}>
                    {geeReady ? "Ativo" : "Proxy"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">{useGEE ? "Real" : "Proxy"}</span>
                  <button
                    onClick={() => { setUseGEE(v => !v); setGeeTile(null); }}
                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors cursor-pointer ${useGEE ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700"}`}
                    title={useGEE ? "Mudar para modo proxy" : "Mudar para modo GEE real"}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${useGEE ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>

              {/* Botão Calcular Índice no Sidebar */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
                <button
                  type="button"
                  onClick={handleCalculateActiveIndex}
                  disabled={isCalculatingActiveIndex}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 disabled:from-slate-300 dark:disabled:from-slate-700 disabled:to-slate-400 dark:disabled:to-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-500/20 active:scale-[0.98] cursor-pointer"
                >
                  {isCalculatingActiveIndex ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>A processar no GEE...</span>
                    </>
                  ) : hasActiveResult ? (
                    <>
                      <RefreshCw size={14} />
                      <span>Recalcular {activeIndexLabel} com Sentinel-2</span>
                    </>
                  ) : (
                    <>
                      <Play size={14} className="fill-white" />
                      <span>Calcular {activeIndexLabel} com Sentinel-2</span>
                    </>
                  )}
                </button>

                {hasActiveResult && (
                  <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <span className="flex items-center gap-1 font-medium">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      Resultado Ativo
                    </span>
                    <span className="text-[10px] text-slate-400">GEE 24h</span>
                  </div>
                )}

                {activeIndexError && (
                  <div className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg border border-rose-200 dark:border-rose-800 leading-tight">
                    <strong>Erro:</strong> {activeIndexError}
                  </div>
                )}
              </div>

              {/* Legenda do Índice Selecionado na Sidebar */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Legenda
                  </h4>
                  <span className="text-[9px] text-slate-400 truncate max-w-[120px]">
                    {activeIndexLabel}
                  </span>
                </div>
                <IndexLegendView
                  activeTab={activeTab}
                  activeDef={activeDef}
                  topoClassesTile={topoClassesTile}
                  contoursTile={contoursTile}
                  lineamentsTile={lineamentsTile}
                  targetingTile={targetingTile}
                  spiNdviResult={spiNdviResult}
                  spiLayerMode={spiLayerMode}
                  geeReady={geeReady}
                />
              </div>
            </div>

        {/* Draggable Results Panel */}
        {((activeDef || isComposite || isLineaments || isTargeting || isProfile || isContours || isTopoCustom || isLandCover || isSpiNdvi || activeTab === "s2")) && (
          <DraggablePanel
            title={`Análise: ${activeDef?.label || (isLineaments ? "Lineamentos" : isProfile ? "Perfil Topográfico" : isTargeting ? "Alvo Mineral" : isSpiNdvi ? "SPI×NDVI" : isContours ? "Curvas de Nível" : isTopoCustom ? "Classes Topo" : isLandCover ? "Cobertura do Solo" : "Resultados")}`}
            icon={<Activity size={16} className="text-sky-500" />}
            isDocked={rightPanelDocked}
            onDockToggle={() => setRightPanelDocked(d => !d)}
            defaultWidth={360}
            className="right-4"
          >
            <div className="flex flex-col w-full bg-white/50 dark:bg-slate-900/50 space-y-4 pb-4">
          {/* Lineaments Panel */}
          {isLineaments && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Detecção estrutural requer DEM via Google Earth Engine.
                </div>
              ) : (
                <>
                  <LineamentsPanel province={province} district={district} geometry={apiParams.geometry} onResult={setLineamentsTile} />
                  {lineamentsTile && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                        <input type="checkbox" checked={showEdges}
                          onChange={e => setShowEdges(e.target.checked)}
                          className="accent-fuchsia-500" />
                        Mostrar linhas (edges)
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Profile Panel */}
          {isProfile && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Amostragem do DEM requer Google Earth Engine.
                </div>
              ) : (
                <ProfilePanel
                  points={profilePoints}
                  samples={profileSamples}
                  onSamplesChange={setProfileSamples}
                  onReset={() => { setProfilePoints([]); setProfileResult(null); setProfileError(null); }}
                  onRun={runProfile}
                  running={profileRunning}
                  error={profileError}
                  result={profileResult}
                />
              )}
            </div>
          )}

          {/* Custom Topo Classes Panel */}
          {isTopoCustom && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Classificação topográfica usa o DEM Copernicus via Google Earth Engine.
                </div>
              ) : (
                <TopoClassesPanel province={province} district={district} geometry={apiParams.geometry} onResult={setTopoClassesTile} />
              )}
            </div>
          )}

          {/* Contours Panel */}
          {isContours && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Curvas de nível requerem DEM via Google Earth Engine.
                </div>
              ) : (
                <ContoursPanel province={province} district={district} geometry={apiParams.geometry} onResult={setContoursTile} />
              )}
            </div>
          )}

          {/* Targeting Panel */}
          {isTargeting && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Targeting requer Sentinel-2 + DEM via GEE.
                </div>
              ) : (
                <TargetingPanel province={province} district={district} geometry={apiParams.geometry} onResult={setTargetingTile} onOverlap={setOverlapResult} />
              )}
            </div>
          )}

          {/* SPI × NDVI Panel */}
          {isSpiNdvi && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> SPI×NDVI usa CHIRPS + MODIS via Google Earth Engine.
                </div>
              ) : (
                <>
                  <SpiNdviPanel province={province} district={district} geometry={apiParams.geometry} onResult={r => { setSpiNdviResult(r); setShowSpiChart(true); }} />
                  {spiNdviResult && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Camada no mapa</h5>
                      <div className="flex gap-1.5">
                        {(["spi", "ndvi"] as const).map(m => (
                          <button key={m} onClick={() => setSpiLayerMode(m)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                              spiLayerMode === m
                                ? "bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-semibold"
                                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                            }`}>
                            {m === "spi" ? "SPI (seca)" : "NDVI (vegetação)"}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300 pt-1">
                        <input type="checkbox" checked={showSpiChart}
                          onChange={e => setShowSpiChart(e.target.checked)}
                          className="accent-orange-500" />
                        Mostrar gráfico de correlação
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Land Cover Panel */}
          {isLandCover && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  <strong>GEE necessário.</strong> Cobertura do solo usa o ESA WorldCover via Google Earth Engine.
                </div>
              ) : (
                <LandCoverPanel province={province} district={district} geometry={apiParams.geometry} onResult={setLandCoverTile} />
              )}
            </div>
          )}

          {/* GEE Analysis Panel (real mode, single index) */}
          {/* GEE Geospatial Analytics Dashboard Panel (real mode, single index) */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && geeReady && activeTab !== "s2" && activeDef && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <GeospatialAnalyticsPanel
                activeIndex={activeTab as SpectralIndex}
                province={province}
                district={district}
                geometry={apiParams.geometry}
                geeStatus={geeStatus!}
                result={geeTile}
                isCalculating={isCalculatingActiveIndex}
                startDate={geeStartDate}
                endDate={geeEndDate}
                cloudPct={geeCloudPct}
                onOpenCompare={() => {
                  setCompareActive(true);
                  setCompareMode("temporal_gee");
                }}
                onOpenStoryMap={() => setStoryMapOpen(true)}
              />
            </div>
          )}

          {/* GEE-only warning when proxy is forced */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && !geeReady && isGeeOnly && activeDef && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                <strong>Índice apenas GEE.</strong> {activeDef.short} requer dados raster reais (DEM / Landsat). Active GEE no topo para calcular.
              </div>
            </div>
          )}

          {/* Proxy mode controls (only spectral indices have meaningful proxy) */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && !geeReady && activeTab !== "s2" && !isGeeOnly && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Opacidade</h4>
              <input type="range" min={0.1} max={1} step={0.05} value={visParams.opacity}
                onChange={e => setVisParams(prev => ({...prev, opacity: Number(e.target.value)}))} className="w-full accent-sky-500" />
              <div className="text-xs text-slate-400 text-right mt-0.5">{Math.round(visParams.opacity * 100)}%</div>
            </div>
          )}

          {/* Sentinel-2 cloudless controls */}
          {activeTab === "s2" && (
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sentinel-2 Cloudless (EOX)</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ano do mosaico</label>
                <div className="relative">
                  <select className="w-full appearance-none text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                    {["2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"].map(y => <option key={y} className="dark:bg-slate-800">{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompareActive(true);
                    setShowS2(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-2xs"
                >
                  <Columns2 size={14} className="text-indigo-600" />
                  <span>Comparar Antes e Depois</span>
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showS2} onChange={e => setShowS2(e.target.checked)} className="accent-sky-500" />
                <span className="text-sm text-slate-700">Activar imagem Sentinel-2</span>
              </label>
            </div>
          )}

          {/* Index info — geocientific legend card (proxy mode fallback) */}
          {!geeReady && !isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && activeDef && activeTab !== "s2" && (() => {
            const activeGroup = tabGroups.find(g => g.tabs.some(t => t.id === activeTab));
            return (
              <div className="p-4 flex-1 space-y-4">
                {/* Group badge */}
                {activeGroup && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${activeGroup.badgeColor}`}>
                      {activeGroup.name}
                    </span>
                    <span className="text-[10px] text-slate-400">{activeGroup.badge}</span>
                  </div>
                )}

                {/* Colormap legend — always visible */}
                {!isGeeOnly && !isTopoClass && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Escala {geeReady ? "(GEE)" : "(proxy)"}
                    </h4>
                    <ColormapLegend index={activeTab as SpectralIndex} />
                  </div>
                )}
                {isTopoClass && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Classes Topográficas</h4>
                    <div className="space-y-1">
                      {["#1a9850","#66bd63","#fee08b","#fdae61","#a50026","#3690c0"].map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="inline-block w-3.5 h-3.5 rounded" style={{ background: c }} />
                          {TERRAIN_CLASS_NAMES[i]}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Interpretation */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Interpretação Geocientífica</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{activeDef.interpretation}</p>
                </div>

                {/* Formula + bands */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fórmula</h4>
                  <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed">{activeDef.formula}</code>
                  <p className="text-xs text-slate-400 mt-1.5">
                    <span className="font-medium text-slate-500">Bandas: </span>{activeDef.bands}
                  </p>
                </div>

                {isTerrain && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1"><Mountain size={12} className="text-amber-600" /><span className="text-xs font-semibold text-amber-700">DEM Copernicus GLO-30</span></div>
                    <p className="text-xs text-amber-700 leading-relaxed">Resolução 30 m · recortado ao polígono administrativo · projecção UTM 36S para métricas de área.</p>
                  </div>
                )}
                {!geeReady && !isGeeOnly && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1"><Info size={12} className="text-slate-500" /><span className="text-xs font-semibold text-slate-600">Modo Proxy</span></div>
                    <p className="text-xs text-slate-500 leading-relaxed">Estimativa baseada em atributos geológicos. Active GEE no topo para dados raster reais.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Lineaments info */}
          {isLineaments && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity size={12} className="text-fuchsia-600" />
                  <span className="text-xs font-semibold text-fuchsia-700">Detecção Estrutural</span>
                </div>
                <p className="text-xs text-fuchsia-700 leading-relaxed">
                  Lineamentos topográficos (falhas, fracturas, drenagens) extraídos do
                  DEM Copernicus GLO-30 com Canny multi-azimute e Sobel.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala — densidade</h4>
                <div className="h-3 w-full rounded" style={{
                  background: "linear-gradient(to right, #000033, #330099, #9933cc, #ff3366, #ff6600, #ffff00)",
                }} />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>Baixa</span><span>Alta densidade estrutural</span>
                </div>
              </div>
            </div>
          )}

          {/* Targeting info */}
          {isTargeting && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Target size={12} className="text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Mineral Targeting AI</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Modelo multi-critério ponderado por mineral. Combina assinatura
                  espectral, relevo e densidade estrutural para gerar score 0–100.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala — favorabilidade</h4>
                <div className="h-3 w-full rounded" style={{
                  background: "linear-gradient(to right, #0d0887, #8b0aa5, #db5c68, #febc2a, #ffff96)",
                }} />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>0</span><span>100</span>
                </div>
              </div>
            </div>
          )}

          {/* SPI × NDVI info */}
          {isSpiNdvi && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Droplets size={12} className="text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700">Seca Meteorológica × Vegetação</span>
                </div>
                <p className="text-xs text-orange-700 leading-relaxed">
                  SPI = anomalia da precipitação anual (CHIRPS) face à climatologia
                  2001→ano−1. Cruzado com NDVI MODIS para medir a resposta da
                  vegetação à disponibilidade de chuva.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Escala — SPI</h4>
                <div className="h-3 w-full rounded" style={{
                  background: "linear-gradient(to right, #7f0000, #d73027, #fdae61, #fee08b, #d9ef8b, #66bd63, #1a9850, #2166ac)",
                }} />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>−2 · seca extrema</span><span>+2 · muito húmido</span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fórmula</h4>
                <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed">
                  SPI = (P_ano − μ_clim) / σ_clim
                </code>
                <p className="text-xs text-slate-400 mt-1.5">
                  <span className="font-medium text-slate-500">Bandas: </span>
                  CHIRPS Daily ~5 km · MOD13A2 NDVI 1 km
                </p>
              </div>
            </div>
          )}

          {/* S2 cloudless info */}
          {activeTab === "s2" && (
            <div className="p-4 flex-1 space-y-3">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5"><Satellite size={12} className="text-sky-600" /><span className="text-xs font-semibold text-sky-700">Sentinel-2 Cloudless EOX</span></div>
                <p className="text-xs text-sky-700 leading-relaxed">Mosaico anual sem nuvens por <a href="https://eox.at" target="_blank" rel="noopener" className="underline">EOX IT Services GmbH</a>. Dados Copernicus modificados. Gratuito e sem autenticação.</p>
              </div>
              {geeStatus?.connected && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><ShieldCheck size={12} className="text-emerald-600" /><span className="text-xs font-semibold text-emerald-700">GEE disponível</span></div>
                  <p className="text-xs text-emerald-700 leading-relaxed">Selecione um índice espectral acima para calcular com Sentinel-2 real via Google Earth Engine.</p>
                </div>
              )}
            </div>
          )}

            </div>
          </DraggablePanel>
        )}

        {/* Map */}
        <div className="flex-1 relative overflow-hidden" ref={mapContainerRef}>
          {/* Loading indicators */}
          {isFetching && activeTab !== "s2" && !geeReady && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2 pointer-events-none">
              <Cpu size={13} className="text-sky-500 animate-spin" /> A computar índice proxy…
            </div>
          )}
          {!province && activeTab !== "s2" && !geeReady && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
              <div className="bg-white/95 dark:bg-slate-900/95 border border-sky-200 dark:border-sky-800/60 rounded-2xl px-6 py-4 shadow-lg text-center max-w-xs">
                <Layers size={22} className="text-sky-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-300">Selecione uma <strong>província</strong> para calcular o índice espectral proxy.</p>
              </div>
            </div>
          )}


          {/* Floating HUD status indicator during GEE computation (ocultado temporariamente a pedido do utilizador) */}
          {false && compareActive && isProcessingCompareGee && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[660] bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-sky-500/40 backdrop-blur-md flex items-center gap-3 animate-in fade-in zoom-in-95 pointer-events-none">
              <Loader2 size={16} className="text-sky-400 animate-spin shrink-0" />
              <div className="text-xs">
                <div className="font-bold text-sky-200">A processar análise no Google Earth Engine...</div>
                <div className="text-[10px] text-slate-300">
                  {INDEX_DEFS.find((d) => d.id === activeTab)?.short || activeTab.toUpperCase()} ({compareStartDateLeft.slice(0, 4)} ⟷ {compareStartDateRight.slice(0, 4)})
                </div>
              </div>
            </div>
          )}

          {/* Split-Screen Compare Curtain Overlay (ocultado temporariamente a pedido do utilizador, lógica preservada) */}
          {false && compareActive && (
            <SplitScreenCompare
              splitPercent={splitPercent}
              onSplitChange={setSplitPercent}
              activeAnalysisName={
                INDEX_DEFS.find((d) => d.id === activeTab)?.label ||
                (activeTab === "s2" ? "Sentinel-2 Óptico" : activeTab)
              }
              activeAnalysisId={activeTab}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              startDateLeft={compareStartDateLeft}
              endDateLeft={compareEndDateLeft}
              onDatesLeftChange={(s, e) => {
                setCompareStartDateLeft(s);
                setCompareEndDateLeft(e);
                const y = s.slice(0, 4);
                if (y && y.length === 4) setCompareLeftYear(y);
              }}
              startDateRight={compareStartDateRight}
              endDateRight={compareEndDateRight}
              onDatesRightChange={(s, e) => {
                setCompareStartDateRight(s);
                setCompareEndDateRight(e);
                const y = s.slice(0, 4);
                if (y && y.length === 4) setCompareRightYear(y);
              }}
              isProcessingGee={isProcessingCompareGee}
              onProcessGee={runCompareGee}
              geeConnected={geeReady}
              compareError={compareGeeError}
              onOpenGeeAuth={() => setGeeCredsOpen(true)}
              leftValue={compareLeftYear}
              rightValue={compareRightYear}
              onLeftChange={(y) => {
                setCompareLeftYear(y);
                setCompareStartDateLeft(`${y}-01-01`);
                setCompareEndDateLeft(`${y}-12-31`);
              }}
              onRightChange={(y) => {
                setCompareRightYear(y);
                setCompareStartDateRight(`${y}-01-01`);
                setCompareEndDateRight(`${y}-12-31`);
              }}
              containerRef={mapContainerRef}
              onClose={() => setCompareActive(false)}
            />
          )}

          {/* Mobile floating sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            className="md:hidden absolute top-3 left-3 z-[600] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <SlidersHorizontal size={13} className="text-sky-600 dark:text-sky-400" />
            Filtros
          </button>

          {/* Basemap Switcher (Google Maps / Cesium) */}
          <BasemapSwitcher
            current={basemap}
            onChange={setBasemap}
            className="absolute bottom-16 sm:bottom-6 right-4 z-[600]"
            position="bottom-right"
            show3dToggle={false}
          />

          <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {/* Base tiles */}
            {compareActive ? (
              <>
                <TileLayer
                  key={basemap}
                  crossOrigin="anonymous"
                  url={GOOGLE_BASEMAPS[basemap].url}
                  subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
                  attribution={GOOGLE_BASEMAPS[basemap].attribution}
                  maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
                />
                {/* Left Side (Antes) */}
                <Pane name="compareLeftPane" style={{ clipPath: `inset(0 calc(100% - ${splitPercent}%) 0 0)`, zIndex: 440 }}>
                  {compareMode === "temporal_gee" && geeTileLeft ? (
                    <TileLayer
                      key={`gee-left-${geeTileLeft}`}
                      crossOrigin="anonymous"
                      url={geeTileLeft}
                      opacity={visParams.opacity}
                      attribution={`GEE Análise (${compareStartDateLeft.slice(0, 4)}) — Google Earth Engine`}
                      maxZoom={20}
                    />
                  ) : compareMode === "analysis_vs_satellite" && (geeTile?.tileUrl || activeOverlayUrl) ? (
                    <TileLayer
                      key={`gee-curtain-${geeTile?.tileUrl || activeOverlayUrl}`}
                      crossOrigin="anonymous"
                      url={geeTile?.tileUrl || activeOverlayUrl || ""}
                      opacity={visParams.opacity}
                      attribution="GEE Análise Selecionada"
                      maxZoom={20}
                    />
                  ) : (
                    <TileLayer
                      key={`s2-left-${safeCompareLeftYear}`}
                      crossOrigin="anonymous"
                      url={`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${safeCompareLeftYear}_3857/default/g/{z}/{y}/{x}.jpg`}
                      attribution={`Sentinel-2 cloudless ${safeCompareLeftYear} (Antes) — EOX`}
                      maxZoom={18}
                    />
                  )}
                  <TileLayer
                    crossOrigin="anonymous"
                    url="https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}"
                    subdomains="0123"
                    attribution=""
                    maxZoom={20}
                    pane="shadowPane"
                  />
                </Pane>

                {/* Right Side (Depois) */}
                <Pane name="compareRightPane" style={{ clipPath: `inset(0 0 0 ${splitPercent}%)`, zIndex: 450 }}>
                  {compareMode === "temporal_gee" && (geeTileRight || geeTile?.tileUrl) ? (
                    <TileLayer
                      key={`gee-right-${geeTileRight || geeTile?.tileUrl}`}
                      crossOrigin="anonymous"
                      url={geeTileRight || geeTile?.tileUrl || ""}
                      opacity={visParams.opacity}
                      attribution={`GEE Análise (${compareStartDateRight.slice(0, 4)} / Recente) — Google Earth Engine`}
                      maxZoom={20}
                    />
                  ) : compareMode === "analysis_vs_satellite" ? (
                    <TileLayer
                      key="sat-right-hybrid"
                      crossOrigin="anonymous"
                      url={GOOGLE_BASEMAPS["hybrid"].url}
                      subdomains={GOOGLE_BASEMAPS["hybrid"].subdomains}
                      attribution="Google Satellite / Hybrid"
                      maxZoom={20}
                    />
                  ) : (
                    <TileLayer
                      key={`s2-right-${safeCompareRightYear}`}
                      crossOrigin="anonymous"
                      url={`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${safeCompareRightYear}_3857/default/g/{z}/{y}/{x}.jpg`}
                      attribution={`Sentinel-2 cloudless ${safeCompareRightYear} (Depois) — EOX`}
                      maxZoom={18}
                    />
                  )}
                  <TileLayer
                    crossOrigin="anonymous"
                    url="https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}"
                    subdomains="0123"
                    attribution=""
                    maxZoom={20}
                    pane="shadowPane"
                  />
                </Pane>
              </>
            ) : showS2 || activeTab === "s2" ? (
              <>
                <TileLayer
                  key={basemap}
                  crossOrigin="anonymous"
                  url={GOOGLE_BASEMAPS[basemap].url}
                  subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
                  attribution={GOOGLE_BASEMAPS[basemap].attribution}
                  maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
                />
                <TileLayer
                  key={`s2-${selectedYear}`}
                  crossOrigin="anonymous"
                  url={`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${selectedYear}_3857/default/g/{z}/{y}/{x}.jpg`}
                  attribution={`Sentinel-2 cloudless ${selectedYear} — EOX IT Services GmbH`}
                  maxZoom={18}
                  opacity={activeTab === "s2" ? 1 : 0.65}
                />
                <TileLayer
                  crossOrigin="anonymous"
                  url="https://mt{s}.google.com/vt/lyrs=h&x={x}&y={y}&z={z}"
                  subdomains="0123"
                  attribution=""
                  maxZoom={20}
                  pane="shadowPane"
                />
              </>
            ) : (
              <TileLayer
                key={basemap}
                crossOrigin="anonymous"
                url={GOOGLE_BASEMAPS[basemap].url}
                subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
                attribution={GOOGLE_BASEMAPS[basemap].attribution}
                maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
              />
            )}

            <ScaleControl position="bottomleft" imperial={false} />

            {/* Province / district boundaries + selection + auto-fit.
               Disabled in profile mode (clicks add A/B/… points there). */}
            <AreaSelect
              province={province} district={district}
              onProvinceChange={onProvinceChange}
              onDistrictChange={onDistrictChange}
              selectable={!isProfile}
              accent={activeTab === "s2" ? "#ffffff" : "#6366f1"}
            />

            {/* GEE real tile layer (single index) */}
            {geeReady && !isLineaments && !isTargeting && geeTile && activeTab !== "s2" && (
              <TileLayer crossOrigin="anonymous"
                key={geeTileKey}
                url={geeTile.tileUrl}
                attribution={`GEE · ${geeTile.name}`}
                opacity={visParams.opacity}
                maxZoom={18}
              />
            )}

            {/* Lineaments — density (heat) + optional edges (cyan lines) */}
            {isLineaments && lineamentsTile && (
              <>
                {/* Density heatmap kept subtle so the extracted structures stand out */}
                <TileLayer crossOrigin="anonymous"
                  key={`lin-density-${lineamentsTile.tileUrl}`}
                  url={lineamentsTile.tileUrl}
                  attribution="GEE · Lineamentos (densidade)"
                  opacity={0.45}
                  maxZoom={18}
                />
                {showEdges && (
                  <TileLayer crossOrigin="anonymous"
                    key={`lin-edges-${lineamentsTile.edgesTileUrl}`}
                    url={lineamentsTile.edgesTileUrl}
                    attribution="GEE · Estruturas (lineamentos)"
                    opacity={1}
                    maxZoom={18}
                  />
                )}
              </>
            )}

            {/* Contour tiles (minor + major lines) */}
            {isContours && contoursTile && (
              <>
                <TileLayer crossOrigin="anonymous"
                  key={`ctr-${contoursTile.tileUrl}`}
                  url={contoursTile.tileUrl}
                  attribution={`GEE · Curvas ${contoursTile.intervalM} m`}
                  opacity={0.85}
                  maxZoom={18}
                />
                <TileLayer crossOrigin="anonymous"
                  key={`ctr-idx-${contoursTile.indexTileUrl}`}
                  url={contoursTile.indexTileUrl}
                  attribution={`GEE · Linhas-mestras ${contoursTile.indexIntervalM} m`}
                  opacity={1}
                  maxZoom={18}
                />
              </>
            )}

            {/* Profile — click handler, polyline + markers */}
            <ProfileClickHandler
              enabled={isProfile}
              onPick={(p) => setProfilePoints(prev => [...prev, p])}
            />
            {isProfile && profilePoints.length >= 2 && (
              <Polyline
                positions={profilePoints.map(([lon, lat]) => [lat, lon])}
                pathOptions={{ color: "#0369a1", weight: 3, opacity: 0.9, dashArray: "6 4" }}
              />
            )}
            {isProfile && profilePoints.map((p, i) => (
              <CircleMarker key={`pp-${i}`}
                center={[p[1], p[0]]}
                radius={8}
                pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#0ea5e9", fillOpacity: 1 }}
              />
            ))}

            {/* Custom Topo Classes tile */}
            {isTopoCustom && topoClassesTile && (
              <TileLayer crossOrigin="anonymous"
                key={`tc-${topoClassesTile.tileUrl}`}
                url={topoClassesTile.tileUrl}
                attribution="GEE · Classes Topográficas"
                opacity={visParams.opacity}
                maxZoom={18}
              />
            )}

            {/* Land cover (ESA WorldCover 2021) tile */}
            {isLandCover && landCoverTile && (
              <TileLayer crossOrigin="anonymous"
                key={`lc-${landCoverTile.tileUrl}`}
                url={landCoverTile.tileUrl}
                attribution="GEE · ESA WorldCover 2021"
                opacity={visParams.opacity}
                maxZoom={18}
              />
            )}

            {/* Profile cursor marker (synced from chart hover) */}
            {isProfile && profileCursorLatLon && (
              <CircleMarker
                center={[profileCursorLatLon.lat, profileCursorLatLon.lon]}
                radius={9}
                pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#f59e0b", fillOpacity: 1 }}
              />
            )}

            {/* Targeting score tile */}
            {isTargeting && targetingTile && (
              <TileLayer crossOrigin="anonymous"
                key={`tgt-${targetingTile.tileUrl}`}
                url={targetingTile.tileUrl}
                attribution={`GEE · ${targetingTile.mineralName}`}
                opacity={visParams.opacity}
                maxZoom={18}
              />
            )}

            {/* Targeting overlap — favorable zones vectorized */}
            {isTargeting && overlapResult && overlapResult.zones?.features?.length > 0 && (
              <GeoJSON
                key={`overlap-${overlapResult.mineralName}-${overlapResult.zones.features.length}`}
                data={overlapResult.zones}
                style={{ color: "#4f46e5", weight: 1.5, fillColor: "#6366f1", fillOpacity: 0.12, dashArray: "4 3" }}
              />
            )}

            {/* SPI × NDVI tiles */}
            {isSpiNdvi && spiNdviResult && (
              <TileLayer crossOrigin="anonymous"
                key={`spindvi-${spiLayerMode}-${spiNdviResult.year}`}
                url={spiLayerMode === "spi" ? spiNdviResult.spiTileUrl : spiNdviResult.ndviTileUrl}
                attribution={`GEE · ${spiNdviResult.name}`}
                opacity={visParams.opacity}
                maxZoom={18}
              />
            )}

            {/* Proxy spectral overlay */}
            {!geeReady && activeTab !== "s2" && spectralGeoJSON && (
              <GeoJSON key={spectralKey} data={spectralGeoJSON as GeoJSON.FeatureCollection}
                style={(f) => ({
                  color: "rgba(255,255,255,0.2)", weight: 0.3,
                  fillColor: (f?.properties as Record<string, string>)?._spectralColor ?? "#64748b",
                  fillOpacity: visParams.opacity,
                })}
                onEachFeature={(f, layer) => {
                  const p = f.properties as Record<string, string & number>;
                  const legend = p?.Legend ?? p?.LEGEND ?? p?.code2006 ?? "Unknown";
                  const val = Number(p._spectralValue ?? 0);
                  layer.bindTooltip(
                    `<b>${legend}</b><br/>${activeDef?.short}: <b>${(val * 100).toFixed(0)}%</b><br/>ERA: ${p?.ERA ?? "—"} · PERIOD: ${p?.PERIOD ?? "—"}`,
                    { sticky: true }
                  );
                  (layer as L.Path).on("mouseover", () => setHoveredProxyValue(val));
                  (layer as L.Path).on("mouseout", () => setHoveredProxyValue(null));
                }}
              />
            )}
            <MapTools />
            <GeoAnalisesCoordTracker
              onMove={(lat, lng, ele) => {
                if (lat !== null && lng !== null) {
                  setCoords2D({ lat, lng });
                  if (ele !== undefined && ele !== null) {
                    setElevation2D(ele);
                  }
                } else {
                  setCoords2D(null);
                  setElevation2D(null);
                  setHoveredProxyValue(null);
                }
              }}
            />
            <MapDraw
              enabled={drawingEnabled}
              hasDrawnAOI={aoi.source === "draw"}
              onClearAOI={() => onAOIChange(GLOBAL_AOI)}
              onDrawComplete={(geom, label) => { setDrawingEnabled(false); onAOIChange(customAOI(geom, label, "draw")); }}
              onCancel={() => setDrawingEnabled(false)}
            />
          </MapContainer>

          {/* RasterVisPanel — floating visualization controls */}
          {geeReady && geeTile && activeTab !== "s2" && (
            <>
              {/* Toggle button */}
              <button
                onClick={() => setVisPanelOpen(v => !v)}
                className="absolute top-4 left-4 z-[700] bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-sky-600 hover:border-sky-400 dark:hover:text-sky-400 dark:hover:border-sky-500 transition-colors flex items-center gap-1.5 pointer-events-auto cursor-pointer"
                title="Ajustar visualização"
              >
                <Sliders size={14} />
                {visPanelOpen ? "Fechar" : "Visualização"}
              </button>
              <RasterVisPanel
                open={visPanelOpen}
                onClose={() => setVisPanelOpen(false)}
                availableBands={activeDefBands}
                currentParams={visParams}
                onApply={handleApplyVis}
                onLiveCssChange={handleLiveCssChange}
                onImport={handleImportVis}
                applying={visApplying}
              />
            </>
          )}


          {/* Map overlay legend — proxy mode */}
          {activeTab !== "s2" && !geeReady && !isGeeOnly && activeDef && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 p-3 w-52 pointer-events-none">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{activeDef.label} (Proxy)</div>
              <div className="h-3 w-full rounded" style={{
                background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) => applyColormap(i / 7, activeDef.id as SpectralIndex)).join(", ")})`,
              }} />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>{activeDef.lowLabel.split("/")[0]}</span>
                <span>{activeDef.highLabel.split("/")[0]}</span>
              </div>
            </div>
          )}
          {/* Lineaments result badge */}
          {isLineaments && lineamentsTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-fuchsia-200 dark:border-fuchsia-900/50 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-fuchsia-500" />
                <div className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400">Lineamentos (DEM)</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Orientação dominante: <strong className="text-fuchsia-700 dark:text-fuchsia-400">{dominantOrientation(lineamentsTile.rose)}</strong>
              </div>
              <div className="text-xs text-slate-400">
                {lineamentsTile.sampleCount.toLocaleString()} pixels · densidade média {(lineamentsTile.meanDensity ?? 0).toFixed(3)}
              </div>
            </div>
          )}

          {/* Contours result badge */}
          {isContours && contoursTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-amber-200 dark:border-amber-900/50 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Waves size={12} className="text-amber-700 dark:text-amber-400" />
                <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">Curvas de Nível ({contoursTile.intervalM} m)</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Elevação: {contoursTile.minElevM?.toFixed(0) ?? "—"} m → {contoursTile.maxElevM?.toFixed(0) ?? "—"} m
              </div>
              <div className="text-xs text-slate-400">
                {contoursTile.intervals.length} curvas · linhas-mestras a cada {contoursTile.indexIntervalM} m
              </div>
            </div>
          )}

          {/* Profile chart overlay */}
          {isProfile && profileResult && (
            <div className="absolute bottom-8 left-4 right-4 z-[500] bg-white/97 dark:bg-slate-900/97 backdrop-blur rounded-xl shadow-lg border border-sky-200 dark:border-sky-900/50 px-4 pt-3 pb-1"
                 style={{ height: 200 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Route size={12} className="text-sky-600 dark:text-sky-400" />
                  <div className="text-xs font-semibold text-sky-800 dark:text-sky-300">
                    Perfil Topográfico — {(profileResult.stats.totalDistanceM / 1000).toFixed(2)} km ·{" "}
                    Δ {(profileResult.stats.maxElevM - profileResult.stats.minElevM).toFixed(0)} m
                  </div>
                </div>
                <button onClick={() => { setProfileResult(null); setProfilePoints([]); }}
                  className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer">
                  <X size={11} /> fechar
                </button>
              </div>
              <div style={{ height: 165 }}>
                <ProfileChart result={profileResult} onCursorChange={setProfileCursorIdx} />
              </div>
            </div>
          )}

          {/* SPI × NDVI scatter overlay */}
          {isSpiNdvi && spiNdviResult && showSpiChart && spiNdviResult.pairs.length > 0 && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/97 dark:bg-slate-900/97 backdrop-blur rounded-xl shadow-lg border border-orange-200 dark:border-orange-900/50 px-4 pt-3 pb-1"
                 style={{ height: 230, width: 380 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Droplets size={12} className="text-orange-600 dark:text-orange-400" />
                  <div className="text-xs font-semibold text-orange-800 dark:text-orange-300">
                    SPI × NDVI {spiNdviResult.year} — r = {spiNdviResult.stats.pearsonR != null ? spiNdviResult.stats.pearsonR.toFixed(2) : "—"}
                    {" · "}{spiNdviResult.stats.sampleCount} amostras
                  </div>
                </div>
                <button onClick={() => setShowSpiChart(false)}
                  className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer">
                  <X size={11} /> fechar
                </button>
              </div>
              <div style={{ height: 190 }}>
                <SpiNdviChart result={spiNdviResult} />
              </div>
            </div>
          )}

          {/* SPI × NDVI legend badge (when chart hidden) */}
          {isSpiNdvi && spiNdviResult && !showSpiChart && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-orange-200 dark:border-orange-900/50 p-3 w-60">
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets size={12} className="text-orange-600 dark:text-orange-400" />
                <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                  {spiLayerMode === "spi" ? `SPI ${spiNdviResult.year}` : `NDVI ${spiNdviResult.year}`}
                </div>
              </div>
              <div className="h-2.5 rounded" style={{
                background: `linear-gradient(to right, ${(spiLayerMode === "spi" ? spiNdviResult.spiPalette : spiNdviResult.ndviPalette).join(", ")})`,
              }} />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                {spiLayerMode === "spi" ? <><span>−2 seca</span><span>+2 húmido</span></> : <><span>0</span><span>0.9</span></>}
              </div>
              <button onClick={() => setShowSpiChart(true)}
                className="mt-1.5 text-[10px] text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 font-medium cursor-pointer">
                ↺ reabrir gráfico
              </button>
            </div>
          )}

          {/* Custom Topo Classes legend */}
          {isTopoCustom && topoClassesTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-emerald-200 dark:border-emerald-900/50 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sliders size={12} className="text-emerald-600 dark:text-emerald-400" />
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Classes Topográficas</div>
              </div>
              <div className="space-y-0.5">
                {topoClassesTile.labels.map((lbl, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <span className="inline-block w-2.5 h-2.5 rounded shrink-0"
                      style={{ background: topoClassesTile.colors[i] }} />
                    <span className="truncate flex-1 text-slate-700 dark:text-slate-200">{lbl}</span>
                    <span className="text-slate-400 font-mono">{topoClassesTile.areasPct[i].toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Targeting result badge */}
          {isTargeting && targetingTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-amber-200 dark:border-amber-900/50 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Gem size={12} className="text-amber-500" />
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Potencial: {targetingTile.mineralName}</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Score médio: <strong className="text-amber-700 dark:text-amber-400">{((targetingTile.stats.meanScore ?? 0) * 100).toFixed(0)}/100</strong>
                {" · "}P95: <strong className="text-amber-700 dark:text-amber-400">{((targetingTile.stats.p95 ?? 0) * 100).toFixed(0)}</strong>
              </div>
              <div className="text-xs text-slate-400">
                Área favorável: {targetingTile.stats.favorableKm2 != null
                  ? `${targetingTile.stats.favorableKm2.toFixed(1)} km²`
                  : "—"}
              </div>
              {/* On-map legend: what the score raster means */}
              <div className="mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/40">
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Favorabilidade (0–100)</div>
                <div className="h-2 rounded-full" style={{ background: "linear-gradient(to right,#0d47a1,#7b1fa2,#e53935,#fdd835,#fffde7)" }} />
                <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>0 · baixa</span><span>alta · 100</span></div>
              </div>
            </div>
          )}

          {/* GEE result badge */}
          {activeTab !== "s2" && !isLineaments && !isTargeting && geeTile && geeReady && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-emerald-200 dark:border-emerald-900/50 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">GEE Real</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">{geeTile.name.split("—")[0].trim()}</div>
              {geeTile.sceneCount > 0 && (
                <div className="text-xs text-slate-400">{geeTile.sceneCount} cenas · {geeTile.dateRange}</div>
              )}
              {isTopoClass && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {["#1a9850","#66bd63","#fee08b","#fdae61","#a50026","#3690c0"].map((c, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                      <span className="inline-block w-2.5 h-2.5 rounded shrink-0" style={{ background: c }} />
                      <span className="truncate">{TERRAIN_CLASS_NAMES[i]}</span>
                    </div>
                  ))}
                </div>
              )}
              {!isTopoClass && activeDef && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div
                    className="h-2.5 w-full rounded"
                    style={{
                      background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) =>
                        applyColormap(i / 7, activeDef.id as SpectralIndex)
                      ).join(", ")})`,
                    }}
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-0.5 font-medium">
                    <span>{activeDef.lowLabel.split("/")[0]}</span>
                    <span>{activeDef.highLabel.split("/")[0]}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
        <span>
          {activeTab === "s2"
            ? `Sentinel-2 cloudless ${selectedYear} — EOX IT Services (CC BY 4.0)`
            : isLineaments
              ? lineamentsTile
                ? `Lineamentos · ${lineamentsTile.formula} · ${lineamentsTile.sampleCount.toLocaleString()} pixels`
                : "Lineamentos · pronto para executar"
              : isTargeting
                ? targetingTile
                  ? `Targeting · ${targetingTile.formula}${overlapResult ? ` · ${overlapResult.report.zoneCount} zonas cruzadas` : ""}`
                  : "Targeting · escolha um mineral e execute"
                : isSpiNdvi
                  ? spiNdviResult
                    ? `SPI×NDVI · ${spiNdviResult.formula}`
                    : "SPI × NDVI · escolha o ano e execute"
                  : geeReady && geeTile
                    ? `GEE Real · ${geeTile.formula}${geeTile.sceneCount ? ` · ${geeTile.sceneCount} cenas` : ""}`
                    : `${isGeeOnly ? "GEE necessário" : "Proxy"} · ${activeDef?.formula ?? ""}`}
        </span>
        {province && (
          <span className="ml-auto text-sky-500 font-medium">
            {province}{district ? ` / ${district}` : ""}
          </span>
        )}
      </div>
    </div>
  )}
</div>
  );
}

