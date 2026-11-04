import type {RefObject} from "react";
import type {MapEngine} from "@geolibre/map";
import {GeoMozSeismicPanel} from "./GeoMozSeismicPanel";
import {GeoMozTopographicProfile} from "./GeoMozTopographicProfile";
import {GeoMozFloatingToolCard} from "./GeoMozFloatingToolCard";
import {GeoMozSettingsMenu} from "./GeoMozSettingsMenu";
import {GeoMozQmsCatalog} from "./GeoMozQmsCatalog";
import {GeoMozNextgisWebCatalog} from "./GeoMozNextgisWebCatalog";
import {GeoMozQgisPrintPanel} from "./GeoMozQgisPrintPanel";
import {GeoMozLayerCreation} from "./GeoMozLayerCreation";
import {AboutDialog} from "../layout/AboutDialog";
import { GEOMOZ_ROLLOUT, curateGeoMozCommands } from "../../lib/geomoz-workbench-profile";
import {useLanguage} from "../../hooks/useLanguage";
import { useTranslation } from "react-i18next";
import { workbenchText, translatedCommand, workbenchCoreLabel, type WorkbenchCopyKey } from "./geomoz-workbench-locale";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAppStore, DEFAULT_PROJECT_NAME } from "@geolibre/core";
import { ArrowUpRight, Search, ChevronDown, Layers3, Grid2X2, Command as CommandIcon, Compass, Activity, Image, Database, Info, FileText, Route } from "lucide-react";
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
  data:[{label:"Serviços de mapas",ids:["add.wms","add.wfs","add.xyz","add.wmts"]},{label:"Raster",ids:["add.raster","proc.georeferencer","proc.raster.reproject","proc.raster.clip-extent","proc.raster.clip-mask","proc.raster.slope","proc.raster.hillshade","proc.raster.contour"]},{label:"Vector",ids:["add.vector","add.delimited-text","plugin.maplibre-gl-geo-editor","proc.vector.buffer","proc.vector.clip","proc.vector.intersection","proc.vector.dissolve","proc.vector.reproject"]},{label:"Cartografia",ids:["project.print-layout","project.save-as","control.legend","control.colorbar","control.measure"]}],
  analysis:[{label:"Análise vectorial",ids:["proc.vector.buffer","proc.vector.clip","proc.vector.intersection","proc.vector.dissolve","proc.vector.reproject"]},{label:"Análise do terreno",ids:["proc.raster.slope","proc.raster.hillshade","proc.raster.contour","proc.raster.clip-mask"]}],
  output:[{label:"Mapa e projecto",ids:["project.print-layout","project.save-as"]},{label:"Elementos do mapa",ids:["control.legend","control.colorbar"]}],
};
const ACTIONS = GEOMOZ_ROLLOUT.fullMenus ? LEGACY_ACTIONS : {...LEGACY_ACTIONS,...CORE_ACTIONS};
const LABELS: Record<string,string> = {
  "project.new":"Novo projecto","project.examples":"Exemplos","project.open-file":"Abrir ficheiro","project.open-url":"Abrir URL",
  "project.save":"Guardar","project.save-as":"Guardar como","project.share":"Partilhar","project.collaborate":"Colaborar",
  "project.print-layout":"Layout de impressão",
  "proc.georeferencer":"Georreferenciar imagem",
  "plugin.maplibre-gl-geo-editor":"Digitalizar / editar","add.delimited-text":"Tabela / CSV","add.wms":"WMS","add.wfs":"WFS","add.xyz":"XYZ","add.wmts":"WMTS","proc.vector.intersection":"Intersecção","proc.vector.reproject":"Reprojectar","proc.raster.reproject":"Reprojectar raster","proc.raster.clip-extent":"Recortar por extensão","proc.raster.contour":"Curvas de nível","proc.raster.clip-mask":"Recortar DEM",
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

const CATEGORY_TRANSLATIONS: Record<string,Record<string,string>> = {
  en: {"Serviços de mapas":"Map services","Raster":"Raster","Vector":"Vector","Cartografia":"Cartography","Hidrologia":"Hydrology","Catálogos sísmicos":"Seismic catalogues"},
  es: {"Serviços de mapas":"Servicios de mapas","Raster":"Ráster","Vector":"Vector","Cartografia":"Cartografía","Hidrologia":"Hidrología","Catálogos sísmicos":"Catálogos sísmicos"},
  fr: {"Serviços de mapas":"Services cartographiques","Raster":"Raster","Vector":"Vecteur","Cartografia":"Cartographie","Hidrologia":"Hydrologie","Catálogos sísmicos":"Catalogues sismiques"},
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
  // Use the engine's existing persisted i18next preference and lazy-loaded locales.
  const {language}=useLanguage();
  const {t:engineT}=useTranslation();
  // Normalize the strongly typed i18next overload to the dynamic engine-key contract.
  // Supplying defaultValue is mandatory for arbitrary source catalog keys.
  const translateEngine=(key:string,options?:{defaultValue:string}):string=>
    String(engineT(key,{defaultValue:options?.defaultValue??""}));
  const txt=(key:WorkbenchCopyKey)=>workbenchText(language,key);
  const coreLabel=(name:string)=>workbenchCoreLabel(name,language,translateEngine);
  const categoryLabel=(name:string)=>language==="pt"?name:
    CATEGORY_TRANSLATIONS[language]?.[name]??(coreLabel(name)!==name?coreLabel(name):CATEGORY_TRANSLATIONS.en[name]??name);
  const commandLabel=(command:Command)=>translatedCommand(language,command.id,LABELS[command.id]??command.title,translateEngine);
  const moduleLabel=(url:string,fallback:string)=>{
    const keys:Record<string,WorkbenchCopyKey>={"/dashboard":"overview","/mapa":"explorer","/analises":"analysis",
      "/hidrografia":"watersheds","/agua-subterranea":"groundwater","/geoperigos":"hazards","/documentacao":"docs"};
    return keys[url]?txt(keys[url]):fallback;
  };
  const name=useAppStore(s=>s.projectName);
  const setName=useAppStore(s=>s.setProjectName);
  const layers=useAppStore(s=>s.layers);
  const [more,setMore]=useState(false);
  const [aboutOpen,setAboutOpen]=useState(false);
  const [seismicOpen,setSeismicOpen]=useState(false);
  const [topoOpen,setTopoOpen]=useState(false);
  const [qmsOpen,setQmsOpen]=useState(false);
  const [openToolCard,setOpenToolCard]=useState<string|null>(null);
  const [ngwOpen,setNgwOpen]=useState(false);
  const [qgisPrintOpen,setQgisPrintOpen]=useState(false);
  const [layerWizardOpen,setLayerWizardOpen]=useState(false);
  const activeTask:Task=viewer?"map":GEOMOZ_ROLLOUT.fullMenus?task:"data";
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
        <a className="gm-brand" href="/dashboard" aria-label={"GeoMoz Explorer — "+txt("overview")}><img src="/favicon.svg" alt="" /><span>Geo<span>Moz</span><small>GIS WORKSPACE</small></span></a>
        <div className="gm-project-title"><span className="gm-project-symbol"><Layers3 size={17}/></span>
          <label className="gm-project-field"><span>{txt("current")}</span><input aria-label={txt("projectName")} value={name} readOnly={viewer}
            onChange={event=>{if(!viewer)setName(event.target.value);}}
            onBlur={event=>{if(!viewer&&!event.target.value.trim())setName(DEFAULT_PROJECT_NAME);}}
            onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing)event.currentTarget.blur();}} /></label>
        </div>
        <div className="gm-project-menu">{children}</div>
        <div className="gm-title-actions">
          {!viewer&&<button type="button" className="gm-command-search" onClick={onSearch}><Search size={15}/><span>{txt("search")}</span><kbd>⌘ / Ctrl K</kbd></button>}
          <details className="gm-module-switch"><summary aria-label={txt("modulesOpen")}><Grid2X2 size={16}/><span>{txt("modules")}</span></summary><nav aria-label={txt("modules")}><small>{txt("platform")}</small>{[["/dashboard","Visão geral"],["/mapa","Explorador de mapas"],["/analises","GeoAnálises"],["/hidrografia","Bacias hidrográficas"],["/agua-subterranea","Água subterrânea"],["/geoperigos","Geoperigos"],["/geomoz-ai","GeoMoz AI"],["/documentacao","Documentação"]].map(([href,label])=><a key={href} href={href}>{moduleLabel(href,label)}<ArrowUpRight size={12}/></a>)}</nav></details>
          <GeoMozSettingsMenu themeMode={themeMode} onToggleThemeMode={onToggleThemeMode}
            onAbout={()=>setAboutOpen(true)} helpCommands={["help.shortcuts","help.diagnostics"].flatMap(id=>{const command=registry.get(id);return command?[command]:[];})}/>
        </div>
      </div>
      {!GEOMOZ_ROLLOUT.fullMenus&&<div className="gm-taskbar gm-compact-taskbar" data-testid="geomoz-compact-taskbar">
        <nav aria-label={txt("gisCategories")} className="gm-compact-tool-list">
          {!viewer&&groups.map(group=><GeoMozFloatingToolCard
            key={group.label} title={categoryLabel(group.label)}
            icon={group.label==="Raster"?Image:group.label==="Cartografia"?FileText:group.label==="Vector"?Layers3:Database}
            open={openToolCard===group.label}
            onToggle={()=>{setOpenToolCard(openToolCard===group.label?null:group.label);setSeismicOpen(false);window.dispatchEvent(new CustomEvent("geomoz:task",{detail:group.label==="Vector"?"vector":"data"}));}}
            onClose={()=>setOpenToolCard(null)}>
            {group.label==="Raster"&&<button type="button" data-action="geomoz-topographic-profile"
              onClick={()=>{setOpenToolCard(null);setTopoOpen(true);setSeismicOpen(false);}}>
              <Route size={17}/><span>{txt("topography")}</span>
            </button>}
            {group.label==="Raster"&&<a href="/analises?terrain3d=1" data-action="geomoz-terrain-studio-3d"
              target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>
              <Image size={17}/><span>{txt("terrain3D")}</span><ArrowUpRight size={13}/>
            </a>}
            {group.label==="Vector"&&<button type="button" data-testid="geomoz-create-layer" onClick={()=>{setOpenToolCard(null);setLayerWizardOpen(true);}}>
              <Layers3 size={17}/><span>{txt("newLayer")}</span>
            </button>}
            {group.items.map(command=>{const Icon=command.icon??CommandIcon;return <button key={command.id} type="button"
              data-command={command.id} disabled={!!command.disabledReason} title={command.disabledReason??command.title}
              onClick={()=>{if(!command.disabledReason){setOpenToolCard(null);command.run();}}}>
              <Icon size={17}/><span>{commandLabel(command)}</span>
            </button>;})}
            {group.label==="Serviços de mapas"&&<>
              <button type="button" data-action="geomoz-qms" onClick={()=>{setOpenToolCard(null);setQmsOpen(true);setNgwOpen(false);}}>
                <Database size={17}/><span>{txt("qms")}</span>
              </button>
              <button type="button" data-action="geomoz-nextgis-web" onClick={()=>{setOpenToolCard(null);setNgwOpen(true);setQmsOpen(false);}}>
                <Database size={17}/><span>{txt("nextgis")}</span>
              </button>
            </>}
            {group.label==="Cartografia"&&<button type="button" data-action="geomoz-qgis-print" onClick={()=>{setOpenToolCard(null);setQgisPrintOpen(true);}}>
              <FileText size={17}/><span>{txt("print")}</span>
            </button>}
          </GeoMozFloatingToolCard>)}
          {!viewer&&<GeoMozFloatingToolCard title={categoryLabel("Hidrologia")} description={txt("hydrologyToolsHelp")} icon={Activity}
            open={openToolCard==="Hidrologia"}
            onToggle={()=>{setOpenToolCard(openToolCard==="Hidrologia"?null:"Hidrologia");setSeismicOpen(false);}}
            onClose={()=>setOpenToolCard(null)} testId="geomoz-hydrology-card">
            <a href="/hidrografia" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("watersheds")} <ArrowUpRight size={13}/></a>
            <a href="/agua-subterranea" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("groundwater")} <ArrowUpRight size={13}/></a>
            <a href="/geoprocessamento" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("terrainWater")} <ArrowUpRight size={13}/></a>
          </GeoMozFloatingToolCard>}
          {!viewer&&<button type="button" className="gm-compact-seismic" data-action="geomoz-seismic"
            aria-expanded={seismicOpen} onClick={()=>{setOpenToolCard(null);setSeismicOpen(!seismicOpen);window.dispatchEvent(new CustomEvent("geomoz:task",{detail:"data"}));}}>
            <Activity size={16}/><span>{txt("seismic")}</span>
          </button>}
        </nav>
        <span className="gm-session-badge"><i/>{viewer?txt("readOnly"):txt("projectOpen")}<span className="gm-session-detail"> · {layers.length} {layers.length===1?txt("layer"):txt("layers")}</span></span>
      </div>}
      {GEOMOZ_ROLLOUT.fullMenus&&<>
      <div className="gm-taskbar"><nav aria-label={txt("gisTasks")} className="gm-task-tabs">{TASKS.filter(([id])=>!viewer||id==="map").map(([id,label])=>
        <button key={id} type="button" aria-current={activeTask===id?"page":undefined} onClick={()=>{setTask(id);setOpenToolCard(null);setMore(false);setSeismicOpen(id==="seismic");window.dispatchEvent(new CustomEvent("geomoz:task",{detail:id}));}} data-task={id}>{categoryLabel(label)}</button>)}</nav>
        <span className="gm-session-badge"><i/>{viewer?txt("readOnly"):txt("projectOpen")}<span className="gm-session-detail"> · {layers.length} {layers.length===1?txt("layer"):txt("layers")}</span></span>
      </div>
      <div className="gm-command-ribbon" aria-label={txt("commandTitle")+categoryLabel(TASKS.find(([id])=>id===activeTask)?.[1]??"")}>
        <div className="gm-ribbon-groups">{groups.map(group=><section className={"gm-ribbon-group"+(activeTask==="data"&&group.label!=="Adicionar dados"?" gm-ribbon-optional":"")} key={group.label}>
          {activeTask==="data"&&group.label!=="Adicionar dados"?<GeoMozFloatingToolCard
            title={categoryLabel(group.label)} icon={group.label==="Raster"?Image:group.label==="Cartografia"?FileText:group.label==="Vector"?Layers3:Database}
            open={openToolCard===group.label}
            onToggle={()=>setOpenToolCard(openToolCard===group.label?null:group.label)}
            onClose={()=>setOpenToolCard(null)}>
            {group.items.map(command=>{const Icon=command.icon??CommandIcon;return <button key={command.id} type="button" data-command={command.id} disabled={!!command.disabledReason} title={command.disabledReason??command.title} onClick={()=>{if(!command.disabledReason){setOpenToolCard(null);command.run();}}}><Icon size={17}/><span>{commandLabel(command)}</span></button>;})}{group.label==="Serviços de mapas"&&!viewer&&<>
            <button type="button" data-action="geomoz-qms" aria-expanded={qmsOpen} onClick={()=>{setOpenToolCard(null);setQmsOpen(!qmsOpen);setNgwOpen(false);}}><Database size={17}/><span>NextGIS QMS</span></button>
            <button type="button" data-action="geomoz-nextgis-web" aria-expanded={ngwOpen} onClick={()=>{setOpenToolCard(null);setNgwOpen(!ngwOpen);setQmsOpen(false);}}><Database size={17}/><span>NextGIS Web</span></button>
          </>}
          </GeoMozFloatingToolCard>:<><div>{group.items.map(command=>{
          const Icon=command.icon??CommandIcon;
          return <button key={command.id} type="button" data-command={command.id} aria-pressed={command.id==="plugin.maplibre-gl-geo-editor"?command.keywords?.includes("deactivate"):undefined} disabled={!!command.disabledReason}
            title={command.disabledReason??command.title} onClick={()=>{if(!command.disabledReason)command.run();}}><Icon size={19}/><span>{command.id==="plugin.maplibre-gl-geo-editor"&&command.keywords?.includes("deactivate")?txt("finishDrawing"):commandLabel(command)}</span></button>;
        })}</div><small>{categoryLabel(group.label)}</small></>}</section>)}
        {!viewer&&activeTask==="data"&&<section className="gm-ribbon-group gm-ribbon-optional">
          <GeoMozFloatingToolCard title={categoryLabel("Hidrologia")} icon={Activity}
            open={openToolCard==="Hidrologia"}
            onToggle={()=>setOpenToolCard(openToolCard==="Hidrologia"?null:"Hidrologia")}
            onClose={()=>setOpenToolCard(null)} testId="geomoz-hydrology-card">
            <a href="/hidrografia" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("watersheds")} <ArrowUpRight size={13}/></a>
            <a href="/agua-subterranea" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("groundwater")} <ArrowUpRight size={13}/></a>
            <a href="/geoprocessamento" target="_blank" rel="noopener noreferrer" onClick={()=>setOpenToolCard(null)}>{txt("terrainWater")} <ArrowUpRight size={13}/></a>
          </GeoMozFloatingToolCard>
        </section>}
        {!viewer&&activeTask==="map"&&<section className="gm-ribbon-group"><div><button type="button" data-testid="geomoz-create-layer" onClick={()=>setLayerWizardOpen(true)}><Layers3 size={19}/><span>{txt("newLayerShort")}</span></button></div><small>{txt("geology")}</small></section>}
        {!viewer&&activeTask==="data"&&<section className="gm-ribbon-group"><div><button type="button" data-action="geomoz-seismic" aria-expanded={seismicOpen} onClick={()=>setSeismicOpen(!seismicOpen)}><Activity size={19}/><span>{txt("seismic")}</span></button></div><small>{txt("seismicData")}</small></section>}
        {!viewer&&activeTask==="output"&&<section className="gm-ribbon-group"><div><button type="button" data-action="geomoz-qgis-print" aria-expanded={qgisPrintOpen} onClick={()=>setQgisPrintOpen(!qgisPrintOpen)}><FileText size={19}/><span>{txt("print")}</span></button></div><small>{txt("mapLayout")}</small></section>}
        {!groups.length&&<p className="gm-ribbon-empty"><Compass size={22}/> {txt("taskOptions")}</p>}
        {activeTask==="map"&&<span className="gm-digitizing-ribbon-tip"><Info size={15}/> {txt("editingHint")}</span>}</div>
        {GEOMOZ_ROLLOUT.fullMenus&&<button type="button" className="gm-more-tools" aria-expanded={more} onClick={()=>setMore(!more)}>{txt("tools")} <ChevronDown size={14}/></button>}
      </div>
      <p className="gm-task-guidance" role="status" hidden={more}>{viewer?txt("viewerHelp"):txt(activeTask==="map"?"vectorHelp":activeTask==="data"?"dataHelp":activeTask==="analysis"?"analysisHelp":"resultsHelp")}</p>
      </>}
      {layerWizardOpen&&!viewer&&<GeoMozLayerCreation onClose={()=>setLayerWizardOpen(false)}/>}
      {qgisPrintOpen&&!viewer&&<GeoMozQgisPrintPanel onClose={()=>setQgisPrintOpen(false)}/>}
      {ngwOpen&&!viewer&&<GeoMozNextgisWebCatalog onClose={()=>setNgwOpen(false)}/>}
      {qmsOpen&&!viewer&&<GeoMozQmsCatalog onClose={()=>setQmsOpen(false)}/>}
      {topoOpen&&!viewer&&<GeoMozTopographicProfile mapControllerRef={mapControllerRef} onClose={()=>setTopoOpen(false)}/>}
      {seismicOpen&&!viewer&&<GeoMozSeismicPanel mapControllerRef={mapControllerRef} onClose={()=>{setSeismicOpen(false);if(task==="seismic")setTask("data");}}/>}
    </header>
    <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} renderTrigger={false}/>
  </TaskContext.Provider>;
}
