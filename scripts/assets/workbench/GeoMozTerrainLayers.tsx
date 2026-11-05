import { useMemo, useRef, useState } from "react";
import { FileUp, Layers3, Eye, EyeOff, Palette, Trash2, Loader2, XCircle } from "lucide-react";
import type { FeatureCollection } from "geojson";
import type { GeoMozTerrainOverlay } from "./geomoz-terrain-overlays";
import type { GeoMozRasterDrape } from "./geomoz-terrain-raster-overlay";
import {
  defaultTerrainOverlay, overlayCategoryValues, overlayFields,
  validateOverlayGeoJSON
} from "./geomoz-terrain-overlays";
import "./geomoz-terrain-workspace.css";

interface SourceLayer {
  id:string;name:string;type:string;visible:boolean;opacity:number;
  geojson?:FeatureCollection;
  style?:{fillColor?:string;strokeColor?:string;vectorStyleMode?:string;vectorStyleProperty?:string;vectorStyleStops?:{value:string|number;color:string}[]};
}
interface Props {
  layers:readonly SourceLayer[];
  overlays:GeoMozTerrainOverlay[];
  onChange:(next:GeoMozTerrainOverlay[])=>void;
  activePanel:"layers"|"style";
  terrainReady:boolean;
  onNotice:(message:string)=>void;
  rasterOptions:readonly {id:string;name:string;source:string}[];
  raster:(GeoMozRasterDrape & {opacity:number;visible:boolean})|null;
  rasterBusy:boolean;
  rasterProgress:{label:string;percent:number|null}|null;
  onCancelRaster:()=>void;
  onRasterChange:(next:(GeoMozRasterDrape & {opacity:number;visible:boolean})|null)=>void;
  onImportRaster:(input:File|{source:string;name:string})=>Promise<void>;
}
export default function GeoMozTerrainLayers({
  layers,overlays,onChange,activePanel,terrainReady,onNotice,
  rasterOptions,raster,rasterBusy,rasterProgress,onCancelRaster,onRasterChange,onImportRaster
}:Props) {
  const upload=useRef<HTMLInputElement>(null);
  const rasterInput=useRef<HTMLInputElement>(null);
  const [rasterSource,setRasterSource]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [projectId,setProjectId]=useState("");
  const [loadError,setLoadError]=useState("");
  const candidates=useMemo(
    ()=>layers.filter(l=>l.type==="geojson"&&l.geojson&&l.geojson.features?.length),
    [layers]
  );
  const selected=overlays.find(l=>l.id===selectedId)??overlays[overlays.length-1]??null;
  const update=(id:string,change:Partial<GeoMozTerrainOverlay>)=>{
    onChange(overlays.map(l=>l.id===id?{...l,...change}:l));
  };
  function addProjectLayer(){
    const layer=candidates.find(l=>l.id===projectId)||candidates[0];
    if(!layer?.geojson)return;
    if(overlays.some(o=>o.id==="project-"+layer.id)){
      setSelectedId("project-"+layer.id);onNotice("A camada já está na vista 3D.");return;
    }
    try {
      const item=defaultTerrainOverlay("project-"+layer.id,layer.name,layer.geojson,
        layer.opacity,layer.style?.fillColor,layer.style?.strokeColor);
      // Honour a categorized renderer already authored in the 2D GIS Workspace.
      const original=layer.style;
      if(original?.vectorStyleMode==="categorized"&&original.vectorStyleProperty){
        item.mode="categorized";
        item.field=original.vectorStyleProperty;
        const legend=Object.fromEntries((original.vectorStyleStops??[])
          .filter(stop=>/^#[a-f\\d]{6}$/i.test(stop.color))
          .map(stop=>[String(stop.value),stop.color]));
        item.categories={...item.categories,...legend};
      }
      onChange([...overlays,item]);setSelectedId(item.id);
      setLoadError("");onNotice("Camada do catálogo adicionada ao terreno 3D.");
    }catch(e){setLoadError(e instanceof Error?e.message:"Não foi possível ler a camada.");}
  }
  async function addFile(file:File|undefined){
    if(!file)return;
    setLoadError("");
    try{
      if(file.size===0||file.size>12*1024*1024||!/\.(geojson|json)$/i.test(file.name))
        throw Error("Utilize um GeoJSON válido de até 12 MB.");
      const parsed:unknown=JSON.parse(await file.text());
      const geojson=validateOverlayGeoJSON(parsed);
      const item=defaultTerrainOverlay("file-"+crypto.randomUUID(),file.name,geojson);
      onChange([...overlays,item]);setSelectedId(item.id);
      onNotice("Camada GeoJSON importada e ajustada à extensão do DEM.");
    }catch(e){setLoadError(e instanceof Error?e.message:"Falha ao importar GeoJSON.");}
    finally{if(upload.current)upload.current.value="";}
  }
  const fields=selected?overlayFields(selected.geojson):[];
  const values=useMemo(()=>{
    if(!selected?.field||selected.mode!=="categorized")return [];
    try {return overlayCategoryValues(selected.geojson,selected.field);}
    catch {return [];}
  },[selected]);
  function setField(field:string){
    if(!selected)return;
    try {
      const values=overlayCategoryValues(selected.geojson,field);
      const palette=["#0284c7","#16a34a","#f97316","#8b5cf6","#db2777","#eab308","#0891b2","#b45309"];
      const categories=Object.fromEntries(values.map((v,i)=>[v,palette[i%palette.length]]));
      update(selected.id,{field,categories});
      setLoadError("");
    }catch(e){setLoadError(e instanceof Error?e.message:"Demasiadas categorias.");}
  }
  if(activePanel==="layers")return <section className="gm-terrain-layers" aria-label="Camadas no terreno 3D">
    <div className="gm-terrain-panel-heading"><Layers3 size={17}/><strong>Camadas sobre o relevo</strong></div>
    <p>Adicione geologia, solos, uso do solo e outras camadas vectoriais do projecto. A extensão do DEM limita automaticamente a visualização.</p>
    <label className="gm-terrain-native-label">Camadas do GIS Workspace
      <select aria-label="Seleccionar camada vectorial do projecto" value={projectId}
        onChange={e=>setProjectId(e.target.value)}>
        <option value="">Escolher uma camada existente…</option>
        {candidates.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
    <button type="button" className="gm-terrain-layer-add"
      disabled={!terrainReady||!candidates.length}
      onClick={addProjectLayer}>Adicionar camada do projecto</button>
    <input ref={upload} type="file" accept=".geojson,.json,application/geo+json" className="sr-only"
      aria-label="Importar GeoJSON para terreno 3D" onChange={e=>void addFile(e.target.files?.[0])}/>
    <button type="button" className="gm-terrain-layer-secondary" disabled={!terrainReady}
      onClick={()=>upload.current?.click()}><FileUp size={14}/> Importar GeoJSON WGS84</button>
    {loadError&&<p role="alert" className="gm-terrain-layer-error">{loadError}</p>}
    <div className="gm-terrain-panel-heading"><strong>Rasters temáticos georreferenciados</strong></div>
    <p>GeoTIFF de uso do solo, classes pedológicas ou imagem RGB: a grelha é reprojetada e limitada automaticamente ao DEM.</p>
    <label className="gm-terrain-native-label">Raster do catálogo SIG
      <select value={rasterSource} aria-label="Escolher raster temático"
        onChange={e=>setRasterSource(e.target.value)}>
        <option value="">Seleccionar GeoTIFF existente…</option>
        {rasterOptions.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
    <button type="button" className="gm-terrain-layer-secondary" disabled={!terrainReady||rasterBusy||!rasterSource}
      onClick={()=>{const o=rasterOptions.find(o=>o.id===rasterSource);if(o)void onImportRaster({source:o.source,name:o.name});}}>
      {rasterBusy?"A alinhar raster…":"Sobrepor raster do projecto"}
    </button>
    <input ref={rasterInput} type="file" className="sr-only" accept=".tif,.tiff,image/tiff"
      aria-label="Importar GeoTIFF temático" onChange={e=>{
        const file=e.target.files?.[0];if(file)void onImportRaster(file);
        e.target.value="";
      }}/>
    <button type="button" disabled={!terrainReady||rasterBusy} className="gm-terrain-layer-secondary"
      onClick={()=>rasterInput.current?.click()}><FileUp size={14}/> Importar GeoTIFF temático</button>
    {rasterBusy&&<div className="gm-terrain-import-progress" data-testid="geomoz-terrain-raster-progress"
      aria-label="Progresso da importação de raster">
      <div role="status" aria-live="polite" className="gm-terrain-import-status">
        <Loader2 size={15} className="gm-terrain-spin" aria-hidden="true"/>
        <span>{rasterProgress?.label??"A preparar GeoTIFF temático…"}</span>
        {rasterProgress?.percent!==null&&rasterProgress?.percent!==undefined&&
          <strong>{rasterProgress.percent}%</strong>}
      </div>
      <progress aria-label="Progresso do raster" max={100}
        value={rasterProgress?.percent??undefined}/>
      <button type="button" className="gm-terrain-import-cancel" onClick={onCancelRaster}
        data-testid="geomoz-terrain-raster-cancel"><XCircle size={15} aria-hidden="true"/> Cancelar importação</button>
    </div>}
    {raster&&<div className="gm-terrain-layer-raster">
      <div className="gm-terrain-panel-heading">
        <button type="button" aria-label={raster.visible?"Ocultar raster":"Mostrar raster"}
          onClick={()=>onRasterChange({...raster,visible:!raster.visible})}>
          {raster.visible?<Eye size={15}/>:<EyeOff size={15}/>}
        </button>
        <strong title={raster.name}>{raster.name}</strong>
        <button type="button" aria-label="Remover raster temático" onClick={()=>onRasterChange(null)}><Trash2 size={14}/></button>
      </div>
      <small>{raster.mode==="classified"?"Raster categorizado":"Imagem RGB"} · {Math.round(raster.coverage*100)}% do DEM</small>
      <label className="gm-terrain-native-label">Transparência do raster · {Math.round((1-raster.opacity)*100)}%
        <input type="range" aria-label="Transparência do raster" min="0" max="100"
          value={Math.round((1-raster.opacity)*100)}
          onChange={e=>onRasterChange({...raster,opacity:1-Number(e.target.value)/100})}/>
      </label>
      {raster.categories.length>0&&<div className="gm-terrain-categories">
        <strong>Classes identificadas ({raster.categories.length})</strong>
        {raster.categories.map(c=><div key={c.value} className="gm-terrain-raster-legend">
          <span style={{background:c.color}}/><small>{c.label} ({c.value})</small>
        </div>)}
      </div>}
    </div>}
    <div className="gm-terrain-panel-heading"><strong>Camadas aplicadas ({overlays.length})</strong></div>
    {overlays.length===0&&<p className="gm-terrain-layer-empty">Sem sobreposições. Adicione uma camada e ajuste a respectiva simbologia no separador «Simbologia».</p>}
    {overlays.map(layer=><div className={"gm-terrain-layer-item "+(selected?.id===layer.id?"gm-terrain-layer-selected":"")} key={layer.id}>
      <button type="button" aria-label={layer.visible?"Ocultar "+layer.name:"Mostrar "+layer.name}
        onClick={()=>update(layer.id,{visible:!layer.visible})}>
        {layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}
      </button>
      <button type="button" className="gm-terrain-layer-name" onClick={()=>setSelectedId(layer.id)}
        aria-current={selected?.id===layer.id?"true":undefined}>
        <span style={{background:layer.mode==="categorized"?"linear-gradient(135deg,#16a34a 0 33%,#f97316 33% 66%,#8b5cf6 66%)":layer.color}}/>
        <strong>{layer.name}</strong><small>{layer.geojson.features.length} elementos</small>
      </button>
      <button type="button" aria-label={"Remover "+layer.name}
        onClick={()=>{onChange(overlays.filter(o=>o.id!==layer.id));if(selectedId===layer.id)setSelectedId("");}}><Trash2 size={15}/></button>
    </div>)}
    <p className="gm-terrain-layer-hint">A camada original mantém-se no catálogo 2D. A sobreposição respeita as áreas sem dados do DEM.</p>
  </section>;
  return <section className="gm-terrain-layers" aria-label="Simbologia das camadas 3D">
    <div className="gm-terrain-panel-heading"><Palette size={17}/><strong>Simbologia e transparência</strong></div>
    {!selected?<p>Adicione uma camada no separador «Camadas» para configurar símbolos, categorias e transparência.</p>:<>
      <label className="gm-terrain-native-label">Camada
        <select aria-label="Camada a simbolizar" value={selected.id} onChange={e=>setSelectedId(e.target.value)}>
          {overlays.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="gm-terrain-native-label">Renderização
        <select value={selected.mode} aria-label="Modo de simbologia"
          onChange={e=>update(selected.id,{mode:e.target.value as GeoMozTerrainOverlay["mode"]})}>
          <option value="single">Símbolo único</option>
          <option value="categorized">Categorizado por atributo</option>
        </select>
      </label>
      {selected.mode==="categorized"&&<label className="gm-terrain-native-label">Campo da classificação
        <select value={selected.field} aria-label="Campo para categorização"
          onChange={e=>setField(e.target.value)}>
          {fields.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
      </label>}
      <div className="gm-terrain-style-colors">
        <label>Preenchimento <input aria-label="Cor de preenchimento" type="color" value={selected.color}
          onChange={e=>update(selected.id,{color:e.target.value})}/></label>
        <label>Contorno <input aria-label="Cor do contorno" type="color" value={selected.stroke}
          onChange={e=>update(selected.id,{stroke:e.target.value})}/></label>
      </div>
      <label className="gm-terrain-native-label">Transparência · {Math.round((1-selected.opacity)*100)}%
        <input type="range" min="0" max="100" step="1" aria-label="Transparência da camada no terreno"
          value={Math.round((1-selected.opacity)*100)}
          onChange={e=>update(selected.id,{opacity:1-Number(e.target.value)/100})}/>
      </label>
      {selected.mode==="categorized"&&<div className="gm-terrain-categories" aria-label="Legenda de categorias">
        <strong>Legenda ({values.length})</strong>
        {values.map(value=><label key={value}>
          <input type="color" aria-label={"Cor da categoria "+value} value={selected.categories[value]??selected.color}
            onChange={e=>update(selected.id,{categories:{...selected.categories,[value]:e.target.value}})}/>
          <span title={value}>{value}</span>
        </label>)}
      </div>}
      {loadError&&<p role="alert" className="gm-terrain-layer-error">{loadError}</p>}
    </>}
    <p className="gm-terrain-layer-hint">A classificação é aplicada sobre a superfície 3D. O relevo sombreado continua visível através da opacidade definida.</p>
  </section>;
}
