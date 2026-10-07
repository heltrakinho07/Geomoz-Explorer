/**
 * GeoMoz DuckDB-WASM Spatial runtime.
 *
 * Architecture adapted from GeoLibre's DuckDB-WASM approach (MIT):
 * https://github.com/opengeos/GeoLibre
 *
 * GeoMoz keeps a dedicated lazy DuckDB instance for the GIS Workspace. Loaded
 * vector layers are registered as temporary ST_Read() tables for each query.
 */
import type { Feature, FeatureCollection } from "geojson";
import type * as DuckDbTypes from "@duckdb/duckdb-wasm";
import duckdbWasmEh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import duckdbWasmMvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";

export interface DuckDbWorkspaceLayer {
  id: string;
  name: string;
  geojson: FeatureCollection;
}

export interface DuckDbSpatialResult {
  columns: string[];
  rows: Record<string, unknown>[];
  totalCount: number;
  executionTimeMs: number;
  features?: Feature[];
  tableNames: Array<{ layerId: string; layerName: string; tableName: string }>;
}

const GEOMETRY_JSON_COLUMN = "__geomoz_geometry_geojson";
const QUERY_ALIAS = "__geomoz_query";

const MANUAL_BUNDLES: DuckDbTypes.DuckDBBundles = {
  mvp: {
    mainModule: duckdbWasmMvp,
    mainWorker: mvpWorker,
  },
  eh: {
    mainModule: duckdbWasmEh,
    mainWorker: ehWorker,
  },
};

let databasePromise: Promise<DuckDbTypes.AsyncDuckDB> | null = null;
const spatialReady = new WeakMap<DuckDbTypes.AsyncDuckDB, Promise<void>>();

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sanitizeDuckDbTableName(value: string, fallback = "layer"): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = normalized || fallback;
  return /^[0-9]/.test(base) ? `layer_${base}` : base;
}

function assignTableNames(
  layers: DuckDbWorkspaceLayer[]
): Array<{ layer: DuckDbWorkspaceLayer; tableName: string }> {
  const used = new Set<string>();
  return layers.map((layer, index) => {
    const base = sanitizeDuckDbTableName(layer.name, `layer_${index + 1}`);
    let tableName = base;
    let suffix = 2;
    while (used.has(tableName)) {
      tableName = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(tableName);
    return { layer, tableName };
  });
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeValue(item),
      ])
    );
  }
  return value;
}

function rowsFromArrow(result: any): Record<string, unknown>[] {
  const columns: string[] =
    result?.schema?.fields?.map((field: { name: string }) => field.name) ?? [];
  const rawRows = typeof result?.toArray === "function" ? result.toArray() : [];

  return rawRows.map((raw: any) => {
    const source =
      raw && typeof raw.toJSON === "function"
        ? raw.toJSON()
        : raw && typeof raw === "object"
          ? raw
          : {};
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column] = normalizeValue(source[column]);
    }
    return row;
  });
}

async function createDatabase(): Promise<DuckDbTypes.AsyncDuckDB> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  if (!bundle.mainWorker) throw new Error("DuckDB-WASM não encontrou um worker compatível.");

  const worker = new Worker(bundle.mainWorker, { type: "module" });
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  await db.open({});
  return db;
}

export function getDuckDbSpatialDatabase(): Promise<DuckDbTypes.AsyncDuckDB> {
  if (!databasePromise) {
    const building = createDatabase().catch((error) => {
      if (databasePromise === building) databasePromise = null;
      throw error;
    });
    databasePromise = building;
  }
  return databasePromise;
}

async function ensureSpatial(
  db: DuckDbTypes.AsyncDuckDB,
  connection: DuckDbTypes.AsyncDuckDBConnection
): Promise<void> {
  let pending = spatialReady.get(db);
  if (!pending) {
    pending = (async () => {
      await connection.query("INSTALL spatial");
      await connection.query("LOAD spatial");
    })();
    spatialReady.set(db, pending);
  }
  try {
    await pending;
  } catch (error) {
    if (spatialReady.get(db) === pending) spatialReady.delete(db);
    throw error;
  }
}

