/** Safe, accessible attribute inspector. Never interprets feature values as HTML. */
export function createFeatureInspector(
  layerName: string,
  properties: Record<string, unknown>,
  coordinates?: { lng: number; lat: number },
): HTMLElement {
  const root = document.createElement("section");
  root.setAttribute("aria-label", "Propriedades da feição");
  root.style.cssText = "min-width:240px;max-width:360px;color:#0f172a;font:12px system-ui,sans-serif";
  const heading = document.createElement("h3");
  heading.textContent = layerName;
  heading.style.cssText = "font-weight:700;font-size:14px;margin:0 0 8px";
  root.append(heading);
  const entries = Object.entries(properties);
  const summary = document.createElement("p");
  summary.textContent = `${entries.length} atributos`;
  summary.style.cssText = "margin:0 0 6px;color:#475569";
  root.append(summary);
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Pesquisar atributos…";
  input.setAttribute("aria-label", "Pesquisar atributos");
  input.style.cssText = "box-sizing:border-box;width:100%;padding:7px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:7px";
  root.append(input);
  const table = document.createElement("dl");
  table.style.cssText = "max-height:260px;overflow:auto;margin:0;border-top:1px solid #e2e8f0";
  root.append(table);
  const render = () => {
    table.replaceChildren();
    const needle = input.value.trim().toLocaleLowerCase();
    const matching = entries.filter(([key,value]) => (`${key} ${String(value ?? "")}`).toLocaleLowerCase().includes(needle));
    for (const [key, value] of matching) {
      const row = document.createElement("div");
      row.style.cssText = "padding:5px 0;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere";
      const label = document.createElement("dt");
      label.textContent = key;
      label.style.cssText = "font-weight:600;color:#334155";
      const detail = document.createElement("dd");
      detail.textContent = value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
      detail.style.margin = "2px 0 0";
      row.append(label,detail);
      table.append(row);
    }
    if (!matching.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhum atributo encontrado.";
      table.append(empty);
    }
  };
  input.addEventListener("input", render);
  render();
  if (coordinates && Number.isFinite(coordinates.lng) && Number.isFinite(coordinates.lat)) {
    const coord = document.createElement("p");
    coord.textContent = `Ponto seleccionado: ${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`;
    coord.style.cssText = "font-size:11px;color:#475569;margin:8px 0";
    root.append(coord);
  }
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Exportar atributos (JSON)";
  exportButton.style.cssText = "margin-top:8px;padding:7px 10px;background:#0369a1;color:white;border:0;border-radius:6px;cursor:pointer";
  exportButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ layer: layerName, properties, location: coordinates ?? null }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "geomoz-feicao.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });
  root.append(exportButton);
  return root;
}
