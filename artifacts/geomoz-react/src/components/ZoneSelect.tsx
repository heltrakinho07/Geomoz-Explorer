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
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : aoi.source === "country"
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : aoi.source === "global"
                  ? "bg-sky-50 border-sky-200 text-sky-600"
                  : "bg-sky-50 border-sky-200 text-sky-700"
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
          <div className="absolute right-0 top-full mt-1.5 z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-72">
            <div className="space-y-2">
              {/* Quick buttons */}
              <button
                onClick={() => { onAOIChange(GLOBAL_AOI); setActivePanel(null); }}
                className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-sky-50 hover:border-sky-200 transition-colors"
              >
                🌍 Mundo (sem clipping)
              </button>
              <div className="relative">
                <select
                  className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  value={aoi.province ?? ""}
                  onChange={e => { handleProvinceChange(e.target.value); }}
                >
                  <option value="">🇲🇿 Moçambique</option>
                  {provinceNames?.names.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
              {aoi.province && (
                <div className="relative">
                  <select
                    className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    value={aoi.district ?? ""}
                    onChange={e => { handleDistrictChange(e.target.value); }}
                  >
                    <option value="">Toda a província</option>
                    {districtNames?.names.map(n => (
                      <option key={n} value={n}>{n}</option>
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
                className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
              >
                🌍 Selecionar País do Mundo...
              </button>
              <div className="border-t border-slate-100 pt-2">
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
        <span className="flex-1 truncate text-slate-600 font-medium">{aoi.label}</span>
        {aoi.source !== "global" && (
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="text-slate-400 hover:text-red-500 shrink-0"
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
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            activePanel === "province" || aoi.source === "mozambique"
              ? "bg-sky-50 border-sky-200 text-sky-700 font-medium"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Globe size={11} /> Província
        </button>
        <button
          onClick={() => {
            setActivePanel(null);
            setIsCountryModalOpen(true);
          }}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            aoi.source === "country"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-medium"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Globe size={11} /> País
        </button>
        <button
          onClick={() => setActivePanel(activePanel === "upload" ? null : "upload")}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            activePanel === "upload" || aoi.source === "upload"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-medium"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Upload size={11} /> Upload
        </button>
        <button
          onClick={() => {
            setActivePanel(null);
            onDrawingRequest?.();
          }}
          className={`flex items-center justify-center gap-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
            aoi.source === "draw"
              ? "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 font-medium"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Pen size={11} /> Desenhar
        </button>
      </div>

      {/* Province/District panel */}
      {activePanel === "province" && (
        <div className="space-y-2 p-3 bg-sky-50/50 border border-sky-100 rounded-xl">
          <div className="relative">
            <select
              className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={aoi.province ?? ""}
              onChange={e => handleProvinceChange(e.target.value)}
            >
              <option value="">🇲🇿 Todo Moçambique</option>
              {provinceNames?.names.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          {aoi.province && (
            <div className="relative">
              <select
                className="w-full appearance-none text-xs bg-white border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={aoi.district ?? ""}
                onChange={e => handleDistrictChange(e.target.value)}
              >
                <option value="">Toda a província</option>
                {districtNames?.names.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>
      )}

      {/* Upload panel */}
      {activePanel === "upload" && (
        <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
          <AreaUpload onGeometryLoaded={handleGeometryLoaded} />
        </div>
      )}

      {/* Active country indicator */}
      {aoi.source === "country" && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border bg-indigo-50/70 border-indigo-200">
          <Globe size={13} className="mt-0.5 shrink-0 text-indigo-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium truncate text-indigo-800">{aoi.label}</p>
            <p className="text-[10px] text-indigo-600">
              🌍 País soberano ({aoi.countryCode}) • Enquadramento universal GEE
            </p>
          </div>
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 bg-red-50 hover:bg-red-500 hover:text-white border border-red-200 hover:border-red-500 rounded-lg transition-all"
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
            ? "bg-fuchsia-50 border-fuchsia-200"
            : "bg-emerald-50 border-emerald-200"
        }`}>
          {aoi.source === "draw" ? (
            <Paintbrush size={12} className="mt-0.5 shrink-0 text-fuchsia-600" />
          ) : (
            <FileText size={12} className="mt-0.5 shrink-0 text-emerald-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-medium truncate ${
              aoi.source === "draw" ? "text-fuchsia-700" : "text-emerald-700"
            }`}>{aoi.label}</p>
            <p className={`text-[10px] ${
              aoi.source === "draw" ? "text-fuchsia-500" : "text-emerald-500"
            }`}>
              {aoi.source === "draw" ? "✏️ Área desenhada no mapa" : "📄 Ficheiro carregado"}
            </p>
          </div>
          <button
            onClick={() => onAOIChange(GLOBAL_AOI)}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 bg-red-50 hover:bg-red-500 hover:text-white border border-red-200 hover:border-red-500 rounded-lg transition-all"
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