function cleanStatement(sql: string): string {
  let value = sql.trim();
  while (value.endsWith(";")) value = value.slice(0, -1).trimEnd();
  return value;
}

function hasMultipleStatements(sql: string): boolean {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ";") return true;
  }
  return false;
}

async function detectGeometryColumn(
  connection: DuckDbTypes.AsyncDuckDBConnection,
  statement: string
): Promise<string | null> {
  try {
    const described = rowsFromArrow(
      await connection.query(
        `DESCRIBE SELECT * FROM (${statement}) AS ${quoteIdentifier(QUERY_ALIAS)} LIMIT 0`
      )
    );
    const geometry = described.find((row) =>
      String(row.column_type ?? "").toUpperCase().includes("GEOMETRY")
    );
    return typeof geometry?.column_name === "string" ? geometry.column_name : null;
  } catch {
    return null;
  }
}

async function registerLayerTables(
  db: DuckDbTypes.AsyncDuckDB,
  connection: DuckDbTypes.AsyncDuckDBConnection,
  layers: DuckDbWorkspaceLayer[],
  prefix: string
): Promise<{
  files: string[];
  tables: Array<{ layerId: string; layerName: string; tableName: string }>;
}> {
  const files: string[] = [];
  const tables: Array<{ layerId: string; layerName: string; tableName: string }> = [];

  for (const { layer, tableName } of assignTableNames(layers)) {
    const fileName = `${prefix}_${tableName}.geojson`;
    await db.registerFileText(fileName, JSON.stringify(layer.geojson));
    files.push(fileName);
    await connection.query(
      `CREATE OR REPLACE TEMP TABLE ${quoteIdentifier(tableName)} AS ` +
        `SELECT * FROM ST_Read(${quoteString(fileName)})`
    );
    tables.push({ layerId: layer.id, layerName: layer.name, tableName });
  }

  return { files, tables };
}

function rowsToFeatures(
  rows: Record<string, unknown>[],
  geometryColumn: string
): Feature[] {
  const features: Feature[] = [];
  for (const row of rows) {
    const raw = row[GEOMETRY_JSON_COLUMN];
    if (typeof raw !== "string") continue;
    try {
      const geometry = JSON.parse(raw);
      const properties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === GEOMETRY_JSON_COLUMN || key === geometryColumn) continue;
        properties[key] = value;
      }
      features.push({
        type: "Feature",
        geometry,
        properties,
      } as Feature);
    } catch {
      // Invalid geometry is omitted from the derived layer but remains visible
      // in the tabular result.
    }
  }
  return features;
}

