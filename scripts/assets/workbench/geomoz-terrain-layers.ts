/**
 * GeoMoz 3D thematic layers, georeferenced to the DEM projected footprint.
 * All draping takes place on the user's machine. Sources are never mutated;
 * outside-footprint data are clipped by the canvas and NoData mesh triangles.
 */
import proj4 from "proj4";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";

export type TerrainLayerKind="vector"|"categories"|"imagery";
export type TerrainLayerStyle="categorized"|"single";
export interface TerrainCategory {value:string;color:string;label:string;enabled:boolean}
export interface TerrainOverlay {
  id:string;name:string;kind:TerrainLayerKind;source:"project"|"file"|"gee";
  visible:boolean;opacity:number;renderStyle:TerrainLayerStyle;
  field?:string;singleColor:string;categories:TerrainCategory[];
  data?:FeatureCollection;values?:(number|null)[];imageUrl?:string;
  credit?:string;
}
const PALETTE=["#2563eb","#dc2626","#16a34a","#f59e0b","#9333ea","#0e7490",
  "#d97706","#be185d","#4d7c0f","#64748b","#7c3aed","#0284c7"];
export const WORLD_COVER_CLASSES: TerrainCategory[]=[
  ["10","#006400","Árvores"],["20","#ffbb22","Arbustos"],["30","#ffff4c","Prados"],
  ["40","#f096ff","Culturas"],["50","#fa0000","Áreas construídas"],
  ["60","#b4b4b4","Vegetação escassa"],["70","#f0f0f0","Neve e gelo"],
  ["80","#0064c8","Água permanente"],["90","#0096a0","Zonas húmidas"],
  ["95","#00cf75","Mangais"],["100","#fae6a0","Musgos e líquenes"],
].map(([value,color,label])=>({value,color,label,enabled:true}));

