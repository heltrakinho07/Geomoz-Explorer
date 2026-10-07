import type { FeatureCollection } from "geojson";

const DB_NAME = "geomoz-gis-workspace";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "project-snapshots";

export const GIS_WORKSPACE_SCHEMA_VERSION = 1;

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

export interface PersistedProcessingHistoryEntry {
  id: string;
  toolId: string;
  toolName: string;
  engine: "Client (Turf.js)" | "WASM" | "DuckDB Spatial";
  timestamp: string;
  durationMs: number;
  inputLayerName: string;
  outputCount: number;
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
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withSnapshotStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openWorkspaceDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOT_STORE, mode);
      const store = transaction.objectStore(SNAPSHOT_STORE);
      const request = operation(store);
      request.onerror = () => reject(request.error ?? new Error("Operação IndexedDB falhou."));
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
    const result = await withSnapshotStore<GISWorkspaceSnapshot | undefined>(
      "readonly",
      (store) => store.get(projectId)
    );
    if (!result || result.version !== GIS_WORKSPACE_SCHEMA_VERSION) return null;
    return result;
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
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    await withSnapshotStore<IDBValidKey>("readwrite", (store) => store.put(payload));
  } catch (error) {
    console.warn("GIS Workspace: falha ao persistir snapshot local:", error);
  }
}

export async function deleteGISWorkspaceSnapshot(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    await withSnapshotStore<undefined>("readwrite", (store) => store.delete(projectId));
  } catch (error) {
    console.warn("GIS Workspace: falha ao remover snapshot local:", error);
  }
}

export function estimateGISWorkspaceSnapshotBytes(
  snapshot: Pick<GISWorkspaceSnapshot, "layers" | "history" | "modelNodes">
): number {
  try {
    return new Blob([JSON.stringify(snapshot)]).size;
  } catch {
    return 0;
  }
}
