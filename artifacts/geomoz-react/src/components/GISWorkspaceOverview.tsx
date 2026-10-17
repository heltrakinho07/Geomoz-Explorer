import { AlertCircle, CheckCircle2, Crosshair, Layers, Mountain, Upload } from "lucide-react";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";
interface Props {
  raster: GISWorkspaceRasterLayer | null;
  layerCount: number;
  results: number;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onDraw: () => void;
  onTerrain: () => void;
  onLayers: () => void;
}
export default function GISWorkspaceOverview({raster, layerCount, results, busy, error, onImport, onDraw, onTerrain, onLayers}: Props) {
  const native = raster?.name.match(/DEM Global · ([\d.]+) m/);
  const resolution = native ? Number(native[1]) : null;
  return <section className="gw-overview" aria-label="Estado do estudo GIS">
    <div className="gw-eyebrow">ESTUDO TERRITORIAL <span>PROCESSAMENTO LOCAL</span></div>
    <h2>Da área de estudo ao resultado.</h2>
    <p>Defina uma área, escolha o DEM e execute a análise. Os resultados aparecem nas camadas do mapa.</p>
    <div className="gw-step-grid">
      <button type="button" onClick={onDraw}><Crosshair size={17}/><span><small>01 · ÁREA</small>Desenhar no mapa</span></button>
      <button type="button" onClick={onImport}><Upload size={17}/><span><small>02 · DADOS</small>Importar DEM</span></button>
      <button type="button" onClick={onTerrain}><Mountain size={17}/><span><small>03 · ANÁLISE</small>Terreno e drenagem</span></button>
    </div>
    <div className="gw-input-card">
      <span>ENTRADA SELECCIONADA</span>
      <strong title={raster?.name}>{raster?.name || "Nenhum DEM seleccionado"}</strong>
      <p>{raster ? `${raster.bandCount ?? "?"} banda(s) · ${raster.sizeBytes ? (raster.sizeBytes / 1048576).toFixed(1) + " MiB" : "fonte remota"}` : "Importe GeoTIFF/HGT ou desenhe uma área para obter um DEM."}</p>
      {resolution !== null && <p className={resolution > 100 ? "gw-quality-warning" : ""}>Grelha de origem: aproximadamente {resolution.toFixed(0)} m. {resolution > 100 ? "Detalhe regional: desenhe uma área menor e volte a obter o DEM para estudar encostas locais." : "A resolução de saída não acrescenta detalhe à fonte."}</p>}
    </div>
    <div className="gw-run-status" role="status">
      {busy ? <><span className="gw-pulse"/> Processamento em curso…</> : error ? <><AlertCircle size={16}/> A execução falhou; consulte o erro abaixo.</> : raster ? <><CheckCircle2 size={16}/> Entrada disponível para configurar a análise</> : <><Layers size={16}/> Comece por definir a área ou importar dados</>}
    </div>
    {error && <p role="alert" className="gw-error">{error}</p>}
    <button type="button" onClick={onLayers} className="gw-result-link">{layerCount} camada(s) · {results} resultado(s) <span>Ver camadas →</span></button>
  </section>;
}