export async function executeDuckDbSpatialQuery(
  layers: DuckDbWorkspaceLayer[],
  sql: string
): Promise<DuckDbSpatialResult> {
  const started = performance.now();
  const statement = cleanStatement(sql);
  if (!statement) throw new Error("Introduza uma consulta SQL.");
  if (hasMultipleStatements(statement)) {
    throw new Error("Execute apenas uma instrução SQL de cada vez.");
  }

  const db = await getDuckDbSpatialDatabase();
  const connection = await db.connect();
  const prefix = `geomoz_sql_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let registeredFiles: string[] = [];

  try {
    await ensureSpatial(db, connection);
    const registration = await registerLayerTables(db, connection, layers, prefix);
    registeredFiles = registration.files;

    const geometryColumn = await detectGeometryColumn(connection, statement);
    const query = geometryColumn
      ? `SELECT ${quoteIdentifier(QUERY_ALIAS)}.*, ST_AsGeoJSON(${quoteIdentifier(
          geometryColumn
        )}) AS ${quoteIdentifier(GEOMETRY_JSON_COLUMN)} FROM (${statement}) AS ${quoteIdentifier(
          QUERY_ALIAS
        )}`
      : statement;

    const arrow = await connection.query(query);
    const rowsWithGeometry = rowsFromArrow(arrow);
    const columns: string[] =
      arrow?.schema?.fields
        ?.map((field: { name: string }) => field.name)
        .filter((name: string) => name !== GEOMETRY_JSON_COLUMN) ?? [];

    const rows = rowsWithGeometry.map((row) => {
      const visible: Record<string, unknown> = {};
      for (const column of columns) visible[column] = row[column];
      return visible;
    });

    const features = geometryColumn
      ? rowsToFeatures(rowsWithGeometry, geometryColumn)
      : undefined;

    return {
      columns,
      rows,
      totalCount: rows.length,
      executionTimeMs: Math.round(performance.now() - started),
      features,
      tableNames: registration.tables,
    };
  } finally {
    await connection.close();
    await Promise.all(
      registeredFiles.map(async (fileName) => {
        try {
          await db.dropFile(fileName);
        } catch {}
      })
    );
  }
}


export interface ImportedDuckDbVector {
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function featureCollectionFromRows(
  rows: Record<string, unknown>[],
  geometryColumn: string
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rowsToFeatures(rows, geometryColumn),
  };
}

async function importOgrVector(
  file: File
): Promise<ImportedDuckDbVector> {
  const db = await getDuckDbSpatialDatabase();
  const connection = await db.connect();
  const extension = extensionOf(file.name);
  const registeredName = `geomoz_import_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}.${extension || "data"}`;

  try {
    await ensureSpatial(db, connection);
    await db.registerFileBuffer(
      registeredName,
      new Uint8Array(await file.arrayBuffer())
    );

    const sourceSql = `ST_Read(${quoteString(registeredName)})`;
    const described = rowsFromArrow(
      await connection.query(`DESCRIBE SELECT * FROM ${sourceSql}`)
    );
    const geometryRow = described.find((row) =>
      String(row.column_type ?? "").toUpperCase().includes("GEOMETRY")
    );
    const geometryColumn =
      typeof geometryRow?.column_name === "string" ? geometryRow.column_name : null;

    if (!geometryColumn) {
      throw new Error(
        `O formato .${extension} foi aberto, mas não foi encontrada uma coluna geométrica.`
      );
    }

    const arrow = await connection.query(
      `SELECT *, ST_AsGeoJSON(${quoteIdentifier(geometryColumn)}) AS ` +
        `${quoteIdentifier(GEOMETRY_JSON_COLUMN)} FROM ${sourceSql}`
    );
    const rows = rowsFromArrow(arrow);
    const geojson = featureCollectionFromRows(rows, geometryColumn);
    if (!geojson.features.length) {
      throw new Error("O ficheiro não contém feições vetoriais legíveis.");
    }

    const fields =
      arrow?.schema?.fields
        ?.map((field: { name: string }) => field.name)
        .filter(
          (name: string) =>
            name !== GEOMETRY_JSON_COLUMN && name !== geometryColumn
        ) ?? [];

    return {
      name: baseName(file.name),
      geojson,
      featureCount: geojson.features.length,
      geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
      fields,
    };
  } finally {
    await connection.close();
    try {
      await db.dropFile(registeredName);
    } catch {}
  }
}

export async function importShapefileBundleWithDuckDb(
  files: File[]
): Promise<ImportedDuckDbVector> {
  const shpFile = files.find((file) => extensionOf(file.name) === "shp");
  if (!shpFile) {
    throw new Error("Selecione pelo menos o ficheiro .shp.");
  }

  const stem = baseName(shpFile.name).toLowerCase();
  const bundle = files.filter(
    (file) =>
      baseName(file.name).toLowerCase() === stem &&
      ["shp", "dbf", "shx", "prj", "cpg"].includes(extensionOf(file.name))
  );
  const requiredDbf = bundle.some((file) => extensionOf(file.name) === "dbf");
  if (!requiredDbf) {
    throw new Error(
      "Shapefile incompleto: selecione também o ficheiro .dbf (ou carregue um ZIP com todos os componentes)."
    );
  }

  const db = await getDuckDbSpatialDatabase();
  const connection = await db.connect();
  const prefix = `geomoz_shp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const registeredNames: string[] = [];

  try {
    await ensureSpatial(db, connection);

    for (const file of bundle) {
      const registeredName = `${prefix}_${stem}.${extensionOf(file.name)}`;
      await db.registerFileBuffer(
        registeredName,
        new Uint8Array(await file.arrayBuffer())
      );
      registeredNames.push(registeredName);
    }

    const registeredShp = registeredNames.find((name) => name.endsWith(".shp"));
    if (!registeredShp) throw new Error("Não foi possível preparar o ficheiro .shp.");

    const sourceSql = `ST_Read(${quoteString(registeredShp)})`;
    const described = rowsFromArrow(
      await connection.query(`DESCRIBE SELECT * FROM ${sourceSql}`)
    );
    const geometryRow = described.find((row) =>
      String(row.column_type ?? "").toUpperCase().includes("GEOMETRY")
    );
    const geometryColumn =
      typeof geometryRow?.column_name === "string" ? geometryRow.column_name : null;
    if (!geometryColumn) {
      throw new Error("O Shapefile foi aberto, mas não foi encontrada geometria.");
    }

    const arrow = await connection.query(
      `SELECT *, ST_AsGeoJSON(${quoteIdentifier(geometryColumn)}) AS ` +
        `${quoteIdentifier(GEOMETRY_JSON_COLUMN)} FROM ${sourceSql}`
    );
    const rows = rowsFromArrow(arrow);
    const geojson = featureCollectionFromRows(rows, geometryColumn);
    if (!geojson.features.length) {
      throw new Error("O Shapefile não contém feições vetoriais legíveis.");
    }

    const fields =
      arrow?.schema?.fields
        ?.map((field: { name: string }) => field.name)
        .filter(
          (name: string) =>
            name !== GEOMETRY_JSON_COLUMN && name !== geometryColumn
        ) ?? [];

    return {
      name: baseName(shpFile.name),
      geojson,
      featureCount: geojson.features.length,
      geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
      fields,
    };
  } finally {
    await connection.close();
    await Promise.all(
      registeredNames.map(async (registeredName) => {
        try {
          await db.dropFile(registeredName);
        } catch {}
      })
    );
  }
}

