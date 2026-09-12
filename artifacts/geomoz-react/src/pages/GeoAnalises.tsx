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
  Satellite, BarChart2, Layers, Info, ChevronDown,
  Cpu, FlaskConical, CloudSun, Droplets, Flame,
  CheckCircle2, XCircle, Loader2, Play, RefreshCw,
  ExternalLink, ShieldCheck,
  Mountain, TrendingUp, Trees, Sliders, MapPin,
  Activity, Target, Compass, Gem,
  TrendingDown, Route, Waves, X, FileDown,
  Sprout, ChevronLeft, ChevronRight, Navigation, Building2,
  AlertTriangle, Sparkles, ArrowLeft, LayoutGrid, Search, Globe, SlidersHorizontal,
  Clock, Columns2,
} from "lucide-react";
import MapLibre3DView from "@/components/MapLibre3DView";
import TimeLapsePlayer, { type TimeLapsePeriodMode } from "@/components/TimeLapsePlayer";
import SplitScreenCompare, { type CompareMode } from "@/components/SplitScreenCompare";

import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Area, ComposedChart,
  Scatter, CartesianGrid,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

import { useGeologyGeoJSON } from "@/hooks/useGeoMoz";
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
    interpretation: "Valores > 0.5 indicam cobertura vegetal densa (depósitos quaternários, aluviões). Valores negativos = rocha exposta, água.",
    lowLabel: "Rocha / solo", highLabel: "Vegetação densa" },
  { id: "fe_oxide", label: "Fe-Óxidos", short: "Fe-Óxidos", icon: <Flame size={13} />, group: "spectral",
    formula: "Fe-Oxide = B4 / B2",
    bands: "Vermelho (B4) · Azul (B2)",
    interpretation: "Detecta BIF, laterite e gossã sobre sulfuretos. Fundamental para prospecção de Fe, Mn e zonas de oxidação.",
    lowLabel: "Rocha fresca", highLabel: "BIF / laterite / gossã" },
  { id: "clay", label: "Argilas", short: "Argilas", icon: <Droplets size={13} />, group: "spectral",
    formula: "Clay = B11 / B8A",
    bands: "SWIR1 (B11) · Red-Edge3 (B8A)",
    interpretation: "Minerais argilosos (caulinite, esmectite, illite). Mapeia saprolite e zonas de alteração argílica.",
    lowLabel: "Quartzo / rocha fresca", highLabel: "Argilas / xisto / saprolite" },
  { id: "hydrothermal", label: "Hidrotermal", short: "Hidrotermal", icon: <FlaskConical size={13} />, group: "spectral",
    formula: "(B11+B4) / (B8A+B3)",
    bands: "SWIR1 (B11) · B4 · Red-Edge3 (B8A) · Verde (B3)",
    interpretation: "Zonas de alteração hidrotermal (silicificação, sericitização, argilização). Crítico para prospecção de Au, Ag, Cu, Mo.",
    lowLabel: "Sem alteração", highLabel: "Skarn / greisen / alteração intensa" },
  { id: "bare_soil", label: "Solo Exposto", short: "BSI", icon: <BarChart2 size={13} />, group: "spectral",
    formula: "(B11+B4−B8−B2) / (B11+B4+B8+B2)",
    bands: "B11 · B4 · NIR (B8) · Azul (B2)",
    interpretation: "Zonas de solo exposto e erosão. Mapeia áreas de mineração activa e monitorização de uso do solo.",
    lowLabel: "Vegetação / escuro", highLabel: "Solo / rocha exposta" },
  { id: "al_oh", label: "Argílica/Fílica", short: "Al-OH", icon: <FlaskConical size={13} />, group: "spectral",
    formula: "Al-OH = B11 / B12",
    bands: "SWIR1 (B11 ~1610 nm) · SWIR2 (B12 ~2190 nm)",
    interpretation: "Absorção Al-OH (~2200 nm) de sericite, caulinite e alunite → alteração argílica/fílica em sistemas epitermais/pórfiro (Au-Ag-Cu). Limite do Sentinel-2: 2 bandas SWIR; para separação completa usar ASTER.",
    lowLabel: "Sem alteração", highLabel: "Sericite / argila / alunite" },
  { id: "ferrous", label: "Ferro Ferroso", short: "Fe²⁺", icon: <Flame size={13} />, group: "spectral",
    formula: "Ferrous = B12 / B8A",
    bands: "SWIR2 (B12) · Red-Edge3 (B8A)",
    interpretation: "Realça minerais ferrosos (Fe²⁺): clorite, anfíbola, biotite — rochas máficas/ultramáficas e alteração propilítica. Complementar ao Fe-óxido (Fe³⁺).",
    lowLabel: "Félsico / oxidado", highLabel: "Máfico / Fe²⁺" },
  { id: "gossan", label: "Gossan", short: "Gossan", icon: <Mountain size={13} />, group: "spectral",
    formula: "Gossan = (B4/B2) × (B11/B12)",
    bands: "B4 · B2 · B11 · B12",
    interpretation: "Capas de ferro (gossã) sobre corpos sulfuretados: combina óxido de ferro (Fe³⁺) + alteração argílica. Alvo directo de exploração de sulfuretos (Cu, Zn, Pb, Au).",
    lowLabel: "Rocha fresca", highLabel: "Gossã / capa de ferro" },

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

  // ── Coastal & Marine indices ─────────────────────────────────────────
  { id: "mangrove_health", label: "Mangal", short: "Mangal", icon: <Sprout size={13} />, group: "coastal",
    formula: "0.50×NDVI + 0.50×NDWI — composto Sentinel-2",
    bands: "NIR (B8) · Vermelho (B4) · Verde (B3)",
    interpretation: "Saúde dos mangais — combina NDVI (vigor vegetativo) e NDWI (conteúdo de água). Monitoria de mangais na costa moçambicana (Zambeze, Bons Sinais, Save, Maputo).",
    lowLabel: "Mangal degradado", highLabel: "Mangal saudável" },
  { id: "coastal_index", label: "Índice Costeiro", short: "Costeiro", icon: <Waves size={13} />, group: "coastal",
    formula: "CVI: 0.35×costa_prox + 0.25×(1−elev) + 0.25×declive + 0.15×(1−NDVI)",
    bands: "DEM Copernicus · proximidade costa · sentinel-2 NDVI",
    interpretation: "Índice de Exposição Costeira — distância à costa, baixa elevação, declive suave e baixa vegetação aumentam a vulnerabilidade costeira.",
    lowLabel: "Baixa exposição", highLabel: "Alta exposição" },
  { id: "coastal_erosion", label: "Erosão Costeira", short: "Erosão", icon: <TrendingDown size={13} />, group: "coastal",
    formula: "JRC GSW v1.4 — transição 1984–2021",
    bands: "JRC Global Surface Water — transition",
    interpretation: "Erosão costeira detectada por JRC Global Surface Water. Áreas em vermelho = perda de terra por erosão costeira. Amarelo = acreção/progradação.",
    lowLabel: "Estável", highLabel: "Erosão" },
  { id: "tsunami_risk", label: "Tsunami", short: "Tsunami", icon: <BarChart2 size={13} />, group: "coastal",
    formula: "0.35×(1−elev_norm) + 0.30×costa_prox + 0.20×declive + 0.15×(1−NDVI)",
    bands: "DEM Copernicus · dist. costa · declive · NDVI",
    interpretation: "Risco de inundação por tsunami/inundação costeira. Combina baixa elevação, proximidade ao mar, terreno plano e falta de vegetação tampão.",
    lowLabel: "Risco baixo", highLabel: "Risco alto" },

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

