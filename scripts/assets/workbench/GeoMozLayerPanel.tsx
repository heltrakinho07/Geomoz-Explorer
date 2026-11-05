import {useLayoutOptions} from "../../hooks/useLayoutOptions";
import {useLanguage} from "../../hooks/useLanguage";
import {geoMozSpecialistText} from "./geomoz-specialist-locale";
import { GEOMOZ_ROLLOUT } from "../../lib/geomoz-workbench-profile";
import {GeoMozLayerPropertiesDialog} from "./GeoMozLayerPropertiesDialog";
import {GeoMozDigitizingTools} from "./GeoMozDigitizingTools";
import { rasterExportUrl } from "../../lib/raster-export";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useAppStore, effectiveLayerRenderState, resolveLayerCapabilities, pluginOwnsPaint, rendererAppliesOpacity, supportsBridgedOpacity } from "@geolibre/core";
import { Mountain, Layers3, Search, ChevronLeft, ChevronRight, Eye, EyeOff, Crosshair, SlidersHorizontal, Table2, Palette, FileStack, Map as MapIcon, FolderOpen, History, CheckCircle2, AlertCircle } from "lucide-react";
import { LayerPanel as EngineLayerPanel } from "../panels/LayerPanel";
import { setLayersPanelCollapsed } from "../../lib/layer-panel-collapse";
type Props = ComponentProps<typeof EngineLayerPanel>;
/** GeoMoz's primary navigator. Advanced operations retain the engine's collaboration and edit guards. */
export function GeoMozLayerPanel(props:Props) {
  const {viewer}=useLayoutOptions();
  const {language}=useLanguage();
  const ui=(pt:string)=>geoMozSpecialistText(language,pt);
  const layers=useAppStore(s=>s.layers);
  const groups=useAppStore(s=>s.layerGroups);
  const renderer=useAppStore(s=>s.primaryRenderer);
  const groupById=new Map(groups.map(group=>[group.id,group] as const));
  const rendered=(layer:(typeof layers)[number])=>effectiveLayerRenderState(layer,groupById).visible;
  const selectedId=useAppStore(s=>s.selectedLayerId);
  const select=useAppStore(s=>s.selectLayer);
  const visibility=useAppStore(s=>s.setLayerVisibility);
  const opacity=useAppStore(s=>s.setLayerOpacity);
  const setLayerStyle=useAppStore(s=>s.setLayerStyle);
  const [quickStyle,setQuickStyle]=useState(false);
  const [propertiesOpen,setPropertiesOpen]=useState(false);
  const openTable=useAppStore(s=>s.setAttributeTableOpen);
  const runs=useAppStore(s=>s.processingHistory);
  const openHistory=useAppStore(s=>s.setProcessingHistoryOpen);
  const canProcess=useAppStore(s=>s.deploymentCapabilities.has("processing:run"));
  const [results,setResults]=useState(false);
  const [query,setQuery]=useState("");
  const [tab,setTab]=useState<"all"|"visible">("all");
  const [advanced,setAdvanced]=useState(false);
  const [activeTask,setActiveTask]=useState("data");
  const [internalCollapsed,setInternalCollapsed]=useState(()=>window.innerWidth<768);
  const [notice,setNotice]=useState("");
  const collapsed=props.collapsed??internalCollapsed;
  const changeCollapsed=(value:boolean)=>props.collapsed===undefined?setInternalCollapsed(value):props.onCollapsedChange?.(value);
  useEffect(()=>{
    const onTask=(event:Event)=>{const task=(event as CustomEvent<string>).detail;setActiveTask(task);if(task==="output"){setResults(true);setAdvanced(false);changeCollapsed(false);}else{setResults(false);setAdvanced(false);}};
    window.addEventListener("geomoz:task",onTask);
    return ()=>window.removeEventListener("geomoz:task",onTask);
  });
  const previousAuto=useRef<boolean|null>(null);
  const beforeAuto=useRef(internalCollapsed);
  useEffect(()=>{
    if(props.collapsed!==undefined)return;
    const previous=previousAuto.current;
    previousAuto.current=!!props.autoCollapse;
    if(props.autoCollapse&&!previous){beforeAuto.current=internalCollapsed;setInternalCollapsed(true);}
    else if(!props.autoCollapse&&previous)setInternalCollapsed(beforeAuto.current);
  },[props.autoCollapse,props.collapsed,internalCollapsed]);
  useEffect(()=>{setLayersPanelCollapsed(collapsed);return ()=>setLayersPanelCollapsed(false);},[collapsed,advanced]);
  const selected=layers.find(layer=>layer.id===selectedId);
  const filtered=[...layers].reverse().filter(layer=>(tab==="all"||rendered(layer))&&layer.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if(collapsed)return props.hideOwnRail?null:<aside className="gm-layer-rail" aria-label={ui("Catálogo recolhido")}><button className="gm-icon-button" aria-label={ui("Expandir catálogo")} onClick={()=>changeCollapsed(false)}><Layers3 size={19}/></button><span>{ui("CATÁLOGO")}</span></aside>;
  return <aside className="gm-catalog" data-testid="geomoz-layer-catalog" aria-label={ui("Catálogo de camadas")}>
    <div className="gm-catalog-heading"><div><small>{ui("ÁREA DE TRABALHO")}</small><h2><Layers3 size={18}/> {ui("Catálogo")}</h2></div><button type="button" className="gm-icon-button" aria-label={ui("Recolher catálogo")} onClick={()=>changeCollapsed(true)}><ChevronLeft size={17}/></button></div>
    <div className="gm-catalog-nav"><button type="button" aria-pressed={!advanced&&!results} onClick={()=>{setAdvanced(false);setResults(false);}}><FileStack size={14}/>{ui("Camadas")} <b>{layers.length}</b></button><button type="button" aria-pressed={results} onClick={()=>{setResults(true);setAdvanced(false);}}><History size={14}/>{ui("Resultados")}</button>{GEOMOZ_ROLLOUT.fullLayerManager&&<button type="button" aria-pressed={advanced} onClick={()=>{setAdvanced(true);setResults(false);}}><SlidersHorizontal size={14}/>{ui("Gestão")}</button>}</div>
    {!advanced&&!results&&<>
      <div className="gm-catalog-search"><Search size={15}/><input aria-label={ui("Pesquisar camadas")} placeholder={ui("Pesquisar neste projecto…")} value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="gm-catalog-filter"><button type="button" aria-pressed={tab==="all"} onClick={()=>setTab("all")}>{ui("Todas")}</button><button type="button" aria-pressed={tab==="visible"} onClick={()=>setTab("visible")}>{ui("Visíveis")} <b>{layers.filter(rendered).length}</b></button><span>{ui("ORDEM DO MAPA")}</span></div>
      <div className="gm-layer-list">
        {filtered.map(layer=><div key={layer.id} className="gm-layer-row" data-layer-name={layer.name} data-visible={layer.visible} data-rendered={rendered(layer)} data-selected={selectedId===layer.id}>
          <button type="button" className="gm-layer-visibility" aria-label={(layer.visible?ui("Ocultar "):ui("Mostrar "))+layer.name} aria-pressed={layer.visible} onClick={()=>visibility(layer.id,!layer.visible)}>{layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
          <button type="button" className="gm-layer-select" aria-pressed={selectedId===layer.id} onDoubleClick={()=>{select(layer.id);setPropertiesOpen(true);}} onClick={()=>{select(layer.id);setNotice("");}}><span className={"gm-layer-symbol gm-layer-symbol-"+layer.type}>{layer.type==="raster"?<MapIcon size={17}/>:<Layers3 size={17}/>}</span><span><strong>{layer.name}</strong><small>{layer.type} · {layer.visible&&!rendered(layer)?ui("Oculta pelo grupo"):Math.round(layer.opacity*100)+"%"+ui(" opacidade")}</small></span></button>
          <button type="button" className="gm-icon-button gm-layer-fit" aria-label={ui("Enquadrar ")+layer.name} title={ui("Enquadrar camada")} onClick={()=>{const ok=props.mapControllerRef.current?.fitLayer(layer);setNotice(ok?"":ui("A extensão desta camada ainda não está disponível."));}}><Crosshair size={15}/></button>
        </div>)}
        {!filtered.length&&<div className="gm-catalog-empty"><FolderOpen size={32}/><strong>{layers.length?ui("Nenhuma correspondência"):ui("O seu mapa começa aqui")}</strong><p>{layers.length?ui("Experimente outro nome ou mostre todas as camadas."):ui("Adicione dados na faixa superior. As camadas e os resultados ficam organizados neste catálogo.")}</p><span>Vector · Raster · DEM · Serviços</span></div>}
      </div>
      {selected&&<section className="gm-layer-inspector" data-selected-layer-name={selected.name} data-selected-layer-id={selected.id} aria-label={ui("Camada seleccionada")}><small>{ui("CAMADA SELECCIONADA")}</small><h3 title={selected.name}>{selected.name}</h3>
        {(!pluginOwnsPaint(selected)||supportsBridgedOpacity(selected.id)||rendererAppliesOpacity(selected,renderer))&&<label className="gm-opacity">{ui("Opacidade")} <output>{Math.round(selected.opacity*100)}%</output><input aria-label={ui("Opacidade da camada")} type="range" min="0" max="1" step="0.01" value={selected.opacity} onChange={event=>opacity(selected.id,Number(event.target.value))}/></label>}
        <div className="gm-inspector-actions">{resolveLayerCapabilities(selected).query&&["geojson","duckdb-query","geoparquet","flatgeobuf"].includes(selected.type)&&<button type="button" onClick={()=>openTable(true)}><Table2 size={14}/> {ui("Tabela")}</button>}{!viewer&&selected.type==="geojson"&&<button type="button" aria-expanded={quickStyle} aria-label={ui("Editar simbologia")} onClick={()=>setQuickStyle(!quickStyle)}><Palette size={14}/> {ui("Simbologia")}</button>}{!viewer&&(selected.type==="cog"||selected.type==="raster")&&<button
          type="button" data-testid="geomoz-layer-open-terrain"
          disabled={!rasterExportUrl(selected)}
          title={rasterExportUrl(selected)?"Visualizar DEM do projecto em 3D":"Este raster não tem ficheiro GeoTIFF acessível"}
          onClick={()=>window.dispatchEvent(new CustomEvent("geomoz:terrain:open",{detail:{layerId:selected.id}}))}>
          <Mountain size={14}/> Abrir DEM em 3D</button>}{!viewer&&props.onOpenStylePanel&&<button type="button" onClick={()=>{select(selected.id);props.onOpenStylePanel?.();}}><Palette size={14}/> {ui("Estilos avançados")}</button>}<button type="button" data-testid="geomoz-open-layer-properties" onClick={()=>setPropertiesOpen(true)}><SlidersHorizontal size={14}/> {ui("Propriedades")}</button></div>
        {quickStyle&&!viewer&&selected.type==="geojson"&&<div className="gm-quick-style" role="group" aria-label={ui("Estilo rápido da camada")}>
          <label>{ui("Cor do símbolo")}<input aria-label={ui("Cor do símbolo")} type="color" value={selected.style.fillColor||"#0284c7"} onChange={e=>setLayerStyle(selected.id,{fillColor:e.target.value,vectorStyleMode:"single",proportionalSizeEnabled:false})}/></label>
          <label>{ui("Cor do contorno")}<input aria-label={ui("Cor do contorno")} type="color" value={selected.style.strokeColor||"#0f172a"} onChange={e=>setLayerStyle(selected.id,{strokeColor:e.target.value})}/></label>
          <label>{ui("Tamanho dos pontos")}<input aria-label={ui("Tamanho dos pontos")} type="range" min="2" max="24" step="1" value={selected.style.circleRadius} onChange={e=>setLayerStyle(selected.id,{circleRadius:Number(e.target.value),proportionalSizeEnabled:false})}/></label>
          <p>{ui("Alterações aplicadas ao renderer original. Para classes, regras ou tamanho proporcional, use os estilos avançados.")}</p>
        </div>}
        {!viewer&&selected.type==="geojson"&&(activeTask==="vector"||activeTask==="map")&&<GeoMozDigitizingTools key={"digitizing:"+selected.id} layer={selected} editLayerId={props.geometryEditLayerId} onToggleEdit={props.onToggleGeometryEdit} onCancelEdit={props.onCancelGeometryEdit}/>}
        {!viewer&&activeTask!=="vector"&&activeTask!=="map"&&selected.id===props.geometryEditLayerId&&<p className="gm-digitizing-notice" role="status">{ui("A edição da camada continua activa. Abra «Vector» para guardar ou descartar as alterações.")}</p>}

      </section>}
      <div className="gm-catalog-footer"><span><i/>{layers.filter(rendered).length}{ui(" visíveis de ")}{layers.length}</span><span title={ui("Altere a ordem e os grupos nas propriedades da camada")}>SIG LOCAL</span></div>
    </>}
    {results&&<section className="gm-results" aria-label={ui("Resultados do processamento")}>
      <div className="gm-results-title"><span>{runs.length} {runs.length===1?ui("execução"):ui("execuções")}</span>{canProcess&&<button type="button" onClick={()=>openHistory(true)}>{ui("Histórico completo")}</button>}</div>
      {!runs.length&&<div className="gm-catalog-empty"><History size={32}/><strong>{ui("Da análise à decisão")}</strong><p>{ui("Execute uma ferramenta na tarefa Análise. Aqui poderá acompanhar o estado e localizar as saídas produzidas.")}</p></div>}
      {[...runs].reverse().map(run=><article key={run.id} className="gm-result-card">
        <div>{run.status==="error"?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>}<strong>{run.toolName}</strong><span>{run.status==="error"?ui("Falhou"):run.status==="success"?ui("Concluído"):run.status}</span></div>
        <p>{new Date(run.startedAt).toLocaleString(language==="pt"?"pt-MZ":language)} · {run.engine}</p>
        {run.error&&<p role="status">{run.error}</p>}
        {run.outputLayerNames?.map((name,index)=>{const matches=layers.filter(item=>item.name===name);const layer=matches.length===1?matches[0]:undefined;return <button key={name+index} type="button" disabled={!layer} title={layer?ui("Seleccionar e enquadrar saída"):matches.length>1?ui("Existem várias camadas com este nome. Seleccione a saída no catálogo."):ui("Camada não encontrada com este nome no mapa.")} onClick={()=>{if(layer){select(layer.id);props.mapControllerRef.current?.fitLayer(layer);setResults(false);}}}><Layers3 size={13}/>{name}<ChevronRight size={13}/></button>;})}
      </article>)}
    </section>}
    <div className="gm-engine-panel" hidden={!GEOMOZ_ROLLOUT.fullLayerManager||!advanced}><EngineLayerPanel {...props} autoCollapse={false} collapsed={false} onCollapsedChange={()=>changeCollapsed(true)} hideOwnRail /></div>
    {selected&&propertiesOpen&&<GeoMozLayerPropertiesDialog key={selected.id} layer={selected} props={props} onClose={()=>setPropertiesOpen(false)}/>}
    <p className="gm-catalog-notice" role="status">{notice}</p>
    <div className="gm-catalog-resize" role="separator" aria-label={ui("Redimensionar catálogo")} title="Arraste para alargar ou reduzir o catálogo" aria-orientation="vertical" onPointerDown={props.onResizeStart}/>
  </aside>;
}
