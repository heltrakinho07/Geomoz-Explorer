/**
 * Georeferenced DEM texture composition (visual output, never scientific data).
 *
 * Layers are ordered bottom -> top and blended by independently configured
 * alpha values. Remote XYZ images are loaded ONLY following an explicit user
 * action and only from a provider for which the user has reproduction rights.
 * No bulk scraping, offline caches or implicit requests to OSM tiles.
 */
import proj4 from "proj4";

export interface TerrainTextureLayer {
  id: string;
  imageDataUrl: string;
  visible: boolean;
  opacity: number; // 0..1
}
export interface TerrainGeography {
  crs: string;
  boundsMeters: number[];
  bounds4326: number[];
}
export interface XYZTextureResult {
  imageDataUrl: string;
  zoom: number;
  tiles: number;
}
const SIZE = 512;
const TILE = 256;
const MAX_TILES = 12;
const MAX_ZOOM = 15;

export function validLicensedXYZTemplate(template: string): boolean {
  if (template.length > 2048 || !/^https:\/\//i.test(template)) return false;
  if (!["{z}","{x}","{y}"].every(v => template.includes(v))) return false;
  try {
    const url = new URL(template.replaceAll("{z}","1").replaceAll("{x}","1").replaceAll("{y}","1"));
    if (url.username || url.password) return false;
    // The foundation's community tile server forbids prefetch/bulk operations.
    // A DEM mosaic is a new derived texture: use a suitably licensed provider.
    if (url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org")) return false;
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch { return false; }
}

/** Normalized web Mercator tile coordinate; the Y axis increases southwards. */
export function xyzTilePosition(lon: number, lat: number, z: number): [number,number] {
  const n = 2 ** z;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878,lat));
  const x = Math.max(0,Math.min(n - 1e-8,(lon+180)/360*n));
  const latRad = safeLat*Math.PI/180;
  const y = Math.max(0,Math.min(n-1e-8,(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n));
  return [x,y];
}

export function chooseXYZTiles(bounds: readonly number[], maxTiles=MAX_TILES) {
  if (bounds.length!==4 || !bounds.every(Number.isFinite)) throw Error("Extensão do DEM inválida.");
  const [west,south,east,north] = bounds;
  if (west>=east || south>=north || west<-180 || east>180 ||
      south<-85.05 || north>85.05 || east-west>180)
    throw Error("O mapa-base XYZ requer uma extensão geográfica válida sem antimeridiano.");
  for(let z=MAX_ZOOM;z>=0;z--){
    const a=xyzTilePosition(west,north,z);
    const b=xyzTilePosition(east,south,z);
    const xmin=Math.floor(a[0]),xmax=Math.floor(b[0]);
    const ymin=Math.floor(a[1]),ymax=Math.floor(b[1]);
    const count=(xmax-xmin+1)*(ymax-ymin+1);
    if(count>0 && count<=maxTiles)return {zoom:z,xmin,xmax,ymin,ymax,count};
  }
  throw Error("A extensão do DEM excede a capacidade máxima do mapa-base.");
}

function decoded(source: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve,reject)=>{
    const im=new Image();
    const stop=()=>{im.src="";reject(new DOMException("Composição cancelada.","AbortError"));};
    if(signal?.aborted){stop();return;}
    signal?.addEventListener("abort",stop,{once:true});
    im.onload=()=>{signal?.removeEventListener("abort",stop);resolve(im);};
    im.onerror=()=>{signal?.removeEventListener("abort",stop);reject(Error("Imagem temática ilegível."));};
    im.src=source;
  });
}

/** RGBA layers are composited in listed order, respecting NoData transparency. */
export async function composeTerrainTexture(
  layers: readonly TerrainTextureLayer[], signal?: AbortSignal,
): Promise<string|null> {
  const active=layers.filter(x=>x.visible&&x.opacity>0&&x.imageDataUrl);
  if(!active.length)return null;
  const canvas=document.createElement("canvas");canvas.width=SIZE;canvas.height=SIZE;
  const ctx=canvas.getContext("2d",{willReadFrequently:false});
  if(!ctx)throw Error("Canvas indisponível para composição de camadas 3D.");
  for(const layer of active) {
    if(signal?.aborted)throw new DOMException("Composição cancelada.","AbortError");
    const image=await decoded(layer.imageDataUrl,signal);
    ctx.globalAlpha=Math.max(0,Math.min(1,layer.opacity));
    ctx.drawImage(image,0,0,SIZE,SIZE);
  }
  ctx.globalAlpha=1;
  return canvas.toDataURL("image/png");
}

