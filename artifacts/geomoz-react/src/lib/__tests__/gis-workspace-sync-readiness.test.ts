import { describe, expect, it } from "vitest";
import { canSyncGISWorkspaceToCloud } from "../gis-workspace-sync-readiness";

describe("cloud autosave recovery", () => {
  it("re-enables saves when unavailable rasters are removed or replaced", () => {
    expect(canSyncGISWorkspaceToCloud(true, [{}])).toBe(false);
    expect(canSyncGISWorkspaceToCloud(true, [])).toBe(true);
    expect(canSyncGISWorkspaceToCloud(true, [{ file: new File(["bytes"], "replacement.tif") }])).toBe(true);
    expect(canSyncGISWorkspaceToCloud(true, [{ remoteUrl: "https://example.org/raster.tif" }])).toBe(true);
  });
  it("requires every raster source and keeps a failed cloud restore blocked", () => {
    const available = { file: new File(["bytes"], "input.tif") };
    expect(canSyncGISWorkspaceToCloud(true, [available, {}])).toBe(false);
    expect(canSyncGISWorkspaceToCloud(false, [])).toBe(false);
    expect(canSyncGISWorkspaceToCloud(false, [available])).toBe(false);
  });
});
