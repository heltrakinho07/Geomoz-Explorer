import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
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
  PersistedModelEdge,
  PersistedModelNode,
  PersistedProcessingHistoryEntry,
} from "@/lib/gis-workspace-persistence";
import {
  GIS_WORKSPACE_SCHEMA_VERSION,
  loadGISWorkspaceRasterFiles,
} from "@/lib/gis-workspace-persistence";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";
import type { GISStacRasterSource } from "@/lib/stac-client";
import { migrateLinearModelNodes } from "@/lib/gis-model-graph";

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
  sourceType?: "storage" | "url" | "stac";
  objectPath?: string;
  remoteUrl?: string;
  stacSource?: GISStacRasterSource;
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
  rasterSymbology?: GISWorkspaceRasterLayer["rasterSymbology"];
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
  services: GISWorkspaceSnapshot["services"];
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

const blobHashCache = new WeakMap<Blob, string>();

// Firestore rejects optional undefined fields, including nested provenance.
function firestoreData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertOwnedPath(uid: string, projectId: string, path: string): void {
  if (!path.startsWith(`${workspaceRoot(uid, projectId)}/`) || path.includes("..")) {
    throw new Error("Fonte Storage fora do projecto autenticado.");
  }
}

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
  const json = JSON.stringify(layer.geojson);
  const hash = await sha256Hex(json);
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
  // Immutable uploads keep the last committed workspace readable if any later
  // upload or the Firestore commit fails. Existing manifests remain compatible.
  const objectPath = existing?.contentHash === hash && existing.objectPath
    ? existing.objectPath
    : `${workspaceRoot(uid, projectId)}/vectors/${layer.id}/${hash}.geojson`;
  assertOwnedPath(uid, projectId, objectPath);
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

  return manifest;
}

