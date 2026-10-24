import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {patchGeoMozDigitizingEngine} from "../geomoz-digitizing-engine.mjs";

test("native layer editor accepts real drawing, snapping and user-provided feature attributes",()=>{
 const source=readFileSync(".geolibre-upstream/packages/plugins/src/plugins/maplibre-geo-editor.ts","utf8");
 // Apply the existing GeoMoz advanced drawing gate before this production patch.
 const old="if (isGeometryEditSession) geoEditorControl?.closeAttributeEditor();";
 assert.equal(source.split(old).length,2,"Pinned source changed");
 const edited=source.replace(old,"if (isGeometryEditSession || !GEOMOZ_ROLLOUT.advancedDrawing) geoEditorControl?.closeAttributeEditor();");
 const patched=patchGeoMozDigitizingEngine(edited);
 assert.match(patched,/geomozBindDigitizingEvents\(\)/);
 assert.match(patched,/geomanInstance\.enableDraw\(mode\)/);
 assert.match(patched,/options\.settings\.snapDistance = distance/);
 assert.match(patched,/enableMode\("helper", "snapping"\)/);
 assert.match(patched,/geomoz:digitizing-feature-created/);
 assert.match(patched,/geomozDigitizedAttributes\.get/);
 assert.match(patched,/geojson: withAttributes/);
 assert.match(patched,/writeBackToVectorSource\(layer, withAttributes\)/);
 assert.match(patched,/geomozClearDigitizingAttributes\(targetId\)/);
 assert.throws(()=>patchGeoMozDigitizingEngine(patched),/source drift/,"Integration must fail closed on source changes");
});

test("layer schema creation and geometry editing retain a single native workflow and Lucide icons",()=>{
 const wizard=readFileSync("scripts/assets/workbench/GeoMozLayerCreation.tsx","utf8");
 const tools=readFileSync("scripts/assets/workbench/GeoMozDigitizingTools.tsx","utf8");
 const navigator=readFileSync("scripts/assets/workbench/GeoMozLayerPanel.tsx","utf8");
 const prepare=readFileSync("scripts/prepare-geomoz-workbench.mjs","utf8");
 assert.match(wizard,/SRC de referência para resultados/);
 assert.match(wizard,/EPSG:32736/);
 assert.match(wizard,/setFields\(all=>\[/);
 assert.match(wizard,/geomozFieldSchema:fields/);
 assert.match(wizard,/GeoJSON em WGS 84/);
 assert.match(tools,/geomoz:digitizing-snap/);
 assert.match(tools,/geomoz:digitizing-start-draw/);
 assert.match(tools,/geomoz:digitizing-feature-created/);
 assert.match(tools,/geomoz:digitizing-attributes-save/);
 assert.match(tools,/onToggleEdit\(layer.id\)/);
 assert.match(tools,/onCancelEdit/);
 assert.match(tools,/createPortal/);
 assert.match(navigator,/GeoMozDigitizingTools/);
 assert.match(prepare,/patchGeoMozDigitizingEngine/);
 assert.match(prepare,/GeoMozDigitizingTools\.tsx/);
 assert.doesNotMatch(wizard+tools,/\p{Extended_Pictographic}/u,"Only Lucide icons, no emoji decoration");
});

test("QGIS-like four-stage workflow gates creation, editing, drawing and raster tools by task",()=>{
  const chrome=readFileSync("scripts/assets/workbench/GeoMozWorkbenchChrome.tsx","utf8");
  const layers=readFileSync("scripts/assets/workbench/GeoMozLayerPanel.tsx","utf8");
  const tools=readFileSync("scripts/assets/workbench/GeoMozDigitizingTools.tsx","utf8");
  const wizard=readFileSync("scripts/assets/workbench/GeoMozLayerCreation.tsx","utf8");
  const engine=readFileSync("scripts/geomoz-digitizing-engine.mjs","utf8");
  assert.match(chrome,/activeTask==="map"&&<section className="gm-ribbon-group"/);
  assert.match(chrome,/label:"Preparação cartográfica",ids:\["proc.georeferencer"\]/);
  assert.doesNotMatch(chrome,/map:\[\{label:"Preparação cartográfica",ids:\[[^\]]*plugin\.maplibre-gl-geo-editor/);
  assert.match(chrome,/gm-ribbon-accordion/);
  assert.match(chrome,/document\.documentElement\.dataset\.geomozTask=activeTask/);
  const theme=readFileSync("scripts/assets/geolibre-geomoz-theme.css","utf8");
  assert.match(theme,/html \.geo-editor-toolbar\{display:none!important\}/);
  assert.match(chrome,/Ferramentas raster/);
  assert.match(layers,/activeTask==="map"&&<GeoMozDigitizingTools/);
  assert.match(layers,/setActiveTask\(task\)/);
  assert.match(tools,/\{active&&<div className="gm-digitizing-controls" aria-label="Ferramentas de desenho">/);
  assert.match(tools,/\{active&&<div className="gm-digitizing-snap"/);
  assert.match(tools,/Concluir e guardar edição/);
  assert.match(tools,/onCancelEdit/);
  assert.match(wizard,/Criar camada vazia/);
  assert.doesNotMatch(wizard,/enableDraw\(/);
  assert.match(engine,/geomozLeaveDigitizingTask/);
  assert.match(engine,/disableDraw\(\)/);
});
