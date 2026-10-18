import test from "node:test";
import assert from "node:assert/strict";
import {
 GEOMOZ_LAYER_TEMPLATES,makeGeoMozLayerDefinition,validGeoMozFieldName,geomozNewFeatureProperties
} from "../assets/workbench/geomoz-layer-templates.ts";

test("complete geological/thematic templates cover polygon, lines and field observations",()=>{
 assert.equal(GEOMOZ_LAYER_TEMPLATES.length,6);
 const geom=new Set(GEOMOZ_LAYER_TEMPLATES.map(t=>t.geometry));
 assert.deepEqual([...geom].sort(),["LineString","Point","Polygon"]);
 const geo=makeGeoMozLayerDefinition("unidades-geologicas","Carta geológica de Manica");
 assert.equal(geo.geojson.type,"FeatureCollection");
 assert.deepEqual(geo.geojson.features,[],"No synthetic example geometry must ever enter a new map");
 assert.equal(geo.metadata.geomozCRS,"EPSG:4326");
 assert.equal(geo.metadata.geomozDigitizingGeometry,"Polygon");
 assert.ok(geo.attributeForm.fields.some(f=>f.field==="litologia"));
 assert.equal(geo.style.fillColor,"#e0b68b");
});
test("user-defined typed fields are stored and validated without reserved editor properties",()=>{
 const d=makeGeoMozLayerDefinition("mapa-tematico-point","Prospectividade",[
  {field:"teor_au",alias:"Ouro (ppm)",type:"number"},
  {field:"amostra_n",alias:"Número de amostra",type:"integer"}
 ]);
 assert.ok(d.attributeForm.fields.some(f=>f.field==="teor_au"&&f.widget==="number"));
 assert.throws(()=>makeGeoMozLayerDefinition("mapa-tematico-point","Prospectividade",[{field:"classe",alias:"Duplicado",type:"string"}]),/campo inválido/);
 for(const key of ["__proto__","__gm_id","__geolibre_fid","field with spaces","<script>"])
   assert.equal(validGeoMozFieldName(key),false,key);
 assert.equal(validGeoMozFieldName("codigo_da_unidade"),true);
 assert.throws(()=>makeGeoMozLayerDefinition("wrong","Mapa"),/desconhecido/);
 assert.throws(()=>makeGeoMozLayerDefinition("unidades-geologicas","a"),/nome válido/);
});
test("newly digitized features acquire declared fields without overwriting edits",()=>{
 const def=makeGeoMozLayerDefinition("contactos-falhas","Falhas tectónicas",[
  {field:"comprimento_m",alias:"Comprimento",type:"number"}
 ]);
 const fields=def.attributeForm.fields;
 const data=geomozNewFeatureProperties(fields,{codigo:"F-01",rumo:0,descricao:"Conjunto observacional"});
 assert.equal(data.codigo,"F-01");
 assert.equal(data.rumo,0,"A numeric zero is a valid observation");
 assert.equal(data.mergulho,null,"Absent numeric values remain unknown, not fabricated");
 assert.equal(data.comprimento_m,null);
 assert.equal(data.tipo,"");
 assert.equal(data.descricao,"Conjunto observacional");
 assert.ok(!("__gm_id" in data),"Reserved Geoman IDs are never fabricated");
});
test("native editor, forms, styles and geometric save remain the original engine operations",async()=>{
 const fs=await import("node:fs");
 const p=fs.readFileSync("scripts/prepare-geomoz-workbench.mjs","utf8");
 assert.match(p,/enableAttributeEditing: GEOMOZ_ROLLOUT.advancedDrawing/);
 assert.match(p,/showFeatureProperties: GEOMOZ_ROLLOUT.advancedDrawing/);
 assert.match(p,/geomozNewFeatureProperties\(layer.attributeForm!.fields, properties\)/);
 assert.match(p,/geomozNewFeatureProperties/);
 assert.match(p,/writeFileSync\(editorPath,editor\)/);
 const c=fs.readFileSync("scripts/assets/workbench/GeoMozLayerPanel.tsx","utf8");
 assert.match(c,/GeoMozDigitizingPanel/);
 assert.match(c,/props.onToggleGeometryEdit\(selected.id\)/);
 assert.match(c,/openTable\(true\)/);
 assert.match(c,/EngineLayerPanel/);
});
