import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  gisDeviceCacheKey,
  saveGISWorkspaceOnDevice,
  loadGISWorkspaceFromDevice,
  clearGISWorkspaceOnDevice,
} from "../gis-workspace-device-storage";
import type { GISLocalWorkspace } from "../gis-workspace-session";
import type { FeatureCollection } from "geojson";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function localWorkspace(label: string): GISLocalWorkspace {
  const geojson: FeatureCollection = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [32.58, -25.95] },
      properties: { name: label } }],
  };
  return {
    layers: [{
      id: "local-vector", name: label, geojson, featureCount: 1,
      geometryType: "Point", fields: ["name"], color: "#0284c7", visible: true,
    }],
    rasters: [{
      id: "local-dem", name: "DEM", fileName: "dem.tif",
      file: new File([new Uint8Array([73, 73, 42, 0])], "dem.tif", { type: "image/tiff" }),
      mimeType: "image/tiff", sizeBytes: 4, visible: true, opacity: 0.8,
      bounds: [32.5, -26, 32.6, -25.9],
    }],
    services: [], selectedLayerId: "local-vector", secondLayerId: "",
    tableLayerId: null, history: [],
    modelGraph: { version: 1, nodes: [], edges: [] },
    activeTab: "layers", basemap: "terrain",
  };
}
function key(name: string) { return `device-workspace-test-${name}-${Date.now()}-${Math.random()}`; }
function read(p: string) { return readFileSync(resolve(process.cwd(), p), "utf8"); }

describe("GeoMoz opt-in IndexedDB for local GIS Workspace", () => {
  it("scopes backups to Firebase UID + project and separates guests", () => {
    expect(gisDeviceCacheKey("alice", "p1")).toBe("alice::p1");
    expect(gisDeviceCacheKey("bob", "p1")).toBe("bob::p1");
    expect(gisDeviceCacheKey(null, null)).toBe("guest::session-default");
    expect(gisDeviceCacheKey("guest_user", "p1")).toBe("guest::p1");
  });

  it("round-trips GeoJSON metadata and raw local GeoTIFF bytes without a server", async () => {
    const cacheKey = key("roundtrip");
    const original = localWorkspace("Zona Maputo");
    await saveGISWorkspaceOnDevice(cacheKey, original);
    const restored = await loadGISWorkspaceFromDevice(cacheKey);
    expect(restored?.layers[0].geojson.features[0].properties?.name).toBe("Zona Maputo");
    expect(restored?.modelGraph.version).toBe(1);
    expect(restored?.rasters[0].file).toBeInstanceOf(File);
    expect(restored?.rasters[0].file?.name).toBe("dem.tif");
    expect(restored?.rasters[0].file?.size).toBe(4);
    expect(restored?.rasters[0].opacity).toBe(0.8);
    await clearGISWorkspaceOnDevice(cacheKey);
    expect(await loadGISWorkspaceFromDevice(cacheKey)).toBeNull();
  });

  it("never overwrites another account's IndexedDB project cache", async () => {
    const alice = key("alice"), bob = key("bob");
    await saveGISWorkspaceOnDevice(alice, localWorkspace("Alice"));
    await saveGISWorkspaceOnDevice(bob, localWorkspace("Bob"));
    expect((await loadGISWorkspaceFromDevice(alice))?.layers[0].name).toBe("Alice");
    expect((await loadGISWorkspaceFromDevice(bob))?.layers[0].name).toBe("Bob");
    await clearGISWorkspaceOnDevice(alice);
    expect((await loadGISWorkspaceFromDevice(bob))?.layers[0].name).toBe("Bob");
    await clearGISWorkspaceOnDevice(bob);
  });

  it("defaults to volatile session and keeps Pro Firestore/Storage gated and intact", () => {
    const page = read("src/pages/GeoProcessamento.tsx");
    const persistence = read("src/lib/gis-workspace-persistence.ts");
    const cloud = read("src/services/gisWorkspaceCloudService.ts");
    const pro = read("src/lib/gis-workspace-pro-storage.ts");
    const shell = read("src/pages/Explorer.tsx");

    expect(page).toContain("saveGISWorkspaceOnDevice(deviceCacheKey");
    expect(page).toContain("loadGISWorkspaceFromDevice(deviceCacheKey");
    expect(page).toContain("clearGISWorkspaceOnDevice(deviceCacheKey");
    expect(page).not.toContain("syncGISWorkspaceToCloud(");
    expect(page).not.toContain("loadGISWorkspaceFromCloud(");
    expect(page).toContain("Cloud PRO · em preparação");
    expect(shell).toContain('"save-device"');
    expect(shell).toContain('"restore-device"');
    expect(persistence).toContain("syncGISWorkspaceRasterFiles");
    expect(cloud).toContain("firebase/storage");
    expect(pro).toContain("requireProGISStorageIdentity");
    expect(pro).toContain("getIdTokenResult(true)");
  });
});
