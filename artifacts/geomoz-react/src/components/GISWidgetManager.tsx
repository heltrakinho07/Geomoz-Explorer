import React, { useMemo, useState } from "react";
import { gisWidgetRegistry, type GISWidgetContext } from "@/lib/gis-widget-registry";

export const GIS_WIDGET_SETTINGS_KEY = "geomoz.gis.widgets.v1";

function initialDisabled(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(GIS_WIDGET_SETTINGS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

/** Lightweight, accessible widget manager for the Workspace map. */
export default function GISWidgetManager({
  context,
  disabled,
  onDisabledChange,
}: {
  context: GISWidgetContext;
  disabled: string[];
  onDisabledChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgets = useMemo(() => gisWidgetRegistry.list({ mapId: context.mapId }), [context.mapId]);
  const toggle = (id: string) => {
    const next = disabled.includes(id) ? disabled.filter((value) => value !== id) : [...disabled, id];
    onDisabledChange(next);
    try { localStorage.setItem(GIS_WIDGET_SETTINGS_KEY, JSON.stringify(next)); }
    catch { setError("As preferências não puderam ser guardadas neste navegador."); }
  };
  return (
    <div className="absolute right-3 top-3 z-20 text-xs">
      <button type="button" aria-expanded={open} aria-controls="geomoz-widget-panel"
        onClick={() => setOpen(current => !current)}
        className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 font-semibold text-slate-800 shadow-md hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        Ferramentas GIS
      </button>
      {open && (
        <section id="geomoz-widget-panel" aria-label="Gestor de widgets GIS"
          className="mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold text-sm">Widgets do mapa</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar gestor de widgets"
              className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
          </div>
          <p className="mb-3 text-slate-500 dark:text-slate-400">Active ou desactive ferramentas sem alterar as camadas.</p>
          {widgets.map(widget => {
            const available = !widget.enabled || widget.enabled(context);
            return (
              <label key={widget.id} className="flex cursor-pointer items-start gap-3 border-t border-slate-100 py-3 dark:border-slate-800">
                <input type="checkbox" checked={!disabled.includes(widget.id)} onChange={() => toggle(widget.id)}
                  className="mt-1 accent-sky-600" aria-label={widget.title} />
                <span className="min-w-0">
                  <span className="block font-semibold">{widget.title}</span>
                  <span className="block text-slate-500 dark:text-slate-400">{widget.description}</span>
                  {!available && <span className="block text-amber-600">Disponível ao seleccionar uma camada vectorial.</span>}
                </span>
              </label>
            );
          })}
          {widgets.length === 0 && <p role="status">Nenhuma ferramenta registada.</p>}
          {error && <p role="alert" className="text-rose-600">{error}</p>}
        </section>
      )}
    </div>
  );
}
export { initialDisabled };
