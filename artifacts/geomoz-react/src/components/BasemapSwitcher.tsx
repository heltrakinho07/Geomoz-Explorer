import React, { useState, useRef, useEffect } from "react";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import { Layers, Globe, Mountain, Map as MapIcon, X, Check, Satellite } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface BasemapSwitcherProps {
  current: BasemapType;
  onChange: (type: BasemapType) => void;
  viewMode?: "2d" | "3d";
  onViewModeChange?: (mode: "2d" | "3d") => void;
  className?: string;
  position?: "bottom-left" | "top-right";
}

interface MapTypeOption {
  id: BasemapType;
  label: string;
  sublabel: string;
  previewBg: string;
  icon: React.ReactNode;
}

const MAP_TYPE_OPTIONS: MapTypeOption[] = [
  {
    id: "roadmap",
    label: "Padrão",
    sublabel: "Estradas e cidades",
    previewBg: "bg-amber-50 border-amber-200",
    icon: <MapIcon size={20} className="text-amber-600" />,
  },
  {
    id: "satellite",
    label: "Satélite",
    sublabel: "Imagens ópticas puras",
    previewBg: "bg-slate-800 border-slate-700 text-white",
    icon: <Globe size={20} className="text-sky-400" />,
  },
  {
    id: "terrain",
    label: "Relevo",
    sublabel: "Curvas e hipsometria",
    previewBg: "bg-emerald-50 border-emerald-200",
    icon: <Mountain size={20} className="text-emerald-700" />,
  },
  {
    id: "hybrid",
    label: "Híbrido",
    sublabel: "Satélite com nomes e vias",
    previewBg: "bg-indigo-950 border-indigo-800 text-white",
    icon: <Satellite size={20} className="text-indigo-400" />,
  },
];

export default function BasemapSwitcher({
  current,
  onChange,
  viewMode,
  onViewModeChange,
  className = "",
  position = "bottom-left",
}: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [internalViewMode, setInternalViewMode] = useState<"2d" | "3d">(() => {
    try {
      return (localStorage.getItem("geomoz_view_mode") as "2d" | "3d") || "3d";
    } catch {
      return "3d";
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent).detail as "2d" | "3d";
      if (m === "2d" || m === "3d") setInternalViewMode(m);
    };
    window.addEventListener("geomoz_view_mode_changed", handler);
    return () => window.removeEventListener("geomoz_view_mode_changed", handler);
  }, []);

  const activeViewMode = viewMode ?? internalViewMode;

  const handleToggleViewMode = (checked: boolean) => {
    const nextMode: "2d" | "3d" = checked ? "3d" : "2d";
    setInternalViewMode(nextMode);
    try {
      localStorage.setItem("geomoz_view_mode", nextMode);
      window.dispatchEvent(new CustomEvent("geomoz_view_mode_changed", { detail: nextMode }));
    } catch {}
    onViewModeChange?.(nextMode);
  };

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Current basemap visual helper
  const currentOption = MAP_TYPE_OPTIONS.find((o) => o.id === current) || MAP_TYPE_OPTIONS[3];

  return (
    <div
      ref={containerRef}
      className={`pointer-events-auto select-none flex items-end gap-2 ${className}`}
    >
      {/* Google Maps Layer Thumbnail Button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Camadas do Google Maps"
        className="group relative flex flex-col items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border-2 border-white/80 dark:border-slate-800 hover:border-sky-400 p-1 transition-all active:scale-95 focus:outline-none"
      >
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center bg-slate-900 text-white border border-slate-300 dark:border-slate-700 group-hover:shadow-md transition-shadow">
          {/* Visual miniature representation */}
          <div className="absolute inset-0 opacity-80 group-hover:scale-105 transition-transform bg-gradient-to-br from-sky-600 via-emerald-700 to-indigo-900" />
          <div className="relative z-10 flex flex-col items-center justify-center">
            <Layers size={18} className="text-white drop-shadow-md" />
          </div>
        </div>
        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 mt-1 px-1">
          Camadas
        </span>
      </button>

      {/* Direct 1-Click 2D / 3D Mode Toggle (Google Maps style) */}
      <button
        type="button"
        onClick={() => handleToggleViewMode(activeViewMode !== "3d")}
        title={
          activeViewMode === "3d"
            ? "Alternar para 2D Plano"
            : "Alternar para 3D & Relevo (Copernicus DEM 30m)"
        }
        className={`group relative flex flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border-2 p-1 transition-all active:scale-95 focus:outline-none ${
          activeViewMode === "3d"
            ? "border-sky-500 bg-sky-50/80 dark:bg-sky-950/50 ring-2 ring-sky-400/40"
            : "border-white/80 dark:border-slate-800 hover:border-sky-400"
        }`}
      >
        <div
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden relative shadow-inner flex flex-col items-center justify-center border transition-all ${
            activeViewMode === "3d"
              ? "bg-gradient-to-br from-sky-600 to-indigo-600 text-white border-sky-400 shadow-md"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
          }`}
        >
          {activeViewMode === "3d" ? (
            <>
              <Globe size={18} className="drop-shadow-xs" />
              <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">3D</span>
            </>
          ) : (
            <>
              <Mountain size={18} className="text-slate-600 dark:text-slate-300" />
              <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5">2D</span>
            </>
          )}
        </div>
        <span
          className={`text-[10px] font-bold mt-1 px-1 ${
            activeViewMode === "3d" ? "text-sky-600 dark:text-sky-400" : "text-slate-700 dark:text-slate-200"
          }`}
        >
          {activeViewMode === "3d" ? "3D Ativo" : "2D Plano"}
        </span>
      </button>

      {/* Google Maps-style Expanded Layer Drawer / Card */}
      {open && (
        <div
          className={`absolute ${
            position === "bottom-left"
              ? "bottom-full left-0 mb-2 sm:mb-3"
              : "top-full right-0 mt-2"
          } z-[750] w-[290px] sm:w-[320px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-3 sm:p-4 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
              <Layers size={16} className="text-sky-600" />
              <span>Tipo de Mapa (Google Maps)</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Grid of Map Types */}
          <div className="grid grid-cols-2 gap-2 my-3">
            {MAP_TYPE_OPTIONS.map((opt) => {
              const isSelected = current === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                  }}
                  className={`relative p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 ring-2 ring-sky-400/50 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{opt.icon}</span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px]">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-xs mt-0.5 text-slate-900 dark:text-slate-100">
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                    {opt.sublabel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 3D Globe / Terrain Toggle Section */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Detalhes do mapa
            </div>

            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Globe size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Globo 3D & Relevo
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Copernicus DEM 30m / SRTM
                  </div>
                </div>
              </div>

              <Switch
                checked={activeViewMode === "3d"}
                onCheckedChange={handleToggleViewMode}
                className="data-[state=checked]:bg-sky-600"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
