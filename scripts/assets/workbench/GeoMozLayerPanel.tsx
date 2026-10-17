import { useEffect, useState, type ComponentProps } from "react";
import { useAppStore } from "@geolibre/core";
import { Layers3, Search, ChevronLeft, Eye, EyeOff, Crosshair, SlidersHorizontal, Table2, Palette, FileStack, Map, FolderOpen } from "lucide-react";
import { LayerPanel as EngineLayerPanel } from "../panels/LayerPanel";
import { setLayersPanelCollapsed } from "../../lib/layer-panel-collapse";
type Props = ComponentProps<typeof EngineLayerPanel>;
/** GeoMoz's primary navigator. Advanced operations retain the engine's collaboration and edit guards. */
export function GeoMozLayerPanel(props:Props) {
  const layers=useAppStore(s=>s.layers);
  const selectedId=useAppStore(s=>s.selectedLayerId);
  const select=useAppStore(s=>s.selectLayer);
  const visibility=useAppStore(s=>s.setLayerVisibility);
  const opacity=useAppStore(s=>s.setLayerOpacity);
  const openTable=useAppStore(s=>s.setAttributeTableOpen);
  const [query,setQuery]=useState("");
  const [tab,setTab]=useState<"all"|"visible">("all");
  const [advanced,setAdvanced]=useState(false);
  const [internalCollapsed,setInternalCollapsed]=useState(()=>window.innerWidth<768);
  const [notice,setNotice]=useState("");
  const collapsed=props.collapsed??internalCollapsed;
  const changeCollapsed=(value:boolean)=>props.collapsed===undefined?setInternalCollapsed(value):props.onCollapsedChange?.(value);
  useEffect(()=>{if(props.collapsed===undefined&&props.autoCollapse)setInternalCollapsed(true);},[props.autoCollapse,props.collapsed]);
  useEffect(()=>setLayersPanelCollapsed(collapsed),[collapsed,advanced]);
  const selected=layers.find(layer=>layer.id===selectedId);
  const filtered=layers.filter(layer=>(tab==="all"||layer.visible)&&layer.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if(collapsed)return props.hideOwnRail?null:<aside className="gm-layer-rail" aria-label="Catálogo recolhido"><button className="gm-icon-button" aria-label="Expandir catálogo" onClick={()=>changeCollapsed(false)}><Layers3 size={19}/></button><span>CATÁLOGO</span></aside>;
  return <aside className="gm-catalog" data-testid="geomoz-layer-catalog" aria-label="Catálogo de camadas">
    <div className="gm-catalog-heading"><div><small>ÁREA DE TRABALHO</small><h2><Layers3 size={18}/> Catálogo</h2></div><button type="button" className="gm-icon-button" aria-label="Recolher catálogo" onClick={()=>changeCollapsed(true)}><ChevronLeft size={17}/></button></div>
    <div className="gm-catalog-nav"><button type="button" aria-pressed={!advanced} onClick={()=>setAdvanced(false)}><FileStack size={14}/>Camadas <b>{layers.length}</b></button><button type="button" aria-pressed={advanced} onClick={()=>setAdvanced(true)}><SlidersHorizontal size={14}/>Gestão</button></div>
    {!advanced&&<>
      <div className="gm-catalog-search"><Search size={15}/><input aria-label="Pesquisar camadas" placeholder="Pesquisar neste projecto…" value={query} onChange={event=>setQuery(event.target.value)}/></div>
      <div className="gm-catalog-filter"><button type="button" aria-pressed={tab==="all"} onClick={()=>setTab("all")}>Todas</button><button type="button" aria-pressed={tab==="visible"} onClick={()=>setTab("visible")}>Visíveis <b>{layers.filter(layer=>layer.visible).length}</b></button><span>ORDEM DO MAPA</span></div>
      <div className="gm-layer-list">
        {filtered.map(layer=><div key={layer.id} className="gm-layer-row" data-layer-name={layer.name} data-visible={layer.visible} data-selected={selectedId===layer.id}>
          <button type="button" className="gm-layer-visibility" aria-label={(layer.visible?"Ocultar ":"Mostrar ")+layer.name} aria-pressed={layer.visible} onClick={()=>visibility(layer.id,!layer.visible)}>{layer.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
          <button type="button" className="gm-layer-select" aria-pressed={selectedId===layer.id} onClick={()=>{select(layer.id);setNotice("");}}><span className={"gm-layer-symbol gm-layer-symbol-"+layer.type}>{layer.type==="raster"?<Map size={17}/>:<Layers3 size={17}/>}</span><span><strong>{layer.name}</strong><small>{layer.type} · {Math.round(layer.opacity*100)}% opacidade</small></span></button>
          <button type="button" className="gm-icon-button gm-layer-fit" aria-label={"Enquadrar "+layer.name} title="Enquadrar camada" onClick={()=>{const ok=props.mapControllerRef.current?.fitLayer(layer);setNotice(ok?"":"A extensão desta camada ainda não está disponível.");}}><Crosshair size={15}/></button>
        </div>)}
        {!filtered.length&&<div className="gm-catalog-empty"><FolderOpen size={32}/><strong>{layers.length?"Nenhuma correspondência":"O seu mapa começa aqui"}</strong><p>{layers.length?"Experimente outro nome ou mostre todas as camadas.":"Adicione dados na faixa superior. As camadas e os resultados ficam organizados neste catálogo."}</p><span>Vector · Raster · DEM · Serviços</span></div>}
      </div>
      {selected&&<section className="gm-layer-inspector" aria-label="Camada seleccionada"><small>CAMADA SELECCIONADA</small><h3 title={selected.name}>{selected.name}</h3>
        <label className="gm-opacity">Opacidade <output>{Math.round(selected.opacity*100)}%</output><input aria-label="Opacidade da camada" type="range" min="0" max="1" step="0.01" value={selected.opacity} onChange={event=>opacity(selected.id,Number(event.target.value))}/></label>
        <div className="gm-inspector-actions">{["geojson","duckdb-query","geoparquet","flatgeobuf"].includes(selected.type)&&<button type="button" onClick={()=>openTable(true)}><Table2 size={14}/> Tabela</button>}{props.onOpenStylePanel&&<button type="button" onClick={props.onOpenStylePanel}><Palette size={14}/> Estilo</button>}<button type="button" onClick={()=>setAdvanced(true)}><SlidersHorizontal size={14}/> Propriedades</button></div>
      </section>}
      <div className="gm-catalog-footer"><span><i/>{layers.filter(layer=>layer.visible).length} visíveis de {layers.length}</span><span title="A ordem e os grupos podem ser alterados em Gestão">SIG LOCAL</span></div>
    </>}
    <div className="gm-engine-panel" hidden={!advanced}><EngineLayerPanel {...props} autoCollapse={false} collapsed={false} onCollapsedChange={()=>changeCollapsed(true)} hideOwnRail /></div>
    <p className="gm-catalog-notice" role="status">{notice}</p>
    <div className="gm-catalog-resize" role="separator" aria-label="Redimensionar catálogo" aria-orientation="vertical" onPointerDown={props.onResizeStart}/>
  </aside>;
}
