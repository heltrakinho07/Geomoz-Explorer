import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Columns2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  Calendar,
  X,
  Sliders,
  RotateCcw,
  Play,
  Loader2,
  Check,
  ArrowLeftRight,
  AlertTriangle,
  KeyRound,
} from "lucide-react";

export type CompareMode = "temporal_gee" | "analysis_vs_satellite" | "s2_temporal";

export interface CompareOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ComparePreset {
  id: string;
  title: string;
  description: string;
  leftStart?: string;
  leftEnd?: string;
  rightStart?: string;
  rightEnd?: string;
  leftId: string;
  rightId: string;
}

export const DEFAULT_COMPARE_PRESETS: ComparePreset[] = [
  {
    id: "default_recent",
    title: "2023 ⟼ Recente (Padrão)",
    description: "Comparação padrão da análise GEE entre 2023 e a data recente",
    leftStart: "2023-11-01",
    leftEnd: "2023-12-31",
    rightStart: "2024-01-01",
    rightEnd: new Date().toISOString().split("T")[0],
    leftId: "2023",
    rightId: "2024",
  },
  {
    id: "idai-cyclone",
    title: "Ciclone Idai (Beira)",
    description: "Inundações históricas na Beira (2018 vs 2019)",
    leftStart: "2018-01-01",
    leftEnd: "2018-12-31",
    rightStart: "2019-01-01",
    rightEnd: "2019-12-31",
    leftId: "2018",
    rightId: "2019",
  },
  {
    id: "freddy-cyclone",
    title: "Ciclone Freddy (2023)",
    description: "Impacto no vale do Zambeze e costa central (2022 vs 2023)",
    leftStart: "2022-01-01",
    leftEnd: "2022-12-31",
    rightStart: "2023-01-01",
    rightEnd: "2023-12-31",
    leftId: "2022",
    rightId: "2023",
  },
  {
    id: "urban-expansion",
    title: "Crescimento Urbano",
    description: "Expansão de infraestruturas entre 2017 e 2024",
    leftStart: "2017-01-01",
    leftEnd: "2017-12-31",
    rightStart: "2024-01-01",
    rightEnd: "2024-12-31",
    leftId: "2017",
    rightId: "2024",
  },
  {
    id: "decadal-series",
    title: "Série Decadal Completa",
    description: "Evolução multitemporal histórica 2016 a 2024",
    leftStart: "2016-01-01",
    leftEnd: "2016-12-31",
    rightStart: "2024-01-01",
    rightEnd: "2024-12-31",
    leftId: "2016",
    rightId: "2024",
  },
];

export interface SplitScreenCompareProps {
  splitPercent: number; // 0 to 100
  onSplitChange: (percent: number) => void;
  // Year selectors / fallbacks
  leftValue?: string;
  rightValue?: string;
  onLeftChange?: (val: string) => void;
  onRightChange?: (val: string) => void;
  // Rich GEE Analysis comparison props
  activeAnalysisName?: string;
  activeAnalysisId?: string;
  compareMode?: CompareMode;
  onCompareModeChange?: (mode: CompareMode) => void;
  startDateLeft?: string;
  endDateLeft?: string;
  onDatesLeftChange?: (start: string, end: string) => void;
  startDateRight?: string;
  endDateRight?: string;
  onDatesRightChange?: (start: string, end: string) => void;
  isProcessingGee?: boolean;
  onProcessGee?: () => void;
  geeConnected?: boolean;
  compareError?: string | null;
  onOpenGeeAuth?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  options?: CompareOption[];
  presets?: ComparePreset[];
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: () => void;
  className?: string;
}

