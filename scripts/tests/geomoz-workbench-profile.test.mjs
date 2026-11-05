import test from "node:test";
// The Workbench CI runs this suite; include profile cursor geometry regressions.
import "./geomoz-topographic-profile.test.mjs";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GEOMOZ_ROLLOUT,curateGeoMozCommands,isGeoMozCommandVisible,isGeoMozDataSourceVisible,isGeoMozToolVisible,isGeoMozMenuItemVisible} from "../assets/workbench/geomoz-workbench-profile.ts";

test("core actions survive while specialist entries disappear from every command consumer",()=>{
 const ids=["project.open-file","project.save","add.vector","add.raster","add.wms","proc.vector.buffer","proc.vector.intersection","proc.raster.slope","proc.raster.contour","plugin.maplibre-gl-geo-editor","proc.georeferencer","view.theme"];
 const hidden=["proc.sql","proc.python","proc.modelBuilder","proc.whitebox","proc.earth-engine","settings.manage-plugins","settings.simplify-interface","project.examples","control.directions","control.effects","control.turn-by-turn","add.splatting","add.3d-tiles","add.duckdb","add.stac","proc.vector.voronoi","proc.network.isochrone","proc.whitebox.FillDepressions"];
 const commands=[...ids,...hidden].map(id=>({id,run(){return id;}}));
 const curated=curateGeoMozCommands(commands);
 assert.deepEqual(curated.map(c=>c.id),ids);
 assert.equal(curated[0],commands[0],"Original gated command identity/callback is retained");
 assert.equal(commands.length,ids.length+hidden.length,"Curation never mutates the registry");
 for(const id of hidden)assert.equal(isGeoMozCommandVisible(id),false,id);
});
test("reviewed groups can be reintroduced without restoring or deleting implementations",()=>{
 assert.equal(isGeoMozCommandVisible("add.stac",{...GEOMOZ_ROLLOUT,advancedData:true}),true);
 assert.equal(isGeoMozCommandVisible("proc.sql",{...GEOMOZ_ROLLOUT,specialistProcessing:true}),true);
 assert.equal(isGeoMozCommandVisible("proc.sql"),false);
 assert.equal(isGeoMozCommandVisible("unknown.command"),false);
 assert.ok(Object.isFrozen(GEOMOZ_ROLLOUT));
});
test("data menus, project menu and dialog lists respect the curated product",()=>{
 for(const id of ["vector","raster","wms","wfs","xyz","delimited-text"])assert.ok(isGeoMozDataSourceVisible(id));
 for(const id of ["stac","duckdb","cad","gpx","landxml","zarr"])assert.equal(isGeoMozDataSourceVisible(id),false);
 assert.ok(isGeoMozToolVisible("vector","buffer"));
 assert.equal(isGeoMozToolVisible("vector","voronoi"),false);
 assert.ok(isGeoMozToolVisible("raster","contour"));
 assert.equal(isGeoMozToolVisible("raster","raster-calc"),false);
 assert.ok(isGeoMozMenuItemVisible("project.openFrom"));
 assert.equal(isGeoMozMenuItemVisible("project.storymap"),false);
});
test("source preparation retains original menus and registries behind reversible gates",()=>{
 const prep=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
 assert.ok(prep.includes("buildToolbarCommands")===false,"Original command builder file is not replaced");
 const chrome=readFileSync(new URL("../assets/workbench/GeoMozWorkbenchChrome.tsx",import.meta.url),"utf8");
 assert.match(chrome,/LEGACY_ACTIONS/);
 assert.match(chrome,/GEOMOZ_ROLLOUT.fullMenus/);
 const layers=readFileSync(new URL("../assets/workbench/GeoMozLayerPanel.tsx",import.meta.url),"utf8");
 assert.match(layers,/<EngineLayerPanel/);
 assert.match(layers,/GEOMOZ_ROLLOUT.fullLayerManager/);
});

test("plugin lifecycle keeps the enumerable App API while callbacks remain live",async()=>{
 const {preserveCommandApi}=await import("../assets/workbench/geomoz-command-context.ts");
 const removed=[];
 let latest={appApi:{getMap:()=>"map",removeMapControl:control=>removed.push(control)},name:"first"};
 const readView=new Proxy({}, {get:(_target,key)=>key==="appApi"?new Proxy({}, {get:(_t,method)=>latest.appApi[method]}):latest[key]});
 assert.deepEqual(Object.keys(readView.appApi),[],"Reproduce the engine proxy's documented non-enumerability");
 const context=preserveCommandApi(readView,()=>latest);
 assert.equal(context.appApi,latest.appApi);
 const activationScope={...context.appApi};
 const deactivationScope={...context.appApi};
 assert.equal(activationScope.getMap(),"map");
 deactivationScope.removeMapControl("drawing-control");
 assert.deepEqual(removed,["drawing-control"]);
 latest={...latest,appApi:{...latest.appApi,getMap:()=>"new-map"},name:"second"};
 assert.equal(context.appApi.getMap(),"new-map");
 assert.equal(context.name,"second");
});

