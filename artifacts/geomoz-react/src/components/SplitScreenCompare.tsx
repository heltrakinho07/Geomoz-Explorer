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
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface CompareOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ComparePreset {
  id: string;
  title: string;
  description: string;
  leftId: string;
  rightId: string;
}

export const DEFAULT_COMPARE_PRESETS: ComparePreset[] = [
  {
    id: "idai-cyclone",
    title: "Ciclone Idai (Beira)",
    description: "Comparação pré e pós inundações históricas de 2019",
    leftId: "2018",
    rightId: "2019",
  },
  {
    id: "urban-expansion",
    title: "Crescimento Urbano",
    description: "Expansão de infraestruturas entre 2016 e 2024",
    leftId: "2016",
    rightId: "2024",
  },
  {
    id: "freddy-cyclone",
    title: "Ciclone Freddy (2023)",
    description: "Impacto no vale do Zambeze e costa central",
    leftId: "2022",
    rightId: "2023",
  },
  {
    id: "water-recession",
    title: "Seca vs Cheia",
    description: "Variação de corpos hídricos (2016 vs 2021)",
    leftId: "2016",
    rightId: "2021",
  },
];

export interface SplitScreenCompareProps {
  splitPercent: number; // 0 to 100
  onSplitChange: (percent: number) => void;
  leftValue: string;
  rightValue: string;
  onLeftChange: (val: string) => void;
  onRightChange: (val: string) => void;
  options?: CompareOption[];
  presets?: ComparePreset[];
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onClose?: () => void;
  className?: string;
}

export default function SplitScreenCompare({
  splitPercent,
  onSplitChange,
  leftValue,
  rightValue,
  onLeftChange,
  onRightChange,
  options = [
    { id: "2016", label: "2016 (Mosaico S2)" },
    { id: "2017", label: "2017 (Mosaico S2)" },
    { id: "2018", label: "2018 (Mosaico S2)" },
    { id: "2019", label: "2019 (Mosaico S2)" },
    { id: "2020", label: "2020 (Mosaico S2)" },
    { id: "2021", label: "2021 (Mosaico S2)" },
    { id: "2022", label: "2022 (Mosaico S2)" },
    { id: "2023", label: "2023 (Mosaico S2)" },
    { id: "2024", label: "2024 (Mosaico S2)" },
  ],
  presets = DEFAULT_COMPARE_PRESETS,
  containerRef,
  onClose,
  className = "",
}: SplitScreenCompareProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);

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

  const handlePointerUp = useCallback((e: PointerEvent) => {
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

  return (
    <>
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[650] pointer-events-auto select-none max-w-xl w-[92%] sm:w-auto">
        <div className="flex items-center gap-1.5 sm:gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-1.5 sm:p-2 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-150">
          {/* Left Selector (Antes) */}
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
                <option key={opt.id} value={opt.id} className="text-slate-800 bg-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Center Divider / Presets Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetMenu(!showPresetMenu)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Cenários de Comparação Pré-definidos"
            >
              <Sparkles size={12} className="text-amber-500" />
              <span className="hidden sm:inline">Cenários</span>
            </button>

            {/* Presets dropdown */}
            {showPresetMenu && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-[700] space-y-1">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Cenários Ambientais
                </div>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onLeftChange(preset.leftId);
                      onRightChange(preset.rightId);
                      setShowPresetMenu(false);
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors group"
                  >
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600">
                      {preset.title}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {preset.leftId} ⟷ {preset.rightId} · {preset.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Selector (Depois) */}
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
                <option key={opt.id} value={opt.id} className="text-slate-800 bg-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

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
      </div>

      {/* Draggable Vertical Divider Line */}
      <div
        className="absolute inset-y-0 z-[600] pointer-events-none select-none transition-opacity"
        style={{ left: `${splitPercent}%` }}
      >
        {/* Neon vertical line */}
        <div className="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_10px_rgba(14,165,233,0.8)]" />

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
            <ChevronLeft size={13} className="shrink-0" />
            <span className="text-[10px] font-black tracking-wider uppercase whitespace-nowrap">
              {Math.round(splitPercent)}%
            </span>
            <ChevronRight size={13} className="shrink-0" />
          </div>
        </div>

        {/* Floating Side Tags */}
        <div className="absolute top-16 -left-2 -translate-x-full pointer-events-none">
          <span className="px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-[10px] font-bold text-white shadow-md">
            ◀ {leftValue} (Antes)
          </span>
        </div>
        <div className="absolute top-16 -right-2 translate-x-full pointer-events-none">
          <span className="px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-[10px] font-bold text-white shadow-md">
            {rightValue} (Depois) ▶
          </span>
        </div>
      </div>
    </>
  );
}

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
