import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { mockFetch, mockBuilder } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockBuilder: vi.fn(),
}));
import { writeArrayBuffer } from "geotiff";
vi.mock("geolibre-wasm", () => ({
  default: async () => {},
  CogBuilder: class {
    constructor(...args: unknown[]) { mockBuilder(...args); }
    set_epsg = vi.fn();
    set_geo_transform = vi.fn();
    set_nodata = vi.fn();
    set_tile_size = vi.fn();
    set_compression = vi.fn();
    set_overview_levels = vi.fn();
    write_f32 = () => new Uint8Array([73, 73, 42, 0]);
    free = vi.fn();
  },
}));

import {
  downloadGlobalDem, globalDemTileRange, globalDemTileUrl, validateDemBounds
} from "../gis-global-dem";
import {
  clearGISSessionWorkspace, getGISSessionWorkspace, setGISSessionWorkspace,
  exportPortableGISProject, parsePortableGISProject,
} from "../gis-workspace-session";

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

afterEach(() => {
  clearGISSessionWorkspace();
  mockFetch.mockReset();
  mockBuilder.mockReset();
  vi.unstubAllGlobals();
});

describe("GeoLibre-derived global DEM without server persistence", () => {
  it("selects a safe tile count and retrieves actual AWS terrain GeoTIFFs", () => {
    const range = globalDemTileRange([32.60, -25.99, 32.62, -25.97]);
    const tiles = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    expect(tiles).toBeGreaterThan(0);
    expect(tiles).toBeLessThanOrEqual(64);
    expect(globalDemTileUrl(9, 304, 255))
      .toBe("https://s3.amazonaws.com/elevation-tiles-prod/geotiff/9/304/255.tif");
  });

  it("rejects invalid or overly wide WGS84 extents rather than silently inventing elevations", () => {
    expect(() => validateDemBounds([40, -20, 30, -18])).toThrow();
    expect(() => validateDemBounds([32, -90, 33, -18])).toThrow();
    expect(() => validateDemBounds([NaN, -20, 32, -18])).toThrow();
  });

  it("mosaics GeoTIFF pixels in memory and emits a georeferenced COG File", async () => {
    vi.stubGlobal("fetch", mockFetch);
    // Use genuine GeoTIFF fixture bytes, since geotiff.js can be externalised
    // in Vitest and an import mock might not intercept its lazy loader.
    const realGeoTiff = writeArrayBuffer(new Float32Array(512 * 512).fill(427), {
      width: 512,
      height: 512,
      ModelPixelScale: [30, 30, 0],
      ModelTiepoint: [0, 0, 0, 0, 0, 0],
      ProjectedCSTypeGeoKey: 3857,
    } as Parameters<typeof writeArrayBuffer>[1]);
    mockFetch.mockImplementation(async () => ({
      ok: true, status: 200, arrayBuffer: async () => realGeoTiff,
    }));
    const onProgress = vi.fn();
    const output = await downloadGlobalDem([32.60, -25.99, 32.62, -25.97], { onProgress });
    expect(output.file).toBeInstanceOf(File);
    expect(output.file.name).toMatch(/\.tif$/);
    expect(output.file.type).toBe("image/tiff");
    expect(output.width).toBeGreaterThan(1);
    expect(output.height).toBeGreaterThan(1);
    expect(output.resolutionMeters).toBeGreaterThan(0);
    expect(mockBuilder).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("elevation-tiles-prod/geotiff"), expect.objectContaining({ signal: undefined })
    );
    expect(onProgress).toHaveBeenCalledWith(output.tileCount, output.tileCount);
  });

  it("supports immediate cancellation without uploading anything", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(downloadGlobalDem([32.60, -25.99, 32.62, -25.97], {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("GIS workbench in-memory mode", () => {
  it("stores state only in RAM and validates explicit portable project files", () => {
    const workspace = {
      layers: [], rasters: [], services: [], selectedLayerId: "", secondLayerId: "",
      tableLayerId: null, history: [], modelGraph: { version: 1, nodes: [], edges: [] },
      activeTab: "layers", basemap: "terrain",
    };
    setGISSessionWorkspace(workspace);
    expect(getGISSessionWorkspace()).toBe(workspace);
    const project = exportPortableGISProject(workspace);
    expect(parsePortableGISProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(() => parsePortableGISProject({ format: "fake" })).toThrow();
    clearGISSessionWorkspace();
    expect(getGISSessionWorkspace()).toBeNull();
  });

  it("does not load Firestore/Storage/IndexedDB or autoupload project files in GIS Workspace", () => {
    const source = read("src/pages/GeoProcessamento.tsx");
    for (const forbidden of [
      "gisWorkspaceCloudService", "loadGISWorkspaceFromCloud",
      "syncGISWorkspaceToCloud", "saveGISWorkspaceSnapshot",
      "loadGISWorkspaceRasterFiles", "indexedDB", "uploadBytes("
    ]) expect(source).not.toContain(forbidden);
    expect(source).toContain("getGISSessionWorkspace(deviceCacheKey)");
    expect(source).toContain("downloadGlobalDem(demExtent");
    expect(source).toContain("data-testid=\"gis-local-project-input\"");
  });

  it("enters an immersive GIS mode with functional menus and no generic sidebar", () => {
    const explorer = read("src/pages/Explorer.tsx");
    expect(explorer).toContain('activeTab !== "GIS Workspace" && <Sidebar');
    expect(explorer).toContain('data-testid="gis-workspace-app-toolbar"');
    expect(explorer).toContain('"geomoz:gis-workspace-action"');
    expect(explorer).toContain('["DEM Global", "download-dem", Mountain]');
    expect(explorer).toContain("Sair do GIS Workspace");
  });
});
