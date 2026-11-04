import { useEffect, useMemo, useState } from "react";
import { BarChart2, Download, MapPin, Route } from "lucide-react";
import type { TerrainMeshData } from "@/lib/terrain-webgl";
import {
  terrainProfile, terrainSlopeSummary, previewContours,
  type TerrainContourCollection,
} from "@/lib/terrain-analysis";

interface Props { terrain: TerrainMeshData }

function saveText(content: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], {type:mime}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function TerrainSciencePanel({terrain}:Props) {
  const [aLon,setALon]=useState("");
  const [aLat,setALat]=useState("");
  const [bLon,setBLon]=useState("");
  const [bLat,setBLat]=useState("");
  const [interval,setInterval]=useState("100");
  const [contours,setContours]=useState<TerrainContourCollection|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const [w,s,e,n]=terrain.bounds4326;
    setALon((w+.2*(e-w)).toFixed(5));
    setALat((s+.3*(n-s)).toFixed(5));
    setBLon((w+.8*(e-w)).toFixed(5));
    setBLat((s+.7*(n-s)).toFixed(5));
    setContours(null);setError("");
  },[terrain]);

  const profile=useMemo(()=>{
    try {
      if(!aLon||!aLat||!bLon||!bLat)return null;
      return terrainProfile(terrain,[Number(aLon),Number(aLat)],[Number(bLon),Number(bLat)]);
    }catch{return null;}
  },[terrain,aLon,aLat,bLon,bLat]);
  const slope=useMemo(()=>terrainSlopeSummary(terrain),[terrain]);
  const plot=useMemo(()=>{
    if(!profile)return "";
    const valid=profile.points.filter(p=>p.elevationM!==null);
    if(!valid.length)return "";
    const min=profile.minElevationM,max=profile.maxElevationM,span=Math.max(1,max-min);
    return profile.points.map((p,i)=>{
      const x=12+i/(profile.points.length-1)*276;
      const y=p.elevationM===null?null:78-(p.elevationM-min)/span*58;
      return y===null?null:(i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1);
    }).filter(Boolean).join(" ");
  },[profile]);

  function exportProfile(){
    if(!profile)return;
    const lines=["distancia_m,longitude,latitude,elevacao_m",
      ...profile.points.map(p=>[p.distanceM.toFixed(2),p.lon.toFixed(7),p.lat.toFixed(7),
        p.elevationM===null?"":p.elevationM.toFixed(2)].join(","))];
    saveText(lines.join("\n"),"geomoz_perfil_3d.csv","text/csv;charset=utf-8");
  }
  function generateContours(){
    setError("");setContours(null);
    try{setContours(previewContours(terrain,Number(interval)));}catch(cause){
      setError(cause instanceof Error?cause.message:"Falha ao gerar curvas de nível.");
    }
  }
  function exportContours(){
    if(!contours)return;
    saveText(JSON.stringify(contours),"geomoz_curvas_nivel_preview.geojson","application/geo+json");
  }
  const coordClass="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
  const actionClass="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200";
  return <details className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs dark:border-sky-900 dark:bg-slate-800/60" open>
    <summary className="cursor-pointer font-bold text-sky-900 dark:text-sky-200">
      <BarChart2 size={14} className="mr-1.5 inline"/> Análise científica do DEM
    </summary>
    <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
      Medições estimadas a partir da grelha simplificada ({terrain.width} × {terrain.height}).
      Para cálculos finais utilize o raster original nas ferramentas SIG.
    </p>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white p-2 dark:bg-slate-900">
      <div><span className="block text-slate-500">Declive médio</span><b>{slope.meanDeg.toFixed(1)}°</b></div>
      <div><span className="block text-slate-500">Declive máximo</span><b>{slope.maxDeg.toFixed(1)}°</b></div>
    </div>
    <div className="mt-3 flex items-center gap-1.5 font-semibold"><Route size={13}/> Perfil A → B</div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <label>Ponto A · longitude<input aria-label="Longitude do ponto A" type="number" step="any" value={aLon} onChange={e=>setALon(e.target.value)} className={coordClass}/></label>
      <label>Ponto A · latitude<input aria-label="Latitude do ponto A" type="number" step="any" value={aLat} onChange={e=>setALat(e.target.value)} className={coordClass}/></label>
      <label>Ponto B · longitude<input aria-label="Longitude do ponto B" type="number" step="any" value={bLon} onChange={e=>setBLon(e.target.value)} className={coordClass}/></label>
      <label>Ponto B · latitude<input aria-label="Latitude do ponto B" type="number" step="any" value={bLat} onChange={e=>setBLat(e.target.value)} className={coordClass}/></label>
    </div>
    {profile?<div className="mt-3">
      <svg viewBox="0 0 300 94" className="h-28 w-full rounded-lg bg-white dark:bg-slate-900"
        role="img" aria-label="Perfil altimétrico A para B">
        <path d="M12 8 V78 H288" stroke="currentColor" strokeOpacity=".35" fill="none"/>
        <path d={plot} stroke="#0284c7" strokeWidth="2" strokeLinejoin="round" fill="none"/>
        <text x="12" y="90" fontSize="9" fill="currentColor">A · 0 km</text>
        <text x="288" y="90" fontSize="9" fill="currentColor" textAnchor="end">
          B · {(profile.distanceM/1000).toFixed(2)} km
        </text>
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <span>Elevação mínima: <b>{profile.minElevationM.toFixed(1)} m</b></span>
        <span>Elevação máxima: <b>{profile.maxElevationM.toFixed(1)} m</b></span>
        <span>Desnível acumulado ↑ <b>{profile.gainM.toFixed(0)} m</b></span>
        <span>Declive A→B: <b>{profile.averageGradePct.toFixed(1)}%</b></span>
      </div>
      <button type="button" className={actionClass+" mt-2 w-full"} onClick={exportProfile}>
        <Download size={13}/> Exportar perfil CSV
      </button>
    </div>:<p className="mt-2 text-amber-700 dark:text-amber-300">
      <MapPin size={12} className="mr-1 inline"/> Defina pontos válidos dentro do DEM e fora das células NoData.
    </p>}
    <div className="mt-4 border-t border-sky-200 pt-3 dark:border-slate-700">
      <label className="font-semibold">Curvas de nível · equidistância (m)
        <input type="number" min="1" max="100000" step="1" className={coordClass}
          aria-label="Equidistância das curvas de nível"
          value={interval} onChange={e=>setInterval(e.target.value)}/>
      </label>
      <button type="button" onClick={generateContours} className={actionClass+" mt-2 w-full"}>
        Gerar curvas de nível (pré-visualização)
      </button>
      {contours&&<div className="mt-2">
        <p className="text-emerald-700 dark:text-emerald-300">
          {contours.features.length} segmentos calculados · GeoJSON WGS84
        </p>
        <button type="button" onClick={exportContours} className={actionClass+" mt-1 w-full"}>
          <Download size={13}/> Exportar GeoJSON
        </button>
      </div>}
      {error&&<p role="alert" className="mt-2 text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  </details>;
}
