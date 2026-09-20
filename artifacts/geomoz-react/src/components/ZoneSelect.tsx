import { useState } from "react";
import {
  Globe, MapPin, Upload, Pen, ChevronDown, X, FileText, CheckCircle2,
  Paintbrush, Trash2,
} from "lucide-react";
import { useProvinceNames, useDistrictNames } from "@/hooks/useGeoMoz";
import AreaUpload from "./AreaUpload";
import type { AreaOfInterest, AOISource } from "@/lib/aoi";
import { mozambiqueAOI, customAOI, countryAOI, GLOBAL_AOI } from "@/lib/aoi";
import type { WorldCountry } from "@/lib/world-countries";
import CountrySelectModal from "./CountrySelectModal";

interface ZoneSelectProps {
  aoi: AreaOfInterest;
  onAOIChange: (aoi: AreaOfInterest) => void;
  /** If true, enable drawing mode (pass to MapDraw) */
  onDrawingRequest?: () => void;
  /** Compact mode for navbar display (smaller, inline) */
  compact?: boolean;
}

type Panel = "province" | "upload" | null;

/**
 * ZoneSelect — unified area-of-interest selector.
 *
 * Three methods:
 *   1. Province/District (Moçambique)
 *   2. Upload GeoJSON file
 *   3. Draw on map (via MapDraw component, controlled by parent)
 */
