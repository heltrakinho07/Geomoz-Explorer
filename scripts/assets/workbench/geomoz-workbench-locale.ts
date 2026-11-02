/** Localize the GeoMoz-owned Workbench shell with upstream i18next.
 * Core GIS vocabulary resolves through the same 20 locales as the engine.
 * Product-only labels have reviewed pt/en/es/fr catalogs; other locales
 * explicitly fall back to English instead of silently reverting to Portuguese.
 */
export const UPSTREAM_LABEL_KEYS: Record<string,string> = {
  "Projecto":"common.project","Dados":"toolbar.sectionFiles","Mapa":"map.title",
  "Análise":"toolbar.subGroupAnalysis","Resultados":"common.results",
  "Serviços de mapas":"toolbar.sectionWebServices",
  "Raster":"toolbar.raster","Vector":"toolbar.vector","Cartografia":"printLayout.title",
  "Hidrologia":"toolbar.hydrology",
  "Aproximar":"toolbar.zoomIn","Afastar":"toolbar.zoomOut",
  "Vista anterior":"toolbar.previousView","Vista seguinte":"toolbar.nextView",
  "Reprojectar":"toolbar.subGroupReproject","Novo projecto":"newProject.title",
  "Layout de impressão":"toolbar.printLayoutEllipsis","Abrir URL":"toolbar.openProjectFromUrl",
  "Georreferenciar imagem":"toolbar.georeferencing","Curvas de nível":"processing.contours",
  "Rastrear":"toolbar.gpsTracking","Declive":"processing.slope","Relevo sombreado":"processing.hillshade",
  "Medir":"toolbar.measure","Localizar":"toolbar.search","Legenda":"toolbar.legend",
  "Escala de cores":"toolbar.colorbar","Marcadores":"toolbar.bookmark",
  "Hidrografia":"toolbar.hydrology","Guardar como":"toolbar.saveAsEllipsis",
  "Nova camada":"toolbar.vectorLayer","Guardar":"common.save",
  "Atalhos":"shortcuts.title","Diagnóstico":"diagnostics.title",
  "Sobre":"about.title","Mais opções":"common.more",
};
const workbenchCopy = {
 pt: {
  current:"PROJECTO ACTUAL", projectName:"Nome do projecto", search:"Procurar ferramentas…",
  modules:"Módulos", modulesOpen:"Abrir módulos GeoMoz", platform:"PLATAFORMA GEOMOZ",
  overview:"Visão geral", explorer:"Explorador de mapas", analysis:"GeoAnálises",
  watersheds:"Bacias hidrográficas", groundwater:"Água subterrânea", hazards:"Geoperigos",
  docs:"Documentação", topography:"Perfil topográfico", newLayer:"Nova camada / Digitalizar",
  qms:"Catálogo de mapas-base", nextgis:"Serviços NextGIS Web", print:"Pacote PDF QGIS",
  terrainWater:"Terreno e Hidrologia", seismic:"Catálogos sísmicos",
  gisCategories:"Categorias de ferramentas GIS", gisTasks:"Tarefas GIS",
  projectOpen:"Projecto aberto", readOnly:"Vista de leitura", layer:"camada", layers:"camadas",
  taskOptions:"As opções disponíveis estão nos menus desta tarefa.",
  editingHint:"As ferramentas de desenho aparecem após seleccionar uma camada e activar a edição.",
  vectorHelp:"Prepare uma camada vectorial, active a edição, digitalize, preencha os atributos e guarde.",
  dataHelp:"Expanda os grupos de ferramentas e escolha uma operação sobre as camadas do projecto.",
  analysisHelp:"Escolha uma ferramenta, confirme os dados e execute a análise.",
  resultsHelp:"Consulte os resultados e exporte as camadas ou a composição do mapa.",
  viewerHelp:"Explore as camadas e navegue no mapa. Esta sessão está em modo de leitura.",
  newLayerShort:"Nova camada", finishDrawing:"Terminar desenho", geology:"Cartografia geológica / temática",
  seismicData:"Dados GeoMoz · USGS / ISC", mapLayout:"Cartografia vectorial A4/A3",
  commandTitle:"Comandos de ", globalData:"Dados globais", tools:"Ferramentas",
  },
 en: {
  current:"CURRENT PROJECT", projectName:"Project name", search:"Search tools…",
  modules:"Modules", modulesOpen:"Open GeoMoz modules", platform:"GEOMOZ PLATFORM",
  overview:"Overview", explorer:"Map explorer", analysis:"GeoAnalyses",
  watersheds:"Watersheds", groundwater:"Groundwater", hazards:"GeoHazards",
  docs:"Documentation", topography:"Topographic profile", newLayer:"New layer / Digitize",
  qms:"Basemap catalog", nextgis:"NextGIS Web services", print:"QGIS PDF package",
  terrainWater:"Terrain and hydrology", seismic:"Seismic catalogs",
  gisCategories:"GIS tool categories", gisTasks:"GIS tasks",
  projectOpen:"Project open", readOnly:"Read-only view", layer:"layer", layers:"layers",
  taskOptions:"Available options are in the task menus.",
  editingHint:"Drawing tools appear after you select a layer and enable editing.",
  vectorHelp:"Prepare a vector layer, enable editing, digitize, populate attributes and save.",
  dataHelp:"Expand tool groups and choose an operation for your project layers.",
  analysisHelp:"Choose a tool, verify the inputs and run the analysis.",
  resultsHelp:"Review results and export layers or the map composition.",
  viewerHelp:"Explore layers and navigate the map. This session is read-only.",
  newLayerShort:"New layer", finishDrawing:"Finish drawing", geology:"Geological / thematic cartography",
  seismicData:"GeoMoz data · USGS / ISC", mapLayout:"A4/A3 vector cartography",
  commandTitle:"Commands for ", globalData:"Global data", tools:"Tools",
  },
 es: {
  current:"PROYECTO ACTUAL", projectName:"Nombre del proyecto", search:"Buscar herramientas…",
  modules:"Módulos", modulesOpen:"Abrir módulos GeoMoz", platform:"PLATAFORMA GEOMOZ",
  overview:"Vista general", explorer:"Explorador de mapas", analysis:"GeoAnálisis",
  watersheds:"Cuencas hidrográficas", groundwater:"Aguas subterráneas", hazards:"GeoRiesgos",
  docs:"Documentación", topography:"Perfil topográfico", newLayer:"Nueva capa / Digitalizar",
  qms:"Catálogo de mapas base", nextgis:"Servicios NextGIS Web", print:"Paquete PDF QGIS",
  terrainWater:"Terreno e hidrología", seismic:"Catálogos sísmicos",
  gisCategories:"Categorías de herramientas SIG", gisTasks:"Tareas SIG",
  projectOpen:"Proyecto abierto", readOnly:"Vista de solo lectura", layer:"capa", layers:"capas",
  taskOptions:"Las opciones disponibles están en los menús de esta tarea.",
  editingHint:"Las herramientas de dibujo aparecen después de seleccionar una capa y activar su edición.",
  vectorHelp:"Prepare una capa vectorial, active la edición, digitalice y guarde.",
  dataHelp:"Expanda los grupos y elija una operación para las capas del proyecto.",
  analysisHelp:"Elija una herramienta, confirme los datos y ejecute el análisis.",
  resultsHelp:"Revise los resultados y exporte las capas o la composición.",
  viewerHelp:"Explore las capas y navegue por el mapa. Esta sesión es de solo lectura.",
  newLayerShort:"Nueva capa", finishDrawing:"Terminar dibujo", geology:"Cartografía geológica / temática",
  seismicData:"Datos GeoMoz · USGS / ISC", mapLayout:"Cartografía vectorial A4/A3",
  commandTitle:"Comandos de ", globalData:"Datos globales", tools:"Herramientas",
  },
 fr: {
  current:"PROJET ACTUEL", projectName:"Nom du projet", search:"Rechercher des outils…",
  modules:"Modules", modulesOpen:"Ouvrir les modules GeoMoz", platform:"PLATEFORME GEOMOZ",
  overview:"Vue d'ensemble", explorer:"Explorateur de cartes", analysis:"GéoAnalyses",
  watersheds:"Bassins versants", groundwater:"Eaux souterraines", hazards:"GéoRisques",
  docs:"Documentation", topography:"Profil topographique", newLayer:"Nouvelle couche / Numériser",
  qms:"Catalogue de fonds de carte", nextgis:"Services NextGIS Web", print:"Dossier PDF QGIS",
  terrainWater:"Terrain et hydrologie", seismic:"Catalogues sismiques",
  gisCategories:"Catégories d'outils SIG", gisTasks:"Tâches SIG",
  projectOpen:"Projet ouvert", readOnly:"Vue en lecture seule", layer:"couche", layers:"couches",
  taskOptions:"Les options disponibles se trouvent dans les menus de cette tâche.",
  editingHint:"Les outils de dessin apparaissent après sélection et activation de l'édition d'une couche.",
  vectorHelp:"Préparez une couche vectorielle, activez l'édition, numérisez et enregistrez.",
  dataHelp:"Développez les groupes d'outils et choisissez une opération pour vos couches.",
  analysisHelp:"Choisissez un outil, vérifiez les entrées et lancez l'analyse.",
  resultsHelp:"Consultez les résultats et exportez les couches ou la mise en page.",
  viewerHelp:"Explorez les couches et naviguez sur la carte. Session en lecture seule.",
  newLayerShort:"Nouvelle couche", finishDrawing:"Terminer le dessin", geology:"Cartographie géologique / thématique",
  seismicData:"Données GeoMoz · USGS / ISC", mapLayout:"Cartographie vectorielle A4/A3",
  commandTitle:"Commandes de ", globalData:"Données mondiales", tools:"Outils",
  },
} as const;
export type WorkbenchCopyKey=keyof typeof workbenchCopy.pt;
export function workbenchText(language:string,key:WorkbenchCopyKey):string{
  const dict=workbenchCopy[language as keyof typeof workbenchCopy]??workbenchCopy.en;
  return dict[key];
}
export function workbenchCoreLabel(
  text:string, language:string,
  translate:(key:string,options?:{defaultValue:string})=>string
):string{
  const key=UPSTREAM_LABEL_KEYS[text];
  if(!key)return text;
  const translated=translate(key,{defaultValue:""});
  // Keep localized catalog label only when the key actually exists.
  return translated && translated!==key ? translated : text;
}

