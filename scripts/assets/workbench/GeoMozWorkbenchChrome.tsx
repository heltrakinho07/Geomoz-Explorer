import type {RefObject} from "react";
import type {MapEngine} from "@geolibre/map";
import {GeoMozSeismicPanel} from "./GeoMozSeismicPanel";
import {GeoMozToolCatalog,type GeoMozCatalogDefinition} from "./GeoMozToolCatalog";
import {GeoMozLayerCreation} from "./GeoMozLayerCreation";
import {AboutDialog} from "../layout/AboutDialog";
import { GEOMOZ_ROLLOUT, curateGeoMozCommands } from "../../lib/geomoz-workbench-profile";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAppStore, DEFAULT_PROJECT_NAME } from "@geolibre/core";
import { ArrowUpRight, Search, Moon, Sun, ChevronDown, Layers3, Grid2X2, Command as CommandIcon, Compass, Activity, Image, Database, Info, Globe2, Mountain, Server, Network, MapPin, Waypoints, ScanLine, RadioTower, Landmark } from "lucide-react";
import type { Command } from "../../lib/commands";
import type { ThemeMode } from "../../hooks/useThemeMode";

type Task = "project" | "data" | "map" | "analysis" | "output" | "settings" | "seismic";
const TaskContext = createContext<Task>("data");
const LEGACY_TASKS: [Task, string][] = [["project","Projecto"],["data","Dados"],["map","Mapa"],["analysis","Análise"],["seismic","Sismicidade"],["output","Publicar"],["settings","Definições"]];
const LEGACY_ACTIONS: Record<Task, {label:string; ids:string[]}[]> = {
  project: [
    {label:"Criar",ids:["project.new","project.examples"]},
    {label:"Ficheiros",ids:["project.open-file","project.open-url","project.save","project.save-as"]},
    {label:"Colaboração",ids:["project.collaborate","project.share"]},
  ],
  data: [
    {label:"Adicionar ao mapa",ids:["add.vector","add.raster","add.geoparquet","add.flatgeobuf"]},
    {label:"Catálogos",ids:["add.stac","proc.planetary-computer","proc.earth-engine"]},
    {label:"Explorar",ids:["add.duckdb","add.pmtiles","add.zarr"]},
  ],
  map: [
    {label:"Navegação",ids:["view.zoom-in","view.zoom-out","view.previous","view.next","view.reset-north"]},
    {label:"Inspecção",ids:["control.measure","control.search","control.bookmark"]},
    {label:"Apresentação",ids:["control.legend","control.minimap"]},
  ],
  analysis: [
    {label:"Vectores",ids:["proc.vector.buffer","proc.vector.clip","proc.vector.dissolve"]},
    {label:"Terreno",ids:["proc.raster.slope","proc.raster.hillshade","proc.raster.aspect"]},
    {label:"Ferramentas",ids:["proc.whitebox","proc.sql","proc.python","proc.modelBuilder"]},
  ],
  seismic: [],
  output: [
    {label:"Entregar resultados",ids:["project.print-layout","project.save-as","project.share"]},
    {label:"Apresentação",ids:["control.legend","control.colorbar"]},
  ],
  settings: [
    {label:"Ambiente",ids:["settings.manage-plugins","settings.style-manager","settings.simplify-interface"]},
    {label:"Ajuda",ids:["help.shortcuts","help.diagnostics","help.about"]},
  ],
};
const TASKS: [Task,string][] = GEOMOZ_ROLLOUT.fullMenus ? LEGACY_TASKS : [["map","Digitalizar"],["data","Dados"],["analysis","Análise"],["output","Resultados"]];
const CORE_ACTIONS: Partial<typeof LEGACY_ACTIONS> = {
  map:[{label:"Preparação cartográfica",ids:["proc.georeferencer"]}],
  data:[{label:"Adicionar dados",ids:["add.vector","add.raster","add.delimited-text"]}],
  analysis:[{label:"Análise vectorial",ids:["proc.vector.buffer","proc.vector.clip","proc.vector.intersection","proc.vector.dissolve","proc.vector.reproject"]},{label:"Análise do terreno",ids:["proc.raster.slope","proc.raster.hillshade","proc.raster.contour","proc.raster.clip-mask"]}],
  output:[{label:"Mapa e projecto",ids:["project.print-layout","project.save-as"]},{label:"Elementos do mapa",ids:["control.legend","control.colorbar"]}],
};
const ACTIONS = GEOMOZ_ROLLOUT.fullMenus ? LEGACY_ACTIONS : {...LEGACY_ACTIONS,...CORE_ACTIONS};
const GUIDANCE:Partial<Record<Task,string>> = {
  map:"1 · Prepare a carta base e crie uma camada vectorial. 2 · Seleccione-a no catálogo e active a edição. 3 · Configure a aderência e desenhe, preenchendo os atributos. 4 · Guarde as edições da camada e, separadamente, o projecto.",
  data:"Escolha uma categoria para abrir o cartão das suas ferramentas. Configure os parâmetros da ferramenta seleccionada na etapa seguinte.",
  analysis:"Escolha uma ferramenta, confirme os dados e execute a análise.",
  output:"Consulte as execuções no catálogo e exporte as camadas ou a composição do mapa.",
};
const LABELS: Record<string,string> = {
  "project.new":"Novo projecto","project.examples":"Exemplos","project.open-file":"Abrir ficheiro","project.open-url":"Abrir URL",
  "project.save":"Guardar","project.save-as":"Guardar como","project.share":"Partilhar","project.collaborate":"Colaborar",
  "project.print-layout":"Layout de impressão",
  "proc.georeferencer":"Georreferenciar imagem",
  "plugin.maplibre-gl-geo-editor":"Digitalizar / editar","add.delimited-text":"Tabela / CSV","add.wms":"WMS","add.wfs":"WFS","add.xyz":"XYZ","add.wmts":"WMTS","proc.vector.intersection":"Intersecção","proc.vector.reproject":"Reprojectar","proc.raster.contour":"Curvas de nível","proc.raster.clip-mask":"Recortar DEM",
  "add.vector":"Vector / GeoPackage","add.raster":"Raster / DEM","add.geoparquet":"GeoParquet","add.flatgeobuf":"FlatGeobuf",
  "add.stac":"Catálogo STAC","add.duckdb":"SQL / DuckDB","add.pmtiles":"PMTiles","add.zarr":"Zarr",
  "proc.planetary-computer":"Dados globais","proc.earth-engine":"Earth Engine",
  "view.zoom-in":"Aproximar","view.zoom-out":"Afastar","view.previous":"Vista anterior","view.next":"Vista seguinte","view.reset-north":"Norte",
  "control.measure":"Medir","control.search":"Localizar","control.bookmark":"Marcadores","control.legend":"Legenda","control.minimap":"Mapa geral","control.colorbar":"Escala de cores",
  "proc.vector.buffer":"Buffer","proc.vector.clip":"Recortar","proc.vector.dissolve":"Dissolver",
  "proc.raster.slope":"Declive","proc.raster.hillshade":"Relevo sombreado","proc.raster.aspect":"Orientação",
  "proc.whitebox":"Caixa de ferramentas","proc.sql":"Consulta SQL","proc.python":"Python","proc.modelBuilder":"Modelador",
  "settings.manage-plugins":"Extensões","settings.style-manager":"Estilos","settings.simplify-interface":"Personalizar",
  "help.shortcuts":"Atalhos","help.diagnostics":"Diagnóstico","help.about":"Sobre",
};

