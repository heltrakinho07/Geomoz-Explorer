/**
 * RasterVisPanel — Floating panel for adjusting GEE raster tile visualization.
 *
 * Allows the user to switch between Grayscale (1 band) and RGB (3 bands) mode,
 * pick bands, adjust min/max range, stretch, opacity, and gamma.  On "Apply",
 * the current params are sent back so the parent can re-render the tile via a
 * dedicated GEE endpoint.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  X, Sliders, Eye, Check, Download, ChevronDown,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RasterVisParams {
  mode: "grayscale" | "rgb";
  bands: string[];       // 1 element for grayscale, 3 for RGB [R, G, B]
  min: number;
  max: number;
  stretch: number;       // percentile cut, e.g. 0.90, 0.98, 1.0
  opacity: number;       // 0.00 – 1.00
  gamma: number;         // 0.1 – 10.0
  palette?: string[];    // optional palette for single-band
}

export const DEFAULT_VIS_PARAMS: RasterVisParams = {
  mode: "grayscale",
  bands: [""],
  min: 0,
  max: 1,
  stretch: 0.98,
  opacity: 1.0,
  gamma: 1.0,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface RasterVisPanelProps {
  /** Whether the panel is visible */
  open: boolean;
  /** Called when the user closes the panel */
  onClose: () => void;
  /** Available band names for the current index, e.g. ["B4","B3","B2"] */
  availableBands: string[];
  /** Current visParams (from parent state) */
  currentParams: RasterVisParams;
  /** Called when the user clicks "Apply" — parent should re-render the GEE tile */
  onApply: (params: RasterVisParams) => void;
  /** Called when the user clicks "Import" — parent can import current tile settings */
  onImport?: (params: RasterVisParams) => void;
  /** Whether a re-render is in progress */
  applying?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STRETCH_OPTIONS = [
  { value: 0.90, label: "90%" },
  { value: 0.95, label: "95%" },
  { value: 0.98, label: "98%" },
  { value: 0.99, label: "99%" },
  { value: 1.00, label: "100% (sem corte)" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BandSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-slate-500 uppercase w-8 shrink-0">{label}</span>
      <div className="relative flex-1">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-md pl-2 pr-6 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        >
          <option value="">—</option>
          {options.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

function RangeInput({
  label,
  value,
  onChange,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-slate-500 uppercase w-8 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
      />
    </div>
  );
}

function StyledSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-slate-500 uppercase">{label}</span>
        <span className="text-[11px] font-mono text-slate-600 font-medium">
          {formatValue ? formatValue(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-sky-500"
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RasterVisPanel({
  open,
  onClose,
  availableBands,
  currentParams,
  onApply,
  onImport,
  applying = false,
}: RasterVisPanelProps) {
  const [mode, setMode] = useState<"grayscale" | "rgb">(currentParams.mode);
  const [bands, setBands] = useState<string[]>(currentParams.bands);
  const [min, setMin] = useState(currentParams.min);
  const [max, setMax] = useState(currentParams.max);
  const [stretch, setStretch] = useState(currentParams.stretch);
  const [opacity, setOpacity] = useState(currentParams.opacity);
  const [gamma, setGamma] = useState(currentParams.gamma);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync from parent when currentParams changes
  useEffect(() => {
    setMode(currentParams.mode);
    setBands(currentParams.bands);
    setMin(currentParams.min);
    setMax(currentParams.max);
    setStretch(currentParams.stretch);
    setOpacity(currentParams.opacity);
    setGamma(currentParams.gamma);
  }, [currentParams]);

  const handleApply = useCallback(() => {
    onApply({
      mode,
      bands: mode === "grayscale" ? [bands[0] || ""] : bands.slice(0, 3),
      min: clamp(min, -1e6, 1e6),
      max: clamp(max, -1e6, 1e6),
      stretch: clamp(stretch, 0, 1),
      opacity: clamp(opacity, 0, 1),
      gamma: clamp(gamma, 0.1, 10),
    });
  }, [mode, bands, min, max, stretch, opacity, gamma, onApply]);

  const handleImport = useCallback(() => {
    onImport?.({
      mode,
      bands: mode === "grayscale" ? [bands[0] || ""] : bands.slice(0, 3),
      min: clamp(min, -1e6, 1e6),
      max: clamp(max, -1e6, 1e6),
      stretch: clamp(stretch, 0, 1),
      opacity: clamp(opacity, 0, 1),
      gamma: clamp(gamma, 0.1, 10),
    });
  }, [mode, bands, min, max, stretch, opacity, gamma, onImport]);

  if (!open) return null;

  return (
    <div className="absolute z-[700] top-4 right-4 bottom-4 pointer-events-none">
      <div
        ref={panelRef}
        className="pointer-events-auto w-72 max-h-full overflow-y-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/20 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sliders size={14} className="text-sky-600" />
            <span className="text-sm font-semibold text-slate-800">Visualização</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Mode selection */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 block">Modo</span>
            <div className="flex gap-2">
              <button
                onClick={() => { setMode("grayscale"); setBands([bands[0] || ""]); }}
                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors font-medium ${
                  mode === "grayscale"
                    ? "bg-sky-500 text-white border-sky-500"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-400"
                }`}
              >
                1 Band (Grayscale)
              </button>
              <button
                onClick={() => { setMode("rgb"); setBands([bands[0] || "", bands[1] || "", bands[2] || ""]); }}
                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors font-medium ${
                  mode === "rgb"
                    ? "bg-sky-500 text-white border-sky-500"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-400"
                }`}
              >
                3 Bands (RGB)
              </button>
            </div>
          </div>

          {/* Band selection */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 block">Bandas</span>
            <div className="space-y-1.5">
              {mode === "grayscale" ? (
                <BandSelect
                  label="Banda"
                  value={bands[0] || ""}
                  options={availableBands}
                  onChange={v => setBands([v])}
                />
              ) : (
                <>
                  <BandSelect label="R" value={bands[0] || ""} options={availableBands} onChange={v => setBands([v, bands[1], bands[2]])} />
                  <BandSelect label="G" value={bands[1] || ""} options={availableBands} onChange={v => setBands([bands[0], v, bands[2]])} />
                  <BandSelect label="B" value={bands[2] || ""} options={availableBands} onChange={v => setBands([bands[0], bands[1], v])} />
                </>
              )}
            </div>
          </div>

          {/* Range */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase mb-2 block">Range (Min–Max)</span>
            <div className="flex gap-2">
              <RangeInput label="Min" value={min} onChange={setMin} />
              <RangeInput label="Max" value={max} onChange={setMax} />
            </div>
          </div>

          {/* Stretch */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">Stretch</span>
              <span className="text-[11px] font-mono text-slate-600 font-medium">
                {STRETCH_OPTIONS.find(s => s.value === stretch)?.label ?? `${Math.round(stretch * 100)}%`}
              </span>
            </div>
            <div className="relative">
              <select
                value={stretch}
                onChange={e => setStretch(Number(e.target.value))}
                className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-md pl-2 pr-6 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {STRETCH_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Opacity */}
          <StyledSlider
            label="Opacidade"
            value={opacity}
            onChange={setOpacity}
            min={0}
            max={1}
            step={0.01}
            formatValue={v => v.toFixed(2)}
          />

          {/* Gamma */}
          <StyledSlider
            label="Gamma"
            value={gamma}
            onChange={setGamma}
            min={0.1}
            max={10}
            step={0.1}
            formatValue={v => v.toFixed(1)}
          />
        </div>

        {/* Footer — action buttons */}
        <div className="shrink-0 border-t border-slate-100 p-3 space-y-1.5">
          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full flex items-center justify-center gap-2 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {applying ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                A aplicar…
              </>
            ) : (
              <><Check size={13} /> Apply</>
            )}
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={handleImport}
              disabled={applying}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-slate-200 hover:border-sky-400 text-slate-600 hover:text-sky-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Download size={12} /> Import
            </button>
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-slate-200 hover:border-red-400 text-slate-600 hover:text-red-600 text-xs font-medium rounded-lg transition-colors"
            >
              <X size={12} /> Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
