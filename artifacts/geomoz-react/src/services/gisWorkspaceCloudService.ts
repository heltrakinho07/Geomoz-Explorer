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
  PersistedGISRasterLayer,
  PersistedModelNode,
  PersistedProcessingHistoryEntry,
} from "@/lib/gis-workspace-persistence";
import {
  GIS_WORKSPACE_SCHEMA_VERSION,
  loadGISWorkspaceRasterFiles,
} from "@/lib/gis-workspace-persistence";

const WORKSPACE_STATE_DOC = "state";
const CLOUD_HISTORY_LIMIT = 100;
const CLOUD_MODEL_LIMIT = 100;

export interface CloudGISVectorLayerManifest {
  kind?: "vector";
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

export interface CloudGISRasterLayerManifest {
  kind: "raster";
  id: string;
  name: string;
  sourceType?: "storage" | "url";
  objectPath?: string;
  remoteUrl?: string;
  format: "GeoTIFF";
  contentHash: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visible: boolean;
  opacity: number;
  bandCount?: number | null;
  bounds?: [number, number, number, number] | null;
  rasterState?: Record<string, unknown>;
  isResult?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CloudGISLayerManifest =
  | CloudGISVectorLayerManifest
  | CloudGISRasterLayerManifest;

interface CloudWorkspaceState {
  version: number;
  projectId: string;
  layerOrder: string[];
  rasterLayerOrder: string[];
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
const blobHashCache = new WeakMap<Blob, string>();

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

async function sha256Blob(blob: Blob): Promise<string> {
  const cached = blobHashCache.get(blob);
  if (cached) return cached;
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  blobHashCache.set(blob, hash);
  return hash;
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

  const manifest: CloudGISVectorLayerManifest = {
    kind: "vector",
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

async function uploadRasterIfChanged(
  uid: string,
  projectId: string,
  layer: PersistedGISRasterLayer,
  file?: File
): Promise<CloudGISRasterLayerManifest | null> {
  const manifestRef = layerManifestRef(uid, projectId, layer.id);
  const current = await getDoc(manifestRef);
  const existing =
    current.exists() && current.data().kind === "raster"
      ? (current.data() as CloudGISRasterLayerManifest)
      : null;
  const now = new Date().toISOString();

  const isExternalUrl =
    layer.sourceType === "url" &&
    typeof layer.remoteUrl === "string" &&
    /^https?:\/\//i.test(layer.remoteUrl);

  if (isExternalUrl) {
    if (existing?.sourceType !== "url" && existing?.objectPath) {
      try {
        await deleteObject(storageRef(storage, existing.objectPath));
      } catch {
        // A previous project-owned raster may already have been removed.
      }
    }

    const manifest: CloudGISRasterLayerManifest = {
      kind: "raster",
      sourceType: "url",
      id: layer.id,
      name: layer.name,
      remoteUrl: layer.remoteUrl,
      format: "GeoTIFF",
      contentHash: await sha256Hex(layer.remoteUrl),
      fileName: layer.fileName,
      mimeType: layer.mimeType || "image/tiff",
      sizeBytes: layer.sizeBytes ?? 0,
      visible: layer.visible,
      opacity: layer.opacity,
      bandCount: layer.bandCount ?? existing?.bandCount ?? null,
      bounds: layer.bounds ?? existing?.bounds ?? null,
      rasterState: layer.rasterState ?? existing?.rasterState,
      isResult: layer.isResult,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await setDoc(manifestRef, manifest);
    return manifest;
  }

  if (!file && !existing?.objectPath) {
    return null;
  }

  const contentHash = file ? await sha256Blob(file) : existing?.contentHash ?? "";
  const objectPath =
    existing?.sourceType !== "url" && existing?.objectPath
      ? existing.objectPath
      : `${workspaceRoot(uid, projectId)}/rasters/${layer.id}.tif`;

  if (
    file &&
    (!existing ||
      existing.sourceType === "url" ||
      existing.contentHash !== contentHash)
  ) {
    await uploadBytes(storageRef(storage, objectPath), file, {
      contentType: layer.mimeType || "image/tiff",
      customMetadata: {
        projectId,
        layerId: layer.id,
        contentHash,
        source: layer.isResult ? "derived" : "input",
        layerKind: "raster",
      },
    });
  }

  const manifest: CloudGISRasterLayerManifest = {
    kind: "raster",
    sourceType: "storage",
    id: layer.id,
    name: layer.name,
    objectPath,
    format: "GeoTIFF",
    contentHash,
    fileName: layer.fileName,
    mimeType: layer.mimeType || "image/tiff",
    sizeBytes: file?.size ?? layer.sizeBytes ?? existing?.sizeBytes ?? 0,
    visible: layer.visible,
    opacity: layer.opacity,
    bandCount: layer.bandCount ?? existing?.bandCount ?? null,
    bounds: layer.bounds ?? existing?.bounds ?? null,
    rasterState: layer.rasterState ?? existing?.rasterState,
    isResult: layer.isResult,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(manifestRef, manifest);
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

  const rasterFiles = await loadGISWorkspaceRasterFiles(projectId).catch(() => new Map<string, File>());

  await Promise.all([
    ...snapshot.layers.map((layer) => uploadLayerIfChanged(uid, projectId, layer)),
    ...snapshot.rasters.map((layer) =>
      uploadRasterIfChanged(uid, projectId, layer, rasterFiles.get(layer.id))
    ),
  ]);

  const layerIds = new Set([
    ...snapshot.layers.map((layer) => layer.id),
    ...snapshot.rasters.map((layer) => layer.id),
  ]);
  await removeStaleCloudLayers(uid, projectId, layerIds);

  const state: CloudWorkspaceState = {
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    projectId,
    layerOrder: snapshot.layers.map((layer) => layer.id),
    rasterLayerOrder: snapshot.rasters.map((layer) => layer.id),
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

async function downloadVectorLayer(
  manifest: CloudGISVectorLayerManifest
): Promise<PersistedGISLayer> {
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

async function restoreRasterLayer(
  manifest: CloudGISRasterLayerManifest
): Promise<PersistedGISRasterLayer> {
  const sourceType =
    manifest.sourceType === "url" && manifest.remoteUrl ? "url" : "storage";
  const remoteUrl =
    sourceType === "url"
      ? manifest.remoteUrl
      : manifest.objectPath
        ? await getDownloadURL(storageRef(storage, manifest.objectPath))
        : undefined;

  if (!remoteUrl) {
    throw new Error(`A camada raster cloud ${manifest.name} não possui fonte válida.`);
  }

  return {
    id: manifest.id,
    name: manifest.name,
    fileName: manifest.fileName || `${manifest.name}.tif`,
    mimeType: manifest.mimeType || "image/tiff",
    sizeBytes: manifest.sizeBytes ?? 0,
    visible: manifest.visible ?? true,
    opacity: manifest.opacity ?? 1,
    remoteUrl,
    sourceType,
    bandCount: manifest.bandCount ?? null,
    bounds: manifest.bounds ?? null,
    rasterState: manifest.rasterState,
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
  const vectorManifests = manifests.filter(
    (manifest): manifest is CloudGISVectorLayerManifest =>
      manifest.kind !== "raster" && manifest.format === "GeoJSON"
  );
  const rasterManifests = manifests.filter(
    (manifest): manifest is CloudGISRasterLayerManifest =>
      manifest.kind === "raster" || manifest.format === "GeoTIFF"
  );
  const [downloaded, restoredRasters] = await Promise.all([
    Promise.all(vectorManifests.map(downloadVectorLayer)),
    Promise.all(rasterManifests.map(restoreRasterLayer)),
  ]);
  const byId = new Map(downloaded.map((layer) => [layer.id, layer]));
  const ordered = state?.layerOrder?.length
    ? [
        ...state.layerOrder.map((id) => byId.get(id)).filter(Boolean),
        ...downloaded.filter((layer) => !state.layerOrder.includes(layer.id)),
      ]
    : downloaded;
  const rasterById = new Map(restoredRasters.map((layer) => [layer.id, layer]));
  const orderedRasters = state?.rasterLayerOrder?.length
    ? [
        ...state.rasterLayerOrder.map((id) => rasterById.get(id)).filter(Boolean),
        ...restoredRasters.filter((layer) => !state.rasterLayerOrder.includes(layer.id)),
      ]
    : restoredRasters;

  return {
    version: state?.version ?? GIS_WORKSPACE_SCHEMA_VERSION,
    projectId,
    layers: ordered as PersistedGISLayer[],
    rasters: orderedRasters as PersistedGISRasterLayer[],
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
