/**
 * GeoTIFF thematic raster drape on an existing projected DEM.
 *
 * Sample only a bounded 384² visual grid, reproject sample positions to source
 * CRS, preserve NoData and never fabricate values outside the raster footprint.
 * Categorical rasters use nearest-neighbour sampling; RGB stays image-valued.
 */
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";

export interface GeoMozRasterDrape {
  name:string;
  imageDataUrl:string;
  categories:{value:number;label:string;color:string}[];
  coverage:number;
  mode:"classified"|"rgb";
}
const SIZE=384;
const LIMIT=32*1024*1024;
const COLORS=["#006400","#ffbb22","#ffff4c","#f096ff","#fa0000",
  "#b4b4b4","#0064c8","#0096a0","#00cf75","#fae6a0","#d5c36b","#9d3706"];
const WORLD_COVER:Record<number,[string,string]>={
  10:["Floresta","#006400"],20:["Arbustos","#ffbb22"],30:["Pradarias","#ffff4c"],
  40:["Agricultura","#f096ff"],50:["Área construída","#fa0000"],
  60:["Solo exposto","#b4b4b4"],70:["Neve/gelo","#f0f0f0"],
  80:["Água","#0064c8"],90:["Zona húmida","#0096a0"],
  95:["Mangais","#00cf75"],100:["Musgos/líquenes","#fae6a0"]
};
const SOIL_PALETTE=["#d5c36b","#b96947","#9d3706","#ae868f","#f86714","#46d143",
  "#368f20","#3e5a14","#ffd557","#fff72e","#ff5a9d","#ff005b"];

function crsFromKeys(keys:Record<string,unknown>):string{
  const epsg=Number(keys.ProjectedCSTypeGeoKey??keys.GeographicTypeGeoKey);
  if(!Number.isInteger(epsg)||epsg===32767||epsg<1000||epsg>99999)
    throw Error("O raster tem de declarar um SRC EPSG WGS84/UTM válido.");
  const code="EPSG:"+epsg;
  if(!proj4.defs(code)){
    const match=/^EPSG:(326|327)(\d{2})$/.exec(code);
    if(!match)throw Error("Reprojecte este raster no GIS Workspace antes de o aplicar ao DEM.");
    const zone=Number(match[2]);if(zone<1||zone>60)throw Error("Zona UTM inválida.");
    proj4.defs(code,"+proj=utm +zone="+zone+
      (match[1]==="327"?" +south":"")+" +datum=WGS84 +units=m +no_defs");
  }
  return code;
}
function categoryColor(value:number,values:number[]):[string,string]{
  if(WORLD_COVER[value] && values.every(v=>WORLD_COVER[v]))return WORLD_COVER[value];
  if(values.every(v=>v>=1&&v<=12&&Number.isInteger(v)))
    return ["Textura "+value,SOIL_PALETTE[value-1]];
  return ["Classe "+value,COLORS[values.indexOf(value)%COLORS.length]];
}