export default function ZoneSelect({ aoi, onAOIChange, onDrawingRequest, compact }: ZoneSelectProps) {
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const { data: provinceNames } = useProvinceNames();
  const { data: districtNames } = useDistrictNames(aoi.province);

  function handleProvinceChange(value: string) {
    onAOIChange(mozambiqueAOI(value || null, null));
    setActivePanel(null);
  }

  function handleDistrictChange(value: string) {
    onAOIChange(mozambiqueAOI(aoi.province, value || null));
    setActivePanel(null);
  }

  function handleGeometryLoaded(geojson: GeoJSON.GeoJSON, label: string) {
    onAOIChange(customAOI(geojson, label, "upload"));
    setActivePanel(null);
  }

  function handleCountrySelected(country: WorldCountry) {
    onAOIChange(countryAOI(country));
    setIsCountryModalOpen(false);
    setActivePanel(null);
  }

  function handleGlobal() {
    onAOIChange(GLOBAL_AOI);
    setActivePanel(null);
  }

  const isCustom = aoi.source === "upload" || aoi.source === "draw";

  // Compact mode: just a small badge-style selector
  if (compact) {
    return (
      <div className="relative group">
        <button
          onClick={() => setActivePanel(activePanel === "province" ? null : "province")}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
            isCustom
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              : aoi.source === "country"
                ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                : aoi.source === "global"
                  ? "bg-sky-50 dark:bg-slate-800 border-sky-200 dark:border-slate-700 text-sky-600 dark:text-slate-300"
                  : "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300"
          }`}
        >
          <Globe size={12} />
          <span className="max-w-[120px] truncate">{aoi.source === "global" ? "🌍 Mundo" : aoi.label}</span>
          {isCustom && aoi.source === "upload" && <Upload size={10} className="text-emerald-400" />}
          {aoi.source !== "global" && (
            <button
              onClick={e => { e.stopPropagation(); onAOIChange(GLOBAL_AOI); }}
              className="ml-0.5 text-current opacity-50 hover:opacity-100"
            >
              <X size={10} />
            </button>
          )}
        </button>

        {/* Dropdown panel */}
        {activePanel === "province" && (
          <div className="absolute right-0 top-full mt-1.5 z-[1000] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 w-72">
            <div className="space-y-2">
              {/* Quick buttons */}
              <button
                onClick={() => { onAOIChange(GLOBAL_AOI); setActivePanel(null); }}
                className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800 hover:border-sky-200 dark:hover:border-slate-600 transition-colors"
              >
                <Globe size={13} className="text-sky-500 shrink-0" />
                <span>Mundo (sem clipping)</span>
              </button>
              <div className="relative">
                <select
                  className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  value={aoi.province ?? ""}
                  onChange={e => { handleProvinceChange(e.target.value); }}
                >
                  <option value="">🇲🇿 Todo Moçambique</option>
                  {provinceNames?.names.map(n => (
                    <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{n}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
              {aoi.province && (
                <div className="relative">
                  <select
                    className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    value={aoi.district ?? ""}
                    onChange={e => { handleDistrictChange(e.target.value); }}
                  >
                    <option value="">Toda a província</option>
                    {districtNames?.names.map(n => (
                      <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{n}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              )}
              <button
                onClick={() => {
                  setActivePanel(null);
                  setIsCountryModalOpen(true);
                }}
                className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors"
              >
                <Globe size={13} className="text-indigo-500 shrink-0" />
                <span>Selecionar País do Mundo...</span>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                <AreaUpload onGeometryLoaded={(geojson, label) => { handleGeometryLoaded(geojson, label); setActivePanel(null); }} />
              </div>
            </div>
          </div>
        )}

        <CountrySelectModal
          isOpen={isCountryModalOpen}
          onClose={() => setIsCountryModalOpen(false)}
          onSelect={handleCountrySelected}
          selectedCountryCode={aoi.countryCode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Current AOI display */}
      <div className="flex items-center gap-2 text-xs">
        <MapPin size={12} className={`shrink-0 ${isCustom ? "text-emerald-500" : "text-sky-500"}`} />
        <span className="flex-1 truncate text-slate-600 dark:text-slate-300 font-medium">{aoi.label}</span>
        {aoi.source !== "global" && (
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 cursor-pointer"
            title="Limpar seleção"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Method selector */}
      <div className="grid grid-cols-4 gap-1">
        <button
          onClick={() => setActivePanel(activePanel === "province" ? null : "province")}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors cursor-pointer ${
            activePanel === "province" || aoi.source === "mozambique"
              ? "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-medium"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
          }`}
        >
          <Globe size={11} /> Província
        </button>
        <button
          onClick={() => {
            setActivePanel(null);
            setIsCountryModalOpen(true);
          }}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors cursor-pointer ${
            aoi.source === "country"
              ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
          }`}
        >
          <Globe size={11} /> País
        </button>
        <button
          onClick={() => setActivePanel(activePanel === "upload" ? null : "upload")}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors cursor-pointer ${
            activePanel === "upload" || aoi.source === "upload"
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
          }`}
        >
          <Upload size={11} /> Upload
        </button>
        <button
          onClick={() => {
            setActivePanel(null);
            onDrawingRequest?.();
          }}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors cursor-pointer ${
            aoi.source === "draw"
              ? "bg-fuchsia-50 dark:bg-fuchsia-950/40 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-300 font-medium"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
          }`}
        >
          <Pen size={11} /> Desenhar
        </button>
      </div>

      {/* Province/District panel */}
      {activePanel === "province" && (
        <div className="space-y-2 p-3 bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-xl">
          <div className="relative">
            <select
              className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={aoi.province ?? ""}
              onChange={e => handleProvinceChange(e.target.value)}
            >
              <option value="">🇲🇿 Todo Moçambique</option>
              {provinceNames?.names.map(n => (
                <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{n}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          {aoi.province && (
            <div className="relative">
              <select
                className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={aoi.district ?? ""}
                onChange={e => handleDistrictChange(e.target.value)}
              >
                <option value="">Toda a província</option>
                {districtNames?.names.map(n => (
                  <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">{n}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>
      )}

      {/* Upload panel */}
      {activePanel === "upload" && (
        <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl">
          <AreaUpload onGeometryLoaded={handleGeometryLoaded} />
        </div>
      )}

      {/* Active country indicator */}
      {aoi.source === "country" && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60">
          <Globe size={13} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium truncate text-indigo-800 dark:text-indigo-200">{aoi.label}</p>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
              🌍 País soberano ({aoi.countryCode}) • Enquadramento universal GEE
            </p>
          </div>
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-500 hover:text-white border border-red-200 dark:border-red-900/50 hover:border-red-500 rounded-lg transition-all cursor-pointer"
            title="Remover país selecionado"
          >
            <Trash2 size={10} />
            Limpar
          </button>
        </div>
      )}

      {/* Active upload/draw indicator */}
      {isCustom && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${
          aoi.source === "draw"
            ? "bg-fuchsia-50 dark:bg-fuchsia-950/40 border-fuchsia-200 dark:border-fuchsia-900/60"
            : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60"
        }`}>
          {aoi.source === "draw" ? (
            <Paintbrush size={12} className="mt-0.5 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" />
          ) : (
            <FileText size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-medium truncate ${
              aoi.source === "draw" ? "text-fuchsia-700 dark:text-fuchsia-300" : "text-emerald-700 dark:text-emerald-300"
            }`}>{aoi.label}</p>
            <p className={`text-[10px] ${
              aoi.source === "draw" ? "text-fuchsia-500 dark:text-fuchsia-400" : "text-emerald-500 dark:text-emerald-400"
            }`}>
              {aoi.source === "draw" ? "✏️ Área desenhada no mapa" : "📄 Ficheiro carregado"}
            </p>
          </div>
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-500 hover:text-white border border-red-200 dark:border-red-900/50 hover:border-red-500 rounded-lg transition-all cursor-pointer"
            title="Remover área personalizada"
          >
            <Trash2 size={10} />
            Limpar
          </button>
        </div>
      )}

      {/* Country Select Modal */}
      <CountrySelectModal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        onSelect={handleCountrySelected}
        selectedCountryCode={aoi.countryCode}
      />
    </div>
  );
}
