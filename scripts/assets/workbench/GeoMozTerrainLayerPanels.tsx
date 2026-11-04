import {useState} from "react";
import {ArrowDown,ArrowUp,Check,CloudDownload,Eye,EyeOff,FileUp,
  Layers3,MapPinned,Palette,Plus,Trash2} from "lucide-react";
import type {FeatureCollection} from "geojson";
import type {TerrainOverlay,TerrainCategory} from "./geomoz-terrain-layers";
import {terrainCategoryFields,terrainCategories} from "./geomoz-terrain-layers";

export interface ProjectVectorOption {
  id:string;name:string;geojson:FeatureCollection;
  style?:{fillColor:string;fillOpacity:number;vectorStyleMode:string;
    vectorStyleProperty:string;vectorStyleStops:readonly {value:string|number;color:string;label?:string}[]};
}
interface CatalogueProps {
  layers:TerrainOverlay[];
  selectedId:string|null;
  projectVectors:ProjectVectorOption[];
  busy:boolean;loadingGEE:boolean;
  onSelect:(id:string)=>void;
  onChange:(layers:TerrainOverlay[])=>void;
  onFromProject:(id:string)=>void;
  onImport:(file:File)=>void;
  onWorldCover:()=>void;
}
function copyLayer(l:TerrainOverlay,patch:Partial<TerrainOverlay>):TerrainOverlay {
  return {...l,...patch};
}
export function GeoMozTerrainLayerCatalogue({
  layers,selectedId,projectVectors,busy,loadingGEE,onSelect,onChange,
  onFromProject,onImport,onWorldCover
}:CatalogueProps){
  const [sourceOpen,setSourceOpen]=useState(false);
  const [projectSource,setProjectSource]=useState("");
  const patch=(id:string,patch:Partial<TerrainOverlay>)=>
    onChange(layers.map(l=>l.id===id?copyLayer(l,patch):l));
  const move=(id:string,step:-1|1)=>{
    const index=layers.findIndex(l=>l.id===id),target=index+step;
    if(index<0||target<0||target>=layers.length)return;
    const next=[...layers];[next[index],next[target]]=[next[target],next[index]];
    onChange(next);
  };
  return <aside className="gm-terrain-layer-catalog" data-testid="geomoz-3d-layer-catalog">
    <div className="gm-terrain-panel-head">
      <span><Layers3 size={16}/> Camadas do terreno</span>
      <span className="gm-terrain-count">{layers.length}</span>
    </div>
    <p className="gm-terrain-panel-intro">
      Sobreponha geologia, solos e cobertura do solo. Todas as camadas são recortadas
      automaticamente aos limites do DEM, sem alterar os dados de origem.
    </p>
    <button className="gm-terrain-accent-btn" type="button" onClick={()=>setSourceOpen(x=>!x)}
      aria-expanded={sourceOpen} aria-controls="geomoz-terrain-add-sources">
      <Plus size={15}/> Adicionar camada
    </button>
    {sourceOpen&&<div className="gm-terrain-source-picker" id="geomoz-terrain-add-sources">
      <label className="gm-terrain-upload">
        <FileUp size={16}/> Importar GeoJSON / GeoTIFF
        <input type="file" accept=".geojson,.json,.tif,.tiff,application/geo+json"
          aria-label="Carregar camada GeoJSON ou GeoTIFF para o terreno 3D"
          disabled={busy}
          onChange={event=>{
            const file=event.target.files?.[0];
            if(file)onImport(file);event.target.value="";
          }}/>
      </label>
      <div className="gm-terrain-import-row">
        <select value={projectSource} aria-label="Camada vectorial do projecto"
          onChange={e=>setProjectSource(e.target.value)}>
          <option value="">Camada já existente no projecto…</option>
          {projectVectors.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}
        </select>
        <button type="button" disabled={!projectSource||busy}
          onClick={()=>{onFromProject(projectSource);setProjectSource("");}}
          aria-label="Sobrepor camada do projecto"><MapPinned size={16}/></button>
      </div>
      <button type="button" className="gm-terrain-gee-btn" disabled={busy||loadingGEE}
        data-testid="geomoz-3d-worldcover"
        onClick={onWorldCover}>
        {loadingGEE?<span className="gm-terrain-spin">◌</span>:<CloudDownload size={15}/>}
        {loadingGEE?"A consultar Earth Engine…":"ESA WorldCover 2021 · GEE"}
      </button>
      <p className="gm-terrain-source-note">
        WorldCover representa cobertura do solo em 2021, não o cadastro nem o uso actual.
        Requer uma sessão Google Earth Engine válida.
      </p>
    </div>}
    <div className="gm-terrain-stack-title">Ordem de sobreposição <small>Base → topo</small></div>
    {layers.length===0?<div className="gm-terrain-layer-empty">
      <Layers3 size={20}/>
      <strong>Sem camadas temáticas</strong>
      <span>Adicione um mapa geológico, solos ou WorldCover para o visualizar no relevo.</span>
    </div>:<div className="gm-terrain-layer-list">
      {layers.map((layer,i)=><div key={layer.id}
        className={"gm-terrain-layer-row"+(layer.id===selectedId?" is-selected":"")}
        data-testid="geomoz-3d-layer-row" data-layer-name={layer.name}>
        <button type="button" aria-label={layer.visible?"Ocultar "+layer.name:"Mostrar "+layer.name}
          className="gm-terrain-icon-btn" onClick={()=>patch(layer.id,{visible:!layer.visible})}>
          {layer.visible?<Eye size={16}/>:<EyeOff size={16}/>}
        </button>
        <button type="button" className="gm-terrain-layer-select" onClick={()=>onSelect(layer.id)}>
          <span className="gm-terrain-layer-swatch"
            style={{background:layer.categories[0]?.color??layer.singleColor}}/>
          <span className="gm-terrain-layer-meta">
            <strong>{layer.name}</strong>
            <small>{layer.kind==="vector"?"Vector · polígonos":layer.kind==="categories"?
              "Raster · classes":"Imagem RGB"} · {layer.source==="gee"?"GEE":layer.source==="file"?
                "ficheiro":"projecto"}</small>
          </span>
        </button>
        <div className="gm-terrain-layer-move">
          <button type="button" title="Subir camada" aria-label={"Subir "+layer.name}
            disabled={i===layers.length-1} onClick={()=>move(layer.id,1)}><ArrowUp size={12}/></button>
          <button type="button" title="Descer camada" aria-label={"Descer "+layer.name}
            disabled={i===0} onClick={()=>move(layer.id,-1)}><ArrowDown size={12}/></button>
        </div>
        <button type="button" className="gm-terrain-icon-btn" title="Remover sobreposição"
          aria-label={"Remover "+layer.name}
          onClick={()=>onChange(layers.filter(l=>l.id!==layer.id))}><Trash2 size={14}/></button>
      </div>)}
    </div>}
    <div className="gm-terrain-layer-footer">
      <span className="gm-terrain-legend-dot"/> DEM original preservado
      <small>Georreferenciação em {layers.length?"camadas locais/GEE":"espera"}</small>
    </div>
  </aside>;
}

