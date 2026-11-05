/**
 * Native GeoMoz 3D terrain inside the existing GeoLibre GIS project.
 *
 * This component shares the actual layer store: no iframe, second app login or
 * postMessage, and no file re-selection. Source COG bytes are read under a
 * bounded stream; no original DEM is uploaded or saved on a second server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@geolibre/core";
import { useLanguage } from "../../hooks/useLanguage";
import { geoMozSpecialistText } from "./geomoz-specialist-locale";
import type { FeatureCollection } from "geojson";
import { terrainRasterLayerOptions } from "../../lib/terrain-raster-layer";
import {
  ArrowLeft, Layers3, Loader2, Mountain, RotateCcw,
  Download, Image as ImageIcon, X, Map as MapIcon, Columns2, Box,
} from "lucide-react";
import {
  createTerrainRenderer, type TerrainMeshData, type TerrainVisualStyle, type TerrainPick,
} from "../../lib/geomoz-terrain-webgl";
import { terrainToGeographic, type TerrainProfile, type TerrainContourCollection }
  from "../../lib/geomoz-terrain-analysis";
import { decodeTerrainScene, encodeTerrainScene, MAX_TERRAIN_SCENE_BYTES }
  from "../../lib/geomoz-terrain-scene";
import GeoMozTerrainSciencePanel, {type TerrainPickedPoint}
  from "./GeoMozTerrainSciencePanel";
import { geomozNativeTerrainPreview } from "./geomoz-native-terrain-dem";
import { encodeTerrainGLB } from "../../lib/geomoz-terrain-glb";
import GeoMozTerrainLayers from "./GeoMozTerrainLayers";
import GeoMozTerrainGeoMap from "./GeoMozTerrainGeoMap";
import {validTerrainGeography} from "./geomoz-terrain-tiles";
import { terrainOverlayTexture, type GeoMozTerrainOverlay } from "./geomoz-terrain-overlays";
import { createTerrainRasterDrape, type TerrainRasterDrapeOptions } from "./geomoz-terrain-raster-overlay";
import {composeTerrainDrapes,type TerrainDrapeLayer} from "./geomoz-terrain-drape-stack";
import {createTerrainXYZDrape,validateTerrainXYZTemplate} from "./geomoz-terrain-xyz-drape";
import "./geomoz-terrain-workspace.css";

const LIMIT=32*1024*1024;
type Target="A"|"B";
interface Props {
  open:boolean;
  onClose:()=>void;
  preferredLayerId?:string|null;
}

/** Enforces the same upload limit as the server, including unknown-length COGs. */
export async function fetchBoundedTerrain(source:string,signal:AbortSignal):Promise<ArrayBuffer> {
  const url=new URL(source,window.location.href);
  if(!["blob:","https:","http:"].includes(url.protocol))
    throw Error("Esta camada não tem uma origem GeoTIFF acessível.");
  if(url.protocol==="http:"&&window.location.protocol==="https:")
    throw Error("A origem do raster deve utilizar HTTPS.");
  const response=await fetch(url.href,{credentials:"same-origin",signal});
  if(!response.ok)throw Error("Não foi possível ler o GeoTIFF seleccionado.");
  const contentLength=Number(response.headers.get("content-length")??0);
  if(contentLength>LIMIT){
    await response.body?.cancel();
    throw Error("Este DEM excede 32 MB. Recorte-o no GIS Workspace.");
  }
  if(!response.body)throw Error("A origem do raster não disponibilizou dados.");
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(signal.aborted)throw Error("Leitura do DEM cancelada.");
      total+=value.byteLength;
      if(total>LIMIT)throw Error("Este DEM excede 32 MB. Recorte-o no GIS Workspace.");
      chunks.push(value);
    }
  }catch(cause){
    await reader.cancel().catch(()=>undefined);
    throw cause;
  }finally{reader.releaseLock();}
  if(!total)throw Error("A origem do DEM está vazia.");
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes.buffer;
}
/**
 * Read local GeoTIFF bytes within the same 32 MB safety bound as catalogue
 * sources. Streams make cancellation effective before the entire file loads.
 */
