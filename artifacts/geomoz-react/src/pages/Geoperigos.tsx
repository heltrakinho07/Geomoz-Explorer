import { SidebarResize, useSidebarWidth } from "@/components/SidebarResize";
/**
 * Geoperigos — Módulo de Geoperigos / Geohazards
 *
 * Cheias: extensão de inundação por radar Sentinel-1 (vê através das nuvens
 *   durante ciclones) com deteção de mudança evento vs. linha de base.
 * Erosão: risco de perda de solo por RUSLE (A = R·K·LS·C·P), 5 classes.
 */

import { useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, ScaleControl, ZoomControl, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle, Waves, Mountain, Flame, Loader2, Play, ChevronDown, Info,
  CheckCircle2, Calendar, Droplets, Layers, FileDown, SlidersHorizontal, X,
  ChevronLeft, ChevronRight, RefreshCw, Thermometer, Sprout,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { hazardsText, type HazardsCopyKey } from "@/i18n/hazards";
import { apiUrl, apiFetch } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import ZoneSelect from "@/components/ZoneSelect";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI, mozambiqueAOI } from "@/lib/aoi";
import { useGeeAuth } from "@/hooks/useGeeAuth";
import GeeCredentialsDialog from "@/components/GeeCredentialsDialog";
import {
  createPDFContext, drawCover, sectionTitle, addPDFFooter, MARGIN, CONTENT_W,
  drawStatCards, drawTable, addMapImage, fetchMapImage,
} from "@/lib/pdf-export";

type Tool = "flood" | "erosion" | "wildfire" | "drought" | "burned" | "soil_moisture";

interface FloodResult {
  floodTile: string; permWaterTile: string; areaKm2: number;
  scenesEvent: number; scenesBaseline: number; eventStart: string; eventEnd: string;
}
interface ErosionClass { id: number; label: string; color: string; range: string; areaKm2: number }
interface ErosionResult { tile: string; classes: ErosionClass[]; meanTPerHa: number | null; year: number }

interface WildfireHotspot {
  lat: number;
  lon: number;
  tempCelsius: number | null;
  confidence: number;
}

interface WildfireResult {
  tile: string;
  hotspotCount: number;
  meanTempCelsius: number | null;
  startDate: string;
  endDate: string;
  minConfidence: number;
  confidenceMode: "percent" | "categorical";
  hotspotPoints?: WildfireHotspot[];
  sensor: string;
  resolutionMeters: number;
  imageCount: number;
  source: string;
}

interface DroughtResult {
  spiTileUrl: string;
  ndviTileUrl: string;
  name: string;
  year: number;
  climStart: number;
  stats: {
    pearsonR: number | null;
    pValue: number | null;
    meanSpi: number | null;
    meanNdvi: number | null;
    droughtKm2: number | null;
    droughtPct: number | null;
    sampleCount: number;
  };
}

interface BurnedAreaResult {
  tile: string;
  areaKm2: number;
  areaPct: number;
  startDate: string;
  endDate: string;
  imageCount: number;
  source: string;
}

interface SoilMoistureCrop {
  crop: string;
  sensitivity: string;
  requiredMoisture: string;
  status: "Favorável" | "Alerta" | "Severo" | "Crítico";
}

interface SoilMoistureClass {
  id: string;
  label: string;
  km2: number;
  pct: number;
  color: string;
}

interface SoilMoistureResult {
  tile: string;
  layer: "susm" | "ssm" | "smp" | "susma";
  layerLabel: string;
  unit: string;
  startDate: string;
  endDate: string;
  imageCount: number;
  meanValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  totalAreaKm2: number;
  stressAreaKm2: number;
  stressPct: number;
  classes: SoilMoistureClass[];
  riskLevel: "Favorável" | "Moderado" | "Crítico";
  riskSummary: string;
  crops: SoilMoistureCrop[];
  palette: string[];
  visMin: number;
  visMax: number;
  source: string;
}

// Known cyclone events (quick presets for flood mapping).
const FLOOD_PRESETS = [
  { label: "Idai (mar 2019)",     start: "2019-03-15", end: "2019-03-25", prov: "Sofala" },
  { label: "Kenneth (abr 2019)",  start: "2019-04-25", end: "2019-05-03", prov: "Cabo Delgado" },
  { label: "Eloise (jan 2021)",   start: "2021-01-22", end: "2021-01-30", prov: "Sofala" },
  { label: "Freddy (mar 2023)",   start: "2023-03-11", end: "2023-03-20", prov: "Zambézia" },
];

// Fire season presets for Mozambique
const WILDFIRE_PRESETS = [
  { label: "Niassa & Cabo Delgado (2024)", start: "2024-08-01", end: "2024-10-31", prov: "Niassa" },
  { label: "Zambézia & Sofala (2024)",     start: "2024-07-01", end: "2024-11-15", prov: "Zambézia" },
  { label: "Tete & Manica (2024)",         start: "2024-08-15", end: "2024-11-01", prov: "Tete" },
  { label: "Temporada Seca 2023",          start: "2023-08-01", end: "2023-11-30", prov: null },
];

// Soil moisture / agricultural presets for Mozambique
const SOIL_MOISTURE_PRESETS = [
  { label: "Campanha Principal 2023/24 (Floração)", start: "2024-01-15", end: "2024-03-31", layer: "susm" as const, prov: null },
  { label: "Seca El Niño Sul 2024 (Jan–Abr)",       start: "2024-01-01", end: "2024-04-30", layer: "susma" as const, prov: "Gaza" },
  { label: "Época Seca / Fresca 2024 (Jun–Ago)",    start: "2024-06-01", end: "2024-08-31", layer: "susm" as const, prov: null },
  { label: "Sementeira 2024/25 (Nov–Dez)",          start: "2024-11-01", end: "2024-12-31", layer: "ssm" as const, prov: "Nampula" },
];

interface Props {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
}

