/**
 * GIS Workspace → Terrain 3D draped vector overlays.
 *
 * GeoJSON from existing project layers and local files is rendered to an RGBA
 * orthographic texture, georeferenced to the current metric DEM extent.
 * Canvas bounds automatically clip all geometry to the DEM footprint. No fake
 * feature heights: the existing WebGL DEM supplies every draped elevation.
 */
import proj4 from "proj4";
import type { FeatureCollection, Geometry } from "geojson";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";

export type GeoMozOverlayMode="single"|"categorized";
export interface GeoMozTerrainOverlay {
  id:string;
  name:string;
  geojson:FeatureCollection;
  visible:boolean;
  opacity:number;
  mode:GeoMozOverlayMode;
  field:string;
  color:string;
  stroke:string;
  categories:Record<string,string>;
}
const MAX_FEATURES=8000;
const MAX_POINTS=350000;
const TILE_SIZE=1024;
const COLORS=["#0284c7","#16a34a","#f97316","#8b5cf6","#db2777","#eab308","#0891b2","#b45309"];
const validColor=(v:string,fallback:string)=>/^#[a-f\d]{6}$/i.test(v)?v:fallback;

export function validateOverlayGeoJSON(value:unknown):FeatureCollection {
  if(!value||typeof value!=="object"||(value as {type?:string}).type!=="FeatureCollection")
    throw Error("Seleccione um ficheiro GeoJSON FeatureCollection válido.");
  const geojson=value as FeatureCollection;
  if(!Array.isArray(geojson.features)||geojson.features.length>MAX_FEATURES)
    throw Error("O GeoJSON excede 8000 elementos. Recorte a camada no módulo Vector.");
  let coordinates=0;
  const walk=(value:unknown,depth:number):void=>{
    if(depth>8||!Array.isArray(value))throw Error("Coordenadas GeoJSON inválidas.");
    if(value.length>=2&&typeof value[0]==="number"){
      if(!Number.isFinite(value[0])||!Number.isFinite(value[1])||
         value[0]<-180||value[0]>180||value[1]<-90||value[1]>90)
        throw Error("As geometrias devem estar em WGS84 (longitude/latitude).");
      if(++coordinates>MAX_POINTS)throw Error("GeoJSON excede 350 000 vértices.");
      return;
    }
    for(const child of value)walk(child,depth+1);
  };
  for(const feature of geojson.features) {
    if(!feature||feature.type!=="Feature"||!feature.geometry)continue;
    const geometry=feature.geometry;
    if(geometry.type==="GeometryCollection"){
      throw Error("Converta GeometryCollection em geometrias simples no Vector.");
    }
    walk(geometry.coordinates,0);
  }
  return geojson;
}
export function overlayFields(geojson:FeatureCollection):string[] {
  const counts=new Set<string>();
  for(const f of geojson.features.slice(0,600))for(const key of Object.keys(f.properties??{}))
    if(typeof f.properties?.[key]==="string"||typeof f.properties?.[key]==="number")
      counts.add(key);
  return [...counts].sort((a,b)=>a.localeCompare(b)).slice(0,60);
}
export function overlayCategoryValues(geojson:FeatureCollection,field:string):string[]{
  const unique=new Set<string>();
  for(const feature of geojson.features) {
    const value=feature.properties?.[field];
    if(value!==null&&value!==undefined)unique.add(String(value));
  }
  // The layer is already bounded by the GeoJSON feature/vertex validation.
  return [...unique].sort((a,b)=>a.localeCompare(b));
}
export function defaultTerrainOverlay(
  id:string,name:string,geojson:FeatureCollection,opacity=0.8,
  color="#0284c7",stroke="#0f172a"
):GeoMozTerrainOverlay {
  const data=validateOverlayGeoJSON(geojson);
  const field=overlayFields(data)[0]??"";
  const categories:Record<string,string>={};
  if(field)try{
    overlayCategoryValues(data,field).forEach((value,i)=>{categories[value]=COLORS[i%COLORS.length];});
  }catch{/* Keep single symbol for high-cardinality fields. */}
  return {id,name,geojson:data,visible:true,opacity:Math.min(1,Math.max(0,opacity)),
    mode:"single",field,color:validColor(color,"#0284c7"),stroke:validColor(stroke,"#0f172a"),categories};
}

