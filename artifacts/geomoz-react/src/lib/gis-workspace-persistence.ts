import type { GISRasterSymbology } from "@/lib/gis-raster-classification";
import type { GISWorkspaceServiceLayer } from "@/lib/gis-data-sources";
import type { FeatureCollection } from "geojson";
import type { GISStacRasterSource } from "@/lib/stac-client";
import type { GISModelEdge, GISModelNode } from "@/lib/gis-model-graph";

const DB_NAME = "geomoz-gis-workspace";
const DB_VERSION = 2;
const SNAPSHOT_STORE = "project-snapshots";
const RASTER_FILE_STORE = "raster-files";

export const GIS_WORKSPACE_SCHEMA_VERSION = 4;

export interface PersistedGISLayer {
  id: string;
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
  color: string;
  visible: boolean;
  isResult?: boolean;
}

export interface PersistedGISRasterLayer {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visible: boolean;
  opacity: number;
  isResult?: boolean;
  bandCount?: number | null;
  bounds?: [number, number, number, number] | null;
  rasterState?: Record<string, unknown>;
  rasterSymbology?: GISRasterSymbology;
  error?: string | null;
  remoteUrl?: string;
  sourceType?: "storage" | "url" | "stac";
  stacSource?: GISStacRasterSource;
}

export type PersistedGISServiceLayer = GISWorkspaceServiceLayer;

export interface PersistedProcessingHistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  engine:
    | "Client (Turf.js)"
    | "WASM"
    | "DuckDB Spatial"
    | "Hybrid Model"
    | "Backend GDAL";
  timestamp: string;
  durationMs: number;
  inputLayerName: string;
  outputCount: number;
  outputLabel?: string;
  status: "success" | "error";
  parameters: Record<string, unknown>;
  provenance?: {
    algorithm: string;
    inputLayerId: string;
    overlayLayerId: string | null;
    outputLayerId: string;
    inputFeatureCount: number;
    overlayFeatureCount: number | null;
    completedAt: string;
  };
}

export type PersistedModelNode = GISModelNode;
export type PersistedModelEdge = GISModelEdge;

interface LegacyPersistedModelNode {
  id: string;
  toolId: string;
  name: string;
  parameters: Record<string, unknown>;
}

function migrateLegacyModelNodes(
  nodes: LegacyPersistedModelNode[] | undefined
): { modelNodes: PersistedModelNode[]; modelEdges: PersistedModelEdge[] } {
  const legacy = Array.isArray(nodes) ? nodes : [];
  if (!legacy.length) {
    return { modelNodes: [], modelEdges: [] };
  }

  const inputId = "model_input";
  const outputId = "model_output";
  const modelNodes: PersistedModelNode[] = [
    {
      id: inputId,
      kind: "input",
      name: "Dados de entrada",
      x: 24,
      y: 72,
      dataKind: "vector",
      parameters: {},
    },
    ...legacy.map((node, index) => ({
      id: node.id,
      kind: "tool" as const,
      name: node.name,
      x: 230 + index * 230,
      y: 72,
      provider: "turf" as const,
      toolId: node.toolId,
      parameters: { ...(node.parameters ?? {}) },
    })),
    {
      id: outputId,
      kind: "output",
      name: "Resultado do modelo",
      x: 230 + legacy.length * 230,
      y: 72,
      parameters: {},
    },
  ];

  const modelEdges: PersistedModelEdge[] = [];
  let previous = inputId;
  let previousPort = "out";
  for (const node of legacy) {
    modelEdges.push({
      id: `edge_${previous}_${node.id}`,
      from: previous,
      fromPort: previousPort,
      to: node.id,
      toPort: "input",
    });
    previous = node.id;
    previousPort = "output";
  }
  modelEdges.push({
    id: `edge_${previous}_${outputId}`,
    from: previous,
    fromPort: previousPort,
    to: outputId,
    toPort: "in",
  });

  return { modelNodes, modelEdges };
}

export interface GISWorkspaceSnapshot {
  version: number;
  projectId: string;
  layers: PersistedGISLayer[];
  rasters: PersistedGISRasterLayer[];
  services: PersistedGISServiceLayer[];
  selectedLayerId: string;
  secondLayerId: string;
  tableLayerId: string | null;
  history: PersistedProcessingHistoryEntry[];
  modelNodes: PersistedModelNode[];
  modelEdges: PersistedModelEdge[];
  activeTab: string;
  basemap: string;
  updatedAt: string;
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB não está disponível neste navegador."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "projectId" });
      }
      if (!db.objectStoreNames.contains(RASTER_FILE_STORE)) {
        db.createObjectStore(RASTER_FILE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openWorkspaceDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);
      request.onerror = () =>
        reject(request.error ?? new Error("Operação IndexedDB falhou."));
      // A successful request can still be rolled back by a transaction abort.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Transação IndexedDB abortada."));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Transação IndexedDB falhou."));
    });
  } finally {
    db.close();
  }
}

export async function loadGISWorkspaceSnapshot(
  projectId: string
): Promise<GISWorkspaceSnapshot | null> {
  if (!projectId) return null;
  try {
    const result = await withStore<GISWorkspaceSnapshot | undefined>(
      SNAPSHOT_STORE,
      "readonly",
      (store) => store.get(projectId)
    );
    if (!result) return null;

    if (result.version === 1 || result.version === 2 || result.version === 3) {
      const migratedModel = migrateLegacyModelNodes(
        result.modelNodes as unknown as LegacyPersistedModelNode[]
      );
      return {
        ...result,
        version: GIS_WORKSPACE_SCHEMA_VERSION,
        rasters: result.version === 1 ? [] : result.rasters ?? [],
        services: result.version <= 2 ? [] : result.services ?? [],
        ...migratedModel,
      };
    }

    if (result.version !== GIS_WORKSPACE_SCHEMA_VERSION) return null;
    return {
      ...result,
      rasters: result.rasters ?? [],
      services: result.services ?? [],
      modelNodes: result.modelNodes ?? [],
      modelEdges: result.modelEdges ?? [],
    };
  } catch (error) {
    console.warn("GIS Workspace: falha ao restaurar snapshot local:", error);
    return null;
  }
}

