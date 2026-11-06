import { useState } from "react";
import { useAppStore } from "@geolibre/core";
import { useLanguage } from "../../hooks/useLanguage";
import { geoMozSpecialistText } from "./geomoz-specialist-locale";
import { Download, FileText, Info, X } from "lucide-react";
import { buildGeoMozQgisPrintJob } from "../../lib/geomoz-qgis-print-job";

/** Prepares a self-contained print job for the autonomous QGIS PDF engine.
 * Does not send user geospatial data to a network host. */
export function GeoMozQgisPrintPanel({ onClose }: { onClose: () => void }) {
  const {language}=useLanguage();
  const ui=(pt:string)=>geoMozSpecialistText(language,pt);
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
  const [engine, setEngine] = useState<"pyqgis" | "cartopy">("pyqgis");
  const [mapCrs, setMapCrs] = useState("EPSG:4326");
  const [gridType, setGridType] = useState<"none" | "geographic" | "utm" | "both">("geographic");
  const [intervalDegrees, setIntervalDegrees] = useState(1);
  const [intervalMeters, setIntervalMeters] = useState(10000);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const download = () => {
    try {
      const job = buildGeoMozQgisPrintJob(layers, selected, { title, paper, orientation, dpi, engine, mapCrs, gridType, intervalDegrees, intervalMeters });
      const file = new Blob([JSON.stringify(job, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "geomoz-qgis-impressao.json";
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally { anchor.remove(); URL.revokeObjectURL(url); }
      setError("");
      setDone(ui("Pacote de impressão criado para ") + (engine === "pyqgis" ? "PyQGIS" : "Cartopy") + ". " + ui("O ficheiro é processado por um serviço privado de impressão."));
    } catch (cause) {
      setDone("");
      setError(cause instanceof Error ? cause.message : ui("Não foi possível preparar o pacote."));
    }
  };

  return <section className="gm-qgis-print-panel" role="dialog" aria-label={ui("Exportação cartográfica GeoMoz")}>
    <header><div><strong><FileText size={17}/> {ui("Impressão cartográfica · PyQGIS / Cartopy")}</strong>
      <small>{ui("Exportação preparada para o motor cartográfico dedicado")}</small></div>
      <button type="button" onClick={onClose} aria-label={ui("Fechar exportação QGIS")}><X size={17}/></button>
    </header>
    <p className="gm-qgis-print-tip"><Info size={15}/> {ui("Este comando cria um pacote local de camadas GeoJSON para o motor seleccionado.")}
      {ui("O PDF não é gerado no navegador. Para impressão imediata em PDF, utilize «Layout de impressão».")}</p>
    <div className="gm-qgis-print-fields">
      <label>{ui("Motor cartográfico")}
        <select aria-label={ui("Motor cartográfico")} value={engine} onChange={event=>{
          const next=event.target.value as "pyqgis" | "cartopy";
          setEngine(next);
          if (next==="cartopy" && (gridType==="utm" || gridType==="both")) setGridType("geographic");
        }}>
          <option value="pyqgis">PyQGIS · Layout profissional</option>
          <option value="cartopy">Cartopy · Mapa científico</option>
        </select>
      </label>
      <label>{ui("CRS do mapa")}
        <select aria-label={ui("CRS do mapa")} value={mapCrs} onChange={event=>setMapCrs(event.target.value)}>
          <option value="EPSG:4326">EPSG:4326 · WGS84</option>
          <option value="EPSG:32735">EPSG:32735 · UTM 35S</option>
          <option value="EPSG:32736">EPSG:32736 · UTM 36S</option>
          <option value="EPSG:32737">EPSG:32737 · UTM 37S</option>
          <option value="EPSG:32738">EPSG:32738 · UTM 38S</option>
        </select>
      </label>
    </div>
    <div className="gm-qgis-print-fields">
      <label>{ui("Grelha de coordenadas")}
        <select aria-label={ui("Grelha de coordenadas")} value={gridType}
          onChange={event=>setGridType(event.target.value as typeof gridType)}>
          <option value="none">{ui("Sem grelha")}</option>
          <option value="geographic">{ui("Geográfica · latitude/longitude")}</option>
          <option value="utm" disabled={engine==="cartopy"}>{ui("UTM · metros")}</option>
          <option value="both" disabled={engine==="cartopy"}>{ui("Ambas · UTM e geográfica")}</option>
        </select>
      </label>
      <label>{ui("Intervalo da grelha")}
        {gridType==="utm" ? <select aria-label={ui("Intervalo UTM")} value={intervalMeters} onChange={event=>setIntervalMeters(Number(event.target.value))}>
          <option value={1000}>1 km</option><option value={5000}>5 km</option><option value={10000}>10 km</option><option value={50000}>50 km</option>
        </select> : <select aria-label={ui("Intervalo geográfico")} value={intervalDegrees} onChange={event=>setIntervalDegrees(Number(event.target.value))}>
          <option value={0.1}>0,1°</option><option value={0.5}>0,5°</option><option value={1}>1°</option><option value={2}>2°</option><option value={5}>5°</option>
        </select>}
      </label>
    </div>
    {gridType==="both"&&<p className="gm-qgis-print-tip">{ui("A grelha UTM usa um intervalo de 10 km por defeito; a geográfica usa o intervalo seleccionado.")}</p>}
    <label>{ui("Título do mapa")}<input maxLength={150} value={title}
      onChange={event => setTitle(event.target.value)} /></label>
    <div className="gm-qgis-print-fields">
      <label>{ui("Formato")}<select value={paper} onChange={event => setPaper(event.target.value as "A4" | "A3")}>
        <option value="A4">A4</option><option value="A3">A3</option>
      </select></label>
      <label>{ui("Orientação")}<select value={orientation} onChange={event => setOrientation(event.target.value as "landscape" | "portrait")}>
        <option value="landscape">{ui("Horizontal")}</option><option value="portrait">{ui("Vertical")}</option>
      </select></label>
      <label>{ui("Resolução")}<select value={dpi} onChange={event => setDpi(Number(event.target.value) as 150 | 300 | 600)}>
        <option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option>
      </select></label>
    </div>
    <fieldset><legend>{ui("Camadas vectoriais a incluir (máximo 12)")}</legend>
      {printable.length === 0 && <p>{ui("Adicione uma camada GeoJSON com feições para preparar um PDF vectorial.")}</p>}
      {printable.map(layer => <label key={layer.id} className="gm-qgis-print-check">
        <input type="checkbox" checked={selected.includes(layer.id)}
          onChange={event => setSelected(previous => event.target.checked
            ? [...previous, layer.id].slice(0, 12)
            : previous.filter(id => id !== layer.id))} />
        <span>{layer.name} <small>({layer.geojson?.features?.length ?? 0}{ui(" feições")})</small></span>
      </label>)}
    </fieldset>
    {error && <p role="alert" className="gm-qgis-print-error">{error}</p>}
    {done && <p role="status" className="gm-qgis-print-done">{done}</p>}
    <button type="button" className="gm-qgis-print-submit" onClick={download}
      disabled={printable.length === 0 || selected.length === 0}><Download size={16}/> {ui("Exportar pacote (.json)")}</button>
  </section>;
}
