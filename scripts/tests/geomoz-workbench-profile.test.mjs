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
