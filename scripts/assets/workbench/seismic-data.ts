/**
 * FDSN/GeoJSON seismic event clients for GeoMoz GIS Workbench.
 * Requests go directly from the browser to USGS or ISC. No Firestore writes.
 * ISC supplies FDSN format=text; USGS supplies GeoJSON. Event origins from
 * different agencies are NOT automatically deduplicated or re-located.
 */
export type SeismicProvider = "usgs" | "isc";
export type SeismicBBox = [number, number, number, number]; // W,S,E,N
export interface SeismicQuery {
  provider: SeismicProvider;
  start: string;
  end: string;
  minMagnitude: number;
  minDepth: number;
  maxDepth: number;
  bbox: SeismicBBox;
  limit: number;
}
export interface SeismicEvent {
  id: string;
  source: SeismicProvider;
  time: string; // ISO 8601 UTC
  longitude: number;
  latitude: number;
  depthKm: number | null;
  magnitude: number | null;
  magnitudeType: string;
  place: string;
  eventType: string;
  sourceUrl: string;
  catalog?: string;
  author?: string;
}
export interface SeismicFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string | number | null>;
}
export interface SeismicGeoJSON {
  type: "FeatureCollection";
  features: SeismicFeature[];
}

const ORIGINS: Record<SeismicProvider,string> = {
  usgs: "https://earthquake.usgs.gov/fdsnws/event/1/query",
  isc: "https://www.isc.ac.uk/fdsnws/event/1/query"
};
export const SEISMIC_AREAS = {
  mozambique: { name: "Moçambique e margem continental", bounds: [29, -27, 42, -10] as SeismicBBox },
  ears: { name: "EARS meridional — África Austral", bounds: [27, -25, 43, -10] as SeismicBBox },
  africa: { name: "África Oriental", bounds: [20, -35, 52, 15] as SeismicBBox }
};
export const SEISMIC_MAX_RESULTS = 2000;

function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) return false;
  return new Date(s + "T00:00:00Z").toISOString().startsWith(s);
}
function bounded(n: number, min: number, max: number) {
  return Number.isFinite(n) && n >= min && n <= max;
}
export function validateSeismicQuery(q: SeismicQuery): void {
  if (!(q.provider in ORIGINS)) throw Error("Fonte sísmica desconhecida.");
  if (!validDate(q.start) || !validDate(q.end) || q.start > q.end) throw Error("Indique um período cronológico válido.");
  if (!bounded(q.minMagnitude, -2, 10)) throw Error("Magnitude mínima inválida (-2 a 10).");
  if (!bounded(q.minDepth, -100, 1000) || !bounded(q.maxDepth, -100, 1000) || q.minDepth > q.maxDepth) throw Error("Intervalo de profundidade inválido.");
  const [west, south, east, north] = q.bbox;
  if (!bounded(west, -180, 180) || !bounded(east, -180, 180) || !bounded(south, -90, 90) || !bounded(north, -90, 90) || west >= east || south >= north) throw Error("Coordenadas da área inválidas (W,S,E,N).");
  if (!Number.isSafeInteger(q.limit) || q.limit < 1 || q.limit > SEISMIC_MAX_RESULTS) throw Error("Limite de eventos deve estar entre 1 e 2000.");
}
export function buildSeismicQueryUrl(q: SeismicQuery): string {
  validateSeismicQuery(q);
  const [west,south,east,north] = q.bbox;
  const url = new URL(ORIGINS[q.provider]);
  Object.entries({
    format: q.provider === "usgs" ? "geojson" : "text",
    starttime: q.start,
    endtime: q.end,
    minmagnitude: String(q.minMagnitude),
    mindepth: String(q.minDepth),
    maxdepth: String(q.maxDepth),
    minlatitude: String(south),
    maxlatitude: String(north),
    minlongitude: String(west),
    maxlongitude: String(east),
    limit: String(q.limit),
    orderby: "time",
    nodata: "204"
  }).forEach(([k,v])=>url.searchParams.set(k,v));
  if (q.provider === "usgs") url.searchParams.set("eventtype", "earthquake");
  return url.href;
}
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function coordinates(lon: unknown,lat: unknown) {
  const x = numeric(lon), y = numeric(lat);
  return x !== null && y !== null && bounded(x,-180,180) && bounded(y,-90,90);
}
function utcDate(value: unknown): string | null {
  const n = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(n)) return null;
  const date = new Date(n);
  return !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}
