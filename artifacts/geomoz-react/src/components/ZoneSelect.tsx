import { useState, useMemo, useRef, useEffect } from "react";
import {
  Globe, MapPin, Upload, Pen, ChevronDown, X, FileText, CheckCircle2,
  Paintbrush, Trash2, Search, Sparkles, Building2, Check, ArrowRight,
  RotateCcw, Compass, ExternalLink, Layers, SlidersHorizontal,
} from "lucide-react";
import { useProvinceNames, useDistrictNames } from "@/hooks/useGeoMoz";
import AreaUpload from "./AreaUpload";
import type { AreaOfInterest, AOISource } from "@/lib/aoi";
import { mozambiqueAOI, customAOI, countryAOI, GLOBAL_AOI } from "@/lib/aoi";
import type { WorldCountry } from "@/lib/world-countries";
import { WORLD_COUNTRIES, searchCountries } from "@/lib/world-countries";
import CountrySelectModal from "./CountrySelectModal";

interface ZoneSelectProps {
  aoi: AreaOfInterest;
  onAOIChange: (aoi: AreaOfInterest) => void;
  /** If true, enable drawing mode (pass to MapDraw) */
  onDrawingRequest?: () => void;
  /** Compact mode for navbar display (smaller, inline) */
  compact?: boolean;
}

type PanelTab = "country" | "subdivision" | "upload" | null;

/**
 * Pre-indexed Mozambique provinces and districts for instant global-grade search
 * without needing two-step dropdown navigation.
 */
const MOZ_PROVINCES_DISTRICTS: Record<string, string[]> = {
  "Cabo Delgado": ["Ancuabe", "Balama", "Chiúre", "Ibo", "Macomia", "Mecúfi", "Meluco", "Metuge", "Mocímboa da Praia", "Montepuez", "Mueda", "Muidumbe", "Namuno", "Palma", "Quissanga"],
  "Gaza": ["Bilene", "Chibuto", "Chicualacuala", "Chigubo", "Chókwè", "Chonguene", "Guijá", "Limpopo", "Mabalane", "Manjacaze", "Mapai", "Massangena", "Massingir", "Xai-Xai"],
  "Inhambane": ["Cidade de Inhambane", "Funhalouro", "Govuro", "Homuíne", "Inharrime", "Inhassoro", "Jangamo", "Mabote", "Massinga", "Maxixe", "Morrumbene", "Panda", "Vilankulo", "Zavala"],
  "Manica": ["Báruè", "Chimoio", "Gondola", "Guro", "Macate", "Machaze", "Macossa", "Manica", "Mossurize", "Sussundenga", "Tambara", "Vanduzi"],
  "Maputo Cidade": ["KaMpfumo", "Nlhamankulu", "KaMaxakeni", "KaMavota", "KaMubukwana", "KaTembe", "KaNyaka"],
  "Maputo Província": ["Boane", "Magude", "Manhiça", "Marracuene", "Matola", "Matutuíne", "Moamba", "Namaacha"],
  "Nampula": ["Angoche", "Eráti", "Ilha de Moçambique", "Lalaua", "Larde", "Liúpo", "Malema", "Meconta", "Mecubúri", "Memba", "Mogincual", "Mogovolas", "Moma", "Monapo", "Mossuril", "Muecate", "Murrupula", "Nacala-a-Velha", "Nacala Porto", "Nampula", "Rapale", "Ribáuè"],
  "Niassa": ["Cuamba", "Lago", "Lichinga", "Majune", "Mandimba", "Marrupa", "Maúa", "Mavago", "Mecanhelas", "Mecula", "Metarica", "Muembe", "N'gauma", "Nipepe", "Sanga"],
  "Sofala": ["Beira", "Búzi", "Caia", "Chemba", "Cheringoma", "Chibabava", "Dondo", "Gorongosa", "Machanga", "Marínguè", "Marromeu", "Muanza", "Nhamatanda"],
  "Tete": ["Angónia", "Cahora-Bassa", "Changara", "Chifunde", "Chiuta", "Dôa", "Macanga", "Magoé", "Marara", "Marávia", "Moatize", "Mutarara", "Tete", "Tsangano", "Zumbo"],
  "Zambézia": ["Alto Molócue", "Chinde", "Derre", "Gilé", "Gurué", "Ile", "Inhassunge", "Luabo", "Lugela", "Maganja da Costa", "Milange", "Mocuba", "Mocubela", "Molumbo", "Mopeia", "Morrumbala", "Mulevala", "Namacurra", "Namarroi", "Nicoadala", "Pebane", "Quelimane"],
};

