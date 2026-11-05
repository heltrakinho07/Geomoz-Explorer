import { useMemo } from "react";
import { Download, Compass, Mountain } from "lucide-react";
import type { TerrainMeshData } from "@/lib/terrain-webgl";
import { terrainProMetrics } from "@/lib/terrain-pro-metrics";

interface Props { terrain:TerrainMeshData; }
export default function TerrainProInsights({terrain}:Props){
  const metrics=useMemo(()=>terrainProMetrics(terrain),[terrain]);
  const save=()=>{
    const blob=new Blob([JSON.stringify({
      ...metrics,disclaimer:"Estimativas da grelha 3D simplificada. Para cálculos definitivos use o GeoTIFF original.",
      generatedAt:new Date().toISOString(),
    },null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download="geomoz_pro_geomorfometria_preview.json";
    link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section aria-label="GeoMoz Pro · Indicadores geomorfométricos"
    className="rounded-xl border border-violet-300 bg-violet-50/70 p-3 text-xs dark:border-violet-900 dark:bg-violet-950/30">
    <div className="flex items-center gap-2 font-semibold text-violet-900 dark:text-violet-200">
      <Mountain size={15}/> GeoMoz Pro · Geomorfometria
    </div>
    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
      Indicadores exploratórios da malha 3D ({terrain.width} × {terrain.height}), não do GeoTIFF original.
      As células NoData e vizinhanças incompletas são excluídas.
    </p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div><span className="block text-slate-500">Amplitude altimétrica</span>
        <strong>{metrics.elevationRangeMeters.toFixed(1)} m</strong></div>
      <div><span className="block text-slate-500">TRI médio (Riley)</span>
        <strong>{metrics.meanTerrainRuggednessIndexMeters.toFixed(1)} m</strong></div>
      <div><span className="block text-slate-500">Relevo local médio (3×3)</span>
        <strong>{metrics.meanLocalReliefMeters.toFixed(1)} m</strong></div>
      <div><span className="block text-slate-500">Exposição dominante (descida)</span>
        <strong>{metrics.dominantDownslopeAspect ?? "Indefinida"}</strong></div>
    </div>
    <div className="mt-2 rounded-lg bg-white/80 p-2 dark:bg-slate-900/70">
      <div className="font-semibold">Percentis altimétricos</div>
      <p>P10: {metrics.percentilesMeters.p10.toFixed(1)} m ·
        P50: {metrics.percentilesMeters.p50.toFixed(1)} m ·
        P90: {metrics.percentilesMeters.p90.toFixed(1)} m</p>
    </div>
    <div className="mt-2 flex items-center gap-1.5 font-semibold"><Compass size={13}/>
      Orientação de encosta por octantes</div>
    <div className="mt-1 grid grid-cols-4 gap-1" aria-label="Distribuição da exposição das encostas">
      {metrics.aspectHistogram.map(bin=><div key={bin.direction}
        className="rounded-md bg-white/80 p-1.5 text-center dark:bg-slate-900/70">
        <strong className="block">{bin.direction}</strong><span>{bin.percent.toFixed(0)}%</span>
      </div>)}
    </div>
    <button type="button" onClick={save}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 font-semibold text-white hover:bg-violet-600">
      <Download size={13}/> Exportar indicadores e proveniência (JSON)
    </button>
  </section>;
}