export function normalizeUsgsGeoJson(payload: unknown): SeismicEvent[] {
  if (!payload || typeof payload !== "object" || (payload as {type?:string}).type !== "FeatureCollection" ||
      !Array.isArray((payload as {features?:unknown}).features)) throw Error("Resposta GeoJSON USGS inválida.");
  const features = (payload as {features:unknown[]}).features;
  if (features.length > SEISMIC_MAX_RESULTS) throw Error("A resposta do USGS excede o limite seguro.");
  const result: SeismicEvent[] = [];
  for (const raw of features) {
    const f=raw as {id?:unknown;properties?:Record<string,unknown>;geometry?:{type?:string;coordinates?:unknown[]}};
    if (f?.geometry?.type!=="Point" || !Array.isArray(f.geometry.coordinates)) continue;
    const [lon,lat,depth] = f.geometry.coordinates;
    if (!coordinates(lon,lat)) continue;
    const time = utcDate(f.properties?.time);
    if (!time) continue;
    const id = String(f.id || "").trim();
    if (!id) continue;
    const magnitude = numeric(f.properties?.mag);
    const url=String(f.properties?.url || "");
    result.push({
      id,source:"usgs",time,longitude:Number(lon),latitude:Number(lat),
      depthKm:numeric(depth),magnitude,magnitudeType:String(f.properties?.magType||""),
      place:String(f.properties?.place||""),eventType:String(f.properties?.type||"earthquake"),
      sourceUrl:url.startsWith("https://earthquake.usgs.gov/") ? url : "",
      catalog:String(f.properties?.net||""),author:String(f.properties?.sources||"")
    });
  }
  return result;
}
/** FDSN 1.2 pipe-delimited event text; columns are keyed from the service header. */
export function parseIscFdsnText(payload: string): SeismicEvent[] {
  if (typeof payload !== "string") throw Error("Resposta ISC inválida.");
  const lines = payload.replace(/^\uFEFF/,"").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length===0 || (lines.length===1 && !lines[0].includes("|"))) return [];
  const header = lines[0].replace(/^#/,"").split("|").map(v=>v.trim().toLowerCase().replace(/[^a-z0-9]/g,""));
  for(const needed of ["eventid","time","latitude","longitude","depthkm","magnitude"]) {
    if (!header.includes(needed)) throw Error("Formato de catálogo ISC desconhecido: falta " + needed);
  }
  if (lines.length - 1 > SEISMIC_MAX_RESULTS) throw Error("O catálogo ISC excede o limite seguro.");
  const result: SeismicEvent[]=[];
  for(const line of lines.slice(1)) {
    if (line.startsWith("#")) continue;
    const fields = line.split("|");
    const get=(name:string):string=>fields[header.indexOf(name)]?.trim() || "";
    if (!coordinates(get("longitude"),get("latitude"))) continue;
    const time = utcDate(get("time") + (/[zZ]|[+-]\d\d:\d\d$/.test(get("time"))?"":"Z"));
    if(!time)continue;
    const id=get("eventid");
    if (!id)continue;
    const eventType=get("eventtype") || "unknown";
    if (/explosion|quarry blast/i.test(eventType)) continue;
    result.push({
      id,source:"isc",time,longitude:Number(get("longitude")),latitude:Number(get("latitude")),
      depthKm:numeric(get("depthkm")),magnitude:numeric(get("magnitude")),magnitudeType:get("magtype"),
      place:get("eventlocationname"),eventType,sourceUrl:"",catalog:get("catalog"),author:get("author")
    });
  }
  return result;
}
export async function querySeismicCatalog(
  query: SeismicQuery,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}
): Promise<{events:SeismicEvent[];url:string;truncated:boolean}> {
  const url=buildSeismicQueryUrl(query);
  let response: Response;
  try {
    response=await (options.fetcher ?? fetch)(url,{signal:options.signal,headers:{Accept:query.provider==="usgs"?"application/geo+json,application/json":"text/plain"}});
  } catch(error) {
    if (options.signal?.aborted) throw error;
    throw Error("Não foi possível contactar " + query.provider.toUpperCase() + ". Verifique a rede e as permissões CORS do serviço.",{cause:error});
  }
  if(response.status===204)return{events:[],url,truncated:false};
  if(!response.ok) throw Error("Falha na consulta " + query.provider.toUpperCase() + ": HTTP " + response.status);
  // Guard against unexpected error/HTML body or massive responses.
  const length=Number(response.headers.get("content-length")||"0");
  if(length>8_000_000)throw Error("A resposta excede 8 MB; reduza área, período ou limite.");
  const body=await response.text();
  if(body.length>8_000_000)throw Error("A resposta excede 8 MB; reduza área, período ou limite.");
  let events:SeismicEvent[];
  if(query.provider==="usgs"){
    try{events=normalizeUsgsGeoJson(JSON.parse(body));}catch(err){throw Error("Não foi possível interpretar o catálogo USGS.",{cause:err});}
  }else {
    if(body.trim().startsWith("<"))throw Error("O ISC devolveu XML/HTML em vez da tabela FDSN. Tente um período menor.");
    events=parseIscFdsnText(body);
  }
  return {events,url,truncated:events.length >= query.limit};
}
export function eventsToGeoJSON(events: SeismicEvent[]):SeismicGeoJSON {
  return {
    type:"FeatureCollection",
    features:events.map(e=>({
      type:"Feature",id:e.source+":"+e.id,
      geometry:{type:"Point",coordinates:[e.longitude,e.latitude]},
      properties:{
        event_id:e.id,fonte:e.source.toUpperCase(),data_utc:e.time,
        magnitude:e.magnitude,tipo_magnitude:e.magnitudeType,profundidade_km:e.depthKm,
        local:e.place,tipo_evento:e.eventType,catalogo:e.catalog||"",autor:e.author||"",url_origem:e.sourceUrl
      }
    }))
  };
}
function cell(value:unknown):string {
  const raw=String(value??"");
  return /[",\n\r]/.test(raw) ? '"'+raw.replace(/"/g,'""')+'"' : raw;
}
export function eventsToCSV(events:SeismicEvent[]):string {
  const cols=["id","source","time","longitude","latitude","depthKm","magnitude","magnitudeType","place","eventType","sourceUrl","catalog","author"] as const;
  return [cols.join(","),...events.map(e=>cols.map(col=>cell(e[col])).join(","))].join("\r\n")+"\r\n";
}
