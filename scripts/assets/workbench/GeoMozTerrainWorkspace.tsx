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
  Download, Image as ImageIcon, X, Palette, BarChart3, Settings2, FileArchive, ZoomIn, Layers,
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
import { encodeTerrainGLB, imageToGLBTexture } from "../../lib/geomoz-terrain-glb";
import {GeoMozTerrainLayerCatalogue,GeoMozTerrainLayerSymbology}
  from "./GeoMozTerrainLayerPanels";
import {composeTerrainTexture,createPolygonOverlay,generateOverlayId,
  type TerrainOverlay} from "./geomoz-terrain-layers";
import {importTerrainRasterOverlay} from "./geomoz-terrain-raster-overlay";
import {loadWorldCoverFromAuthenticatedGeoMoz} from "./geomoz-terrain-gee-bridge";
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
  const [exaggeration,setExaggeration]=useState(2);
  const [overlays,setOverlays]=useState<TerrainOverlay[]>([]);
  const [selectedOverlay,setSelectedOverlay]=useState<string|null>(null);
  const [inspectorTab,setInspectorTab]=useState<"symbols"|"analysis"|"terrain"|"export">("terrain");
  const [textureUrl,setTextureUrl]=useState<string|null>(null);
  const [importBusy,setImportBusy]=useState(false);
  const [loadingLandcover,setLoadingLandcover]=useState(false);
  const [exportBusy,setExportBusy]=useState(false);
  const textureVersion=useRef(0);
  const [pickTarget,setPickTarget]=useState<Target|null>(null);
  const [lastPick,setLastPick]=useState<TerrainPickedPoint|null>(null);
  const [picked,setPicked]=useState<Partial<Record<Target,TerrainPick>>>({});
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneInputRef=useRef<HTMLInputElement>(null);
  const abortRef=useRef<AbortController|null>(null);
  const projectVectors=useMemo(()=>layers.filter(layer=>
    layer.geojson?.features.some(feature=>
      feature.geometry?.type==="Polygon"||feature.geometry?.type==="MultiPolygon"))
    .map(layer=>({id:layer.id,name:layer.name,geojson:layer.geojson!})),[layers]);

  useEffect(()=>{
    setOverlays([]);setSelectedOverlay(null);setTextureUrl(null);
    textureVersion.current++;
  },[terrain]);
  useEffect(()=>{
    if(!open||!terrain)return;
    const version=++textureVersion.current;
    composeTerrainTexture(terrain,overlays).then(texture=>{
      if(version===textureVersion.current)setTextureUrl(texture);
    }).catch(cause=>{
      if(version===textureVersion.current)setError(
        cause instanceof Error?cause.message:"Falha na composição de camadas 3D.");
    });
    return ()=>{textureVersion.current++;};
  },[open,terrain,overlays]);
  const currentOverlay=overlays.find(o=>o.id===selectedOverlay)??null;
  const updateOverlay=(layer:TerrainOverlay)=>
    setOverlays(current=>current.map(item=>item.id===layer.id?layer:item));
  const chooseOverlay=(id:string)=>{
    setSelectedOverlay(id);setInspectorTab("symbols");
  };

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
        exaggeration,style: textureUrl?"imagery":style,detailLevel,textureUrl,
        pickEnabled:!!pickTarget,onPick:selectPoint,
        profileOverlay:picked.A&&picked.B?
          {start:[picked.A.xMeters,picked.A.yMeters],
           end:[picked.B.xMeters,picked.B.yMeters]}:null
      });
    }catch(cause){
      setRendererError(cause instanceof Error?cause.message:"O WebGL2 não pôde carregar o modelo.");
    }
  },[open,terrain,exaggeration,style,detailLevel,textureUrl,pickTarget,picked]);

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
  async function exportGLB(){
    if(!terrain||exportBusy)return;
    setError(null);setExportBusy(true);
    try {
      const texture=textureUrl?await imageToGLBTexture(textureUrl):undefined;
      const bytes=encodeTerrainGLB(terrain,exaggeration,texture?"imagery":style,texture);
      saveBlob(new Blob([new Uint8Array(bytes)],{type:"model/gltf-binary"}),
        "geomoz_terreno_3d.glb");
      setNotice("Modelo GLB exportado em metros com metadados do CRS do projecto.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha ao exportar GLB.");}
    finally{setExportBusy(false);}
  }
  function addProjectVector(id:string){
    if(!terrain)return;
    const source=projectVectors.find(x=>x.id===id);
    if(!source){setError("A camada não está disponível no projecto.");return;}
    try{
      const overlay=createPolygonOverlay(source.name,source.geojson,"project",generateOverlayId());
      setOverlays(v=>[...v,overlay]);chooseOverlay(overlay.id);
      setNotice("Camada vectorial sobreposta ao DEM e recortada à sua extensão.");
      setError(null);
    }catch(cause){setError(cause instanceof Error?cause.message:"GeoJSON inválido.");}
  }
  async function importOverlay(file:File){
    if(!terrain||importBusy)return;
    setError(null);setImportBusy(true);
    try{
      if(file.size===0||file.size>(/\.tiff?$/i.test(file.name)?32:8)*1024*1024)
        throw Error("Limite: GeoJSON até 8 MB; GeoTIFF até 32 MB.");
      let overlay:TerrainOverlay;
      if(/\.(geojson|json)$/i.test(file.name)){
        overlay=createPolygonOverlay(file.name,JSON.parse(await file.text()),
          "file",generateOverlayId());
      }else if(/\.tiff?$/i.test(file.name)){
        overlay=await importTerrainRasterOverlay(await file.arrayBuffer(),file.name,terrain,
          generateOverlayId());
      }else throw Error("Formato não suportado. Utilize GeoJSON ou GeoTIFF.");
      setOverlays(current=>[...current,overlay]);chooseOverlay(overlay.id);
      setNotice("Camada carregada e alinhada com a extensão métrica do DEM.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Erro ao importar camada.");}
    finally{setImportBusy(false);}
  }
  async function addGEEWorldCover(){
    if(!terrain||loadingLandcover)return;
    setError(null);setLoadingLandcover(true);
    try{
      const overlay=await loadWorldCoverFromAuthenticatedGeoMoz(terrain);
      setOverlays(current=>[...current,overlay]);chooseOverlay(overlay.id);
      setNotice("ESA WorldCover 2021 alinhado à grelha DEM, classes preservadas.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Falha no Earth Engine.");}
    finally{setLoadingLandcover(false);}
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
    <div className="gm-terrain-native" data-testid="geomoz-terrain-multipanel">
      <GeoMozTerrainLayerCatalogue layers={overlays} selectedId={selectedOverlay}
        projectVectors={projectVectors} busy={importBusy||busy}
        loadingGEE={loadingLandcover}
        onSelect={chooseOverlay} onChange={setOverlays}
        onFromProject={addProjectVector}
        onImport={file=>void importOverlay(file)}
        onWorldCover={()=>void addGEEWorldCover()}/>
      <main className="gm-terrain-native-viewport" aria-label={ui("Visualizador tridimensional")}>
        {terrain?<canvas ref={canvasRef} className="gm-terrain-native-canvas"
          data-testid="geomoz-native-terrain-canvas"
          aria-label={ui("Modelo 3D do terreno. Clique para seleccionar um ponto do perfil.")}/>:
        <div className="gm-terrain-native-empty">
          <ImageIcon size={42}/>
          <strong>{ui("Terreno 3D do projecto SIG")}</strong>
          <p>{ui("Seleccione uma camada DEM GeoTIFF existente e clique em «Visualizar camada em 3D».")}</p>
        </div>}
        {terrain&&<div className="gm-terrain-map-badges">
          <span><Mountain size={13}/> DEM · {terrain.name}</span>
          {overlays.filter(o=>o.visible).map(layer=><span key={layer.id}>
            <span className="gm-terrain-map-dot"
              style={{background:layer.categories[0]?.color??layer.singleColor}}/>
            {layer.name} · {Math.round(layer.opacity*100)}%
          </span>)}
        </div>}
        {terrain&&<div className="gm-terrain-map-actions">
          <button type="button" onClick={()=>setInspectorTab("analysis")}>
            <BarChart3 size={14}/> Análise e medições
          </button>
          <button type="button" onClick={()=>setInspectorTab("symbols")}>
            <Palette size={14}/> Simbologia
          </button>
        </div>}
        {terrain&&<div className="gm-terrain-native-help">
          {pickTarget?ui("Clique na superfície para definir o ponto ")+pickTarget:
            ui("Arrastar: rodar · Roda: aproximar · Escolher A/B: consultar elevação")}
        </div>}
        {rendererError&&<p className="gm-terrain-render-error" role="alert">{rendererError}</p>}
      </main>
      <aside className="gm-terrain-inspector" aria-label="Ferramentas do terreno 3D">
        <nav className="gm-terrain-inspector-tabs" role="tablist" aria-label="Painéis do terreno 3D">
          {([
            ["symbols","Simbologia",Palette],["analysis","Análise",BarChart3],
            ["terrain","Terreno",Settings2],["export","Exportar",FileArchive]
          ] as const).map(([key,label,Icon])=>
            <button type="button" role="tab" aria-selected={inspectorTab===key}
              data-testid={"geomoz-terrain-tab-"+key}
              className={inspectorTab===key?"is-active":""} key={key}
              onClick={()=>setInspectorTab(key)}><Icon size={15}/><span>{ui(label)}</span></button>)}
        </nav>
        <div className="gm-terrain-inspector-body" role="tabpanel">
          {inspectorTab==="symbols"&&<GeoMozTerrainLayerSymbology
            layer={currentOverlay} onChange={updateOverlay}/>}
          {inspectorTab==="analysis"&&<div className="gm-terrain-inspector-section">
            <h3>{ui("Análise científica do DEM")}</h3>
            {terrain?<GeoMozTerrainSciencePanel terrain={terrain} translate={ui}
              pickedPoint={lastPick} activePickTarget={pickTarget}
              onRequestPick={setPickTarget}
              onAddContours={addContours} onAddProfile={addProfile}/>:
              <p>Carregue um DEM para calcular perfis, declives e curvas de nível.</p>}
          </div>}
          {inspectorTab==="terrain"&&<div className="gm-terrain-inspector-section">
            <h3>Visualização do relevo</h3>
            <p className="gm-terrain-panel-intro">
              As opções deste painel afectam o modelo. Os controlos de cada camada
              estão no separador Simbologia.
            </p>
            {terrain&&<div className="gm-terrain-native-info">
              <strong>{terrain.name}</strong>
              <small>{terrain.sourceCrs} → {terrain.crs}</small>
              <span>{terrain.minElevation.toFixed(1)}–{terrain.maxElevation.toFixed(1)} m</span>
              <small>{terrain.width} × {terrain.height} · {ui("pré-visualização")}</small>
            </div>}
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
            <label className="gm-terrain-native-label">{ui("Exagero vertical")} · {exaggeration.toFixed(1)}×
              <input type="range" min="1" max="15" step=".5" value={exaggeration}
                onChange={event=>setExaggeration(Number(event.target.value))}/>
            </label>
            <button type="button" className="gm-terrain-native-reset"
              onClick={()=>{setExaggeration(2);setStyle("hypsometric");setDetailLevel("auto");}}>
              <RotateCcw size={13}/> {ui("Restaurar estilo")}
            </button>
            <div className="gm-terrain-clip-banner">
              <Layers size={16}/>
              <span>O DEM mantém-se independente. Sobreposições são recortadas à
                sua extensão e ajustadas em simbologia sem alterar o ficheiro.</span>
            </div>
          </div>}
          {inspectorTab==="export"&&<div className="gm-terrain-inspector-section">
            <h3>Exportação cartográfica 3D</h3>
            <p className="gm-terrain-panel-intro">
              PNG/PDF exportam a vista actual. GLB inclui a malha em metros
              e, quando existir, a composição de camadas como textura.
            </p>
            <div className="gm-terrain-native-actions">
              <button type="button" disabled={!terrain} onClick={saveScene}>
                <Download size={14}/> {ui("Guardar .geomoz")}
              </button>
              <input className="sr-only" ref={sceneInputRef} type="file" accept=".geomoz"
                aria-label={ui("Reabrir cena do terreno")}
                onChange={event=>void loadScene(event.target.files?.[0])}/>
              <button type="button" onClick={()=>sceneInputRef.current?.click()}>
                {ui("Reabrir cena")}
              </button>
              <button type="button" disabled={!terrain||exportBusy}
                onClick={()=>void exportGLB()} data-testid="geomoz-terrain-export-glb">
                {exportBusy?<Loader2 size={14} className="gm-terrain-spin"/>:<Download size={14}/>}
                GLB 3D
              </button>
              <button type="button" disabled={!terrain||!!rendererError}
                onClick={downloadPNG}>PNG</button>
              <button type="button" disabled={!terrain||!!rendererError}
                onClick={()=>void downloadPDF()}>PDF</button>
            </div>
            <p className="gm-terrain-panel-intro">
              A cena .geomoz guarda a pré-visualização DEM, mas as camadas temporárias
              são exportadas com a visualização GLB. Para conservar os dados originais,
              guarde-os no projecto SIG.
            </p>
          </div>}
        </div>
      </aside>
    </div>
  </section>;
}
