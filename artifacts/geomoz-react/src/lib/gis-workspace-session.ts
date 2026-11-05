/**
 * GeoMoz GIS Workspace — transient in-memory project state.
 * No Firestore, Firebase Storage, IndexedDB or localStorage persistence.
 *
 * GeoLibre-like explicit project export is implemented in the UI; a browser
 * reload clears in-memory data unless users save a project file themselves.
 */
import type { GISWorkspaceRasterLayer } from "./gis-raster";
import type { GISWorkspaceServiceLayer } from "./gis-data-sources";
import type { GISModelGraph } from "./gis-model-graph";
import type { FeatureCollection } from "geojson";

export interface WorkspaceVector {
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
export interface GISLocalWorkspace {
  layers: WorkspaceVector[];
  rasters: GISWorkspaceRasterLayer[];
  services: GISWorkspaceServiceLayer[];
  selectedLayerId: string;
  secondLayerId: string;
  tableLayerId: string | null;
  history: any[];
  modelGraph: GISModelGraph;
  activeTab: string;
  basemap: string;
}

// Isolate volatile sessions too: switching accounts or active projects must
// never display another principal's layers, even before using IndexedDB.
const memoryByScope = new Map<string, GISLocalWorkspace>();
export function getGISSessionWorkspace(scope = "default"): GISLocalWorkspace | null {
  return memoryByScope.get(scope) ?? null;
}
export function setGISSessionWorkspace(next: GISLocalWorkspace, scope = "default"): void {
  memoryByScope.set(scope, next);
}
export function clearGISSessionWorkspace(scope = "default"): void {
  memoryByScope.delete(scope);
}

export interface PortableGISProject {
  format: "geomoz-gis-project";
  version: 1;
  exportedAt: string;
  layers: WorkspaceVector[];
  rasters: Array<{
    id: string; name: string; fileName: string; remoteUrl?: string;
    sizeBytes: number; visible: boolean; opacity: number;
    bounds?: [number, number, number, number] | null;
  }>;
  services: GISWorkspaceServiceLayer[];
  modelGraph: GISModelGraph;
  basemap: string;
}

export function exportPortableGISProject(workspace: GISLocalWorkspace): PortableGISProject {
  return {
    format: "geomoz-gis-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    layers: workspace.layers,
    rasters: workspace.rasters.map(r => ({
      id: r.id, name: r.name, fileName: r.fileName,
      remoteUrl: r.sourceType === "stac" ? undefined : r.remoteUrl,
      sizeBytes: r.sizeBytes, visible: r.visible, opacity: r.opacity,
      bounds: r.bounds,
    })),
    services: workspace.services,
    modelGraph: workspace.modelGraph,
    basemap: workspace.basemap,
  };
}

export function parsePortableGISProject(value: unknown): PortableGISProject {
  if (!value || typeof value !== "object") throw new Error("Projecto GIS inválido.");
  const project = value as Partial<PortableGISProject>;
  if (project.format !== "geomoz-gis-project" || project.version !== 1 ||
      !Array.isArray(project.layers) || !Array.isArray(project.rasters) ||
      !Array.isArray(project.services) || !project.modelGraph ||
      !Array.isArray(project.modelGraph.nodes) || !Array.isArray(project.modelGraph.edges) ||
      typeof project.basemap !== "string") {
    throw new Error("O ficheiro não é um projecto GeoMoz GIS v1 válido.");
  }
  for (const layer of project.layers) {
    if (!layer || typeof layer.id !== "string" || typeof layer.name !== "string" ||
        layer.geojson?.type !== "FeatureCollection" || !Array.isArray(layer.geojson.features)) {
      throw new Error("O projecto contém uma camada GeoJSON inválida.");
    }
  }
  for (const raster of project.rasters) {
    if (!raster || typeof raster.id !== "string" || typeof raster.name !== "string" ||
        typeof raster.fileName !== "string") throw new Error("Manifesto raster inválido.");
  }
  return project as PortableGISProject;
}
