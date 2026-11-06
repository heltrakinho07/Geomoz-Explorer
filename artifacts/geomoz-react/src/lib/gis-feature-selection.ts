import type { Feature, FeatureCollection, Geometry } from "geojson";

export interface SelectedMapFeature {
  key: string;
  layerId: string;
  layerName: string;
  feature: Feature;
}
export type NumericFieldSummary = {
  field: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  sum: number;
};

/** Deduplication also handles polygon fill/outline hits from the same feature. */
export function selectionKey(layerId: string, feature: Feature): string {
  const identity = feature.id === undefined || feature.id === null
    ? JSON.stringify([feature.geometry, feature.properties ?? {}])
    : String(feature.id);
  return JSON.stringify([layerId, identity]);
}

/** Shift-click toggles selection, ordinary clicks replace it. Capped to protect the browser. */
export function updateFeatureSelection(
  selected: SelectedMapFeature[], candidate: SelectedMapFeature,
  additive: boolean, limit = 500,
): SelectedMapFeature[] {
  if (!additive) return [candidate];
  const existing = selected.findIndex(item => item.key === candidate.key);
  if (existing >= 0) return selected.filter(item => item.key !== candidate.key);
  return selected.length >= limit ? selected : [...selected, candidate];
}

/** Strictly numeric values; no coercion from strings to avoid misleading statistics. */
export function numericFieldSummaries(selected: SelectedMapFeature[]): NumericFieldSummary[] {
  const values = new Map<string, number[]>();
  for (const item of selected) {
    for (const [key, value] of Object.entries(item.feature.properties ?? {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const list = values.get(key) ?? [];
      list.push(value);
      values.set(key, list);
    }
  }
  return [...values].map(([field, numbers]) => {
    const sum = numbers.reduce((total, value) => total + value, 0);
    return { field, count: numbers.length, min: Math.min(...numbers), max: Math.max(...numbers),
      mean: sum / numbers.length, sum };
  }).sort((a,b) => a.field.localeCompare(b.field));
}
export function selectedFeatureCollection(selected: SelectedMapFeature[]): FeatureCollection<Geometry> {
  return {type:"FeatureCollection", features:selected.map(item => ({
    ...item.feature,
    properties: { ...(item.feature.properties ?? {}), __geomoz_layer_id: item.layerId },
  }))};
}

/** Selection report is independent of the map renderer and safe for arbitrary attribute text. */
export function createSelectionInspector(
  selected: SelectedMapFeature[],
  onClear: () => void,
): HTMLElement {
  const root = document.createElement("section");
  root.setAttribute("aria-label", "Selecção de feições");
  root.style.cssText = "max-width:360px;min-width:250px;font:12px system-ui,sans-serif;color:#0f172a";
  const heading = document.createElement("h3");
  heading.textContent = `${selected.length} feição(ões) seleccionada(s)`;
  heading.style.cssText = "font-size:14px;font-weight:700;margin:0 0 8px";
  root.append(heading);
  const hint = document.createElement("p");
  hint.textContent = "Shift + clique: adicionar ou remover feições.";
  root.append(hint);
  const list = document.createElement("ol");
  list.style.cssText = "max-height:125px;overflow:auto;padding-left:20px";
  for (const [index, item] of selected.entries()) {
    const row = document.createElement("li");
    const description = Object.entries(item.feature.properties ?? {}).slice(0,2)
      .map(([key, value]) => `${key}: ${String(value ?? "—")}`).join(" · ");
    row.textContent = `${index + 1}. ${item.layerName}${description ? " — " + description : ""}`;
    list.append(row);
  }
  root.append(list);
  const summaries = numericFieldSummaries(selected);
  if (summaries.length) {
    const title = document.createElement("h4");
    title.textContent = "Estatísticas dos campos numéricos";
    title.style.cssText = "font-weight:700;margin-top:8px";
    root.append(title);
    const container = document.createElement("div");
    container.style.cssText = "max-height:175px;overflow:auto";
    for (const stat of summaries) {
      const row = document.createElement("p");
      row.style.cssText = "padding:4px 0;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere";
      row.textContent = `${stat.field} (n=${stat.count}) · mín ${stat.min.toLocaleString("pt-PT")} · máx ${stat.max.toLocaleString("pt-PT")} · média ${stat.mean.toLocaleString("pt-PT", {maximumFractionDigits:4})} · soma ${stat.sum.toLocaleString("pt-PT", {maximumFractionDigits:4})}`;
      container.append(row);
    }
    root.append(container);
  }
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:10px";
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Exportar selecção (GeoJSON)";
  exportButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(selectedFeatureCollection(selected), null, 2)], {type:"application/geo+json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "geomoz-seleccao.geojson";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Limpar selecção";
  clearButton.addEventListener("click", onClear);
  for (const button of [exportButton, clearButton]) {
    button.style.cssText = "padding:7px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer";
    actions.append(button);
  }
  root.append(actions);
  return root;
}