async function uploadRasterIfChanged(
  uid: string,
  projectId: string,
  layer: PersistedGISRasterLayer,
  file?: File
): Promise<CloudGISRasterLayerManifest> {
  const manifestRef = layerManifestRef(uid, projectId, layer.id);
  const current = await getDoc(manifestRef);
  const existing =
    current.exists() && current.data().kind === "raster"
      ? (current.data() as CloudGISRasterLayerManifest)
      : null;
  const now = new Date().toISOString();

  const remoteUrl =
    typeof layer.remoteUrl === "string" ? layer.remoteUrl : undefined;
  const isExternalUrl =
    (layer.sourceType === "url" || layer.sourceType === "stac") &&
    typeof remoteUrl === "string" &&
    /^https?:\/\//i.test(remoteUrl);

  if (isExternalUrl && remoteUrl) {
    const manifest: CloudGISRasterLayerManifest = {
      kind: "raster",
      sourceType: layer.sourceType === "stac" ? "stac" : "url",
      id: layer.id,
      name: layer.name,
      remoteUrl,
      stacSource: layer.stacSource,
      format: "GeoTIFF",
      contentHash: await sha256Hex(
        layer.sourceType === "stac" && layer.stacSource
          ? JSON.stringify(layer.stacSource)
          : remoteUrl
      ),
      fileName: layer.fileName,
      mimeType: layer.mimeType || "image/tiff",
      sizeBytes: layer.sizeBytes ?? 0,
      visible: layer.visible,
      opacity: layer.opacity,
      bandCount: layer.bandCount ?? existing?.bandCount ?? null,
      bounds: layer.bounds ?? existing?.bounds ?? null,
      rasterState: layer.rasterState ?? existing?.rasterState,
      rasterSymbology: layer.rasterSymbology ?? existing?.rasterSymbology,
      isResult: layer.isResult,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return manifest;
  }

  if (!file && !existing?.objectPath) {
    throw new Error(`Raster ${layer.name}: ficheiro local e cópia Storage indisponíveis.`);
  }

  const contentHash = file ? await sha256Blob(file) : existing?.contentHash ?? "";
  const objectPath =
    existing?.contentHash === contentHash && existing?.objectPath
      ? existing.objectPath
      : `${workspaceRoot(uid, projectId)}/rasters/${layer.id}/${contentHash}.tif`;
  assertOwnedPath(uid, projectId, objectPath);

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
    rasterSymbology: layer.rasterSymbology ?? existing?.rasterSymbology,
    isResult: layer.isResult,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return manifest;
}

export async function syncGISWorkspaceToCloud(
  uid: string,
  snapshot: Omit<GISWorkspaceSnapshot, "version" | "updatedAt">
): Promise<void> {
  if (!uid || uid.startsWith("guest_") || uid === "guest_user") return;
  const projectId = snapshot.projectId;
  if (!projectId || projectId === "session-default") return;

  const rasterFiles = await loadGISWorkspaceRasterFiles(
    uid + "::" + projectId
  ).catch(() => new Map<string, File>());

  const previous = await getDocs(workspaceLayersCollection(uid, projectId));
  // Firestore batches support at most 500 writes. Never split a publication.
  const ids = [...snapshot.layers, ...snapshot.rasters].map((layer) => layer.id);
  if (new Set(ids).size !== ids.length) throw new Error("IDs de camadas duplicados.");
  const layerIds = new Set(ids);
  const stale = previous.docs.filter((item) => !layerIds.has(item.id));
  if (ids.length + stale.length + 1 > 500) throw new Error("Máximo de 499 alterações de camadas por sincronização.");
  const manifests = await Promise.all([
    ...snapshot.layers.map((layer) => uploadLayerIfChanged(uid, projectId, layer)),
    ...snapshot.rasters.map((layer) =>
      uploadRasterIfChanged(uid, projectId, layer, rasterFiles.get(layer.id))
    ),
  ]);

  const state: CloudWorkspaceState = {
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    projectId,
    layerOrder: snapshot.layers.map((layer) => layer.id),
    rasterLayerOrder: snapshot.rasters.map((layer) => layer.id),
    services: snapshot.services ?? [],
    selectedLayerId: snapshot.selectedLayerId,
    secondLayerId: snapshot.secondLayerId,
    tableLayerId: snapshot.tableLayerId,
    history: snapshot.history.slice(0, CLOUD_HISTORY_LIMIT),
    modelNodes: snapshot.modelNodes.slice(0, CLOUD_MODEL_LIMIT),
    modelEdges: snapshot.modelEdges.slice(0, CLOUD_MODEL_LIMIT * 2),
    activeTab: snapshot.activeTab,
    basemap: snapshot.basemap,
    updatedAt: new Date().toISOString(),
  };
  const batch = writeBatch(db);
  for (const manifest of manifests) {
    batch.set(layerManifestRef(uid, projectId, manifest.id), firestoreData(manifest));
  }
  for (const item of stale) batch.delete(item.ref);
  batch.set(workspaceStateRef(uid, projectId), firestoreData(state));
  await batch.commit();
  // Only removed layers are cleaned up, after publication. Old revisions of
  // retained layers are preserved: an in-flight reader may still need them.
  await Promise.all(stale.map(async (item) => {
    const path = (item.data() as Partial<CloudGISLayerManifest>).objectPath;
    if (!path) return;
    assertOwnedPath(uid, projectId, path);
    await deleteObject(storageRef(storage, path)).catch((error) => {
      console.warn("GIS Workspace: limpeza Storage adiada:", error);
    });
  }));
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
  if (manifest.contentHash && await sha256Hex(JSON.stringify(geojson)) !== manifest.contentHash) {
    throw new Error(`Integridade da camada cloud ${manifest.name} inválida.`);
  }
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
    manifest.sourceType === "stac" && manifest.remoteUrl && manifest.stacSource
      ? "stac"
      : manifest.sourceType === "url" && manifest.remoteUrl
        ? "url"
        : "storage";
  const remoteUrl =
    sourceType === "url" || sourceType === "stac"
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
    stacSource: manifest.stacSource,
    bandCount: manifest.bandCount ?? null,
    bounds: manifest.bounds ?? null,
    rasterState: manifest.rasterState,
    rasterSymbology: manifest.rasterSymbology,
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
  for (const manifest of manifests) {
    if (manifest.objectPath) assertOwnedPath(uid, projectId, manifest.objectPath);
  }
  const manifestIds = new Set(manifests.map((item) => item.id));
  if ([...(state?.layerOrder ?? []), ...(state?.rasterLayerOrder ?? [])].some((id) => !manifestIds.has(id))) {
    throw new Error("Manifesto cloud incompleto; restauro bloqueado para preservar os dados.");
  }
  const vectorManifests = manifests.filter(
    (manifest): manifest is CloudGISVectorLayerManifest =>
      manifest.kind !== "raster" && manifest.format === "GeoJSON"
  );
  const rasterManifests = manifests.filter(
    (manifest): manifest is CloudGISRasterLayerManifest =>
      manifest.kind === "raster" ||
      (manifest as { format?: string }).format === "GeoTIFF"
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

  const rawModelNodes = state?.modelNodes ?? [];
  const hasGraphNodes = rawModelNodes.some(
    (node) =>
      typeof (node as { kind?: unknown }).kind === "string" &&
      ["input", "tool", "output"].includes(
        String((node as { kind?: unknown }).kind)
      )
  );
  const restoredGraph =
    (state?.version ?? 0) >= 4 || hasGraphNodes
      ? {
          version: 1 as const,
          nodes: rawModelNodes,
          edges: state?.modelEdges ?? [],
        }
      : migrateLinearModelNodes(
          rawModelNodes as unknown as Array<{
            id: string;
            toolId: string;
            name: string;
            parameters: Record<string, unknown>;
          }>
        );

  return {
    version: GIS_WORKSPACE_SCHEMA_VERSION,
    projectId,
    layers: ordered as PersistedGISLayer[],
    rasters: orderedRasters as PersistedGISRasterLayer[],
    services: state?.services ?? [],
    selectedLayerId: state?.selectedLayerId ?? ordered[0]?.id ?? "",
    secondLayerId: state?.secondLayerId ?? "",
    tableLayerId: state?.tableLayerId ?? null,
    history: state?.history ?? [],
    modelNodes: restoredGraph.nodes,
    modelEdges: restoredGraph.edges,
    activeTab: state?.activeTab ?? "geolibre_toolbox",
    basemap: state?.basemap ?? "hybrid",
    updatedAt: state?.updatedAt ?? new Date(0).toISOString(),
  };
}