function pixelProject(terrain:TerrainMeshData,size:number,[lon,lat]:number[]):[number,number] {
  const {crs,boundsMeters:[left,bottom,right,top]}=terrain;
  let code=crs;
  if(/^EPSG:32[67]\d{2}$/.test(code)&&!proj4.defs(code)){
    const zone=Number(code.slice(-2));
    if(zone<1||zone>60)throw Error("Zona UTM do DEM inválida.");
    proj4.defs(code,"+proj=utm +zone="+zone+(code.startsWith("EPSG:327")?" +south":"")+" +datum=WGS84 +units=m +no_defs");
  }
  if(!proj4.defs(code))throw Error("A sobreposição não suporta este CRS: "+code);
  const [x,y]=proj4("EPSG:4326",code,[lon,lat]) as [number,number];
  return [(x-left)/(right-left)*size,(top-y)/(top-bottom)*size];
}
type Ring=number[][];
function pathLine(ctx:CanvasRenderingContext2D,terrain:TerrainMeshData,size:number,points:Ring,close=false){
  let started=false;
  for(const point of points){
    const [x,y]=pixelProject(terrain,size,point);
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
  }
  if(started&&close)ctx.closePath();
}
function drawGeometry(
  ctx:CanvasRenderingContext2D,terrain:TerrainMeshData,size:number,
  geometry:Geometry,fill:string,stroke:string
):void{
  const g=geometry;
  const polygon=(rings:number[][][])=>{
    if(!rings.length)return;
    ctx.beginPath();
    for(const ring of rings)pathLine(ctx,terrain,size,ring,true);
    ctx.fillStyle=fill;ctx.fill("evenodd");ctx.strokeStyle=stroke;ctx.lineWidth=1.25;ctx.stroke();
  };
  const line=(points:number[][])=>{
    ctx.beginPath();pathLine(ctx,terrain,size,points);ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();
  };
  const point=(p:number[])=>{
    const [x,y]=pixelProject(terrain,size,p);
    ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
    ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();
  };
  switch(g.type){
    case "Polygon":polygon(g.coordinates);break;
    case "MultiPolygon":g.coordinates.forEach(polygon);break;
    case "LineString":line(g.coordinates);break;
    case "MultiLineString":g.coordinates.forEach(line);break;
    case "Point":point(g.coordinates);break;
    case "MultiPoint":g.coordinates.forEach(point);break;
    default:break;
  }
}
/** Project a feature to the DEM texture; canvas itself clips to model footprint. */
export function drawTerrainOverlay(
  ctx:CanvasRenderingContext2D,terrain:TerrainMeshData,overlay:GeoMozTerrainOverlay,size:number
):number {
  if(!overlay.visible||overlay.opacity<=0)return 0;
  ctx.save();
  ctx.globalAlpha=Math.min(1,Math.max(0,overlay.opacity));
  let rendered=0;
  for(const f of overlay.geojson.features){
    if(!f.geometry)continue;
    const value=String(f.properties?.[overlay.field]??"");
    const fill=overlay.mode==="categorized"&&overlay.field
      ?overlay.categories[value]??overlay.color:overlay.color;
    drawGeometry(ctx,terrain,size,f.geometry,validColor(fill,overlay.color),overlay.stroke);
    rendered++;
  }
  ctx.restore();
  return rendered;
}
export function terrainOverlayTexture(terrain:TerrainMeshData,overlays:GeoMozTerrainOverlay[]):string|null {
  const visible=overlays.filter(o=>o.visible&&o.opacity>0);
  if(!visible.length)return null;
  const canvas=document.createElement("canvas");
  canvas.width=TILE_SIZE;canvas.height=TILE_SIZE;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Não foi possível gerar a textura SIG.");
  ctx.clearRect(0,0,TILE_SIZE,TILE_SIZE);
  for(const overlay of visible)drawTerrainOverlay(ctx,terrain,overlay,TILE_SIZE);
  return canvas.toDataURL("image/png");
}
