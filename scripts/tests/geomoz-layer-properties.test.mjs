import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = join(process.cwd(), "scripts/assets/workbench");
const read = (name) => readFileSync(join(root, name), "utf8");

test("layer properties are available from the GeoMoz catalogue and copied to the pinned GIS build", () => {
  const panel = read("GeoMozLayerPanel.tsx");
  const preparer = readFileSync("scripts/prepare-geomoz-workbench.mjs", "utf8");
  const props = read("GeoMozLayerPropertiesDialog.tsx");
  assert.match(panel, /data-testid="geomoz-open-layer-properties"/);
  assert.match(panel, /onDoubleClick/);
  assert.match(panel, /<GeoMozLayerPropertiesDialog/);
  assert.match(preparer, /"GeoMozLayerPropertiesDialog\.tsx"/);
  assert.match(preparer, /"GeoMozVectorCategories\.tsx"/);
  assert.match(props, /role="dialog"/);
  assert.match(props, /aria-modal="true"/);
  assert.match(props, /createPortal/);
});

test("vector categorization uses complete attribute values, not arbitrary raster class counts", () => {
  const vector = read("GeoMozVectorCategories.tsx");
  assert.match(vector, /getAttributePropertyNames/);
  assert.match(vector, /getVectorLayerPropertyValues/);
  assert.match(vector, /completeCategorizedValueCount/);
  assert.match(vector, /createDefaultStops/);
  assert.match(vector, /vectorStyleMode: "categorized"/);
  assert.match(vector, /vectorStyleClassCount: stops\.length/);
  assert.doesNotMatch(vector, /Math\.min\([^\n]*12/);
});

test("raster properties reuse the real raster band editor and never the vector categories", () => {
  const panel = read("GeoMozLayerPropertiesDialog.tsx");
  assert.match(panel, /isGeoMozRasterLayer/);
  assert.match(panel, /isGeoMozVectorLayer/);
  assert.match(panel, /RasterSymbologySection/);
  assert.match(panel, /<GeoMozVectorCategories/);
  assert.match(panel, /<RasterSymbologySection/);
  assert.match(panel, /data-layer-kind=/);
  assert.match(panel, /Bandas e histograma/);
});

test("browser regressions validate vector categories and raster layer properties", () => {
  const vector = readFileSync("scripts/integration/geomoz-workbench-browser.cjs", "utf8");
  const raster = readFileSync("scripts/integration/geomoz-raster-browser.cjs", "utf8");
  assert.match(vector, /Classificar todos os valores distintos/);
  assert.match(vector, /Simbologia categorizada aplicada: 2 categorias/);
  assert.match(raster, /geomoz-layer-properties-dialog/);
  assert.match(raster, /Bandas e histograma/);
});
