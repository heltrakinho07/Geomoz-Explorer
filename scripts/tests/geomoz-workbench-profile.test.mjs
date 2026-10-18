import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GEOMOZ_ROLLOUT,curateGeoMozCommands,isGeoMozCommandVisible,isGeoMozDataSourceVisible,isGeoMozToolVisible,isGeoMozMenuItemVisible} from "../assets/workbench/geomoz-workbench-profile.ts";

test("core actions survive while specialist entries disappear from every command consumer",()=>{
 const ids=["project.open-file","project.save","add.vector","add.raster","add.wms","proc.vector.buffer","proc.vector.intersection","proc.raster.slope","proc.raster.contour","plugin.maplibre-gl-geo-editor","view.theme"];
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

test("GIS Workspace exposes native digitization, field editing, layer management and map output",()=>{
 assert.equal(isGeoMozCommandVisible("plugin.maplibre-gl-geo-editor"),true);
 assert.equal(isGeoMozCommandVisible("project.print-layout"),true);
 const chrome=readFileSync(new URL("../assets/workbench/GeoMozWorkbenchChrome.tsx",import.meta.url),"utf8");
 const prepare=readFileSync(new URL("../prepare-geomoz-workbench.mjs",import.meta.url),"utf8");
 assert.match(chrome,/Digitalizar \/ editar/);
 assert.match(chrome,/Layout de impressão/);
 assert.match(prepare,/drawModes: GEO_EDITOR_OPTIONS.drawModes.filter/);
 assert.match(prepare,/newFeaturePreparer/);
 assert.match(prepare,/enableAttributeEditing: GEOMOZ_ROLLOUT.advancedDrawing/);
 assert.match(prepare,/showFeatureProperties: GEOMOZ_ROLLOUT.advancedDrawing/);
 assert.equal(GEOMOZ_ROLLOUT.advancedDrawing,true,"Attribute editing enabled");
 assert.equal(GEOMOZ_ROLLOUT.fullLayerManager,true,"Native advanced layer management visible");
});
