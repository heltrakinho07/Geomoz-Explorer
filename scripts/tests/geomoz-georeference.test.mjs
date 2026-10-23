import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { geomozProjectedToGeographic, geomozGcpPixelResiduals, geomozValidateGeoreferencing } from "../assets/workbench/geomoz-georeference.ts";

test("GeoMoz handles manual geographic and UTM 35S/36S/37S control point coordinates", () => {
  assert.deepEqual(geomozProjectedToGeographic(32.58, -25.97, "EPSG:4326"), [32.58, -25.97]);
  const [lng,lat] = geomozProjectedToGeographic(500000, 7200000, "EPSG:32736");
  assert.ok(Math.abs(lng - 33) < 1e-4);
  assert.ok(lat < -20 && lat > -30);
  const [z35] = geomozProjectedToGeographic(500000, 7200000, "EPSG:32735");
  const [z37] = geomozProjectedToGeographic(500000, 7200000, "EPSG:32737");
  assert.ok(Math.abs(z35 - 27) < 1e-4);
  assert.ok(Math.abs(z37 - 39) < 1e-4);
  assert.throws(() => geomozProjectedToGeographic(12000000, 7500000, "EPSG:32736"), /fora do intervalo/);
  assert.throws(() => geomozProjectedToGeographic(0, -100, "EPSG:4326"), /fora dos limites/);
});

test("GeoMoz calculates pixel RMSE and detects GCP residual outliers", () => {
  const affine = {a:0.01,b:0,c:32,d:0,e:-0.01,f:-25};
  const zero = geomozGcpPixelResiduals(affine, [
    {px:0,py:0,lng:32,lat:-25},
    {px:100,py:0,lng:33,lat:-25},
    {px:0,py:100,lng:32,lat:-26},
  ]);
  assert.ok(zero.rms < 1e-9);
  const withOutlier=geomozGcpPixelResiduals(affine,[{px:10,py:20,lng:32.2,lat:-25.2}]);
  assert.ok(Math.abs(withOutlier.perPoint[0]-10) < 1e-6);
  assert.ok(Math.abs(withOutlier.rms-10) < 1e-6);
});

test("native pinned GCP/GDAL pipeline remains integrated in GeoMoz source-level build", () => {
  const prepare=readFileSync("scripts/prepare-geomoz-workbench.mjs","utf8");
  assert.match(prepare,/geomoz-georeference\.ts/);
  assert.match(prepare,/geomozProjectedToGeographic/);
  assert.match(prepare,/geomozGcpPixelResiduals/);
  assert.match(prepare,/exportGeoTiff/);
  assert.match(prepare,/outputResampling/);
  const chrome=readFileSync("scripts/assets/workbench/GeoMozWorkbenchChrome.tsx","utf8");
  assert.match(chrome,/proc\.georeferencer/);
});

test("GeoMoz separates invalid GCPs from nonblocking coverage and RMSE warnings", () => {
  const wide = [
    { px: 20, py: 20, lng: 31, lat: -16 },
    { px: 920, py: 20, lng: 36, lat: -16 },
    { px: 920, py: 920, lng: 36, lat: -26 },
    { px: 20, py: 920, lng: 31, lat: -26 },
  ];
  assert.match(geomozValidateGeoreferencing(wide.slice(0, 2), 1000, 1000, "affine", 0).message, /pelo menos 3/);
  const three = geomozValidateGeoreferencing(wide.slice(0, 3), 1000, 1000, "affine", 0);
  assert.equal(three.ok, true);
  assert.match(three.warning, /quarto ponto independente/);
  assert.deepEqual(geomozValidateGeoreferencing(wide, 1000, 1000, "affine", 1), { ok: true, message: "" });
  assert.match(geomozValidateGeoreferencing(wide, 1000, 1000, "polynomial", 1).message, /pelo menos 6/);
  assert.equal(geomozValidateGeoreferencing(wide, 1000, 1000, "tps", 1).ok, true);

  // Real scanned geological maps often have generous legends/margins.
  // Small areas should warn about extrapolation but must not be rejected.
  const clustered = wide.map(g => ({ ...g, px: g.px / 12, py: g.py / 12 }));
  const c = geomozValidateGeoreferencing(clustered, 1000, 1000, "affine", 1);
  assert.equal(c.ok, true);
  assert.equal(c.message, "");
  assert.match(c.warning, /parte reduzida/);

  const high = geomozValidateGeoreferencing(wide, 1000, 1000, "affine", 40);
  assert.equal(high.ok, true);
  assert.match(high.warning, /RMSE/);
  assert.match(geomozValidateGeoreferencing(wide, 1000, 1000, "affine", Infinity).message, /Não foi possível/);
  assert.match(geomozValidateGeoreferencing(wide, 1000, 1000, "affine", null).message, /Não foi possível/);

  const invalid = wide.map((g, i) => i === 2 ? { ...g, lng: 325 } : g);
  assert.equal(geomozValidateGeoreferencing(invalid, 1000, 1000, "affine", 1).ok, false);
  assert.match(geomozValidateGeoreferencing(invalid, 1000, 1000, "affine", 1).message, /inválidas/);
  assert.match(geomozValidateGeoreferencing(wide, 0, 1000, "affine", 1).message, /dimensões/);
});

test("Add to map uses the same selected GDAL warp and native COG importer as export", () => {
  const prepare = readFileSync("scripts/prepare-geomoz-workbench.mjs", "utf8");
  assert.match(prepare, /addRasterToMap/);
  assert.match(prepare, /createAppAPI/);
  assert.match(prepare, /geomozValidateGeoreferencing/);
  assert.match(prepare, /outputResampling, true/);
  assert.match(prepare, /-dstalpha/);
  assert.match(prepare, /rasterApply/);
  assert.match(prepare, /imageCornersToMap/); // only the source-replacement guard
});

test("The real GIS Workspace georeferencer surfaces nonblocking GCP warnings next to point entry", () => {
  const prepare = readFileSync("scripts/prepare-geomoz-workbench.mjs", "utf8");
  assert.match(prepare, /geomozGcpValidation = useMemo/);
  assert.match(prepare, /geomozGcpValidation\?\.warning/);
  assert.match(prepare, /role=\\\"status\\\"/);
});
