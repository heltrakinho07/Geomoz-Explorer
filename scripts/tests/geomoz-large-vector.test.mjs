import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { prepareGeoMozLargeVector } from "../geomoz-large-vector.mjs";

test("pinned GeoLibre is patched at the Add Vector Layer source", () => {
  const pinned = join(process.cwd(), ".geolibre-upstream");
  if (!existsSync(join(pinned, "LICENSE"))) {
    throw new Error("The reviewed GeoLibre checkout must exist before this test.");
  }
  const temp = mkdtempSync(join(tmpdir(), "geomoz-large-vector-"));
  const files = [
    "packages/plugins/src/types.ts",
    "packages/plugins/src/plugins/maplibre-vector.ts",
    "apps/geolibre-desktop/src/lib/app-api.ts",
  ];
  try {
    writeFileSync(join(temp, "LICENSE"), "MIT");
    for (const path of files) {
      mkdirSync(dirname(join(temp, path)), { recursive: true });
      cpSync(join(pinned, path), join(temp, path));
    }
    const changes = prepareGeoMozLargeVector(temp);
    assert.equal(changes.length, 6);
    const plugin = readFileSync(join(temp, files[1]), "utf8");
    const host = readFileSync(join(temp, files[2]), "utf8");
    const api = readFileSync(join(temp, files[0]), "utf8");
    const worker = readFileSync(
      join(temp, "apps/geolibre-desktop/src/lib/geomoz-large-vector.worker.ts"), "utf8"
    );
    const panel = readFileSync(
      join(temp, "packages/plugins/src/plugins/geomoz-large-vector-ui.ts"), "utf8"
    );
    assert.match(plugin, /wireGeoMozLargeVector\(control, app\)/);
    assert.match(host, /prepareLargeGeoJSONFile: prepareGeoMozLargeGeoJSONFile/);
    assert.match(api, /prepareLargeGeoJSONFile\?/);
    assert.match(worker, /convertDuckDbVectorToGeoParquet/);
    assert.match(worker, /readAsArrayBuffer\(file\)/);
    assert.match(panel, /DUCKDB_VECTOR_ROUTE_BYTES/);
    assert.match(panel, /controller.abort\(\)/);
    assert.match(panel, /renderMode: "tiles"/);
    assert.match(panel, /"alert"/);
    assert.ok(panel.includes("current.abort()"));
    assert.match(panel, /geomoz-large-vector-meter/);
    assert.ok(panel.includes('meter.removeAttribute("value")'));
    assert.match(panel, /"Tentar novamente"/);
    assert.match(panel, /"Fechar"/);
    assert.throws(() => prepareGeoMozLargeVector(temp), /already exists/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("worker and host bridge expose explicit cancellation and failures", () => {
  const root = join(process.cwd(), "scripts/assets/workbench");
  const runner = readFileSync(join(root, "geomoz-large-vector.ts"), "utf8");
  const worker = readFileSync(join(root, "geomoz-large-vector.worker.ts"), "utf8");
  assert.match(runner, /worker.terminate\(\)/);
  assert.match(runner, /signal.addEventListener\("abort"/);
  assert.match(runner, /worker.onmessageerror/);
  assert.match(runner, /new File\(\[message.buffer\]/);
  assert.match(worker, /kind: "error"/);
  assert.match(worker, /kind: "progress"/);
});

test("150 MB vector import browser regression is wired into Workbench CI", () => {
  const browser = readFileSync(
    join(process.cwd(), "scripts/integration/geomoz-workbench-browser.cjs"), "utf8",
  );
  const smoke = readFileSync(
    join(process.cwd(), "scripts/integration/geomoz-large-vector-browser.cjs"), "utf8",
  );
  assert.ok(browser.includes("geomoz-large-vector-browser.cjs"));
  assert.ok(smoke.includes("150 * 1024 * 1024"));
  assert.match(smoke, /Cancelar importação/);
  assert.match(smoke, /Tentar novamente/);
  assert.match(smoke, /geomoz-large-vector-meter/);
});