export function ensureTerrainCrs(crs:string):void {
  if(proj4.defs(crs))return;
  const m=/^EPSG:(326|327)(\d{2})$/.exec(crs);
  if(!m||Number(m[2])<1||Number(m[2])>60)throw Error("CRS não suportado: "+crs);
  proj4.defs(crs,"+proj=utm +zone="+Number(m[2])+
    (m[1]==="327"?" +south":"")+" +datum=WGS84 +units=m +no_defs");
}
export function xyFromLonLat(mesh:TerrainMeshData,lon:number,lat:number):[number,number] {
  ensureTerrainCrs(mesh.crs);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)
    throw Error("Coordenadas geográficas inválidas.");
  const [x,y]=proj4("EPSG:4326",mesh.crs,[lon,lat]) as [number,number];
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error("A transformação espacial falhou.");
  return [x,y];
}
export function texturePixel(mesh:TerrainMeshData,lon:number,lat:number,w:number,h:number):[number,number] {
  const [x,y]=xyFromLonLat(mesh,lon,lat);
  const [left,bottom,right,top]=mesh.boundsMeters;
  return [(x-left)/(right-left)*w,(top-y)/(top-bottom)*h];
}
function isPolygon(feature:FeatureCollection["features"][number]):feature is
  FeatureCollection["features"][number]&{geometry:Polygon|MultiPolygon} {
  return feature.geometry?.type==="Polygon"||feature.geometry?.type==="MultiPolygon";
}
export function validateTerrainGeoJSON(input:unknown):FeatureCollection {
  if(!input||typeof input!=="object"||(input as {type?:unknown}).type!=="FeatureCollection")
    throw Error("Seleccione um ficheiro GeoJSON com FeatureCollection.");
  const value=input as FeatureCollection;
  if(!Array.isArray(value.features)||value.features.length===0||value.features.length>5000)
    throw Error("O GeoJSON deve ter entre 1 e 5000 feições.");
  let vertices=0,polygons=0;
  for(const feature of value.features){
    if(!feature||feature.type!=="Feature"||!isPolygon(feature))continue;
    const polygonParts=feature.geometry.type==="Polygon"?
      [feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const rings of polygonParts)for(const ring of rings){
      vertices+=ring.length;
      if(ring.length<4)throw Error("Anel de polígono inválido.");
      for(const xy of ring){
        if(!Array.isArray(xy)||xy.length<2||!Number.isFinite(xy[0])||
          !Number.isFinite(xy[1])||Math.abs(xy[0])>180||Math.abs(xy[1])>90)
          throw Error("O GeoJSON deve ter coordenadas WGS84 [longitude, latitude].");
      }
    }
    polygons++;
    if(vertices>180000)throw Error("GeoJSON demasiado detalhado. Simplifique os polígonos.");
  }
  if(!polygons)throw Error("Esta vista 3D suporta polígonos. Converta linhas/pontos em camada de polígonos.");
  return {type:"FeatureCollection",features:value.features.filter(isPolygon)};
}
export function terrainCategoryFields(collection:FeatureCollection):string[] {
  const count=new Map<string,Set<string>>();
  for(const feature of collection.features.slice(0,5000)){
    for(const [key,value] of Object.entries(feature.properties??{})){
      if(value===null||typeof value==="object")continue;
      if(!count.has(key))count.set(key,new Set());
      const values=count.get(key)!;
      if(values.size<100)values.add(String(value));
    }
  }
  return [...count.entries()].filter(([,values])=>values.size>0 && values.size<=60)
    .sort((a,b)=>a[1].size-b[1].size).map(([key])=>key);
}
export function terrainCategories(collection:FeatureCollection,field:string):TerrainCategory[] {
  const values=[...new Set(collection.features.map(f=>String(f.properties?.[field]??"Sem classe")))]
    .sort((a,b)=>a.localeCompare(b,"pt",{numeric:true}));
  if(values.length>100)throw Error("O campo contém demasiadas categorias para este visualizador.");
  return values.map((label,i)=>({value:label,label,color:PALETTE[i%PALETTE.length],enabled:true}));
}
export function createPolygonOverlay(name:string,geojson:unknown,source:"project"|"file",id:string):TerrainOverlay {
  const data=validateTerrainGeoJSON(geojson);
  const field=terrainCategoryFields(data)[0];
  return {id,name,kind:"vector",source,visible:true,opacity:.8,renderStyle:"categorized",
    singleColor:"#2a9d8f",field,categories:field?terrainCategories(data,field):[],
    data};
}
export function createCategoricalOverlay(name:string,values:(number|null)[],mesh:TerrainMeshData,
  source:"file"|"gee",id:string,legend?:TerrainCategory[]):TerrainOverlay {
  if(values.length!==mesh.width*mesh.height||values.some(v=>v!==null&&!Number.isFinite(v)))
    throw Error("O raster tem uma grelha diferente do DEM.");
  const unique=[...new Set(values.filter((v):v is number=>v!==null))].sort((a,b)=>a-b);
  if(unique.length===0||unique.length>100)
    throw Error("O raster não é uma camada temática categórica (1–100 classes).");
  const known=new Map((legend??[]).map(c=>[c.value,c]));
  const categories=unique.map((v,i)=>known.get(String(v))??
    {value:String(v),label:"Classe "+v,color:PALETTE[i%PALETTE.length],enabled:true});
  return {id,name,kind:"categories",source,visible:true,opacity:.8,renderStyle:"categorized",
    singleColor:"#0891b2",categories,values};
}
export function generateOverlayId():string {
  return typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():
    "overlay-"+Math.random().toString(36).slice(2);
}
function drawVectorLayer(ctx:CanvasRenderingContext2D,mesh:TerrainMeshData,layer:TerrainOverlay,
  width:number,height:number):void {
  if(!layer.data)return;
  const categories=new Map(layer.categories.map(c=>[c.value,c]));
  for(const feature of layer.data.features){
    if(!isPolygon(feature))continue;
    const value=String(feature.properties?.[layer.field??""]??"Sem classe");
    const category=categories.get(value);
    if(layer.renderStyle==="categorized" && (!category||!category.enabled))continue;
    const color=layer.renderStyle==="single"?layer.singleColor:category?.color??layer.singleColor;
    const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates]:
      feature.geometry.coordinates;
    for(const rings of polygons){
      const path=new Path2D();
      for(const ring of rings){
        let started=false;
        for(const coord of ring){
          const [x,y]=texturePixel(mesh,coord[0],coord[1],width,height);
          if(!started){path.moveTo(x,y);started=true;}else path.lineTo(x,y);
        }
        if(started)path.closePath();
      }
      ctx.fillStyle=color;
      ctx.fill(path,"evenodd");
      ctx.strokeStyle="#111827";
      ctx.lineWidth=Math.max(0.35,width/2048);
      ctx.stroke(path);
    }
  }
}
function drawCategories(ctx:CanvasRenderingContext2D,mesh:TerrainMeshData,layer:TerrainOverlay) {
  if(!layer.values)return;
  const {width,height}=mesh;
  const raw=document.createElement("canvas");raw.width=width;raw.height=height;
  const src=raw.getContext("2d");
  if(!src)throw Error("Canvas de textura indisponível.");
  const pixels=src.createImageData(width,height);
  const categories=new Map(layer.categories.map(c=>[c.value,c]));
  for(let i=0;i<layer.values.length;i++){
    const v=layer.values[i], category=categories.get(String(v));
    if(v===null || (layer.renderStyle==="categorized"&&(!category||!category.enabled)))continue;
    const color=layer.renderStyle==="single"?layer.singleColor:category?.color??layer.singleColor;
    const m=/^#([0-9a-f]{6})$/i.exec(color);
    if(!m)continue;
    const n=parseInt(m[1],16);
    pixels.data.set([(n>>16)&255,(n>>8)&255,n&255,255],i*4);
  }
  src.putImageData(pixels,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(raw,0,0,ctx.canvas.width,ctx.canvas.height);
}
async function drawImagery(ctx:CanvasRenderingContext2D,layer:TerrainOverlay) {
  if(!layer.imageUrl||!(/^(data:image\/(png|jpeg);base64,|blob:)/.test(layer.imageUrl)))
    throw Error("Textura de imagem sem origem local autorizada.");
  const img=new Image();
  img.src=layer.imageUrl;
  await img.decode();
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(img,0,0,ctx.canvas.width,ctx.canvas.height);
}
/** Returns an RGBA PNG, composited bottom→top, mapped to the exact DEM grid. */
export async function composeTerrainTexture(
  mesh:TerrainMeshData,layers:readonly TerrainOverlay[],size=768
):Promise<string|null> {
  const visible=layers.filter(l=>l.visible&&l.opacity>0);
  if(!visible.length)return null;
  if(!Number.isFinite(size)||size<64||size>2048)throw Error("Dimensões de textura inválidas.");
  const [left,bottom,right,top]=mesh.boundsMeters;
  const ratio=(top-bottom)/(right-left);
  const w=Math.max(64,Math.min(2048,Math.round(size)));
  const h=Math.max(64,Math.min(2048,Math.round(w*ratio)));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("Não foi possível criar a composição de camadas.");
  for(const layer of visible){
    ctx.save();
    try{
      ctx.globalAlpha=Math.min(1,Math.max(0,layer.opacity));
      if(layer.kind==="vector")drawVectorLayer(ctx,mesh,layer,w,h);
      else if(layer.kind==="categories")drawCategories(ctx,mesh,layer);
      else await drawImagery(ctx,layer);
    }finally{ctx.restore();}
  }
  return canvas.toDataURL("image/png");
}

export interface TerrainLayerIdentify {layer:string;value:string;properties?:Record<string,unknown>}
function inRing(ring:number[][],lon:number,lat:number):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if((yi>lat)!==(yj>lat) &&
      lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function featureContains(
  feature:FeatureCollection["features"][number],lon:number,lat:number
):boolean {
  if(!isPolygon(feature))return false;
  const polygons=feature.geometry.type==="Polygon"?
    [feature.geometry.coordinates]:feature.geometry.coordinates;
  for(const rings of polygons){
    if(!rings.length||!inRing(rings[0],lon,lat))continue;
    if(!rings.slice(1).some(hole=>inRing(hole,lon,lat)))return true;
  }
  return false;
}
export function identifyTerrainOverlayAt(
  mesh:TerrainMeshData,layers:readonly TerrainOverlay[],lon:number,lat:number
):TerrainLayerIdentify[] {
  const [x,y]=xyFromLonLat(mesh,lon,lat);
  const [left,bottom,right,top]=mesh.boundsMeters;
  if(x<left||x>right||y<bottom||y>top)return [];
  const col=Math.min(mesh.width-1,Math.floor((x-left)/(right-left)*mesh.width));
  const row=Math.min(mesh.height-1,Math.floor((top-y)/(top-bottom)*mesh.height));
  const result:TerrainLayerIdentify[]=[];
  for(const layer of [...layers].reverse()){
    if(!layer.visible||layer.opacity<=0)continue;
    if(layer.kind==="categories"&&layer.values){
      const v=layer.values[row*mesh.width+col];
      const cat=layer.categories.find(c=>c.value===String(v));
      if(v!==null&&(layer.renderStyle==="single"||cat?.enabled))
        result.push({layer:layer.name,value:cat?.label??"Classe "+String(v)});
    }else if(layer.kind==="vector"&&layer.data){
      const match=layer.data.features.find(f=>featureContains(f,lon,lat));
      if(match){
        const raw=String(match.properties?.[layer.field??""]??"Feição vectorial");
        const cat=layer.categories.find(c=>c.value===raw);
        if(layer.renderStyle==="single"||cat?.enabled)
          result.push({layer:layer.name,value:cat?.label??raw,
            properties:(match.properties??{}) as Record<string,unknown>});
      }
    }else if(layer.kind==="imagery"){
      result.push({layer:layer.name,value:"Imagem RGB"});
    }
  }
  return result;
}
