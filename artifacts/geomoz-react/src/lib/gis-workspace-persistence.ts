import type { GISRasterSymbology } from "@/lib/gis-raster-classification";
import type { FeatureCollection } from "geojson";

const DB_NAME = "geomoz-gis-workspace";
const DB_VERSION = 2;
const SNAPSHOT_STORE = "project-snapshots";
const RASTER_FILE_STORE = "raster-files";

export const GIS_WORKSPACE_SCHEMA_VERSION = 2;

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
  sourceType?: "storage" | "url";
}

export interface PersistedProcessingHistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  engine: "Client (Turf.js)" | "WASM" | "DuckDB Spatial";
  timestamp: string;
  durationMs: number;
  inputLayerName: string;
  outputCount: number;
  outputLabel?: string;
  status: "success" | "error";
  parameters: Record<string, unknown>;
}

export interface PersistedModelNode {
  id: string;
  toolId: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface GISWorkspaceSnapshot {
  version: number;
  projectId: string;
  layers: PersistedGISLayer[];
  rasters: PersistedGISRasterLayer[];
  selectedLayerId: string;
  secondLayerId: string;
  tableLayerId: string | null;
  history: PersistedProcessingHistoryEntry[];
  modelNodes: PersistedModelNode[];
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
      request.onsuccess = () => resolve(request.result);
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

    if (result.version === 1) {
      return {
        ...result,
        version: GIS_WORKSPACE_SCHEMA_VERSION,
        rasters: [],
      };
    }

    if (result.version !== GIS_WORKSPACE_SCHEMA_VERSION) return null;
    return {
      ...result,
      rasters: result.rasters ?? [],
    };
  } catch (error) {
    console.warn("GIS Workspace: falha ao restaurar snapshot local:", error);
    return null;
  }
}

export async function saveGISWorkspaceSnapshot(
  snapshot: Omit<GISWorkspaceSnapshot, "version" | "updatedAt">
): Promise<void> {
  if (!snapshot.projectId) return;
  const payload: GISWorkspaceSnapshot = {
    ...snapshot,
    rasters: snapshot.rasters ?? [],
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    await withStore<IDBValidKey>(SNAPSHOT_STORE, "readwrite", (store) =>
      store.put(payload)
    );
  } catch (error) {
    console.warn("GIS Workspace: falha ao persistir snapshot local:", error);
  }
}

export async function deleteGISWorkspaceSnapshot(
  projectId: string
): Promise<void> {
  if (!projectId) return;
  try {
    await withStore<undefined>(SNAPSHOT_STORE, "readwrite", (store) =>
      store.delete(projectId)
    );
  } catch (error) {
    console.warn("GIS Workspace: falha ao remover snapshot local:", error);
  }
}

interface RasterFileRecord {
  key: string;
  projectId: string;
  rasterId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
}

function rasterFileKey(projectId: string, rasterId: string): string {
  return `${projectId}:${rasterId}`;
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
    blob: file,
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
    result.set(
      record.rasterId,
      new File([record.blob], record.fileName, {
        type: record.mimeType || record.blob.type || "image/tiff",
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
    "layers" | "rasters" | "history" | "modelNodes"
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
