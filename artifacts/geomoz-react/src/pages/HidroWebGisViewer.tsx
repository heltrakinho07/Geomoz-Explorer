import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  ZoomControl,
  ScaleControl,
} from "react-leaflet";
import type { Map as LMap, Layer } from "leaflet";
import {
  Layers,
  Droplets,
  Download,
  Share2,
  Mountain,
  Activity,
  Gauge,
  Wind,
  Waves,
  Zap,
  FileText,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Compass,
  Ruler,
  Globe,
  ArrowLeft,
  Eye,
  MapPin,
  GitBranch,
  X,
  FileCode,
} from "lucide-react";
import { downloadStandaloneBasinHtml } from "@/lib/standalone-html-export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import {
  renderBasinMapToDataUrl,
  createPDFContext,
  addPDFFooter,
  drawCover,
  drawCoordinateGrid,
  drawNorthArrow,
  drawGraphicScaleBar,
  captureMapImage,
  fetchMapImage,
  MARGIN,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from "@/lib/pdf-export";
import { apiUrl } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface LandCoverClass {
  code: number;
  label: string;
  color: string;
  areaKm2: number;
  pct: number;
}

interface BasinReport {
  morphometry: {
    areaKm2: number;
    perimeterKm: number;
    elevMinM: number;
    elevMeanM: number;
    elevMaxM: number;
    reliefM: number;
    slopeMeanDeg: number;
    slopeMaxDeg: number;
    drainageDensity: number;
    compactness: number;
    formFactor: number;
  };
  landcover: LandCoverClass[];
  landcoverTile: string;
  precipMonthly: number[];
  precipAnnualMm: number;
  runoff: { cnMean: number | null; cnTile: string; note: string };
}

interface BasinStats {
  areaKm2: number;
  perimeterKm: number;
  elevMinM: number;
  elevMeanM: number;
  elevMaxM: number;
  slopeMeanDeg: number;
  ndviMean: number | null;
  ndwiMean: number | null;
  precipMmYr: number;
  erosionRisk: number;
  floodRisk: number;
  hydroPotential: number;
}

interface WatershedResult {
  tileUrl: string;
  geojson: GeoJSON.FeatureCollection;
  pourPoint: [number, number];
  areaKm2: number;
  source?: string;
  level?: number;
}

interface SharedData {
  basinReport: BasinReport;
  wsStats?: BasinStats | null;
  watershedData?: WatershedResult | null;
  watershedDrainageTile?: string | null;
  pourPoint?: [number, number] | null;
  province?: string | null;
  district?: string | null;
  title?: string;
}

interface Props {
  id?: string;
}

// ── Helper functions ──────────────────────────────────────────────────────────

function computeGeoJsonBounds(geojson: any): { south: number; north: number; west: number; east: number } {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  function traverse(coords: any) {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = coords[0], lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    } else if (Array.isArray(coords)) {
      coords.forEach(traverse);
    }
  }
  if (geojson?.features) {
    geojson.features.forEach((f: any) => traverse(f.geometry?.coordinates));
  } else if (geojson?.coordinates) {
    traverse(geojson.coordinates);
  }
  if (minLat >= maxLat || minLng >= maxLng) {
    return { south: -26.9, north: -10.4, west: 30.2, east: 41.0 };
  }
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.05);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.05);
  return {
    south: Math.max(-90, minLat - padLat),
    north: Math.min(90, maxLat + padLat),
    west: Math.max(-180, minLng - padLng),
    east: Math.min(180, maxLng + padLng),
  };
}

