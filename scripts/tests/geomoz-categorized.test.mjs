import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { prepareGeoMozCategorizedStyles } from "../geomoz-categorized.mjs";

test("GeoMoz patch integrates automatic full-domain categories in reviewed upstream source", () => {
  const upstream = join(process.cwd(), ".geolibre-upstream");
  if (!existsSync(join(upstream, "LICENSE"))) {
    throw new Error("The reviewed GeoLibre checkout is required.");
  }
  const directory = mkdtempSync(join(tmpdir(), "geomoz-categorized-"));
  const paths = [
    "apps/geolibre-desktop/src/lib/vector-style-classification.ts",
    "apps/geolibre-desktop/src/components/panels/style-panel/classification-helpers.ts",
    "apps/geolibre-desktop/src/components/panels/style-panel/VectorSymbologySection.tsx",
    "apps/geolibre-desktop/src/components/panels/style-panel/useStylePanelDrafts.ts",
    "packages/plugins/src/plugins/vector-layer-sync.ts",
    "tests/vector-style-classification.test.ts",
  ];
  try {
    writeFileSync(join(directory, "LICENSE"), "MIT");
    for (const path of paths) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      cpSync(join(upstream, path), join(directory, path));
    }
    const modified = prepareGeoMozCategorizedStyles(directory);
    assert.equal(modified.length, 7);
    const lib = readFileSync(join(directory, paths[0]), "utf8");
    const helper = readFileSync(join(directory, paths[1]), "utf8");
    const panel = readFileSync(join(directory, paths[2]), "utf8");
    const drafts = readFileSync(join(directory, paths[3]), "utf8");
    const sync = readFileSync(join(directory, paths[4]), "utf8");
    assert.match(lib, /MAX_MANUAL_CATEGORIZED_VALUES = Number\.MAX_SAFE_INTEGER/);
    assert.match(helper, /return count;\s*\}/);
    assert.match(panel, /mode === "categorized"\s*\? Math\.max\(1, countCompleteCategorizedValues\(property\)\)/);
    assert.match(panel, /disabled=\{draftVectorStyleMode === "categorized"\}/);
    assert.match(panel, /t\("style\.symbology\.allClasses", \{ total: categorizedValueCount \}\)/);
    assert.match(panel, /max-h-\[28rem\]/);
    assert.match(drafts, /setDraftVectorStyleAllCategories\(vectorStyleMode === "categorized"\)/);
    assert.match(sync, /MAX_COLOR_EXPRESSION_CHARS = 2_000_000/);
    assert.ok(existsSync(join(directory, "tests/geomoz-categorized.test.ts")));
    const migratedTest = readFileSync(join(directory, "tests/vector-style-classification.test.ts"), "utf8");
    assert.match(migratedTest, /length: 513/);
    assert.match(migratedTest, /stops\.length, 513/);
    assert.doesNotMatch(migratedTest, /MAX_MANUAL_CATEGORIZED_VALUES/);
    assert.throws(() => prepareGeoMozCategorizedStyles(directory), /anchor changed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