/** Secondary engine menus remain mounted, with their original permission gates and dialogs. */
export function GeoMozMenuSlot({area,children}:{area:Task;children:ReactNode}) {
  const active = useContext(TaskContext);
  return <div className="gm-menu-slot" data-area={area} hidden={area==="project"?false:!GEOMOZ_ROLLOUT.fullMenus||active !== area}>{children}</div>;
}

export function GeoMozWorkbenchChrome({children,commands,themeMode,onToggleThemeMode,onSearch,viewer,mapControllerRef}:{
  children:ReactNode; commands:Command[]; themeMode:ThemeMode;
  onToggleThemeMode:()=>void; onSearch:()=>void; viewer:boolean; mapControllerRef:RefObject<MapEngine|null>;
}) {
  const [task,setTask]=useState<Task>("data");
  const name=useAppStore(s=>s.projectName);
  const setName=useAppStore(s=>s.setProjectName);
  const layers=useAppStore(s=>s.layers);
  const [more,setMore]=useState(false);
  const [aboutOpen,setAboutOpen]=useState(false);
  const [seismicOpen,setSeismicOpen]=useState(false);
  const [openCatalog,setOpenCatalog]=useState<"services"|"raster"|"seismic"|null>(null);
  const [seismicInitial,setSeismicInitial]=useState<{provider:"usgs"|"isc";view:"catalog"|"stations"}>({provider:"usgs",view:"catalog"});
  const [layerWizardOpen,setLayerWizardOpen]=useState(false);
  const activeTask:Task=viewer?"map":task;
  const curated=curateGeoMozCommands(commands);
  const visibleCommands=viewer?curated.filter(command=>command.id.startsWith("view.")):curated;
  const registry=new Map(visibleCommands.map(command=>[command.id,command]));
  const catalogs:Record<"services"|"raster"|"seismic",GeoMozCatalogDefinition>={
    services:{
      id:"services",title:"Serviços de mapas",icon:Globe2,
      description:"Ligue serviços externos ao mapa. Escolha o protocolo e configure o endereço no formulário de ligação.",
      items:([
        ["add.wms","WMS","Mapas renderizados disponibilizados por um serviço Web.",Layers3],
        ["add.wfs","WFS","Feições vectoriais disponibilizadas por um servidor OGC.",Network],
        ["add.xyz","XYZ","Camadas base por mosaicos de imagens.",MapPin],
        ["add.wmts","WMTS","Mosaicos cartográficos do padrão OGC WMTS.",Server],
      ] as const).flatMap(([id,title,description,icon])=>{
        const command=registry.get(id);
        return command?[{id,title,description,icon,disabledReason:command.disabledReason,
          onSelect:()=>{if(!command.disabledReason)command.run();}}]:[];
      }),
    },
    raster:{
      id:"raster",title:"Ferramentas raster",icon:Mountain,
      description:"Seleccione uma operação. O motor GIS abrirá os parâmetros necessários à camada e ao resultado.",
      items:([
        ["proc.raster.reproject","Reprojectar","Converter um raster para outro sistema de coordenadas.",Globe2],
        ["proc.raster.clip-mask","Recortar DEM","Recortar um raster com a máscara de uma camada.",ScanLine],
        ["proc.raster.slope","Declive","Calcular o declive do terreno a partir do DEM.",Mountain],
        ["proc.raster.hillshade","Relevo sombreado","Gerar sombreamento do relevo.",Image],
        ["proc.raster.contour","Curvas de nível","Produzir isolinhas altimétricas a partir do DEM.",Waypoints],
      ] as const).flatMap(([id,title,description,icon])=>{
        const command=registry.get(id);
        return command?[{id,title,description,icon,disabledReason:command.disabledReason,
          onSelect:()=>{if(!command.disabledReason)command.run();}}]:[];
      }),
    },
    seismic:{
      id:"seismic",title:"Catálogos sísmicos",icon:Activity,
      description:"Consulte eventos sísmicos e estações reais. Configure os filtros no passo seguinte.",
      items:[
        {id:"seismic.usgs",title:"USGS / NEIC",description:"Eventos sísmicos e importação de resultados.",icon:Activity,
          onSelect:()=>{setSeismicInitial({provider:"usgs",view:"catalog"});setSeismicOpen(true);}},
        {id:"seismic.isc",title:"ISC",description:"Catálogo internacional de eventos sísmicos (FDSN).",icon:Landmark,
          onSelect:()=>{setSeismicInitial({provider:"isc",view:"catalog"});setSeismicOpen(true);}},
        {id:"seismic.stations",title:"Estações EarthScope",description:"Redes e estações sísmicas.",icon:RadioTower,
          onSelect:()=>{setSeismicInitial({provider:"usgs",view:"stations"});setSeismicOpen(true);}},
      ],
    },
  };
  const groups=ACTIONS[activeTask].map(group=>({...group,items:group.ids.flatMap(id=>{
    const command=registry.get(id);
    return command ? [command] : [];
  })})).filter(group=>group.items.length);
  return <TaskContext.Provider value={activeTask}>
    <header className="gm-workbench-chrome" data-testid="geomoz-workbench-chrome">
      <div className="gm-titlebar">
        <a className="gm-brand" href="/" aria-label="GeoMoz — página inicial"><img src="/favicon.svg" alt="" /><span>Geo<span>Moz</span><small>GIS WORKSPACE</small></span></a>
        <div className="gm-project-title"><span className="gm-project-symbol"><Layers3 size={17}/></span>
          <label className="gm-project-field"><span>PROJECTO ACTUAL</span><input aria-label="Nome do projecto" value={name} readOnly={viewer}
            onChange={event=>{if(!viewer)setName(event.target.value);}}
            onBlur={event=>{if(!viewer&&!event.target.value.trim())setName(DEFAULT_PROJECT_NAME);}}
            onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing)event.currentTarget.blur();}} /></label>
        </div>
        <div className="gm-project-menu">{children}</div>
        <div className="gm-title-actions">
          {!viewer&&<button type="button" className="gm-command-search" onClick={onSearch}><Search size={15}/><span>Procurar ferramentas…</span><kbd>⌘ / Ctrl K</kbd></button>}
          <details className="gm-module-switch gm-help-menu"><summary aria-label="Ajuda GeoMoz">?</summary><nav aria-label="Ajuda GeoMoz"><small>APOIO AO ESTUDO</small>{["help.shortcuts","help.diagnostics"].map(id=>{const command=registry.get(id);return command?<button key={id} type="button" disabled={!!command.disabledReason} title={command.disabledReason} onClick={()=>{if(!command.disabledReason)command.run();}}>{LABELS[id]}</button>:null;})}<a href="/documentacao">Documentação <ArrowUpRight size={12}/></a><button type="button" data-testid="geomoz-about-trigger" onClick={()=>setAboutOpen(true)}>Sobre o GeoMoz GIS Workspace</button></nav></details>
          <details className="gm-module-switch"><summary aria-label="Abrir módulos GeoMoz"><Grid2X2 size={16}/><span>Módulos</span></summary><nav aria-label="Módulos GeoMoz"><small>PLATAFORMA GEOMOZ</small>{[["/dashboard","Visão geral"],["/mapa","Explorador de mapas"],["/analises","GeoAnálises"],["/hidrografia","Bacias hidrográficas"],["/agua-subterranea","Água subterrânea"],["/geoperigos","Geoperigos"],["/geomoz-ai","GeoMoz AI"],["/documentacao","Documentação"]].map(([href,label])=><a key={href} href={href}>{label}<ArrowUpRight size={12}/></a>)}</nav></details>
          <button type="button" className="gm-icon-button" data-testid="geomoz-theme-toggle" onClick={onToggleThemeMode}
            aria-label={themeMode==="dark"?"Activar modo claro":"Activar modo nocturno"} title={themeMode==="dark"?"Activar modo claro":"Activar modo nocturno"}>{themeMode==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button>
        </div>
      </div>
      <div className="gm-taskbar"><nav aria-label="Tarefas GIS" className="gm-task-tabs">{TASKS.filter(([id])=>!viewer||id==="map").map(([id,label])=>
        <button key={id} type="button" aria-current={activeTask===id?"page":undefined} onClick={()=>{setTask(id);setMore(false);setSeismicOpen(id==="seismic");window.dispatchEvent(new CustomEvent("geomoz:task",{detail:id}));}} data-task={id}>{label}</button>)}</nav>
        <span className="gm-session-badge"><i/>{viewer?"Vista de leitura":"Projecto aberto"}<span className="gm-session-detail"> · {layers.length} camada{layers.length===1?"":"s"}</span></span>
      </div>
      <div className="gm-command-ribbon" aria-label={"Comandos de "+TASKS.find(([id])=>id===activeTask)?.[1]}>
        <div className="gm-ribbon-groups">{groups.map(group=><section className="gm-ribbon-group" key={group.label}><div>{group.items.map(command=>{
          const Icon=command.icon??CommandIcon;
          return <button key={command.id} type="button" data-command={command.id} disabled={!!command.disabledReason}
            title={command.disabledReason??command.title} onClick={()=>{if(!command.disabledReason)command.run();}}>
            <Icon size={19}/><span>{LABELS[command.id]??command.title}</span></button>;
        })}</div><small>{group.label}</small></section>)}
        {!viewer&&activeTask==="map"&&<section className="gm-ribbon-group"><div><button type="button" data-testid="geomoz-create-layer" onClick={()=>setLayerWizardOpen(true)}><Layers3 size={19}/><span>Nova camada</span></button></div><small>Cartografia geológica / temática</small></section>}
        {!viewer&&activeTask==="data"&&(["services","raster","seismic"] as const).map(id=>{
          const catalog=catalogs[id];const Icon=catalog.icon;
          return <section className="gm-ribbon-group gm-tool-category-group" key={id}>
            <div><button type="button" className="gm-tool-category-trigger"
              data-testid="geomoz-catalog-trigger" data-catalog={id}
              data-action={id==="seismic"?"geomoz-seismic":undefined}
              aria-haspopup="dialog" aria-expanded={openCatalog===id}
              onClick={()=>setOpenCatalog(id)}>
              <Icon size={21}/><span>{catalog.title}</span><ChevronDown size={12}/></button></div>
            <small>{id==="services"?"WMS · WFS · XYZ · WMTS":id==="raster"?"Processamento de terreno":"USGS · ISC · EarthScope"}</small>
          </section>;
        })}
        {!groups.length&&<p className="gm-ribbon-empty"><Compass size={22}/> As opções disponíveis estão nos menus desta tarefa.</p>}
        {activeTask==="map"&&<span className="gm-digitizing-ribbon-tip"><Info size={15}/> As ferramentas de desenho aparecem após seleccionar uma camada e activar a edição.</span>}</div>
        {GEOMOZ_ROLLOUT.fullMenus&&<button type="button" className="gm-more-tools" aria-expanded={more} onClick={()=>setMore(!more)}>Mais opções <ChevronDown size={14}/></button>}
      </div>
      <p className="gm-task-guidance" role="status" hidden={more}>{viewer?"Explore as camadas e navegue no mapa. Esta sessão está em modo de leitura.":GUIDANCE[activeTask]}</p>
      {openCatalog&&!viewer&&activeTask==="data"&&<GeoMozToolCatalog catalog={catalogs[openCatalog]} onClose={()=>setOpenCatalog(null)}/>}
      {layerWizardOpen&&!viewer&&<GeoMozLayerCreation onClose={()=>setLayerWizardOpen(false)}/>}
      {seismicOpen&&!viewer&&<GeoMozSeismicPanel key={seismicInitial.view+"-"+seismicInitial.provider} initialProvider={seismicInitial.provider} initialView={seismicInitial.view} mapControllerRef={mapControllerRef} onClose={()=>{setSeismicOpen(false);if(task==="seismic")setTask("data");}}/>}
    </header>
    <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} renderTrigger={false}/>
  </TaskContext.Provider>;
}