export default function HidroWebGisViewer({ id: propId }: Props) {
  const [shareId, setShareId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sharedData, setSharedData] = useState<SharedData | null>(null);

  // Map state
  const mapRef = useRef<LMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [basemap, setBasemap] = useState<BasemapType>("terrain");
  const [activeLayer, setActiveLayer] = useState<"none" | "lulc" | "cn">("lulc");
  const [showDrainage, setShowDrainage] = useState<boolean>(true);
  const [showBasinPolygon, setShowBasinPolygon] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // PDF Export modal
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [exportType, setExportType] = useState<"both" | "lulc" | "cn">("both");
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  // Link copy feedback
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = propId || params.get("id") || "";
    setShareId(id);

    if (!id) {
      // Try local storage fallback
      const cached = localStorage.getItem("geomoz_last_hidro_share");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setSharedData(parsed);
          setLoading(false);
          return;
        } catch {}
      }
      setError("Nenhum identificador de análise partilhada fornecido.");
      setLoading(false);
      return;
    }

    // 1. Instant recovery from local cache if this share was opened or created here
    let hasLocalCache = false;
    try {
      const cachedById = localStorage.getItem(`geomoz_share_${id}`);
      if (cachedById) {
        const parsed = JSON.parse(cachedById);
        setSharedData(parsed);
        setLoading(false);
        hasLocalCache = true;
      }
    } catch {}

    // 2. Fetch from server to sync / load if first time
    async function fetchShare() {
      if (!hasLocalCache) setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/geomoz-api/share/${id}`));
        if (!res.ok) {
          if (!hasLocalCache) {
            throw new Error("A análise solicitada não foi encontrada ou o link expirou.");
          }
          return;
        }
        const json = await res.json();
        const data: SharedData = json.data;
        setSharedData(data);
        try {
          localStorage.setItem(`geomoz_share_${id}`, JSON.stringify(data));
          localStorage.setItem("geomoz_last_hidro_share", JSON.stringify(data));
        } catch {}
      } catch (err: any) {
        if (!hasLocalCache) {
          setError(err.message || "Erro ao carregar os dados partilhados.");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchShare();
  }, [propId]);

  // Fit bounds when map or geojson loads
  useEffect(() => {
    if (!mapRef.current || !sharedData?.watershedData?.geojson) return;
    try {
      const b = computeGeoJsonBounds(sharedData.watershedData.geojson);
      mapRef.current.fitBounds([
        [b.south, b.west],
        [b.north, b.east],
      ]);
    } catch {}
  }, [sharedData]);

  const report = sharedData?.basinReport;
  const wsData = sharedData?.watershedData;
  const wsStats = sharedData?.wsStats;
  const PP = sharedData?.pourPoint;

  const totalArea = report?.morphometry?.areaKm2 || wsData?.areaKm2 || 0;

  // Copy share URL
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── QGIS-Style PDF Generator ──────────────────────────────────────────────
  async function generateQgisPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = PAGE_W;
      const H = PAGE_H;
      const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
      let pageNum = 1;

      const newPage = (pageTitle: string) => {
        addPDFFooter({ doc, pageNum, date, y: 0, title: "" });
        doc.addPage();
        pageNum++;
        // Mini top bar
        doc.setFillColor(15, 23, 42); // Navy 900
        doc.rect(0, 0, W, 10, "F");
        doc.setFillColor(2, 132, 199); // Sky 600
        doc.rect(0, 9, W, 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("GeoMoz Explorer · WebGIS", MARGIN, 6.5);
        doc.setFont("helvetica", "normal");
        doc.text(pageTitle, W - MARGIN, 6.5, { align: "right" });
        return 18;
      };

      const sectionLabel = (label: string, curY: number) => {
        doc.setFillColor(248, 250, 252);
        doc.rect(MARGIN, curY, CONTENT_W, 7, "F");
        doc.setDrawColor(226, 232, 240);
        doc.line(MARGIN, curY, MARGIN + CONTENT_W, curY);
        doc.line(MARGIN, curY + 7, MARGIN + CONTENT_W, curY + 7);
        doc.setFillColor(2, 132, 199);
        doc.rect(MARGIN, curY, 3, 7, "F");
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text(label.toUpperCase(), MARGIN + 6, curY + 5);
        return curY + 11;
      };

      // ── PAGE 1: RELATÓRIO TÉCNICO & MORFOMETRIA ──────────────────────────
      // Top Header
      doc.setFillColor(15, 23, 42); // Dark Navy #0f172a
      doc.rect(0, 0, W, 35, "F");
      doc.setFillColor(2, 132, 199); // Cyan accent #0284c7
      doc.rect(0, 31, W, 4, "F");

      // Emblem
      doc.setFillColor(255, 255, 255);
      doc.circle(MARGIN + 8, 17, 8, "F");
      doc.setFillColor(2, 132, 199);
      doc.circle(MARGIN + 8, 17, 5.5, "F");
      doc.setFillColor(255, 255, 255);
      doc.circle(MARGIN + 8, 17, 2, "F");

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(17);
      doc.setFont("helvetica", "bold");
      doc.text("GeoMoz Explorer", MARGIN + 20, 15);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      doc.text("Relatório Hidro-Ambiental de Bacia · WebGIS", MARGIN + 20, 23);

      // Area + Date right
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Área: ${totalArea.toLocaleString("pt-PT")} km²`, W - MARGIN, 14, { align: "right" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(date, W - MARGIN, 22, { align: "right" });

      // Info strip
      doc.setFillColor(240, 249, 255);
      doc.rect(0, 35, W, 10, "F");
      doc.setTextColor(3, 105, 161);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const infoParts = [
        PP ? `Exutório: ${PP[0].toFixed(4)}°, ${PP[1].toFixed(4)}°` : "Área Delimitada",
        `Fonte: ${wsData?.source === "polygon" ? "Recorte por Polígono / AOI" : "HydroSHEDS / D8"}`,
        `Datum: WGS 84 (EPSG:4326)`,
      ];
      doc.text(infoParts.join("   ·   "), MARGIN, 42);

      let y = 52;

      // Morfometria
      y = sectionLabel("Morfometria da Bacia", y);
      const m = report.morphometry;
      const cards = [
        { label: "Área", val: `${totalArea.toLocaleString("pt-PT")}`, unit: "km²" },
        { label: "Perímetro", val: `${m.perimeterKm.toFixed(0)}`, unit: "km" },
        { label: "Elev. mín.", val: `${m.elevMinM.toFixed(0)}`, unit: "m" },
        { label: "Elev. média", val: `${m.elevMeanM.toFixed(0)}`, unit: "m" },
        { label: "Elev. máx.", val: `${m.elevMaxM.toFixed(0)}`, unit: "m" },
        { label: "Relevo", val: `${m.reliefM.toFixed(0)}`, unit: "m" },
        { label: "Declive méd.", val: `${m.slopeMeanDeg.toFixed(1)}`, unit: "°" },
        { label: "Declive máx.", val: `${m.slopeMaxDeg.toFixed(1)}`, unit: "°" },
        { label: "Dens. dren.", val: `${m.drainageDensity}`, unit: "km/km²" },
        { label: "Compacidade", val: `${m.compactness}`, unit: "" },
        { label: "Fator forma", val: `${m.formFactor}`, unit: "" },
      ];
      const cCols = 4;
      const cW = (CONTENT_W - (cCols - 1) * 2.5) / cCols;
      const cH = 13.5;
      cards.forEach((c, i) => {
        const cx = MARGIN + (i % cCols) * (cW + 2.5);
        const cy = y + Math.floor(i / cCols) * (cH + 2.5);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(cx, cy, cW, cH, 2, 2, "F");
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(cx, cy, cW, cH, 2, 2, "S");
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(c.label, cx + 4, cy + 4.8);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text(c.val, cx + 4, cy + 11.5);
        if (c.unit) {
          doc.setTextColor(148, 163, 184);
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "normal");
          doc.text(c.unit, cx + cW - 4, cy + 11.5, { align: "right" });
        }
      });
      y += Math.ceil(cards.length / cCols) * (cH + 2.5) + 4;

      // Uso e Cobertura do Solo
      y = sectionLabel("Uso e Cobertura do Solo (ESA WorldCover 2021)", y);
      const lcItems = report.landcover.filter(lc => lc.areaKm2 > 0).slice(0, 8);
      const maxPct = lcItems[0]?.pct ?? 1;

      doc.setFillColor(226, 232, 240);
      doc.rect(MARGIN, y, CONTENT_W, 6.5, "F");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("Classe", MARGIN + 4, y + 4.5);
      doc.text("Área (km²)", W - MARGIN - 34, y + 4.5, { align: "right" });
      doc.text("Proporção", W - MARGIN, y + 4.5, { align: "right" });
      y += 6.5;

      lcItems.forEach((lc, i) => {
        const rowH = 6;
        if (i % 2 === 0) {
          doc.setFillColor(250, 252, 255);
          doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
        }
        try {
          const hc = lc.color.replace("#", "");
          const r = parseInt(hc.substring(0, 2), 16);
          const g = parseInt(hc.substring(2, 4), 16);
          const b = parseInt(hc.substring(4, 6), 16);
          if (!isNaN(r)) {
            doc.setFillColor(r, g, b);
            doc.roundedRect(MARGIN + 2.5, y + 1, 5, 4, 0.6, 0.6, "F");
          }
        } catch {}
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        const name = lc.label.length > 35 ? lc.label.slice(0, 33) + "…" : lc.label;
        doc.text(name, MARGIN + 12, y + 4.2);
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.text(lc.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 }), W - MARGIN - 34, y + 4.2, { align: "right" });

        const barW = Math.max((lc.pct / maxPct) * 14, 0.5);
        doc.setFillColor(2, 132, 199);
        doc.rect(W - MARGIN - 26, y + 2, barW, 2, "F");
        doc.setTextColor(2, 132, 199);
        doc.setFont("helvetica", "bold");
        doc.text(`${lc.pct}%`, W - MARGIN, y + 4.2, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += rowH;
      });
      y += 3;

      // Chuva mensal
      y = sectionLabel(`Precipitação Mensal · ${report.precipAnnualMm.toLocaleString("pt-PT")} mm/ano`, y);
      const months = "JanFevMarAbrMaiJunJulAgoSetOutNovDez".match(/.{3}/g) || [];
      const barH = 30;
      const barArea = CONTENT_W - 4;
      const barGap = 1.5;
      const barW2 = Math.max(3, (barArea - months.length * barGap) / months.length);
      const maxMm = Math.max(...report.precipMonthly, 1);
      const py = y;

      for (let pct = 0; pct <= 1; pct += 0.25) {
        const ay = py + barH * (1 - pct);
        doc.setDrawColor(226, 232, 240);
        doc.line(MARGIN, ay, MARGIN + CONTENT_W, ay);
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(5.5);
        doc.text(`${Math.round(maxMm * pct)}`, MARGIN + 1, ay - 1);
      }

      report.precipMonthly.forEach((mm, i) => {
        const bx = MARGIN + 2 + i * (barW2 + barGap);
        const bh = (mm / maxMm) * barH;
        doc.setFillColor(59, 130, 246);
        doc.rect(bx, py + barH - bh, barW2, bh, "F");
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        doc.text(months[i], bx + barW2 / 2, py + barH + 3.5, { align: "center" });
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.setFont("helvetica", "normal");
        doc.text(`${Math.round(mm)}`, bx + barW2 / 2, py + barH - bh - 1, { align: "center" });
      });
      y += barH + 8;

      // Escoamento e CN
      y = sectionLabel("Escoamento Superficial (SCS Curve Number)", y);
      const cn = report.runoff.cnMean;
      doc.setFillColor(26, 152, 80);
      doc.rect(MARGIN, y, CONTENT_W * 0.33, 5, "F");
      doc.setFillColor(254, 224, 139);
      doc.rect(MARGIN + CONTENT_W * 0.33, y, CONTENT_W * 0.34, 5, "F");
      doc.setFillColor(215, 48, 39);
      doc.rect(MARGIN + CONTENT_W * 0.67, y, CONTENT_W * 0.33, 5, "F");

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const cnStr = cn != null ? `${cn.toFixed(1)}` : "—";
      doc.text(`CN Médio da Bacia: ${cnStr}`, MARGIN, y + 9.5);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Classificação SCS: menor = infiltração favorável · maior = escoamento superficial rápido", MARGIN, y + 14);
      y += 18;

      addPDFFooter({ doc, pageNum, date, y: 0, title: "" });

      // ── HELPER: DRAW QGIS CARTOGRAPHIC MAP PAGE ─────────────────────────
      const drawQgisMapPage = async (
        pageTitle: string,
        mapSubtitle: string,
        tileUrl: string | undefined,
        legendType: "lulc" | "cn",
      ) => {
        const startY = newPage(pageTitle);
        const mapX = MARGIN;
        const mapY = startY + 4;
        const mapW = CONTENT_W;
        const mapH = 170; // Large QGIS frame

        const b = computeGeoJsonBounds(wsData?.geojson);

        // Header inside page
        doc.setFillColor(248, 250, 252);
        doc.rect(mapX, startY, mapW, 8, "F");
        doc.setDrawColor(203, 213, 225);
        doc.rect(mapX, startY, mapW, 8, "S");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(mapSubtitle.toUpperCase(), mapX + 4, startY + 5.5);
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.text(`Escala 1:Bacia · Coordenadas WGS 84`, mapX + mapW - 4, startY + 5.5, { align: "right" });

        // Map Image: Client-side Canvas rendering (CORS-safe, 100% reliable)
        let imgRendered = false;
        try {
          const imgData = await renderBasinMapToDataUrl({
            bounds: b,
            geojson: wsData?.geojson,
            rasterTileUrl: tileUrl,
            drainageTileUrl: null,
            pourPoint: PP,
            widthPx: 1400,
            heightPx: 950,
          });
          doc.addImage(imgData, "JPEG", mapX, mapY + 6, mapW, mapH);
          imgRendered = true;
        } catch (canvasErr) {
          console.warn("renderBasinMapToDataUrl failed, trying fetchMapImage fallback:", canvasErr);
          try {
            const legendPayload = legendType === "lulc"
              ? report.landcover.slice(0, 8).map(c => ({ label: c.label, color: c.color }))
              : [
                  { label: "CN < 50 (Infiltração Alta)", color: "#1a9850" },
                  { label: "CN 50-75 (Moderado)", color: "#fee08b" },
                  { label: "CN > 75 (Escoamento Alto)", color: "#d73027" },
                ];

            const imgData = await fetchMapImage(b, {
              tileUrl,
              overlayGeojson: wsData?.geojson as any,
              overlayLabel: "Bacia Delimitada",
              legendItems: legendPayload,
              title: mapSubtitle,
              dpi: 200,
              widthMm: mapW,
              heightMm: mapH,
            });
            doc.addImage(imgData, "PNG", mapX, mapY + 6, mapW, mapH);
            imgRendered = true;
          } catch (err) {
            console.warn("Cartopy map-image API failed, using html2canvas capture fallback:", err);
            if (mapContainerRef.current) {
              try {
                const canvasData = await captureMapImage(mapContainerRef.current);
                doc.addImage(canvasData, "JPEG", mapX, mapY + 6, mapW, mapH);
                imgRendered = true;
              } catch (cErr) {
                console.warn("Capture fallback failed:", cErr);
              }
            }
          }
        }

        // QGIS Frame Border
        doc.setDrawColor(30, 41, 59); // Slate 800
        doc.setLineWidth(0.4);
        doc.rect(mapX, mapY + 6, mapW, mapH, "S");

        // Coordinate Graticule (Lat/Lon tick marks on frame)
        drawCoordinateGrid(doc, mapX, mapY + 6, mapW, mapH, b.south, b.north, b.west, b.east);

        // North Arrow (Rosa dos Ventos)
        drawNorthArrow(doc, mapX + mapW - 6, mapY + 12, 8);

        // Graphic Scale Bar
        const approxDistKm = Math.max(10, Math.round((b.east - b.west) * 111 * Math.cos((b.south + b.north) * Math.PI / 360) * 0.3));
        drawGraphicScaleBar(doc, mapX + 8, mapY + mapH - 12, 34, approxDistKm);

        // Cartographic Legend Box (QGIS style embedded panel)
        const legX = mapX + 6;
        const legY = mapY + 12;
        const legW = 68;
        const legH = legendType === "lulc" ? 72 : 48;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(legX, legY, legW, legH, 2, 2, "FD");

        doc.setFillColor(15, 23, 42);
        doc.roundedRect(legX, legY, legW, 6, 2, 2, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text(legendType === "lulc" ? "LEGENDA — USO DO SOLO" : "LEGENDA — ESCOAMENTO (CN)", legX + 4, legY + 4.2);

        let ly = legY + 9;

        if (legendType === "lulc") {
          report.landcover.slice(0, 7).forEach(lc => {
            try {
              const hc = lc.color.replace("#", "");
              const r = parseInt(hc.substring(0, 2), 16);
              const g = parseInt(hc.substring(2, 4), 16);
              const b = parseInt(hc.substring(4, 6), 16);
              doc.setFillColor(r, g, b);
              doc.rect(legX + 4, ly, 4, 3.2, "F");
            } catch {}
            doc.setDrawColor(148, 163, 184);
            doc.rect(legX + 4, ly, 4, 3.2, "S");
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            const lbl = lc.label.length > 20 ? lc.label.slice(0, 18) + "…" : lc.label;
            doc.text(`${lbl} (${lc.pct}%)`, legX + 11, ly + 2.5);
            ly += 4.8;
          });
        } else {
          const cnLegend = [
            { label: "CN < 50 · Alta Infiltração", color: [26, 152, 80] },
            { label: "CN 50–75 · Escoamento Médio", color: [254, 224, 139] },
            { label: "CN > 75 · Alto Escoamento", color: [215, 48, 39] },
          ];
          cnLegend.forEach(ci => {
            doc.setFillColor(ci.color[0], ci.color[1], ci.color[2]);
            doc.rect(legX + 4, ly, 4, 3.2, "F");
            doc.setDrawColor(148, 163, 184);
            doc.rect(legX + 4, ly, 4, 3.2, "S");
            doc.setTextColor(51, 65, 85);
            doc.setFontSize(6);
            doc.setFont("helvetica", "normal");
            doc.text(ci.label, legX + 11, ly + 2.5);
            ly += 5.2;
          });
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "bold");
          doc.text(`CN Médio da Bacia: ${report.runoff.cnMean ?? "—"}`, legX + 4, ly + 2);
          ly += 5.2;
        }

        // Add Vector Features to Legend
        doc.setDrawColor(2, 132, 199);
        doc.setLineWidth(0.7);
        doc.line(legX + 4, ly + 1.5, legX + 8, ly + 1.5);
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text("Rede de Drenagem / Linhas de Água", legX + 11, ly + 2);
        ly += 4.8;

        doc.setDrawColor(13, 71, 161);
        doc.setLineWidth(0.6);
        doc.setFillColor(21, 101, 192, 0.2);
        doc.rect(legX + 4, ly, 4, 3, "FD");
        doc.text("Limite da Bacia Hidrográfica", legX + 11, ly + 2.2);

        // Cartographic Metadata strip under map
        const metaY = mapY + mapH + 8;
        doc.setFillColor(248, 250, 252);
        doc.rect(mapX, metaY, mapW, 14, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(mapX, metaY, mapW, 14, "S");

        doc.setTextColor(71, 85, 105);
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.text("METADADOS CARTOGRÁFICOS:", mapX + 3, metaY + 4.5);
        doc.setFont("helvetica", "normal");
        doc.text(
          "Sistema de Coordenadas: WGS 84 (EPSG:4326) · Projeção Geográfica Decimal\n" +
          "Fontes de Dados: ESA WorldCover (10m), HydroSHEDS / WWF, Copernicus DEM (GLO-30), CHIRPS Climatology\n" +
          "Elaborado por: GeoMoz Explorer · Plataforma WebGIS de Recursos Hídricos e Geologia de Moçambique",
          mapX + 3,
          metaY + 8,
        );

        addPDFFooter({ doc, pageNum, date, y: 0, title: "" });
      };

      // ── CONDITIONAL MAP PAGES ──────────────────────────────────────────
      if (exportType === "lulc" || exportType === "both") {
        await drawQgisMapPage(
          "Mapa 1: Uso do Solo & Linhas de Água",
          "Uso e Cobertura do Solo (ESA WorldCover 10m) & Rede Hidrográfica",
          report.landcoverTile,
          "lulc",
        );
      }

      if (exportType === "cn" || exportType === "both") {
        await drawQgisMapPage(
          "Mapa 2: Escoamento Superficial (CN)",
          "Escoamento Superficial (SCS Curve Number) & Rede Hidrográfica",
          report.runoff.cnTile,
          "cn",
        );
      }

      const fileDate = new Date().toISOString().slice(0, 10);
      const fileName = `GeoMoz_QGIS_Bacia_${PP ? `${PP[0].toFixed(3)}_${PP[1].toFixed(3)}` : "WebGIS"}_${fileDate}.pdf`;
      doc.save(fileName);
      setExportModalOpen(false);
    } catch (err) {
      console.error("Erro ao gerar PDF QGIS:", err);
      alert("Falha ao exportar PDF: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingPdf(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-4 bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <Loader2 size={36} className="text-cyan-400 animate-spin" />
          <div className="text-center">
            <h3 className="text-base font-bold text-slate-100">GeoMoz WebGIS</h3>
            <p className="text-xs text-slate-400 mt-1">A carregar análise de bacia hidrográfica…</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !sharedData || !report) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <Info size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Análise Não Encontrada</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {error || "O link de visualização pode ter expirado ou o identificador é inválido."}
          </p>
          <a
            href="/app"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20"
          >
            <ArrowLeft size={14} /> Ir para o GeoMoz Explorer
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* ── Top Navigation Bar ────────────────────────────────────────────── */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Droplets size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">GeoMoz</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  WebGIS
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium">
                  <Eye size={10} /> Apenas Leitura
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Visualizador Hidrológico & Cartográfico</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share Button / Copy Link */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all shadow-sm"
            title="Copiar link permanente de visualização"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? "Link Copiado!" : "Copiar Link"}</span>
          </button>

          {/* Export HTML Button */}
          <button
            onClick={() => downloadStandaloneBasinHtml({
              title: `Bacia Hidrográfica — ${totalArea.toLocaleString("pt-PT")} km²`,
              basinReport: report,
              watershedData: wsData,
              wsStats,
              pourPoint: PP,
            })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium transition-all shadow-sm"
            title="Descarregar ficheiro HTML autónomo que abre em qualquer computador offline"
          >
            <FileCode size={13} />
            <span className="hidden sm:inline">Exportar HTML</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20"
          >
            <FileDown size={13} />
            <span>Exportar PDF (QGIS)</span>
          </button>

          <a
            href="/app"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-all border border-slate-700/50"
          >
            <ExternalLink size={12} />
            <span className="hidden sm:inline">Explorador Completo</span>
          </a>
        </div>
      </header>

      {/* ── Main Layout (Map + Sidebar) ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map Container */}
        <div className="flex-1 relative overflow-hidden" ref={mapContainerRef}>
          {/* Basemap Switcher */}
          <BasemapSwitcher
            current={basemap}
            onChange={setBasemap}
            className="absolute bottom-6 left-4 z-[600]"
            position="bottom-left"
          />

          {/* Floating Layers Quick Bar */}
          <div className="absolute top-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl p-2 flex items-center gap-1 text-xs">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2">Camadas:</span>

            <button
              onClick={() => setActiveLayer(l => l === "lulc" ? "none" : "lulc")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                activeLayer === "lulc"
                  ? "bg-lime-500/20 text-lime-300 border border-lime-500/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-lime-400" />
              Uso do Solo (10m)
            </button>

            <button
              onClick={() => setActiveLayer(l => l === "cn" ? "none" : "cn")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-medium transition-all ${
                activeLayer === "cn"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Escoamento (CN)
            </button>

            <div className="w-[1px] h-4 bg-slate-800 mx-1" />

            <button
              onClick={() => setShowDrainage(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-xl font-medium transition-all ${
                showDrainage
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
              }`}
            >
              <GitBranch size={11} />
              Linhas de Água
            </button>
          </div>

          <MapContainer
            center={PP || [-18, 35]}
            zoom={8}
            style={{ height: "100%", width: "100%" }}
            ref={mapRef}
            zoomControl={false}
          >
            <ZoomControl position="topright" />
            <ScaleControl position="bottomright" imperial={false} />

            <TileLayer
              key={basemap}
              crossOrigin="anonymous"
              url={GOOGLE_BASEMAPS[basemap].url}
              subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
              attribution={GOOGLE_BASEMAPS[basemap].attribution}
              maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
            />

            {/* Basin GeoJSON boundary */}
            {wsData?.geojson && showBasinPolygon && (
              <GeoJSON
                key={`ws-poly-${shareId}`}
                data={wsData.geojson as GeoJSON.GeoJsonObject}
                style={{
                  color: "#0284c7",
                  weight: 2.5,
                  fillColor: "#0284c7",
                  fillOpacity: activeLayer === "none" ? 0.2 : 0.05,
                  opacity: 0.9,
                }}
              />
            )}

            {/* Watershed Drainage Lines */}
            {showDrainage && (sharedData?.watershedDrainageTile || wsData?.tileUrl) && (
              <TileLayer
                crossOrigin="anonymous"
                key={`ws-drain-${sharedData?.watershedDrainageTile || wsData?.tileUrl}`}
                url={sharedData?.watershedDrainageTile || wsData?.tileUrl!}
                attribution="HydroSHEDS · WWF"
                opacity={0.9}
                zIndex={450}
                maxZoom={18}
              />
            )}

            {/* ESA WorldCover Tile Layer */}
            {activeLayer === "lulc" && report?.landcoverTile && (
              <TileLayer
                crossOrigin="anonymous"
                key={`lulc-${report.landcoverTile}`}
                url={report.landcoverTile}
                attribution="GEE · ESA WorldCover 2021"
                opacity={0.78}
                maxZoom={18}
              />
            )}

            {/* SCS CN Runoff Tile Layer */}
            {activeLayer === "cn" && report?.runoff?.cnTile && (
              <TileLayer
                crossOrigin="anonymous"
                key={`cn-${report.runoff.cnTile}`}
                url={report.runoff.cnTile}
                attribution="GEE · SCS Curve Number"
                opacity={0.75}
                maxZoom={18}
              />
            )}

            {/* Pour Point */}
            {PP && (
              <CircleMarker
                center={PP}
                radius={8}
                pathOptions={{ fillColor: "#ef4444", color: "#ffffff", weight: 3, fillOpacity: 1 }}
              />
            )}
          </MapContainer>

          {/* Floating Cartographic Legend on Map */}
          <div className="absolute bottom-8 left-20 z-[500] bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 p-3 pointer-events-none text-[11px] min-w-[170px] text-slate-200">
            <div className="font-bold text-cyan-400 mb-1.5 flex items-center gap-1.5 text-xs">
              <Compass size={12} /> Legenda do Mapa
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-4 h-1.5 rounded border border-cyan-400 bg-cyan-400/20" />
              <span className="text-slate-300">Limite da Bacia</span>
            </div>
            {showDrainage && (
              <div className="flex items-center gap-2 mb-1">
                <span className="w-4 h-1 rounded bg-[#0284c7]" />
                <span className="text-slate-300">Linhas de Água</span>
              </div>
            )}
            {activeLayer === "lulc" && (
              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase">Uso do Solo (10m)</div>
                {report.landcover.slice(0, 5).map(c => (
                  <div key={c.code} className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                    <span className="truncate text-slate-300">{c.label}</span>
                    <span className="text-slate-400 ml-auto font-mono">{c.pct}%</span>
                  </div>
                ))}
              </div>
            )}
            {activeLayer === "cn" && (
              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase">Curve Number (CN)</div>
                <div className="h-1.5 rounded-full" style={{ background: "linear-gradient(to right,#1a9850,#fee08b,#d73027)" }} />
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>Infiltração</span>
                  <span>Escoamento</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="absolute top-20 right-0 z-[600] bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded-l-xl shadow-xl hover:text-white transition-all"
          title={sidebarOpen ? "Ocultar painel" : "Mostrar painel"}
        >
          {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* ── Right Panel (Details & Metrics) ────────────────────────────── */}
        {sidebarOpen && (
          <aside className="w-84 md:w-96 bg-slate-900 border-l border-slate-800 overflow-y-auto shrink-0 flex flex-col z-20 text-slate-200">
            {/* Header card */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between text-xs opacity-80 mb-1">
                  <span>Área da Bacia</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono">EPSG:4326</span>
                </div>
                <div className="text-3xl font-extrabold tracking-tight">
                  {totalArea.toLocaleString("pt-PT")} <span className="text-lg font-medium opacity-80">km²</span>
                </div>
                <div className="mt-2 text-xs opacity-80 flex items-center gap-1.5">
                  <MapPin size={11} />
                  <span>
                    {PP ? `Exutório: ${PP[0].toFixed(4)}°, ${PP[1].toFixed(4)}°` : "Bacia hidrográfica selecionada"}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-5 flex-1">
              {/* Morfometria */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Mountain size={13} className="text-blue-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Morfometria da Bacia</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ["Perímetro", `${report.morphometry.perimeterKm.toFixed(0)} km`],
                    ["Relevo", `${report.morphometry.reliefM.toFixed(0)} m`],
                    ["Declive méd.", `${report.morphometry.slopeMeanDeg.toFixed(1)}°`],
                    ["Elev. mín.", `${report.morphometry.elevMinM.toFixed(0)} m`],
                    ["Elev. média", `${report.morphometry.elevMeanM.toFixed(0)} m`],
                    ["Elev. máx.", `${report.morphometry.elevMaxM.toFixed(0)} m`],
                    ["Dens. dren.", `${report.morphometry.drainageDensity} km/km²`],
                    ["Compacidade", `${report.morphometry.compactness}`],
                    ["Fator forma", `${report.morphometry.formFactor}`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2 text-center">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide leading-tight mb-0.5">{k}</div>
                      <div className="text-xs font-bold text-slate-100">{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Uso e Cobertura do Solo */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Activity size={13} className="text-lime-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uso do Solo (ESA 10m)</span>
                  </div>
                  <button
                    onClick={() => setActiveLayer(l => l === "lulc" ? "none" : "lulc")}
                    className="text-[10px] text-cyan-400 hover:underline font-medium"
                  >
                    {activeLayer === "lulc" ? "Ocultar" : "Ver no mapa"}
                  </button>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 space-y-1.5">
                  {report.landcover.slice(0, 6).map(c => (
                    <div key={c.code} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                      <span className="text-slate-300 flex-1 truncate">{c.label}</span>
                      <span className="text-slate-400 font-mono text-[11px]">{c.pct}%</span>
                      <span className="text-slate-500 text-[10px] w-14 text-right">{c.areaKm2.toFixed(0)} km²</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Precipitação Mensal (CHIRPS) */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Droplets size={13} className="text-blue-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Chuva Mensal · {report.precipAnnualMm.toLocaleString("pt-PT")} mm/ano
                  </span>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5">
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart
                      data={report.precipMonthly.map((v, i) => ({ m: "JFMAMJJASOND"[i], mm: v }))}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <XAxis dataKey="m" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(v: number) => [`${v} mm`, "Precipitação"]}
                      />
                      <Bar dataKey="mm" fill="#0284c7" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Escoamento Superficial (SCS CN) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Waves size={13} className="text-amber-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Escoamento (Curve Number)</span>
                  </div>
                  <button
                    onClick={() => setActiveLayer(l => l === "cn" ? "none" : "cn")}
                    className="text-[10px] text-cyan-400 hover:underline font-medium"
                  >
                    {activeLayer === "cn" ? "Ocultar" : "Ver no mapa"}
                  </button>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">CN Médio da Bacia</span>
                    <span className="text-base font-bold text-white font-mono">{report.runoff.cnMean ?? "—"}</span>
                  </div>
                  <div className="h-2 rounded-full mt-2" style={{ background: "linear-gradient(to right,#1a9850,#fee08b,#d73027)" }} />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                    <span>40 · Alta infiltração</span>
                    <span>Escoamento rápido · 100</span>
                  </div>
                </div>
              </div>

              {/* Índices de Risco (se existirem) */}
              {wsStats && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Gauge size={13} className="text-red-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Índices de Risco</span>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 space-y-2.5">
                    {[
                      { label: "Risco de Erosão", val: wsStats.erosionRisk, icon: Wind, color: "#f59e0b" },
                      { label: "Risco de Cheia", val: wsStats.floodRisk, icon: Waves, color: "#ef4444" },
                      { label: "Pot. Hidrogeológico", val: wsStats.hydroPotential, icon: Zap, color: "#10b981" },
                    ].map(r => (
                      <div key={r.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 flex items-center gap-1.5">
                            <r.icon size={11} style={{ color: r.color }} /> {r.label}
                          </span>
                          <span className="font-bold font-mono" style={{ color: r.color }}>{r.val.toFixed(0)}/100</span>
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.val}%`, background: r.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botões Exportar PDF e HTML no Sidebar */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => setExportModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-xs font-semibold rounded-2xl transition-all shadow-lg shadow-blue-600/25"
                >
                  <FileDown size={14} /> Descarregar Relatório PDF (Estilo QGIS)
                </button>
                <button
                  onClick={() => downloadStandaloneBasinHtml({
                    title: `Bacia Hidrográfica — ${totalArea.toLocaleString("pt-PT")} km²`,
                    basinReport: report,
                    watershedData: wsData,
                    wsStats,
                    pourPoint: PP,
                  })}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold rounded-2xl transition-all shadow-sm"
                  title="Descarregar ficheiro HTML autónomo que abre em qualquer computador offline"
                >
                  <FileCode size={14} /> Exportar WebGIS em HTML (Offline)
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Export Modal (Escolha do Tipo de Mapa QGIS) ──────────────────── */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <FileDown size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Exportação Cartográfica (Estilo QGIS)</h3>
                  <p className="text-[11px] text-slate-400">Selecione os mapas e elementos a incluir no PDF</p>
                </div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs p-1"
              >
                <X size={14} />
              </button>
            </div>

            <div className="my-4 space-y-2.5 text-xs">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Composição do Relatório PDF:
              </label>

              {[
                {
                  id: "both",
                  title: "Relatório Completo (Ambos os Mapas)",
                  desc: "Pág 1: Métricas & Clima · Pág 2: Uso do Solo (10m) · Pág 3: Escoamento (CN)",
                },
                {
                  id: "lulc",
                  title: "Mapa de Uso e Cobertura do Solo",
                  desc: "Layout cartográfico com ESA WorldCover 10m, rede hidrográfica e legenda de classes.",
                },
                {
                  id: "cn",
                  title: "Mapa de Escoamento Superficial (CN)",
                  desc: "Layout cartográfico com Curve Number SCS, rede hidrográfica e zonas de infiltração.",
                },
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => setExportType(opt.id as any)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    exportType === opt.id
                      ? "bg-blue-600/15 border-blue-500 text-white shadow-md shadow-blue-500/10"
                      : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{opt.title}</span>
                    {exportType === opt.id && <Check size={14} className="text-blue-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
                </div>
              ))}

              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3 text-[11px] text-slate-400 space-y-1 mt-3">
                <div className="font-semibold text-slate-300">Elementos Cartográficos Incluídos:</div>
                <div className="flex flex-wrap gap-2 text-[10px] text-cyan-300 pt-1">
                  <span className="bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60 flex items-center gap-1"><Compass size={11} /> Rosa dos Ventos</span>
                  <span className="bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60 flex items-center gap-1"><Ruler size={11} /> Barra de Escala Gráfica</span>
                  <span className="bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60 flex items-center gap-1"><Globe size={11} /> Graticule Lat/Lon</span>
                  <span className="bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60 flex items-center gap-1"><FileText size={11} /> Legenda Temática</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={generateQgisPdf}
                disabled={exportingPdf}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/25"
              >
                {exportingPdf ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> A gerar PDF QGIS…
                  </>
                ) : (
                  <>
                    <FileDown size={14} /> Gerar PDF A4
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
