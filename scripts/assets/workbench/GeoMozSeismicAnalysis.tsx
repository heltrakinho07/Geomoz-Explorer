import {useMemo,useState} from "react";
import type {SeismicEvent} from "./seismic-data";
import {dailyMagnitudeSeries,seismicProfile,gutenbergRichter,depthColor,magnitudeSize,type LonLat} from "./seismic-analytics";
/** Statistical plots derived from actual catalogue values. No database writes. */
export function GeoMozSeismicAnalysis({events,truncated}:{events:SeismicEvent[];truncated:boolean}){
  const [mc,setMc]=useState("3.0");
  const [a,setA]=useState("33.0, -21.0");
  const [b,setB]=useState("35.0, -17.0");
  const [halfWidth,setHalfWidth]=useState("50");
  const series=useMemo(()=>dailyMagnitudeSeries(events),[events]);
  const gr=useMemo(()=>gutenbergRichter(events,Number(mc)),[events,mc]);
  const profile=useMemo(()=>{
    try {
      const parse=(v:string):LonLat=>{
        const p=v.split(/[,; ]+/).filter(Boolean).map(Number);
        if(p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error("Coordenadas A/B inválidas. Use longitude, latitude.");
        return [p[0],p[1]];
      };
      return {...seismicProfile(events,parse(a),parse(b),Number(halfWidth)),error:""};
    }catch(e){return{lengthKm:0,points:[],error:e instanceof Error?e.message:"Perfil inválido."};}
  },[events,a,b,halfWidth]);
  const dated=events.filter(e=>e.magnitude!==null&&Number.isFinite(Date.parse(e.time))).sort((x,y)=>Date.parse(x.time)-Date.parse(y.time));
  const first=dated.length?Date.parse(dated[0].time):0,last=dated.length?Date.parse(dated[dated.length-1].time):0;
  const span=Math.max(864e5,last-first),maxM=Math.max(6,...dated.map(e=>e.magnitude??0));
  const minM=Math.min(0,...dated.map(e=>e.magnitude??0));
  const maxDaily=Math.max(1,...series.map(x=>x.count));
  return <section className="gm-seismic-analytics" aria-label="Análises sísmicas">
    <h3>Análise do catálogo <small>{events.length} eventos · WGS 84 · UTC</small></h3>
    {truncated&&<p className="gm-seismic-science-warning">Catálogo truncado: as estatísticas não são representativas.</p>}
    <div className="gm-seismic-plot-grid">
      <article><h4>Magnitude × tempo</h4>
        <svg role="img" aria-label="Magnitude por data UTC" viewBox="0 0 360 170">
          <path d="M36 8V143H352" stroke="currentColor" fill="none" strokeWidth="1" opacity=".5"/>
          {[0,1,2,3].map(i=><g key={i}><path d={"M36 "+(16+i*38)+" H352"} stroke="currentColor" opacity=".1"/><text x="30" y={20+i*38} fontSize="9" textAnchor="end" fill="currentColor">{(maxM-(maxM-minM)*i/3).toFixed(1)}</text></g>)}
          {dated.map((e,i)=><circle key={e.id+":"+i} cx={36+316*(Date.parse(e.time)-first)/span} cy={16+118*(maxM-(e.magnitude??0))/(maxM-minM||1)} r={Math.min(5,Math.max(2,magnitudeSize(e.magnitude)/3))} fill={depthColor(e.depthKm)} opacity=".7"><title>{e.time+" · M "+e.magnitude+" · "+e.depthKm+" km"}</title></circle>)}
          <text x="195" y="164" textAnchor="middle" fontSize="9" fill="currentColor">Data/hora UTC (esquerda → direita)</text>
        </svg>
      </article>
      <article><h4>Eventos por dia</h4>
        <svg role="img" aria-label="Número de eventos por dia UTC" viewBox="0 0 360 170">
          <path d="M36 8V143H352" stroke="currentColor" fill="none" strokeWidth="1" opacity=".5"/>
          {series.map((s,i)=>{const step=316/Math.max(1,series.length);return <rect key={s.day} x={36+i*step} y={143-s.count/maxDaily*125} height={s.count/maxDaily*125} width={Math.max(1,step*.78)} fill="#0284c7"><title>{s.day+": "+s.count+" eventos"}</title></rect>;})}
          <text x="195" y="164" textAnchor="middle" fontSize="9" fill="currentColor">Dias com registos ({series.length})</text>
        </svg>
      </article>
    </div>
    <div className="gm-seismic-analysis-inputs">
      <label>Perfil A (lon, lat)<input aria-label="Perfil A" value={a} onChange={e=>setA(e.target.value)}/></label>
      <label>Perfil B (lon, lat)<input aria-label="Perfil B" value={b} onChange={e=>setB(e.target.value)}/></label>
      <label>Semilargura (km)<input aria-label="Semilargura do perfil" type="number" min="1" max="300" value={halfWidth} onChange={e=>setHalfWidth(e.target.value)}/></label>
    </div>
    <article><h4>Perfil hipocentral A–B · {Math.round(profile.lengthKm)} km · {profile.points.length} eventos</h4>
      {profile.error?<p role="alert">{profile.error}</p>:<svg role="img" aria-label="Profundidade sísmica ao longo do perfil AB" viewBox="0 0 600 180">
        <path d="M45 12V148H586" stroke="currentColor" fill="none" strokeWidth="1" opacity=".5"/>
        {profile.points.map((p,i)=>{const max=Math.max(30,...profile.points.map(x=>x.depthKm));return <circle key={p.event.id+":"+i} cx={45+535*p.distanceKm/profile.lengthKm} cy={16+128*p.depthKm/max} r={Math.max(2,Math.min(8,magnitudeSize(p.event.magnitude)*.5))} fill={depthColor(p.depthKm)} fillOpacity=".72"><title>{p.event.id+": "+p.distanceKm.toFixed(1)+" km; prof. "+p.depthKm.toFixed(1)+" km"}</title></circle>;})}
        <text x="315" y="172" textAnchor="middle" fontSize="10" fill="currentColor">Distância de A (km) · profundidade aumenta para baixo</text>
      </svg>}
      <p>Projecção regional; apenas eventos dentro da largura escolhida. Sem correcção topográfica.</p>
    </article>
    <div className="gm-seismic-gr">
      <label>Magnitude de completude assumida (Mc)<input aria-label="Magnitude de completude" type="number" step="0.1" min="-2" max="10" value={mc} onChange={e=>setMc(e.target.value)}/></label>
      <div><h4>Gutenberg–Richter · ajuste MLE</h4>
        <strong>{gr.b===null?"b não estimável":"b ≈ "+gr.b.toFixed(3)}</strong>
        <p>N (M ≥ Mc): {gr.n} · a: {gr.a===null?"—":gr.a.toFixed(3)} · escalas: {gr.types.join(", ")||"—"}</p>
        <p className="gm-seismic-science-warning">{truncated?"Catálogo truncado; não interpretar. ":""}{gr.warning}</p>
      </div>
    </div>
  </section>;
}
