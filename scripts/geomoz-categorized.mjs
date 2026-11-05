#!/usr/bin/env node
/**
 * Remove arbitrary categorized-vector stop limits in the reviewed GeoLibre GIS
 * engine. Applied to source before Vite compilation; fail closed on upstream
 * drift. Graduated classes keep their original 2–12 statistical intervals.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function one(source, from, to, label) {
  if (source.split(from).length !== 2) {
    throw new Error("GeoMoz categorized vector source anchor changed: " + label);
  }
  return source.replace(from, to);
}

export function prepareGeoMozCategorizedStyles(rootDir) {
  const root = resolve(rootDir);
  const app = resolve(root, "apps/geolibre-desktop/src");
  if (!existsSync(resolve(root, "LICENSE"))) {
    throw new Error("Expected the reviewed GeoLibre checkout.");
  }
  const edits = [];
  function edit(path, transforms) {
    const target = resolve(app, path);
    let contents = readFileSync(target, "utf8");
    for (const [from, to, label] of transforms) {
      contents = one(contents, from, to, label);
    }
    edits.push([target, contents]);
  }

  edit("lib/vector-style-classification.ts", [
    [
      "/** Maximum categorized rows the manual Style panel may render at once. */\nexport const MAX_MANUAL_CATEGORIZED_VALUES = 256;",
      "/** No arbitrary limit on distinct attribute values for a categorized map. */\nexport const MAX_MANUAL_CATEGORIZED_VALUES = Number.MAX_SAFE_INTEGER;",
      "remove 256 category ceiling",
    ],
    [
      "  const count = clampClassCount(classCount, 1, MAX_MANUAL_CATEGORIZED_VALUES);",
      "  const count = clampClassCount(classCount, 1, Number.MAX_SAFE_INTEGER);",
      "generate a stop for every distinct value",
    ],
  ]);

  edit("components/panels/style-panel/classification-helpers.ts", [
    [
      "  return count <= MAX_MANUAL_CATEGORIZED_VALUES ? count : 0;",
      "  return count;",
      "complete distinct value count over 256",
    ],
  ]);

  edit("components/panels/style-panel/useStylePanelDrafts.ts", [
    [
      '    // Values that load asynchronously are not available yet, so a re-opened\n' +
      '    // panel recognizes "All" only for layers whose features are already in the\n' +
      '    // store — elsewhere the resolved number stays selected until the user picks\n' +
      '    // "All" again.\n' +
      '    setDraftVectorStyleAllCategories(\n' +
      '      vectorStyleMode === "categorized" &&\n' +
      '        vectorStyleClassCount ===\n' +
      '          completeCategorizedValueCount(layer, vectorStyleProperty, undefined),\n' +
      '    );',
      '    // GeoMoz categorical mode always follows the complete attribute domain.\n' +
      '    // On DuckDB-backed tiles, values arrive asynchronously from the table.\n' +
      '    setDraftVectorStyleAllCategories(vectorStyleMode === "categorized");',
      "reopen categorized layers with automatic distinct values",
    ],
  ]);

  edit("components/panels/style-panel/VectorSymbologySection.tsx", [
    [
      '    draftVectorStyleAllCategories,\n    setDraftVectorStyleAllCategories,',
      '    setDraftVectorStyleAllCategories,',
      "remove unused partial-categorization state",
    ],
    [
      '    setDraftVectorStyleMode(mode);\n    setDraftVectorStyleAllCategories(false);',
      '    setDraftVectorStyleMode(mode);\n    setDraftVectorStyleAllCategories(mode === "categorized");',
      "categorized mode defaults to all distinct values",
    ],
    [
      '      const classCount = normalizeVectorStyleClassCount(mode, draftVectorStyleClassCount);\n' +
      '      const classificationScheme = normalizeClassificationScheme(\n' +
      '        mode,\n' +
      '        draftVectorStyleClassificationScheme,\n' +
      '      );\n' +
      '      const property = chooseDefaultStyleProperty(\n' +
      '        layer,\n' +
      '        mode,\n' +
      '        vectorStylePropertyOptions,\n' +
      '        draftVectorStyleProperty,\n' +
      '      );',
      '      const classificationScheme = normalizeClassificationScheme(\n' +
      '        mode,\n' +
      '        draftVectorStyleClassificationScheme,\n' +
      '      );\n' +
      '      const property = chooseDefaultStyleProperty(\n' +
      '        layer,\n' +
      '        mode,\n' +
      '        vectorStylePropertyOptions,\n' +
      '        draftVectorStyleProperty,\n' +
      '      );\n' +
      '      const classCount = mode === "categorized"\n' +
      '        ? Math.max(1, countCompleteCategorizedValues(property))\n' +
      '        : normalizeVectorStyleClassCount(mode, draftVectorStyleClassCount);',
      "derive count when entering categorized renderer",
    ],
    [
      '    const classCount =\n' +
      '      nextCategoryCount > 0\n' +
      '        ? draftVectorStyleAllCategories\n' +
      '          ? nextCategoryCount\n' +
      '          : Math.min(draftVectorStyleClassCount, nextCategoryCount)\n' +
      '        : Math.min(draftVectorStyleClassCount, 12);',
      '    const classCount = draftVectorStyleMode === "categorized"\n' +
      '      ? Math.max(1, nextCategoryCount)\n' +
      '      : Math.min(draftVectorStyleClassCount, 12);',
      "switch attribute without retaining old categorical cap",
    ],
    [
      '    setDraftVectorStyleProperty(property);\n    setDraftVectorStyleClassCount(classCount);',
      '    setDraftVectorStyleProperty(property);\n    if (draftVectorStyleMode === "categorized") setDraftVectorStyleAllCategories(true);\n    setDraftVectorStyleClassCount(classCount);',
      "attribute change remains all-categories",
    ],
    [
      '  const vectorClassCountOptions = VECTOR_STYLE_CLASS_COUNTS.filter((classCount) =>\n' +
      '    draftVectorStyleMode === "categorized" ? true : classCount >= 2,\n' +
      '  );\n' +
      '  // The "All (N)" option only renders while a complete count is known, so the\n' +
      '  // selection falls back to the plain class count whenever it is not — keeping\n' +
      '  // the controlled <select> value on an option that actually exists.\n' +
      '  const allCategoriesSelected = draftVectorStyleAllCategories && categorizedValueCount > 0;',
      '  const vectorClassCountOptions = VECTOR_STYLE_CLASS_COUNTS.filter((count) => count >= 2);',
      "replace 1-12 categorized selector",
    ],
    [
      '    const classCount = normalizeVectorStyleClassCount(\n' +
      '      mode,\n' +
      '      DEFAULT_LAYER_STYLE.vectorStyleClassCount,\n' +
      '    );',
      '    const classCount = mode === "categorized"\n' +
      '      ? Math.max(1, countCompleteCategorizedValues(property))\n' +
      '      : normalizeVectorStyleClassCount(mode, DEFAULT_LAYER_STYLE.vectorStyleClassCount);',
      "automatic categorized style suggestions",
    ],
    [
      '    setDraftVectorStyleClassCount(classCount);\n    setDraftVectorStyleAllCategories(false);',
      '    setDraftVectorStyleClassCount(classCount);\n    setDraftVectorStyleAllCategories(mode === "categorized");',
      "keep suggested class count complete",
    ],
    [
      '              value={allCategoriesSelected ? "all" : String(draftVectorStyleClassCount)}',
      '              value={draftVectorStyleMode === "categorized" ? "all" : String(draftVectorStyleClassCount)}\n' +
      '              disabled={draftVectorStyleMode === "categorized"}',
      "class count follows data automatically",
    ],
    [
      '              {vectorClassCountOptions\n' +
      '                .filter(\n' +
      '                  (classCount) => !(allCategoriesSelected && classCount === categorizedValueCount),\n' +
      '                )\n' +
      '                .map((classCount) => (\n' +
      '                  <option key={classCount} value={classCount}>\n' +
      '                    {classCount}\n' +
      '                  </option>\n' +
      '                ))}\n' +
      '              {draftVectorStyleClassCount > 12 && !allCategoriesSelected && (\n' +
      '                <option value={draftVectorStyleClassCount}>{draftVectorStyleClassCount}</option>\n' +
      '              )}\n' +
      '              {draftVectorStyleMode === "categorized" && categorizedValueCount > 0 && (\n' +
      '                <option value="all">\n' +
      '                  {t("style.symbology.allClasses", {\n' +
      '                    total: categorizedValueCount,\n' +
      '                  })}\n' +
      '                </option>\n' +
      '              )}',
      '              {draftVectorStyleMode === "categorized" ? (\n' +
      '                <option value="all">\n' +
      '                  {categorizedValueCount > 0\n' +
      '                    ? t("style.symbology.allClasses", { total: categorizedValueCount })\n' +
      '                    : t("attributeTable.loadingAttributes")}\n' +
      '                </option>\n' +
      '              ) : (\n' +
      '                vectorClassCountOptions.map((classCount) => (\n' +
      '                  <option key={classCount} value={classCount}>{classCount}</option>\n' +
      '                ))\n' +
      '              )}',
      "show automatic real category count, keep graduated 2-12",
    ],
    [
      '          <div className="space-y-2">\n' +
      '            {draftVectorStyleStops.map((stop, index) => (',
      '          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">\n' +
      '            {draftVectorStyleStops.map((stop, index) => (',
      "scroll large lithological legends",
    ],
  ]);

  // Preserve persistence of several hundred or thousand legitimate category
  // color expressions, while still bounding untrusted project input size.
  // GeoLibre also validates expression syntax separately.
  const plugins = resolve(root, "packages/plugins/src/plugins/vector-layer-sync.ts");
  const sync = readFileSync(plugins, "utf8");
  edits.push([
    plugins,
    one(sync,
      "const MAX_COLOR_EXPRESSION_CHARS = 20_000;",
      "const MAX_COLOR_EXPRESSION_CHARS = 2_000_000;",
      "persist large categorized palettes",
    ),
  ]);

  const testsDest = resolve(root, "tests/geomoz-categorized.test.ts");
  if (existsSync(testsDest)) throw new Error("GeoMoz categorized tests already installed.");
  edits.push([testsDest, readFileSync(
    new URL("./assets/workbench/geomoz-categorized.test.ts", import.meta.url), "utf8",
  )]);

  for (const [path, contents] of edits) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return edits.map(([file]) => file);
}
