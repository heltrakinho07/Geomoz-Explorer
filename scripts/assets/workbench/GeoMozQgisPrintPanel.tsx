import { useState } from "react";
import { useAppStore } from "@geolibre/core";
import { Download, FileText, Info, X } from "lucide-react";
import { buildGeoMozQgisPrintJob } from "../../lib/geomoz-qgis-print-job";

/** Prepares a self-contained print job for the autonomous QGIS PDF engine.
 * Does not send user geospatial data to a network host. */
export function GeoMozQgisPrintPanel({ onClose }: { onClose: () => void }) {
  const layers = useAppStore(state => state.layers);
  const projectName = useAppStore(state => state.projectName);
  const printable = layers.filter(layer => layer.type === "geojson" &&
    Boolean(layer.geojson?.features?.length));
  const [selected, setSelected] = useState<string[]>(() =>
    printable.filter(layer => layer.visible).slice(0, 12).map(layer => layer.id));
  const [title, setTitle] = useState(projectName || "Mapa temático GeoMoz");
  const [paper, setPaper] = useState<"A4" | "A3">("A3");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [dpi, setDpi] = useState<150 | 300 | 600>(300);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const download = () => {
    try {
      const job = buildGeoMozQgisPrintJob(layers, selected, { title, paper, orientation, dpi });
      const file = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "geomoz-qgis-impressao.json";
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally { anchor.remove(); URL.revokeObjectURL(url); }
      setError("");
      setDone("Pacote de impressão criado. O motor PyQGIS processa este ficheiro para gerar PDF vectorial.");
    } catch (cause) {
      setDone("");
      setError(cause instanceof Error ? cause.message : "Não foi possível preparar o pacote.");
    }
  };

  return <section className="gm-qgis-print-panel" role="dialog" aria-label="Exportação cartográfica QGIS">
    <header><div><strong><FileText size={17}/> Impressão QGIS vectorial</strong>
      <small>Exportação preparada para o motor cartográfico dedicado</small></div>
      <button type="button" onClick={onClose} aria-label="Fechar exportação QGIS"><X size={17}/></button>
    </header>
    <p className="gm-qgis-print-tip"><Info size={15}/> Este comando cria um pacote local de camadas GeoJSON para o serviço PyQGIS.
      O PDF não é gerado no navegador. Para impressão imediata em PDF, utilize «Layout de impressão».</p>
    <label>Título do mapa<input maxLength={150} value={title}
      onChange={event => setTitle(event.target.value)} /></label>
    <div className="gm-qgis-print-fields">
      <label>Formato<select value={paper} onChange={event => setPaper(event.target.value as "A4" | "A3")}>
        <option value="A4">A4</option><option value="A3">A3</option>
      </select></label>
      <label>Orientação<select value={orientation} onChange={event => setOrientation(event.target.value as "landscape" | "portrait")}>
        <option value="landscape">Horizontal</option><option value="portrait">Vertical</option>
      </select></label>
      <label>Resolução<select value={dpi} onChange={event => setDpi(Number(event.target.value) as 150 | 300 | 600)}>
        <option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option>
      </select></label>
    </div>
    <fieldset><legend>Camadas vectoriais a incluir (máximo 12)</legend>
      {printable.length === 0 && <p>Adicione uma camada GeoJSON com feições para preparar um PDF vectorial.</p>}
      {printable.map(layer => <label key={layer.id} className="gm-qgis-print-check">
        <input type="checkbox" checked={selected.includes(layer.id)}
          onChange={event => setSelected(previous => event.target.checked
            ? [...previous, layer.id].slice(0, 12)
            : previous.filter(id => id !== layer.id))} />
        <span>{layer.name} <small>({layer.geojson?.features?.length ?? 0} feições)</small></span>
      </label>)}
    </fieldset>
    {error && <p role="alert" className="gm-qgis-print-error">{error}</p>}
    {done && <p role="status" className="gm-qgis-print-done">{done}</p>}
    <button type="button" className="gm-qgis-print-submit" onClick={download}
      disabled={printable.length === 0 || selected.length === 0}><Download size={16}/> Exportar pacote (.json)</button>
  </section>;
}
