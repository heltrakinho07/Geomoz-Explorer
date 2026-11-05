/** Scientific computations for seismological catalogues; no service credentials or database. */
import type {SeismicEvent} from "./seismic-data";
export type LonLat=[number,number];
export interface ProfilePoint {event:SeismicEvent; distanceKm:number; offsetKm:number; depthKm:number}
const R=6371.0088,rad=(d:number)=>d*Math.PI/180;
export function haversineKm(a:LonLat,b:LonLat):number {
  const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
/** Local azimuthal-equidistant projection around mid-point; reliable for regional cross-sections.
 * Reject long profiles (greater than 2000 km) in the caller. Offset sign is positive left of A→B. */
export function seismicProfile(events:SeismicEvent[],a:LonLat,b:LonLat,halfWidthKm=50):{lengthKm:number;points:ProfilePoint[]} {
  const lengthKm=haversineKm(a,b);
  if(lengthKm<1||lengthKm>2000||!Number.isFinite(halfWidthKm)||halfWidthKm<=0||halfWidthKm>300)throw Error("Perfil A–B inválido: distância 1–2000 km e semilargura 0–300 km.");
  const lat0=rad((a[1]+b[1])/2),lon0=rad((a[0]+b[0])/2);
  const project=(p:LonLat):[number,number]=>[R*(rad(p[0])-lon0)*Math.cos(lat0), R*(rad(p[1])-rad((a[1]+b[1])/2))];
  const [ax,ay]=project(a),[bx,by]=project(b),dx=bx-ax,dy=by-ay;
  const d=Math.hypot(dx,dy);
  const points:ProfilePoint[]=[];
  for(const event of events){
    if(event.depthKm===null||!Number.isFinite(event.depthKm))continue;
    const [x,y]=project([event.longitude,event.latitude]),vx=x-ax,vy=y-ay;
    const along=(vx*dx+vy*dy)/d,offset=(dx*vy-dy*vx)/d;
    if(along>=0&&along<=d&&Math.abs(offset)<=halfWidthKm)points.push({event,distanceKm:along,offsetKm:offset,depthKm:event.depthKm});
  }
  return {lengthKm,points};
}
export function dailyMagnitudeSeries(events:SeismicEvent[]):Array<{day:string;count:number;maxMagnitude:number|null}> {
  const data=new Map<string,{count:number;maxMagnitude:number|null}>();
  for(const e of events){
    const day=e.time.slice(0,10),row=data.get(day)||{count:0,maxMagnitude:null};row.count++;
    if(e.magnitude!==null&&(row.maxMagnitude===null||e.magnitude>row.maxMagnitude))row.maxMagnitude=e.magnitude;
    data.set(day,row);
  }
  return [...data].sort(([a],[b])=>a.localeCompare(b)).map(([day,row])=>({day,...row}));
}
export function magnitudeSize(magnitude:number|null):number {
  return magnitude===null?4:Math.max(4,Math.min(18,4+(magnitude-1.5)*2.5));
}
export function depthColor(depthKm:number|null):string {
  return depthKm===null?"#64748b":depthKm<70?"#0284c7":depthKm<300?"#f59e0b":"#dc2626";
}
/** Aki MLE b-value at fixed completeness magnitude Mc, bin width dm:
 * b = log10(e)/(mean(M) - (Mc - dm/2)).
 * Interpret only homogeneous magnitude types, complete uncensored samples and adequate N. */
export function gutenbergRichter(events:SeismicEvent[],mc:number,dm=0.1):{
  b:number|null;a:number|null;n:number;maxMagnitude:number|null;homogeneous:boolean;types:string[];warning:string
}{
  if(!Number.isFinite(mc)||!Number.isFinite(dm)||dm<=0||dm>1)throw Error("Mc ou resolução de magnitude inválidos.");
  const selected=events.filter(e=>e.magnitude!==null&&Number.isFinite(e.magnitude)&&e.magnitude>=mc);
  const types=[...new Set(selected.map(e=>e.magnitudeType.trim().toLowerCase()||"não especificado"))];
  const homogeneous=types.length===1&&types[0]!=="não especificado";
  const n=selected.length;
  const mean=selected.reduce((a,e)=>a+(e.magnitude||0),0)/(n||1);
  const denominator=mean-(mc-dm/2);
  const b=n>=20&&denominator>0?Math.LOG10E/denominator:null;
  const a=b===null?null:Math.log10(n)+b*mc;
  const incomplete=n<20||!homogeneous||b===null;
  return {b,a,n,maxMagnitude:n?Math.max(...selected.map(e=>e.magnitude!)):null,homogeneous,types,
    warning:incomplete
      ?"Estimativa apenas exploratória: requer pelo menos 20 eventos acima de Mc, magnitudes da mesma escala e catálogo completo."
      :"Estimativa condicionada a Mc informado manualmente; confirme a completude, independência e ausência de truncamento antes de interpretar."};
}
export function seismicSymbologyStyle(){
  // Original GeoLibre renderer supports expression-driven colors and proportional size
  // independently. MapLibre match/case handles missing depths without changing raw data.
  return {
    pointRenderer:"single" as const,
    circleRadius:6,
    strokeColor:"#0f172a",
    strokeWidth:1,
    vectorStyleMode:"expression" as const,
    vectorStyleExpression:JSON.stringify(["case",
      ["!",["has","profundidade_km"]],"#64748b",
      ["==",["get","profundidade_km"],null],"#64748b",
      ["<",["to-number",["get","profundidade_km"]],70],"#0284c7",
      ["<",["to-number",["get","profundidade_km"]],300],"#f59e0b",
      "#dc2626"]),
    proportionalSizeEnabled:true,
    proportionalSizeProperty:"magnitude",
    proportionalSizeMinValue:1.5,proportionalSizeMaxValue:7,
    proportionalSizeMinRadius:4,proportionalSizeMaxRadius:18
  };
}
