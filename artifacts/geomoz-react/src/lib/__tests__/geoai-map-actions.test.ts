import { describe, expect, it } from "vitest";
import { collectGeoAiMapActions } from "../geoai-map-actions";

describe("GeoMoz AI verified map actions", () => {
  const change = { type: "ADD_LAYER", id: "agent_change_ndvi", name: "ΔNDVI", tileUrl: "https://gee.example/tiles/{z}/{x}/{y}", temporalChange: { periodATileUrl: "A", periodBTileUrl: "B" } };

  it("adds raster automatically from a successful run even when map_actions is omitted", () => {
    const actions = collectGeoAiMapActions({ runs: [{ tool: "detect_temporal_change", output: { status: "success", map_action: change } }] });
    expect(actions).toEqual([change]);
    expect(actions[0].temporalChange).toEqual(change.temporalChange);
  });

  it("does not duplicate top-level and run-provided actions", () => {
    expect(collectGeoAiMapActions({ map_actions: [change], runs: [{ output: { status: "success", map_action: change } }] })).toEqual([change]);
  });

  it("does not invent map actions from synthesis or failures", () => {
    const output = collectGeoAiMapActions({ map_actions: [{ type: "ADD_LAYER", name: "No URL" }], runs: [
      { output: { status: "error", map_action: change } },
      { output: { status: "success", map_action: { type: "ADD_LAYER", tileUrl: "" } } },
    ] });
    expect(output).toEqual([]);
  });

  it("preserves validated administrative AOI commands alongside raster data", () => {
    const area = { type: "SET_AOI", province: "Sofala", district: "Marínguè" };
    expect(collectGeoAiMapActions({ map_actions: [area], runs: [{ output: { status: "success", map_action: change } }] })).toEqual([area, change]);
  });
});
