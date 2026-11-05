import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {useAppStore,type GeoLibreLayer} from "@geolibre/core";

type Tab = "information" | "source" | "symbology" | "data";
const VECTOR = new Set(["geojson","geoparquet","flatgeobuf","duckdb-query","vector-tiles","mvt","shapefile","geopackage","csv"]);
const RASTER = new Set(["raster","cog","geotiff","dem","image","xyz","wms","wmts"]);
const isRaster = (layer:GeoLibreLayer):boolean => RASTER.has(layer.type) ||
  (layer.source.type==="raster" && !VECTOR.has(layer.type));
const textValue=(value:unknown):string=>{
  if(value===undefined||value===null||value==="")return "—";
  if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return String(value);
  return "—";
};
const sourceValue=(source:Record<string,unknown>,...keys:string[]):string=>{
  for(const key of keys){const value=source[key];if(typeof value==="string"||typeof value==="number")return String(value);}
  return "—";
};
/** Only show truly available, non-sensitive metadata; no fabricated band statistics. */
function sourceRows(layer:GeoLibreLayer):[string,string][]{
  const src=layer.source, meta=layer.metadata;
  return [
    ["Formato",layer.type],["Origem",sourceValue(src,"url","path","sourcePath","kind")],
    ["SRC",sourceValue(meta,"crs","projection","srs")!=="—"?sourceValue(meta,"crs","projection","srs"):sourceValue(src,"crs","projection","srs")],
    ["Tipo da fonte",sourceValue(src,"type","kind")],
    ["Licença",textValue(layer.descriptiveMetadata?.license)],
  ];
}
function LayerPropertyRows({rows}:{rows:[string,string][]}){
  return <dl className="gm-detail-rows">{rows.map(([name,value])=><div key={name}><dt>{name}</dt><dd title={value}>{value}</dd></div>)}</dl>;
}
export function GeoMozLayerDetailsDialog({layer,onClose,onOpenStylePanel,editable}:{
  layer:GeoLibreLayer;onClose:()=>void;onOpenStylePanel?:()=>void;editable:boolean;
}){
  const [tab,setTab]=useState<Tab>("information");
  const dialog=useRef<HTMLDivElement>(null);
  const origin=useRef<HTMLElement|null>(null);
  const update=useAppStore(s=>s.updateLayer);
  const raster=isRaster(layer);
  const vector=!raster&&VECTOR.has(layer.type);
  const columns=useMemo(()=>{
    const fields=new Set<string>();
    for(const feature of layer.geojson?.features??[]){
      for(const key of Object.keys(feature.properties??{}))fields.add(key);
      if(fields.size>1500)break;
    }
    return [...fields].sort((a,b)=>a.localeCompare(b,"pt"));
  },[layer.geojson]);
  const bandInfo=useMemo(()=>{
    const meta=layer.metadata as Record<string,unknown>;
    const src=layer.source;
    const values=[meta.bandCount,src.bandCount,meta.bands,src.bands];
    const bands=values.find(value=>typeof value==="number"||Array.isArray(value));
    return Array.isArray(bands)?bands.length:typeof bands==="number"?bands:null;
  },[layer.metadata,layer.source]);
  useEffect(()=>{
    origin.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();onClose();return;}
      if(event.key!=="Tab")return;
      const focus=dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])',
      );
      if(!focus?.length)return;
      const first=focus[0],last=focus[focus.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",onKey);origin.current?.focus();};
  },[onClose]);
  const entries:[Tab,string][]=[
    ["information","Informação"],["source","Fonte"],["symbology","Simbologia"],
    ["data",raster?"Bandas e valores":vector?"Atributos":"Dados"],
  ];
  const openStyle=()=>{
    onClose();
    onOpenStylePanel?.();
  };
  return createPortal(<div className="gm-layer-detail-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="gm-layer-detail-title"
      data-testid="geomoz-layer-properties-dialog" data-layer-kind={raster?"raster":vector?"vector":"service"} className="gm-layer-detail-dialog">
      <header className="gm-layer-detail-header">
        <div><small>GEOMOZ GIS WORKSPACE · PROPRIEDADES DA CAMADA</small>
          <h2 id="gm-layer-detail-title">{layer.name}</h2>
          <p>{raster?"Raster · simbologia por bandas, valores e intervalos":vector?"Vector · simbologia por geometria e atributos":"Serviço cartográfico · propriedades de origem e visualização"}</p>
        </div>
        <button aria-label="Fechar propriedades da camada" type="button" className="gm-layer-detail-close" onClick={onClose}>×</button>
      </header>
      <div className="gm-layer-detail-layout">
        <nav className="gm-layer-detail-nav" aria-label="Secções das propriedades">{entries.map(([key,label])=>
          <button type="button" aria-current={tab===key?"page":undefined} aria-pressed={tab===key} key={key} onClick={()=>setTab(key)}>{label}</button>
        )}</nav>
        <section className="gm-layer-detail-content" aria-live="polite">
          {tab==="information"&&<>
            <h3>Informação geral</h3>
            <LayerPropertyRows rows={[
              ["Nome",layer.name],["Identificador",layer.id],
              ["Tipo",raster?"Raster":vector?"Vector":layer.type],
              ["Feições",vector?textValue(layer.geojson?.features.length):"Não aplicável"],
              ["Visibilidade",layer.visible?"Visível":"Oculta"],
              ["Opacidade",Math.round(layer.opacity*100)+"%"],
            ]}/>
            <label className="gm-layer-detail-opacity">Opacidade da camada
              <span>{Math.round(layer.opacity*100)}%</span>
              <input aria-label="Opacidade nas propriedades" type="range" min="0" max="100" step="1" value={Math.round(layer.opacity*100)}
                disabled={!editable} onChange={event=>update(layer.id,{opacity:Number(event.target.value)/100})}/>
            </label>
          </>}
          {tab==="source"&&<>
            <h3>Fonte e metadados</h3>
            <LayerPropertyRows rows={sourceRows(layer)}/>
            <p className="gm-layer-detail-note">O SRC, as bandas e as estatísticas só são apresentados quando disponibilizados pelo ficheiro ou serviço. O GeoMoz não inventa metadados ausentes.</p>
          </>}
          {tab==="symbology"&&<>
            <h3>{raster?"Representação do raster":vector?"Simbologia vectorial":"Representação do serviço"}</h3>
            {raster?<><p>As classes de um raster correspondem a valores de píxeis ou intervalos numéricos, não a campos de uma tabela de atributos vectoriais.</p>
              <LayerPropertyRows rows={[["Bandas",bandInfo===null?"Não disponíveis nos metadados":String(bandInfo)],["Estilo",textValue(layer.metadata.renderType??layer.metadata.renderer)],["Opacidade",Math.round(layer.opacity*100)+"%"]]}/>
              <p className="gm-layer-detail-note">Para DEM contínuos, escolha uma rampa e intervalos de valores no editor de estilos, quando suportados. Para rasters categóricos, utilize classes de valores inteiros com cores distintas. As opções exactas dependem do motor raster e do ficheiro.</p></>
            :vector?<><p>Uma camada vectorial pode ter símbolo único, categorias por valores distintos de um atributo ou classes graduadas de um atributo numérico. A categorização de vectores <strong>também usa classes</strong>, mas classes de feições, não classes de píxeis.</p>
              <LayerPropertyRows rows={[["Renderizador",textValue(layer.style.vectorStyleMode)],["Campo de categorização",textValue(layer.style.vectorStyleProperty)],["Categorias configuradas",String(layer.style.vectorStyleStops?.length??0)]]}/>
              {layer.style.vectorStyleMode==="categorized"&&!!layer.style.vectorStyleStops?.length&&
                <div className="gm-layer-detail-categories" role="table" aria-label="Categorias da camada">
                  {layer.style.vectorStyleStops.map((stop,index)=><div role="row" key={index}><span role="cell" className="gm-layer-detail-swatch" style={{backgroundColor:stop.color}}/><span role="cell">{textValue(stop.value)}</span></div>)}
                </div>}</>:<p>Serviços de mapas não disponibilizam necessariamente os valores necessários para classificação local.</p>}
            {editable&&onOpenStylePanel&&<button type="button" className="gm-layer-detail-primary" onClick={openStyle}>Abrir editor avançado de estilos</button>}
          </>}
          {tab==="data"&&(raster?<><h3>Bandas e valores do raster</h3>
            <LayerPropertyRows rows={[["Número de bandas",bandInfo===null?"Indisponível":String(bandInfo)],["Valor mínimo",textValue(layer.metadata.min??layer.source.min)],["Valor máximo",textValue(layer.metadata.max??layer.source.max)],["NoData",textValue(layer.metadata.nodata??layer.source.nodata)],["Resolução",textValue(layer.metadata.resolution??layer.source.resolution)]]}/>
            <p className="gm-layer-detail-note">Um raster contínuo (por exemplo DEM) utiliza valores de elevação e intervalos. Um raster discreto de uso e cobertura do solo utiliza códigos de classe. Não aplique o categorizador de campos vectoriais a um raster.</p>
          </>:vector?<><h3>Campos da tabela de atributos</h3>
            <p>{layer.geojson?"Campos identificados nas feições disponíveis:":"Esta camada pode estar optimizada em GeoParquet/tile. Os atributos completos devem ser consultados pelo painel de tabela e pelo motor DuckDB, sem carregar todas as geometrias na memória."}</p>
            {columns.length?<div className="gm-layer-detail-fields">{columns.map(name=><span key={name}>{name}</span>)}</div>:<p className="gm-layer-detail-note">Sem campos materializados no catálogo. Abra a tabela de atributos da camada para consultar a fonte.</p>}
          </>:<p>Este serviço não disponibiliza uma tabela vectorial ou bandas raster locais.</p>)}
        </section>
      </div>
      <footer className="gm-layer-detail-footer"><button type="button" onClick={onClose}>Fechar</button></footer>
    </div>
  </div>,document.body);
}
