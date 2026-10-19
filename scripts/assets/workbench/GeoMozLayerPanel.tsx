import {useLayoutOptions} from "../../hooks/useLayoutOptions";
import { GEOMOZ_ROLLOUT } from "../../lib/geomoz-workbench-profile";
import {GeoMozLayerProperties} from "./GeoMozLayerProperties";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useAppStore, effectiveLayerRenderState, resolveLayerCapabilities, pluginOwnsPaint, rendererAppliesOpacity, supportsBridgedOpacity } from "@geolibre/core";
import { Layers3, Search, ChevronLeft, ChevronRight, Eye, EyeOff, Crosshair, SlidersHorizontal, Table2, Palette, FileStack, Map as MapIcon, FolderOpen, History, CheckCircle2, AlertCircle } from "lucide-react";
import { LayerPanel as EngineLayerPanel } from "../panels/LayerPanel";
import { setLayersPanelCollapsed } from "../../lib/layer-panel-collapse";
type Props = ComponentProps<typeof EngineLayerPanel>;
/** GeoMoz's primary navigator. Advanced operations retain the engine's collaboration and edit guards. */
export function GeoMozLayerPanel(props:Props) {
  const {viewer}=useLayoutOptions();
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
  const openTable=useAppStore(s=>s.setAttributeTableOpen);
  const runs=useAppStore(s=>s.processingHistory);
  const openHistory=useAppStore(s=>s.setProcessingHistoryOpen);
  const canProcess=useAppStore(s=>s.deploymentCapabilities.has("processing:run"));
  const [results,setResults]=useState(false);
  const [query,setQuery]=useState("");
  const [tab,setTab]=useState<"all"|"visible">("all");
  const [advanced,setAdvanced]=useState(false);
  const [internalCollapsed,setInternalCollapsed]=useState(()=>window.innerWidth<768);
  const [notice,setNotice]=useState("");
  const collapsed=props.collapsed??internalCollapsed;
  const changeCollapsed=(value:boolean)=>props.collapsed===undefined?setInternalCollapsed(value):props.onCollapsedChange?.(value);
  useEffect(()=>{
    const onTask=(event:Event)=>{const task=(event as CustomEvent<string>).detail;if(task==="output"){setResults(true);setAdvanced(false);changeCollapsed(false);}else{setResults(false);setAdvanced(false);}};
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
  if(collapsed)return props.hideOwnRail?null:<aside className="gm-layer-rail" aria-label="Catálogo recolhido"><button className="gm-icon-button" aria-label="Expandir catálogo" onClick={()=>changeCollapsed(false)}><Layers3 size={19}/></button><span>CATÁLOGO</span></aside>;
  return <aside className="gm-catalog" data-testid="geomoz-layer-catalog" aria-label="Catálogo de camadas">
    <div className="gm-catalog-heading"><div><small>ÁREA DE TRABALHO</small><h2><Layers3 size={18}/> Catálogo</h2></div><button type="button" className="gm-icon-button" aria-label="Recolher catálogo" onClick={()=>changeCollapsed(true)}><ChevronLeft size={17}/></button></div>
    <div className="gm-catalog-nav"><button type="button" aria-pressed={!advanced&&!results} onClick={()=>{setAdvanced(false);setResults(false);}}><FileStack size={14}/>Camadas <b>{layers.length}</b></button><button type="button" aria-pressed={results} onClick={()=>{setResults(true);setAdvanced(false);}}><History size={14}/>Resultados</button>{GEOMOZ_ROLLOUT.fullLayerManager&&<button type="button" aria-pressed={advanced} onClick={()=>{setAdvanced(true);setResults(false);}}><SlidersHorizontal size={14}/>Gestão</button>}</div>
    {!advanced&&!results&&<>
      <div className="gm-catalog-search"><Search size={15}/><input aria-label="Pesquisar camadas" placeholder="Pesquisar neste projecto…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="gm-catalog-filter"><button type="button" aria-pressed={tab==="all"} onClick={()=>setTab("all")}>Todas</button><button type="button" aria-pressed={tab==="visible"} onClick={()=>setTab("visible")}>Visíveis <b>{layers.filter(rendered).length}</b></button><span>ORDEM DO MAPA</span></div>
      <div className="gm-layer-list">
        {filtered.map(layer=><div key={layer.id} className="gm-layer-row" data-layer-name={layer.name} data-visible={layer.visible} data-rendered={rendered(layer)} data-selected={selectedId===layer.id}>
          <button type="button" className="gm-layer-visibility" aria-label={(layer.visible?"Ocultar ":"Mostrar ")+layer.name} aria-pressed={layer.visible} onClick={()=>visibility(layer.id,!layer.visible)}>{layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
          <button type="button" className="gm-layer-select" aria-pressed={selectedId===layer.id} onClick={()=>{select(layer.id);setNotice("");}}><span className={"gm-layer-symbol gm-layer-symbol-"+layer.type}>{layer.type==="raster"?<MapIcon size={17}/>:<Layers3 size={17}/>}</span><span><strong>{layer.name}</strong><small>{layer.type} · {layer.visible&&!rendered(layer)?"Oculta pelo grupo":Math.round(layer.opacity*100)+"% opacidade"}</small></span></button>
          <button type="button" className="gm-icon-button gm-layer-fit" aria-label={"Enquadrar "+layer.name} title="Enquadrar camada" onClick={()=>{const ok=props.mapControllerRef.current?.fitLayer(layer);setNotice(ok?"":"A extensão desta camada ainda não está disponível.");}}><Crosshair size={15}/></button>
        </div>)}
        {!filtered.length&&<div className="gm-catalog-empty"><FolderOpen size={32}/><strong>{layers.length?"Nenhuma correspondência":"O seu mapa começa aqui"}</strong><p>{layers.length?"Experimente outro nome ou mostre todas as camadas.":"Adicione dados na faixa superior. As camadas e os resultados ficam organizados neste catálogo."}</p><span>Vector · Raster · DEM · Serviços</span></div>}
      </div>
      {selected&&<section className="gm-layer-inspector" aria-label="Camada seleccionada"><small>CAMADA SELECCIONADA</small><h3 title={selected.name}>{selected.name}</h3>
        {(!pluginOwnsPaint(selected)||supportsBridgedOpacity(selected.id)||rendererAppliesOpacity(selected,renderer))&&<label className="gm-opacity">Opacidade <output>{Math.round(selected.opacity*100)}%</output><input aria-label="Opacidade da camada" type="range" min="0" max="1" step="0.01" value={selected.opacity} onChange={event=>opacity(selected.id,Number(event.target.value))}/></label>}
        <div className="gm-inspector-actions">{resolveLayerCapabilities(selected).query&&["geojson","duckdb-query","geoparquet","flatgeobuf"].includes(selected.type)&&<button type="button" onClick={()=>openTable(true)}><Table2 size={14}/> Tabela</button>}{!viewer&&selected.type==="geojson"&&<button type="button" data-testid="geomoz-edit-layer" aria-pressed={props.geometryEditLayerId===selected.id} onClick={()=>props.onToggleGeometryEdit(selected.id)}><Layers3 size={14}/> {props.geometryEditLayerId===selected.id?"Concluir e guardar edição":"Digitalizar nesta camada"}</button>}{!viewer&&props.geometryEditLayerId===selected.id&&<button type="button" onClick={props.onCancelGeometryEdit}>Descartar alterações</button>}{!viewer&&selected.type==="geojson"&&<button type="button" aria-expanded={quickStyle} aria-label="Editar simbologia" onClick={()=>setQuickStyle(!quickStyle)}><Palette size={14}/> Simbologia</button>}{!viewer&&props.onOpenStylePanel&&<button type="button" onClick={()=>{select(selected.id);props.onOpenStylePanel?.();}}><Palette size={14}/> Estilos avançados</button>}{GEOMOZ_ROLLOUT.fullLayerManager&&<button type="button" onClick={()=>setAdvanced(true)}><SlidersHorizontal size={14}/> Propriedades</button>}</div>
        {quickStyle&&!viewer&&selected.type==="geojson"&&<div className="gm-quick-style" role="group" aria-label="Estilo rápido da camada">
          <label>Cor do símbolo<input aria-label="Cor do símbolo" type="color" value={selected.style.fillColor||"#0284c7"} onChange={e=>setLayerStyle(selected.id,{fillColor:e.target.value,vectorStyleMode:"single",proportionalSizeEnabled:false})}/></label>
          <label>Cor do contorno<input aria-label="Cor do contorno" type="color" value={selected.style.strokeColor||"#0f172a"} onChange={e=>setLayerStyle(selected.id,{strokeColor:e.target.value})}/></label>
          <label>Tamanho dos pontos<input aria-label="Tamanho dos pontos" type="range" min="2" max="24" step="1" value={selected.style.circleRadius} onChange={e=>setLayerStyle(selected.id,{circleRadius:Number(e.target.value),proportionalSizeEnabled:false})}/></label>
          <p>Alterações aplicadas ao renderer original. Para classes, regras ou tamanho proporcional, use os estilos avançados.</p>
        </div>}
        <GeoMozLayerProperties key={selected.id} layer={selected} props={props}/>
      </section>}
      <div className="gm-catalog-footer"><span><i/>{layers.filter(rendered).length} visíveis de {layers.length}</span><span title="Altere a ordem e os grupos nas propriedades da camada">SIG LOCAL</span></div>
    </>}
    {results&&<section className="gm-results" aria-label="Resultados do processamento">
      <div className="gm-results-title"><span>{runs.length} {runs.length===1?"execução":"execuções"}</span>{canProcess&&<button type="button" onClick={()=>openHistory(true)}>Histórico completo</button>}</div>
      {!runs.length&&<div className="gm-catalog-empty"><History size={32}/><strong>Da análise à decisão</strong><p>Execute uma ferramenta na tarefa Análise. Aqui poderá acompanhar o estado e localizar as saídas produzidas.</p></div>}
      {[...runs].reverse().map(run=><article key={run.id} className="gm-result-card">
        <div>{run.status==="error"?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>}<strong>{run.toolName}</strong><span>{run.status==="error"?"Falhou":run.status==="success"?"Concluído":run.status}</span></div>
        <p>{new Date(run.startedAt).toLocaleString("pt-MZ")} · {run.engine}</p>
        {run.error&&<p role="status">{run.error}</p>}
        {run.outputLayerNames?.map((name,index)=>{const matches=layers.filter(item=>item.name===name);const layer=matches.length===1?matches[0]:undefined;return <button key={name+index} type="button" disabled={!layer} title={layer?"Seleccionar e enquadrar saída":matches.length>1?"Existem várias camadas com este nome. Seleccione a saída no catálogo.":"Camada não encontrada com este nome no mapa."} onClick={()=>{if(layer){select(layer.id);props.mapControllerRef.current?.fitLayer(layer);setResults(false);}}}><Layers3 size={13}/>{name}<ChevronRight size={13}/></button>;})}
      </article>)}
    </section>}
    <div className="gm-engine-panel" hidden={!GEOMOZ_ROLLOUT.fullLayerManager||!advanced}><EngineLayerPanel {...props} autoCollapse={false} collapsed={false} onCollapsedChange={()=>changeCollapsed(true)} hideOwnRail /></div>
    <p className="gm-catalog-notice" role="status">{notice}</p>
    <div className="gm-catalog-resize" role="separator" aria-label="Redimensionar catálogo" aria-orientation="vertical" onPointerDown={props.onResizeStart}/>
  </aside>;
}