test("GeoMoz GIS Workspace enables native attribute digitizing and the geological layer wizard",()=>{
 assert.equal(isGeoMozCommandVisible("plugin.maplibre-gl-geo-editor"),true);
 assert.equal(isGeoMozCommandVisible("project.print-layout"),true);
 const chrome=readFileSync(new URL("../assets/workbench/GeoMozWorkbenchChrome.tsx",import.meta.url),"utf8");
 const prepare=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
 assert.match(chrome,/Digitalizar \/ editar/);
 assert.match(chrome,/Layout de impressão/);
 assert.match(chrome,/GeoMozLayerCreation/);
 assert.match(chrome,/geomoz-create-layer/);
 assert.match(prepare,/GEOMOZ_ROLLOUT.advancedDrawing/);
 assert.equal(GEOMOZ_ROLLOUT.advancedDrawing,true);
});

test("GeoMoz profile and shell copy follows selected language, not a fixed Portuguese UI",async()=>{
  const {profileText,PROFILE_COPY}=await import("../assets/workbench/geomoz-profile-locales.ts");
  const {workbenchText,translatedCommand}=await import("../assets/workbench/geomoz-workbench-locale.ts");
  for(const lang of ["pt","en","es","fr"]){
    assert.ok(profileText(lang,"profile"));
    assert.ok(profileText(lang,"png").includes("PNG"));
    assert.ok(profileText(lang,"pdf").includes("PDF"));
    assert.ok(workbenchText(lang,"topography"));
    assert.ok(workbenchText(lang,"search"));
    assert.ok(workbenchText(lang,"projectOpen"));
    assert.deepEqual(Object.keys(PROFILE_COPY[lang]).sort(),Object.keys(PROFILE_COPY.pt).sort(),
      "Missing translated profile label in "+lang);
  }
  assert.equal(profileText("en","compute"),"Calculate profile");
  assert.equal(profileText("es","compute"),"Calcular perfil");
  assert.equal(profileText("fr","compute"),"Calculer le profil");
  assert.equal(profileText("de","compute"),"Calculate profile","Unsupported GeoMoz-specific copy must fall back to English");
  assert.equal(translatedCommand("en","proc.raster.slope","Declive",()=>""),"Slope");
});
test("floating tool panels translate the complete help, heading and close controls",async()=>{
  const {workbenchText}=await import("../assets/workbench/geomoz-workbench-locale.ts");
  const labels={
    pt:["GEOMOZ GIS WORKSPACE / FERRAMENTAS","Seleccione uma ferramenta para trabalhar com as camadas do projecto.","Aceda às análises de bacias hidrográficas, águas subterrâneas e terreno.","Gerar mapa 3D do DEM"],
    en:["GEOMOZ GIS WORKSPACE / TOOLS","Select a tool to work with the layers in your project.","Open watershed, groundwater and terrain analysis tools.","Generate 3D map from DEM"],
    es:["GEOMOZ GIS WORKSPACE / HERRAMIENTAS","Seleccione una herramienta para trabajar con las capas del proyecto.","Acceda a los análisis de cuencas, aguas subterráneas y terreno.","Generar mapa 3D a partir del MDE"],
    fr:["GEOMOZ GIS WORKSPACE / OUTILS","Sélectionnez un outil pour travailler avec les couches de votre projet.","Accédez aux analyses des bassins versants, des eaux souterraines et du terrain.","Générer une carte 3D à partir du MNT"],
  };
  for(const [language,[section,help,hydrology,terrain]] of Object.entries(labels)){
    assert.equal(workbenchText(language,"flyoutSection"),section);
    assert.equal(workbenchText(language,"flyoutHelp"),help);
    assert.equal(workbenchText(language,"hydrologyToolsHelp"),hydrology);
    assert.equal(workbenchText(language,"terrain3D"),terrain);
    for(const key of ["flyoutAria","flyoutClose"])assert.ok(workbenchText(language,key));
  }
  assert.equal(workbenchText("de","flyoutSection"),"GEOMOZ GIS WORKSPACE / TOOLS",
    "GeoMoz-specific copy in unrevised engine locales falls back to English");
  const card=readFileSync(new URL("../assets/workbench/GeoMozFloatingToolCard.tsx",import.meta.url),"utf8");
  assert.match(card,/useLanguage\(\)/,"The flyout must respond immediately to an engine locale change");
  assert.match(card,/txt\("flyoutSection"\)/);
  assert.match(card,/txt\("flyoutHelp"\)/);
  assert.match(card,/txt\("flyoutClose"\)/);
  const chrome=readFileSync(new URL("../assets/workbench/GeoMozWorkbenchChrome.tsx",import.meta.url),"utf8");
  assert.match(chrome,/description=\{txt\("hydrologyToolsHelp"\)\}/);
  assert.match(chrome,/txt\("terrain3D"\)/);
});