export async function saveGISWorkspaceSnapshot(
  snapshot: Omit<GISWorkspaceSnapshot, "version" | "updatedAt">,
  options: { strict?: boolean } = {}
): Promise<void> {
  if (!snapshot.projectId) return;
  const payload: GISWorkspaceSnapshot = {
    ...snapshot,
    rasters: snapshot.rasters ?? [],
    services: snapshot.services ?? [],
    modelNodes: snapshot.modelNodes ?? [],
    modelEdges: snapshot.modelEdges ?? [],
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    await withStore<IDBValidKey>(SNAPSHOT_STORE, "readwrite", (store) =>
      store.put(payload)
    );
  } catch (error) {
    console.warn("GIS Workspace: falha ao persistir snapshot local:", error);
    if (options.strict) throw error;
  }
}

export async function deleteGISWorkspaceSnapshot(
  projectId: string,
  options: { strict?: boolean } = {}
): Promise<void> {
  if (!projectId) return;
  try {
    await withStore<undefined>(SNAPSHOT_STORE, "readwrite", (store) =>
      store.delete(projectId)
    );
  } catch (error) {
    console.warn("GIS Workspace: falha ao remover snapshot local:", error);
    if (options.strict) throw error;
  }
}

interface RasterFileRecord {
  key: string;
  projectId: string;
  rasterId: string;
  fileName: string;
  mimeType: string;
  /** Modern cache format: portable binary bytes, not a runtime-specific File object. */
  bytes?: ArrayBuffer;
  /** Legacy IndexedDB cache from older GeoMoz versions; retained for recovery. */
  blob?: Blob;
}

function rasterFileKey(projectId: string, rasterId: string): string {
  return `${projectId}:${rasterId}`;
}

/** Read native browser File bytes; FileReader remains the compatibility
 * fallback for environments without Blob.arrayBuffer(). */
function bytesFromFile(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error("O ficheiro raster não forneceu dados binários."));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler GeoTIFF."));
    reader.readAsArrayBuffer(file);
  });
}

export async function saveGISWorkspaceRasterFile(
  projectId: string,
  rasterId: string,
  file: File
): Promise<void> {
  if (!projectId || !rasterId) return;
  const record: RasterFileRecord = {
    key: rasterFileKey(projectId, rasterId),
    projectId,
    rasterId,
    fileName: file.name,
    mimeType: file.type || "image/tiff",
    // Using raw bytes avoids File/Blob structured-clone differences in browsers
    // and fake-indexeddb, while preserving exact GeoTIFF binary content.
    bytes: await bytesFromFile(file),
  };
  await withStore<IDBValidKey>(RASTER_FILE_STORE, "readwrite", (store) =>
    store.put(record)
  );
}

export async function loadGISWorkspaceRasterFiles(
  projectId: string
): Promise<Map<string, File>> {
  const records = await withStore<RasterFileRecord[]>(
    RASTER_FILE_STORE,
    "readonly",
    (store) => store.getAll()
  );
  const result = new Map<string, File>();
  for (const record of records) {
    if (record.projectId !== projectId) continue;
    const source = record.bytes instanceof ArrayBuffer ? record.bytes : record.blob;
    if (!(source instanceof ArrayBuffer) && !(source instanceof Blob)) {
      throw new Error(`Ficheiro raster local ${record.fileName} não pôde ser recuperado.`);
    }
    result.set(
      record.rasterId,
      new File([source], record.fileName, {
        type: record.mimeType || (source instanceof Blob ? source.type : "image/tiff"),
      })
    );
  }
  return result;
}

export async function syncGISWorkspaceRasterFiles(
  projectId: string,
  rasters: Array<{ id: string; file?: File }>
): Promise<void> {
  if (!projectId) return;
  const localRasters = rasters.filter(
    (raster): raster is { id: string; file: File } => raster.file instanceof File
  );
  const desired = new Set(localRasters.map((raster) => raster.id));

  await Promise.all(
    localRasters.map((raster) =>
      saveGISWorkspaceRasterFile(projectId, raster.id, raster.file)
    )
  );

  const records = await withStore<RasterFileRecord[]>(
    RASTER_FILE_STORE,
    "readonly",
    (store) => store.getAll()
  );
  await Promise.all(
    records
      .filter(
        (record) =>
          record.projectId === projectId && !desired.has(record.rasterId)
      )
      .map((record) =>
        withStore<undefined>(RASTER_FILE_STORE, "readwrite", (store) =>
          store.delete(record.key)
        )
      )
  );
}

export function estimateGISWorkspaceSnapshotBytes(
  snapshot: Pick<
    GISWorkspaceSnapshot,
    "layers" | "rasters" | "services" | "history" | "modelNodes" | "modelEdges"
  >
): number {
  try {
    const metadataBytes = new Blob([JSON.stringify(snapshot)]).size;
    const rasterBytes = snapshot.rasters.reduce(
      (total, raster) => total + (raster.sizeBytes || 0),
      0
    );
    return metadataBytes + rasterBytes;
  } catch {
    return 0;
  }
}
