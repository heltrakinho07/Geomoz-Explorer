import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  ChevronLeft,
  ChevronRight,
  Clock,
  Repeat,
  Sparkles,
  Calendar,
  X,
  ChevronDown,
  Layers,
} from "lucide-react";

export type TimeLapsePeriodMode = "recent" | "full";

export interface TimeLapseMilestone {
  year: string;
  label: string;
  description?: string;
}

export const RECENT_YEARS = ["2023", "2024"];
export const ALL_YEARS = ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"];

export const DEFAULT_ENVIRONMENTAL_MILESTONES: TimeLapseMilestone[] = [
  { year: "2016", label: "El Niño Seca", description: "Seca severa na África Austral" },
  { year: "2019", label: "Ciclones Idai & Kenneth", description: "Inundações históricas na Beira e Cabo Delgado" },
  { year: "2021", label: "La Niña Húmida", description: "Recuperação de reservatórios e biomassa" },
  { year: "2023", label: "Ciclone Freddy", description: "Ciclone de maior duração registado (Zambézia)" },
  { year: "2024", label: "Atualidade", description: "Monitoramento em alta resolução recente" },
];

export interface TimeLapsePlayerProps {
  years?: string[];
  currentYear: string;
  onYearChange: (year: string) => void;
  isPlaying?: boolean;
  onPlayChange?: (playing: boolean) => void;
  title?: string;
  activeAnalysisName?: string;
  periodMode?: TimeLapsePeriodMode;
  onPeriodModeChange?: (mode: TimeLapsePeriodMode) => void;
  milestones?: TimeLapseMilestone[];
  onClose?: () => void;
  className?: string;
}

