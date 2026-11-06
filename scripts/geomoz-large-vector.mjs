#!/usr/bin/env node
/**
 * Integrate GeoMoz's large-vector worker into the reviewed GeoLibre checkout.
 * All edits are fail-closed and applied to TypeScript source before Vite builds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function replaceExactlyOnce(text, before, after, label) {
  if (text.split(before).length !== 2) {
    throw new Error("GeoMoz large-vector upstream anchor changed: " + label);
  }
  return text.replace(before, after);
}

export function prepareGeoMozLargeVector(rootDir) {
  const root = resolve(rootDir);
  const app = resolve(root, "apps/geolibre-desktop/src");
  const plugins = resolve(root, "packages/plugins/src");
  if (existsSync(resolve(app, "lib/geomoz-large-vector.ts"))) {
    throw new Error("GeoMoz large-vector source already exists; use a clean checkout.");
  }
  if (!existsSync(resolve(root, "LICENSE"))) {
    throw new Error("Expected the pinned GeoLibre source checkout.");
  }

  const changes = [];
  const edit = (base, relative, edits) => {
    const target = resolve(base, relative);
    let content = readFileSync(target, "utf8");
    for (const [from, to, label] of edits) {
      content = replaceExactlyOnce(content, from, to, label);
    }
    changes.push([target, content]);
  };
  // ST_Hilbert raises on EMPTY geometries, which are valid in many geological
  // datasets. Keep every source record and sort only georeferenced features.
  // Filtering out EMPTY would silently discard attributes and row counts.
  edit(app, "lib/duckdb-vector-loader.ts", [[
    [
      "        WITH src AS (\${source}),",
      "        b AS (SELECT ST_Extent(ST_Extent_Agg(\${geometrySql})) AS box FROM src)",
      "        SELECT * FROM src",
      "        ORDER BY ST_Hilbert(\${geometrySql}, (SELECT box FROM b))",
    ].join("\n"),
    [
      "        WITH src AS (\${source}),",
      "        b AS (SELECT ST_Extent(ST_Extent_Agg(\${geometrySql})) AS box FROM src",
      "                WHERE \${geometrySql} IS NOT NULL AND NOT ST_IsEmpty(\${geometrySql}))",
      "        SELECT * FROM src",
      "        ORDER BY CASE",
      "          WHEN \${geometrySql} IS NULL OR ST_IsEmpty(\${geometrySql}) THEN NULL",
      "          ELSE ST_Hilbert(\${geometrySql}, (SELECT box FROM b))",
      "        END NULLS LAST",
    ].join("\n"),
    "Hilbert ordering tolerates NULL and EMPTY geometry",
  ]]);
  edit(plugins, "types.ts", [[
    "  pickVectorFilesWithSidecars?: () => Promise<GeoLibrePickedVectorFile[]>;",
    [
      "  /** GeoMoz: off-thread, cancellable preparation of large local GeoJSON. */",
      "  prepareLargeGeoJSONFile?: (",
      "    file: File,",
      "    options: {",
      "      signal: AbortSignal;",
      "      onProgress: (label: string, percent?: number) => void;",
      "    },",
      "  ) => Promise<File>;",
      "  pickVectorFilesWithSidecars?: () => Promise<GeoLibrePickedVectorFile[]>;",
    ].join("\n"),
    "public plugin API",
  ]]);
  edit(app, "lib/app-api.ts", [[
    'import { createRemoteDownload, type RemoteDownloadProgress } from "./remote-download";',
    [
      'import { createRemoteDownload, type RemoteDownloadProgress } from "./remote-download";',
      'import { prepareGeoMozLargeGeoJSONFile } from "./geomoz-large-vector";',
    ].join("\n"),
    "host worker import",
  ], [
    "    readLocalVectorFile: readVectorFileWithSidecars,",
    [
      "    readLocalVectorFile: readVectorFileWithSidecars,",
      "    prepareLargeGeoJSONFile: prepareGeoMozLargeGeoJSONFile,",
    ].join("\n"),
    "host worker exposure",
  ]]);
  edit(plugins, "plugins/maplibre-vector.ts", [[
    'import {\n  DUCKDB_VECTOR_FEATURE_WARN_COUNT,',
    [
      'import { wireGeoMozLargeVector } from "./geomoz-large-vector-ui";',
      'import {',
      '  DUCKDB_VECTOR_FEATURE_WARN_COUNT,',
    ].join("\n"),
    "vector panel worker import",
  ], [
    "  defaultVectorFitToPreference(control);",
    [
      "  defaultVectorFitToPreference(control);",
      "  // Outermost addData wrapper: handle large File sources before the",
      "  // control's synchronous GeoJSON parsing or source adoption.",
      "  wireGeoMozLargeVector(control, app);",
    ].join("\n"),
    "vector panel worker routing",
  ]]);

  for (const [filename, dest] of [
    ["geomoz-large-vector.ts", resolve(app, "lib/geomoz-large-vector.ts")],
    ["geomoz-large-vector.worker.ts", resolve(app, "lib/geomoz-large-vector.worker.ts")],
    ["geomoz-large-vector-ui.ts", resolve(plugins, "plugins/geomoz-large-vector-ui.ts")],
  ]) {
    if (existsSync(dest)) {
      throw new Error("GeoMoz large-vector source already exists: " + filename);
    }
    changes.push([dest, readFileSync(
      new URL("./assets/workbench/" + filename, import.meta.url), "utf8",
    )]);
  }

  // Validate all anchors and all assets before any source modification.
  for (const [file, content] of changes) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return changes.map(([file]) => file);
}
