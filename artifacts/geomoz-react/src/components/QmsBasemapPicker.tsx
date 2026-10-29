import React, { useEffect, useRef, useState } from "react";
import { Check, Globe2, Loader2, Search, X } from "lucide-react";
import {
  getQmsTileSource, searchQmsBasemaps,
  type QmsServiceSummary, type QmsTileSource,
} from "@/lib/qms-catalog";

interface Props {
  selected: QmsTileSource | null;
  onChange: (source: QmsTileSource | null) => void;
}

/** Add public QMS basemaps without replacing the GIS engine or uploading user data. */
export default function QmsBasemapPicker({ selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QmsServiceSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSearching(false);
      setResults([]);
      setError("");
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setResults([]);
    setError("");
    const timer = window.setTimeout(() => {
      void searchQmsBasemaps(term, controller.signal)
        .then((items) => { if (!controller.signal.aborted) setResults(items); })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setResults([]);
            setError(cause instanceof Error ? cause.message : "Pesquisa QMS indisponível.");
          }
        })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const activate = async (item: QmsServiceSummary) => {
    const currentRequest = ++requestId.current;
    setActivatingId(item.id);
    setError("");
    try {
      const source = await getQmsTileSource(item.id);
      if (currentRequest === requestId.current) onChange(source);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar o mapa.");
      }
    } finally {
      if (currentRequest === requestId.current) setActivatingId(null);
    }
  };

  return (
    <section aria-label="Catálogo de mapas-base NextGIS QMS" className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-extrabold">
          <Globe2 size={14} className="text-sky-500" /> Mapas-base
        </h3>
        <span className="text-[10px] text-slate-500">NextGIS QMS</span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-800">
        <span className="min-w-0 truncate" title={selected?.name ?? "OpenStreetMap"}>
          {selected?.name ?? "OpenStreetMap · padrão"}
        </span>
        {selected ? (
          <button type="button" onClick={() => { ++requestId.current; setActivatingId(null); onChange(null); }}
            aria-label="Voltar ao mapa-base OpenStreetMap" title="Voltar ao OpenStreetMap"
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={14} />
          </button>
        ) : <Check size={14} className="shrink-0 text-emerald-600" />}
      </div>
      <label className="relative block">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Pesquisar serviços cartográficos NextGIS QMS"
          placeholder="Pesquisar mapa-base (ex.: OSM)..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900" />
      </label>
      {searching && <p role="status" className="flex items-center gap-1 text-[11px] text-slate-500">
        <Loader2 size={12} className="animate-spin" /> A pesquisar serviços…
      </p>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {query.trim().length > 1 && !searching && !error && results.length === 0 &&
        <p className="text-[11px] text-slate-500">Nenhum serviço TMS/XYZ compatível encontrado.</p>}
      {results.length > 0 && (
        <div className="max-h-44 space-y-1 overflow-y-auto" aria-label="Resultados NextGIS QMS">
          {results.map((item) => (
            <button key={item.id} type="button" onClick={() => void activate(item)}
              disabled={activatingId !== null}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-2 py-2 text-left text-[11px] hover:bg-sky-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{item.name}</span>
                {item.description && <span className="block truncate text-[10px] text-slate-500">{item.description}</span>}
              </span>
              {activatingId === item.id ? <Loader2 size={13} className="shrink-0 animate-spin"/> :
                selected?.id === item.id ? <Check size={13} className="shrink-0 text-emerald-600"/> :
                <Globe2 size={13} className="shrink-0 text-sky-600"/>}
            </button>
          ))}
        </div>
      )}
      {selected?.termsUrl && <a href={selected.termsUrl} target="_blank" rel="noopener noreferrer"
        className="inline-block text-[10px] text-sky-700 underline dark:text-sky-400">
        Consultar termos de utilização
      </a>}
      <p className="text-[10px] leading-relaxed text-slate-500">
        Serviços externos do catálogo QMS. A disponibilidade e os direitos de utilização
        pertencem a cada fornecedor; confirme as condições antes de publicar ou exportar.
      </p>
    </section>
  );
}
