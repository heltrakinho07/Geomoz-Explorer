/**
 * Native GeoMoz 3D terrain inside the existing GeoLibre GIS project.
 *
 * This component shares the actual layer store: no iframe, second app login or
 * postMessage, and no file re-selection. Source COG bytes are read under a
 * bounded stream; no original DEM is uploaded or saved on a second server.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@geolibre/core";
import type { FeatureCollection } from "geojson";
import { terrainRasterLayerOptions } from "../../lib/terrain-raster-layer";
import {
  ArrowLeft, Layers3, Loader2, Mountain, RotateCcw,
  Download, Image as ImageIcon, X,
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
  const [exaggeration,setExaggeration]=useState(2);
  const [pickTarget,setPickTarget]=useState<Target|null>(null);
  const [lastPick,setLastPick]=useState<TerrainPickedPoint|null>(null);
  const [picked,setPicked]=useState<Partial<Record<Target,TerrainPick>>>({});
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneInputRef=useRef<HTMLInputElement>(null);
  const abortRef=useRef<AbortController|null>(null);

  useEffect(()=>{
    if(!open)return;
    setSelected(current=>{
      const next=[preferredLayerId,currentId,current].find(id=>id&&options.some(o=>o.id===id));
      return next??options[0]?.id??"";
    });
  },[open,preferredLayerId,currentId,options]);

  // On close the current source layer is untouched. Stop any pending transfer.
  useEffect(()=>{
    if(!open){abortRef.current?.abort();abortRef.current=null;setPickTarget(null);}
    return ()=>{abortRef.current?.abort();};
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
    if(!open||!terrain||!canvasRef.current)return;
    setRendererError(null);
    try {
      return createTerrainRenderer(canvasRef.current,terrain,{
        exaggeration,style,
        pickEnabled:!!pickTarget,onPick:selectPoint,
        profileOverlay:picked.A&&picked.B?
          {start:[picked.A.xMeters,picked.A.yMeters],
           end:[picked.B.xMeters,picked.B.yMeters]}:null
      });
    }catch(cause){
      setRendererError(cause instanceof Error?cause.message:"O WebGL2 não pôde carregar o modelo.");
    }
  },[open,terrain,exaggeration,style,pickTarget,picked]);

  async function openSelectedDEM(){
    const layer=options.find(o=>o.id===selected);
    if(!layer){setError("Seleccione um DEM GeoTIFF no catálogo do projecto.");return;}
    abortRef.current?.abort();
    const controller=new AbortController();abortRef.current=controller;
    setBusy(true);setError(null);setNotice("A processar o DEM seleccionado…");
    try {
      const bytes=await fetchBoundedTerrain(layer.source,controller.signal);
      const preview=await geomozNativeTerrainPreview(bytes,layer.name);
      if(controller.signal.aborted)return;
      setTerrain(preview);setPicked({});setLastPick(null);setPickTarget(null);
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
      pdf.setFontSize(13);pdf.text("GeoMoz · Terreno 3D",12,17);
      pdf.setFontSize(9);pdf.text(projectName+" · "+terrain.name+" · "+terrain.crs,12,24);
      const aspect=canvas.width/Math.max(canvas.height,1);
      const w=Math.min(273,150*aspect),h=w/aspect;
      pdf.addImage(canvas.toDataURL("image/png"),"PNG",(297-w)/2,32,w,h);
      pdf.setFontSize(8);
      pdf.text("Pré-visualização do DEM. A perspectiva não tem escala constante.",12,194);
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
    aria-label="Terreno 3D do GIS Workspace">
    <header className="gm-terrain-workspace-toolbar">
      <div className="gm-terrain-workspace-title"><Mountain size={19}/>
        <div><strong>Terreno 3D</strong><small>GIS Workspace · {projectName||"Projecto actual"}</small></div>
      </div>
      <label className="gm-terrain-workspace-selector">
        <Layers3 size={15}/><span>DEM do projecto</span>
        <select value={selected} onChange={event=>setSelected(event.target.value)}
          aria-label="Seleccionar DEM do GIS Workspace">
          {!options.length&&<option value="">Nenhuma camada GeoTIFF disponível</option>}
          {options.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}
        </select>
      </label>
      <button type="button" className="gm-terrain-workspace-load" disabled={busy||!options.length}
        data-testid="geomoz-workbench-terrain-import" onClick={()=>void openSelectedDEM()}>
        {busy?<Loader2 size={15} className="gm-terrain-spin"/>:<Mountain size={15}/>}
        {busy?"A processar DEM…":"Visualizar camada em 3D"}
      </button>
      <button type="button" className="gm-terrain-workspace-close"
        aria-label="Voltar ao mapa GIS" onClick={onClose}>
        <ArrowLeft size={15}/> Voltar ao mapa <X size={14}/>
      </button>
    </header>
    {error&&<p className="gm-terrain-workspace-error" role="alert">{error}</p>}
    {!error&&notice&&<p className="gm-terrain-workspace-notice" role="status">{notice}</p>}
    <div className="gm-terrain-native">
      <aside className="gm-terrain-native-sidebar">
        <h3>Dados, relevo e análise</h3>
        <p>Modelo gerado a partir de uma camada do projecto GIS, sem reimportar o raster.</p>
        <div className="gm-terrain-native-actions">
          <button type="button" disabled={!terrain} onClick={saveScene}>
            <Download size={14}/> Guardar .geomoz
          </button>
          <input className="sr-only" ref={sceneInputRef} type="file" accept=".geomoz"
            aria-label="Reabrir cena do terreno" onChange={event=>void loadScene(event.target.files?.[0])}/>
          <button type="button" onClick={()=>sceneInputRef.current?.click()}>Reabrir cena</button>
          <button type="button" disabled={!terrain||!!rendererError} onClick={downloadPNG}>PNG</button>
          <button type="button" disabled={!terrain||!!rendererError} onClick={()=>void downloadPDF()}>PDF</button>
        </div>
        {terrain&&<div className="gm-terrain-native-info">
          <strong>{terrain.name}</strong>
          <small>{terrain.sourceCrs} → {terrain.crs}</small>
          <span>{terrain.minElevation.toFixed(1)}–{terrain.maxElevation.toFixed(1)} m</span>
          <small>{terrain.width} × {terrain.height} · pré-visualização</small>
        </div>}
        <label className="gm-terrain-native-label">Estilo de relevo
          <select value={style} onChange={e=>setStyle(e.target.value as TerrainVisualStyle)}>
            <option value="hypsometric">Hipsometria · relevo sombreado</option>
            <option value="grayscale">Relevo em escala de cinzentos</option>
          </select>
        </label>
        <label className="gm-terrain-native-label">Exagero vertical · {exaggeration.toFixed(1)}×
          <input type="range" min="1" max="15" step=".5" value={exaggeration}
            onChange={event=>setExaggeration(Number(event.target.value))}/>
        </label>
        <button type="button" className="gm-terrain-native-reset"
          onClick={()=>{setExaggeration(2);setStyle("hypsometric");}}>
          <RotateCcw size={13}/> Restaurar estilo
        </button>
        {terrain&&<GeoMozTerrainSciencePanel terrain={terrain}
          pickedPoint={lastPick} activePickTarget={pickTarget}
          onRequestPick={setPickTarget}
          onAddContours={addContours} onAddProfile={addProfile}/>}
        <p className="gm-terrain-native-hint">
          Os resultados científicos provêm da malha simplificada. Para cálculos finais,
          execute as ferramentas de geoprocessamento sobre o GeoTIFF original.
        </p>
      </aside>
      <div className="gm-terrain-native-viewport" aria-label="Visualizador tridimensional">
        {terrain?<canvas ref={canvasRef} className="gm-terrain-native-canvas"
          data-testid="geomoz-native-terrain-canvas"
          aria-label="Modelo 3D do terreno. Clique para seleccionar um ponto do perfil."/>:
        <div className="gm-terrain-native-empty">
          <ImageIcon size={42}/>
          <strong>Terreno 3D do projecto SIG</strong>
          <p>Seleccione uma camada DEM GeoTIFF existente e clique em «Visualizar camada em 3D».</p>
        </div>}
        {terrain&&<div className="gm-terrain-native-help">
          {pickTarget?"Clique na superfície para definir o ponto "+pickTarget:
            "Arrastar: rodar · Roda: aproximar · Escolher A/B: consultar elevação"}
        </div>}
        {rendererError&&<p className="gm-terrain-render-error" role="alert">{rendererError}</p>}
      </div>
    </div>
  </section>;
}
