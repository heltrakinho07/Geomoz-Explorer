import type {RefObject} from "react";
import type {MapEngine} from "@geolibre/map";
import {GeoMozSeismicPanel} from "./GeoMozSeismicPanel";
import {AboutDialog} from "../layout/AboutDialog";
import { GEOMOZ_ROLLOUT, curateGeoMozCommands } from "../../lib/geomoz-workbench-profile";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAppStore, DEFAULT_PROJECT_NAME } from "@geolibre/core";
import { ArrowUpRight, Search, Moon, Sun, ChevronDown, Layers3, Grid2X2, Command as CommandIcon, Compass, Activity } from "lucide-react";
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
const TASKS: [Task,string][] = GEOMOZ_ROLLOUT.fullMenus ? LEGACY_TASKS : [["map","Área de estudo"],["data","Dados"],["analysis","Análise"],["output","Resultados"]];
const CORE_ACTIONS: Partial<typeof LEGACY_ACTIONS> = {
  map:[{label:"Digitalização e área de estudo",ids:["plugin.maplibre-gl-geo-editor","add.vector"]},{label:"Explorar o território",ids:["control.measure","control.search","view.previous","view.reset-north"]}],
  data:[{label:"Ficheiros locais",ids:["add.vector","add.raster","add.delimited-text"]},{label:"Serviços de mapas",ids:["add.wms","add.wfs","add.xyz","add.wmts"]}],
  analysis:[{label:"Análise vectorial",ids:["proc.vector.buffer","proc.vector.clip","proc.vector.intersection","proc.vector.dissolve","proc.vector.reproject"]},{label:"Análise do terreno",ids:["proc.raster.slope","proc.raster.hillshade","proc.raster.contour","proc.raster.clip-mask"]}],
  output:[{label:"Mapa e projecto",ids:["project.print-layout","project.save-as"]},{label:"Elementos do mapa",ids:["control.legend","control.colorbar"]}],
};
const ACTIONS = GEOMOZ_ROLLOUT.fullMenus ? LEGACY_ACTIONS : {...LEGACY_ACTIONS,...CORE_ACTIONS};
const GUIDANCE:Partial<Record<Task,string>> = {
  map:"Digitalize pontos, linhas, polígonos e rectângulos ou importe uma camada. A edição geométrica básica está disponível; a edição de atributos ainda não foi activada.",
  data:"Adicione os dados do estudo. Organize as camadas no catálogo.",
  analysis:"Escolha uma ferramenta, confirme os dados e execute a análise.",
  output:"Consulte as execuções no catálogo e exporte as camadas ou a composição do mapa.",
};
const LABELS: Record<string,string> = {
  "project.new":"Novo projecto","project.examples":"Exemplos","project.open-file":"Abrir ficheiro","project.open-url":"Abrir URL",
  "project.save":"Guardar","project.save-as":"Guardar como","project.share":"Partilhar","project.collaborate":"Colaborar",
  "project.print-layout":"Layout de impressão",
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
  const activeTask:Task=viewer?"map":task;
  const curated=curateGeoMozCommands(commands);
  const visibleCommands=viewer?curated.filter(command=>command.id.startsWith("view.")):curated;
  const registry=new Map(visibleCommands.map(command=>[command.id,command]));
  const groups=ACTIONS[activeTask].map(group=>({...group,items:group.ids.flatMap(id=>{
    const command=registry.get(id);
    return command ? [command] : [];
  })})).filter(group=>group.items.length);
  return <TaskContext.Provider value={activeTask}>
    <header className="gm-workbench-chrome" data-testid="geomoz-workbench-chrome">
      <div className="gm-titlebar">
        <a className="gm-brand" href="/" aria-label="GeoMoz — página inicial"><img src="/gis-workspace/favicon.svg" alt="" /><span>Geo<span>Moz</span><small>GIS WORKSPACE</small></span></a>
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
          return <button key={command.id} type="button" data-command={command.id} aria-pressed={command.id==="plugin.maplibre-gl-geo-editor"?command.keywords?.includes("deactivate"):undefined} disabled={!!command.disabledReason}
            title={command.disabledReason??command.title} onClick={()=>{if(!command.disabledReason)command.run();}}><Icon size={19}/><span>{command.id==="plugin.maplibre-gl-geo-editor"&&command.keywords?.includes("deactivate")?"Terminar desenho":LABELS[command.id]??command.title}</span></button>;
        })}</div><small>{group.label}</small></section>)}
        {!viewer&&activeTask==="data"&&<section className="gm-ribbon-group"><div><button type="button" data-action="geomoz-seismic" aria-expanded={seismicOpen} onClick={()=>setSeismicOpen(!seismicOpen)}><Activity size={19}/><span>Catálogos sísmicos</span></button></div><small>Dados GeoMoz · USGS / ISC</small></section>}
        {!groups.length&&<p className="gm-ribbon-empty"><Compass size={22}/> As opções disponíveis estão nos menus desta tarefa.</p>}</div>
        {GEOMOZ_ROLLOUT.fullMenus&&<button type="button" className="gm-more-tools" aria-expanded={more} onClick={()=>setMore(!more)}>Mais opções <ChevronDown size={14}/></button>}
      </div>
      <p className="gm-task-guidance" role="status" hidden={more}>{viewer?"Explore as camadas e navegue no mapa. Esta sessão está em modo de leitura.":GUIDANCE[activeTask]}</p>
      {seismicOpen&&!viewer&&<GeoMozSeismicPanel mapControllerRef={mapControllerRef} onClose={()=>{setSeismicOpen(false);if(task==="seismic")setTask("data");}}/>}
    </header>
    <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} renderTrigger={false}/>
  </TaskContext.Provider>;
}
