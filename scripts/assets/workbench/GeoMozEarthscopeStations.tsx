import {useState,useEffect,type RefObject} from "react";
import {useAppStore} from "@geolibre/core";
import type {MapEngine} from "@geolibre/map";
import {queryEarthscopeStations,stationsToGeoJSON,type SeismicStation} from "./earthscope-stations";
import type {SeismicBBox} from "./seismic-data";
export function GeoMozEarthscopeStations({bbox,mapControllerRef}:{bbox:SeismicBBox;mapControllerRef:RefObject<MapEngine|null>}){
  const [network,setNetwork]=useState("*");
  const [stations,setStations]=useState<SeismicStation[]|null>(null);
  const [truncated,setTruncated]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [controller,setController]=useState<AbortController|null>(null);
  const canAdd=useAppStore(s=>s.deploymentCapabilities.has("data:add"));
  const add=useAppStore(s=>s.addGeoJsonLayer);
  const select=useAppStore(s=>s.selectLayer);
  useEffect(()=>()=>{controller?.abort();},[controller]);
  const query=async()=>{
    controller?.abort();const c=new AbortController();setController(c);
    setError("");setNotice("");setStations(null);setLoading(true);
    try{const data=await queryEarthscopeStations(bbox,network,c.signal);
      if(c.signal.aborted)return;setStations(data.stations);setTruncated(data.truncated);
      setNotice(data.stations.length+" estações devolvidas pela EarthScope.");
    }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Falha ao consultar estações.");}
    finally{if(!c.signal.aborted)setLoading(false);}
  };
  const addToMap=()=>{
    if(!stations?.length||!canAdd)return;
    const id=add("Estações EarthScope · "+network+" ("+stations.length+")",stationsToGeoJSON(stations));
    useAppStore.getState().setLayerStyle(id,{fillColor:"#14b8a6",circleRadius:6,strokeColor:"#0f172a",strokeWidth:1});
    select(id);
    const layer=useAppStore.getState().layers.find(l=>l.id===id);
    if(layer)mapControllerRef.current?.fitLayer(layer);
    setNotice("Camada de estações adicionada. Guarde o projecto para persistir os dados.");
  };
  return <section className="gm-seismic-stations" aria-label="Estações EarthScope">
    <h3>Estações EarthScope · FDSN Station</h3>
    <p>Metadados de redes, localização e elevação. Não são formas de onda miniSEED nem prova de disponibilidade de dados.</p>
    <div className="gm-seismic-actions">
      <label>Redes FDSN <input aria-label="Redes sísmicas EarthScope" value={network} onChange={e=>setNetwork(e.target.value.toUpperCase())} placeholder="* ou 6H,AF,XK"/></label>
      <button type="button" disabled={loading} onClick={()=>void query()}>{loading?"A consultar…":"Consultar estações"}</button>
      <button type="button" disabled={!stations?.length||!canAdd} onClick={addToMap}>Adicionar estações ao mapa</button>
    </div>
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}
    {truncated&&<p className="gm-seismic-science-warning">Resultado limitado: refine redes e extensão antes de utilizar em análises de cobertura instrumental.</p>}
    {stations&&<div className="gm-seismic-events" role="region" aria-label="Pré-visualização das estações">
      {stations.slice(0,30).map(s=><div key={s.network+"."+s.station} className="gm-seismic-event"><strong>{s.network}.{s.station}</strong><span>{s.site}<small>{s.latitude.toFixed(4)}°, {s.longitude.toFixed(4)}° · {s.elevationM??"—"} m</small></span></div>)}
      {stations.length>30&&<p>Mostram-se as primeiras 30 estações.</p>}
    </div>}
  </section>;
}
