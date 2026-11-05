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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedContinent("Todos");
      return;
    }
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  // Keep keyboard focus inside the country picker, and return focus on close.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
    <div data-testid="geomoz-country-backdrop" className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="geomoz-country-title"
        aria-describedby="geomoz-country-description"
        data-testid="geomoz-country-select-dialog"
        className="gm-soft-dialog relative flex max-h-[92dvh] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-[26px] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gm-soft-header flex shrink-0 items-start justify-between gap-3 px-4 py-4 sm:items-center sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 text-white shadow-md">
              <Globe size={18} />
            </div>
            <div>
              <h3 id="geomoz-country-title" className="flex flex-wrap items-center gap-2 text-base font-black tracking-tight text-slate-950 dark:text-white sm:text-lg">
                Selecionar País do Mundo
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold">
                  Global AOI
                </span>
              </h3>
              <p id="geomoz-country-description" className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Selecione qualquer país para visualização 3D e processamento universal por satélite
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar selecção de país"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-sky-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Quick Filters */}
        <div className="gm-soft-body shrink-0 space-y-3 border-b border-slate-200/70 p-4 dark:border-slate-700 sm:px-6">
          {/* Search Input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Pesquisar países"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por nome em português, inglês ou código ISO (ex: Portugal, Brazil, JPN, ISL)..."
              className="gm-soft-input w-full py-2.5 pl-10 pr-10 text-xs sm:text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Limpar pesquisa de países"
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
                aria-pressed={selectedContinent === continent}
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
        <div className="gm-soft-body min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
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
                    className={`gm-soft-tile group flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-all ${
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
        <div className="gm-soft-header flex shrink-0 flex-col gap-3 border-t border-slate-200/70 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-500 shrink-0" />
            Dica: Ao selecionar um país, o terreno 3D e o modelo GEE focam automaticamente nas suas coordenadas.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="gm-soft-surface min-h-10 shrink-0 rounded-xl px-4 py-2 font-semibold text-slate-700 transition-colors hover:text-sky-700 dark:text-slate-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
