import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  GISWorkspaceSnapshot,
  PersistedGISLayer,
  PersistedModelNode,
  PersistedProcessingHistoryEntry,
} from "@/lib/gis-workspace-persistence";

const WORKSPACE_STATE_DOC = "state";
const CLOUD_HISTORY_LIMIT = 100;
const CLOUD_MODEL_LIMIT = 100;

export interface CloudGISLayerManifest {
  id: string;
  name: string;
  objectPath: string;
  format: "GeoJSON";
  contentHash: string;
  sizeBytes: number;
  featureCount: number;
  geometryType: string;
  fields: string[];
  color: string;
  visible: boolean;
  isResult?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CloudWorkspaceState {
  version: number;
  projectId: string;
  layerOrder: string[];
  selectedLayerId: string;
  secondLayerId: string;
  tableLayerId: string | null;
  history: PersistedProcessingHistoryEntry[];
  modelNodes: PersistedModelNode[];
  activeTab: string;
  basemap: string;
  updatedAt: string;
}

const hashCache = new WeakMap<object, string>();

function workspaceRoot(uid: string, projectId: string): string {
  return `users/${uid}/projects/${projectId}`;
}

function layerManifestRef(uid: string, projectId: string, layerId: string) {
  return doc(db, "users", uid, "projects", projectId, "workspaceLayers", layerId);
}

function workspaceStateRef(uid: string, projectId: string) {
  return doc(db, "users", uid, "projects", projectId, "workspace", WORKSPACE_STATE_DOC);
}

function workspaceLayersCollection(uid: string, projectId: string) {
  return collection(db, "users", uid, "projects", projectId, "workspaceLayers");
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function serializeLayer(layer: PersistedGISLayer): Promise<{
  json: string;
  hash: string;
}> {
  const cached = hashCache.get(layer as object);
  const json = JSON.stringify(layer.geojson);
  if (cached) return { json, hash: cached };
  const hash = await sha256Hex(json);
  hashCache.set(layer as object, hash);
  return { json, hash };
}

async function uploadLayerIfChanged(
  uid: string,
  projectId: string,
  layer: PersistedGISLayer
): Promise<CloudGISLayerManifest> {
  const manifestRef = layerManifestRef(uid, projectId, layer.id);
  const current = await getDoc(manifestRef);
  const existing = current.exists()
    ? (current.data() as CloudGISLayerManifest)
    : null;

  const { json, hash } = await serializeLayer(layer);
  const objectPath = `${workspaceRoot(uid, projectId)}/vectors/${layer.id}.geojson`;
  const now = new Date().toISOString();

  if (!existing || existing.contentHash !== hash) {
    const blob = new Blob([json], { type: "application/geo+json" });
    await uploadBytes(storageRef(storage, objectPath), blob, {
      contentType: "application/geo+json",
      customMetadata: {
        projectId,
        layerId: layer.id,
        contentHash: hash,
        source: layer.isResult ? "derived" : "input",
      },
    });
  }

  const manifest: CloudGISLayerManifest = {
    id: layer.id,
    name: layer.name,
    objectPath,
    format: "GeoJSON",
    contentHash: hash,
    sizeBytes: new Blob([json]).size,
    featureCount: layer.featureCount,
    geometryType: layer.geometryType,
    fields: layer.fields,
    color: layer.color,
    visible: layer.visible,
    isResult: layer.isResult,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(manifestRef, manifest, { merge: true });
  return manifest;
}

async function removeStaleCloudLayers(
  uid: string,
  projectId: string,
  layerIds: Set<string>
): Promise<void> {
  const snapshot = await getDocs(workspaceLayersCollection(uid, projectId));
  await Promise.all(
    snapshot.docs
      .filter((layerDoc) => !layerIds.has(layerDoc.id))
      .map(async (layerDoc) => {
        const manifest = layerDoc.data() as Partial<CloudGISLayerManifest>;
        if (manifest.objectPath) {
          try {
            await deleteObject(storageRef(storage, manifest.objectPath));
          } catch {
            // The object may already have been removed manually.
          }
        }
        await deleteDoc(layerDoc.ref);
      })
  );
}

export async function syncGISWorkspaceToCloud(
  uid: string,
  snapshot: Omit<GISWorkspaceSnapshot, "version" | "updatedAt">
): Promise<void> {
  if (!uid || uid.startsWith("guest_") || uid === "guest_user") return;
  const projectId = snapshot.projectId;
  if (!projectId || projectId === "session-default") return;

  await Promise.all(
    snapshot.layers.map((layer) => uploadLayerIfChanged(uid, projectId, layer))
  );

  const layerIds = new Set(snapshot.layers.map((layer) => layer.id));
  await removeStaleCloudLayers(uid, projectId, layerIds);

  const state: CloudWorkspaceState = {
    version: 1,
    projectId,
    layerOrder: snapshot.layers.map((layer) => layer.id),
    selectedLayerId: snapshot.selectedLayerId,
    secondLayerId: snapshot.secondLayerId,
    tableLayerId: snapshot.tableLayerId,
    history: snapshot.history.slice(0, CLOUD_HISTORY_LIMIT),
    modelNodes: snapshot.modelNodes.slice(0, CLOUD_MODEL_LIMIT),
    activeTab: snapshot.activeTab,
    basemap: snapshot.basemap,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(workspaceStateRef(uid, projectId), state, { merge: true });
}

async function downloadLayer(manifest: CloudGISLayerManifest): Promise<PersistedGISLayer> {
  const url = await getDownloadURL(storageRef(storage, manifest.objectPath));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao transferir ${manifest.name}: HTTP ${response.status}`);
  }
  const geojson = await response.json();
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error(`A camada cloud ${manifest.name} não contém GeoJSON válido.`);
  }

  return {
    id: manifest.id,
    name: manifest.name,
    geojson,
    featureCount: manifest.featureCount ?? geojson.features.length,
    geometryType:
      manifest.geometryType ?? geojson.features[0]?.geometry?.type ?? "Geometry",
    fields:
      manifest.fields ??
      (geojson.features[0]?.properties ? Object.keys(geojson.features[0].properties) : []),
    color: manifest.color ?? "#2563eb",
    visible: manifest.visible ?? true,
    isResult: manifest.isResult,
  };
}

export async function loadGISWorkspaceFromCloud(
  uid: string,
  projectId: string
): Promise<GISWorkspaceSnapshot | null> {
  if (!uid || uid.startsWith("guest_") || uid === "guest_user" || !projectId) return null;

  const [stateSnap, layerSnaps] = await Promise.all([
    getDoc(workspaceStateRef(uid, projectId)),
    getDocs(workspaceLayersCollection(uid, projectId)),
  ]);

  if (!stateSnap.exists() && layerSnaps.empty) return null;

  const state = stateSnap.exists()
    ? (stateSnap.data() as CloudWorkspaceState)
    : null;
  const manifests = layerSnaps.docs.map(
    (layerDoc) => layerDoc.data() as CloudGISLayerManifest
  );
  const downloaded = await Promise.all(manifests.map(downloadLayer));
  const byId = new Map(downloaded.map((layer) => [layer.id, layer]));
  const ordered = state?.layerOrder?.length
    ? [
        ...state.layerOrder.map((id) => byId.get(id)).filter(Boolean),
        ...downloaded.filter((layer) => !state.layerOrder.includes(layer.id)),
      ]
    : downloaded;

  return {
    version: state?.version ?? 1,
    projectId,
    layers: ordered as PersistedGISLayer[],
    selectedLayerId: state?.selectedLayerId ?? ordered[0]?.id ?? "",
    secondLayerId: state?.secondLayerId ?? "",
    tableLayerId: state?.tableLayerId ?? null,
    history: state?.history ?? [],
    modelNodes: state?.modelNodes ?? [],
    activeTab: state?.activeTab ?? "geolibre_toolbox",
    basemap: state?.basemap ?? "hybrid",
    updatedAt: state?.updatedAt ?? new Date(0).toISOString(),
  };
}
