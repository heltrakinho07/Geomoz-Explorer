import type { ImageryProvider, TilingScheme } from "cesium";
import type { CesiumSDK } from "./cesium-sdk";
import type { Bounds, RasterStyle } from "./cesium-raster-style";
import type { GISWorkspaceServiceLayer } from "./gis-data-sources";
import { PMTiles, TileType } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";

export class RasterWorkerClient {
  private worker = new Worker(new URL("../workers/cesium-raster.worker.ts", import.meta.url), {type:"module"});
  private next = 0;
  private stopped = false;
  private pending = new Map<number, {resolve:(value:unknown)=>void; reject:(error:Error)=>void}>();
  get busy() { return this.pending.size >= 6; }
  constructor() {
    this.worker.onmessage = event => {
      const m=event.data, task=this.pending.get(m.id); if(!task) return;
      this.pending.delete(m.id);
      if(m.error) task.reject(new Error(m.error)); else task.resolve(m.result);
    };
    this.worker.onerror = () => this.stop(new Error("Falha no motor de leitura raster. Volte a abrir o Workspace."));
  }
  request<T>(op:string,key:string,extra:Record<string,unknown>={}):Promise<T> {
    if(this.stopped) return Promise.reject(new Error("O motor raster foi encerrado."));
    const id=++this.next;
    return new Promise<T>((resolve,reject)=>{
      this.pending.set(id,{resolve: value=>resolve(value as T),reject});
      this.worker.postMessage({id,op,key,...extra});
    });
  }
  stop(error=new Error("O Workspace foi encerrado.")) {
    this.stopped=true;this.worker.terminate();
    for(const task of this.pending.values()) task.reject(error);
    this.pending.clear();
  }
}
export function tileCanvas():HTMLCanvasElement {
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;return canvas;
}
function provider(C:CesiumSDK, scheme:TilingScheme, bounds:Bounds, max:number, credit:string,
  request:(x:number,y:number,z:number)=>Promise<HTMLCanvasElement|ImageBitmap>|undefined):ImageryProvider {
  const rectangle=C.Rectangle.fromDegrees(...bounds);
  return {
    tileWidth:256,tileHeight:256,minimumLevel:0,maximumLevel:max,
    tilingScheme:scheme,rectangle,tileDiscardPolicy:undefined,
    errorEvent:new C.Event(),credit:credit?new C.Credit(credit):undefined,
    hasAlphaChannel:true,proxy:undefined,
    getTileCredits:()=>undefined,pickFeatures:()=>undefined,requestImage:request,
  } as unknown as ImageryProvider;
}
export function rasterProvider(C:CesiumSDK,client:RasterWorkerClient,key:string,bounds:Bounds,style:RasterStyle,
  rendered:()=>void,onError:(message:string)=>void,active:()=>boolean):ImageryProvider {
  const scheme=new C.GeographicTilingScheme();
  let reported=false;
  return provider(C,scheme,bounds,22,"",(x,y,z)=>{
    if(!active()) return Promise.resolve(tileCanvas());
    if(client.busy) return undefined; // Cesium retries throttled tiles on the next frame.
    const rect=scheme.tileXYToRectangle(x,y,z);
    const b:Bounds=[C.Math.toDegrees(rect.west),C.Math.toDegrees(rect.south),C.Math.toDegrees(rect.east),C.Math.toDegrees(rect.north)];
    return client.request<Uint8ClampedArray>("render",key,{bounds:b,style}).then(rgba=>{
      const canvas=tileCanvas();
      canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba),256,256),0,0);
      if(active()) rendered(); return canvas;
    }).catch(error=>{
      if(active()&&!reported){reported=true;onError(error.message);} throw error;
    });
  });
}
interface TileFeature {type:number;extent:number;loadGeometry():Array<Array<{x:number;y:number}>>}
interface TileLayer {length:number;feature(index:number):TileFeature}
export function paintVectorTile(layers:Record<string,TileLayer>,sourceLayers?:string[]):HTMLCanvasElement {
  const canvas=tileCanvas(),ctx=canvas.getContext("2d")!;
  ctx.strokeStyle="#2563eb";ctx.fillStyle="rgba(37,99,235,0.22)";ctx.lineWidth=1.6;
  for(const [name,layer] of Object.entries(layers)) {
    if(sourceLayers?.length&&!sourceLayers.includes(name)) continue;
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i), scale=256/f.extent;ctx.beginPath();
      for(const ring of f.loadGeometry()) {
        ring.forEach((p,j)=>{
          const x=p.x*scale,y=p.y*scale;
          if(f.type===1){ctx.moveTo(x+3,y);ctx.arc(x,y,3,0,Math.PI*2);}
          else if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        });
        if(f.type===3)ctx.closePath();
      }
      if(f.type===3)ctx.fill("evenodd");
      if(f.type===1){ctx.save();ctx.fillStyle="#2563eb";ctx.fill();ctx.restore();}
      else ctx.stroke();
    }
  }
  return canvas;
}
export async function serviceProvider(C:CesiumSDK,layer:GISWorkspaceServiceLayer):Promise<ImageryProvider> {
  if(!layer.type.startsWith("pmtiles")) {
    const url=layer.tileUrl.replaceAll("{-y}","{reverseY}")
      .replaceAll("{bbox-epsg-3857}","{westProjected},{southProjected},{eastProjected},{northProjected}");
    return new C.UrlTemplateImageryProvider({
      url,tilingScheme:new C.WebMercatorTilingScheme(),tileWidth:layer.tileSize,tileHeight:layer.tileSize,
      minimumLevel:0,maximumLevel:layer.maxZoom??22,
      credit:layer.attribution?new C.Credit(layer.attribution):undefined,
      enablePickFeatures:false,
    });
  }
  const url=layer.endpoint.replace(/^pmtiles:\/\//,""),archive=new PMTiles(url),header=await archive.getHeader();
  const bounds:Bounds=[header.minLon,Math.max(-85.051129,header.minLat),header.maxLon,Math.min(85.051129,header.maxLat)];
  let inflight=0;
  return provider(C,new C.WebMercatorTilingScheme(),bounds,header.maxZoom,layer.attribution??"",(x,y,z)=>{
    if(inflight>=6) return undefined;
    if(z<header.minZoom) return Promise.resolve(tileCanvas());
    inflight++;
    return archive.getZxy(z,x,y).then(async tile=>{
      if(!tile) return tileCanvas();
      if(layer.type==="pmtiles-raster") return createImageBitmap(new Blob([tile.data]));
      if(header.tileType===TileType.Mlt) {
        const {decodeMltLayers}=await import("./cesium-mlt");
        return paintVectorTile(await decodeMltLayers(new Uint8Array(tile.data)),layer.metadata?.pmtilesSourceLayers);
      }
      const decoded=new VectorTile(new Protobuf(new Uint8Array(tile.data)));
      return paintVectorTile(decoded.layers,layer.metadata?.pmtilesSourceLayers);
    }).finally(()=>{inflight--;});
  });
}