const QUICK_COUNTRIES = [
  { code: "MOZ", flag: "🇲🇿", label: "Moçambique" },
  { code: "AGO", flag: "🇦🇴", label: "Angola" },
  { code: "BRA", flag: "🇧🇷", label: "Brasil" },
  { code: "PRT", flag: "🇵🇹", label: "Portugal" },
  { code: "ZAF", flag: "🇿🇦", label: "África do Sul" },
  { code: "USA", flag: "🇺🇸", label: "EUA" },
  { code: "COD", flag: "🇨🇩", label: "RD Congo" },
  { code: "TZA", flag: "🇹🇿", label: "Tanzânia" },
];

/**
 * ZoneSelect — Enterprise-grade Area of Interest (AOI) Selector.
 *
 * Designed for global-scale remote sensing platforms:
 *   1. 🌍 Mundo (Global) — Planetary coverage, no clipping
 *   2. 🌐 País — 240+ Sovereign nations with fast search & ISO codes
 *   3. 🏛️ Subdivisão — Provinces & Districts (Moçambique with 11 provinces, 154 districts & instant autocomplete)
 *   4. 📤 Upload — GeoJSON, KML, GPX with geometry parsing & validation
 *   5. ✏️ Desenhar — Interactive polygon & bounding box drawing on the map
 */
