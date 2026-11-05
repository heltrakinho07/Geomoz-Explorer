/**
 * Explicitly licensed user-supplied XYZ tiles draped to the projected DEM.
 * NEVER bulk-downloads: at most 16 tiles, a single zoom, only on user action.
 * Public OSM, Esri and Google servers are deliberately disallowed for baking
 * mosaics (they remain available as live map backgrounds in MapLibre).
 */
import proj4 from "proj4";
import type { TerrainMeshData } from "../lib/geomoz-terrain-webgl";
import { terrainProjection, validTerrainGeography } from "./geomoz-terrain-tiles";

const MAX_TILES=16;
const SIZE=512;
const FORBIDDEN=/(^|\.)((?:tile|vector)\.openstreetmap\.org|arcgisonline\.com|google\.(?:com|cn)|googleapis\.com|virtualearth\.net|bing\.com)$/i;

export function validateTerrainXYZTemplate(raw:string):string{
  if(!raw.includes("{z}")||!raw.includes("{x}")||!raw.includes("{y}"))
    throw Error("O endereço XYZ deve conter {z}, {x} e {y}.");
  if(/[{}]/.test(raw.replace(/\{[zxy]\}/g,"")))
    throw Error("O endereço XYZ contém variáveis não suportadas.");
  const example=raw.replace(/\{z\}/g,"0").replace(/\{x\}/g,"0").replace(/\{y\}/g,"0");
  let uri:URL;
  try{uri=new URL(example);}catch{throw Error("Endereço XYZ inválido.");}
  if(uri.protocol!=="https:"||!uri.hostname||uri.username||uri.password)
    throw Error("O mapa-base XYZ necessita de HTTPS e de um endereço válido.");
  if(FORBIDDEN.test(uri.hostname)||uri.hostname==="localhost"||
    /^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(uri.hostname))
    throw Error("Este servidor não permite composição de tiles como textura. Utilize um XYZ com licença própria.");
  return raw;
}
function tileX(lon:number,n:number){return (lon+180)/360*n;}
function tileY(lat:number,n:number){
  const l=Math.max(-85.05,Math.min(85.05,lat))*Math.PI/180;
  return (1-Math.asinh(Math.tan(l))/Math.PI)*n/2;
}
function replaceXYZ(template:string,z:number,x:number,y:number){
  return template.replace(/\{z\}/g,String(z)).replace(/\{x\}/g,String(x)).replace(/\{y\}/g,String(y));
}
export interface TerrainXYZTexture {
  imageDataUrl:string;
  zoom:number;
  tileCount:number;
  coverage:number;
}
export async function createTerrainXYZDrape(
  terrain:TerrainMeshData,template:string,signal?:AbortSignal
):Promise<TerrainXYZTexture>{
  validateTerrainXYZTemplate(template);
  if(!validTerrainGeography(terrain))throw Error("O DEM necessita de CRS e limites válidos.");
  terrainProjection(terrain);
  const [left,bottom,right,top]=terrain.boundsMeters;
  const geographic:[number,number][]=[];
  for(let i=0;i<=8;i++)for(const [x,y] of [
    [left+(right-left)*i/8,bottom],[left+(right-left)*i/8,top],
    [left,bottom+(top-bottom)*i/8],[right,bottom+(top-bottom)*i/8]
  ] as [number,number][]){
    geographic.push(proj4(terrain.crs,"EPSG:4326",[x,y]) as [number,number]);
  }
  if(geographic.some(([lon,lat])=>!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>85))
    throw Error("O DEM está fora da área suportada por tiles XYZ/Web Mercator.");
  const west=Math.min(...geographic.map(p=>p[0])),east=Math.max(...geographic.map(p=>p[0]));
  const north=Math.max(...geographic.map(p=>p[1])),south=Math.min(...geographic.map(p=>p[1]));
  if(east-west>160)throw Error("Os limites do DEM atravessam o antimeridiano.");
  let zoom=14,range:{x0:number;x1:number;y0:number;y1:number}|null=null;
  while(zoom>=0){
    const n=2**zoom;
    const x0=Math.max(0,Math.min(n-1,Math.floor(tileX(west,n))));
    const x1=Math.max(0,Math.min(n-1,Math.floor(tileX(east,n))));
    const y0=Math.max(0,Math.min(n-1,Math.floor(tileY(north,n))));
    const y1=Math.max(0,Math.min(n-1,Math.floor(tileY(south,n))));
    if((x1-x0+1)*(y1-y0+1)<=MAX_TILES){range={x0,x1,y0,y1};break;}
    zoom--;
  }
  if(!range)throw Error("Extensão demasiado grande para composição XYZ.");
  const {x0,x1,y0,y1}=range,columns=x1-x0+1,rows=y1-y0+1;
  const tiles=new Map<string,Uint8ClampedArray>();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(signal?.aborted)throw new DOMException("Cancelado.","AbortError");
    const url=replaceXYZ(template,zoom,x,y);
    let response:Response;
    try{response=await fetch(url,{signal,mode:"cors",cache:"default"});}
    catch{throw Error("Falha de acesso/CORS na origem XYZ; confirme as permissões do fornecedor.");}
    if(!response.ok)throw Error("O fornecedor XYZ devolveu HTTP "+response.status+".");
    const type=response.headers.get("content-type")??"";
    if(!type.startsWith("image/"))throw Error("O fornecedor XYZ não devolveu imagens.");
    const bytes=await response.blob();
    if(bytes.size>1_000_000)throw Error("Tile XYZ demasiado grande (>1 MB).");
    let bmp:ImageBitmap;
    try{bmp=await createImageBitmap(bytes);}
    catch{throw Error("Não foi possível descodificar a imagem XYZ.");}
    const tile=document.createElement("canvas");tile.width=256;tile.height=256;
    const ctx=tile.getContext("2d",{willReadFrequently:true});
    if(!ctx){bmp.close();throw Error("Canvas não disponível.");}
    ctx.drawImage(bmp,0,0,256,256);bmp.close();
    tiles.set(x+","+y,ctx.getImageData(0,0,256,256).data);
  }
  const canvas=document.createElement("canvas");canvas.width=SIZE;canvas.height=SIZE;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas de composição indisponível.");
  const output=ctx.createImageData(SIZE,SIZE);let covered=0;
  const n=2**zoom;
  for(let row=0;row<SIZE;row++){
    if(row%64===0){
      if(signal?.aborted)throw new DOMException("Cancelado.","AbortError");
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    for(let col=0;col<SIZE;col++){
      const x=left+(col+0.5)/SIZE*(right-left),y=top-(row+0.5)/SIZE*(top-bottom);
      const [lon,lat]=proj4(terrain.crs,"EPSG:4326",[x,y]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      const tx=tileX(lon,n),ty=tileY(lat,n),ix=Math.floor(tx),iy=Math.floor(ty);
      const tile=tiles.get(ix+","+iy);if(!tile)continue;
      const sx=Math.min(255,Math.max(0,Math.floor((tx-ix)*256)));
      const sy=Math.min(255,Math.max(0,Math.floor((ty-iy)*256)));
      const inp=(sy*256+sx)*4,out=(row*SIZE+col)*4;
      output.data[out]=tile[inp];output.data[out+1]=tile[inp+1];
      output.data[out+2]=tile[inp+2];output.data[out+3]=tile[inp+3];
      if(tile[inp+3])covered++;
    }
  }
  ctx.putImageData(output,0,0);
  return {imageDataUrl:canvas.toDataURL("image/png"),zoom,
    tileCount:columns*rows,coverage:covered/(SIZE*SIZE)};
}