export default function Geoperigos({ aoi, province, district, onProvinceChange, onDistrictChange, onAOIChange }: Props) {
  const { toast } = useToast();
  const { translatedLocale } = usePortalTranslation();
  const h = useCallback((key: HazardsCopyKey) => hazardsText(translatedLocale, key), [translatedLocale]);
  const numberLocale = translatedLocale === "pt" ? "pt-MZ" : translatedLocale;
  const riskLabel = (value: string): string => {
    const lookup: Record<string, HazardsCopyKey> = { "Favorável": "risk.favorable", "Moderado": "risk.moderate", "Crítico": "risk.critical", "Alerta": "risk.alert", "Severo": "risk.severe" };
    return lookup[value] ? h(lookup[value]) : value;
  };
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { geeConnected: isGeeConnected, loading: geeAuthLoading } = useGeeAuth();
  const [geeDialogOpen, setGeeDialogOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("flood");
  const [basemap, setBasemap] = useState<BasemapType>("terrain");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarSize = useSidebarWidth("geomoz-Geoperigos-sidebar", 288);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  // Flood params
  const [eventStart, setEventStart] = useState("2019-03-15");
  const [eventEnd,   setEventEnd]   = useState("2019-03-25");
  const [showPerm,   setShowPerm]   = useState(true);
  const [flood, setFlood] = useState<FloodResult | null>(null);

  // Erosion params
  const [year, setYear] = useState(2023);
  const [erosion, setErosion] = useState<ErosionResult | null>(null);

  // Wildfire params (NASA FIRMS)
  const [wildfireStart, setWildfireStart] = useState("2024-08-01");
  const [wildfireEnd,   setWildfireEnd]   = useState("2024-10-31");
  const [minConfidence, setMinConfidence] = useState(50);
  const [wildfire, setWildfire] = useState<WildfireResult | null>(null);

  // Drought params (CHIRPS SPI × MODIS NDVI)
  const [droughtYear, setDroughtYear] = useState(2024);
  const [climStart, setClimStart] = useState(2001);
  const [drought, setDrought] = useState<DroughtResult | null>(null);

  // Historical burned-area params (MODIS MCD64A1)
  const [burnedStart, setBurnedStart] = useState("2024-07-01");
  const [burnedEnd, setBurnedEnd] = useState("2024-11-30");
  const [burned, setBurned] = useState<BurnedAreaResult | null>(null);

  // Soil moisture params (NASA-USDA SMAP)
  const [soilStart, setSoilStart] = useState("2024-01-15");
  const [soilEnd, setSoilEnd] = useState("2024-03-31");
  const [soilLayer, setSoilLayer] = useState<"susm" | "ssm" | "smp" | "susma">("susm");
  const [soilMoisture, setSoilMoisture] = useState<SoilMoistureResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  const runFlood = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForSentinel"),
      });
      return;
    }
    setLoading(true); setError(null); setFlood(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/flood", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          event_start: eventStart,
          event_end: eventEnd,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data = await r.json();
      setFlood(data);
      toast({
        title: h("toast.floodSuccess"),
        description: `${h("toast.floodArea")} ${data.areaKm2} km² (Sentinel-1 SAR).`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.floodTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.floodError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, eventStart, eventEnd, isGeeConnected, h]);

  const runErosion = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForRUSLE"),
      });
      return;
    }
    setLoading(true); setError(null); setErosion(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/erosion", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          year,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data = await r.json();
      setErosion(data);
      toast({
        title: h("toast.erosionSuccess"),
        description: `${h("toast.erosionLoss")} ${data.meanTPerHa ?? "—"} ${h("units.soilLoss")} (${h("year").toLowerCase()} ${year}).`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.erosionTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.erosionError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, year, isGeeConnected, h]);

  const runWildfire = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForFIRMS"),
      });
      return;
    }
    setLoading(true); setError(null); setWildfire(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/wildfire", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          start_date: wildfireStart,
          end_date: wildfireEnd,
          min_confidence: minConfidence,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data = await r.json();
      setWildfire(data);
      toast({
        title: h("toast.wildfireSuccess"),
        description: `${h("toast.wildfireCount")} ${data.hotspotCount.toLocaleString(numberLocale)} (NASA FIRMS).`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.wildfireTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.wildfireError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, wildfireStart, wildfireEnd, minConfidence, isGeeConnected, h, numberLocale]);


  const runDrought = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForDrought"),
      });
      return;
    }
    setLoading(true); setError(null); setDrought(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/drought", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          year: droughtYear,
          clim_start: climStart,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data = await r.json();
      setDrought(data);
      toast({
        title: h("toast.droughtSuccess"),
        description: data.stats?.droughtPct != null
          ? `${data.stats.droughtPct}% ${h("toast.droughtShare")}`
          : h("toast.droughtMap"),
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.droughtTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.droughtError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, droughtYear, climStart, isGeeConnected, h]);

  const runBurnedArea = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForBurned"),
      });
      return;
    }
    setLoading(true); setError(null); setBurned(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/burned-area", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          start_date: burnedStart,
          end_date: burnedEnd,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data = await r.json();
      setBurned(data);
      toast({
        title: h("toast.burnedSuccess"),
        description: `${data.areaKm2.toLocaleString(numberLocale)} km² ${h("toast.burnedArea")}`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.burnedTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.burnedError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, burnedStart, burnedEnd, isGeeConnected, h, numberLocale]);

  const runSoilMoisture = useCallback(async () => {
    if (!isGeeConnected) {
      setGeeDialogOpen(true);
      toast({
        title: h("gee.required"),
        description: h("gee.connectForSMAP"),
      });
      return;
    }
    setLoading(true); setError(null); setSoilMoisture(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const aoiPayload = aoiToAPI(aoi);
      const prov = province || aoiPayload.province;
      const dist = district || aoiPayload.district;
      const r = await apiFetch("/geomoz-api/gee/soil-moisture", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({
          province: prov,
          district: dist,
          geometry: aoiPayload.geometry,
          start_date: soilStart,
          end_date: soilEnd,
          layer: soilLayer,
        }),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.detail ?? r.statusText);
      }
      const data: SoilMoistureResult = await r.json();
      setSoilMoisture(data);
      toast({
        title: h("toast.soilSuccess"),
        description: `NASA SMAP: ${data.stressPct}% ${h("toast.soilDeficit")} (${data.riskLevel}).`,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? h("toast.soilTimeout") : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: h("toast.soilError"), description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [aoi, province, district, soilStart, soilEnd, soilLayer, isGeeConnected, h]);

  const erosionTotal = erosion ? erosion.classes.reduce((s, c) => s + c.areaKm2, 0) || 1 : 1;

  // ── PDF Export ──────────────────────────────────────────────────────────────
  async function exportGeoperigosPdf() {
    if (!mapContainerRef.current) return;
    const toolTitle = tool === "flood" ? `${h("tool.flood")} SAR` : tool === "erosion" ? `${h("tool.erosion")} RUSLE` : tool === "wildfire" ? `${h("tool.wildfire")} FIRMS` : tool === "drought" ? h("result.droughtTitle") : tool === "burned" ? `${h("tool.burned")} MODIS` : h("result.soilTitle");
    const ctx = createPDFContext(
      `${toolTitle} — ${province ?? h("pdf.country")}`,
    );
    drawCover(ctx, `${h("pdf.title")} — ${toolTitle}`, [
      `${h("pdf.tool")} ${toolTitle}`,
      `${province ? `${h("pdf.province")} ${province}` : `${h("pdf.area")} ${h("pdf.country")}`}`,
      ctx.date,
    ]);

    // Map — fetch from backend Cartopy API with analysis tile overlay
    const analysisTile = tool === "flood" ? flood?.floodTile : tool === "erosion" ? erosion?.tile : tool === "wildfire" ? wildfire?.tile : tool === "drought" ? drought?.spiTileUrl : tool === "burned" ? burned?.tile : soilMoisture?.tile;
    const legendItems = tool === "erosion"
      ? erosion?.classes?.map(c => ({ label: c.label, color: c.color }))
      : tool === "soil_moisture"
      ? soilMoisture?.classes?.map(c => ({ label: `${c.label} (${c.pct}%)`, color: c.color }))
      : undefined;
    try {
      const imgData = await fetchMapImage(
        { south: -26.9, north: -10.4, west: 30.2, east: 41 },
        { tileUrl: analysisTile,
          legendItems,
          title: `${toolTitle} — ${province ?? h("pdf.country")}`,
          dpi: 200 },
      );
      addMapImage(ctx, imgData, 100);
    } catch (e) {
      console.warn("Map fetch failed:", e);
    }

    if (tool === "flood" && flood) {
      sectionTitle(ctx, h("result.floodTitle"));
      drawStatCards(ctx, [
        { label: h("result.floodArea"), value: `${flood.areaKm2.toLocaleString(numberLocale)} km²`, color: [225, 29, 72] },
        { label: h("result.eventScenes"), value: `${flood.scenesEvent}`, color: [239, 68, 68] },
        { label: h("result.baselineScenes"), value: `${flood.scenesBaseline}`, color: [100, 116, 139] },
        { label: h("result.floodPeriod"), value: `${flood.eventStart}→${flood.eventEnd}`, color: [14, 165, 233] },
      ]);
      sectionTitle(ctx, h("pdf.methodology"));
      ctx.doc.setFontSize(7.5);
      ctx.doc.setTextColor(100, 116, 139);
      ctx.doc.text(h("pdf.floodMethod1"), MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text(h("pdf.floodMethod2"), MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text(h("pdf.floodMethod3"), MARGIN, ctx.y);
      ctx.y += 8;
    }

    if (tool === "erosion" && erosion) {
      sectionTitle(ctx, h("result.erosionTitle"));
      drawStatCards(ctx, [
        { label: h("pdf.erosionMean"), value: `${erosion.meanTPerHa?.toFixed(1) ?? "—"} t/ha/ano`, color: [245, 158, 11] },
        { label: h("year"), value: `${erosion.year}`, color: [249, 115, 22] },
        { label: h("pdf.classes"), value: `${erosion.classes.length}`, color: [14, 165, 233] },
        { label: h("pdf.source"), value: "CHIRPS+DEM+MODIS", color: [100, 116, 139] },
      ]);

      sectionTitle(ctx, h("pdf.classDistribution"));
      drawTable(
        ctx,
        [h("pdf.class"), h("pdf.areaKm2"), "%", h("pdf.loss")],
        erosion.classes.map(c => ({
          cells: [
            c.label,
            c.areaKm2.toLocaleString(numberLocale, { maximumFractionDigits: 1 }),
            ((c.areaKm2 / erosionTotal) * 100).toFixed(1),
            c.range,
          ],
          color: c.color,
        })),
        [CONTENT_W * 0.28, CONTENT_W * 0.24, CONTENT_W * 0.14, CONTENT_W * 0.34],
      );
    }

    if (tool === "wildfire" && wildfire) {
      sectionTitle(ctx, h("pdf.fireDetection"));
      drawStatCards(ctx, [
        { label: h("pdf.totalHotspots"), value: `${wildfire.hotspotCount.toLocaleString(numberLocale)}`, color: [225, 29, 72] },
        { label: h("pdf.avgTemp"), value: wildfire.meanTempCelsius != null ? `${wildfire.meanTempCelsius} °C` : "—", color: [249, 115, 22] },
        { label: h("pdf.confidence"), value: `≥ ${wildfire.minConfidence}%`, color: [245, 158, 11] },
        { label: h("result.floodPeriod"), value: `${wildfire.startDate}→${wildfire.endDate}`, color: [14, 165, 233] },
      ]);
      sectionTitle(ctx, h("pdf.methodSensors"));
      ctx.doc.setFontSize(7.5);
      ctx.doc.setTextColor(100, 116, 139);
      ctx.doc.text(h("pdf.fireMethod1"), MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text(h("pdf.fireMethod2"), MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text(h("pdf.fireMethod3"), MARGIN, ctx.y);
      ctx.y += 8;
    }

    if (tool === "drought" && drought) {
      sectionTitle(ctx, h("pdf.droughtSection"));
      drawStatCards(ctx, [
        { label: h("result.spiArea"), value: drought.stats.droughtPct != null ? `${drought.stats.droughtPct}%` : "—", color: [194, 65, 12] },
        { label: h("result.meanSpi"), value: drought.stats.meanSpi != null ? drought.stats.meanSpi.toFixed(2) : "—", color: [234, 88, 12] },
        { label: h("result.meanNdvi"), value: drought.stats.meanNdvi != null ? drought.stats.meanNdvi.toFixed(3) : "—", color: [101, 163, 13] },
        { label: h("pdf.source"), value: "CHIRPS + MODIS", color: [100, 116, 139] },
      ]);
    }

    if (tool === "burned" && burned) {
      sectionTitle(ctx, h("pdf.burnedSection"));
      drawStatCards(ctx, [
        { label: h("tool.burned"), value: `${burned.areaKm2.toLocaleString(numberLocale)} km²`, color: [153, 27, 27] },
        { label: h("result.aoiPct"), value: `${burned.areaPct.toLocaleString(numberLocale)}%`, color: [220, 38, 38] },
        { label: h("result.resolution"), value: "500 m", color: [234, 88, 12] },
        { label: h("pdf.source"), value: "MODIS MCD64A1", color: [100, 116, 139] },
      ]);
    }

    if (tool === "soil_moisture" && soilMoisture) {
      sectionTitle(ctx, h("pdf.soilSection"));
      drawStatCards(ctx, [
        { label: h("pdf.meanMoisture"), value: soilMoisture.meanValue != null ? `${soilMoisture.meanValue} ${soilMoisture.unit}` : "—", color: [16, 185, 129] },
        { label: h("result.stressedArea"), value: `${soilMoisture.stressPct}%`, color: [225, 29, 72] },
        { label: h("pdf.riskLevel"), value: riskLabel(soilMoisture.riskLevel), color: [245, 158, 11] },
        { label: h("pdf.layer"), value: soilMoisture.layer.toUpperCase(), color: [14, 165, 233] },
      ]);

      sectionTitle(ctx, h("result.moistureClasses"));
      drawTable(
        ctx,
        [h("pdf.class"), h("pdf.areaKm2"), "%"],
        soilMoisture.classes.map(c => ({
          cells: [
            c.label,
            c.km2.toLocaleString(numberLocale, { maximumFractionDigits: 1 }),
            `${c.pct}%`,
          ],
          color: c.color,
        })),
        [CONTENT_W * 0.5, CONTENT_W * 0.25, CONTENT_W * 0.25],
      );

      sectionTitle(ctx, h("pdf.cropImpact"));
      drawTable(
        ctx,
        [h("pdf.crop"), h("pdf.sensitivity"), h("pdf.condition")],
        soilMoisture.crops.map(cr => ({
          cells: [
            cr.crop,
            cr.sensitivity,
            riskLabel(cr.status),
          ],
          color: cr.status === "Favorável" ? "#16a34a" : cr.status === "Alerta" ? "#d97706" : "#dc2626",
        })),
        [CONTENT_W * 0.35, CONTENT_W * 0.45, CONTENT_W * 0.2],
      );
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_Geoperigos_${tool}_${province ?? "MZ"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50 relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[650] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      {desktopSidebarOpen && <SidebarResize panel={sidebarSize} breakpoint="md" />}
      <div
        ref={sidebarSize.ref}
        style={sidebarSize.style}
        className={`fixed md:relative inset-y-0 left-0 z-[700] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 shrink-0 shadow-xl md:shadow-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${
          desktopSidebarOpen ? "md:w-[var(--gm-sidebar-width)] overflow-y-auto" : "md:w-0 overflow-hidden md:border-r-0"
        }`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
              <AlertTriangle size={15} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("title")}</h2>
                <button
                  type="button"
                  onClick={() => setGeeDialogOpen(true)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 border transition-colors cursor-pointer ${
                    isGeeConnected
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                  }`}
                  title={isGeeConnected ? h("gee.connectedTitle") : h("gee.connectTitle")}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isGeeConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {isGeeConnected ? h("gee.active") : h("gee.connect")}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">{h("subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tool toggle */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {([
              ["flood", "tool.flood", Waves],
              ["erosion", "tool.erosion", Mountain],
              ["wildfire", "tool.wildfire", Flame],
              ["drought", "tool.drought", Droplets],
              ["burned", "tool.burned", Layers],
              ["soil_moisture", "tool.soil", Sprout],
            ] as const).map(([t, label, Icon]) => (
              <button key={t} onClick={() => { setTool(t); setError(null); }}
                className={`flex items-center justify-center gap-1 text-[11px] font-medium py-2 rounded-lg transition-all ${tool === t ? "bg-white dark:bg-slate-700 text-rose-700 dark:text-rose-400 shadow-sm font-semibold" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                <Icon size={12} /> {h(label)}
              </button>
            ))}
          </div>
        </div>

        {!isGeeConnected && (
          <div className="m-3 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
            <div className="font-semibold flex items-center gap-1">
              <AlertTriangle size={13} className="text-amber-600" />
              <span>{h("gee.required")}</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {h("gee.explanation")}
            </p>
            <button
              type="button"
              onClick={() => setGeeDialogOpen(true)}
              className="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              {h("gee.connectTitle")}
            </button>
          </div>
        )}

        {/* Área de estudo — AOI global */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{h("studyArea")}</h4>
          <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
        </div>

        {/* Flood config */}
        {tool === "flood" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-2.5 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-blue-500" />
              <span>{h("flood.description")}</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("presets")}</label>
              <div className="grid grid-cols-2 gap-1">
                {FLOOD_PRESETS.map(p => (
                  <button key={p.label} onClick={() => {
                    setEventStart(p.start);
                    setEventEnd(p.end);
                    onProvinceChange(p.prov);
                    onDistrictChange(null);
                    onAOIChange(mozambiqueAOI(p.prov, null));
                  }}
                    className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-200 dark:hover:border-rose-800 transition-colors cursor-pointer">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("start")}</label>
                <input type="date" value={eventStart} onChange={e => setEventStart(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("end")}</label>
                <input type="date" value={eventEnd} onChange={e => setEventEnd(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
            </div>
            <label className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
              {h("permanentWater")} <input type="checkbox" checked={showPerm} onChange={e => setShowPerm(e.target.checked)} className="accent-blue-600" />
            </label>
            <button onClick={runFlood} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer">
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{h("flood.processing")}</span>
                </>
              ) : flood ? (
                <>
                  <RefreshCw size={14} />
                  <span>{h("flood.recalculate")}</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>{h("flood.map")}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Erosion config */}
        {tool === "erosion" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-2.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <span><strong>A = R·K·LS·C·P</strong> — {h("erosion.description")}</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("year")} — <strong className="text-slate-700 dark:text-slate-200">{year}</strong></label>
              <input type="range" min={2018} max={2024} step={1} value={year} onChange={e => setYear(+e.target.value)} className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>2018</span><span>2024</span></div>
            </div>
            <button onClick={runErosion} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer">
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{h("erosion.processing")}</span>
                </>
              ) : erosion ? (
                <>
                  <RefreshCw size={14} />
                  <span>{h("erosion.recalculate")} ({year})</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>{h("erosion.calculate")}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Wildfire config (NASA FIRMS) */}
        {tool === "wildfire" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-2.5 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <span>{h("wildfire.description")}</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("wildfire.seasons")}</label>
              <div className="grid grid-cols-2 gap-1">
                {WILDFIRE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setWildfireStart(p.start);
                      setWildfireEnd(p.end);
                      if (p.prov) {
                        onProvinceChange(p.prov);
                        onDistrictChange(null);
                        onAOIChange(mozambiqueAOI(p.prov, null));
                      }
                    }}
                    className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-200 dark:hover:border-amber-800 transition-colors cursor-pointer text-left truncate"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1">
                  <Calendar size={9} /> {h("start")}
                </label>
                <input
                  type="date"
                  value={wildfireStart}
                  onChange={e => setWildfireStart(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1">
                  <Calendar size={9} /> {h("end")}
                </label>
                <input
                  type="date"
                  value={wildfireEnd}
                  onChange={e => setWildfireEnd(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">
                {h("result.confidenceFilter")} — <strong className="text-slate-700 dark:text-slate-200">{minConfidence}%</strong>
              </label>
              <select
                value={minConfidence}
                onChange={e => setMinConfidence(+e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value={30}>{h("wildfire.confidenceLow")}</option>
                <option value={50}>{h("wildfire.confidenceNominal")}</option>
                <option value={80}>{h("wildfire.confidenceHigh")}</option>
              </select>
            </div>

            <button
              onClick={runWildfire}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{h("wildfire.processing")}</span>
                </>
              ) : wildfire ? (
                <>
                  <RefreshCw size={14} />
                  <span>{h("wildfire.recalculate")}</span>
                </>
              ) : (
                <>
                  <Flame size={14} />
                  <span>{h("wildfire.map")}</span>
                </>
              )}
            </button>
          </div>
        )}


        {/* Drought config */}
        {tool === "drought" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-2.5 text-[11px] text-orange-800 dark:text-orange-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-orange-500" />
              <span>{h("drought.description")}</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("drought.year")} — <strong className="text-slate-700 dark:text-slate-200">{droughtYear}</strong></label>
              <input type="range" min={2006} max={2025} step={1} value={droughtYear} onChange={e => setDroughtYear(+e.target.value)} className="w-full accent-orange-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>2006</span><span>2025</span></div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("drought.climStart")}</label>
              <select value={climStart} onChange={e => setClimStart(+e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200">
                {[1991, 1995, 2000, 2001, 2005, 2010].filter(v => v <= droughtYear - 5).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <button onClick={runDrought} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer">
              {loading ? <><Loader2 size={14} className="animate-spin" /><span>{h("drought.processing")}</span></> :
               drought ? <><RefreshCw size={14} /><span>{h("drought.recalculate")}</span></> :
               <><Play size={14} /><span>{h("drought.map")}</span></>}
            </button>
          </div>
        )}

        {/* Historical burned-area config */}
        {tool === "burned" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-2.5 text-[11px] text-red-800 dark:text-red-300 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-red-500" />
              <span>{h("burned.description")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("start")}</label>
                <input type="date" value={burnedStart} onChange={e => setBurnedStart(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("end")}</label>
                <input type="date" value={burnedEnd} onChange={e => setBurnedEnd(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200" />
              </div>
            </div>
            <button onClick={runBurnedArea} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors cursor-pointer">
              {loading ? <><Loader2 size={14} className="animate-spin" /><span>{h("burned.processing")}</span></> :
               burned ? <><RefreshCw size={14} /><span>{h("burned.recalculate")}</span></> :
               <><Flame size={14} /><span>{h("burned.map")}</span></>}
            </button>
          </div>
        )}

        {/* Soil Moisture config (NASA-USDA SMAP 10km) */}
        {tool === "soil_moisture" && (
          <div className="p-3 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-2.5 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
              <Sprout size={13} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{h("soil.description")}</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("soil.campaigns")}</label>
              <div className="grid grid-cols-2 gap-1">
                {SOIL_MOISTURE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setSoilStart(p.start);
                      setSoilEnd(p.end);
                      setSoilLayer(p.layer);
                      if (p.prov) {
                        onProvinceChange(p.prov);
                        onDistrictChange(null);
                        onAOIChange(mozambiqueAOI(p.prov, null));
                      }
                    }}
                    className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors cursor-pointer text-left truncate"
                    title={p.label}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">{h("soil.layer")}</label>
              <select
                value={soilLayer}
                onChange={e => setSoilLayer(e.target.value as any)}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="susm">{h("soil.layer.susm")}</option>
                <option value="susma">{h("soil.layer.susma")}</option>
                <option value="ssm">{h("soil.layer.ssm")}</option>
                <option value="smp">{h("soil.layer.smp")}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("start")}</label>
                <input
                  type="date"
                  value={soilStart}
                  min="2015-04-02"
                  onChange={e => setSoilStart(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block flex items-center gap-1"><Calendar size={9} /> {h("end")}</label>
                <input
                  type="date"
                  value={soilEnd}
                  min="2015-04-02"
                  onChange={e => setSoilEnd(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>

            <button
              onClick={runSoilMoisture}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{h("soil.processing")}</span>
                </>
              ) : soilMoisture ? (
                <>
                  <RefreshCw size={14} />
                  <span>{h("soil.recalculate")}</span>
                </>
              ) : (
                <>
                  <Sprout size={14} />
                  <span>{h("soil.map")}</span>
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <div className="m-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-2.5 text-[11px] text-red-700 dark:text-red-300">{error}</div>
        )}
      </div>

      {/* Desktop collapse toggle button */}
      <button
        type="button"
        onClick={() => setDesktopSidebarOpen(v => !v)}
        style={{ left: desktopSidebarOpen ? sidebarSize.width : 0 }}
        title={desktopSidebarOpen ? h("sidebar.collapse") : h("sidebar.expand")}
        className="hidden md:flex z-[550] absolute top-1/2 -translate-y-1/2 w-4 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-md items-center justify-center shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {desktopSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative" ref={mapContainerRef}>
        {/* Mobile floating sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen(v => !v)}
          className="md:hidden absolute top-3 left-3 z-[600] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <SlidersHorizontal size={13} className="text-rose-600 dark:text-rose-400" />
          {h("filters")}
        </button>

        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer
            key={basemap}
            crossOrigin="anonymous"
            url={GOOGLE_BASEMAPS[basemap].url}
            subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
            attribution={GOOGLE_BASEMAPS[basemap].attribution}
            maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
          />
          <ScaleControl position="bottomright" imperial={false} />
          <ZoomControl position="topright" />
          <AreaSelect
            province={province} district={district}
            onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
            onDistrictChange={onDistrictChange}
            accent="#e11d48"
          />
          {tool === "flood" && flood && showPerm && (
            <TileLayer crossOrigin="anonymous" key={`perm-${flood.permWaterTile}`} url={flood.permWaterTile} opacity={0.6} maxZoom={18} />
          )}
          {tool === "flood" && flood && (
            <TileLayer crossOrigin="anonymous" key={`flood-${flood.floodTile}`} url={flood.floodTile} opacity={0.85} maxZoom={18} />
          )}
          {tool === "erosion" && erosion && (
            <TileLayer crossOrigin="anonymous" key={`ero-${erosion.tile}`} url={erosion.tile} opacity={0.75} maxZoom={18} />
          )}
          {tool === "wildfire" && wildfire && (
            <TileLayer crossOrigin="anonymous" key={`fire-${wildfire.tile}`} url={wildfire.tile} opacity={0.88} maxZoom={18} />
          )}
          {tool === "drought" && drought && (
            <TileLayer crossOrigin="anonymous" key={`drought-${drought.spiTileUrl}`} url={drought.spiTileUrl} opacity={0.78} maxZoom={18} />
          )}
          {tool === "burned" && burned && (
            <TileLayer crossOrigin="anonymous" key={`burned-${burned.tile}`} url={burned.tile} opacity={0.82} maxZoom={18} />
          )}
          {tool === "soil_moisture" && soilMoisture && (
            <TileLayer crossOrigin="anonymous" key={`smap-${soilMoisture.tile}`} url={soilMoisture.tile} opacity={0.82} maxZoom={18} />
          )}
          {tool === "wildfire" && wildfire?.hotspotPoints?.map((pt, idx) => (
            <CircleMarker
              key={`fire-pt-${idx}`}
              center={[pt.lat, pt.lon]}
              radius={5}
              pathOptions={{
                color: "#7a0000",
                fillColor: pt.tempCelsius && pt.tempCelsius > 75 ? "#ff0000" : "#ff8000",
                fillOpacity: 0.9,
                weight: 1.5,
              }}
            >
              <Popup>
                <div className="p-1 text-xs space-y-1">
                  <div className="font-bold text-red-600 flex items-center gap-1">
                    <Flame size={12} /> {h("popup.hotspot")}
                  </div>
                  <div>{h("popup.temp")} <strong>{pt.tempCelsius != null ? `${pt.tempCelsius} °C` : "—"}</strong></div>
                  <div>{h("popup.confidence")} <strong>{
                    wildfire.confidenceMode === "categorical"
                      ? ([h("popup.low"), h("popup.nominal"), h("popup.high")][pt.confidence] ?? pt.confidence)
                      : `${pt.confidence}%`
                  }</strong></div>
                  <div className="text-[10px] text-slate-400">{h("popup.coords")} {pt.lat.toFixed(4)}, {pt.lon.toFixed(4)}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          <MapTools />
          <MapDraw
            enabled={drawingEnabled}
            hasDrawnAOI={aoi.source === "draw"}
            onClearAOI={() => onAOIChange(GLOBAL_AOI)}
            onDrawComplete={(geom, label) => { setDrawingEnabled(false); onAOIChange(customAOI(geom, label, "draw")); }}
            onCancel={() => setDrawingEnabled(false)}
          />
        </MapContainer>

        <BasemapSwitcher
          current={basemap}
          onChange={setBasemap}
          className="absolute bottom-16 sm:bottom-6 left-4 z-[600]"
          position="bottom-left"
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-[600] bg-white/55 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 px-7 py-5 flex items-center gap-3 max-w-xs">
              <Loader2 size={20} className="text-rose-500 animate-spin shrink-0" />
              <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                {tool === "flood"
                  ? h("loading.flood")
                  : tool === "erosion"
                  ? h("loading.erosion")
                  : tool === "wildfire"
                  ? h("loading.wildfire")
                  : tool === "drought"
                  ? h("loading.drought")
                  : tool === "burned"
                  ? h("loading.burned")
                  : h("loading.soil")}
              </span>
            </div>
          </div>
        )}

        {/* Legend */}
        {tool === "erosion" && erosion && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-amber-100 dark:border-amber-900/40 p-3 text-[11px] min-w-[150px]">
            <div className="font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1"><Mountain size={11} /> {h("result.erosionTitle")} ({h("units.soilLoss")})</div>
            {erosion.classes.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 mb-1">
                <span className="inline-block w-4 h-3 rounded" style={{ background: c.color }} />
                <span className="text-slate-600 dark:text-slate-300">{c.label}</span>
              </div>
            ))}
          </div>
        )}
        {tool === "flood" && flood && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-rose-100 dark:border-rose-900/40 p-3 text-[11px] min-w-[140px]">
            <div className="font-semibold text-rose-800 dark:text-rose-300 mb-2 flex items-center gap-1"><Waves size={11} /> {h("legend.flood")}</div>
            <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-4 h-3 rounded bg-[#d50000]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.inundation")}</span></div>
            {showPerm && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded bg-[#1565c0]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.permanent")}</span></div>}
          </div>
        )}
        {tool === "wildfire" && wildfire && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-amber-100 dark:border-amber-900/40 p-3 text-[11px] min-w-[170px]">
            <div className="font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1">
              <Flame size={12} className="text-red-500" /> {h("legend.hotspots")}
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-block w-4 h-3 rounded bg-[#fff000]" />
              <span className="text-slate-600 dark:text-slate-300">32°C – 52°C ({h("legend.low")})</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-block w-4 h-3 rounded bg-[#ff8000]" />
              <span className="text-slate-600 dark:text-slate-300">52°C – 77°C ({h("legend.moderate")})</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-block w-4 h-3 rounded bg-[#ff0000]" />
              <span className="text-slate-600 dark:text-slate-300">77°C – 102°C ({h("legend.high")})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-3 rounded bg-[#7a0000]" />
              <span className="text-slate-600 dark:text-slate-300">&gt; 102°C ({h("legend.extreme")})</span>
            </div>
          </div>
        )}
      </div>


        {tool === "drought" && drought && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-orange-100 dark:border-orange-900/40 p-3 text-[11px] min-w-[165px]">
            <div className="font-semibold text-orange-800 dark:text-orange-300 mb-2 flex items-center gap-1"><Droplets size={11} /> SPI — {h("tool.drought")}</div>
            <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-4 h-3 rounded bg-[#7f0000]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.extremeDrought")}</span></div>
            <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-4 h-3 rounded bg-[#d73027]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.moderateDrought")}</span></div>
            <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded bg-[#2166ac]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.wet")}</span></div>
          </div>
        )}
        {tool === "burned" && burned && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-red-100 dark:border-red-900/40 p-3 text-[11px] min-w-[150px]">
            <div className="font-semibold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1"><Layers size={11} /> {h("tool.burned")}</div>
            <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded bg-[#9d0208]" /><span className="text-slate-600 dark:text-slate-300">{h("legend.fireScar")}</span></div>
          </div>
        )}
        {tool === "soil_moisture" && soilMoisture && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-xl shadow-lg border border-emerald-100 dark:border-emerald-900/40 p-3 text-[11px] min-w-[175px]">
            <div className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1">
              <Sprout size={12} className="text-emerald-600 dark:text-emerald-400" /> {h("result.soilTitle")}
            </div>
            {soilMoisture.classes.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 mb-1">
                <span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />
                <span className="text-slate-600 dark:text-slate-300">{c.label} ({c.pct}%)</span>
              </div>
            ))}
          </div>
        )}
      {/* ── Right panel ─────────────────────────────────────────── */}
      {((tool === "flood" && flood) || (tool === "erosion" && erosion) || (tool === "wildfire" && wildfire) || (tool === "drought" && drought) || (tool === "burned" && burned) || (tool === "soil_moisture" && soilMoisture)) && (
        <div className="w-80 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-y-auto shrink-0">
          {tool === "flood" && flood && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Waves size={15} className="text-rose-600 dark:text-rose-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.floodTitle")}</span></div>
              <div className="bg-gradient-to-r from-rose-600 to-orange-600 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">{h("result.floodArea")}</div>
                <div className="text-3xl font-bold">{flood.areaKm2.toLocaleString(numberLocale)}</div>
                <div className="text-xs opacity-75">km²</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span>{h("result.floodPeriod")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{flood.eventStart} → {flood.eventEnd}</span></div>
                <div className="flex justify-between"><span>{h("result.eventScenes")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{flood.scenesEvent}</span></div>
                <div className="flex justify-between"><span>{h("result.baselineScenes")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{flood.scenesBaseline}</span></div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl p-3 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-blue-500" /> {h("result.floodCaution")}
              </div>
              <button onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
          {tool === "erosion" && erosion && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Mountain size={15} className="text-amber-600 dark:text-amber-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.erosionTitle")}</span></div>
              {erosion.meanTPerHa != null && (
                <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-4 text-white">
                  <div className="text-xs opacity-75 mb-1">{h("result.avgSoilLoss")} · {erosion.year}</div>
                  <div className="text-3xl font-bold">{erosion.meanTPerHa.toLocaleString(numberLocale)}</div>
                  <div className="text-xs opacity-75">{h("units.soilLoss")}</div>
                </div>
              )}
              <div className="space-y-1.5">
                {erosion.classes.map(c => {
                  const pct = (c.areaKm2 / erosionTotal) * 100;
                  return (
                    <div key={c.id}>
                      <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300 mb-0.5">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />{c.label}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{c.areaKm2.toLocaleString(numberLocale)} km²</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info size={12} className="mt-0.5 shrink-0 text-amber-500" /> {h("result.erosionCaution")}
              </div>
              <button onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
          {tool === "wildfire" && wildfire && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Flame size={15} className="text-red-600 dark:text-red-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.wildfireTitle")}</span>
              </div>
              <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">{h("result.hotspotsCount")}</div>
                <div className="text-3xl font-bold">{wildfire.hotspotCount.toLocaleString(numberLocale)}</div>
                <div className="text-xs opacity-75">{h("result.activeAnomalies")}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between">
                  <span>{h("result.analysedPeriod")}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{wildfire.startDate} → {wildfire.endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>{h("result.avgTemp")}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {wildfire.meanTempCelsius != null ? `${wildfire.meanTempCelsius} °C` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{h("result.confidenceFilter")}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {wildfire.confidenceMode === "categorical"
                      ? (wildfire.minConfidence >= 80 ? h("popup.high") : wildfire.minConfidence >= 50 ? h("popup.nominal") : h("popup.low"))
                      : `≥ ${wildfire.minConfidence}%`}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>{h("result.sensor")}</span>
                  <span className="font-medium text-right text-slate-800 dark:text-slate-200">{wildfire.sensor}</span>
                </div>
                <div className="flex justify-between">
                  <span>{h("result.resolution")}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{wildfire.resolutionMeters} m</span>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
                {wildfire.confidenceMode === "categorical"
                  ? h("result.viirsCaution")
                  : h("result.modisCaution")}
              </div>
              <button
                onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
          {tool === "drought" && drought && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Droplets size={15} className="text-orange-600 dark:text-orange-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.droughtTitle")}</span></div>
              <div className="bg-gradient-to-r from-orange-700 to-amber-500 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">{h("result.spiArea")}</div>
                <div className="text-3xl font-bold">{drought.stats.droughtPct != null ? drought.stats.droughtPct.toLocaleString(numberLocale) : "—"}%</div>
                <div className="text-xs opacity-75">{drought.stats.droughtKm2 != null ? `${drought.stats.droughtKm2.toLocaleString(numberLocale)} km²`  : h("result.meteorologicalDrought")}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span>{h("year")}</span><span className="font-medium">{drought.year}</span></div>
                <div className="flex justify-between"><span>{h("result.climatology")}</span><span className="font-medium">{drought.climStart}–{drought.year - 1}</span></div>
                <div className="flex justify-between"><span>{h("result.meanSpi")}</span><span className="font-medium">{drought.stats.meanSpi != null ? drought.stats.meanSpi.toFixed(2) : "—"}</span></div>
                <div className="flex justify-between"><span>{h("result.meanNdvi")}</span><span className="font-medium">{drought.stats.meanNdvi != null ? drought.stats.meanNdvi.toFixed(3) : "—"}</span></div>
                <div className="flex justify-between"><span>{h("result.correlation")}</span><span className="font-medium">{drought.stats.pearsonR != null ? drought.stats.pearsonR.toFixed(2) : "—"}</span></div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3 text-[11px] text-orange-800 dark:text-orange-300 flex items-start gap-2">
                <Info size={12} className="mt-0.5 shrink-0 text-orange-500" /> {h("result.droughtCaution")}
              </div>
              <button
                onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
          {tool === "burned" && burned && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Layers size={15} className="text-red-700 dark:text-red-400" /><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.burnedTitle")}</span></div>
              <div className="bg-gradient-to-r from-red-800 to-orange-600 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">{h("result.burnedPeriod")}</div>
                <div className="text-3xl font-bold">{burned.areaKm2.toLocaleString(numberLocale)}</div>
                <div className="text-xs opacity-75">km² · {burned.areaPct.toLocaleString(numberLocale)}% {h("result.aoiPct")}</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span>{h("result.floodPeriod")}</span><span className="font-medium">{burned.startDate} → {burned.endDate}</span></div>
                <div className="flex justify-between"><span>{h("result.resolution")}</span><span className="font-medium">500 m</span></div>
                <div className="flex justify-between"><span>{h("result.product")}</span><span className="font-medium">MCD64A1 v6.1</span></div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl p-3 text-[11px] text-red-800 dark:text-red-300 flex items-start gap-2">
                <Info size={12} className="mt-0.5 shrink-0 text-red-500" /> {h("result.burnedCaution")}
              </div>
              <button
                onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-red-700 to-orange-700 hover:from-red-800 hover:to-orange-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
          {tool === "soil_moisture" && soilMoisture && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Sprout size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{h("result.soilTitle")}</span>
              </div>

              {/* Hero Banner */}
              <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">{soilMoisture.layerLabel}</div>
                <div className="text-3xl font-bold">
                  {soilMoisture.meanValue != null ? `${soilMoisture.meanValue} ${soilMoisture.unit}` : "—"}
                </div>
                <div className="text-xs opacity-90 mt-1 flex items-center justify-between">
                  <span>{h("result.criticalDeficit")} <strong>{soilMoisture.stressPct}% da AOI</strong></span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    soilMoisture.riskLevel === "Favorável"
                      ? "bg-emerald-500/30 text-emerald-100"
                      : soilMoisture.riskLevel === "Moderado"
                      ? "bg-amber-500/30 text-amber-100"
                      : "bg-red-500/40 text-red-100"
                  }`}>
                    {riskLabel(soilMoisture.riskLevel)}
                  </span>
                </div>
              </div>

              {/* Diagnostics Summary */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
                <div className="flex justify-between"><span>{h("result.floodPeriod")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{soilMoisture.startDate} → {soilMoisture.endDate}</span></div>
                <div className="flex justify-between"><span>{h("result.analysedArea")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{soilMoisture.totalAreaKm2.toLocaleString(numberLocale)} km²</span></div>
                <div className="flex justify-between"><span>{h("result.stressedArea")}</span><span className="font-medium text-red-600 dark:text-red-400 font-bold">{soilMoisture.stressAreaKm2.toLocaleString(numberLocale)} km² ({soilMoisture.stressPct}%)</span></div>
                <div className="flex justify-between"><span>{h("result.observations")}</span><span className="font-medium text-slate-800 dark:text-slate-200">{soilMoisture.imageCount} {h("result.passes")}</span></div>
              </div>

              {/* Distribution by Classes */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{h("result.moistureClasses")}</div>
                {soilMoisture.classes.map(c => (
                  <div key={c.id}>
                    <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300 mb-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: c.color }} />
                        {c.label}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {c.km2.toLocaleString(numberLocale)} km² ({c.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Crop Vulnerability Matrix */}
              <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 rounded-xl p-3 space-y-2 text-[11px]">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Sprout size={13} className="text-emerald-600" />
                  {h("result.agriImpact")}
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                  {soilMoisture.riskSummary}
                </p>
                <div className="space-y-1.5 pt-1">
                  {soilMoisture.crops.map((cr, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white dark:bg-slate-800/80 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700/60 text-[10px]">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{cr.crop}</div>
                        <div className="text-slate-400 text-[9px]">{cr.requiredMoisture}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        cr.status === "Favorável"
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                          : cr.status === "Alerta"
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                          : "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300"
                      }`}>
                        {riskLabel(cr.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <FileDown size={13} /> {h("result.exportPdf")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* GEE Credentials Dialog */}
      <GeeCredentialsDialog open={geeDialogOpen} onOpenChange={setGeeDialogOpen} />
    </div>
  );
}