async function readBoundedRasterFile(file:File,signal:AbortSignal,onProgress:(percent:number)=>void):Promise<ArrayBuffer>{
  if(file.size===0||file.size>LIMIT)throw Error("GeoTIFF tem de ter até 32 MB.");
  const reader=file.stream().getReader();
  const onAbort=()=>{void reader.cancel().catch(()=>undefined);};
  signal.addEventListener("abort",onAbort,{once:true});
  const chunks:Uint8Array[]=[];
  let total=0;
  try {
    while(true){
      if(signal.aborted)throw new DOMException("Importação do raster cancelada.","AbortError");
      const {done,value}=await reader.read();
      if(signal.aborted)throw new DOMException("Importação do raster cancelada.","AbortError");
      if(done)break;
      total+=value.byteLength;
      if(total>LIMIT)throw Error("GeoTIFF tem de ter até 32 MB.");
      chunks.push(value);
      onProgress(Math.round(total/file.size*100));
    }
    if(!total)throw Error("O ficheiro GeoTIFF está vazio.");
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return bytes.buffer;
  }finally {
    signal.removeEventListener("abort",onAbort);
    if(signal.aborted)await reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
}
function saveBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function makeProfileGeoJSON(profile:TerrainProfile):FeatureCollection {
  const lines:number[][][]=[];
  let segment:number[][]=[];
  for(const point of profile.points){
    if(point.elevationM===null){
      if(segment.length>=2)lines.push(segment);
      segment=[];continue;
    }
    segment.push([point.lon,point.lat,point.elevationM]);
  }
  if(segment.length>=2)lines.push(segment);
  return {
    type:"FeatureCollection",
    features:lines.length?[{
      type:"Feature",
      properties:{source:"GeoMoz · malha 3D simplificada",
        distancia_m:profile.distanceM,ganho_m:profile.gainM,perda_m:profile.lossM},
      geometry:{type:"MultiLineString",coordinates:lines}
    }]:[]
  };
}

export function GeoMozTerrainWorkspace({open,onClose,preferredLayerId}:Props) {
  const {language}=useLanguage();
  const ui=(pt:string)=>geoMozSpecialistText(language,pt);
  // Keep notices in a language-neutral source form. Interpolate DEM names
  // and scientific identifiers only after translating the fixed copy.
  const uiNotice=(message:string)=>{
    const model="Modelo 3D do projecto: ";
    if(message.startsWith(model)){
      const remainder=message.slice(model.length);
      const valid=" válido";
      return ui(model)+(remainder.endsWith(valid)
        ?remainder.slice(0,-valid.length)+ui(valid):remainder);
    }
    for(const prefix of [
      "Curvas de nível adicionadas ao catálogo SIG (",
      "Perfil topográfico adicionado ao projecto (",
    ])if(message.startsWith(prefix))return ui(prefix)+message.slice(prefix.length);
    return ui(message);
  };
  const layers=useAppStore(s=>s.layers);
  const currentId=useAppStore(s=>s.selectedLayerId);
  const projectName=useAppStore(s=>s.projectName);
  const addGeoJsonLayer=useAppStore(s=>s.addGeoJsonLayer);
  const options=useMemo(()=>terrainRasterLayerOptions(layers),[layers]);
  const [selected,setSelected]=useState("");
  const [terrain,setTerrain]=useState<TerrainMeshData|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [rendererError,setRendererError]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [style,setStyle]=useState<TerrainVisualStyle>("hypsometric");
  const [detailLevel,setDetailLevel]=useState<"auto"|"full"|"medium"|"low">("auto");
  const [workspaceTab,setWorkspaceTab]=useState<"layers"|"style"|"analysis"|"export">("layers");
  const [viewMode,setViewMode]=useState<"model"|"map"|"split">("map");
  const [overlays,setOverlays]=useState<GeoMozTerrainOverlay[]>([]);
  const [rasterDrapes,setRasterDrapes]=useState<TerrainDrapeLayer[]>([]);
  const [drapeTexture,setDrapeTexture]=useState<string|null>(null);
  useEffect(()=>{
    if(!terrain){setDrapeTexture(null);return;}
    const controller=new AbortController();
    void composeTerrainDrapes(rasterDrapes,1024,controller.signal).then(texture=>{
      if(!controller.signal.aborted)setDrapeTexture(texture);
    }).catch(cause=>{
      if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Falha na composição raster.");
    });
    return ()=>controller.abort();
  },[terrain,rasterDrapes]);
  const [rasterBusy,setRasterBusy]=useState(false);
  const [rasterProgress,setRasterProgress]=useState<{label:string;percent:number|null}|null>(null);
  const overlayTexture=useMemo(()=>terrain?terrainOverlayTexture(terrain,overlays):null,[terrain,overlays]);
  const [exaggeration,setExaggeration]=useState(2);
  const [pickTarget,setPickTarget]=useState<Target|null>(null);
  const [lastPick,setLastPick]=useState<TerrainPickedPoint|null>(null);
  const [picked,setPicked]=useState<Partial<Record<Target,TerrainPick>>>({});
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneInputRef=useRef<HTMLInputElement>(null);
  const abortRef=useRef<AbortController|null>(null);
  const rasterAbortRef=useRef<AbortController|null>(null);

  useEffect(()=>{
    if(!open)return;
    setSelected(current=>{
      const next=[preferredLayerId,currentId,current].find(id=>id&&options.some(o=>o.id===id));
      return next??options[0]?.id??"";
    });
  },[open,preferredLayerId,currentId,options]);

  // On close the current source layer is untouched. Stop any pending transfer.
  useEffect(()=>{
    if(!open){
      abortRef.current?.abort();abortRef.current=null;
      rasterAbortRef.current?.abort();rasterAbortRef.current=null;
      setRasterBusy(false);setRasterProgress(null);setPickTarget(null);
    }
    return ()=>{abortRef.current?.abort();rasterAbortRef.current?.abort();};
  },[open]);

  const selectPoint=(point:TerrainPick)=>{
    if(!pickTarget||!terrain)return;
    try {
      const [lon,lat]=terrainToGeographic(terrain,point.xMeters,point.yMeters);
      setPicked(previous=>({...previous,[pickTarget]:point}));
      setLastPick({target:pickTarget,lon,lat,elevationMeters:point.elevationMeters});
      setPickTarget(pickTarget==="A"?"B":null);
      setError(null);
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha na consulta altimétrica.");}
  };
  useEffect(()=>{
    if(!open||!terrain||viewMode==="map"||!canvasRef.current)return;
    setRendererError(null);
    try {
      return createTerrainRenderer(canvasRef.current,terrain,{
        exaggeration,style,detailLevel,overlayTextureUrl:overlayTexture,
        rasterTextureUrl:drapeTexture,
        rasterOpacity:drapeTexture?1:0,
        pickEnabled:!!pickTarget,onPick:selectPoint,
        profileOverlay:picked.A&&picked.B?
          {start:[picked.A.xMeters,picked.A.yMeters],
           end:[picked.B.xMeters,picked.B.yMeters]}:null
      });
    }catch(cause){
      setRendererError(cause instanceof Error?cause.message:"O WebGL2 não pôde carregar o modelo.");
    }
  },[open,terrain,exaggeration,style,detailLevel,pickTarget,picked,overlayTexture,drapeTexture,viewMode]);

  async function openSelectedDEM(){
    const layer=options.find(o=>o.id===selected);
    if(!layer){setError("Seleccione um DEM GeoTIFF no catálogo do projecto.");return;}
    abortRef.current?.abort();
    rasterAbortRef.current?.abort();rasterAbortRef.current=null;
    setRasterBusy(false);setRasterProgress(null);
    const controller=new AbortController();abortRef.current=controller;
    setBusy(true);setError(null);setNotice("A processar o DEM seleccionado…");
    try {
      const bytes=await fetchBoundedTerrain(layer.source,controller.signal);
      const preview=await geomozNativeTerrainPreview(bytes,layer.name);
      if(controller.signal.aborted)return;
      setTerrain(preview);setPicked({});setLastPick(null);setPickTarget(null);
      setOverlays([]);setRasterDrapes([]);setWorkspaceTab("layers");
      setViewMode(validTerrainGeography(preview)?"map":"model");
      setNotice("Modelo 3D do projecto: "+layer.name+
        " · "+preview.crs+" · "+preview.validFraction.toLocaleString("pt-PT",{style:"percent",maximumFractionDigits:1})+" válido");
    }catch(cause){
      if(!controller.signal.aborted){
        setError(cause instanceof Error?cause.message:"Não foi possível preparar o DEM.");
        setNotice("");
      }
    }finally {
      if(abortRef.current===controller){abortRef.current=null;setBusy(false);}
    }
  }
  function cancelRasterOverlay(){
    const controller=rasterAbortRef.current;
    if(!controller)return;
    controller.abort();
    rasterAbortRef.current=null;
    setRasterBusy(false);setRasterProgress(null);
    setNotice("Importação do raster cancelada. O modelo e as camadas existentes foram preservados.");
  }
  async function applyXYZOverlay(url:string,attribution:string){
    if(!terrain||rasterAbortRef.current)return;
    if(!attribution.trim()){setError("Indique a atribuição exigida pelo fornecedor XYZ.");return;}
    try{validateTerrainXYZTemplate(url);}catch(cause){
      setError(cause instanceof Error?cause.message:"Origem XYZ inválida.");return;
    }
    const controller=new AbortController();rasterAbortRef.current=controller;
    setRasterBusy(true);setError(null);setNotice("");
    setRasterProgress({label:"A carregar mosaico XYZ autorizado…",percent:null});
    try{
      const prepared=await createTerrainXYZDrape(terrain,url,controller.signal);
      if(controller.signal.aborted)return;
      setRasterDrapes(previous=>[...previous,{
        id:"xyz-"+crypto.randomUUID(),name:"Mapa-base XYZ · "+attribution,
        imageDataUrl:prepared.imageDataUrl,visible:true,opacity:1,blend:"normal",
        kind:"xyz",coverage:prepared.coverage,attribution
      }]);
      setNotice("Mapa-base XYZ aplicado ao modelo ("+prepared.tileCount+" tiles a zoom "+
        prepared.zoom+"). A licença e a atribuição são da responsabilidade da origem.");
    }catch(cause){
      if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Falha ao carregar tiles XYZ.");
    }finally{
      if(rasterAbortRef.current===controller){rasterAbortRef.current=null;
        setRasterBusy(false);setRasterProgress(null);}
    }
  }
  async function applyRasterOverlay(input:File|{source:string;name:string}, renderer:TerrainRasterDrapeOptions["renderer"]="auto", palette:TerrainRasterDrapeOptions["palette"]="ndvi"){
    if(!terrain||rasterAbortRef.current)return;
    const controller=new AbortController();
    rasterAbortRef.current=controller;
    setRasterBusy(true);setError(null);setNotice("");
    setRasterProgress({label:"A carregar "+input.name,percent:null});
    try{
      const name=input.name;
      const buffer=input instanceof File
        ?await readBoundedRasterFile(input,controller.signal,percent=>{
          if(!controller.signal.aborted)
            setRasterProgress({label:"A ler "+name,percent});
        })
        :await fetchBoundedTerrain(input.source,controller.signal);
      if(controller.signal.aborted)return;
      setRasterProgress({label:"A alinhar e recortar "+name,percent:0});
      const prepared=await createTerrainRasterDrape(buffer,name,terrain,{
        renderer,palette,signal:controller.signal,
        onProgress:fraction=>{
          if(!controller.signal.aborted)
            setRasterProgress({label:"A alinhar e recortar "+name,percent:Math.round(fraction*100)});
        }
      });
      if(controller.signal.aborted)return;
      setRasterDrapes(previous=>[...previous,{
        ...prepared,id:"raster-"+crypto.randomUUID(),imageDataUrl:prepared.imageDataUrl,
        kind:prepared.mode,opacity:0.82,visible:true,blend:"normal"
      }]);
      setNotice("Raster temático sobreposto e recortado à extensão do DEM ("+
        Math.round(prepared.coverage*100)+"% de cobertura).");
    }catch(cause){
      if(!controller.signal.aborted)
        setError(cause instanceof Error?cause.message:"Não foi possível processar o raster.");
    }finally{
      if(rasterAbortRef.current===controller){
        rasterAbortRef.current=null;
        setRasterBusy(false);setRasterProgress(null);
      }
    }
  }
  function exportGLB(){
    if(!terrain)return;
    setError(null);
    try {
      const bytes=encodeTerrainGLB(terrain,exaggeration,style);
      saveBlob(new Blob([new Uint8Array(bytes)],{type:"model/gltf-binary"}),
        "geomoz_terreno_3d.glb");
      setNotice("Modelo GLB exportado em metros com metadados do CRS do projecto.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha ao exportar GLB.");}
  }
  function saveScene(){
    if(!terrain)return;
    try {
      const bytes=encodeTerrainScene(terrain,style,exaggeration);
      saveBlob(new Blob([bytes],{type:"application/json"}),"geomoz_terreno_3d.geomoz");
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível guardar a cena.");}
  }
  async function loadScene(file:File|undefined){
    if(!file)return;
    setError(null);
    try {
      if(!file.name.toLowerCase().endsWith(".geomoz")||
        file.size===0||file.size>MAX_TERRAIN_SCENE_BYTES)throw Error("Cena .geomoz inválida (máximo 4 MB).");
      const scene=decodeTerrainScene(await file.text());
      setTerrain(scene.terrain);setStyle(scene.style);setExaggeration(scene.exaggeration);
      setPicked({});setPickTarget(null);setLastPick(null);
      setOverlays([]);setRasterDrapes([]);
      setViewMode(validTerrainGeography(scene.terrain)?"map":"model");
      setNotice("Cena 3D reaberta. A camada raster original permanece no projecto SIG.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Cena .geomoz inválida.");}
    finally{if(sceneInputRef.current)sceneInputRef.current.value="";}
  }
  function downloadPNG(){
    const canvas=canvasRef.current;
    if(canvas&&!rendererError)saveBlobFromCanvas(canvas,"geomoz_terreno_3d.png");
  }
  function saveBlobFromCanvas(canvas:HTMLCanvasElement,name:string){
    canvas.toBlob(blob=>{
      if(blob)saveBlob(blob,name);
      else setError("Não foi possível exportar a vista 3D.");
    },"image/png");
  }
  async function downloadPDF(){
    const canvas=canvasRef.current;
    if(!canvas||!terrain)return;
    setError(null);
    try {
      const {default:jsPDF}=await import("jspdf");
      const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
      pdf.setFontSize(13);pdf.text(ui("GeoMoz · Terreno 3D"),12,17);
      pdf.setFontSize(9);pdf.text(projectName+" · "+terrain.name+" · "+terrain.crs,12,24);
      const aspect=canvas.width/Math.max(canvas.height,1);
      const w=Math.min(273,150*aspect),h=w/aspect;
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",(297-w)/2,32,w,h);
      pdf.setFontSize(8);
      pdf.text(ui("Pré-visualização do DEM. A perspectiva não tem escala constante."),12,194);
      pdf.text("Created with GeoMoz Explorer",12,202);
      pdf.save("geomoz_terreno_3d.pdf");
    }catch{setError("Falha na exportação do mapa 3D para PDF.");}
  }
  function addContours(collection:TerrainContourCollection){
    if(collection.features.length===0){setError("Não existem curvas de nível para adicionar.");return;}
    const id=addGeoJsonLayer("Curvas de nível · Terreno 3D",collection as FeatureCollection);
    setNotice("Curvas de nível adicionadas ao catálogo SIG ("+id.slice(0,8)+").");
  }
  function addProfile(profile:TerrainProfile){
    const collection=makeProfileGeoJSON(profile);
    if(collection.features.length===0){setError("O perfil não tem segmentos válidos.");return;}
    const id=addGeoJsonLayer("Perfil A→B · Terreno 3D",collection);
    setNotice("Perfil topográfico adicionado ao projecto ("+id.slice(0,8)+").");
  }
  if(!open)return null;
  return <section className="gm-terrain-workspace" data-testid="geomoz-workbench-terrain"
    aria-label={ui("Terreno 3D do GIS Workspace")}>
    <header className="gm-terrain-workspace-toolbar">
      <div className="gm-terrain-workspace-title"><Mountain size={19}/>
        <div><strong>{ui("Terreno 3D")}</strong><small>GIS Workspace · {projectName||ui("Projecto actual")}</small></div>
      </div>
      <label className="gm-terrain-workspace-selector">
        <Layers3 size={15}/><span>{ui("DEM do projecto")}</span>
        <select value={selected} onChange={event=>setSelected(event.target.value)}
          aria-label={ui("Seleccionar DEM do GIS Workspace")}>
          {!options.length&&<option value="">{ui("Nenhuma camada GeoTIFF disponível")}</option>}
          {options.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}
        </select>
      </label>
      <button type="button" className="gm-terrain-workspace-load" disabled={busy||!options.length}
        data-testid="geomoz-workbench-terrain-import" onClick={()=>void openSelectedDEM()}>
        {busy?<Loader2 size={15} className="gm-terrain-spin"/>:<Mountain size={15}/>}
        {busy?ui("A processar DEM…"):ui("Visualizar camada em 3D")}
      </button>
      <button type="button" className="gm-terrain-workspace-close"
        aria-label={ui("Voltar ao mapa GIS")} onClick={onClose}>
        <ArrowLeft size={15}/> {ui("Voltar ao mapa")} <X size={14}/>
      </button>
    </header>
    {error&&<p className="gm-terrain-workspace-error" role="alert">{ui(error)}</p>}
    {!error&&notice&&<p className="gm-terrain-workspace-notice" role="status">{uiNotice(notice)}</p>}
    <div className="gm-terrain-native">
      <aside className="gm-terrain-native-sidebar" aria-label="Ferramentas do terreno 3D">
        <nav className="gm-terrain-tabs" aria-label="Ferramentas 3D">
          {([
            ["layers","Camadas"],["style","Simbologia"],
            ["analysis","Análise"],["export","Exportar"]
          ] as const).map(([key,title])=>
            <button key={key} type="button" aria-selected={workspaceTab===key}
              data-testid={"terrain-tab-"+key} onClick={()=>setWorkspaceTab(key)}>{title}</button>)}
        </nav>
        <div className="gm-terrain-tab-content">
          {(workspaceTab==="layers"||workspaceTab==="style")&&
            <GeoMozTerrainLayers layers={layers} overlays={overlays} onChange={setOverlays}
              activePanel={workspaceTab} terrainReady={!!terrain}
              rasterOptions={options.filter(o=>o.id!==selected)} rasters={rasterDrapes}
              rasterBusy={rasterBusy} rasterProgress={rasterProgress}
              onCancelRaster={cancelRasterOverlay} onRastersChange={setRasterDrapes}
              onImportRaster={applyRasterOverlay} onAddXYZ={applyXYZOverlay}
              onNotice={setNotice}/>}
          {workspaceTab==="analysis"&&<>
            <h3>{ui("Análise científica do DEM")}</h3>
            {terrain?<GeoMozTerrainSciencePanel terrain={terrain} translate={ui}
                pickedPoint={lastPick} activePickTarget={pickTarget}
                onRequestPick={setPickTarget}
                onAddContours={addContours} onAddProfile={addProfile}/>:
              <p>Seleccione um DEM no cabeçalho para iniciar as análises.</p>}
            <p className="gm-terrain-native-hint">{ui("Os resultados científicos provêm da malha simplificada. Para cálculos finais, execute as ferramentas de geoprocessamento sobre o GeoTIFF original.")}</p>
          </>}
          {workspaceTab==="export"&&<>
            <h3>Exportar modelo e resultados</h3>
            {terrain&&<div className="gm-terrain-native-info">
              <strong>{terrain.name}</strong>
              <small>{terrain.sourceCrs} → {terrain.crs}</small>
              <span>{terrain.minElevation.toFixed(1)}–{terrain.maxElevation.toFixed(1)} m</span>
              <small>{terrain.width} × {terrain.height} · {ui("pré-visualização")}</small>
            </div>}
            <div className="gm-terrain-native-actions">
              <button type="button" disabled={!terrain} onClick={saveScene}>
                <Download size={14}/> {ui("Guardar .geomoz")}
              </button>
              <input className="sr-only" ref={sceneInputRef} type="file" accept=".geomoz"
                aria-label={ui("Reabrir cena do terreno")} onChange={event=>void loadScene(event.target.files?.[0])}/>
              <button type="button" onClick={()=>sceneInputRef.current?.click()}>{ui("Reabrir cena")}</button>
              <button type="button" disabled={!terrain} onClick={exportGLB} data-testid="geomoz-terrain-export-glb">GLB 3D</button>
              <button type="button" disabled={!terrain||!!rendererError||viewMode==="map"} onClick={downloadPNG}>PNG</button>
              <button type="button" disabled={!terrain||!!rendererError||viewMode==="map"} onClick={()=>void downloadPDF()}>PDF</button>
            </div>
            <p className="gm-terrain-native-hint">As camadas vectoriais do 3D ficam disponíveis na vista actual. O GLB exportado contém a malha do DEM; a textura vectorial deve ser exportada separadamente numa próxima versão.</p>
          </>}
        </div>
        <div className="gm-terrain-vertical-panel" data-testid="terrain-workspace-exaggeration">
          <div className="gm-terrain-vertical-heading">
            <label htmlFor="gm-terrain-exaggeration">{ui("3. Exagero vertical")}</label>
            <strong>{exaggeration.toFixed(1)}×</strong>
          </div>
          <input id="gm-terrain-exaggeration" type="range" min="1" max="15" step=".5"
            value={exaggeration} disabled={!terrain} aria-label={ui("Exagero vertical")}
            onChange={event=>setExaggeration(Number(event.target.value))}/>
          <div className="gm-terrain-vertical-footer">
            <small>{ui("Ajuste apenas visual; as altitudes do DEM mantêm-se.")}</small>
            <button type="button" disabled={!terrain} aria-label={ui("Restaurar exagero vertical")}
              onClick={()=>setExaggeration(2)}><RotateCcw size={13}/> 2×</button>
          </div>
        </div>
        <div className="gm-terrain-display-options">
          <details>
            <summary>Visualização do relevo</summary>
            <label className="gm-terrain-native-label">{ui("Estilo de relevo")}
              <select value={style} onChange={e=>setStyle(e.target.value as TerrainVisualStyle)}>
                <option value="hypsometric">{ui("Hipsometria · relevo sombreado")}</option>
                <option value="grayscale">{ui("Relevo em escala de cinzentos")}</option>
              </select>
            </label>
            <label className="gm-terrain-native-label">{ui("Nível de detalhe do relevo")}
              <select value={detailLevel} aria-label={ui("Detalhe do terreno 3D")}
                onChange={event=>setDetailLevel(event.target.value as typeof detailLevel)}>
                <option value="auto">{ui("Automático com o zoom")}</option>
                <option value="full">{ui("Detalhe máximo")}</option>
                <option value="medium">{ui("LOD 2 · equilibrado")}</option>
                <option value="low">{ui("LOD 4 · rápido")}</option>
              </select>
            </label>
            <button type="button" className="gm-terrain-native-reset"
              onClick={()=>{setExaggeration(2);setStyle("hypsometric");}}>
              <RotateCcw size={13}/> {ui("Restaurar estilo")}
            </button>
          </details>
        </div>
      </aside>
      <div className="gm-terrain-native-viewport" aria-label={ui("Visualizador tridimensional")}>
        {terrain&&<nav className="gm-terrain-view-switch" aria-label={ui("Modos de visualização do terreno")}>
          {([
            ["model","Modelo 3D",Box],
            ["map","Modelo sobre mapa 3D",MapIcon],
            ["split","2D / 3D",Columns2]
          ] as const).map(([mode,label,Icon])=><button key={mode} type="button"
            className={viewMode===mode?"gm-terrain-view-active":""}
            data-testid={"terrain-view-"+mode}
            aria-pressed={viewMode===mode}
            disabled={mode!=="model"&&!validTerrainGeography(terrain)}
            onClick={()=>setViewMode(mode)}><Icon size={15}/>{ui(label)}</button>)}
        </nav>}
        {terrain?<div className={"gm-terrain-comparison gm-terrain-comparison-"+viewMode}>
          {viewMode!=="map"&&<div className="gm-terrain-model-pane" aria-label={ui("Modelo local de elevação 3D")}>
            <canvas ref={canvasRef} className="gm-terrain-native-canvas"
              data-testid="geomoz-native-terrain-canvas"
              aria-label={ui("Modelo 3D do terreno. Clique para seleccionar um ponto do perfil.")}/>
            <div className="gm-terrain-native-help">
              {pickTarget?ui("Clique na superfície para definir o ponto ")+pickTarget:
                ui("Arrastar: rodar · Roda: aproximar · Escolher A/B: consultar elevação")}
            </div>
          </div>}
          {viewMode!=="model"&&<div className="gm-terrain-map-pane"
            aria-label={ui("Localização do DEM no basemap")}>
            <GeoMozTerrainGeoMap terrain={terrain} overlays={overlays}
              exaggeration={exaggeration} style={style}
              vectorTexture={overlayTexture}
              rasterTexture={drapeTexture}
              rasterOpacity={drapeTexture?1:0}
              flat={viewMode==="split"} translate={ui}/>
          </div>}
        </div>:
          <div className="gm-terrain-native-empty">
            <ImageIcon size={42}/>
            <strong>{ui("Terreno 3D do projecto SIG")}</strong>
            <p>{ui("Seleccione uma camada DEM GeoTIFF existente e clique em «Visualizar camada em 3D».")}</p>
          </div>}
        {rendererError&&viewMode!=="map"&&<p className="gm-terrain-render-error" role="alert">{rendererError}</p>}
      </div>
    </div>
  </section>;
}