export default function SplitScreenCompare({
  splitPercent,
  onSplitChange,
  leftValue = "2023",
  rightValue = "2024",
  onLeftChange,
  onRightChange,
  activeAnalysisName,
  activeAnalysisId,
  compareMode = "temporal_gee",
  onCompareModeChange,
  startDateLeft = "2023-11-01",
  endDateLeft = "2023-12-31",
  onDatesLeftChange,
  startDateRight = "2024-01-01",
  endDateRight = new Date().toISOString().split("T")[0],
  onDatesRightChange,
  isProcessingGee = false,
  onProcessGee,
  geeConnected,
  compareError,
  onOpenGeeAuth,
  leftLabel,
  rightLabel,
  options = [
    { id: "2016", label: "2016" },
    { id: "2017", label: "2017" },
    { id: "2018", label: "2018" },
    { id: "2019", label: "2019" },
    { id: "2020", label: "2020" },
    { id: "2021", label: "2021" },
    { id: "2022", label: "2022" },
    { id: "2023", label: "2023" },
    { id: "2024", label: "2024 (Recente)" },
  ],
  presets = DEFAULT_COMPARE_PRESETS,
  containerRef,
  onClose,
  className = "",
}: SplitScreenCompareProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showConfigMenu, setShowConfigMenu] = useState(false);

  // Local state for dates in case controlled props aren't provided
  const [localStartLeft, setLocalStartLeft] = useState(startDateLeft);
  const [localEndLeft, setLocalEndLeft] = useState(endDateLeft);
  const [localStartRight, setLocalStartRight] = useState(startDateRight);
  const [localEndRight, setLocalEndRight] = useState(endDateRight);

  useEffect(() => {
    setLocalStartLeft(startDateLeft);
    setLocalEndLeft(endDateLeft);
  }, [startDateLeft, endDateLeft]);

  useEffect(() => {
    setLocalStartRight(startDateRight);
    setLocalEndRight(endDateRight);
  }, [startDateRight, endDateRight]);

  // Handle pointer/mouse drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDragging) return;
      const targetContainer = containerRef?.current || document.getElementById("geomoz-map-area") || document.body;
      const rect = targetContainer.getBoundingClientRect();
      const clientX = e.clientX;
      const rawPct = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(5, Math.min(95, rawPct));
      onSplitChange(clamped);
    },
    [isDragging, containerRef, onSplitChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Dynamic tags text
  const computedLeftTag = leftLabel || (
    compareMode === "analysis_vs_satellite"
      ? (activeAnalysisName ? `${activeAnalysisName} (GEE)` : "Análise GEE")
      : compareMode === "temporal_gee"
      ? `${localStartLeft.slice(0, 4)} (Antes)`
      : `${leftValue} (Antes)`
  );

  const computedRightTag = rightLabel || (
    compareMode === "analysis_vs_satellite"
      ? "Satélite Real"
      : compareMode === "temporal_gee"
      ? `${localStartRight.slice(0, 4)} / Recente (Depois)`
      : `${rightValue} (Depois)`
  );

  return (
    <>
      {/* Top Floating Control Bar */}
      <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[650] pointer-events-auto select-none max-w-2xl w-[94%] sm:w-auto ${className}`}>
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5 sm:gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-1.5 sm:p-2 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Analysis Badge (if connected to GeoAnálise) */}
          {activeAnalysisName && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-bold shrink-0">
              <Layers size={13} />
              <span className="truncate max-w-[140px]">{activeAnalysisName}</span>
            </div>
          )}

          {/* Mode Selector */}
          {onCompareModeChange && (
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onCompareModeChange("temporal_gee")}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  compareMode === "temporal_gee"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
                title="Comparar a análise selecionada entre dois períodos via GEE"
              >
                2023 ⟼ Recente
              </button>
              <button
                type="button"
                onClick={() => onCompareModeChange("analysis_vs_satellite")}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  compareMode === "analysis_vs_satellite"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
                title="Cortina deslizante: Análise sobre imagem de satélite real"
              >
                Análise vs Satélite
              </button>
              <button
                type="button"
                onClick={() => onCompareModeChange("s2_temporal")}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  compareMode === "s2_temporal"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
                title="Mosaicos Sentinel-2 ópticos multitemporais"
              >
                Sentinel-2
              </button>
            </div>
          )}

          {/* If Sentinel-2 mode or simple mode: show year selectors */}
          {compareMode === "s2_temporal" && onLeftChange && onRightChange && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-300 shrink-0">
                  Antes:
                </span>
                <select
                  value={leftValue}
                  onChange={(e) => onLeftChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id} className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                  Depois:
                </span>
                <select
                  value={rightValue}
                  onChange={(e) => onRightChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id} className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Dates & Scenarios Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConfigMenu(!showConfigMenu)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Cenários de Comparação Pré-definidos"
            >
              <Calendar size={13} className="text-sky-500" />
              <span className="hidden sm:inline">Cenários & Datas</span>
            </button>

            {/* Config Popover */}
            {showConfigMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 z-[700] space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                    <Sliders size={14} className="text-sky-500" />
                    <span>Períodos de Comparação</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfigMenu(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Date Inputs */}
                <div className="space-y-2">
                  <div className="p-2 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40">
                    <div className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-300 mb-1 flex items-center justify-between">
                      <span>Período 1 (Antes)</span>
                      <span className="text-[9px] text-sky-500 font-normal">Padrão: 2023</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[9px] text-slate-400 block mb-0.5">Início</label>
                        <input
                          type="date"
                          value={localStartLeft}
                          onChange={(e) => {
                            setLocalStartLeft(e.target.value);
                            onDatesLeftChange?.(e.target.value, localEndLeft);
                          }}
                          className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 block mb-0.5">Fim</label>
                        <input
                          type="date"
                          value={localEndLeft}
                          onChange={(e) => {
                            setLocalEndLeft(e.target.value);
                            onDatesLeftChange?.(localStartLeft, e.target.value);
                          }}
                          className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                    <div className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 mb-1 flex items-center justify-between">
                      <span>Período 2 (Depois)</span>
                      <span className="text-[9px] text-indigo-500 font-normal">Padrão: Recente</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[9px] text-slate-400 block mb-0.5">Início</label>
                        <input
                          type="date"
                          value={localStartRight}
                          onChange={(e) => {
                            setLocalStartRight(e.target.value);
                            onDatesRightChange?.(e.target.value, localEndRight);
                          }}
                          className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 block mb-0.5">Fim</label>
                        <input
                          type="date"
                          value={localEndRight}
                          onChange={(e) => {
                            setLocalEndRight(e.target.value);
                            onDatesRightChange?.(localStartRight, e.target.value);
                          }}
                          className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Cenários Rápidos (1-Clique)
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (preset.leftStart && preset.leftEnd && preset.rightStart && preset.rightEnd) {
                            setLocalStartLeft(preset.leftStart);
                            setLocalEndLeft(preset.leftEnd);
                            setLocalStartRight(preset.rightStart);
                            setLocalEndRight(preset.rightEnd);
                            onDatesLeftChange?.(preset.leftStart, preset.leftEnd);
                            onDatesRightChange?.(preset.rightStart, preset.rightEnd);
                          }
                          onLeftChange?.(preset.leftId);
                          onRightChange?.(preset.rightId);
                          setShowConfigMenu(false);
                          onProcessGee?.();
                        }}
                        className="w-full text-left p-1.5 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors group flex items-start gap-2"
                      >
                        <Sparkles size={12} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600">
                            {preset.title}
                          </div>
                          <div className="text-[10px] text-slate-400 leading-tight">
                            {preset.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recompute GEE button */}
                {onProcessGee && compareMode === "temporal_gee" && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfigMenu(false);
                      onProcessGee();
                    }}
                    disabled={isProcessingGee}
                    className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-98 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25 transition-all"
                  >
                    {isProcessingGee ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Processando no GEE...</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="currentColor" />
                        <span>Recomputar Períodos GEE</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* GEE Process Indicator */}
          {onProcessGee && compareMode === "temporal_gee" && (
            <button
              type="button"
              onClick={onProcessGee}
              disabled={isProcessingGee}
              className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-98 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all"
              title="Processar análise para ambos os períodos no Google Earth Engine"
            >
              {isProcessingGee ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="hidden sm:inline">Calculando GEE...</span>
                </>
              ) : (
                <>
                  <Play size={11} fill="currentColor" />
                  <span className="hidden sm:inline">Executar GEE</span>
                </>
              )}
            </button>
          )}

          {/* Split Reset to 50% */}
          <button
            type="button"
            onClick={() => onSplitChange(50)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Centrar Divisor (50%)"
          >
            <Columns2 size={15} />
          </button>

          {/* Close Compare */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
              title="Sair do Modo Comparação"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Error Alert Banner */}
        {compareError && (
          <div className="mt-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-rose-50/95 dark:bg-rose-950/95 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl text-xs shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <AlertTriangle size={14} className="text-rose-600 shrink-0" />
              <span className="truncate font-medium">{compareError}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onProcessGee && (
                <button
                  type="button"
                  onClick={onProcessGee}
                  className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition-colors"
                >
                  Tentar de novo
                </button>
              )}
              {onCompareModeChange && (
                <button
                  type="button"
                  onClick={() => onCompareModeChange("s2_temporal")}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold hover:bg-slate-50 transition-colors"
                >
                  Ver Sentinel-2
                </button>
              )}
            </div>
          </div>
        )}

        {/* Offline / GEE Not Connected Banner */}
        {compareMode === "temporal_gee" && geeConnected === false && !compareError && (
          <div className="mt-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50/95 dark:bg-amber-950/95 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl text-xs shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <KeyRound size={13} className="text-amber-600 shrink-0" />
              <span className="truncate text-[11px] font-medium">GEE não autenticado (requer login Google no topo)</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenGeeAuth && (
                <button
                  type="button"
                  onClick={onOpenGeeAuth}
                  className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition-colors"
                >
                  Ligar GEE
                </button>
              )}
              {onCompareModeChange && (
                <button
                  type="button"
                  onClick={() => onCompareModeChange("s2_temporal")}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold hover:bg-slate-50 transition-colors"
                >
                  Usar Sentinel-2
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Draggable Vertical Divider Line */}
      <div
        className="absolute inset-y-0 z-[600] pointer-events-none select-none transition-opacity"
        style={{ left: `${splitPercent}%` }}
      >
        {/* Neon vertical line */}
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_12px_rgba(14,165,233,0.9)]" />

        {/* Center Draggable Handle Pill */}
        <div
          onPointerDown={handlePointerDown}
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-auto cursor-ew-resize flex items-center justify-center p-1 rounded-full shadow-2xl transition-transform active:scale-95 touch-none ${
            isDragging
              ? "bg-sky-500 text-white ring-4 ring-sky-300/50 scale-110"
              : "bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 hover:scale-105 border-2 border-sky-400"
          }`}
          title="Arraste para comparar Antes e Depois"
        >
          <div className="flex items-center gap-1 px-2 py-1">
            <ChevronLeft size={13} className="shrink-0 text-sky-500" />
            <span className="text-[10px] font-black tracking-wider uppercase whitespace-nowrap">
              {Math.round(splitPercent)}%
            </span>
            <ChevronRight size={13} className="shrink-0 text-indigo-500" />
          </div>
        </div>

        {/* Floating Side Tags */}
        <div className="absolute top-16 -left-2 -translate-x-full pointer-events-none">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-sky-500/40 backdrop-blur-md text-[10px] font-black text-sky-300 shadow-xl whitespace-nowrap">
            ◀ {computedLeftTag}
          </span>
        </div>
        <div className="absolute top-16 -right-2 translate-x-full pointer-events-none">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-indigo-500/40 backdrop-blur-md text-[10px] font-black text-indigo-300 shadow-xl whitespace-nowrap">
            {computedRightTag} ▶
          </span>
        </div>
      </div>
    </>
  );
}

export { SplitScreenCompare };

/**
 * Utility helper for CSS clipPath styling:
 * Returns the clipPath string for rendering the right layer on a split screen.
 */
export function getSplitClipPath(isRightSide: boolean, splitPercent: number): React.CSSProperties {
  if (isRightSide) {
    return {
      clipPath: `inset(0 0 0 ${splitPercent}%)`,
      WebkitClipPath: `inset(0 0 0 ${splitPercent}%)`,
    };
  }
  return {
    clipPath: `inset(0 calc(100% - ${splitPercent}%) 0 0)`,
    WebkitClipPath: `inset(0 calc(100% - ${splitPercent}%) 0 0)`,
  };
}
