import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("GeoMoz QMS catalogue uses the existing pinned GIS layer store", () => {
  const panel = read("../assets/workbench/GeoMozQmsCatalog.tsx");
  assert.match(panel, /useAppStore/);
  assert.match(panel, /addTileLayer\(source\.name,/);
  assert.match(panel, /scheme: source\.tms \? "tms" : "xyz"/);
  assert.match(panel, /data:add/);
  assert.match(panel, /geomozQmsId/);
  assert.match(panel, /createQmsPreviewTile\(source, regionBounds\)/);
  assert.match(panel, /Verificar mosaico de /);
  assert.match(panel, /onError=\{\(\) => setPreviewStatus\("failed"\)\}/);
  assert.match(panel, /A cobertura declarada do fornecedor não inclui Moçambique/);
  assert.match(panel, /searchQmsBasemaps\(term, controller\.signal, regionBounds\)/);
  assert.match(panel, /opacity: 0\.72/);
  assert.match(panel, /Catálogo GeoMoz de mapas-base/);
  assert.match(panel, /onClose/);
});

test("QMS enters upstream source at build time, not via DOM or minified patch", () => {
  const prepare = read("../prepare-geomoz-workbench.mjs");
  assert.match(prepare, /"GeoMozQmsCatalog\.tsx"/);
  assert.match(prepare, /write\("lib\/geomoz-qms-catalog\.ts"/);
  const chrome = read("../assets/workbench/GeoMozWorkbenchChrome.tsx");
  assert.match(chrome, /data-action="geomoz-qms"/);
  assert.match(chrome, /<GeoMozQmsCatalog onClose=/);
  const css = read("../assets/geolibre-geomoz-theme.css");
  assert.match(css, /\.gm-qms-panel/);
  assert.match(css, /@media\(max-width:640px\)/);
});

test("QMS service URLs are constrained to public HTTPS with safe attribution", () => {
  const adapter = read("../../artifacts/geomoz-react/src/lib/qms-catalog.ts");
  assert.match(adapter, /https:/);
  assert.match(adapter, /cumulative_status/);
  assert.match(adapter, /escapeHtml/);
  assert.match(adapter, /EPSG:3857|3857/);
});
