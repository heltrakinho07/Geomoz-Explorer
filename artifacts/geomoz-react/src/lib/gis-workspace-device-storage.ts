/**
 * Explicit on-device GIS Workspace backup (IndexedDB).
 * The default workbench remains volatile/in-memory; opening a project
 * or saving a local copy is initiated by the user, not an autosave.
 *
 * This module never imports Firebase. The cloud Pro bridge lives separately
 * in gis-workspace-pro-storage.ts and requires server-issued entitlement.
 */
import type { GISLocalWorkspace } from "@/lib/gis-workspace-session";
import type { GISWorkspaceRasterLayer } from "@/lib/gis-raster";
import type { GISWorkspaceSnapshot, PersistedGISRasterLayer } from "@/lib/gis-workspace-persistence";
import {
  loadGISWorkspaceSnapshot,
  loadGISWorkspaceRasterFiles,
  saveGISWorkspaceSnapshot,
  syncGISWorkspaceRasterFiles,
  deleteGISWorkspaceSnapshot,
} from "@/lib/gis-workspace-persistence";

/** Reuse existing isolated per-account/per-project cache IDs from GeoMoz v4. */
export function gisDeviceCacheKey(uid: string | null | undefined, projectId?: string | null): string {
  const principal = uid && uid !== "guest_user" && !uid.startsWith("guest_") ? uid : "guest";
  return `${principal}::${projectId || "session-default"}`;
}

function rasterManifest(layer: GISWorkspaceRasterLayer): PersistedGISRasterLayer {
  return {
    id: layer.id,
    name: layer.name,
    fileName: layer.file?.name || layer.fileName,
    mimeType: layer.file?.type || layer.mimeType || "image/tiff",
    sizeBytes: layer.file?.size ?? layer.sizeBytes ?? 0,
    visible: layer.visible,
    opacity: layer.opacity,
    isResult: layer.isResult,
    bandCount: layer.bandCount ?? null,
    bounds: layer.bounds ?? null,
    error: layer.error ?? null,
    rasterState: layer.rasterState ? { ...layer.rasterState } : undefined,
    rasterSymbology: layer.rasterSymbology ? { ...layer.rasterSymbology } : undefined,
    remoteUrl: layer.sourceType === "stac" ? layer.remoteUrl : layer.remoteUrl,
    sourceType: layer.sourceType,
    stacSource: layer.stacSource,
  };
}

export async function saveGISWorkspaceOnDevice(cacheKey: string, state: GISLocalWorkspace): Promise<void> {
  if (!cacheKey) throw new Error("Identificador da sessão local em falta.");
  const snapshot: Omit<GISWorkspaceSnapshot, "version" | "updatedAt"> = {
    projectId: cacheKey,
    layers: state.layers,
    rasters: state.rasters.map(rasterManifest),
    services: state.services,
    selectedLayerId: state.selectedLayerId,
    secondLayerId: state.secondLayerId,
    tableLayerId: state.tableLayerId,
    history: state.history,
    modelNodes: state.modelGraph.nodes,
    modelEdges: state.modelGraph.edges,
    activeTab: state.activeTab,
    basemap: state.basemap,
  };

  // Each operation is explicit. Do not confirm success if quota/permissions
  // prevent a write. Existing Firebase project data is never touched.
  await saveGISWorkspaceSnapshot(snapshot, { strict: true });
  await syncGISWorkspaceRasterFiles(cacheKey, state.rasters);
}

export async function loadGISWorkspaceFromDevice(cacheKey: string): Promise<GISLocalWorkspace | null> {
  if (!cacheKey) return null;
  const snapshot = await loadGISWorkspaceSnapshot(cacheKey);
  if (!snapshot) return null;
  const files = await loadGISWorkspaceRasterFiles(cacheKey);
  const rasters: GISWorkspaceRasterLayer[] = snapshot.rasters.map(layer => {
    const file = layer.remoteUrl ? undefined : files.get(layer.id);
    return {
      ...layer,
      file,
      error: !file && !layer.remoteUrl
        ? "Ficheiro GeoTIFF não disponível na cópia local. Reimporte-o."
        : layer.error ?? null,
      rasterState: layer.rasterState as GISWorkspaceRasterLayer["rasterState"],
    };
  });
  return {
    layers: snapshot.layers,
    rasters,
    services: snapshot.services,
    selectedLayerId: snapshot.selectedLayerId,
    secondLayerId: snapshot.secondLayerId,
    tableLayerId: snapshot.tableLayerId,
    history: snapshot.history,
    modelGraph: {
      version: 1,
      nodes: snapshot.modelNodes,
      edges: snapshot.modelEdges,
    },
    activeTab: snapshot.activeTab,
    basemap: snapshot.basemap,
  };
}

/** Explicit removal only. Does NOT remove old cloud files or project records. */
export async function clearGISWorkspaceOnDevice(cacheKey: string): Promise<void> {
  if (!cacheKey) return;
  await deleteGISWorkspaceSnapshot(cacheKey, { strict: true });
  await syncGISWorkspaceRasterFiles(cacheKey, []);
}