export default function ZoneSelect({
  aoi,
  onAOIChange,
  onDrawingRequest,
  compact,
}: ZoneSelectProps) {
  const [activePanel, setActivePanel] = useState<PanelTab>(null);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [subdivisionSearch, setSubdivisionSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");

  const { data: provinceNames } = useProvinceNames();
  const { data: districtNames } = useDistrictNames(aoi.province);

  // Handlers
  function handleSelectGlobal() {
    onAOIChange(GLOBAL_AOI);
    setActivePanel(null);
  }

  function handleProvinceChange(value: string) {
    onAOIChange(mozambiqueAOI(value || null, null));
    setSubdivisionSearch("");
  }

  function handleDistrictChange(value: string) {
    onAOIChange(mozambiqueAOI(aoi.province, value || null));
    setSubdivisionSearch("");
  }

  function handleCountrySelected(country: WorldCountry) {
    onAOIChange(countryAOI(country));
    setIsCountryModalOpen(false);
    setActivePanel(null);
    setCountrySearch("");
  }

  function handleGeometryLoaded(geojson: GeoJSON.GeoJSON, label: string) {
    onAOIChange(customAOI(geojson, label, "upload"));
    setActivePanel(null);
  }

  // Instant search matches for provinces & districts
  const filteredSubdivisions = useMemo(() => {
    if (!subdivisionSearch.trim()) return [];
    const q = subdivisionSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const results: { province: string; district?: string; label: string }[] = [];

    // Search provinces
    for (const [prov, dists] of Object.entries(MOZ_PROVINCES_DISTRICTS)) {
      const provNorm = prov.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (provNorm.includes(q)) {
        results.push({ province: prov, label: `${prov} (Província Inteira)` });
      }
      // Search districts
      for (const dist of dists) {
        const distNorm = dist.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (distNorm.includes(q)) {
          results.push({ province: prov, district: dist, label: `${dist}, ${prov}` });
        }
      }
    }
    return results.slice(0, 8);
  }, [subdivisionSearch]);

  // Instant inline country search
  const inlineFilteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return [];
    return searchCountries(countrySearch).slice(0, 6);
  }, [countrySearch]);

  const isCustom = aoi.source === "upload" || aoi.source === "draw";

  // Compute active badge, title and subtitle
  const aoiMeta = useMemo(() => {
    switch (aoi.source) {
      case "global":
        return {
          scope: "GLOBAL",
          badgeColor: "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
          title: "Mundo (Global)",
          subtitle: "Sem restrição geográfica · Cobertura Planetária GEE",
          icon: <Globe size={14} className="text-sky-500" />,
        };
      case "country":
        return {
          scope: "PAÍS SOBERANO",
          badgeColor: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
          title: aoi.label,
          subtitle: `País Soberano (${aoi.countryCode ?? "Global"}) · Enquadramento Universal GEE`,
          icon: <Globe size={14} className="text-indigo-500" />,
        };
      case "mozambique":
        if (aoi.district) {
          return {
            scope: "DISTRITO",
            badgeColor: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
            title: aoi.district,
            subtitle: `${aoi.province} · Moçambique 🇲🇿 · Recorte Zonal GEE`,
            icon: <Building2 size={14} className="text-amber-500" />,
          };
        }
        if (aoi.province) {
          return {
            scope: "PROVÍNCIA",
            badgeColor: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
            title: aoi.province,
            subtitle: "Província · Moçambique 🇲🇿 · Recorte Zonal GEE",
            icon: <Layers size={14} className="text-blue-500" />,
          };
        }
        return {
          scope: "PAÍS (MOZ)",
          badgeColor: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
          title: "Moçambique (Nacional)",
          subtitle: "Todas as 11 Províncias · Recorte Zonal GEE",
          icon: <Globe size={14} className="text-emerald-500" />,
        };
      case "upload":
        return {
          scope: "VETOR CARREGADO",
          badgeColor: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
          title: aoi.label,
          subtitle: "Geometria Importada (GeoJSON/KML) · Recorte Zonal GEE",
          icon: <FileText size={14} className="text-emerald-500" />,
        };
      case "draw":
        return {
          scope: "ÁREA DESENHADA",
          badgeColor: "bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800",
          title: aoi.label,
          subtitle: "Polígono Manual Delimitado · Recorte Zonal GEE",
          icon: <Paintbrush size={14} className="text-fuchsia-500" />,
        };
      default:
        return {
          scope: "ÁREA",
          badgeColor: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700",
          title: aoi.label,
          subtitle: "Área de Interesse Personalizada",
          icon: <MapPin size={14} className="text-sky-500" />,
        };
    }
  }, [aoi]);

  // ── Compact Mode (for Navbars / Mini toolbars) ──────────────────────────────
  if (compact) {
    return (
      <div className="relative group">
        <button
          onClick={() => setActivePanel(activePanel ? null : "subdivision")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all shadow-2xs ${
            isCustom
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              : aoi.source === "country"
              ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
              : aoi.source === "global"
              ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              : "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300"
          }`}
        >
          {aoiMeta.icon}
          <span className="max-w-[130px] truncate">{aoiMeta.title}</span>
          <ChevronDown size={12} className="opacity-60" />
        </button>

        {activePanel && (
          <div className="absolute right-0 top-full mt-2 z-[1000] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3 w-80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Área de Estudo Global
              </span>
              <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleSelectGlobal}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-slate-800 hover:border-sky-300 text-slate-700 dark:text-slate-200 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-sky-500" />
                  <span>🌍 Mundo (Sem Clipping)</span>
                </div>
                {aoi.source === "global" && <Check size={14} className="text-sky-500" />}
              </button>

              <button
                onClick={() => {
                  setActivePanel(null);
                  setIsCountryModalOpen(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-indigo-500" />
                  <span>Selecionar País do Mundo...</span>
                </div>
                <ArrowRight size={13} />
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

  // ── Full Enterprise Mode ────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* ── Active AOI Executive Card ── */}
      <div className="bg-slate-50 dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs transition-all">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${aoiMeta.badgeColor}`}>
              {aoiMeta.scope}
            </span>
          </div>

          {/* Quick reset to global */}
          {aoi.source !== "global" && (
            <button
              onClick={handleSelectGlobal}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/50 px-2 py-0.5 rounded-lg transition-all cursor-pointer shadow-2xs"
              title="Redefinir para visão global sem restrição"
            >
              <RotateCcw size={10} />
              <span>Resetar</span>
            </button>
          )}
        </div>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-2xs">
            {aoiMeta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {aoiMeta.title}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {aoiMeta.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* ── Hierarchical 5-Option Segmented Tab Strip ── */}
      <div className="grid grid-cols-5 gap-1 bg-slate-100/90 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700">
        <button
          type="button"
          onClick={handleSelectGlobal}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[9px] font-semibold transition-all cursor-pointer ${
            aoi.source === "global" && activePanel === null
              ? "bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
          title="Mundo (Global / Sem Clipping)"
        >
          <Globe size={13} className="mb-0.5" />
          <span>Mundo</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePanel(activePanel === "country" ? null : "country")}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[9px] font-semibold transition-all cursor-pointer ${
            activePanel === "country" || (aoi.source === "country" && activePanel === null)
              ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
          title="País Soberano (240+ Nações)"
        >
          <Globe size={13} className="mb-0.5" />
          <span>País</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePanel(activePanel === "subdivision" ? null : "subdivision")}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[9px] font-semibold transition-all cursor-pointer ${
            activePanel === "subdivision" || (aoi.source === "mozambique" && activePanel === null)
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
          title="Subdivisão Territorial (Províncias e Distritos)"
        >
          <Building2 size={13} className="mb-0.5" />
          <span>Província</span>
        </button>

        <button
          type="button"
          onClick={() => setActivePanel(activePanel === "upload" ? null : "upload")}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[9px] font-semibold transition-all cursor-pointer ${
            activePanel === "upload" || (aoi.source === "upload" && activePanel === null)
              ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
          title="Carregar ficheiro GeoJSON, KML ou GPX"
        >
          <Upload size={13} className="mb-0.5" />
          <span>Upload</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActivePanel(null);
            onDrawingRequest?.();
          }}
          className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[9px] font-semibold transition-all cursor-pointer ${
            aoi.source === "draw"
              ? "bg-white dark:bg-slate-900 text-fuchsia-600 dark:text-fuchsia-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
          title="Desenhar polígono no mapa"
        >
          <Pen size={13} className="mb-0.5" />
          <span>Desenhar</span>
        </button>
      </div>

      {/* ── Subpanel: País (Global Scale) ── */}
      {activePanel === "country" && (
        <div className="p-3.5 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={12} className="text-indigo-600" />
              <span>Países Soberanos (Global)</span>
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={12} />
            </button>
          </div>

          {/* Quick-Pick Countries */}
          <div>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Atalhos Rápidos:
            </span>
            <div className="flex flex-wrap gap-1">
              {QUICK_COUNTRIES.map((c) => {
                const country = WORLD_COUNTRIES.find((wc) => wc.code === c.code);
                if (!country) return null;
                const isSelected = aoi.countryCode === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountrySelected(country)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:border-indigo-300"
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline Fast Search */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Pesquisar 240+ países (ex: Brasil, Portugal, Japão)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {countrySearch && (
                <button
                  onClick={() => setCountrySearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {inlineFilteredCountries.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
                {inlineFilteredCountries.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountrySelected(c)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{c.flag}</span>
                      <span className="font-semibold truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-400">({c.code})</span>
                    </div>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium shrink-0">
                      {c.continent}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Open Full Country Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsCountryModalOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer"
          >
            <Sparkles size={12} />
            <span>Explorar Todos os 240+ Países do Mundo</span>
          </button>
        </div>
      )}

      {/* ── Subpanel: Subdivisão (Províncias & Distritos) ── */}
      {activePanel === "subdivision" && (
        <div className="p-3.5 bg-sky-50/40 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-2xl space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-sky-900 dark:text-sky-200 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={12} className="text-sky-600" />
              <span>Subdivisões de Moçambique</span>
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={12} />
            </button>
          </div>

          {/* Instant Search for any Province or District */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={subdivisionSearch}
                onChange={(e) => setSubdivisionSearch(e.target.value)}
                placeholder="Pesquisar província ou distrito (ex: Manhiça, Matola, Pemba)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              {subdivisionSearch && (
                <button
                  onClick={() => setSubdivisionSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {filteredSubdivisions.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
                {filteredSubdivisions.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onAOIChange(mozambiqueAOI(res.province, res.district ?? null));
                      setSubdivisionSearch("");
                      setActivePanel(null);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin size={11} className="text-sky-500 shrink-0" />
                      <span className="font-semibold truncate">{res.label}</span>
                    </div>
                    <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 shrink-0">
                      {res.district ? "Distrito" : "Província"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cascading Selects: Província & Distrito */}
          <div className="space-y-2">
            <div className="relative">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Província (11 Regiões)
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-8 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400 font-medium"
                  value={aoi.province ?? ""}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                >
                  <option value="">🇲🇿 Todo Moçambique (Nacional)</option>
                  {(provinceNames?.names || Object.keys(MOZ_PROVINCES_DISTRICTS)).map((n) => (
                    <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                      {n}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {aoi.province && (
              <div className="relative">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Distrito de {aoi.province}
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-8 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400 font-medium"
                    value={aoi.district ?? ""}
                    onChange={(e) => handleDistrictChange(e.target.value)}
                  >
                    <option value="">Toda a Província de {aoi.province}</option>
                    {(districtNames?.names || MOZ_PROVINCES_DISTRICTS[aoi.province] || []).map((n) => (
                      <option key={n} value={n} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                        {n}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Quick Whole Country Shortcut */}
          <button
            type="button"
            onClick={() => {
              onAOIChange(mozambiqueAOI(null, null));
              setActivePanel(null);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors"
          >
            <span>🇲🇿 Selecionar Todo Moçambique</span>
          </button>
        </div>
      )}

      {/* ── Subpanel: Upload ── */}
      {activePanel === "upload" && (
        <div className="p-3.5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-900 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
              <Upload size={12} className="text-emerald-600" />
              <span>Importação Vetorial</span>
            </span>
            <button
              onClick={() => setActivePanel(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={12} />
            </button>
          </div>
          <AreaUpload onGeometryLoaded={handleGeometryLoaded} />
        </div>
      )}

      {/* Full Country Select Modal */}
      <CountrySelectModal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        onSelect={handleCountrySelected}
        selectedCountryCode={aoi.countryCode}
      />
    </div>
  );
}
