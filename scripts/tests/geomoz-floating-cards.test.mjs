import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("GeoMoz tool cards render outside the scrollable ribbon using a workspace-chrome portal", () => {
  const component = read("../assets/workbench/GeoMozFloatingToolCard.tsx");
  assert.match(component, /createPortal\(/);
  assert.match(component, /document\.body/);
  assert.match(component, /getBoundingClientRect\(\)/);
  assert.match(component, /position: "absolute"/);
  assert.match(component, /Escape/);
  assert.match(component, /pointerdown/);
  assert.match(component, /aria-expanded=\{open\}/);
  const chrome = read("../assets/workbench/GeoMozWorkbenchChrome.tsx");
  assert.match(chrome, /<GeoMozFloatingToolCard/);
  for (const group of ["Hidrologia", "Serviços de mapas", "Raster", "Vector", "Cartografia"]) {
    assert.ok(chrome.includes(group), group);
  }
  assert.doesNotMatch(chrome, /<details className="gm-ribbon-accordion"/);
});

test("Floating tool cards have viewport z-index and are included in the pinned GIS build", () => {
  const css = read("../assets/geolibre-geomoz-theme.css");
  assert.match(css, /\.gm-tool-flyout\{/);
  assert.match(css, /z-index:10050/);
  assert.match(css, /\.gm-tool-flyout-grid/);
  assert.doesNotMatch(css, /\.gm-ribbon-accordion>div\{position:absolute/);
  const prepare = read("../prepare-geomoz-workbench.mjs");
  assert.match(prepare, /"GeoMozFloatingToolCard\.tsx"/);
});
