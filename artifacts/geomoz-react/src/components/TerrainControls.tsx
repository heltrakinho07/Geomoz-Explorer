import React, { useState } from "react";
import {
  Compass,
  Mountain,
  RotateCcw,
  Globe,
  Sliders,
  Activity,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

export interface LandmarkPreset {
  name: string;
  region: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export const GLOBAL_LANDMARKS: LandmarkPreset[] = [
  {
    name: "Monte Binga",
    region: "Manica (Ponto mais alto de Moçambique 2.436m)",
    center: [33.0614, -19.7747],
    zoom: 13,
    pitch: 65,
    bearing: 45,
    description: "Maciço de Chimanimani",
  },
  {
    name: "Monte Namúli",
    region: "Zambézia (Inselberg 2.419m)",
    center: [37.0333, -15.3667],
    zoom: 13.5,
    pitch: 68,
    bearing: 140,
    description: "Plutão granítico intrusivo",
  },
  {
    name: "Monte Kilimanjaro",
    region: "Tanzânia (5.895m)",
    center: [37.3556, -3.0674],
    zoom: 12,
    pitch: 70,
    bearing: 25,
    description: "Maior vulcão e pico de África",
  },
  {
    name: "Monte Evereste",
    region: "Himalaias (8.848m)",
    center: [86.925, 27.9881],
    zoom: 12,
    pitch: 72,
    bearing: 200,
    description: "O teto do mundo",
  },
  {
    name: "Grand Canyon",
    region: "Arizona, EUA",
    center: [-112.1129, 36.1069],
    zoom: 12,
    pitch: 65,
    bearing: 75,
    description: "Erosão estratigráfica milenar",
  },
  {
    name: "Monte Branco",
    region: "Alpes Europeus (4.808m)",
    center: [6.8656, 45.8326],
    zoom: 13,
    pitch: 68,
    bearing: 125,
    description: "Maciço alpino glacial",
  },
];

interface TerrainControlsProps {
  pitch: number;
  bearing: number;
  exaggeration: number;
  projection: "globe" | "mercator";
  profileModeActive: boolean;
  onPitchChange: (pitch: number) => void;
  onExaggerationChange: (exag: number) => void;
  onResetNorth: () => void;
  onToggleProjection: () => void;
  onToggleProfileMode: () => void;
  onFlyToPreset: (preset: LandmarkPreset) => void;
  className?: string;
}

export default function TerrainControls({
  pitch,
  bearing,
  exaggeration,
  projection,
  profileModeActive,
  onPitchChange,
  onExaggerationChange,
  onResetNorth,
  onToggleProjection,
  onToggleProfileMode,
  onFlyToPreset,
  className = "",
}: TerrainControlsProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  return (
    <div
      className={`flex flex-col gap-2 pointer-events-auto select-none ${className}`}
    >
      {/* Primary Floating Toolbar */}
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-800 p-1.5 flex flex-col gap-1.5">
        {/* Compass / Reset North */}
        <button
          type="button"
          onClick={onResetNorth}
          title={`Orientação: ${Math.round(bearing)}°. Clique para orientar a Norte`}
          className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors group"
        >
          <div
            style={{ transform: `rotate(${-bearing}deg)` }}
            className="transition-transform duration-200 ease-out"
          >
            <Compass size={20} className="text-sky-600 group-hover:text-sky-500" />
          </div>
          {bearing !== 0 && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
          )}
        </button>

        {/* Projection Mode (Globe vs Flat) */}
        <button
          type="button"
          onClick={onToggleProjection}
          title={
            projection === "globe"
              ? "Projeção: Globo 3D. Clique para mudar para Plano Mercator"
              : "Projeção: Plano Mercator. Clique para mudar para Globo 3D"
          }
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            projection === "globe"
              ? "bg-sky-50 text-sky-600 border border-sky-200 font-medium"
              : "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Globe size={18} />
        </button>

        {/* 3D Pitch tilt toggle button (0° -> 45° -> 70°) */}
        <button
          type="button"
          onClick={() => {
            if (pitch < 30) onPitchChange(60);
            else if (pitch < 65) onPitchChange(75);
            else onPitchChange(0);
          }}
          title={`Inclinação atual: ${Math.round(pitch)}°. Clique para alternar 3D`}
          className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
            pitch > 10
              ? "bg-amber-50 text-amber-700 border border-amber-200"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <div className="flex flex-col items-center leading-none">
            <span className="text-[11px]">3D</span>
            <span className="text-[8px] font-normal opacity-70">
              {Math.round(pitch)}°
            </span>
          </div>
        </button>

        {/* Topographic Profile 3D Button */}
        <button
          type="button"
          onClick={onToggleProfileMode}
          title={
            profileModeActive
              ? "Cancelar corte de perfil 3D"
              : "Traçar Perfil Topográfico 3D (clique 2 pontos no terreno)"
          }
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
            profileModeActive
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/20 ring-2 ring-rose-400"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Activity size={18} />
        </button>

        {/* Terrain Settings Drawer Toggle */}
        <button
          type="button"
          onClick={() => {
            setShowSettings(!showSettings);
            setShowPresets(false);
          }}
          title="Ajustes de Relevo e Exagero Vertical"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            showSettings
              ? "bg-slate-200 dark:bg-slate-700 text-slate-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sliders size={18} />
        </button>

        {/* Global Landmarks Dropdown Toggle */}
        <button
          type="button"
          onClick={() => {
            setShowPresets(!showPresets);
            setShowSettings(false);
          }}
          title="Destinos Mundiais em 3D (Evereste, Namúli, Kilimanjaro...)"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            showPresets
              ? "bg-purple-100 text-purple-700"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Sparkles size={17} className="text-purple-600" />
        </button>
      </div>

      {/* Terrain Settings Panel */}
      {showSettings && (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 w-64 text-xs flex flex-col gap-3 animate-in fade-in slide-in-from-right-2 duration-150">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
              <Mountain size={14} className="text-sky-600" />
              <span>Controlo de Relevo 3D</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          {/* Vertical Exaggeration */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Exagero Vertical:</span>
              <span className="font-mono font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded text-[11px]">
                {exaggeration.toFixed(1)}x
              </span>
            </div>
            <Slider
              value={[exaggeration]}
              min={1.0}
              max={3.0}
              step={0.1}
              onValueChange={([val]) => onExaggerationChange(val)}
              className="py-1 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>1.0x (Real)</span>
              <span>2.0x</span>
              <span>3.0x (Dramático)</span>
            </div>
          </div>

          {/* Pitch Angle */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
              <span>Ângulo de Câmara (Pitch):</span>
              <span className="font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                {Math.round(pitch)}°
              </span>
            </div>
            <Slider
              value={[pitch]}
              min={0}
              max={80}
              step={5}
              onValueChange={([val]) => onPitchChange(val)}
              className="py-1 cursor-pointer"
            />
            <div className="flex justify-between gap-1 mt-1">
              <button
                type="button"
                onClick={() => onPitchChange(0)}
                className={`flex-1 py-1 rounded border text-[10px] transition-colors ${
                  pitch === 0
                    ? "bg-slate-800 text-white border-slate-800"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                Zenital (0°)
              </button>
              <button
                type="button"
                onClick={() => onPitchChange(60)}
                className={`flex-1 py-1 rounded border text-[10px] transition-colors ${
                  pitch >= 55 && pitch <= 65
                    ? "bg-slate-800 text-white border-slate-800"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                Perspectiva (60°)
              </button>
              <button
                type="button"
                onClick={() => onPitchChange(75)}
                className={`flex-1 py-1 rounded border text-[10px] transition-colors ${
                  pitch >= 70
                    ? "bg-slate-800 text-white border-slate-800"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                Horizonte (75°)
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800 leading-relaxed">
            <p>
              💡 <strong>Dica de Navegação 3D:</strong>
            </p>
            <p>• Segure o botão direito do rato ou <kbd>Ctrl</kbd> para rodar e inclinar.</p>
            <p>• Roda do rato para zoom.</p>
          </div>
        </div>
      )}

      {/* Global Landmarks Preset Panel */}
      {showPresets && (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 w-64 text-xs flex flex-col gap-2 animate-in fade-in slide-in-from-right-2 duration-150">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300">
              <Sparkles size={14} />
              <span>Explorar Relevo Mundial</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPresets(false)}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-slate-500 leading-tight">
            Voe instantaneamente para pontos icónicos do relevo planetário em 3D:
          </p>

          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
            {GLOBAL_LANDMARKS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onFlyToPreset(preset);
                  setShowPresets(false);
                }}
                className="text-left p-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-transparent hover:border-purple-200 transition-all flex flex-col group"
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-purple-700">
                    {preset.name}
                  </span>
                  <span className="text-[9px] text-purple-600 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.2 rounded">
                    3D
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 line-clamp-1">
                  {preset.region}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