/** GeoMoz labels not found in the upstream engine's command catalogs. */
const commandCopy:Record<string,Record<string,string>>={
 en:{
 "project.new":"New project","project.open-file":"Open file","project.open-url":"Open URL","project.save":"Save",
 "project.save-as":"Save as","project.print-layout":"Print layout","proc.georeferencer":"Georeference image",
 "add.raster":"Raster / DEM","add.vector":"Vector / GeoPackage","add.delimited-text":"Table / CSV",
 "plugin.maplibre-gl-geo-editor":"Digitize / edit","proc.vector.buffer":"Buffer","proc.vector.clip":"Clip",
 "proc.vector.intersection":"Intersect","proc.vector.dissolve":"Dissolve","proc.vector.reproject":"Reproject",
 "proc.raster.reproject":"Reproject raster","proc.raster.clip-extent":"Clip by extent",
 "proc.raster.clip-mask":"Clip DEM","proc.raster.slope":"Slope","proc.raster.hillshade":"Hillshade",
 "proc.raster.contour":"Contours","control.measure":"Measure","control.legend":"Legend",
 "control.colorbar":"Color bar","project.share":"Share","project.collaborate":"Collaborate",
 "view.zoom-in":"Zoom in","view.zoom-out":"Zoom out","view.previous":"Previous view",
 "view.next":"Next view","view.reset-north":"North","control.search":"Search",
 },
 es:{
 "project.new":"Nuevo proyecto","project.open-file":"Abrir archivo","project.open-url":"Abrir URL","project.save":"Guardar",
 "project.save-as":"Guardar como","project.print-layout":"Diseño de impresión","proc.georeferencer":"Georreferenciar imagen",
 "add.raster":"Ráster / MDE","add.vector":"Vector / GeoPackage","add.delimited-text":"Tabla / CSV",
 "plugin.maplibre-gl-geo-editor":"Digitalizar / editar","proc.vector.buffer":"Búfer","proc.vector.clip":"Recortar",
 "proc.vector.intersection":"Intersección","proc.vector.dissolve":"Disolver","proc.vector.reproject":"Reproyectar",
 "proc.raster.reproject":"Reproyectar ráster","proc.raster.clip-extent":"Recortar por extensión",
 "proc.raster.clip-mask":"Recortar MDE","proc.raster.slope":"Pendiente","proc.raster.hillshade":"Sombreado de relieve",
 "proc.raster.contour":"Curvas de nivel","control.measure":"Medir","control.legend":"Leyenda",
 "control.colorbar":"Barra de colores","project.share":"Compartir","project.collaborate":"Colaborar",
 "view.zoom-in":"Acercar","view.zoom-out":"Alejar","view.previous":"Vista anterior",
 "view.next":"Vista siguiente","view.reset-north":"Norte","control.search":"Buscar",
 },
 fr:{
 "project.new":"Nouveau projet","project.open-file":"Ouvrir un fichier","project.open-url":"Ouvrir une URL","project.save":"Enregistrer",
 "project.save-as":"Enregistrer sous","project.print-layout":"Mise en page","proc.georeferencer":"Géoréférencer une image",
 "add.raster":"Raster / MNT","add.vector":"Vecteur / GeoPackage","add.delimited-text":"Table / CSV",
 "plugin.maplibre-gl-geo-editor":"Numériser / modifier","proc.vector.buffer":"Zone tampon","proc.vector.clip":"Découper",
 "proc.vector.intersection":"Intersection","proc.vector.dissolve":"Fusionner","proc.vector.reproject":"Reprojeter",
 "proc.raster.reproject":"Reprojeter le raster","proc.raster.clip-extent":"Découper par emprise",
 "proc.raster.clip-mask":"Découper le MNT","proc.raster.slope":"Pente","proc.raster.hillshade":"Ombrage du relief",
 "proc.raster.contour":"Courbes de niveau","control.measure":"Mesurer","control.legend":"Légende",
 "control.colorbar":"Échelle de couleurs","project.share":"Partager","project.collaborate":"Collaborer",
 "view.zoom-in":"Zoom avant","view.zoom-out":"Zoom arrière","view.previous":"Vue précédente",
 "view.next":"Vue suivante","view.reset-north":"Nord","control.search":"Rechercher",
 },
};
export function translatedCommand(
 language:string,id:string,original:string,
 translate:(key:string,options?:{defaultValue:string})=>string,
):string {
 if(language==="pt")return original;
 const custom=commandCopy[language]?.[id];
 if(custom)return custom;
 const translated=workbenchCoreLabel(original,language,translate);
 if(translated!==original)return translated;
 return (commandCopy.en[id] ?? original);
}