interface StyleProps {
  layer:TerrainOverlay|null;
  onChange:(layer:TerrainOverlay)=>void;
}
export function GeoMozTerrainLayerSymbology({layer,onChange}:StyleProps){
  if(!layer)return <div className="gm-terrain-inspector-placeholder">
    <Palette size={22}/><strong>Seleccione uma camada</strong>
    <span>Aqui pode definir classificação, cores, visibilidade e transparência.</span>
  </div>;
  const patch=(props:Partial<TerrainOverlay>)=>onChange({...layer,...props});
  const updateCategory=(value:string,changes:Partial<TerrainCategory>)=>
    patch({categories:layer.categories.map(c=>c.value===value?{...c,...changes}:c)});
  const fields=layer.kind==="vector"&&layer.data?terrainCategoryFields(layer.data):[];
  return <div className="gm-terrain-symbols" data-testid="geomoz-3d-symbology">
    <strong className="gm-terrain-inspector-layer-name">{layer.name}</strong>
    <p className="gm-terrain-panel-intro">
      As alterações são aplicadas directamente à superfície 3D, mantendo a escala métrica.
    </p>
    <label className="gm-terrain-field">
      <span>Simbologia</span>
      <select value={layer.renderStyle} aria-label="Tipo de simbologia 3D"
        onChange={event=>patch({renderStyle:event.target.value as TerrainOverlay["renderStyle"]})}>
        <option value="categorized" disabled={layer.kind==="imagery"||!layer.categories.length}>
          Categorizada por atributo/classe
        </option>
        <option value="single">Cor única</option>
      </select>
    </label>
    {layer.kind==="vector"&&fields.length>0&&layer.renderStyle==="categorized"&&
      <label className="gm-terrain-field"><span>Atributo de categorização</span>
      <select value={layer.field??""} aria-label="Campo de classificação"
        onChange={event=>{
          if(!layer.data)return;
          patch({field:event.target.value,
            categories:terrainCategories(layer.data,event.target.value)});
        }}>
        {fields.map(field=><option value={field} key={field}>{field}</option>)}
      </select></label>}
    {layer.kind!=="imagery"&&layer.renderStyle==="single"&&
      <label className="gm-terrain-colour-item">
        <input type="color" aria-label="Cor única" value={layer.singleColor}
          onChange={e=>patch({singleColor:e.target.value})}/> Cor da camada
      </label>}
    <label className="gm-terrain-field">
      <span>Transparência · {Math.round((1-layer.opacity)*100)}%</span>
      <input type="range" min="0" max="100" step="5"
        aria-label="Transparência da camada 3D" value={Math.round((1-layer.opacity)*100)}
        onChange={e=>patch({opacity:1-Number(e.target.value)/100})}/>
    </label>
    <label className="gm-terrain-checkbox">
      <input type="checkbox" checked={layer.visible} onChange={e=>patch({visible:e.target.checked})}/>
      Camada visível
    </label>
    {layer.renderStyle==="categorized"&&layer.categories.length>0&&
      <div className="gm-terrain-class-list">
        <strong>Legenda · {layer.categories.length} classes</strong>
        {layer.categories.map(item=><div className="gm-terrain-category" key={item.value}>
          <input type="checkbox" aria-label={"Mostrar classe "+item.label}
            checked={item.enabled} onChange={e=>updateCategory(item.value,{enabled:e.target.checked})}/>
          <input type="color" aria-label={"Cor da classe "+item.label} value={item.color}
            onChange={e=>updateCategory(item.value,{color:e.target.value})}/>
          <span title={"Código "+item.value}>{item.label}</span>
          <small>{item.value}</small>
        </div>)}
      </div>}
    {layer.credit&&<p className="gm-terrain-attribution">{layer.credit}</p>}
    <div className="gm-terrain-clip-banner"><Check size={14}/>
      <span>Recorte visual automático ao modelo DEM. O ficheiro original não é alterado.</span>
    </div>
  </div>;
}
