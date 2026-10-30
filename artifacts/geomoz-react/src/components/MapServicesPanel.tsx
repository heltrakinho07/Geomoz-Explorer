import React, { useState } from "react";
import { ChevronDown, Globe2, Layers3, Plus, RotateCcw } from "lucide-react";
import QmsBasemapPicker from "@/components/QmsBasemapPicker";
import {
  createManualMapService, type CustomMapKind, type MapServiceSource,
} from "@/lib/map-services";

interface Props {
  selected: MapServiceSource | null;
  onChange: (source: MapServiceSource | null) => void;
}

/** One map-service card: catalogue plus manual public XYZ/TMS/WMS endpoints. */
export default function MapServicesPanel({ selected, onChange }: Props) {
  const [kind, setKind] = useState<CustomMapKind>("xyz");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [layers, setLayers] = useState("");
  const [attribution, setAttribution] = useState("");
  const [error, setError] = useState("");

  const addManualService = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const source = createManualMapService({ kind, name, url, layers, attribution });
      setError("");
      onChange(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o serviço.");
    }
  };

  return (
    <section aria-label="Serviços de mapas GeoMoz" className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-extrabold">
          <Layers3 size={14} className="text-sky-500" /> Serviços de mapas
        </h3>
        <span className="text-[10px] text-slate-500">GeoMoz GIS</span>
      </header>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-800">
        <span className="min-w-0 truncate" title={selected?.name ?? "OpenStreetMap"}>
          {selected?.name ?? "OpenStreetMap · padrão"}
        </span>
        {selected && <button type="button" onClick={() => onChange(null)}
          className="inline-flex shrink-0 items-center gap-1 text-sky-700 dark:text-sky-400"
          aria-label="Restaurar mapa-base OpenStreetMap">
          <RotateCcw size={12} /> Restaurar
        </button>}
      </div>

      <details className="rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center justify-between p-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5"><Globe2 size={13} /> Catálogo de mapas-base</span>
          <ChevronDown size={13} />
        </summary>
        <QmsBasemapPicker
          selected={selected && !("kind" in selected) ? selected : null}
          onChange={(source) => { setError(""); onChange(source); }}
        />
      </details>

      <details className="rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="flex cursor-pointer list-none items-center justify-between p-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5"><Plus size={13} /> Adicionar serviço XYZ, TMS ou WMS</span>
          <ChevronDown size={13} />
        </summary>
        <form onSubmit={addManualService} className="space-y-2 border-t border-slate-200 p-2 text-xs dark:border-slate-700">
          <label className="block space-y-1">
            <span>Tipo de serviço</span>
            <select aria-label="Tipo de serviço cartográfico" value={kind}
              onChange={(e) => setKind(e.target.value as CustomMapKind)}
              className="w-full rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
              <option value="xyz">XYZ</option>
              <option value="tms">TMS (eixo Y invertido)</option>
              <option value="wms">WMS (GetMap · EPSG:3857)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span>Nome da camada</span>
            <input aria-label="Nome do serviço cartográfico" value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={120} placeholder="Ex.: Ortomosaico regional"
              className="w-full rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="block space-y-1">
            <span>Endereço HTTPS público</span>
            <input aria-label="URL do serviço cartográfico" value={url} onChange={(e) => setUrl(e.target.value)}
              required type="text" placeholder={kind === "wms" ? "https://servidor.exemplo/wms" : "https://servidor.exemplo/{z}/{x}/{y}.png"}
              className="w-full rounded border border-slate-200 bg-white p-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          {kind === "wms" && <label className="block space-y-1">
            <span>Camadas WMS (parâmetro LAYERS)</span>
            <input aria-label="Camadas WMS" value={layers} onChange={(e) => setLayers(e.target.value)}
              required placeholder="workspace:geologia"
              className="w-full rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900" />
          </label>}
          <label className="block space-y-1">
            <span>Atribuição do fornecedor</span>
            <input aria-label="Atribuição do serviço cartográfico" value={attribution} onChange={(e) => setAttribution(e.target.value)}
              maxLength={200} placeholder="Nome do fornecedor / licença"
              className="w-full rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900" />
          </label>
          {error && <p role="alert" className="rounded bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
          <p className="text-[10px] leading-relaxed text-slate-500">
            O serviço deve permitir pedidos do navegador e cobrir a área do mapa em EPSG:3857.
            Não introduza chaves de API. A validação local não garante disponibilidade nem licença de uso.
          </p>
          <button type="submit" className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700">
            <Plus size={13} /> Adicionar camada ao mapa
          </button>
        </form>
      </details>
      <p className="text-[10px] text-slate-500">
        Os serviços externos são propriedade dos respectivos fornecedores.
        Confirme a licença e as condições de exportação.
      </p>
    </section>
  );
}
