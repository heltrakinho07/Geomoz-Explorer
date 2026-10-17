/** Windowed, overview-aware GeoTIFF rendering. Original analysis pixels stay intact. */
import { fromBlob, fromUrl } from "geotiff";
import type { GeoTIFF, GeoTIFFImage } from "geotiff";
import { loadGISLocalCogWasm } from "../lib/gis-local-geotiff";
import { invertPixel, rasterColor, rasterNoData, stretchValue } from "../lib/cesium-raster-style";
import type { Bounds, Transform, RasterStyle } from "../lib/cesium-raster-style";
interface Dataset {
  tiff: GeoTIFF; image: GeoTIFFImage; levels: GeoTIFFImage[];
  width: number; height: number; bands: number; epsg: number; gt: Transform;
  nodata: number | null; stats: Map<number, [number, number]>; bounds: Bounds;
}
const datasets = new Map<string, Dataset>();
const TILE = 256;
async function transform(epsg: number, target: number, xy: Float64Array): Promise<Float64Array> {
  if (epsg === target) return xy;
  const lib = await loadGISLocalCogWasm();
  return lib.transform_points_epsg(epsg, target, xy);
}
function affine(gt: Transform, x: number, y: number): [number, number] {
  return [gt[0] + x * gt[1] + y * gt[2], gt[3] + x * gt[4] + y * gt[5]];
}
async function open(key: string, source: File | string) {
  const tiff = typeof source === "string" ? await fromUrl(source, { allowFullFile: false, cacheSize: 128 }) : await fromBlob(source);
  try {
    const image = await tiff.getImage(), fd = image.getFileDirectory(), keys = image.getGeoKeys();
    const epsg = Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey);
    if (!Number.isInteger(epsg) || epsg <= 0 || epsg === 32767) throw new Error("O raster precisa de declarar um CRS EPSG válido.");
    const m = fd.getValue("ModelTransformation"), scale = fd.getValue("ModelPixelScale"), tie = fd.getValue("ModelTiepoint");
    let gt: Transform;
    if (m && m.length === 16 && m[12] === 0 && m[13] === 0 && m[15] === 1)
      gt = [m[3], m[0], m[1], m[7], m[4], m[5]];
    else if (scale && tie) gt = [tie[3] - tie[0] * scale[0], scale[0], 0, tie[4] + tie[1] * scale[1], 0, -scale[1]];
    else throw new Error("O GeoTIFF não contém georreferenciação válida.");
    if (Number(keys?.GTRasterTypeGeoKey) === 2) { gt[0] -= (gt[1] + gt[2]) / 2; gt[3] -= (gt[4] + gt[5]) / 2; }
    if (!gt.every(Number.isFinite)) throw new Error("A transformação da grelha contém valores inválidos.");
    invertPixel(gt, gt[0], gt[3]);
    const width = image.getWidth(), height = image.getHeight(), bands = image.getSamplesPerPixel();
    // Densify the boundary for projected grids; four corners are insufficient in curved projections.
    const boundary: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const f = i / 32;
      for (const [x,y] of [[f*width,0],[f*width,height],[0,f*height],[width,f*height]]) boundary.push(...affine(gt,x,y));
    }
    const ll = await transform(epsg,4326,Float64Array.from(boundary));
    const xs: number[] = [], ys: number[] = [];
    for (let i=0;i<ll.length;i+=2) {xs.push(ll[i]);ys.push(ll[i+1]);}
    const bounds: Bounds = [Math.max(-180,Math.min(...xs)),Math.max(-90,Math.min(...ys)),Math.min(180,Math.max(...xs)),Math.min(90,Math.max(...ys))];
    if (!bounds.every(Number.isFinite) || bounds[0]>=bounds[2] || bounds[1]>=bounds[3]) throw new Error("A extensão geográfica do raster é inválida.");
    const levels = [image], count = Math.min(32,await tiff.getImageCount());
    for (let i=1;i<count;i++) {
      const level=await tiff.getImage(i);
      if (level.getSamplesPerPixel()===bands && level.getWidth()<width && level.getHeight()<height) levels.push(level);
    }
    levels.sort((a,b)=>b.getWidth()-a.getWidth());
    const nodata = image.getGDALNoData();
    const dataset: Dataset = {tiff,image,levels,width,height,bands,epsg,gt,nodata,stats:new Map(),bounds};
    datasets.set(key,dataset);
    return {bounds,bandCount:bands};
  } catch(error) { await tiff.close(); throw error; }
}
async function range(d: Dataset, band: number): Promise<[number,number]> {
  const cached=d.stats.get(band); if(cached) return cached;
  const image=d.levels.at(-1)!;
  const data=await image.readRasters({samples:[band],width:Math.min(256,image.getWidth()),height:Math.min(256,image.getHeight()),interleave:true});
  let min=Infinity,max=-Infinity;
  for(let i=0;i<data.length;i++) {const v=Number(data[i]); if(!rasterNoData(v,d.nodata,"auto")){min=Math.min(min,v);max=Math.max(max,v);}}
  const result: [number,number] = Number.isFinite(min) ? [min,max] : [0,1];
  d.stats.set(band,result); return result;
}
async function render(key: string, bounds: Bounds, style: RasterStyle): Promise<Uint8ClampedArray> {
  const out=new Uint8ClampedArray(TILE*TILE*4),d=datasets.get(key);
  if(!d) throw new Error("O raster foi removido ou ainda não terminou de carregar.");
  const s=style.rasterState??{}, rgb=s.mode==="rgb";
  const bands=(s.bands?.length ? s.bands : rgb ? [1,2,3] : [1]).slice(0,rgb?3:1).map(b=>Math.max(0,Math.min(d.bands-1,b-1)));
  if(rgb) while(bands.length<3) bands.push(bands[bands.length-1]);
  const unique=[...new Set(bands)], ranges=await Promise.all(bands.map((b,i)=>s.rescale?.[i]??range(d,b)));
  const ll=new Float64Array(TILE*TILE*2); let k=0;
  for(let y=0;y<TILE;y++) for(let x=0;x<TILE;x++) {ll[k++]=bounds[0]+(x+0.5)/TILE*(bounds[2]-bounds[0]);ll[k++]=bounds[3]-(y+0.5)/TILE*(bounds[3]-bounds[1]);}
  const xy=await transform(4326,d.epsg,ll);
  const pixels=new Float64Array(xy.length);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let i=0;i<xy.length;i+=2) {
    const [x,y]=invertPixel(d.gt,xy[i],xy[i+1]); pixels[i]=x;pixels[i+1]=y;
    if(Number.isFinite(x)&&Number.isFinite(y)) { minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y); }
  }
  if(maxX<0||maxY<0||minX>=d.width||minY>=d.height||!Number.isFinite(minX)) return out;
  // Use the nearest finer overview, so zooming never magnifies a coarse preview.
  const target=Math.max(1,Math.min((maxX-minX)/TILE,(maxY-minY)/TILE));
  let image=d.image;
  for(const level of d.levels) if(d.width/level.getWidth()<=target) image=level;
  const sx=d.width/image.getWidth(), sy=d.height/image.getHeight();
  const left=Math.max(0,Math.floor(minX/sx)-1),top=Math.max(0,Math.floor(minY/sy)-1);
  const right=Math.min(image.getWidth(),Math.ceil(maxX/sx)+1),bottom=Math.min(image.getHeight(),Math.ceil(maxY/sy)+1);
  if(right<=left||bottom<=top) return out;
  const w=Math.min(512,right-left),h=Math.min(512,bottom-top);
  const raw=await image.readRasters({window:[left,top,right,bottom],width:w,height:h,samples:unique,interleave:true,resampleMethod:"nearest"});
  for(let i=0;i<TILE*TILE;i++) {
    const px=pixels[i*2],py=pixels[i*2+1];
    if(px<0||py<0||px>=d.width||py>=d.height||!Number.isFinite(px)||!Number.isFinite(py)) continue;
    const x=Math.floor((px/sx-left)/(right-left)*w),y=Math.floor((py/sy-top)/(bottom-top)*h);
    if(x<0||y<0||x>=w||y>=h) continue;
    const vals=bands.map(b=>Number(raw[(y*w+x)*unique.length+unique.indexOf(b)]));
    if(vals.some(v=>rasterNoData(v,d.nodata,s.nodata))) continue;
    const colors=rgb?vals.map((v,b)=>Math.round(255*stretchValue(v,ranges[b],s.stretch,s.gamma))):rasterColor(vals[0],ranges[0],style);
    out[i*4]=colors[0];out[i*4+1]=colors[1];out[i*4+2]=colors[2];out[i*4+3]=255;
  }
  return out;
}
interface Request {id:number;op:"open"|"render"|"close";key:string;source?:File|string;bounds?:Bounds;style?:RasterStyle}
let queue=Promise.resolve();
self.onmessage=(event: MessageEvent<Request>)=>{
  const m=event.data;
  queue=queue.then(async()=>{
    try {
      let result: unknown;
      if(m.op==="open") result=await open(m.key,m.source!);
      if(m.op==="render") result=await render(m.key,m.bounds!,m.style!);
      if(m.op==="close") {const d=datasets.get(m.key); datasets.delete(m.key); if(d) await d.tiff.close();}
      if(result instanceof Uint8ClampedArray) self.postMessage({id:m.id,result}, {transfer:[result.buffer]});
      else self.postMessage({id:m.id,result});
    }catch(error){self.postMessage({id:m.id,error:error instanceof Error?error.message:String(error)});}
  });
};