export default function TimeLapsePlayer({
  years: externalYears,
  currentYear,
  onYearChange,
  isPlaying: externalIsPlaying,
  onPlayChange,
  title,
  activeAnalysisName,
  periodMode: externalPeriodMode,
  onPeriodModeChange,
  milestones = DEFAULT_ENVIRONMENTAL_MILESTONES,
  onClose,
  className = "",
}: TimeLapsePlayerProps) {
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [loop, setLoop] = useState(true);
  const [internalPeriodMode, setInternalPeriodMode] = useState<TimeLapsePeriodMode>("recent");
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);

  const activePeriodMode = externalPeriodMode ?? internalPeriodMode;
  const effectiveYears = externalYears || (activePeriodMode === "recent" ? RECENT_YEARS : ALL_YEARS);

  const isPlaying = externalIsPlaying ?? internalPlaying;
  const setPlaying = (play: boolean) => {
    setInternalPlaying(play);
    onPlayChange?.(play);
  };

  const currentIndex = Math.max(0, effectiveYears.indexOf(currentYear));

  // Step forward
  const stepNext = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < effectiveYears.length) {
      onYearChange(effectiveYears[nextIdx]);
    } else if (loop) {
      onYearChange(effectiveYears[0]);
    } else {
      setPlaying(false);
    }
  }, [currentIndex, effectiveYears, loop, onYearChange]);

  // Step back
  const stepPrev = useCallback(() => {
    const prevIdx = currentIndex - 1;
    if (prevIdx >= 0) {
      onYearChange(effectiveYears[prevIdx]);
    } else if (loop) {
      onYearChange(effectiveYears[effectiveYears.length - 1]);
    }
  }, [currentIndex, effectiveYears, loop, onYearChange]);

  // Timer for automatic playback
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = speed === 0.5 ? 2500 : speed === 2 ? 700 : 1400;
    const timer = setInterval(() => {
      stepNext();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, speed, stepNext]);

  // Keyboard controls: space for play/pause, arrows for prev/next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!isPlaying);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        stepNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        stepPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, stepNext, stepPrev]);

  const activeMilestone = milestones.find((m) => m.year === currentYear);
  const displayTitle = title || (activeAnalysisName ? `Time-Lapse: ${activeAnalysisName}` : "Evolução Temporal Dinâmica");

  return (
    <div className={`w-full max-w-2xl mx-auto pointer-events-auto select-none ${className}`}>
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-3 sm:p-4 text-slate-800 dark:text-slate-100 animate-in fade-in slide-in-from-bottom-3 duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
              {displayTitle}
            </span>
            {activeAnalysisName && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
                <Layers size={10} /> Conectado GEE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Period Mode Selector (Recent vs Full) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                title="Alternar período do time-lapse"
              >
                <Calendar size={11} className="text-sky-500" />
                <span>{activePeriodMode === "recent" ? "2023–Recente" : "2016–2024"}</span>
                <ChevronDown size={11} className="text-slate-400" />
              </button>

              {showPeriodMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (onPeriodModeChange) onPeriodModeChange("recent");
                      else setInternalPeriodMode("recent");
                      if (!RECENT_YEARS.includes(currentYear)) onYearChange(RECENT_YEARS[0]);
                      setShowPeriodMenu(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg font-bold transition-colors ${
                      activePeriodMode === "recent"
                        ? "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <div>2023 – Recente (Padrão)</div>
                    <div className="text-[10px] text-slate-400 font-normal">Foco no período recente</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onPeriodModeChange) onPeriodModeChange("full");
                      else setInternalPeriodMode("full");
                      setShowPeriodMenu(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg font-bold transition-colors ${
                      activePeriodMode === "full"
                        ? "bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <div>2016 – 2024 (Série Completa)</div>
                    <div className="text-[10px] text-slate-400 font-normal">9 anos de observação decadal</div>
                  </button>
                </div>
              )}
            </div>

            {/* Close Button */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Fechar reprodutor de Time-Lapse"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Timeline Scrubber & Year Selector */}
        <div className="mb-3">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            {effectiveYears.map((yr, idx) => {
              const isCurrent = yr === currentYear;
              const hasMilestone = milestones.some((m) => m.year === yr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => onYearChange(yr)}
                  className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded-xl transition-all ${
                    isCurrent
                      ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 scale-105 font-black"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold"
                  }`}
                >
                  <span className="text-[11px] leading-tight">{yr}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isCurrent
                          ? "bg-white ring-2 ring-white/50"
                          : hasMilestone
                          ? "bg-amber-400"
                          : "bg-slate-300 dark:bg-slate-600"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-sky-500 h-full transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / effectiveYears.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Controls and Speed Bar */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Milestone Banner (Left) */}
          <div className="min-w-0 flex-1">
            {activeMilestone ? (
              <div className="flex items-center gap-1.5 text-xs">
                <Sparkles size={12} className="text-amber-500 shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                  {activeMilestone.label}
                </span>
                {activeMilestone.description && (
                  <span className="hidden md:inline text-[11px] text-slate-400 truncate">
                    — {activeMilestone.description}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Clock size={12} />
                <span>Ano selecionado: <strong>{currentYear}</strong></span>
              </div>
            )}
          </div>

          {/* Center Playback Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={stepPrev}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              type="button"
              onClick={() => setPlaying(!isPlaying)}
              className={`p-2 rounded-xl text-white shadow-lg transition-all active:scale-95 ${
                isPlaying
                  ? "bg-amber-500 shadow-amber-500/25 hover:bg-amber-600"
                  : "bg-sky-600 shadow-sky-600/25 hover:bg-sky-700"
              }`}
              title={isPlaying ? "Pausar time-lapse (Espaço)" : "Iniciar time-lapse (Espaço)"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
            </button>

            <button
              type="button"
              onClick={stepNext}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Próximo ano"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Speed & Loop (Right) */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Speed Pills */}
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[10px] font-bold">
              {([0.5, 1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`px-1.5 py-0.5 rounded-md transition-all ${
                    speed === s
                      ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-xs"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setLoop(!loop)}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                loop
                  ? "text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                  : "text-slate-300 hover:text-slate-500"
              }`}
              title={loop ? "Repetição contínua ativa" : "Parar no final da série"}
            >
              <Repeat size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TimeLapsePlayer };