// ── GEE Analysis Panel ─────────────────────────────────────────────────────────

function GeeAnalysisPanel({
  activeIndex, province, district, geometry, geeStatus, onTileReady, onOpenCompare,
}: {
  activeIndex: SpectralIndex;
  province: string | null;
  district: string | null;
  geometry?: Record<string, unknown> | null;
  geeStatus: GeeStatus;
  onTileReady: (result: GeeResult | null) => void;
  onOpenCompare?: () => void;
}) {
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate]     = useState("2023-12-31");
  const [cloudPct, setCloudPct]   = useState(30);
  const [running, setRunning]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [result, setResult]       = useState<GeeResult | null>(null);

  const def = INDEX_DEFS.find(d => d.id === activeIndex)!;

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    onTileReady(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index:      activeIndex,
          province:   province || null,
          district:   district || null,
          geometry:   geometry ?? null,
          start_date: startDate,
          end_date:   endDate,
          cloud_pct:  cloudPct,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro GEE desconhecido");
      }
      const data: GeeResult = await res.json();
      setResult(data);
      onTileReady(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setRunning(false);
    }
  }

  const statLabels: Record<string, string> = {
    p10: "P10", p25: "P25", p50: "Mediana", p75: "P75", p90: "P90",
  };

  return (
    <div className="space-y-4">
      {/* Parameters */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Parâmetros GEE</h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data início</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Cobertura de nuvens máx — <strong className="text-slate-700">{cloudPct}%</strong>
            </label>
            <input type="range" min={5} max={80} value={cloudPct} onChange={e => setCloudPct(Number(e.target.value))}
              className="w-full accent-sky-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área de análise (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
              <MapPin size={12} className="text-sky-500" />
              {district
                ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
                : province
                  ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                  : <span className="text-slate-500">Moçambique (toda)</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={runAnalysis}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200"
      >
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A processar no GEE…</>
          : <><Play size={14} /> Calcular {def.short} com Sentinel-2</>}
      </button>

      {onOpenCompare && (
        <button
          type="button"
          onClick={onOpenCompare}
          className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold rounded-xl transition-all shadow-xs"
          title="Comparar este índice entre o período padrão 2023 e o período recente"
        >
          <Columns2 size={13} />
          <span>Comparar {def.short} (2023 ⟷ Recente)</span>
        </button>
      )}

      {running && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          O GEE está a carregar cenas Sentinel-2, aplicar máscara de nuvens e calcular o índice. Tipicamente 5–20 s.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 leading-relaxed">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* Result */}
      {result && !running && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">Análise GEE completa</span>
            </div>
            <div className="text-xs text-emerald-700 space-y-0.5">
              <div>{result.sceneCount} cenas Sentinel-2 usadas</div>
              <div>Período: {result.dateRange}</div>
            </div>
          </div>

          {Object.keys(result.stats).length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Estatísticas do índice</h5>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(result.stats).map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="text-xs text-slate-400">{statLabels[k] ?? k}</div>
                    <div className="text-sm font-bold text-slate-800 font-mono">
                      {typeof v === "number" ? v.toFixed(3) : String(v ?? "—")}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            <strong>Nota:</strong> O tile GEE é válido ~24 h. Clique novamente em "Calcular" para refrescar.
          </div>
        </div>
      )}
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
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
          Parâmetros Estruturais
        </h4>
        <div className="space-y-2.5">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Suavização DEM — <strong className="text-slate-700">{smoothM} m</strong>
            </label>
            <input type="range" min={10} max={120} step={10} value={smoothM}
              onChange={e => setSmoothM(Number(e.target.value))}
              className="w-full accent-fuchsia-500" />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Filtra ruído. 30 m = detalhe fino, 120 m = grandes lineamentos.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Raio densidade — <strong className="text-slate-700">{radiusM} m</strong>
            </label>
            <input type="range" min={250} max={2500} step={250} value={radiusM}
              onChange={e => setRadiusM(Number(e.target.value))}
              className="w-full accent-fuchsia-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
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
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-fuchsia-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A detectar estruturas…</>
          : <><Activity size={14} /> Detectar Lineamentos</>}
      </button>

      {running && (
        <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 text-xs text-fuchsia-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          Hillshade multi-azimute + Canny + Sobel. Tipicamente 15–40 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 size={13} className="text-fuchsia-600" />
              <span className="text-xs font-semibold text-fuchsia-700">Lineamentos detectados</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Orientação</div>
                <div className="text-sm font-bold text-fuchsia-700">{dominantOrientation(result.rose)}</div>
              </div>
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Densidade média</div>
                <div className="text-sm font-bold text-fuchsia-700">
                  {result.meanDensity != null ? result.meanDensity.toFixed(3) : "—"}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Compass size={12} /> Rosa de Direcções
            </h5>
            <div className="bg-white border border-slate-200 rounded-xl p-2">
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
  const [startDate, setStart]   = useState("2023-01-01");
  const [endDate, setEnd]       = useState("2023-12-31");
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
            <label className="text-xs text-slate-500 mb-1 block">Mineral</label>
            <div className="relative">
              <select value={mineral} onChange={e => setMineral(e.target.value)}
                className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {current && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 leading-relaxed">
              {current.description}
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data início</label>
            <input type="date" value={startDate} onChange={e => setStart(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Data fim</label>
            <input type="date" value={endDate} onChange={e => setEnd(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Nuvens máx — <strong className="text-slate-700">{cloudPct}%</strong>
            </label>
            <input type="range" min={5} max={80} value={cloudPct}
              onChange={e => setCloudPct(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Limiar favorável — <strong className="text-slate-700">{Math.round(threshold * 100)}</strong>
            </label>
            <input type="range" min={0.4} max={0.9} step={0.05} value={threshold}
              onChange={e => setTh(Number(e.target.value))}
              className="w-full accent-amber-500" />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Área favorável = pixels com score ≥ limiar.
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
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
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Pesos do modelo
          </h5>
          <div className="space-y-1">
            {Object.entries(current.weights).map(([k, v]) => {
              const inv = current.invert.includes(k);
              return (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-slate-600 truncate">
                    {inv && <span className="text-rose-500 mr-0.5">¬</span>}{k}
                  </span>
                  <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${v * 100}%` }} />
                  </div>
                  <span className="font-mono text-slate-500 w-9 text-right">{(v * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={run} disabled={running || !mineral}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-amber-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A calcular favorabilidade…</>
          : <><Target size={14} /> Calcular Potencial Mineral</>}
      </button>

      {running && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A combinar Sentinel-2 + DEM + lineamentos. Pode demorar 30–60 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-white border border-amber-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Gem size={13} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">{result.mineralName}</span>
            </div>
            <FavorabilityGauge score={(result.stats.meanScore ?? 0) * 100} />
            <p className="text-[10px] text-center text-slate-400 -mt-2">
              Score médio da região
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P90</div>
              <div className="text-sm font-bold text-slate-800">
                {result.stats.p90 != null ? (result.stats.p90 * 100).toFixed(0) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P95</div>
              <div className="text-sm font-bold text-slate-800">
                {result.stats.p95 != null ? (result.stats.p95 * 100).toFixed(0) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">P99</div>
              <div className="text-sm font-bold text-slate-800">
                {result.stats.p99 != null ? (result.stats.p99 * 100).toFixed(0) : "—"}
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-[10px] text-amber-700 uppercase tracking-wider">
              Área favorável (score ≥ {Math.round(result.scoreThreshold * 100)})
            </div>
            <div className="text-xl font-bold text-amber-800 mt-0.5">
              {result.stats.favorableKm2 != null
                ? `${result.stats.favorableKm2.toFixed(1)} km²`
                : "—"}
            </div>
            <div className="text-[10px] text-amber-600 mt-1 font-mono break-all">
              {result.formula}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Aviso:</strong> Targeting heurístico — combina
            sensoriamento remoto + DEM. Resultado é indicativo e não substitui
            campanhas geofísicas / amostragem geoquímica.
          </div>

          {/* Spatial overlap report */}
          <div className="border-t border-slate-100 pt-3">
            <button onClick={runOverlap} disabled={overlapRunning}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200">
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
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700 leading-relaxed">
              <Loader2 size={12} className="inline animate-spin mr-1.5" />
              A vetorizar zonas favoráveis (300 m) e a intersectar com as camadas administrativas. 30–90 s.
            </div>
          )}

          {overlapError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
              <strong>Erro:</strong> {overlapError}
            </div>
          )}

          {overlapRes && !overlapRunning && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-indigo-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-indigo-500 uppercase">Zonas</div>
                  <div className="text-sm font-bold text-indigo-800">{overlapRes.report.zoneCount}</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-indigo-500 uppercase">Área favorável</div>
                  <div className="text-sm font-bold text-indigo-800">
                    {overlapRes.report.totalFavorableKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km²
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Aldeias dentro</div>
                  <div className="text-sm font-bold text-slate-800">{overlapRes.report.villageCount}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-slate-400 uppercase">Postos admin</div>
                  <div className="text-sm font-bold text-slate-800">{overlapRes.report.adminPostCount}</div>
                </div>
              </div>

              {overlapRes.report.districts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Área favorável por distrito
                    </h5>
                    <button onClick={downloadOverlapCsv}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
                      ⇩ CSV
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                    {overlapRes.report.districts.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 text-slate-700 truncate" title={`${d.district} · ${d.province ?? ""}`}>
                          {d.district}
                          {d.province && <span className="text-slate-400"> · {d.province}</span>}
                        </span>
                        <div className="w-14 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, d.pct)}%` }} />
                        </div>
                        <span className="font-mono text-slate-500 w-16 text-right shrink-0">
                          {d.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km²
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overlapRes.report.villages.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Aldeias nas zonas favoráveis {overlapRes.report.villageCount > overlapRes.report.villages.length
                      ? `(primeiras ${overlapRes.report.villages.length} de ${overlapRes.report.villageCount})` : ""}
                  </h5>
                  <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
                    {overlapRes.report.villages.map((v, i) => (
                      <span key={i} className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                        {v.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {overlapRes.report.notes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[10px] text-amber-700 space-y-0.5">
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
            <label className="text-xs text-slate-500 mb-1 block">Ano de análise</label>
            <div className="relative">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Climatologia de referência: 2001 → {year - 1} (CHIRPS)
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Amostras para o scatter — <strong className="text-slate-700">{samples}</strong>
            </label>
            <input type="range" min={100} max={1000} step={50} value={samples}
              onChange={e => setSamples(Number(e.target.value))}
              className="w-full accent-orange-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
              <MapPin size={12} className="text-orange-500" />
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
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-orange-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A calcular SPI × NDVI…</>
          : <><Droplets size={14} /> Calcular SPI × NDVI</>}
      </button>

      {running && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A somar precipitação CHIRPS de {year - 2001 + 1} anos, calcular anomalia e amostrar NDVI MODIS. Tipicamente 15–40 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-white border border-orange-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Droplets size={13} className="text-orange-600" />
              <span className="text-xs font-semibold text-orange-700">{result.name}</span>
            </div>
            <div className="text-center py-1">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Correlação Pearson (SPI vs NDVI)</div>
              <div className={`text-3xl font-bold ${r != null && Math.abs(r) >= 0.5 ? "text-orange-700" : "text-slate-700"}`}>
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
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">SPI médio</div>
              <div className="text-sm font-bold text-slate-800">
                {result.stats.meanSpi != null ? result.stats.meanSpi.toFixed(2) : "—"}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">NDVI médio</div>
              <div className="text-sm font-bold text-slate-800">
                {result.stats.meanNdvi != null ? result.stats.meanNdvi.toFixed(2) : "—"}
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="text-[10px] text-orange-700 uppercase tracking-wider">
              Área em seca (SPI &lt; −1)
            </div>
            <div className="text-xl font-bold text-orange-800 mt-0.5">
              {result.stats.droughtPct != null ? `${result.stats.droughtPct}%` : "—"}
              {result.stats.droughtKm2 != null && (
                <span className="text-xs font-normal text-orange-600 ml-1.5">
                  ({result.stats.droughtKm2.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} km²)
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10px] text-slate-500 leading-relaxed">
            <strong className="text-slate-700">Interpretação:</strong> SPI &lt; −1 indica seca
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
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800 leading-relaxed">
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
              className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1">
              <X size={11} /> Limpar
            </button>
          )}
        </div>
        {points.length === 0 ? (
          <div className="text-xs text-slate-400 italic px-3 py-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
            Clique no mapa para começar
          </div>
        ) : (
          <div className="space-y-1">
            {points.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
                <span className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold text-[10px]">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-mono text-slate-600">
                  {p[1].toFixed(3)}, {p[0].toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-500 mb-1 block">
          Amostragem — <strong className="text-slate-700">{samples} pontos</strong>
        </label>
        <input type="range" min={50} max={500} step={50} value={samples}
          onChange={e => onSamplesChange(Number(e.target.value))}
          className="w-full accent-sky-500" />
        <p className="text-[10px] text-slate-400 mt-0.5">
          Mais pontos = perfil mais detalhado (DEM nativo 30 m).
        </p>
      </div>

      <button onClick={onRun} disabled={running || points.length < 2}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-sky-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A amostrar DEM…</>
          : <><Route size={14} /> Calcular Perfil</>}
      </button>

      {running && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-700">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A amostrar elevações no DEM Copernicus GLO-30. ~5–15 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Distância</div>
              <div className="text-sm font-bold text-slate-800">
                {(result.stats.totalDistanceM / 1000).toFixed(2)} km
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Amplitude</div>
              <div className="text-sm font-bold text-slate-800">
                {(result.stats.maxElevM - result.stats.minElevM).toFixed(0)} m
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-emerald-600 uppercase flex items-center justify-center gap-1">
                <TrendingUp size={9} /> Subida
              </div>
              <div className="text-sm font-bold text-emerald-700">
                +{result.stats.gainM.toFixed(0)} m
              </div>
            </div>
            <div className="bg-rose-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-rose-600 uppercase flex items-center justify-center gap-1">
                <TrendingDown size={9} /> Descida
              </div>
              <div className="text-sm font-bold text-rose-700">
                −{result.stats.lossM.toFixed(0)} m
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Mín</div>
              <div className="text-sm font-bold text-slate-800">{result.stats.minElevM.toFixed(0)} m</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 uppercase">Máx</div>
              <div className="text-sm font-bold text-slate-800">{result.stats.maxElevM.toFixed(0)} m</div>
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
            <label className="text-xs text-slate-500 mb-1 block">
              Equidistância
            </label>
            <div className="grid grid-cols-4 gap-1">
              {CONTOUR_INTERVALS.map(v => (
                <button key={v} onClick={() => setIntervalM(v)}
                  className={`text-xs py-1.5 rounded-md border transition-colors ${
                    intervalM === v
                      ? "bg-amber-600 text-white border-amber-600 font-semibold"
                      : "bg-white text-slate-600 border-slate-200 hover:border-amber-400"
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
            <label className="text-xs text-slate-500 mb-1 block">
              Linhas-mestras (índice) — a cada{" "}
              <strong className="text-slate-700">{indexEvery}×</strong> ({intervalM * indexEvery} m)
            </label>
            <input type="range" min={2} max={10} value={indexEvery}
              onChange={e => setIndexEvery(Number(e.target.value))}
              className="w-full accent-amber-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Área (clipping)</label>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
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

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-amber-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A gerar curvas…</>
          : <><Waves size={14} /> Gerar Curvas de Nível</>}
      </button>

      {running && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A processar DEM e gerar tiles. ~10–20 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">
                {result.intervals.length} curvas geradas
              </span>
            </div>
            <div className="text-xs text-amber-700">
              Elevação na região: {result.minElevM?.toFixed(0) ?? "—"} m →{" "}
              {result.maxElevM?.toFixed(0) ?? "—"} m
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-2.5">
            <div className="flex items-center gap-2 text-xs mb-1.5">
              <span className="inline-block w-6 h-0.5 bg-[#8b5a2b]" />
              <span className="text-slate-600">Curva ({result.intervalM} m)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-block w-6 h-[2px] bg-[#3a1c0c]" />
              <span className="text-slate-600">Linha-mestra ({result.indexIntervalM} m)</span>
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
        <div className="bg-lime-50 border border-lime-200 rounded-xl p-3 text-xs text-lime-800 leading-relaxed">
          Classificação <strong>ESA WorldCover 2021</strong> a 10 m — 11 classes
          de uso e cobertura do solo (florestas, agricultura, água, mangais…).
        </div>
        <div className="mt-2.5">
          <label className="text-xs text-slate-500 mb-1 block">Área (clipping)</label>
          <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 flex items-center gap-1.5">
            <MapPin size={12} className="text-lime-600" />
            {district
              ? <span>{district} <span className="text-slate-400">·</span> {province}</span>
              : province
                ? <span>{province} <span className="text-slate-400">(toda a província)</span></span>
                : <span className="text-slate-500">Moçambique (toda)</span>}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={running}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-lime-600 hover:bg-lime-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-lime-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A classificar cobertura…</>
          : <><Sprout size={14} /> Calcular Cobertura do Solo</>}
      </button>

      {running && (
        <div className="bg-lime-50 border border-lime-200 rounded-xl p-3 text-xs text-lime-700 leading-relaxed">
          <Loader2 size={12} className="inline animate-spin mr-1.5" />
          A computar áreas por classe a partir do ESA WorldCover (10 m). ~5–20 s.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-3">
          <div className="bg-lime-50 border border-lime-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-lime-600" />
              <span className="text-xs font-semibold text-lime-700">Cobertura calculada</span>
            </div>
            <div className="text-xs text-lime-700">
              Área total: <strong>{result.totalKm2.toLocaleString(undefined, { maximumFractionDigits: 0 })} km²</strong>
              {" · "}{ranked.length} classes presentes
            </div>
          </div>

          {/* Complete area analysis (ranked, only classes > 0) */}
          <div>
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Análise de Área (km² · %)
            </h5>
            <div className="space-y-1.5">
              {ranked.map(c => (
                <div key={c.code} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: c.color }} />
                    <span className="flex-1 truncate text-slate-700">{c.label}</span>
                    <span className="text-slate-400 font-mono">{c.areaKm2.toLocaleString(undefined, { maximumFractionDigits: 1 })} km²</span>
                    <span className="w-11 text-right font-semibold text-lime-700">{c.pct.toFixed(1)}%</span>
                  </div>
                  <div className="ml-5 mt-0.5 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.pct / maxPct) * 100}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full legend (official order, all 11 classes) */}
          <div className="pt-2 border-t border-slate-100">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Legenda (ESA WorldCover)
            </h5>
            <div className="grid grid-cols-1 gap-0.5">
              {result.classes.map(c => (
                <div key={c.code} className="flex items-center gap-2 text-[11px] text-slate-600">
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
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 leading-relaxed">
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
            <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5">
              <input
                type="color"
                value={c.color}
                onChange={e => setColor(i, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0"
              />
              <input
                type="text"
                value={c.label}
                onChange={e => setLabel(i, e.target.value)}
                className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-0"
              />
              <span className="text-[10px] font-mono text-slate-400 w-16 text-right shrink-0">{rangeLabel}</span>
            </div>
          );
        })}
      </div>

      <div>
        <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Limites (m)</h5>
        <div className="grid grid-cols-4 gap-1.5">
          {breaks.map((b, i) => (
            <input
              key={i}
              type="number"
              value={b}
              onChange={e => setBreakAt(i, Number(e.target.value))}
              className="text-xs bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={addClass}
            className="flex-1 text-xs py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded">
            + Adicionar classe
          </button>
          <button onClick={removeLast} disabled={breaks.length <= 1}
            className="flex-1 text-xs py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 rounded">
            − Remover última
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
        <input type="checkbox" checked={waterOn} onChange={e => setWaterOn(e.target.checked)}
          className="accent-emerald-500" />
        <span className="inline-block w-3 h-3 rounded" style={{ background: waterColor }} />
        Incluir Água &amp; Rios (HydroSHEDS)
      </label>

      {!breaksSorted && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-700">
          <AlertTriangle size={11} className="inline mr-1" /> Os limites têm de ser estritamente crescentes (cada um maior que o anterior).
        </div>
      )}

      <button onClick={run} disabled={running || !breaksSorted}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200">
        {running
          ? <><Loader2 size={14} className="animate-spin" /> A classificar DEM…</>
          : <><Play size={14} /> Aplicar Classes</>}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {result && !running && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Distribuição (km² · %)</div>
          {result.labels.map((lbl, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: result.colors[i] }} />
              <span className="flex-1 truncate text-slate-700">{lbl}</span>
              <span className="text-slate-400 font-mono">{result.areasKm2[i].toFixed(1)} km²</span>
              <span className="w-10 text-right font-semibold text-emerald-700">{result.areasPct[i].toFixed(1)}%</span>
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
    title: "Recursos Hídricos & Zonas Costeiras",
    subtitle: "SWIR / NIR · Detecção Espectral de Humidade",
    badge: "SWIR · Humidade",
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    icon: Droplets,
    gradient: "from-cyan-500 to-blue-600",
    description: "Mapeamento da lâmina de água superficial, teor de humidade em folhas e copas (NDMI), ecossistemas de mangais e vulnerabilidade costeira.",
    highlights: ["NDMI (Humidade Foliar)", "NDDI (Stress Hídrico)", "Saúde dos Mangais", "Índice de Exposição Costeira"],
    defaultTab: "ndmi",
    tabIds: ["ndmi", "nddi", "mangrove_health", "coastal_index", "coastal_erosion", "tsunami_risk"],
  },
  {
    id: "geology",
    title: "Geologia Espectral & Potencial Mineral",
    subtitle: "Sentinel-2 SWIR · Alteração Hidrotermal & DEM Sobel",
    badge: "Prospecção Geocientífica",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    icon: Gem,
    gradient: "from-purple-600 to-indigo-600",
    description: "Mapeamento de halos de alteração hidrotermal (argilas, sericite, óxidos de ferro, gossan), extração de lineamentos estruturais e IA de targeting mineral.",
    highlights: ["Alteração Hidrotermal", "Argilas & Saprolite", "Fe-Óxidos & Gossan", "Lineamentos DEM Sobel", "Targeting Mineral Multi-critério"],
    defaultTab: "hydrothermal",
    tabIds: ["hydrothermal", "fe_oxide", "clay", "al_oh", "ferrous", "gossan", "lineaments", "targeting"],
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
    title: "Satélite Óptico & Time-Lapse Multitemporal",
    subtitle: "Sentinel-2 Cloudless EOX · 2016–2024 (10 m)",
    badge: "Time-Lapse & Split-Screen",
    badgeColor: "bg-sky-100 text-sky-800 border-sky-300 font-bold",
    icon: Satellite,
    gradient: "from-sky-500 to-indigo-600",
    description: "Mosaicos anuais de alta resolução (10 m) sem nuvens do Sentinel-2 cobrindo a série 2016 a 2024. Inclui animação contínua Time-Lapse com velocidade ajustável e comparador de tela dividida (Antes vs Depois) para análise de grandes transformações.",
    highlights: ["Time-Lapse Dinâmico (2016–2024)", "Split-Screen (Antes / Depois)", "Ciclones Idai & Freddy", "RGB Cor Real 10 m"],
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
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");
  const { geeConnected } = useGeeAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab]     = useState<SpectralTab>("s2");
  const [showS2, setShowS2]           = useState(false);
  const [selectedYear, setSelectedYear] = useState("2024");
  const [showTimeLapse, setShowTimeLapse] = useState(false);
  const [timeLapsePlaying, setTimeLapsePlaying] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [compareLeftYear, setCompareLeftYear] = useState("2023");
  const [compareRightYear, setCompareRightYear] = useState("2024");
  const [compareMode, setCompareMode] = useState<CompareMode>("temporal_gee");
  const [compareStartDateLeft, setCompareStartDateLeft] = useState("2023-01-01");
  const [compareEndDateLeft, setCompareEndDateLeft] = useState("2023-12-31");
  const [compareStartDateRight, setCompareStartDateRight] = useState("2024-01-01");
  const [compareEndDateRight, setCompareEndDateRight] = useState("2024-12-31");
  const safeCompareLeftYear = String(Math.min(Math.max(parseInt(compareStartDateLeft.slice(0, 4) || compareLeftYear) || 2023, 2016), 2024));
  const safeCompareRightYear = String(Math.min(Math.max(parseInt(compareStartDateRight.slice(0, 4) || compareRightYear) || 2024, 2016), 2024));
  const [geeTileLeft, setGeeTileLeft] = useState<string | null>(null);
  const [geeTileRight, setGeeTileRight] = useState<string | null>(null);
  const [isProcessingCompareGee, setIsProcessingCompareGee] = useState(false);
  const [compareGeeError, setCompareGeeError] = useState<string | null>(null);
  const lastCompareKeyRef = useRef<string>("");
  const [timeLapsePeriodMode, setTimeLapsePeriodMode] = useState<TimeLapsePeriodMode>("recent");
  const [geeStatus, setGeeStatus]     = useState<GeeStatus | null>(null);
  const [geeLoading, setGeeLoading]   = useState(false);
  const [geeTile, setGeeTile]         = useState<GeeResult | null>(null);
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
  const geeReady = Boolean(geeStatus?.connected && useGEE);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [visParams, setVisParams] = useState<RasterVisParams>(DEFAULT_VIS_PARAMS);
  const [visPanelOpen, setVisPanelOpen] = useState(false);
  const [visApplying, setVisApplying] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Compute API params from AOI (includes geometry for global/custom areas)
  const apiParams = useMemo(() => aoiToAPI(aoi), [aoi]);

  const { data: geologyGeoJSON, isFetching } = useGeologyGeoJSON(
    province, district, "code2006",
    activeTab !== "s2" && !useGEE
  );

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

  // Switch to proxy mode automatically if GEE not connected
  useEffect(() => {
    if (geeStatus && !geeStatus.connected) setUseGEE(false);
  }, [geeStatus]);

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

  // Synthetic spectral overlay (proxy mode) — disabled for s2/composite/terrain
  const spectralGeoJSON = useMemo(() => {
    if (!geologyGeoJSON || activeTab === "s2" || activeTab === "spi_ndvi" || useGEE) return null;
    if (GEE_ONLY_INDICES.includes(activeTab as SpectralIndex)) return null;
    const index = activeTab as SpectralIndex;
    return {
      ...geologyGeoJSON,
      features: geologyGeoJSON.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          _spectralColor: applyColormap(
            computeSpectralValue(
              String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
              String(f.properties?.ERA ?? ""),
              String(f.properties?.PERIOD ?? ""),
              index
            ),
            index
          ),
          _spectralValue: computeSpectralValue(
            String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
            String(f.properties?.ERA ?? ""),
            String(f.properties?.PERIOD ?? ""),
            index
          ),
        },
      })),
    };
  }, [geologyGeoJSON, activeTab, useGEE]);

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
                        || isLineaments || isTargeting || isProfile || isContours || isLandCover
                        || isSpiNdvi;
  const isTopoClass   = activeTab === "topo_class";
  const spectralKey = `spectral-${activeTab}-${province}-${district}-${geologyGeoJSON?.features?.length ?? 0}`;
  const geeTileKey  = `gee-${activeTab}-${geeTile?.tileUrl ?? ""}`;

  // Tabs grouped by category — rendered below with section labels
  const tabGroups: { name: string; badge: string; badgeColor: string; tabs: { id: string; label: string; icon: React.ReactNode }[] }[] = [
    { name: "Mosaico Óptico",         badge: "Sentinel-2 · EOX",    badgeColor: "bg-sky-100 text-sky-700",
      tabs: [{ id: "s2", label: "S-2 Cloudless", icon: <Satellite size={13} /> }] },
    { name: "Vegetação & Mineralogia", badge: "Sentinel-2 · 10–20 m", badgeColor: "bg-emerald-100 text-emerald-700",
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
    { name: "Estruturas Geológicas",  badge: "GEE · DEM + Sobel",   badgeColor: "bg-fuchsia-100 text-fuchsia-700",
      tabs: [{ id: "lineaments", label: "Lineamentos", icon: <Activity size={13} /> }] },
    { name: "Potencial Mineral",      badge: "GEE · Multi-critério", badgeColor: "bg-yellow-100 text-yellow-700",
      tabs: [{ id: "targeting",  label: "Targeting",   icon: <Target size={13} /> }] },
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
    { name: "Zonas Costeiras & Marinhas",  badge: "Multi-sensor",          badgeColor: "bg-cyan-100 text-cyan-700",
      tabs: INDEX_DEFS.filter(d => d.group === "coastal").map(d => ({ id: d.id, label: d.short, icon: d.icon })) },
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
      {selectedCategory === null ? (
        /* ════════════════════════════════════════════════════════════════════
           CATALOG VIEW (Cards Persuasivos e Modernos)
           ════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50">
          {/* Catalog Top Bar */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-sm text-white">
                <Satellite size={20} />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  Catálogo de GeoAnálises Especializadas
                </h1>
                <p className="text-xs text-slate-500">
                  Sensoriamento remoto com Google Earth Engine, DEM Copernicus 30m e renderização 3D
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <div className="w-52 sm:w-64">
                <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
              </div>
              {geeLoading
                ? <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Verificando GEE…</span>
                : <GeeStatusBadge status={geeStatus} loading={geeLoading} />}
              {!geeStatus?.connected && (
                <button onClick={() => setGeeCredsOpen(true)}
                  className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-100 transition-colors font-medium">
                  Ligar GEE
                </button>
              )}
            </div>
          </div>

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
                    <Clock size={12} className="text-sky-300" /> Acesso Rápido:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("satellite");
                      setActiveTab("s2");
                      setShowTimeLapse(true);
                      setShowS2(true);
                      setCompareActive(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-md transition-all active:scale-95"
                  >
                    <Clock size={12} className="animate-spin" />
                    <span>Time-Lapse Dinâmico (2016–2024)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("satellite");
                      setActiveTab("s2");
                      setCompareActive(true);
                      setShowTimeLapse(false);
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
                        setShowTimeLapse(true);
                        setShowS2(true);
                      }
                    }}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-sky-400 hover:shadow-xl transition-all duration-200 p-5 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
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

                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium mb-2.5">
                        {cat.subtitle}
                      </p>

                      <p className="text-xs text-slate-600 leading-relaxed mb-4 line-clamp-3">
                        {cat.description}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {cat.highlights.map((h, i) => (
                          <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sky-600 group-hover:text-sky-700">
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
          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-2 shrink-0 z-[550]">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSelectedCategory(null)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-sky-700 bg-slate-100 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 px-3 py-1.5 rounded-xl transition-all shrink-0 shadow-2xs"
                title="Voltar ao catálogo de especialidades"
              >
                <ArrowLeft size={13} />
                <span>Voltar ao Catálogo</span>
              </button>

              <div className="h-5 w-px bg-slate-200 shrink-0" />

              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${activeCategory.gradient} flex items-center justify-center text-white shrink-0 shadow-2xs`}>
                  <activeCategory.icon size={14} />
                </div>
                <div className="min-w-0 hidden lg:block">
                  <h2 className="text-xs font-bold text-slate-800 truncate leading-tight">{activeCategory.title}</h2>
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
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? "bg-sky-500 text-white shadow-xs font-semibold"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium"
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
              {/* TimeLapse toggle button */}
              <button
                type="button"
                onClick={() => {
                  setShowTimeLapse(v => !v);
                  if (compareActive) setCompareActive(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-xs transition-all ${
                  showTimeLapse
                    ? "bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/20 ring-2 ring-sky-300/40 scale-105"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
                }`}
                title="Linha do Tempo e Animação Time-Lapse (2016–2024)"
              >
                <Clock size={13} className={showTimeLapse ? "text-white animate-spin" : "text-sky-500"} />
                <span>Time-Lapse</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-extrabold hidden sm:inline">2016–2024</span>
              </button>

              {/* Split-Screen Compare button */}
              <button
                type="button"
                onClick={() => {
                  setCompareActive(v => !v);
                  if (showTimeLapse) setShowTimeLapse(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-xs transition-all ${
                  compareActive
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20 ring-2 ring-indigo-300/40 scale-105"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
                }`}
                title="Comparar a análise selecionada entre o período padrão 2023 e o período recente (Ecrã Dividido)"
              >
                <Columns2 size={13} className={compareActive ? "text-white" : "text-indigo-600"} />
                <span>Comparar</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-extrabold hidden sm:inline">2023 ⟷ Recente</span>
              </button>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              <button
                onClick={() => handleViewModeChange(viewMode === "2d" ? "3d" : "2d")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-2xs transition-all ${
                  viewMode === "3d"
                    ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white border-transparent shadow-sky-200"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                }`}
                title={viewMode === "3d" ? "Mudar para 2D" : "Mudar para 3D Real"}
              >
                <Globe size={13} />
                <span className="hidden sm:inline">{viewMode === "3d" ? "Modo 3D Real" : "Modo 2D"}</span>
              </button>

              <button
                onClick={exportGeoAnalisesPdf}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs"
                title="Exportar Relatório PDF"
              >
                <FileDown size={13} />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>

          {/* Main workspace content */}
          <div className="flex flex-1 overflow-hidden relative">
            {/* Desktop Sidebar Toggle Button */}
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen(v => !v)}
              style={{ left: desktopSidebarOpen ? "18rem" : "0px" }}
              title={desktopSidebarOpen ? "Recolher painel lateral" : "Expandir painel lateral"}
              className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 backdrop-blur-md border border-l-0 border-slate-200 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 transition-all duration-200 text-slate-500 hover:text-slate-800"
            >
              {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>

            {/* Controls sidebar */}
            <div className={`bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto transition-all duration-200 ${desktopSidebarOpen ? "w-72" : "w-0 overflow-hidden border-r-0"}`}>
              {/* Area filter — AOI global */}
              <div className="p-4 border-b border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Área de Estudo</h4>
                <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
              </div>

              {/* Category subtabs list */}
              <div className="p-3 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                          isActive
                            ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200"
                            : "text-slate-600 hover:bg-slate-50"
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
              {geeStatus?.connected && (
                <div className="p-3 border-b border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Modo GEE</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-[11px]">{useGEE ? "Real" : "Proxy"}</span>
                    <button
                      onClick={() => { setUseGEE(v => !v); setGeeTile(null); }}
                      className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${useGEE ? "bg-sky-500" : "bg-slate-300"}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${useGEE ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              )}
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
            <div className="flex flex-col w-full bg-white/50 space-y-4 pb-4">
          {/* Lineaments Panel */}
          {isLineaments && (
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> Detecção estrutural requer DEM via Google Earth Engine.
                </div>
              ) : (
                <>
                  <LineamentsPanel province={province} district={district} geometry={apiParams.geometry} onResult={setLineamentsTile} />
                  {lineamentsTile && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
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
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
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
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> Classificação topográfica usa o DEM Copernicus via Google Earth Engine.
                </div>
              ) : (
                <TopoClassesPanel province={province} district={district} geometry={apiParams.geometry} onResult={setTopoClassesTile} />
              )}
            </div>
          )}

          {/* Contours Panel */}
          {isContours && (
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> Curvas de nível requerem DEM via Google Earth Engine.
                </div>
              ) : (
                <ContoursPanel province={province} district={district} geometry={apiParams.geometry} onResult={setContoursTile} />
              )}
            </div>
          )}

          {/* Targeting Panel */}
          {isTargeting && (
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> Targeting requer Sentinel-2 + DEM via GEE.
                </div>
              ) : (
                <TargetingPanel province={province} district={district} geometry={apiParams.geometry} onResult={setTargetingTile} onOverlap={setOverlapResult} />
              )}
            </div>
          )}

          {/* SPI × NDVI Panel */}
          {isSpiNdvi && (
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> SPI×NDVI usa CHIRPS + MODIS via Google Earth Engine.
                </div>
              ) : (
                <>
                  <SpiNdviPanel province={province} district={district} geometry={apiParams.geometry} onResult={r => { setSpiNdviResult(r); setShowSpiChart(true); }} />
                  {spiNdviResult && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                      <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Camada no mapa</h5>
                      <div className="flex gap-1.5">
                        {(["spi", "ndvi"] as const).map(m => (
                          <button key={m} onClick={() => setSpiLayerMode(m)}
                            className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                              spiLayerMode === m
                                ? "bg-orange-50 border-orange-300 text-orange-700 font-semibold"
                                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                            }`}>
                            {m === "spi" ? "SPI (seca)" : "NDVI (vegetação)"}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 pt-1">
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
            <div className="p-4 border-b border-slate-100">
              {!geeStatus?.connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <strong>GEE necessário.</strong> Cobertura do solo usa o ESA WorldCover via Google Earth Engine.
                </div>
              ) : (
                <LandCoverPanel province={province} district={district} geometry={apiParams.geometry} onResult={setLandCoverTile} />
              )}
            </div>
          )}

          {/* GEE Analysis Panel (real mode, single index) */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && geeReady && activeTab !== "s2" && activeDef && (
            <div className="p-4 border-b border-slate-100">
              <GeeAnalysisPanel
                activeIndex={activeTab as SpectralIndex}
                province={province}
                district={district}
                geometry={apiParams.geometry}
                geeStatus={geeStatus!}
                onTileReady={setGeeTile}
                onOpenCompare={() => {
                  setCompareActive(true);
                  setCompareMode("temporal_gee");
                }}
              />
            </div>
          )}

          {/* GEE-only warning when proxy is forced */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && !geeReady && isGeeOnly && activeDef && (
            <div className="p-4 border-b border-slate-100">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <strong>Índice apenas GEE.</strong> {activeDef.short} requer dados raster reais (DEM / Landsat). Active GEE no topo para calcular.
              </div>
            </div>
          )}

          {/* Proxy mode controls (only spectral indices have meaningful proxy) */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && !isTopoCustom && !geeReady && activeTab !== "s2" && !isGeeOnly && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Opacidade</h4>
              <input type="range" min={0.1} max={1} step={0.05} value={visParams.opacity}
                onChange={e => setVisParams(prev => ({...prev, opacity: Number(e.target.value)}))} className="w-full accent-sky-500" />
              <div className="text-xs text-slate-400 text-right mt-0.5">{Math.round(visParams.opacity * 100)}%</div>
            </div>
          )}

          {/* Sentinel-2 cloudless controls */}
          {activeTab === "s2" && (
            <div className="p-4 border-b border-slate-100 space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sentinel-2 Cloudless (EOX)</h4>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Ano do mosaico</label>
                <div className="relative">
                  <select className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                    {["2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"].map(y => <option key={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTimeLapse(true);
                    setShowS2(true);
                    if (compareActive) setCompareActive(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-xl text-xs font-bold transition-all shadow-2xs"
                >
                  <Clock size={14} className="text-sky-600" />
                  <span>Abrir Animação Time-Lapse</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCompareActive(true);
                    setShowS2(true);
                    if (showTimeLapse) setShowTimeLapse(false);
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

          {/* Index info — geocientific legend card */}
          {!isComposite && !isLineaments && !isTargeting && !isProfile && !isContours && activeDef && activeTab !== "s2" && (() => {
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
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2 pointer-events-none">
              <Cpu size={13} className="text-sky-500 animate-spin" /> A computar índice proxy…
            </div>
          )}
          {!province && activeTab !== "s2" && !geeReady && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
              <div className="bg-white/95 border border-sky-200 rounded-2xl px-6 py-4 shadow-lg text-center max-w-xs">
                <Layers size={22} className="text-sky-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Selecione uma <strong>província</strong> para calcular o índice espectral proxy.</p>
              </div>
            </div>
          )}

          {/* TimeLapse Player Floating Overlay */}
          {showTimeLapse && !compareActive && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[650] w-[95%] sm:w-[90%] max-w-xl">
              <TimeLapsePlayer
                currentYear={selectedYear}
                onYearChange={setSelectedYear}
                isPlaying={timeLapsePlaying}
                onPlayChange={setTimeLapsePlaying}
                activeAnalysisName={
                  INDEX_DEFS.find((d) => d.id === activeTab)?.label ||
                  (activeTab === "s2" ? "Sentinel-2 Mosaicos" : activeTab)
                }
                periodMode={timeLapsePeriodMode}
                onPeriodModeChange={setTimeLapsePeriodMode}
                onClose={() => setShowTimeLapse(false)}
              />
            </div>
          )}

          {/* Floating HUD status indicator during GEE computation */}
          {compareActive && isProcessingCompareGee && (
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

          {/* Split-Screen Compare Curtain Overlay */}
          {compareActive && (
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

          {viewMode === "3d" ? (
            <MapLibre3DView
              province={province}
              district={district}
              aoi={aoi}
              basemap={basemap}
              viewMode={viewMode}
              onBasemapChange={setBasemap}
              onViewModeChange={handleViewModeChange}
              showProfileTool={selectedCategory === "terrain"}
              overlayRasterUrl={activeOverlayUrl}
              overlayOpacity={visParams.opacity}
              overlayGeoJSON={
                !geeReady && activeTab !== "s2" && spectralGeoJSON
                  ? (spectralGeoJSON as GeoJSON.FeatureCollection)
                  : isTargeting && overlapResult?.zones?.features?.length
                  ? (overlapResult.zones as GeoJSON.FeatureCollection)
                  : null
              }
              overlayGeoJSONKey={spectralKey}
              className="w-full h-full"
            />
          ) : (
            <>
              {/* Basemap Switcher (Google Maps) */}
              <BasemapSwitcher
                current={basemap}
                onChange={setBasemap}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                className="absolute bottom-16 sm:bottom-6 left-4 z-[600]"
                position="bottom-left"
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
                }}
              />
            )}
            <MapTools />
            <MapDraw
              enabled={drawingEnabled}
              hasDrawnAOI={aoi.source === "draw"}
              onClearAOI={() => onAOIChange(GLOBAL_AOI)}
              onDrawComplete={(geom, label) => { setDrawingEnabled(false); onAOIChange(customAOI(geom, label, "draw")); }}
              onCancel={() => setDrawingEnabled(false)}
            />
          </MapContainer>
        </>
      )}
          {/* RasterVisPanel — floating visualization controls */}
          {geeReady && geeTile && activeTab !== "s2" && (
            <>
              {/* Toggle button */}
              <button
                onClick={() => setVisPanelOpen(v => !v)}
                className="absolute top-4 left-4 z-[700] bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-xs font-medium text-slate-700 hover:text-sky-600 hover:border-sky-400 transition-colors flex items-center gap-1.5 pointer-events-auto"
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
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 w-52 pointer-events-none">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">{activeDef.label} (Proxy)</div>
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
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-fuchsia-200 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity size={12} className="text-fuchsia-500" />
                <div className="text-xs font-semibold text-fuchsia-700">Lineamentos (DEM)</div>
              </div>
              <div className="text-xs text-slate-500">
                Orientação dominante: <strong className="text-fuchsia-700">{dominantOrientation(lineamentsTile.rose)}</strong>
              </div>
              <div className="text-xs text-slate-400">
                {lineamentsTile.sampleCount.toLocaleString()} pixels · densidade média {(lineamentsTile.meanDensity ?? 0).toFixed(3)}
              </div>
            </div>
          )}

          {/* Contours result badge */}
          {isContours && contoursTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-amber-200 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Waves size={12} className="text-amber-700" />
                <div className="text-xs font-semibold text-amber-800">Curvas de Nível ({contoursTile.intervalM} m)</div>
              </div>
              <div className="text-xs text-slate-500">
                Elevação: {contoursTile.minElevM?.toFixed(0) ?? "—"} m → {contoursTile.maxElevM?.toFixed(0) ?? "—"} m
              </div>
              <div className="text-xs text-slate-400">
                {contoursTile.intervals.length} curvas · linhas-mestras a cada {contoursTile.indexIntervalM} m
              </div>
            </div>
          )}

          {/* Profile chart overlay */}
          {isProfile && profileResult && (
            <div className="absolute bottom-8 left-4 right-4 z-[500] bg-white/97 backdrop-blur rounded-xl shadow-lg border border-sky-200 px-4 pt-3 pb-1"
                 style={{ height: 200 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Route size={12} className="text-sky-600" />
                  <div className="text-xs font-semibold text-sky-800">
                    Perfil Topográfico — {(profileResult.stats.totalDistanceM / 1000).toFixed(2)} km ·{" "}
                    Δ {(profileResult.stats.maxElevM - profileResult.stats.minElevM).toFixed(0)} m
                  </div>
                </div>
                <button onClick={() => { setProfileResult(null); setProfilePoints([]); }}
                  className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1">
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
            <div className="absolute bottom-8 left-4 z-[500] bg-white/97 backdrop-blur rounded-xl shadow-lg border border-orange-200 px-4 pt-3 pb-1"
                 style={{ height: 230, width: 380 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Droplets size={12} className="text-orange-600" />
                  <div className="text-xs font-semibold text-orange-800">
                    SPI × NDVI {spiNdviResult.year} — r = {spiNdviResult.stats.pearsonR != null ? spiNdviResult.stats.pearsonR.toFixed(2) : "—"}
                    {" · "}{spiNdviResult.stats.sampleCount} amostras
                  </div>
                </div>
                <button onClick={() => setShowSpiChart(false)}
                  className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1">
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
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-orange-200 p-3 w-60">
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets size={12} className="text-orange-600" />
                <div className="text-xs font-semibold text-orange-700">
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
                className="mt-1.5 text-[10px] text-orange-600 hover:text-orange-800 font-medium">
                ↺ reabrir gráfico
              </button>
            </div>
          )}

          {/* Custom Topo Classes legend */}
          {isTopoCustom && topoClassesTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-emerald-200 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sliders size={12} className="text-emerald-600" />
                <div className="text-xs font-semibold text-emerald-800">Classes Topográficas</div>
              </div>
              <div className="space-y-0.5">
                {topoClassesTile.labels.map((lbl, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px]">
                    <span className="inline-block w-2.5 h-2.5 rounded shrink-0"
                      style={{ background: topoClassesTile.colors[i] }} />
                    <span className="truncate flex-1 text-slate-700">{lbl}</span>
                    <span className="text-slate-400 font-mono">{topoClassesTile.areasPct[i].toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Targeting result badge */}
          {isTargeting && targetingTile && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-amber-200 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <Gem size={12} className="text-amber-500" />
                <div className="text-xs font-semibold text-amber-700">Potencial: {targetingTile.mineralName}</div>
              </div>
              <div className="text-xs text-slate-500">
                Score médio: <strong className="text-amber-700">{((targetingTile.stats.meanScore ?? 0) * 100).toFixed(0)}/100</strong>
                {" · "}P95: <strong className="text-amber-700">{((targetingTile.stats.p95 ?? 0) * 100).toFixed(0)}</strong>
              </div>
              <div className="text-xs text-slate-400">
                Área favorável: {targetingTile.stats.favorableKm2 != null
                  ? `${targetingTile.stats.favorableKm2.toFixed(1)} km²`
                  : "—"}
              </div>
              {/* On-map legend: what the score raster means */}
              <div className="mt-2 pt-2 border-t border-amber-100">
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Favorabilidade (0–100)</div>
                <div className="h-2 rounded-full" style={{ background: "linear-gradient(to right,#0d47a1,#7b1fa2,#e53935,#fdd835,#fffde7)" }} />
                <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>0 · baixa</span><span>alta · 100</span></div>
              </div>
            </div>
          )}

          {/* GEE result badge */}
          {activeTab !== "s2" && !isLineaments && !isTargeting && geeTile && geeReady && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-emerald-200 p-3 w-64 pointer-events-none">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <div className="text-xs font-semibold text-emerald-700">GEE Real</div>
              </div>
              <div className="text-xs text-slate-500">{geeTile.name.split("—")[0].trim()}</div>
              {geeTile.sceneCount > 0 && (
                <div className="text-xs text-slate-400">{geeTile.sceneCount} cenas · {geeTile.dateRange}</div>
              )}
              {isTopoClass && (
                <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {["#1a9850","#66bd63","#fee08b","#fdae61","#a50026","#3690c0"].map((c, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded shrink-0" style={{ background: c }} />
                      <span className="truncate">{TERRAIN_CLASS_NAMES[i]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
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