/** Reproject and clip a categorical or true-colour georeferenced GeoTIFF. */
export async function createTerrainRasterDrape(
  bytes:ArrayBuffer,name:string,terrain:TerrainMeshData
):Promise<GeoMozRasterDrape>{
  if(!bytes.byteLength||bytes.byteLength>LIMIT)throw Error("GeoTIFF tem de ter até 32 MB.");
  const tiff=await fromArrayBuffer(bytes);
  try{
    const image=await tiff.getImage();
    const w=image.getWidth(),h=image.getHeight();
    if(w<2||h<2||w*h>100_000_000)throw Error("Raster demasiado grande.");
    // A GeoTIFF may use ModelTransformation rather than ModelPixelScale +
    // ModelTiepoint. The latter must not be a mandatory metadata pair.
    // Rotated/skewed transformations cannot be sampled with a simple bbox.
    const geoTags=image.fileDirectory as unknown as Record<string,unknown>;
    const transform=geoTags.ModelTransformation as ArrayLike<number>|undefined;
    if(transform && (Math.abs(Number(transform[1]))>1e-9 ||
      Math.abs(Number(transform[4]))>1e-9))
      throw Error("Reprojecte rasters inclinados para um GeoTIFF norte-acima.");
    const sourceCrs=crsFromKeys(image.getGeoKeys() as Record<string,unknown>);
    const bounds=image.getBoundingBox() as number[];
    if(bounds.length!==4||bounds.some(v=>!Number.isFinite(v))||
      bounds[2]<=bounds[0]||bounds[3]<=bounds[1])
      throw Error("Extensão geográfica do raster inválida.");
    const n=Math.min(1024,w),m=Math.min(1024,h);
    const rgb=image.getSamplesPerPixel()>=3;
    const bands=rgb?[0,1,2]:[0];
    const samples=await image.readRasters({samples:bands,width:n,height:m,resampleMethod:"nearest"});
    const channels=bands.map((_,i)=>samples[i] as ArrayLike<number>);
    const nodataRaw=image.getGDALNoData(),nodata=nodataRaw===null?null:Number(nodataRaw);
    const [left,bottom,right,top]=terrain.boundsMeters;
    const [sl,sb,sr,st]=bounds;
    const canvas=document.createElement("canvas");canvas.width=SIZE;canvas.height=SIZE;
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas raster indisponível.");
    const frame=ctx.createImageData(SIZE,SIZE);
    const classifiedValues=new Set<number>();
    let covered=0;
    const pixels:{pos:number;value:number}[]=[];
    const convert=(terrain.crs===sourceCrs)?([x,y]:[number,number])=>[x,y]:
      (p:[number,number])=>proj4(terrain.crs,sourceCrs,p) as [number,number];
    const idx=(col:number,row:number)=>row*n+col;
    for(let row=0;row<SIZE;row++)for(let col=0;col<SIZE;col++){
      const x=left+(col+0.5)/SIZE*(right-left);
      const y=top-(row+0.5)/SIZE*(top-bottom);
      const [px,py]=convert([x,y]);
      const u=(px-sl)/(sr-sl),v=(st-py)/(st-sb);
      if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>=1||v<0||v>=1)continue;
      const sx=Math.min(n-1,Math.floor(u*n)),sy=Math.min(m-1,Math.floor(v*m));
      const sample=idx(sx,sy);
      const values=channels.map(c=>Number(c[sample]));
      if(values.some(z=>!Number.isFinite(z)||z===nodata))continue;
      const out=(row*SIZE+col)*4;
      if(rgb){
        for(let i=0;i<3;i++)frame.data[out+i]=Math.max(0,Math.min(255,values[i]));
      }else{
        const v=Math.round(values[0]);
        if(classifiedValues.size>128)throw Error("O raster apresenta mais de 128 classes; utilize classificação no módulo Raster.");
        classifiedValues.add(v);
        pixels.push({pos:out,value:v});
      }
      frame.data[out+3]=255;
      covered++;
    }
    if(covered===0)throw Error("O GeoTIFF não se sobrepõe à extensão do DEM.");
    const values=[...classifiedValues].sort((a,b)=>a-b);
    for(const item of pixels){
      const color=categoryColor(item.value,values)[1];
      frame.data[item.pos]=parseInt(color.slice(1,3),16);
      frame.data[item.pos+1]=parseInt(color.slice(3,5),16);
      frame.data[item.pos+2]=parseInt(color.slice(5,7),16);
    }
    ctx.putImageData(frame,0,0);
    return {name,imageDataUrl:canvas.toDataURL("image/png"),mode:rgb?"rgb":"classified",
      coverage:covered/(SIZE*SIZE),
      categories:values.map(value=>{const [label,color]=categoryColor(value,values);return {value,label,color};})};
  }finally {await tiff.close();}
}
