import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("NextGIS Web browser is source-mounted into pinned GeoLibre workbench", () => {
  const prep = read("../prepare-geomoz-workbench.mjs");
  assert.match(prep, /"GeoMozNextgisWebCatalog\.tsx"/);
  assert.match(prep, /write\("lib\/geomoz-nextgis-web\.ts"/);
  const chrome = read("../assets/workbench/GeoMozWorkbenchChrome.tsx");
  assert.match(chrome, /data-action="geomoz-nextgis-web"/);
  assert.match(chrome, /<GeoMozNextgisWebCatalog onClose=/);
  const styles = read("../assets/geolibre-geomoz-theme.css");
  assert.match(styles, /\.gm-ngw-panel/);
  assert.match(styles, /@media\(max-width:640px\)/);
});

test("NextGIS Web styles are inserted through the native engine and user permissions", () => {
  const component = read("../assets/workbench/GeoMozNextgisWebCatalog.tsx");
  assert.match(component, /useAppStore/);
  assert.match(component, /addTileLayer\(layer\.name,/);
  assert.match(component, /deploymentCapabilities\.has\("data:add"\)/);
  assert.match(component, /geomozNgwResourceId/);
  assert.match(component, /useEffect\(\(\) => \(\) => activeRequest\.current\?\.abort\(\), \[\]\)/);
});

test("Public catalogue never forwards credentials and validates HTTPS server URLs", () => {
  const adapter = read("../../artifacts/geomoz-react/src/lib/nextgis-web.ts");
  assert.match(adapter, /credentials: "omit"/);
  assert.match(adapter, /redirect: "error"/);
  assert.match(adapter, /normalizeNgwOrigin/);
  assert.match(adapter, /\/api\/resource\/\?parent=/);
  assert.match(adapter, /\/api\/component\/render\/tile\?z=\{z\}/);
});