async function importZippedShapefile(file: File): Promise<ImportedDuckDbVector> {
  const shpModule = await import("shpjs");
  const parseShp = (shpModule as any).default ?? shpModule;
  const parsed = await parseShp(await file.arrayBuffer());

  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  const geojson: FeatureCollection =
    candidate?.type === "FeatureCollection"
      ? candidate
      : {
          type: "FeatureCollection",
          features: candidate?.features ?? [],
        };

  if (!geojson.features.length) {
    throw new Error("O ZIP não contém um Shapefile vetorial válido.");
  }

  const fields = Array.from(
    new Set(
      geojson.features
        .slice(0, 250)
        .flatMap((feature) => Object.keys(feature.properties ?? {}))
    )
  );

  return {
    name: baseName(file.name),
    geojson,
    featureCount: geojson.features.length,
    geometryType: geojson.features[0]?.geometry?.type ?? "Geometry",
    fields,
  };
}

export async function importVectorFileWithDuckDb(
  file: File
): Promise<ImportedDuckDbVector> {
  const extension = extensionOf(file.name);

  if (extension === "zip") {
    return importZippedShapefile(file);
  }

  const ogrExtensions = new Set([
    "gpkg",
    "fgb",
    "kml",
    "gml",
    "geojson",
    "json",
    "shp",
    "dxf",
  ]);

  if (ogrExtensions.has(extension)) {
    return importOgrVector(file);
  }

  if (extension === "parquet" || extension === "geoparquet" || extension === "pq") {
    // DuckDB Spatial's GDAL reader supports GeoParquet builds with spatial
    // metadata. A clear error is returned when the selected Parquet is tabular
    // only or lacks a geometry encoding.
    return importOgrVector(file);
  }

  throw new Error(
    `Formato .${extension || "desconhecido"} ainda não está ligado ao importador DuckDB Spatial.`
  );
}
