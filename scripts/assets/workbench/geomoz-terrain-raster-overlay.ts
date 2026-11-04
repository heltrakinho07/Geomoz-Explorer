/** Browser GeoTIFF importer — raster reprojected and cropped to DEM footprint. */
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";
import {createCategoricalOverlay,ensureTerrainCrs,type TerrainOverlay} from "./geomoz-terrain-layers";

const MAX_BYTES=32*1024*1024;
const MAX_PIXELS=100_000_000;
function epsg(image: {getGeoKeys:()=>Record<string,unknown>}):string {
  const keys=image.getGeoKeys();
  const code=Number(keys.ProjectedCSTypeGeoKey??keys.GeographicTypeGeoKey);
  if(!Number.isInteger(code)||code<=0||code===32767)
    throw Error("O GeoTIFF deve declarar um CRS EPSG válido.");
  const crs="EPSG:"+code;
  ensureTerrainCrs(crs);
  return crs;
}
function numeric(v:unknown):number|null {
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function colourByte(data:number,lo:number,hi:number,isByte:boolean):number {
  return Math.max(0,Math.min(255,Math.round(isByte?data:
    (data-lo)/Math.max(1e-9,hi-lo)*255)));
}
export async function importTerrainRasterOverlay(
  bytes:ArrayBuffer,name:string,mesh:TerrainMeshData,id:string
):Promise<TerrainOverlay> {
  if(bytes.byteLength<1||bytes.byteLength>MAX_BYTES)
    throw Error("GeoTIFF de sobreposição: tamanho máximo 32 MB.");
  const tiff=await fromArrayBuffer(bytes);
  try {
    const image=await tiff.getImage();
    const rasterWidth=image.getWidth(),rasterHeight=image.getHeight();
    if(rasterWidth<2||rasterHeight<2||rasterWidth*rasterHeight>MAX_PIXELS)
      throw Error("Dimensões do GeoTIFF demasiado grandes.");
    const crs=epsg(image as unknown as {getGeoKeys:()=>Record<string,unknown>});
    ensureTerrainCrs(mesh.crs);
    const [sl,sb,sr,st]=image.getBoundingBox();
    if(![sl,sb,sr,st].every(Number.isFinite)||sl>=sr||sb>=st)
      throw Error("Extensão do raster inválida.");
    const [ml,mb,mr,mt]=mesh.boundsMeters;
    const width=mesh.width,height=mesh.height;
    // Inspect only a bounded downsample: the source may be a large COG.
    const sw=Math.min(512,rasterWidth),sh=Math.min(512,rasterHeight);
    const isRGB=image.getSamplesPerPixel()>=3;
    const samples=isRGB?[0,1,2]:[0];
    const source=await image.readRasters({samples,width:sw,height:sh,resampleMethod:"nearest"});
    const arrays=samples.map((_,i)=>source[i] as ArrayLike<number>);
    const ndValue=image.getGDALNoData();
    const nd=ndValue===null||ndValue===undefined?null:numeric(ndValue);
    const pixelData:Array<number|null>=[];
    const rgb=new Uint8ClampedArray(width*height*4);
    const rawRGB=[[],[],[]] as number[][];
    const positions:[number,number][]=[];
    for(let row=0;row<height;row++)for(let col=0;col<width;col++) {
      const x=ml+(mr-ml)*(col+.5)/width,y=mt-(mt-mb)*(row+.5)/height;
      const [px,py]=proj4(mesh.crs,crs,[x,y]) as [number,number];
      if(!Number.isFinite(px)||!Number.isFinite(py)||px<sl||px>sr||py<sb||py>st){
        pixelData.push(null);positions.push([-1,-1]);continue;
      }
      const cx=Math.min(sw-1,Math.floor((px-sl)/(sr-sl)*sw));
      const cy=Math.min(sh-1,Math.floor((st-py)/(st-sb)*sh));
      if(cx<0||cy<0){pixelData.push(null);positions.push([-1,-1]);continue;}
      const i=cy*sw+cx;
      const v=Number(arrays[0][i]);
      if(!Number.isFinite(v)||(nd!==null&&v===nd)){
        pixelData.push(null);positions.push([-1,-1]);continue;
      }
      const channelValid=!isRGB||arrays.every(a=>Number.isFinite(Number(a[i]))&&
        (nd===null||Number(a[i])!==nd));
      if(!channelValid){pixelData.push(null);positions.push([-1,-1]);continue;}
      pixelData.push(v);positions.push([cx,cy]);
      if(isRGB)for(let c=0;c<3;c++)rawRGB[c].push(Number(arrays[c][i]));
    }
    if(pixelData.every(x=>x===null))
      throw Error("O GeoTIFF não intersecta a extensão do modelo 3D.");
    if(!isRGB)return createCategoricalOverlay(name,pixelData,mesh,"file",id);
    const lows:number[]=[],highs:number[]=[];
    for(let c=0;c<3;c++){
      const values=rawRGB[c].sort((a,b)=>a-b);
      lows.push(values[Math.floor(values.length*.02)]??0);
      highs.push(values[Math.floor(values.length*.98)]??255);
    }
    const directory=image.getFileDirectory() as unknown as {BitsPerSample?:number[]};
    const isByte=directory.BitsPerSample?.[0]===8;
    for(let i=0;i<pixelData.length;i++){
      const [cx,cy]=positions[i];
      if(cx<0)continue;
      const offset=cy*sw+cx;
      for(let c=0;c<3;c++)
        rgb[i*4+c]=colourByte(Number(arrays[c][offset]),lows[c],highs[c],isByte);
      rgb[i*4+3]=255;
    }
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");
    if(!context)throw Error("Canvas de raster indisponível.");
    context.putImageData(new ImageData(rgb,width,height),0,0);
    return {id,name,kind:"imagery",source:"file",visible:true,opacity:.9,
      renderStyle:"single",singleColor:"#ffffff",categories:[],imageUrl:canvas.toDataURL("image/png"),
      credit:"RGB GeoTIFF · "+crs};
  }finally{await tiff.close();}
}
