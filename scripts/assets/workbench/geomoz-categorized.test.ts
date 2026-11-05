/**
 * Tests the real GeoLibre categorized classifier after GeoMoz's source
 * preparation. Run: node --import tsx --test tests/geomoz-categorized.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeatureCollection } from "geojson";
import {
  createCategorizedStops,
  countCategorizedValues,
} from "../apps/geolibre-desktop/src/lib/vector-style-classification";
import {
  completeCategorizedValueCount,
  normalizeVectorStyleClassCount,
  normalizeVectorStyleStops,
} from "../apps/geolibre-desktop/src/components/panels/style-panel/classification-helpers";

function geologicalLayer(values: (string | number | null)[]) {
  const geojson: FeatureCollection = {
    type: "FeatureCollection",
    features: values.map((value, index) => ({
      type: "Feature",
      id: index,
      geometry: { type: "Point", coordinates: [30, -18] },
      properties: { LITOLOGIA: value },
    })),
  };
  return { geojson, type: "geojson", metadata: { sourceKind: "geojson" } };
}

test("119 distinct geological units generate 119 colors, not 12", () => {
  const values = Array.from({ length: 119 }, (_, index) => "Unidade " + (index + 1));
  const layer = geologicalLayer(values);
  const n = countCategorizedValues(values);
  assert.equal(n, 119);
  assert.equal(normalizeVectorStyleClassCount("categorized", n), 119);
  assert.equal(completeCategorizedValueCount(layer as any, "LITOLOGIA", undefined), 119);
  const stops = createCategorizedStops(layer, "LITOLOGIA", n, "viridis", "first-values");
  assert.equal(stops.length, 119);
  assert.equal(stops[0].value, "Unidade 1");
  assert.equal(stops[118].value, "Unidade 119");
  assert.ok(stops.every((s) => /^#[0-9a-f]{6}$/i.test(s.color)));
  assert.ok(new Set(stops.map((s) => s.color)).size > 12);
});

test("no arbitrary 256-category ceiling for 513 lithological codes", () => {
  const values = Array.from({ length: 513 }, (_, index) => "Geo_" + index.toString().padStart(4, "0"));
  const layer = geologicalLayer(values);
  const count = completeCategorizedValueCount(layer as any, "LITOLOGIA", undefined);
  assert.equal(count, 513);
  assert.equal(normalizeVectorStyleClassCount("categorized", count), 513);
  const stops = createCategorizedStops(layer, "LITOLOGIA", count, "viridis", "alphabetical");
  assert.equal(stops.length, 513);
  assert.equal(new Set(stops.map((stop) => stop.value)).size, 513);
  assert.equal(stops[0].value, "Geo_0000");
  assert.equal(stops.at(-1)?.value, "Geo_0512");
});

test("ordering schemes never delete categories; missing values are excluded", () => {
  const values = ["Granito", "Gabro", "Gnaisse", "Granito", "Granito", null, "Gabro", 1, "1"];
  const layer = geologicalLayer(values);
  const count = countCategorizedValues(values);
  assert.equal(count, 5);
  for (const scheme of ["top-values", "first-values", "alphabetical"]) {
    const stops = createCategorizedStops(layer, "LITOLOGIA", count, "viridis", scheme);
    assert.equal(stops.length, 5);
    assert.equal(stops.filter((s) => s.value === "Granito").length, 1);
    assert.ok(stops.some((s) => s.value === 1));
    assert.ok(stops.some((s) => s.value === "1"));
  }
  assert.equal(createCategorizedStops(layer, "LITOLOGIA", count, "viridis", "top-values")[0].value, "Granito");
});

test("blank values are not categories, and literal geological attribute strings are preserved", () => {
  const values = ["Gabro", " Gabro ", "", "   ", null];
  const layer = geologicalLayer(values);
  assert.equal(countCategorizedValues(values), 2);
  const stops = createCategorizedStops(layer, "LITOLOGIA", 2, "viridis", "first-values");
  assert.equal(stops.length, 2);
  const normalized = normalizeVectorStyleStops("categorized", stops);
  assert.deepEqual(normalized.map((item) => item.value), ["Gabro", " Gabro "]);
});

test("DuckDB-backed vector tiles use complete values, ordinary tiles do not claim completeness", () => {
  const values = Array.from({ length: 119 }, (_, i) => "L" + i);
  const source = { geojson: undefined, type: "vector-tiles", metadata: { sourceKind: "maplibre-gl-vector" } };
  assert.equal(completeCategorizedValueCount(source as any, "LITOLOGIA", values), 119);
  const sampled = { ...source, metadata: { sourceKind: "remote-vector-service" } };
  assert.equal(completeCategorizedValueCount(sampled as any, "LITOLOGIA", values), 0);
  assert.equal(normalizeVectorStyleClassCount("graduated", 119), 12);
});