/**
 * Fetch a bounded set of user-authorized XYZ tiles and resample by the DEM CRS.
 * Runs on a single user click, not at startup or during pan/zoom.
 * CORS errors are reported, never hidden behind an all-green placeholder.
 */
export async function renderLicensedXYZTexture(
  terrain: TerrainGeography, template: string,
  options: {signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}={},
): Promise<XYZTextureResult> {
  if(!validLicensedXYZTemplate(template))throw Error(
    "Indique um URL XYZ HTTPS autorizado com {z}, {x} e {y}; o servidor público OSM não permite esta função."
  );
  const {zoom,xmin,xmax,ymin,ymax,count}=chooseXYZTiles(terrain.bounds4326);
  const cols=xmax-xmin+1,rows=ymax-ymin+1;
  const mosaic=document.createElement("canvas");
  mosaic.width=cols*TILE;mosaic.height=rows*TILE;
  const mosaicCtx=mosaic.getContext("2d",{willReadFrequently:true});
  if(!mosaicCtx)throw Error("Canvas indisponível para mosaico do mapa-base.");
  let finished=0;
  // Fetch limited tiles on demand, using the browser's normal HTTP cache.
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
    if(options.signal?.aborted)throw new DOMException("Mosaico cancelado.","AbortError");
    const url=template.replaceAll("{z}",String(zoom))
      .replaceAll("{x}",String(x)).replaceAll("{y}",String(y));
    const response=await fetch(url,{mode:"cors",credentials:"omit",signal:options.signal});
    if(!response.ok)throw Error("Mosaico XYZ: HTTP "+response.status+" no mosaico "+(finished+1)+".");
    const blob=await response.blob();
    if(!blob.type.startsWith("image/"))throw Error("O serviço XYZ não devolveu uma imagem.");
    const bitmap=await createImageBitmap(blob);
    try{mosaicCtx.drawImage(bitmap,(x-xmin)*TILE,(y-ymin)*TILE,TILE,TILE);}
    finally{bitmap.close();}
    options.onProgress?.(++finished,count);
  }
  const pixels=mosaicCtx.getImageData(0,0,mosaic.width,mosaic.height).data;
  const image=document.createElement("canvas");image.width=SIZE;image.height=SIZE;
  const ctx=image.getContext("2d");
  if(!ctx)throw Error("Canvas indisponível para imagem georreferenciada.");
  const out=ctx.createImageData(SIZE,SIZE);
  const [left,bottom,right,top]=terrain.boundsMeters;
  if(!(right>left && top>bottom))throw Error("Extensão métrica do DEM inválida.");
  for(let row=0;row<SIZE;row++)for(let col=0;col<SIZE;col++){
    if(row%32===0 && options.signal?.aborted)
      throw new DOMException("Mosaico cancelado.","AbortError");
    const metric:[number,number]=[
      left+(right-left)*(col+0.5)/SIZE,
      top-(top-bottom)*(row+0.5)/SIZE,
    ];
    const [lon,lat]=proj4(terrain.crs,"EPSG:4326",metric) as [number,number];
    if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
    const [tx,ty]=xyzTilePosition(lon,lat,zoom);
    const ix=Math.floor((tx-xmin)*TILE),iy=Math.floor((ty-ymin)*TILE);
    if(ix<0||iy<0||ix>=mosaic.width||iy>=mosaic.height)continue;
    const src=(iy*mosaic.width+ix)*4,dst=(row*SIZE+col)*4;
    out.data[dst]=pixels[src];out.data[dst+1]=pixels[src+1];
    out.data[dst+2]=pixels[src+2];out.data[dst+3]=pixels[src+3];
  }
  ctx.putImageData(out,0,0);
  return {imageDataUrl:image.toDataURL("image/png"),zoom,tiles:count};
}
