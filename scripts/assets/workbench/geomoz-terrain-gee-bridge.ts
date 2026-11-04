/** GEE data without tokens crossing between GeoMoz's same-origin app bundles. */
import type {TerrainMeshData} from "../../lib/geomoz-terrain-webgl";
import {WORLD_COVER_CLASSES,createCategoricalOverlay,generateOverlayId,type TerrainOverlay}
  from "./geomoz-terrain-layers";

const REQUEST="geomoz:workspace:landcover:request";
const RESPONSE="geomoz:workspace:landcover:response";
const MAX_WAIT_MS=120000;

export async function loadWorldCoverFromAuthenticatedGeoMoz(mesh:TerrainMeshData):
  Promise<TerrainOverlay> {
  const frame=document.querySelector('iframe[src^="/auth/workspace-check"]') as
    HTMLIFrameElement|null;
  if(!frame?.contentWindow || document.body.dataset.geomozAuth!=="allowed")
    throw Error("Abra o GIS Workspace com sessão GeoMoz autenticada para consultar o GEE.");
  const bridge=frame.contentWindow;
  const requestId=crypto.randomUUID();
  const payload={crs:mesh.crs,bounds_meters:mesh.boundsMeters,
    width:mesh.width,height:mesh.height};
  const response=await new Promise<unknown>((resolve,reject)=>{
    let finished=false;
    const close=()=>{
      finished=true;window.clearTimeout(timeout);
      window.removeEventListener("message",receive);
    };
    const receive=(event:MessageEvent)=>{
      if(finished||event.origin!==window.location.origin||event.source!==bridge ||
        event.data?.type!==RESPONSE||event.data?.requestId!==requestId)return;
      close();
      if(event.data.ok)resolve(event.data.data);
      else reject(Error(typeof event.data.error==="string"?event.data.error:
        "Falha na consulta ao Earth Engine."));
    };
    const timeout=window.setTimeout(()=>{
      close();reject(Error("Tempo de resposta ESA WorldCover excedido. Tente novamente."));
    },MAX_WAIT_MS);
    window.addEventListener("message",receive);
    bridge.postMessage({type:REQUEST,requestId,payload},window.location.origin);
  });
  const result=response as {dataset?:string;targetCrs?:string;width?:number;height?:number;
    values?:(number|null)[];attribution?:string;year?:number};
  if(result?.dataset!=="ESA/WorldCover/v200" || result.year!==2021 ||
    result.targetCrs!==mesh.crs||result.width!==mesh.width||
    result.height!==mesh.height||!Array.isArray(result.values))
    throw Error("A grelha WorldCover não corresponde ao DEM do projecto.");
  return {...createCategoricalOverlay("Cobertura do solo · ESA WorldCover 2021",
    result.values,mesh,"gee",generateOverlayId(),WORLD_COVER_CLASSES),
    credit:result.attribution??"ESA WorldCover 2021 · CC BY 4.0"};
}