test("upstream i18next language controls native GeoMoz cartographic and 3D panels",async()=>{
 const {workbenchText}=await import("../assets/workbench/geomoz-workbench-locale.ts");
 const {geoMozSpecialistText}=await import("../assets/workbench/geomoz-specialist-locale.ts");
 const expected={
  en:["Catalog","Symbology","Free layout elements","Map and legend on the page","3D terrain","Scientific DEM analysis"],
  es:["Catálogo","Simbología","Elementos libres","Mapa y leyenda en la página","Terreno 3D","Análisis científico del MDE"],
  fr:["Catalogue","Symbologie","Éléments libres","Carte et légende sur la page","Terrain 3D","Analyse scientifique du MNT"],
  pt:["Catálogo","Simbologia","Elementos livres","Mapa e legenda na página","Terreno 3D","Análise científica do DEM"]
 };
 for(const [language,values] of Object.entries(expected)){
  assert.equal(workbenchText(language,"catalog"),values[0]);
  assert.equal(workbenchText(language,"symbology"),values[1]);
  for(const [index,key] of ["Elementos livres","Mapa e legenda na página","Terreno 3D","Análise científica do DEM"].entries()){
   assert.equal(geoMozSpecialistText(language,key),values[index+2]);
  }
 }
 assert.equal(geoMozSpecialistText("de","Terreno 3D"),"3D terrain",
   "Native GeoLibre locales not yet reviewed for GeoMoz-specific copy use English fallback");
 const nativeSource=readFileSync(new URL("../assets/workbench/GeoMozTerrainWorkspace.tsx",import.meta.url),"utf8");
 const scienceSource=readFileSync(new URL("../../artifacts/geomoz-react/src/components/TerrainSciencePanel.tsx",import.meta.url),"utf8");
 const mapFrame=readFileSync(new URL("../assets/workbench/GeoMozMapPlacement.tsx",import.meta.url),"utf8");
 const items=readFileSync(new URL("../assets/workbench/GeoMozLayoutItems.tsx",import.meta.url),"utf8");
 const preparer=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
 for(const src of [nativeSource,mapFrame,items]) {
  assert.match(src,/useLanguage\(\)/,"Each GeoMoz owner panel must subscribe to active i18next locale");
  assert.match(src,/geoMozSpecialistText\(language,pt\)/);
 }
 assert.match(nativeSource,/translate=\{ui\}/,"Native 3D forwards active locale into the shared science panel");
 assert.match(scienceSource,/translate\?: \(portuguese:string\)=>string;/);
 assert.match(scienceSource,/ui\("Análise científica do DEM"\)/);
 assert.match(preparer,/workbenchText\(i18n\.language, "catalog"\)/);
 assert.match(preparer,/workbenchText\(i18n\.language, "symbology"\)/);
 assert.doesNotMatch(preparer, /<h1 className="sr-only">GeoMoz GIS Workspace — mapa e análise<\/h1>/,
   "Do not replace upstream reactive document title with a hardcoded Portuguese string");
});

test("topographic route is kept above raster layers after map style changes",()=>{
  const src=readFileSync(new URL("../assets/workbench/GeoMozTopographicProfile.tsx",import.meta.url),"utf8");
  assert.match(src,/map\.moveLayer\(id\)/);
  assert.match(src,/const order = \[LINE, DOTS, CURSOR_HALO, CURSOR_DOT\]/);
  assert.match(src,/current\.on\("styledata", redraw\)/);
  assert.match(src,/current\.off\("styledata", redraw\)/);
  assert.match(src,/geomoz-topo-export-png/);
  assert.match(src,/geomoz-topo-export-pdf/);
});
test("profile PDF export embeds an image in a valid single-page PDF container",async()=>{
  const {pdfFromJpeg}=await import("../assets/workbench/geomoz-profile-export.ts");
  const jpeg=Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,255,217]);
  const pdf=pdfFromJpeg(jpeg,1800,1000);
  assert.equal(pdf.type,"application/pdf");
  const raw=Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.4"));
  assert.match(raw,/\/Subtype \/Image/);
  assert.match(raw,/\/DCTDecode/);
  assert.match(raw,/xref\n0 6/);
  assert.match(raw,/startxref\n\d+\n%%EOF/);
  assert.throws(()=>pdfFromJpeg(Uint8Array.from([1,2,3,4]),1800,1000));
});

