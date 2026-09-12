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
} from "lucide-react";

export interface TimeLapseMilestone {
  year: string;
  label: string;
  description?: string;
}

export const DEFAULT_ENVIRONMENTAL_MILESTONES: TimeLapseMilestone[] = [
  { year: "2016", label: "El Niño Seca", description: "Seca severa na África Austral" },
  { year: "2019", label: "Ciclones Idai & Kenneth", description: "Inundações históricas na Beira e Cabo Delgado" },
  { year: "2021", label: "La Niña Húmida", description: "Recuperação de reservatórios e biomassa" },
  { year: "2023", label: "Ciclone Freddy", description: "Ciclone de maior duração registado (Zambézia)" },
  { year: "2024", label: "Atualidade", description: "Monitoramento em alta resolução" },
];

export interface TimeLapsePlayerProps {
  years?: string[];
  currentYear: string;
  onYearChange: (year: string) => void;
  isPlaying?: boolean;
  onPlayChange?: (playing: boolean) => void;
  title?: string;
  milestones?: TimeLapseMilestone[];
  onClose?: () => void;
  className?: string;
}

export default function TimeLapsePlayer({
  years = ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"],
  currentYear,
  onYearChange,
  isPlaying: externalIsPlaying,
  onPlayChange,
  title = "Linha do Tempo Multitemporal",
  milestones = DEFAULT_ENVIRONMENTAL_MILESTONES,
  onClose,
  className = "",
}: TimeLapsePlayerProps) {
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1); // 0.5x (2.5s), 1x (1.4s), 2x (0.7s)
  const [loop, setLoop] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  const isPlaying = externalIsPlaying ?? internalPlaying;
  const setPlaying = (play: boolean) => {
    setInternalPlaying(play);
    onPlayChange?.(play);
  };

  const currentIndex = Math.max(0, years.indexOf(currentYear));

  // Step forward
  const stepNext = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < years.length) {
      onYearChange(years[nextIdx]);
    } else if (loop) {
      onYearChange(years[0]);
    } else {
      setPlaying(false);
    }
  }, [currentIndex, years, loop, onYearChange]);

  // Step back
  const stepPrev = useCallback(() => {
    const prevIdx = currentIndex - 1;
    if (prevIdx >= 0) {
      onYearChange(years[prevIdx]);
    } else if (loop) {
      onYearChange(years[years.length - 1]);
    }
  }, [currentIndex, years, loop, onYearChange]);

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
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlaying, stepNext, stepPrev]);

  // Current milestone if any
  const currentMilestone = milestones.find((m) => m.year === currentYear);

  if (isMinimized) {
    return (
      <div className={`pointer-events-auto select-none ${className}`}>
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-sky-400 hover:bg-sky-50/50 transition-all active:scale-95"
          title="Expandir Time-Lapse Player"
        >
          <div className="w-5 h-5 rounded-lg bg-sky-500 text-white flex items-center justify-center shadow-2xs">
            {isPlaying ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
          </div>
          <span className="font-bold text-sky-600 dark:text-sky-400">{currentYear}</span>
          <span className="text-slate-400 font-normal">· Time-Lapse</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto select-none max-w-xl w-full mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl p-3 sm:p-4 text-slate-800 dark:text-slate-100 transition-all ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Clock size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
              <span>{title}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold">
                2016–2024
              </span>
            </div>
            {currentMilestone ? (
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate flex items-center gap-1">
                <Sparkles size={10} />
                <span>{currentMilestone.label}</span>
                {currentMilestone.description && (
                  <span className="text-slate-400 hidden sm:inline">— {currentMilestone.description}</span>
                )}
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 truncate">
                Navegue ou dê Play para animar a evolução anual do território
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Speed Selector */}
          <button
            type="button"
            onClick={() => setSpeed(speed === 0.5 ? 1 : speed === 1 ? 2 : 0.5)}
            className="px-2 py-1 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={`Velocidade: ${speed}x. Clique para alterar (0.5x, 1x, 2x)`}
          >
            {speed}x
          </button>

          {/* Loop toggle */}
          <button
            type="button"
            onClick={() => setLoop(!loop)}
            className={`p-1 rounded-lg border transition-colors ${
              loop
                ? "bg-sky-50 dark:bg-sky-950/60 border-sky-300 text-sky-600 dark:text-sky-400"
                : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600"
            }`}
            title={loop ? "Repetição Contínua: Ligada" : "Repetição Contínua: Desligada"}
          >
            <Repeat size={13} />
          </button>

          {/* Minimize */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Minimizar Time-Lapse"
          >
            <ChevronLeft size={15} className="rotate-90" />
          </button>

          {/* Close */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar Time-Lapse"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Main Controls Row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={() => setPlaying(!isPlaying)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-md transition-all active:scale-95 shrink-0 ${
            isPlaying
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white"
          }`}
          title={isPlaying ? "Pausar Time-Lapse (Espaço)" : "Iniciar Time-Lapse (Espaço)"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        {/* Step Prev */}
        <button
          type="button"
          onClick={stepPrev}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
          title="Ano Anterior (Seta Esquerda)"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Current Year Badge */}
        <div className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0 min-w-[62px]">
          <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 leading-none">
            Ano
          </span>
          <span className="text-base font-extrabold text-sky-600 dark:text-sky-400 leading-tight">
            {currentYear}
          </span>
        </div>

        {/* Step Next */}
        <button
          type="button"
          onClick={stepNext}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
          title="Próximo Ano (Seta Direita)"
        >
          <ChevronRight size={16} />
        </button>

        {/* Interactive Timeline Track */}
        <div className="flex-1 relative flex flex-col justify-center py-2 min-w-0">
          {/* Track background */}
          <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky-500 to-indigo-600 transition-all duration-300 rounded-full"
              style={{
                width: `${(currentIndex / Math.max(1, years.length - 1)) * 100}%`,
              }}
            />
          </div>

          {/* Year Markers */}
          <div className="relative flex justify-between items-center -mt-2">
            {years.map((y, idx) => {
              const isCurrent = y === currentYear;
              const hasMilestone = milestones.some((m) => m.year === y);
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onYearChange(y)}
                  className="group relative flex flex-col items-center focus:outline-none"
                  title={`${y}${hasMilestone ? ` · ${milestones.find((m) => m.year === y)?.label}` : ""}`}
                >
                  {/* Dot */}
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      isCurrent
                        ? "bg-sky-600 border-white ring-2 ring-sky-400 scale-125 shadow-md"
                        : idx <= currentIndex
                        ? "bg-indigo-500 border-white hover:scale-110"
                        : "bg-slate-300 dark:bg-slate-600 border-white dark:border-slate-800 hover:bg-slate-400"
                    }`}
                  />
                  {/* Label (only show first, last, current, or milestone on small screens) */}
                  <span
                    className={`text-[9px] font-bold mt-1.5 transition-colors ${
                      isCurrent
                        ? "text-sky-600 dark:text-sky-400 font-black scale-110"
                        : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    } ${
                      idx !== 0 &&
                      idx !== years.length - 1 &&
                      !isCurrent &&
                      !hasMilestone
                        ? "hidden md:inline"
                        : ""
                    }`}
                  >
                    {y}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
