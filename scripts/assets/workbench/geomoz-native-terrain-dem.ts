/**
 * Native GeoMoz browser terrain preview from an existing GIS Workspace raster.
 * No iframe, cross-origin messaging or duplicate file upload. GeoTIFF is
 * resampled in bounded browser memory and reprojected to metric UTM/WebMercator.
 * Pixel values are preview-only; NoData and non-finite elevations stay missing.
 */
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import type { TerrainMeshData } from "../../lib/geomoz-terrain-webgl";

const SAMPLE_SIZE=385;
const MESH_SIZE=193;
const MAX_SOURCE_PIXELS=100_000_000;

type XY=[number,number];

function definedCrs(code:string):string {
  if(!/^EPSG:\d{4,5}$/.test(code))throw Error("O GeoTIFF não declara um CRS EPSG válido.");
  if(!proj4.defs(code)) {
    const match=/^EPSG:(326|327)(\d{2})$/.exec(code);
    if(!match)throw Error("CRS ainda não suportado pelo Terrain Studio: "+code);
    const zone=Number(match[2]);
    if(zone<1||zone>60)throw Error("Zona UTM inválida: "+zone);
    proj4.defs(code,"+proj=utm +zone="+zone+
      (match[1]==="327"?" +south":"")+" +datum=WGS84 +units=m +no_defs");
  }
  return code;
}
function readProjection(keys:Record<string,unknown>):string {
  const numeric=Number(keys.ProjectedCSTypeGeoKey??keys.GeographicTypeGeoKey);
  if(!Number.isInteger(numeric)||numeric<=0||numeric===32767)
    throw Error("O raster não tem uma identificação EPSG utilizável.");
  return definedCrs("EPSG:"+numeric);
}
function reproj(from:string,to:string,p:XY):XY {
  const out=proj4(from,to,p) as XY;
  if(out.some(v=>!Number.isFinite(v)))throw Error("Falha na reprojecção do DEM.");
  return out;
}
function mappedBounds(source:string,target:string,bounds:number[]):number[] {
  const [l,b,r,t]=bounds;
  const xy:XY[]=[];
  for(let y=0;y<=4;y++)for(let x=0;x<=4;x++)
    xy.push(reproj(source,target,[l+(r-l)*x/4,b+(t-b)*y/4]));
  return [
    Math.min(...xy.map(p=>p[0])),Math.min(...xy.map(p=>p[1])),
    Math.max(...xy.map(p=>p[0])),Math.max(...xy.map(p=>p[1]))
  ];
}
function validateBounds(bounds:number[]):void {
  if(bounds.length!==4||bounds.some(v=>!Number.isFinite(v))||
    bounds[2]<=bounds[0]||bounds[3]<=bounds[1])
    throw Error("O GeoTIFF tem uma extensão geográfica inválida.");
}
function isValid(v:number,nodata:number|null):boolean {
  return Number.isFinite(v)&&(nodata===null||v!==nodata);
}
function interpolatedHeight(
  values:ArrayLike<number>,width:number,height:number,
  u:number,v:number,nodata:number|null
):number|null {
  if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||u>1||v>1)return null;
  const x=u*(width-1),y=v*(height-1);
  const ix=Math.min(width-1,Math.floor(x)),iy=Math.min(height-1,Math.floor(y));
  const ix1=Math.min(width-1,ix+1),iy1=Math.min(height-1,iy+1);
  const v00=Number(values[iy*width+ix]),v10=Number(values[iy*width+ix1]);
  const v01=Number(values[iy1*width+ix]),v11=Number(values[iy1*width+ix1]);
  if(![v00,v10,v01,v11].every(h=>isValid(h,nodata)))return null;
  const dx=x-ix,dy=y-iy;
  return v00*(1-dx)*(1-dy)+v10*dx*(1-dy)+v01*(1-dx)*dy+v11*dx*dy;
}

/** Decimate an existing GeoTIFF, reprojecting each preview sample to metric CRS. */
export async function geomozNativeTerrainPreview(bytes:ArrayBuffer,name:string):Promise<TerrainMeshData> {
  if(bytes.byteLength===0||bytes.byteLength>32*1024*1024)
    throw Error("Seleccione um DEM GeoTIFF até 32 MB.");
  const tiff=await fromArrayBuffer(bytes);
  try {
    const image=await tiff.getImage();
    const sourceWidth=image.getWidth(),sourceHeight=image.getHeight();
    if(sourceWidth<2||sourceHeight<2||sourceWidth*sourceHeight>MAX_SOURCE_PIXELS)
      throw Error("Dimensões do DEM inválidas ou demasiado grandes.");
    const sourceCrs=readProjection(image.getGeoKeys() as Record<string,unknown>);
    const sourceBounds=image.getBoundingBox() as number[];
    validateBounds(sourceBounds);
    const geoBounds=mappedBounds(sourceCrs,"EPSG:4326",sourceBounds);
    validateBounds(geoBounds);
    if(geoBounds[2]-geoBounds[0]>180)throw Error("Este DEM atravessa o antimeridiano.");
    const lon=(geoBounds[0]+geoBounds[2])/2;
    const lat=(geoBounds[1]+geoBounds[3])/2;
    const zone=Math.max(1,Math.min(60,Math.floor((lon+180)/6)+1));
    const metricCrs=definedCrs(lat>=-80&&lat<84?
      "EPSG:"+(lat>=0?32600+zone:32700+zone):"EPSG:3857");
    const boundsMeters=mappedBounds(sourceCrs,metricCrs,sourceBounds);
    validateBounds(boundsMeters);
    const sw=Math.min(sourceWidth,SAMPLE_SIZE),sh=Math.min(sourceHeight,SAMPLE_SIZE);
    const raster=await image.readRasters({
      samples:[0],width:sw,height:sh,resampleMethod:"nearest"
    });
    const samples=raster[0] as ArrayLike<number>;
    if(!samples||samples.length!==sw*sh)throw Error("Leitura da banda DEM incompleta.");
    const nd=image.getGDALNoData();
    const nodata=nd===null||nd===undefined?null:Number(nd);
    const [sl,sb,sr,st]=sourceBounds,[ml,mb,mr,mt]=boundsMeters;
    const heights:(number|null)[]=[];
    let min=Infinity,max=-Infinity,sum=0,n=0;
    for(let row=0;row<MESH_SIZE;row++)for(let col=0;col<MESH_SIZE;col++){
      const x=ml+(mr-ml)*col/(MESH_SIZE-1);
      const y=mt-(mt-mb)*row/(MESH_SIZE-1);
      const [sourceX,sourceY]=reproj(metricCrs,sourceCrs,[x,y]);
      const value=interpolatedHeight(samples,sw,sh,
        (sourceX-sl)/(sr-sl),(st-sourceY)/(st-sb),
        Number.isFinite(nodata as number)?nodata:null);
      if(value!==null){const rounded=Math.round(value*100)/100;
        heights.push(rounded);min=Math.min(min,rounded);max=Math.max(max,rounded);
        sum+=rounded;n++;
      }else heights.push(null);
    }
    if(n<3)throw Error("O DEM não contém células de elevação válidas na área seleccionada.");
    return {
      name,width:MESH_SIZE,height:MESH_SIZE,heights,
      bounds4326:geoBounds,boundsMeters,crs:metricCrs,sourceCrs,
      minElevation:min,maxElevation:max,meanElevation:sum/n,
      validFraction:n/heights.length,
      cellSizeMeters:[(mr-ml)/(MESH_SIZE-1),(mt-mb)/(MESH_SIZE-1)],
      sourceWidth,sourceHeight
    };
  } finally {await tiff.close();}
}
