/** EarthScope FDSN Station v1 metadata, not waveform samples. */
import type {SeismicBBox} from "./seismic-data";
const ENDPOINT="https://service.earthscope.org/fdsnws/station/1/query";
export interface SeismicStation {
  network:string;station:string;latitude:number;longitude:number;
  elevationM:number|null;site:string;startTime:string;endTime:string;
}
export function earthscopeStationUrl(bbox:SeismicBBox,network="*",limit=1000):string {
  const [west,south,east,north]=bbox;
  if(![west,south,east,north].every(Number.isFinite)||west>=east||south>=north||
    west<-180||east>180||south<-90||north>90)throw Error("Área geográfica das estações inválida.");
  if(!/^[A-Z0-9*?,_-]{1,40}$/i.test(network))throw Error("Código de rede FDSN inválido.");
  if(!Number.isSafeInteger(limit)||limit<1||limit>3000)throw Error("Limite de estações inválido.");
  const url=new URL(ENDPOINT);
  Object.entries({format:"text",level:"station",minlatitude:String(south),maxlatitude:String(north),
    minlongitude:String(west),maxlongitude:String(east),network,nodata:"204"}).forEach(([k,v])=>url.searchParams.set(k,v));
  return url.href;
}
export function parseEarthscopeStations(text:string,max=1000):{stations:SeismicStation[];truncated:boolean} {
  if(text.length>5_000_000)throw Error("Resposta de estações demasiado grande.");
  const lines=text.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
  const heading=lines.find(line=>line.startsWith("#")&&line.includes("|"));
  if(!heading)return {stations:[],truncated:false};
  const keys=heading.slice(1).split("|").map(k=>k.trim().toLowerCase().replace(/[^a-z0-9]/g,""));
  for(const key of ["network","station","latitude","longitude","elevation","sitename"]){
    if(!keys.includes(key))throw Error("Cabeçalho FDSN Station inesperado: "+key);
  }
  const rows=lines.filter(line=>line&&!line.startsWith("#"));
  const stations:SeismicStation[]=[];
  for(const line of rows){
    const cols=line.split("|"),get=(key:string)=>cols[keys.indexOf(key)]?.trim()||"";
    const lat=Number(get("latitude")),lon=Number(get("longitude")),elevation=get("elevation");
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
    if(!get("network")||!get("station"))continue;
    stations.push({network:get("network"),station:get("station"),latitude:lat,longitude:lon,
      elevationM:elevation===""?null:Number.isFinite(Number(elevation))?Number(elevation):null,
      site:get("sitename"),startTime:get("starttime"),endTime:get("endtime")});
    if(stations.length>=max)break;
  }
  return{stations,truncated:rows.length>stations.length};
}
export async function queryEarthscopeStations(bbox:SeismicBBox,network="*",signal?:AbortSignal,
 fetcher:typeof fetch=fetch):Promise<{stations:SeismicStation[];truncated:boolean;url:string}>{
  const url=earthscopeStationUrl(bbox,network);
  let response:Response;
  try{response=await fetcher(url,{signal,headers:{Accept:"text/plain"}});}
  catch(e){if(signal?.aborted)throw e;throw Error("EarthScope indisponível ou CORS bloqueado; poderá ser necessário proxy GeoMoz.",{cause:e});}
  if(response.status===204)return{stations:[],truncated:false,url};
  if(!response.ok)throw Error("Consulta EarthScope falhou: HTTP "+response.status);
  const content=await response.text();
  if(content.length>5_000_000)throw Error("Resposta EarthScope demasiado grande.");
  if(content.trim().startsWith("<"))throw Error("Resposta EarthScope não é tabela FDSN.");
  return {...parseEarthscopeStations(content),url};
}
export function stationsToGeoJSON(stations:SeismicStation[]){
  return{type:"FeatureCollection" as const,features:stations.map(s=>({
    type:"Feature" as const,
    id:s.network+"."+s.station,
    geometry:{type:"Point" as const,coordinates:[s.longitude,s.latitude] as [number,number]},
    properties:{rede:s.network,estacao:s.station,nome:s.site,elevacao_m:s.elevationM,
      inicio:s.startTime,fim:s.endTime,fonte:"EarthScope/FDSN"}
  }))};
}
