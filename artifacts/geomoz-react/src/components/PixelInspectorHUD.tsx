import React, { useState, useCallback } from "react";
import {
  Crosshair,
  Copy,
  Check,
  Mountain,
  Layers,
  MapPin,
  Activity,
  Eye,
  EyeOff,
  Compass,
} from "lucide-react";

export interface GeologyContext {
  name?: string;
  code?: string;
  era?: string;
  period?: string;
}

export interface AdminContext {
  province?: string;
  district?: string;
}

export interface AnalysisContext {
  label: string;
  value?: number | string | null;
  unit?: string;
  category?: string;
  classLabel?: string;
  color?: string;
}

export interface PixelInspectorHUDProps {
  coords: { lat: number; lng: number } | null;
  elevation?: number | null;
  slope?: number | null;
  slopeClass?: string | null;
  geology?: GeologyContext | null;
  admin?: AdminContext | null;
  analysis?: AnalysisContext | null;
  viewMode?: "2d" | "3d";
  className?: string;
}

export default function PixelInspectorHUD({
  coords,
  elevation,
  slope,
  slopeClass,
  geology,
  admin,
  analysis,
  viewMode = "3d",
  className = "",
}: PixelInspectorHUDProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("geomoz_inspector_active");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [copied, setCopied] = useState(false);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("geomoz_inspector_active", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleCopyCoords = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!coords) return;
      const text = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [coords]
  );

  // If the inspector is turned off, render a discrete floating pill to activate it
  if (!isEnabled) {
    return (
      <div className={`pointer-events-auto select-none ${className}`}>
        <button
          type="button"
          onClick={toggleEnabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/85 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-700/70 shadow-lg backdrop-blur-md text-xs font-semibold transition-all hover:scale-105 active:scale-95 group"
          title="Ativar Inspetor de Pixels em Tempo Real"
        >
          <Eye size={13} className="text-sky-400 group-hover:text-sky-300" />
          <span>Inspetor</span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 group-hover:bg-sky-400 transition-colors" />
        </button>
      </div>
    );
  }

  // When enabled but cursor is outside the map
  if (!coords) {
    return (
      <div className={`pointer-events-auto select-none ${className}`}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 text-slate-400 border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-mono">
          <Crosshair size={13} className="text-sky-400 animate-pulse shrink-0" />
          <span className="text-[11px] text-slate-300">Passe o cursor sobre o mapa</span>
          <button
            type="button"
            onClick={toggleEnabled}
            className="p-1 -mr-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
            title="Ocultar Inspetor"
          >
            <EyeOff size={12} />
          </button>
        </div>
      </div>
    );
  }

  const latFormatted = `${Math.abs(coords.lat).toFixed(5)}° ${coords.lat >= 0 ? "N" : "S"}`;
  const lngFormatted = `${Math.abs(coords.lng).toFixed(5)}° ${coords.lng >= 0 ? "E" : "W"}`;

  return (
    <div
      className={`pointer-events-auto select-none z-[600] flex flex-col gap-1.5 ${className}`}
    >
      <div className="bg-slate-900/95 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md rounded-2xl p-2.5 max-w-xs sm:max-w-md transition-all animate-in fade-in duration-200 text-xs">
        {/* Top Row: Coords, Copy Button, Elevation, Slope, Toggle */}
        <div className="flex items-center justify-between gap-2.5 pb-1.5 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 font-mono text-slate-200">
            <Crosshair size={13} className="text-sky-400 shrink-0" />
            <span className="font-semibold text-[11px] sm:text-xs">
              {latFormatted}, {lngFormatted}
            </span>
            <button
              type="button"
              onClick={handleCopyCoords}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-sky-300 transition-colors ml-0.5 relative group"
              title="Copiar coordenadas (Lat, Lng)"
            >
              {copied ? (
                <Check size={12} className="text-emerald-400" />
              ) : (
                <Copy size={12} />
              )}
              {copied && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-sans px-1.5 py-0.5 rounded shadow-md whitespace-nowrap">
                  Copiado!
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Elevation Badge */}
            {elevation !== null && elevation !== undefined && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-800/60 text-sky-300 font-mono font-bold text-[11px]"
                title="Elevação acima do nível do mar (DEM Copernicus 30m)"
              >
                <Mountain size={12} className="text-sky-400" />
                <span>{elevation.toLocaleString()} m</span>
              </div>
            )}

            {/* Slope Badge */}
            {slope !== null && slope !== undefined && (
              <div
                className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-800/90 text-slate-300 font-mono text-[11px]"
                title={`Declive do relevo: ${slope}° ${slopeClass ? `(${slopeClass})` : ""}`}
              >
                <Compass size={11} className="text-amber-400" />
                <span>{slope}°</span>
              </div>
            )}

            {/* Toggle Button */}
            <button
              type="button"
              onClick={toggleEnabled}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-0.5"
              title="Ocultar Inspetor"
            >
              <EyeOff size={13} />
            </button>
          </div>
        </div>

        {/* Bottom Context Rows: Analysis, Geology, Admin */}
        <div className="pt-1.5 flex flex-col gap-1 text-[11px]">
          {/* Active Analysis Context */}
          {analysis && (
            <div className="flex items-center gap-1.5 text-slate-200">
              <Activity size={12} className="text-emerald-400 shrink-0" />
              <span className="font-semibold text-slate-300">{analysis.label}:</span>
              {analysis.value !== undefined && analysis.value !== null ? (
                <span className="font-mono font-bold text-emerald-300">
                  {typeof analysis.value === "number"
                    ? (analysis.value >= 0 ? "+" : "") + analysis.value.toFixed(2)
                    : analysis.value}
                  {analysis.unit ? ` ${analysis.unit}` : ""}
                </span>
              ) : (
                <span className="text-slate-400 italic">Ativo na área</span>
              )}
              {analysis.classLabel && (
                <span className="px-1.5 py-0.2 rounded-md bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 text-[10px] font-medium">
                  {analysis.classLabel}
                </span>
              )}
            </div>
          )}

          {/* Geological Formation Context (ocultado para segurança de dados - preservado para reactivação futura)
          geology && geology.name && (
            <div className="flex items-center gap-1.5 text-slate-200">
              <Layers size={12} className="text-amber-400 shrink-0" />
              <span className="font-medium text-amber-200 truncate max-w-[220px] sm:max-w-xs" title={geology.name}>
                {geology.name}
              </span>
              {geology.code && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 font-mono">
                  {geology.code}
                </span>
              )}
              {geology.era && (
                <span className="text-slate-400 text-[10px] hidden sm:inline">
                  · {geology.era}
                </span>
              )}
            </div>
          ) */}

          {/* Administrative Division Context */}
          {admin && (admin.province || admin.district) && (
            <div className="flex items-center gap-1 text-slate-400 text-[10px]">
              <MapPin size={11} className="text-rose-400 shrink-0" />
              <span>
                {admin.province}
                {admin.district ? ` · ${admin.district}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
