import { useEffect, useState, type RefObject } from "react";
import { Activity, AlertCircle, Check, CircleDot, Download, ExternalLink, Loader2, Search, X } from "lucide-react";
import { useAppStore } from "@geolibre/core";
import type { MapEngine } from "@geolibre/map";
import {seismicSymbologyStyle} from "./seismic-analytics";
import {GeoMozSeismicAnalysis} from "./GeoMozSeismicAnalysis";
import {GeoMozEarthscopeStations} from "./GeoMozEarthscopeStations";
import {
  SEISMIC_AREAS, SEISMIC_MAX_RESULTS, buildSeismicQueryUrl, eventsToCSV, eventsToGeoJSON,
  querySeismicCatalog, validateSeismicQuery, type SeismicProvider, type SeismicQuery, type SeismicEvent
} from "./seismic-data";

interface Props { onClose:()=>void; mapControllerRef:RefObject<MapEngine | null>; initialProvider?:"usgs"|"isc"; initialView?:"catalog"|"stations"; }
function today():string { return new Date().toISOString().slice(0,10); }
function monthAgo():string { return new Date(Date.now()-30*864e5).toISOString().slice(0,10); }
function download(name:string,mime:string,content:string):void {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement("a");
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function magnitudeColor(depth:number|null):string {
  if(depth===null) return "#64748b";
  return depth < 70 ? "#0284c7" : depth < 300 ? "#f59e0b" : "#dc2626";
}

/** GeoMoz-owned seismic interface. Only renders actual USGS/ISC events. */
export function GeoMozSeismicPanel({onClose,mapControllerRef,initialProvider="usgs",initialView="catalog"}:Props) {
  const addLayer=useAppStore(s=>s.addGeoJsonLayer);
  const selectLayer=useAppStore(s=>s.selectLayer);
  const setLayerStyle=useAppStore(s=>s.setLayerStyle);
  const [activeView,setActiveView]=useState<"catalog"|"analysis"|"stations">(initialView);
  const allowed=useAppStore(s=>s.deploymentCapabilities.has("data:add"));
  const [provider,setProvider]=useState<SeismicProvider>(initialProvider);
  const [region,setRegion]=useState<keyof typeof SEISMIC_AREAS|"custom">("mozambique");
  const [bbox,setBbox]=useState("29, -27, 42, -10");
  const [start,setStart]=useState(monthAgo);
  const [end,setEnd]=useState(today);
  const [minMagnitude,setMinMagnitude]=useState("2");
  const [minDepth,setMinDepth]=useState("-10");
  const [maxDepth,setMaxDepth]=useState("700");
  const [limit,setLimit]=useState("1000");
  const [events,setEvents]=useState<SeismicEvent[] | null>(null);
  const [queryUrl,setQueryUrl]=useState("");
  const [truncated,setTruncated]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [request,setRequest]=useState<AbortController|null>(null);
  useEffect(()=>()=>{request?.abort();},[request]);
  const buildQuery=():SeismicQuery=>{
    const bounds=(region==="custom"?bbox.split(/[,;\s]+/).filter(Boolean).map(Number):SEISMIC_AREAS[region].bounds) as [number,number,number,number];
    if(bounds.length!==4)throw Error("Use 4 coordenadas: oeste, sul, este, norte.");
    return {
      provider,start,end,minMagnitude:Number(minMagnitude),minDepth:Number(minDepth),maxDepth:Number(maxDepth),
      limit:Number(limit),bbox:bounds
    };
  };
  const search=async()=>{
    request?.abort();setBusy(true);setError("");setInfo("");setEvents(null);setTruncated(false);
    const controller=new AbortController();setRequest(controller);
    try{
      const q=buildQuery();validateSeismicQuery(q);
      const result=await querySeismicCatalog(q,{signal:controller.signal});
      if(controller.signal.aborted)return;
      setEvents(result.events);setQueryUrl(result.url);setTruncated(result.truncated);
      setInfo(result.events.length?"Eventos consultados. Pode adicionar a camada ao mapa.":"O catálogo não devolveu eventos para estes filtros.");
    }catch(e){
      if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Erro ao consultar os eventos sísmicos.");
    }finally{if(!controller.signal.aborted)setBusy(false);}
  };
  const importToMap=()=>{
    if(!events?.length||!allowed)return;
    try{
      const fc=eventsToGeoJSON(events);
      const layerName="Sismicidade "+provider.toUpperCase()+" · "+start+" a "+end+" ("+events.length+")";
      const layerId=addLayer(layerName,fc);
      setLayerStyle(layerId,seismicSymbologyStyle());
      selectLayer(layerId);
      // Use the renderer's own fitLayer path; do not alter its layer lifecycle.
      const layer=useAppStore.getState().layers.find(l=>l.id===layerId);
      if(layer)mapControllerRef.current?.fitLayer(layer);
      setInfo("Camada «"+layerName+"» adicionada ao catálogo de camadas. Guarde o projecto para conservar o trabalho.");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível adicionar a camada.");}
  };
  const buildQuerySafeBounds=():[number,number,number,number]=>{try{const q=buildQuery();validateSeismicQuery(q);return q.bbox;}catch{return SEISMIC_AREAS.mozambique.bounds;}};
  const requestLink=()=>{
    try{return buildSeismicQueryUrl(buildQuery());}catch{return provider==="usgs"?"https://earthquake.usgs.gov/fdsnws/event/1/":"https://www.isc.ac.uk/fdsnws/event/1/";}
  };
  return <section className="gm-seismic-panel" data-testid="geomoz-seismic-panel" aria-label="Consulta de catálogos sísmicos">
    <div className="gm-seismic-header">
      <div><small>DADOS CIENTÍFICOS / FDSN</small><h2><Activity size={18}/> Eventos sísmicos</h2><p>Catálogos oficiais em tempo real ou históricos, carregados no navegador.</p></div>
      <button type="button" aria-label="Fechar consulta sísmica" onClick={onClose}><X size={18}/></button>
    </div>
    <nav className="gm-seismic-tabs" aria-label="Módulos sísmicos">{[["catalog","Eventos"],["analysis","Análises"],["stations","Estações EarthScope"]].map(([key,label])=><button key={key} type="button" aria-pressed={activeView===key} onClick={()=>setActiveView(key as typeof activeView)}>{label}</button>)}</nav>
    {activeView==="catalog"&&<form className="gm-seismic-filters" onSubmit={e=>{e.preventDefault();void search();}}>
      <label>Catálogo
        <select aria-label="Catálogo sísmico" value={provider} onChange={e=>{setProvider(e.target.value as SeismicProvider);setEvents(null);setError("");}}>
          <option value="usgs">USGS / NEIC — GeoJSON</option><option value="isc">ISC — FDSN (texto)</option>
        </select>
      </label>
      <label>Área de estudo
        <select aria-label="Área sísmica" value={region} onChange={e=>setRegion(e.target.value as keyof typeof SEISMIC_AREAS|"custom")}>
          {Object.entries(SEISMIC_AREAS).map(([key,item])=><option key={key} value={key}>{item.name}</option>)}
          <option value="custom">Extensão personalizada (W,S,E,N)</option>
        </select>
      </label>
      {region==="custom"&&<label className="gm-seismic-span">Bounding box — oeste, sul, este, norte
        <input aria-label="Limites sísmicos" value={bbox} onChange={e=>setBbox(e.target.value)} placeholder="29, -27, 42, -10"/>
      </label>}
      <label>Início (UTC)<input aria-label="Início sísmico" required type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label>
      <label>Fim (UTC)<input aria-label="Fim sísmico" required type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label>
      <label>Magnitude mínima<input aria-label="Magnitude mínima sísmica" type="number" required min="-2" max="10" step="0.1" value={minMagnitude} onChange={e=>setMinMagnitude(e.target.value)}/></label>
      <label>Profundidade mínima (km)<input aria-label="Profundidade sísmica mínima" type="number" required min="-100" max="1000" value={minDepth} onChange={e=>setMinDepth(e.target.value)}/></label>
      <label>Profundidade máxima (km)<input aria-label="Profundidade sísmica máxima" type="number" required min="-100" max="1000" value={maxDepth} onChange={e=>setMaxDepth(e.target.value)}/></label>
      <label>Máximo de eventos<input aria-label="Limite sísmico" type="number" required min="1" max={SEISMIC_MAX_RESULTS} value={limit} onChange={e=>setLimit(e.target.value)}/></label>
      <div className="gm-seismic-actions gm-seismic-span">
        <button type="submit" disabled={busy}><Search size={15}/>{busy?"A consultar…":"Consultar eventos"}</button>
        {busy&&<button type="button" onClick={()=>{request?.abort();setBusy(false);setInfo("Consulta cancelada.");}}>Cancelar</button>}
        <a href={requestLink()} target="_blank" rel="noopener noreferrer" title="Abrir consulta oficial em nova janela">Ver pedido no serviço <ExternalLink size={13}/></a>
      </div>
    </form>}
    {busy&&<div className="gm-seismic-notice" role="status"><Loader2 className="gm-seismic-spin" size={15}/> A obter eventos da fonte oficial…</div>}
    {error&&<div className="gm-seismic-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    {info&&<div className="gm-seismic-notice" role="status"><Check size={16}/>{info}</div>}
    {activeView==="catalog"&&events&&<div className="gm-seismic-results">
      <div className="gm-seismic-count"><strong>{events.length.toLocaleString("pt-PT")}</strong><span> eventos devolvidos por {provider.toUpperCase()}</span>
        {truncated&&<em>Atenção: limite atingido; reduza a área/período para obter um catálogo completo.</em>}
      </div>
      <div className="gm-seismic-actions">
        <button type="button" disabled={!events.length||!allowed} onClick={importToMap}><CircleDot size={14}/> Adicionar ao mapa</button>
        <button type="button" disabled={!events.length} onClick={()=>download("GeoMoz_"+provider+"_"+start+"_"+end+".geojson","application/geo+json",JSON.stringify(eventsToGeoJSON(events)))}><Download size={14}/> GeoJSON</button>
        <button type="button" disabled={!events.length} onClick={()=>download("GeoMoz_"+provider+"_"+start+"_"+end+".csv","text/csv;charset=utf-8","\uFEFF"+eventsToCSV(events))}><Download size={14}/> CSV</button>
      </div>
      {!allowed&&<p>A edição de camadas está desactivada neste modo de leitura. A exportação continua disponível.</p>}
      {!!events.length&&<div className="gm-seismic-events" role="region" aria-label="Pré-visualização dos eventos">
        {events.slice(0,25).map(e=><div className="gm-seismic-event" key={e.source+":"+e.id}>
          <i style={{background:magnitudeColor(e.depthKm)}}/><span><strong>{e.magnitude===null?"M —":"M "+e.magnitude.toFixed(1)}</strong> · {new Date(e.time).toLocaleString("pt-PT",{timeZone:"UTC"})} UTC
            <small>{e.place||e.id} · {e.depthKm===null?"Profundidade desconhecida":e.depthKm+" km"} · {e.magnitudeType||"Tipo M não especificado"}</small>
          </span></div>)}
        {events.length>25&&<p>Mostram-se apenas os primeiros 25 eventos. Todos os {events.length} registos podem ser exportados ou adicionados ao mapa.</p>}
      </div>}
    </div>}
    {activeView==="analysis"&&(events?.length?<GeoMozSeismicAnalysis events={events} truncated={truncated}/>:<p className="gm-seismic-notice">Consulte primeiro um catálogo de eventos no separador Eventos para activar os gráficos e perfis.</p>)}
    {activeView==="stations"&&<GeoMozEarthscopeStations bbox={buildQuerySafeBounds()} mapControllerRef={mapControllerRef}/>}
    <footer>Fonte: {provider==="usgs"?"U.S. Geological Survey / NEIC":"International Seismological Centre"} · Dados consultados directamente, sem armazenamento automático no Firebase. Eventos podem ser revistos pelas agências.</footer>
  </section>;
}
