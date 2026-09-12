import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, Globe, X, Check, MapPin, Sparkles } from "lucide-react";
import {
  WORLD_COUNTRIES,
  searchCountries,
  type WorldCountry,
} from "@/lib/world-countries";

interface CountrySelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (country: WorldCountry) => void;
  selectedCountryCode?: string | null;
}

const CONTINENTS = [
  "Todos",
  "África",
  "América do Sul",
  "América do Norte",
  "Europa",
  "Ásia",
  "Oceania",
] as const;

const QUICK_PICKS = [
  { code: "MOZ", label: "🇲🇿 Moçambique" },
  { code: "AGO", label: "🇦🇴 Angola" },
  { code: "BRA", label: "🇧🇷 Brasil" },
  { code: "PRT", label: "🇵🇹 Portugal" },
  { code: "ZAF", label: "🇿🇦 África do Sul" },
  { code: "USA", label: "🇺🇸 EUA" },
  { code: "ISL", label: "🇮🇸 Islândia" },
  { code: "JPN", label: "🇯🇵 Japão" },
  { code: "AUS", label: "🇦🇺 Austrália" },
];

export default function CountrySelectModal({
  isOpen,
  onClose,
  onSelect,
  selectedCountryCode,
}: CountrySelectModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContinent, setSelectedContinent] = useState<string>("Todos");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery("");
      setSelectedContinent("Todos");
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredCountries = useMemo(() => {
    return searchCountries(searchQuery, selectedContinent);
  }, [searchQuery, selectedContinent]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Globe size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Selecionar País do Mundo
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold">
                  Global AOI
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione qualquer país para visualização 3D e processamento universal por satélite
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Quick Filters */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
          {/* Search Input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por nome em português, inglês ou código ISO (ex: Portugal, Brazil, JPN, ISL)..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Picks */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-500" /> Destaques:
            </span>
            {QUICK_PICKS.map((pick) => {
              const country = WORLD_COUNTRIES.find((c) => c.code === pick.code);
              if (!country) return null;
              const isSelected = selectedCountryCode === country.code;
              return (
                <button
                  key={pick.code}
                  type="button"
                  onClick={() => {
                    onSelect(country);
                    onClose();
                  }}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    isSelected
                      ? "bg-sky-500 text-white border-sky-600 shadow-sm"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-700 hover:border-sky-200"
                  }`}
                >
                  {pick.label}
                </button>
              );
            })}
          </div>

          {/* Continent Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {CONTINENTS.map((continent) => (
              <button
                key={continent}
                type="button"
                onClick={() => setSelectedContinent(continent)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  selectedContinent === continent
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {continent}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400 shrink-0">
              {filteredCountries.length} {filteredCountries.length === 1 ? "país" : "países"}
            </span>
          </div>
        </div>

        {/* Countries Grid / List */}
        <div className="flex-1 overflow-y-auto p-3 max-h-[50vh] divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredCountries.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Globe size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Nenhum país encontrado para "{searchQuery}"
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Tente pesquisar pelo nome em inglês ou pelo continente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredCountries.map((c) => {
                const isSelected = selectedCountryCode === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      onClose();
                    }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl text-left border transition-all group ${
                      isSelected
                        ? "bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 shadow-sm"
                        : "bg-white dark:bg-slate-900/60 border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                    }`}
                  >
                    <span className="text-2xl shrink-0 leading-none">{c.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                          {c.name}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded shrink-0">
                          {c.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                        <span className="truncate">{c.nameEn}</span>
                        <span>•</span>
                        <span className="shrink-0 text-slate-500 dark:text-slate-400">
                          {c.continent}
                        </span>
                      </div>
                    </div>
                    {isSelected ? (
                      <div className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                        <Check size={14} />
                      </div>
                    ) : (
                      <MapPin
                        size={14}
                        className="text-slate-300 dark:text-slate-600 group-hover:text-sky-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            💡 Dica: Ao selecionar um país, o terreno 3D e o modelo GEE focam automaticamente nas suas coordenadas.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