test("pinned GeoMoz GIS build copies every new profile export and i18n module",()=>{
  const prep=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
  for(const required of ["geomoz-profile-export.ts","geomoz-profile-locales.ts","geomoz-workbench-locale.ts"]){
    assert.ok(prep.includes('"' + required + '"'),required+" must be copied to the engine build");
  }
});

test("specialist panels translate catalogue, filtering and printing in selected locale",async()=>{
  const {geoMozSpecialistText,specialistTranslationKeys}=await import("../assets/workbench/geomoz-specialist-locale.ts");
  assert.ok(specialistTranslationKeys.length>=140,"Reviewed specialized labels must be centrally registered");
  assert.equal(geoMozSpecialistText("en","Catálogo de camadas"),"Layer catalog");
  assert.equal(geoMozSpecialistText("es","Resultados do processamento"),"Resultados del procesamiento");
  assert.equal(geoMozSpecialistText("fr","Endereço do servidor"),"Adresse du serveur");
  assert.equal(geoMozSpecialistText("pt","Camadas"),"Camadas");
  assert.equal(geoMozSpecialistText("de","Camadas"),"Layers","Unsupported product-only translations fall back to English");
  const prepare=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
  assert.match(prepare,/"geomoz-specialist-locale.ts"/,"Specialist translation source must be copied into pinned GIS engine");
  for (const panel of ["GeoMozLayerPanel.tsx","GeoMozQmsCatalog.tsx","GeoMozNextgisWebCatalog.tsx","GeoMozQgisPrintPanel.tsx"]) {
    const source=readFileSync(new URL("../assets/workbench/"+panel,import.meta.url),"utf8");
    assert.match(source,/geoMozSpecialistText\(language,pt\)/,panel+" must update on language changes");
  }
});

test("earthquake, seismic analytics and EarthScope panels honor all reviewed GeoMoz locales",async()=>{
  const {geoMozSpecialistText}=await import("../assets/workbench/geomoz-specialist-locale.ts");
  const keys=["Eventos sísmicos","Análises sísmicas","Gutenberg–Richter · ajuste MLE","Redes FDSN"];
  for(const lang of ["pt","en","es","fr"]){
    for(const key of keys)assert.ok(geoMozSpecialistText(lang,key),lang+":"+key);
  }
  assert.equal(geoMozSpecialistText("en","Eventos sísmicos"),"Earthquake events");
  assert.equal(geoMozSpecialistText("fr","Análises sísmicas"),"Analyses sismiques");
  assert.equal(geoMozSpecialistText("es","Redes FDSN"),"Redes FDSN");
  for(const file of ["GeoMozSeismicPanel.tsx","GeoMozSeismicAnalysis.tsx","GeoMozEarthscopeStations.tsx"]){
    const source=readFileSync(new URL("../assets/workbench/"+file,import.meta.url),"utf8");
    assert.match(source,/geoMozSpecialistText\(language,pt\)/,"Missing live locale in "+file);
  }
});

test("cartographic wizard, layer properties, digitizing and about are translated without altering scientific schema fields",async()=>{
  const {geoMozSpecialistText,specialistTranslationKeys}=await import("../assets/workbench/geomoz-specialist-locale.ts");
  assert.ok(specialistTranslationKeys.length>=360,"GeoMoz-owned layer tools need a centralized translation catalog");
  const sample={
    en:["Nova camada vectorial","New vector layer"],
    es:["Unidades geológicas","Unidades geológicas"],
    fr:["Falhas e lineamentos","Failles et linéaments"],
  };
  for(const [lang,[key,value]] of Object.entries(sample)){
    assert.equal(geoMozSpecialistText(lang,key),value);
  }
  assert.equal(geoMozSpecialistText("pt","Adicionar ponto"),"Adicionar ponto");
  assert.equal(geoMozSpecialistText("de","Adicionar ponto"),"Add point","Unreviewed locales use English fallback");
  for(const file of ["GeoMozLayerCreation.tsx","GeoMozLayerProperties.tsx","GeoMozDigitizingTools.tsx","GeoMozAboutDialog.tsx"]){
    const source=readFileSync(new URL("../assets/workbench/"+file,import.meta.url),"utf8");
    assert.match(source,/geoMozSpecialistText\(language,pt\)/,file+" must use selected language");
  }
  const cartography=readFileSync(new URL("../assets/workbench/GeoMozLayerCreation.tsx",import.meta.url),"utf8");
  assert.match(cartography,/ui\(spec\.name\)/,"Template labels must change with selected language");
  assert.match(cartography,/geomozFieldSchema:fields/,"Persist the original schema keys and fields, not translated metadata");
  const about=readFileSync(new URL("../assets/workbench/GeoMozAboutDialog.tsx",import.meta.url),"utf8");
  assert.match(about,/\.\.\/geomoz\/geomoz-specialist-locale/,"The About dialog is installed in the layout folder");
});
