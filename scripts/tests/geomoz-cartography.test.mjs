import test from "node:test";
import assert from "node:assert/strict";
import {CARTOGRAPHIC_TEMPLATES,newCartographicGeoJSON,specById,validateCartographicName} from "../assets/workbench/geomoz-cartography.ts";
test("geological and thematic templates contain appropriate geometry and field definitions",()=>{
 assert.equal(CARTOGRAPHIC_TEMPLATES.length,7);
 for(const spec of CARTOGRAPHIC_TEMPLATES){
  assert.ok(spec.name);
  assert.ok(["Polygon","LineString","Point"].includes(spec.geometry));
  assert.ok(spec.fields.length>=2);
  assert.equal(new Set(spec.fields.map(x=>x.name)).size,spec.fields.length);
  assert.match(spec.color,/^#[0-9a-f]{6}$/i);
  const layer=newCartographicGeoJSON(spec);
  assert.equal(layer.type,"FeatureCollection");
  assert.deepEqual(layer.features,[]);
  assert.equal(layer.geomozSchema.geometryType,spec.geometry);
  assert.equal(layer.geomozSchema.crs,"EPSG:4326");
 }
 assert.equal(specById("geology").geometry,"Polygon");
 assert.equal(specById("faults").geometry,"LineString");
 assert.equal(specById("structure").geometry,"Point");
});
test("names validated; attributes never falsified as observations",()=>{
 assert.equal(validateCartographicName("  Carta geológica de Manica  "),"Carta geológica de Manica");
 assert.throws(()=>validateCartographicName("<script>"),/inválido/);
 assert.throws(()=>validateCartographicName(" "),/inválido/);
 const fc=newCartographicGeoJSON(specById("geology"));
 assert.equal(fc.features.length,0);
 assert.equal(fc.geomozSchema.fields.find(x=>x.name==="litologia")?.type,"text");
});
