import test from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, profileLocations, profileStatistics, profileToCSV } from
  "../assets/workbench/geomoz-topographic-profile.ts";

test("real WGS84 metric positions are monotonic and preserve endpoints", () => {
  const start = [33, -19.2], end = [33.01, -19.2];
  const points = profileLocations([start, end], 101);
  assert.equal(points.length, 101);
  assert.ok(Math.abs(points[0].longitude - start[0]) < 0.00001);
  assert.ok(Math.abs(points.at(-1).longitude - end[0]) < 0.00001);
  assert.ok(points[1].distanceM > 0 && points[100].distanceM > 1000);
  assert.ok(points.every((p, i) => i === 0 || p.distanceM > points[i - 1].distanceM));
  assert.ok(Math.abs(points[100].distanceM - distanceMeters(start, end)) < 1e-5);
});

test("multi-segment A-B-C profile uses cumulative distance, not a straight shortcut", () => {
  const a = [33, -19], b = [33.01, -19], c = [33.01, -19.01];
  const p = profileLocations([a, b, c], 101);
  const pathLength = distanceMeters(a, b) + distanceMeters(b, c);
  assert.ok(Math.abs(p.at(-1).distanceM - pathLength) < 0.001);
  assert.ok(p.at(-1).distanceM > distanceMeters(a, c));
  assert.ok(p.some(row => Math.abs(row.longitude - b[0]) < 0.0002 &&
    Math.abs(row.latitude - b[1]) < 0.0002));
});

test("NoData stays null and ascent/descent never cross missing pixels", () => {
  const s = [100, 110, null, 160, 150, 130].map((e, i) => ({
    longitude: 33, latitude: -19, distanceM: i * 100, elevationM: e,
  }));
  const stats = profileStatistics(s);
  assert.ok(stats);
  assert.equal(stats.validCount, 5);
  assert.equal(stats.sampleCount, 6);
  assert.equal(stats.minElevM, 100);
  assert.equal(stats.maxElevM, 160);
  assert.equal(stats.meanElevM, 130);
  assert.equal(stats.gainM, 10);
  assert.equal(stats.lossM, 30);
  assert.equal(stats.totalDistanceM, 500);
  const csv = profileToCSV(s);
  assert.match(csv, /Distancia_km,Elevacao_m/);
  assert.match(csv, /0\.2000,,/);
});

test("reject invalid or degenerate profiles and never produce invented DEM elevations", () => {
  assert.throws(() => profileLocations([[33, -19]], 100), /pelo menos dois/);
  assert.throws(() => profileLocations([[33, -19], [33, -19]], 100), /1 metro/);
  assert.throws(() => profileLocations([[33, -19], [34, -19]], 1000), /2 e 500/);
  const noData = profileLocations([[33, -19], [33.01, -19]], 50);
  assert.ok(noData.every(p => p.elevationM === null));
  assert.equal(profileStatistics(noData), null);
});
