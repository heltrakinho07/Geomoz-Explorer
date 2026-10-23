import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import { geomozProjectedToGeographic, geomozGcpPixelResiduals } from "../assets/workbench/geomoz-georeference.ts";

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
