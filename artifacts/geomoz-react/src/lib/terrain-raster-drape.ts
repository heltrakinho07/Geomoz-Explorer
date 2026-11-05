/**
 * GeoTIFF thematic raster drape on an existing projected DEM.
 *
 * Sample only a bounded 384² visual grid, reproject sample positions to source
 * CRS, preserve NoData and never fabricate values outside the raster footprint.
 * Categorical rasters use nearest-neighbour sampling; RGB stays image-valued.
 */
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import type { TerrainMeshData } from "@/lib/terrain-webgl";

export interface GeoMozRasterDrape {
  name:string;
  imageDataUrl:string;
  categories:{value:number;label:string;color:string}[];
  coverage:number;
  mode:"classified"|"continuous"|"rgb";
  range?:{min:number;max:number};
  palette?:"ndvi"|"ndwi"|"terrain";
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


const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
/** Colour ramps work on the original numeric value; the scientific grid is untouched. */
export function continuousRasterColor(value:number,min:number,max:number,palette:"ndvi"|"ndwi"|"terrain"="ndvi"):[number,number,number]{
  const t=clamp((value-min)/Math.max(max-min,1e-10));
  const ramps:Record<typeof palette,number[][]>={
    ndvi:[[143,68,40],[224,182,85],[247,246,174],[104,181,97],[5,97,51]],
    ndwi:[[150,92,45],[229,207,143],[243,243,235],[112,188,216],[19,86,155]],
    terrain:[[55,109,68],[159,195,104],[227,204,139],[177,136,102],[242,239,223]],
  };
  const stops=ramps[palette],part=t*(stops.length-1);
  const i=Math.min(stops.length-2,Math.floor(part)),f=part-i;
  return [0,1,2].map(k=>Math.round(lerp(stops[i][k],stops[i+1][k],f))) as [number,number,number];
}

/**
 * GeoTIFF.js v3 exposes TIFF metadata through ImageFileDirectory.getValue().
 * Older readers expose properties directly. Both forms must work: a missing
 * direct property does not mean the raster has no georeferencing.
 */
async function getTiffTag(directory:unknown,key:string):Promise<unknown>{
  const tags=directory as Record<string,unknown>&{
    getValue?:(name:string)=>unknown;
    loadValue?:(name:string)=>Promise<unknown>;
  };
  if(typeof tags.getValue==="function"){
    try {
      const value=tags.getValue(key);
      if(value!==undefined&&value!==null)return value;
    }catch {
      // Some tags are deferred in GeoTIFF.js 3. Fall through to loadValue().
    }
    if(typeof tags.loadValue==="function"){
      try{
        const value=await tags.loadValue(key);
        if(value!==undefined&&value!==null)return value;
      }catch {
        // Tag absent; try the older fileDirectory property representation.
      }
    }
  }
  return tags[key];
}

/** Progress reports the proportion of the 384-row alignment actually completed. */
export interface TerrainRasterDrapeOptions {
  signal?:AbortSignal;
  onProgress?:(fraction:number)=>void;
  renderer?:"auto"|"classified"|"continuous"|"rgb";
  palette?:"ndvi"|"ndwi"|"terrain";
}
function verifyActive(signal?:AbortSignal){
  if(signal?.aborted)throw new DOMException("Importação do raster cancelada.","AbortError");
}
/** Reproject and clip a categorical or true-colour georeferenced GeoTIFF. */
export async function createTerrainRasterDrape(
  bytes:ArrayBuffer,name:string,terrain:TerrainMeshData,
  options:TerrainRasterDrapeOptions={}
):Promise<GeoMozRasterDrape>{
  verifyActive(options.signal);
  if(!bytes.byteLength||bytes.byteLength>LIMIT)throw Error("GeoTIFF tem de ter até 32 MB.");
  const tiff=await fromArrayBuffer(bytes);
  try{
    const image=await tiff.getImage();
    verifyActive(options.signal);
    const w=image.getWidth(),h=image.getHeight();
    if(w<2||h<2||w*h>100_000_000)throw Error("Raster demasiado grande.");
    const geoTags=image.fileDirectory;
    const [scale,tiepoint,transform]=await Promise.all([
      getTiffTag(geoTags,"ModelPixelScale"),
      getTiffTag(geoTags,"ModelTiepoint"),
      getTiffTag(geoTags,"ModelTransformation"),
    ]);
    // A north-up image can legitimately use either Scale+Tiepoint or an
    // affine ModelTransformation matrix. Reject genuinely rotated grids:
    // axis-aligned bounds alone cannot correctly sample their pixels.
    if(!transform&&(!scale||!tiepoint))
      throw Error("O GeoTIFF não contém uma georreferenciação utilizável.");
    if(transform){
      const matrix=transform as ArrayLike<number>;
      if(matrix.length!==16||!Number.isFinite(Number(matrix[1]))||
        !Number.isFinite(Number(matrix[4]))||
        Math.abs(Number(matrix[1]))>1e-10||Math.abs(Number(matrix[4]))>1e-10)
        throw Error("Reprojecte rasters inclinados para um GeoTIFF norte-acima.");
    }
    const resolution=image.getResolution();
    if(!Number.isFinite(resolution[0])||!Number.isFinite(resolution[1])||
      resolution[0]<=0||resolution[1]>=0)
      throw Error("Reprojecte rasters inclinados para um GeoTIFF norte-acima.");
    const sourceCrs=crsFromKeys(image.getGeoKeys() as Record<string,unknown>);
    const bounds=image.getBoundingBox() as number[];
    if(bounds.length!==4||bounds.some(v=>!Number.isFinite(v))||
      bounds[2]<=bounds[0]||bounds[3]<=bounds[1])
      throw Error("Extensão geográfica do raster inválida.");
    const n=Math.min(1024,w),m=Math.min(1024,h);
    const rgb=options.renderer==="rgb" || (options.renderer!=="classified"&&
      options.renderer!=="continuous"&&image.getSamplesPerPixel()>=3);
    if(rgb&&image.getSamplesPerPixel()<3)throw Error("Esta imagem não possui três bandas RGB.");
    const bands=rgb?[0,1,2]:[0];
    const samples=await image.readRasters({samples:bands,width:n,height:m,resampleMethod:"nearest"});
    verifyActive(options.signal);
    const channels=bands.map((_,i)=>samples[i] as ArrayLike<number>);
    const nodataRaw=image.getGDALNoData(),nodata=nodataRaw===null?null:Number(nodataRaw);
    const [left,bottom,right,top]=terrain.boundsMeters;
    const [sl,sb,sr,st]=bounds;
    const canvas=document.createElement("canvas");canvas.width=SIZE;canvas.height=SIZE;
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas raster indisponível.");
    const frame=ctx.createImageData(SIZE,SIZE);
    const classifiedValues=new Set<number>();
    const continuousSamples:{pos:number;value:number}[]=[];
    let minSample=Infinity,maxSample=-Infinity;
    const autoContinuous=options.renderer==="auto"||options.renderer===undefined;
    let observedFraction=false;
    let covered=0;
    const pixels:{pos:number;value:number}[]=[];
    const convert=(terrain.crs===sourceCrs)?([x,y]:[number,number])=>[x,y]:
      (p:[number,number])=>proj4(terrain.crs,sourceCrs,p) as [number,number];
    const idx=(col:number,row:number)=>row*n+col;
    for(let row=0;row<SIZE;row++){
      // Yield periodically so the browser can render progress and process Cancel.
      if(row%48===0){
        verifyActive(options.signal);
        options.onProgress?.(row/SIZE);
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        verifyActive(options.signal);
      }
      for(let col=0;col<SIZE;col++){
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
        const value=values[0];
        if(!Number.isInteger(value))observedFraction=true;
        minSample=Math.min(minSample,value);maxSample=Math.max(maxSample,value);
        continuousSamples.push({pos:out,value});
        if(options.renderer==="classified"||autoContinuous){
          const category=Math.round(value);
          if(classifiedValues.size<4096)classifiedValues.add(category);
          pixels.push({pos:out,value:category});
        }
      }
      frame.data[out+3]=255;
      covered++;
      }
    }
    verifyActive(options.signal);
    options.onProgress?.(1);
    if(covered===0)throw Error("O GeoTIFF não se sobrepõe à extensão do DEM.");
    const continuous=!rgb&&(options.renderer==="continuous"||
      (autoContinuous&&(observedFraction||classifiedValues.size>128)));
    // NDVI/NDWI in float form keep their entire numeric range, including negative values.
    // Values scaled as integers require the explicit "continuous" renderer in the UI.
    const values=continuous?[]:[...classifiedValues].sort((a,b)=>a-b);
    if(continuous){
      const min=Number.isFinite(minSample)?minSample:0;
      const max=Number.isFinite(maxSample)?maxSample:1;
      const palette=options.palette??"ndvi";
      for(const item of continuousSamples){
        const colour=continuousRasterColor(item.value,min,max,palette);
        frame.data[item.pos]=colour[0];frame.data[item.pos+1]=colour[1];
        frame.data[item.pos+2]=colour[2];
      }
    }else{
      for(const item of pixels){
        const color=categoryColor(item.value,values)[1];
        frame.data[item.pos]=parseInt(color.slice(1,3),16);
        frame.data[item.pos+1]=parseInt(color.slice(3,5),16);
        frame.data[item.pos+2]=parseInt(color.slice(5,7),16);
      }
    }
    verifyActive(options.signal);
    ctx.putImageData(frame,0,0);
    verifyActive(options.signal);
    return {name,imageDataUrl:canvas.toDataURL("image/png"),mode:rgb?"rgb":continuous?"continuous":"classified",
      coverage:covered/(SIZE*SIZE),
      range:continuous?{min:minSample,max:maxSample}:undefined,
      palette:continuous?options.palette??"ndvi":undefined,
      categories:values.map(value=>{const [label,color]=categoryColor(value,values);return {value,label,color};})};
  }finally {await tiff.close();}
}
