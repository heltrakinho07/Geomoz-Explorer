import { useState, useMemo } from "react";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { sharedMapText, type SharedMapKey } from "@/i18n/sharedMap";
import {
  Globe, Upload, Pen, X, FileText, CheckCircle2,
  Paintbrush, Trash2, Sparkles, Crosshair, ArrowRight,
  RotateCcw, Compass, Check, Layers, AlertCircle,
} from "lucide-react";
import AreaUpload from "./AreaUpload";
import type { AreaOfInterest } from "@/lib/aoi";
import { customAOI, GLOBAL_AOI, computeAOIMetrics } from "@/lib/aoi";

interface ZoneSelectProps {
  aoi: AreaOfInterest;
  onAOIChange: (aoi: AreaOfInterest) => void;
  /** If true, enable drawing mode (pass to MapDraw) */
  onDrawingRequest?: () => void;
  /** Compact mode for navbar display (smaller, inline) */
  compact?: boolean;
}

type ActiveTab = "upload" | "draw" | null;

/**
 * ZoneSelect — Enterprise-grade Area of Interest (AOI) Selector.
 *
 * Professional GIS workflow:
 *   1. Vista global — Initial planetary globe view
 *   2. Upload de Geometria — GeoJSON, KML, GPX with instant auto-centering
 *   3. Desenhar Poligono — Interactive polygon drawing directly on the globe/map
 */
export default function ZoneSelect({
  aoi,
  onAOIChange,
  onDrawingRequest,
  compact,
}: ZoneSelectProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);
  const { translatedLocale } = usePortalTranslation();
  const copy = (key: SharedMapKey) => sharedMapText(translatedLocale, key);
  const numberLocale = translatedLocale === "pt" ? "pt-MZ" : translatedLocale;

  // Compute quantitative geometric metrics for the active AOI
  const metrics = useMemo(() => {
    return computeAOIMetrics(aoi.geometry);
  }, [aoi.geometry]);

  // Handlers
  function handleSelectGlobal() {
    onAOIChange(GLOBAL_AOI);
    setActiveTab(null);
  }

  function handleGeometryLoaded(geojson: GeoJSON.GeoJSON, label: string) {
    const newAOI = customAOI(geojson, label, "upload");
    onAOIChange(newAOI);
    setActiveTab(null);
    // Smoothly fly to the uploaded geometry
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("geomoz_fly_to_aoi"));
    }, 100);
  }

  function handleFlyToAOI() {
    window.dispatchEvent(new CustomEvent("geomoz_fly_to_aoi"));
  }

  const isCustom = aoi.source === "upload" || aoi.source === "draw";

  // ── Compact Mode (for Navbars / Mini toolbars) ──────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleFlyToAOI}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all shadow-2xs ${
            isCustom
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          }`}
          title={isCustom ? copy("zone.recenterTitle") : copy("zone.global")}
        >
          {isCustom ? <Crosshair size={13} className="text-emerald-500" /> : <Globe size={13} className="text-sky-500" />}
          <span className="min-w-0 whitespace-normal break-words text-left">{aoi.source === "global" ? copy("zone.global") : aoi.label}</span>
        </button>

        {isCustom && (
          <button
            onClick={handleSelectGlobal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title={copy("zone.globalResetTitle")}
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    );
  }

  // ── Full Enterprise Mode ────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Active AOI Executive Card ── */}
      <div className="bg-slate-50 dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-all">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                aoi.source === "upload"
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : aoi.source === "draw"
                  ? "bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800"
                  : "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"
              }`}
            >
              {aoi.source === "upload"
                ? copy("zone.uploaded")
                : aoi.source === "draw"
                ? copy("zone.drawn")
                 : copy("zone.global")}
            </span>
          </div>

          {/* Action buttons: Fly to AOI / Reset to Global */}
          <div className="flex items-center gap-1">
            {isCustom && (
              <>
                <button
                  type="button"
                  onClick={handleFlyToAOI}
                  className="flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700 px-2 py-0.5 rounded-lg transition-all cursor-pointer shadow-2xs"
                  title={copy("zone.centerTitle")}
                >
                  <Crosshair size={10} />
                  <span>{copy("zone.center")}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectGlobal}
                  className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 px-2 py-0.5 rounded-lg transition-all cursor-pointer shadow-2xs"
                  title={copy("zone.resetTitle")}
                >
                  <RotateCcw size={10} />
                  <span>{copy("zone.reset")}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-2xs">
            {aoi.source === "upload" ? (
              <FileText size={15} className="text-emerald-500" />
            ) : aoi.source === "draw" ? (
              <Paintbrush size={15} className="text-fuchsia-500" />
            ) : (
              <Globe size={15} className="text-sky-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words leading-tight">
              {isCustom ? aoi.label : aoi.source === "global" ? copy("zone.define") : aoi.label}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-normal break-words mt-0.5">
              {isCustom
                ? copy("zone.activeClip")
                 : copy("zone.help")}
            </p>
          </div>
        </div>

        {/* Quantitative GIS Metrics if custom geometry exists */}
        {isCustom && metrics && (
          <div className="grid grid-cols-2 gap-1.5 mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-800 text-[10px]">
            <div className="bg-white/80 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">{copy("zone.clippedArea")}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {metrics.areaKm2.toLocaleString(numberLocale)} km²
                <span className="text-slate-400 font-normal ml-1">({metrics.areaHa.toLocaleString(numberLocale)} ha)</span>
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">{copy("zone.perimeter")}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {metrics.perimeterKm.toLocaleString(numberLocale)} km
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">{copy("zone.vertices")}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {metrics.vertexCount} {copy("zone.points")}
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 whitespace-normal break-words">
              <span className="text-slate-400 block text-[9px] uppercase font-semibold">{copy("zone.centroid")}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-normal break-words block">
                {metrics.centroid[0]}°, {metrics.centroid[1]}°
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Two Primary Modes: Upload de Área & Desenhar Polígono ── */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "upload" ? null : "upload")}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
            activeTab === "upload"
              ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 dark:hover:border-emerald-800"
          }`}
          title={copy("zone.uploadTitle")}
        >
          <Upload size={13} className={activeTab === "upload" ? "text-white" : "text-emerald-500"} />
          <span>{copy("zone.upload")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab(null);
            onDrawingRequest?.();
          }}
          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
            aoi.source === "draw"
              ? "bg-fuchsia-600 text-white border-fuchsia-700 shadow-sm"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/30 hover:border-fuchsia-300 dark:hover:border-fuchsia-800"
          }`}
          title={copy("zone.drawTitle")}
        >
          <Pen size={13} className={aoi.source === "draw" ? "text-white" : "text-fuchsia-500"} />
          <span>{copy("zone.draw")}</span>
        </button>
      </div>

      {/* ── Subpanel: Upload de Área (GeoJSON / KML / GPX) ── */}
      {activeTab === "upload" && (
        <div className="p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
              <Upload size={12} className="text-emerald-600" />
              <span>{copy("zone.importTitle")}</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveTab(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={12} />
            </button>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {copy("zone.importHelp")}
          </p>

          <AreaUpload onGeometryLoaded={handleGeometryLoaded} />
        </div>
      )}
    </div>
  );
}
