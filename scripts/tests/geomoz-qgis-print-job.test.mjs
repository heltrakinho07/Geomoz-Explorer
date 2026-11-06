import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGeoMozQgisPrintJob } from "../assets/workbench/geomoz-qgis-print-job.ts";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const shape = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { litologia: "Gnaisse" }, geometry: {
    type: "Point", coordinates: [33.23, -19.34],
  } },
] };
const layers = [{ id: "1", name: "Geologia de Manica", type: "geojson",
  visible: true, geojson: shape, style: { fillColor: "#0284c7" } }];
const config = { title: "Mapa geológico de Manica", paper: "A3",
  orientation: "landscape", dpi: 300 };
test("GeoMoz exports source features rather than a screen capture", () => {
  const result = buildGeoMozQgisPrintJob(layers, ["1"], config);
  assert.equal(result.schema, 1);
  assert.equal(result.layers[0].geojson.features[0].properties.litologia, "Gnaisse");
  assert.equal(result.paper, "A3");
  assert.equal(result.dpi, 300);
  assert.equal(result.attribution, "Created with GeoMoz Explorer");
});
test("GeoMoz rejects empty, oversized and invalid printing packages", () => {
  assert.throws(() => buildGeoMozQgisPrintJob(layers, [], config), /Seleccione/);
  assert.throws(() => buildGeoMozQgisPrintJob(layers, ["1"], { ...config, title: "" }), /título/);
  const oversized = [...layers, ...Array.from({length: 12},(_,i)=>({...layers[0],id:String(i+2)}))];
  assert.throws(() => buildGeoMozQgisPrintJob(oversized, oversized.map(x=>x.id), config), /12/);
});
test("QGIS package is compiled into GeoLibre and exposed only in output ribbon", () => {
  const prepare = read("../prepare-geomoz-workbench.mjs");
  assert.match(prepare, /GeoMozQgisPrintPanel\.tsx/);
  assert.match(prepare, /geomoz-qgis-print-job\.ts/);
  const chrome = read("../assets/workbench/GeoMozWorkbenchChrome.tsx");
  assert.match(chrome, /activeTask==="output"/);
  assert.match(chrome, /data-action="geomoz-qgis-print"/);
  assert.match(chrome, /<GeoMozQgisPrintPanel/);
});
test("QGIS print package remains local and does not contain service secrets", () => {
  const component = read("../assets/workbench/GeoMozQgisPrintPanel.tsx");
  assert.match(component, /new Blob/);
  assert.match(component, /URL\.createObjectURL/);
  assert.doesNotMatch(component, /fetch\(/);
  assert.doesNotMatch(component, /Authorization/);
});


test("shared print packet configures Cartopy and PyQGIS grids without network access", () => {
  const scientific = buildGeoMozQgisPrintJob(layers, ["1"], {
    ...config, engine: "cartopy", mapCrs: "EPSG:32736",
    gridType: "geographic", intervalDegrees: 0.5,
  });
  assert.equal(scientific.engine, "cartopy");
  assert.equal(scientific.map_crs, "EPSG:32736");
  assert.equal(scientific.grid.type, "geographic");
  assert.equal(scientific.grid.interval_degrees, 0.5);

  const professional = buildGeoMozQgisPrintJob(layers, ["1"], {
    ...config, engine: "pyqgis", mapCrs: "EPSG:32737",
    gridType: "both", intervalMeters: 10000,
  });
  assert.equal(professional.grid.type, "both");
  assert.equal(professional.grid.interval_meters, 10000);
  assert.throws(() => buildGeoMozQgisPrintJob(layers, ["1"], {
    ...config, engine: "cartopy", gridType: "utm",
  }), /PyQGIS/);
  assert.throws(() => buildGeoMozQgisPrintJob(layers, ["1"], {
    ...config, mapCrs: "EPSG:32761",
  }), /CRS/);
});
test("print-panel exposes engine and grid selection explicitly", () => {
  const panel = read("../assets/workbench/GeoMozQgisPrintPanel.tsx");
  assert.match(panel, /Cartopy · Mapa científico/);
  assert.match(panel, /PyQGIS · Layout profissional/);
  assert.match(panel, /Grelha de coordenadas/);
  assert.match(panel, /CRS do mapa/);
});
