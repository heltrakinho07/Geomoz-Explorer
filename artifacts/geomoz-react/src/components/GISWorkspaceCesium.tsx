import React, {useEffect, useRef, useState} from "react";
import type {FeatureCollection} from "geojson";
import type {Viewer, ImageryLayer, GeoJsonDataSource} from "cesium";
import {bbox} from "@turf/turf";
import {GOOGLE_BASEMAPS, type BasemapType} from "@/lib/basemaps";
import {loadCesium, type CesiumSDK} from "@/lib/cesium-sdk";
import {RasterWorkerClient, rasterProvider, serviceProvider} from "@/lib/cesium-imagery";
import {resolveGISRasterRemoteUrl, type GISWorkspaceRasterLayer, type GISWorkspaceRasterMetadata} from "@/lib/gis-raster";
import type {GISWorkspaceServiceLayer} from "@/lib/gis-data-sources";
import type {Bounds} from "@/lib/cesium-raster-style";
import "@/styles/gis-cesium.css";

export interface GISWorkspaceMapLayer {id:string;name:string;geojson:FeatureCollection;color:string;visible:boolean}
interface Props {
  layers:GISWorkspaceMapLayer[];rasterLayers?:GISWorkspaceRasterLayer[];serviceLayers?:GISWorkspaceServiceLayer[];
  activeLayerId?:string;activeRasterId?:string;basemap:BasemapType;aoiGeometry?:GeoJSON.GeoJSON|null;drawingEnabled?:boolean;
  onSelectLayer?:(id:string)=>void;onDrawComplete?:(geometry:GeoJSON.GeoJSON,label:string)=>void;onDrawCancel?:()=>void;
  onViewportBbox?:(bounds:Bounds)=>void;onRasterMetadata?:(metadata:GISWorkspaceRasterMetadata)=>void;
  onRasterError?:(id:string,message:string)=>void;
}
type Point=[number,number];
interface RasterEntry {source:File|string|undefined;key:string;bounds?:Bounds;bandCount?:number;imagery?:ImageryLayer;style?:string;failed?:boolean}
interface VectorEntry {data:FeatureCollection;color:string;source?:GeoJsonDataSource}
interface ServiceEntry {key:string;imagery?:ImageryLayer}
interface Runtime {
  C:CesiumSDK;viewer:Viewer;worker:RasterWorkerClient;rasters:Map<string,RasterEntry>;vectors:Map<string,VectorEntry>;
  services:Map<string,ServiceEntry>;base?:ImageryLayer;sequence:number;tiles:number;alive:boolean;
}
interface Preview {draft:string;points:Array<{x:number;y:number}>;completed:string}
function rings(geometry?:GeoJSON.GeoJSON|null):number[][][] {
  if(!geometry) return [];
  switch(geometry.type) {
    case "Polygon":return geometry.coordinates;
    case "MultiPolygon":return geometry.coordinates.flat();
    case "Feature":return rings(geometry.geometry);
    case "FeatureCollection":return geometry.features.flatMap(f=>rings(f.geometry));
    case "GeometryCollection":return geometry.geometries.flatMap(g=>rings(g));
    default:return [];
  }
}
function path(project:(p:number[])=>{x:number;y:number},points:number[][],close:boolean):string {
  const parts=points.map(project).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  return parts.map((p,i)=>(i?"L":"M")+p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ")+(close&&parts.length?" Z":"");
}
function fit(r:Runtime,b:Bounds) {
  if(!b.every(Number.isFinite)) return;
  const width=Math.max(0.002,b[2]-b[0]),height=Math.max(0.002,b[3]-b[1]);
  r.viewer.camera.setView({destination:r.C.Rectangle.fromDegrees(
    Math.max(-180,b[0]-width*0.12),Math.max(-85,b[1]-height*0.12),
    Math.min(180,b[2]+width*0.12),Math.min(85,b[3]+height*0.12))});
  r.viewer.scene.requestRender();
}

export default function GISWorkspaceCesium(props:Props) {
  const container=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null);
  const current=useRef(props);current.current=props;
  const runtime=useRef<Runtime|null>(null),points=useRef<Point[]>([]),cursor=useRef<Point|null>(null);
  const previewKey=useRef(""),focusKey=useRef(""),finishRef=useRef<()=>void>(()=>{});
  const [ready,setReady]=useState(0),[attempt,setAttempt]=useState(0),[error,setError]=useState<string|null>(null);
  const [count,setCount]=useState(0),[drawError,setDrawError]=useState<string|null>(null);
  const [preview,setPreview]=useState<Preview>({draft:"",points:[],completed:""});
  const [coordinates,setCoordinates]=useState<Point|null>(null);
  const [layerErrors,setLayerErrors]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState<{name:string;properties:Record<string,unknown>}|null>(null);
  const fail=(id:string,message:string)=>{
    setLayerErrors(old=>old[id]===message?old:{...old,[id]:message});
    current.current.onRasterError?.(id,message);
  };
  const refreshPreview=()=>{
    const r=runtime.current;if(!r?.alive)return;
    const project=(p:number[])=>{
      const pixel=r.C.SceneTransforms.worldToWindowCoordinates(r.viewer.scene,r.C.Cartesian3.fromDegrees(p[0],p[1]));
      return pixel??{x:NaN,y:NaN};
    };
    const draft=cursor.current&&points.current.length?[...points.current,cursor.current]:points.current;
    const completed=rings(current.current.aoiGeometry).map(ring=>{
      const stride=Math.max(1,Math.ceil(ring.length/1200));
      return path(project,ring.filter((_,i)=>i%stride===0||i===ring.length-1),true);
    }).join(" ");
    const next={draft:path(project,draft,points.current.length>=3),points:points.current.map(project),completed};
    const key=JSON.stringify(next);
    if(key!==previewKey.current){previewKey.current=key;setPreview(next);}
  };
  finishRef.current=()=>{
    if(!current.current.drawingEnabled||points.current.length<3)return;
    const p=points.current,ring=[...p,p[0]];
    const area=p.reduce((sum,a,i)=>sum+a[0]*ring[i+1][1]-ring[i+1][0]*a[1],0);
    if(Math.abs(area)<1e-12){setDrawError("Os pontos devem formar uma área. Adicione um ponto fora da linha.");return;}
    current.current.onDrawComplete?.({type:"Polygon",coordinates:[ring]},"Área desenhada no mapa");
    points.current=[];cursor.current=null;setCount(0);refreshPreview();
  };

  useEffect(()=>{
    let disposed=false,dispose:undefined|(()=>void);
    setError(null);
    void loadCesium().then(C=>{
      if(disposed||!container.current)return;
      const viewer=new C.Viewer(container.current,{
        sceneMode:C.SceneMode.SCENE2D,sceneModePicker:false,mapMode2D:C.MapMode2D.INFINITE_SCROLL,
        baseLayer:false,baseLayerPicker:false,geocoder:false,homeButton:false,navigationHelpButton:false,
        animation:false,timeline:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,
        skyBox:false,skyAtmosphere:false,terrainProvider:new C.EllipsoidTerrainProvider(),
        mapProjection:new C.GeographicProjection(),requestRenderMode:true,maximumRenderTimeChange:Infinity,
      });
      const r:Runtime={C,viewer,worker:new RasterWorkerClient(),rasters:new Map(),vectors:new Map(),services:new Map(),sequence:0,tiles:0,alive:true};
      runtime.current=r;
      viewer.scene.screenSpaceCameraController.enableRotate=false;
      viewer.scene.screenSpaceCameraController.enableTilt=false;
      viewer.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      fit(r,[30,-27,41,-10]);
      const pick=(position:{x:number;y:number}):Point|null=>{
        const world=viewer.camera.pickEllipsoid(new C.Cartesian2(position.x,position.y),C.Ellipsoid.WGS84);
        if(!world)return null;
        const p=C.Cartographic.fromCartesian(world),lon=C.Math.toDegrees(p.longitude),lat=C.Math.toDegrees(p.latitude);
        return Number.isFinite(lon)&&Number.isFinite(lat)?[lon,lat]:null;
      };
      const input=new C.ScreenSpaceEventHandler(viewer.canvas);
      input.setInputAction((event:{position:{x:number;y:number}})=>{
        if(current.current.drawingEnabled) {
          const point=pick(event.position);if(!point)return;
          const last=points.current.at(-1);
          if(last&&Math.abs(point[0]-last[0])+Math.abs(point[1]-last[1])<1e-9)return;
          points.current.push(point);cursor.current=null;setCount(points.current.length);setDrawError(null);
          refreshPreview();viewer.scene.requestRender();return;
        }
        const hit=viewer.scene.pick(new C.Cartesian2(event.position.x,event.position.y));
        if(hit?.id){
          for(const [id,entry] of r.vectors) if(entry.source?.entities.contains(hit.id)){
            current.current.onSelectLayer?.(id);
            setSelected({name:hit.id.name??current.current.layers.find(l=>l.id===id)?.name??"Feição",
              properties:hit.id.properties?.getValue(viewer.clock.currentTime)??{}});
            return;
          }
        }
        setSelected(null);
      },C.ScreenSpaceEventType.LEFT_CLICK);
      input.setInputAction((event:{endPosition:{x:number;y:number}})=>{
        const point=pick(event.endPosition);setCoordinates(point);
        if(current.current.drawingEnabled){cursor.current=point;refreshPreview();}
      },C.ScreenSpaceEventType.MOUSE_MOVE);
      input.setInputAction(()=>finishRef.current(),C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      const viewport=()=>{
        const b=viewer.camera.computeViewRectangle(C.Ellipsoid.WGS84);
        if(b){const bounds:Bounds=[C.Math.toDegrees(b.west),C.Math.toDegrees(b.south),C.Math.toDegrees(b.east),C.Math.toDegrees(b.north)];
          if(bounds.every(Number.isFinite)&&bounds[0]<bounds[2]&&bounds[1]<bounds[3])current.current.onViewportBbox?.(bounds);}
        refreshPreview();
      };
      const removeMove=viewer.camera.moveEnd.addEventListener(viewport);
      const removeRender=viewer.scene.postRender.addEventListener(()=>refreshPreview());
      const observer=new ResizeObserver(()=>{if(r.alive){viewer.resize();viewer.scene.requestRender();}});
      observer.observe(container.current);
      dispose=()=>{r.alive=false;observer.disconnect();input.destroy();removeMove();removeRender();r.worker.stop();
        if(!viewer.isDestroyed())viewer.destroy();if(runtime.current===r)runtime.current=null;};
      viewport();setReady(v=>v+1);
    }).catch(err=>{if(!disposed)setError(err instanceof Error?err.message:String(err));});
    return()=>{disposed=true;dispose?.();};
  },[attempt]);

  useEffect(()=>{
    const r=runtime.current;if(!r?.alive)return;
    const cfg=GOOGLE_BASEMAPS[props.basemap];
    const url=cfg.url.replace("{s}",cfg.subdomains?.[0]??"0")+(cfg.url.includes("google.com")?"&hl=pt":"");
    const next=r.viewer.imageryLayers.addImageryProvider(new r.C.UrlTemplateImageryProvider({
      url,maximumLevel:cfg.maxZoom,credit:new r.C.Credit(cfg.attribution),
      tilingScheme:new r.C.WebMercatorTilingScheme(),enablePickFeatures:false,
    }),0);
    if(r.base)r.viewer.imageryLayers.remove(r.base,true);
    r.base=next;r.viewer.scene.requestRender();
  },[ready,props.basemap]);

  useEffect(()=>{
    const r=runtime.current;if(!r?.alive)return;
    const valid=new Set(props.layers.map(l=>l.id));
    for(const [id,entry] of r.vectors)if(!valid.has(id)){r.vectors.delete(id);if(entry.source)r.viewer.dataSources.remove(entry.source,true);}
    for(const l of props.layers){
      let entry=r.vectors.get(l.id);
      if(entry&&(entry.data!==l.geojson||entry.color!==l.color)){
        if(entry.source)r.viewer.dataSources.remove(entry.source,true);r.vectors.delete(l.id);entry=undefined;
      }
      if(entry){if(entry.source)entry.source.show=l.visible;continue;}
      const next:VectorEntry={data:l.geojson,color:l.color};r.vectors.set(l.id,next);
      const color=r.C.Color.fromCssColorString(l.color)??r.C.Color.ROYALBLUE;
      void r.C.GeoJsonDataSource.load(l.geojson,{stroke:color,fill:color.withAlpha(0.22),strokeWidth:3,markerColor:color,markerSize:32,clampToGround:false}).then(source=>{
        if(!r.alive||r.vectors.get(l.id)!==next){return;}
        next.source=source;source.show=current.current.layers.find(layer=>layer.id===l.id)?.visible??false;
        return r.viewer.dataSources.add(source);
      }).then(()=>{if(r.alive)r.viewer.scene.requestRender();}).catch(err=>{if(r.alive)fail(l.id,"Falha na camada vectorial: "+err.message);});
    }
    if(host.current)host.current.dataset.vectorCount=String(r.vectors.size);
    r.viewer.scene.requestRender();
  },[ready,props.layers]);

  useEffect(()=>{
    const r=runtime.current;if(!r?.alive)return;
    const layers=props.rasterLayers??[],valid=new Set(layers.map(l=>l.id));
    const drop=(id:string,entry:RasterEntry)=>{
      r.rasters.delete(id);if(entry.imagery)r.viewer.imageryLayers.remove(entry.imagery,true);
      if(entry.bounds)void r.worker.request("close",entry.key).catch(()=>{});
    };
    for(const [id,entry] of r.rasters)if(!valid.has(id))drop(id,entry);
    const apply=(id:string,entry:RasterEntry)=>{
      const l=current.current.rasterLayers?.find(l=>l.id===id);
      if(!r.alive||!l||r.rasters.get(id)!==entry||!entry.bounds)return;
      const style=JSON.stringify([l.rasterState??{},l.rasterSymbology??null]);
      if(!entry.imagery||entry.style!==style){
        if(entry.imagery)r.viewer.imageryLayers.remove(entry.imagery,true);
        entry.style=style;
        const p=rasterProvider(r.C,r.worker,entry.key,entry.bounds,{rasterState:l.rasterState,rasterSymbology:l.rasterSymbology},
          ()=>{if(r.alive){r.tiles++;if(host.current)host.current.dataset.rasterTiles=String(r.tiles);r.viewer.scene.requestRender();}},
          message=>fail(id,message),()=>r.alive&&r.rasters.get(id)===entry&&entry.imagery?.imageryProvider===p);
        entry.imagery=r.viewer.imageryLayers.addImageryProvider(p);
      }
      entry.imagery.show=l.visible;entry.imagery.alpha=l.opacity;
      if(host.current)host.current.dataset.rasterCount=String([...r.rasters.values()].filter(e=>e.imagery).length);
      r.viewer.scene.requestRender();
    };
    for(const l of layers){
      const source=l.file??l.remoteUrl??(l.stacSource?JSON.stringify(l.stacSource):undefined);
      let entry=r.rasters.get(l.id);
      if(entry&&entry.source!==source){drop(l.id,entry);entry=undefined;}
      if(entry){apply(l.id,entry);continue;}
      const next:RasterEntry={source,key:"raster-"+(++r.sequence)};r.rasters.set(l.id,next);
      void (async()=>{
        try{
          const resolved=l.file??await resolveGISRasterRemoteUrl(l);
          if(!resolved)throw new Error("A camada não tem ficheiro nem URL raster.");
          const meta=await r.worker.request<{bounds:Bounds;bandCount:number}>("open",next.key,{source:resolved});
          next.bounds=meta.bounds;next.bandCount=meta.bandCount;
          if(!r.alive||r.rasters.get(l.id)!==next){if(r.alive)await r.worker.request("close",next.key);return;}
          apply(l.id,next);
          current.current.onRasterMetadata?.({id:l.id,...meta,error:null,rasterState:l.rasterState??{}});
        }catch(err){if(r.alive&&r.rasters.get(l.id)===next){next.failed=true;fail(l.id,err instanceof Error?err.message:String(err));}}
      })();
    }
    // Match the project layer order after asynchronous raster opens.
    for(const l of [...layers].reverse()){const entry=r.rasters.get(l.id);if(entry?.imagery)r.viewer.imageryLayers.raiseToTop(entry.imagery);}
  },[ready,props.rasterLayers]);

  useEffect(()=>{
    const r=runtime.current;if(!r?.alive)return;
    const layers=props.serviceLayers??[],valid=new Set(layers.map(l=>l.id));
    for(const [id,entry] of r.services)if(!valid.has(id)){r.services.delete(id);if(entry.imagery)r.viewer.imageryLayers.remove(entry.imagery,true);}
    for(const l of layers){
      const key=JSON.stringify({...l,visible:undefined,opacity:undefined}),old=r.services.get(l.id);
      if(old?.key===key){if(old.imagery){old.imagery.show=l.visible;old.imagery.alpha=l.opacity;}continue;}
      if(old?.imagery)r.viewer.imageryLayers.remove(old.imagery,true);
      const next:ServiceEntry={key};r.services.set(l.id,next);
      void serviceProvider(r.C,l).then(p=>{
        if(!r.alive||r.services.get(l.id)!==next)return;
        p.errorEvent.addEventListener((error:{message?:string})=>{
          if(r.alive)setLayerErrors(old=>({...old,[l.id]:error.message??"Não foi possível carregar os mosaicos do serviço."}));
        });
        next.imagery=r.viewer.imageryLayers.addImageryProvider(p);
        const latest=current.current.serviceLayers?.find(layer=>layer.id===l.id);
        next.imagery.show=latest?.visible??false;next.imagery.alpha=latest?.opacity??1;
        if(host.current)host.current.dataset.serviceCount=String(r.services.size);
        r.viewer.scene.requestRender();
      }).catch(err=>{if(r.alive)setLayerErrors(old=>({...old,[l.id]:err.message}));});
    }
    r.viewer.scene.requestRender();
  },[ready,props.serviceLayers]);

  useEffect(()=>{
    const r=runtime.current;if(!r?.alive||props.drawingEnabled)return;
    const raster=props.rasterLayers?.find(l=>l.id===props.activeRasterId);
    if(raster?.bounds){const key="r:"+raster.id+JSON.stringify(raster.bounds);if(key!==focusKey.current){focusKey.current=key;fit(r,raster.bounds);}return;}
    const vector=props.layers.find(l=>l.id===props.activeLayerId);
    if(vector?.geojson.features.length)try{
      const b=bbox(vector.geojson) as Bounds,key="v:"+vector.id+JSON.stringify(b);
      if(key!==focusKey.current){focusKey.current=key;fit(r,b);}
    }catch{/* Invalid geometries are reported by the vector loader. */}
  },[ready,props.activeRasterId,props.activeLayerId,props.rasterLayers,props.layers,props.drawingEnabled]);

  useEffect(()=>{
    points.current=[];cursor.current=null;setCount(0);setDrawError(null);
    const r=runtime.current;if(r?.alive){
      r.viewer.canvas.style.cursor=props.drawingEnabled?"crosshair":"";
      r.viewer.scene.screenSpaceCameraController.enableTranslate=!props.drawingEnabled;
      refreshPreview();r.viewer.scene.requestRender();
    }
  },[ready,props.drawingEnabled]);
  useEffect(()=>{refreshPreview();runtime.current?.viewer.scene.requestRender();},[props.aoiGeometry]);
  useEffect(()=>{
    const ids=new Set([...props.layers,...(props.rasterLayers??[]),...(props.serviceLayers??[])].map(l=>l.id));
    setLayerErrors(old=>Object.fromEntries(Object.entries(old).filter(([id])=>ids.has(id))));
  },[props.layers,props.rasterLayers,props.serviceLayers]);

  const visible=[...props.layers,...(props.rasterLayers??[]),...(props.serviceLayers??[])].filter(l=>l.visible).length;
  return <div ref={host} className="geomoz-cesium-map absolute inset-0" data-testid="cesium-workspace" data-raster-tiles="0">
    <div ref={container} className="absolute inset-0"/>
    {(preview.draft||preview.completed)&&<svg data-testid="gis-aoi-visible-overlay" aria-hidden="true" className="pointer-events-none absolute inset-0 z-[8] h-full w-full">
      {preview.completed&&<path d={preview.completed} fill="rgba(244,63,94,0.16)" stroke="#fb7185" strokeWidth={3.5} strokeDasharray="8 5" fillRule="evenodd"/>}
      {preview.draft&&<path data-testid="gis-aoi-drawing-path" d={preview.draft} fill={count>=3?"rgba(79,70,229,0.2)":"none"} stroke="#a5b4fc" strokeWidth={4} strokeDasharray="9 5" strokeLinejoin="round" strokeLinecap="round"/>}
      {preview.points.map((p,i)=><circle key={i} data-testid="gis-aoi-drawing-vertex" cx={p.x} cy={p.y} r={7} fill="white" stroke="#4338ca" strokeWidth={3}/>)}
    </svg>}
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm">
      <strong>CesiumJS · 2D</strong><span className="ml-2 text-slate-500">{visible} camada(s)</span>
    </div>
    <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-md">
      <button type="button" aria-label="Aproximar mapa" className="h-10 w-10 text-xl hover:bg-slate-100" onClick={()=>{const r=runtime.current;if(r){r.viewer.camera.zoomIn(r.viewer.camera.positionCartographic.height/2);r.viewer.scene.requestRender();}}}>+</button>
      <button type="button" aria-label="Afastar mapa" className="h-10 w-10 border-t text-xl hover:bg-slate-100" onClick={()=>{const r=runtime.current;if(r){r.viewer.camera.zoomOut(r.viewer.camera.positionCartographic.height);r.viewer.scene.requestRender();}}}>−</button>
      <button type="button" aria-label="Ver Moçambique" className="h-10 w-10 border-t hover:bg-slate-100" onClick={()=>{if(runtime.current)fit(runtime.current,[30,-27,41,-10]);}}>⌂</button>
    </div>
    {props.drawingEnabled&&<div className="absolute left-1/2 top-16 z-20 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-xl border border-indigo-200 bg-white/95 p-3 text-xs text-indigo-800 shadow-md">
      <p role="status">Clique ou toque no mapa para adicionar pontos · {count} ponto(s)</p>
      {drawError&&<p role="alert" className="mt-1 text-rose-700">{drawError}</p>}
      <div className="mt-2 flex gap-3">
        <button type="button" disabled={count<3} onClick={()=>finishRef.current()} className="rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-40">Concluir área</button>
        <button type="button" disabled={!count} onClick={()=>{points.current.pop();setCount(points.current.length);refreshPreview();}} className="disabled:opacity-40">Desfazer ponto</button>
        <button type="button" onClick={()=>props.onDrawCancel?.()} className="text-rose-700">Cancelar desenho</button>
      </div>
    </div>}
    {!ready&&!error&&<div role="status" className="absolute inset-0 grid place-items-center bg-slate-100 text-slate-600">A iniciar o mapa CesiumJS…</div>}
    {error&&<div role="alert" className="absolute inset-0 z-30 grid place-items-center bg-slate-100 p-6"><div className="max-w-md rounded-xl bg-white p-6 shadow"><p>{error}</p><button className="mt-4 rounded bg-indigo-700 px-4 py-2 text-white" onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></div></div>}
    {!!Object.keys(layerErrors).length&&<div role="alert" className="absolute bottom-12 left-3 z-10 max-h-32 max-w-md overflow-auto rounded-lg bg-rose-50 p-3 text-xs text-rose-800 shadow">
      {Object.entries(layerErrors).map(([id,message])=><p key={id}>{[...props.layers,...(props.rasterLayers??[]),...(props.serviceLayers??[])].find(l=>l.id===id)?.name}: {message}</p>)}
    </div>}
    {selected&&<div className="absolute right-4 top-40 z-20 max-h-80 w-72 overflow-auto rounded-xl bg-white p-4 text-xs shadow-lg">
      <button aria-label="Fechar atributos" className="float-right" onClick={()=>setSelected(null)}>×</button><strong>{selected.name}</strong>
      <dl className="mt-3 space-y-2">{Object.entries(selected.properties).map(([key,value])=><div key={key}><dt className="font-semibold text-slate-500">{key}</dt><dd className="break-words">{String(value??"")}</dd></div>)}</dl>
    </div>}
    {coordinates&&<div className="pointer-events-none absolute bottom-7 right-2 z-10 rounded bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-white">{coordinates[1].toFixed(5)}, {coordinates[0].toFixed(5)}</div>}
  </div>;
}
