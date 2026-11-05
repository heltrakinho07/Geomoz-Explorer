import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeoTemporalAnalysisPanel } from "../GeoTemporalAnalysisPanel";
import type { TemporalReplay } from "@/types/project";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

const replay: TemporalReplay = {
  version: 1, tool: "detect_temporal_change",
  aoi: { source: "mozambique", province: "Sofala", district: "Maringue" },
  args: { index: "ndvi", start_date_1: "2020-05-01", end_date_1: "2020-09-01",
    start_date_2: "2025-01-01", end_date_2: "2025-04-01",
    threshold: 0.2, scale_m: 30, cloud_pct: 30 },
};
const props = { replay, disabled: false, onExportPdf: vi.fn(async () => {}),
  onExportPng: vi.fn(async () => {}) };

describe("GeoTemporalAnalysisPanel", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("displays scientific quality warnings without declaring a seasonal mismatch conclusive", () => {
    render(<GeoTemporalAnalysisPanel {...props} quality={{
      calendarAligned: false, durationDays: { A: 123, B: 90 },
      sceneCounts: { A: 26, B: 3 }, commonValidCoveragePercent: 43,
      status: "review", warningCodes: ["season", "scenes", "coverage"],
      warnings: [], note: "Calendar is not phenological proof",
    }} />);
    expect(screen.getByText(/Rever sazonalidade/)).toBeTruthy();
    expect(screen.getByText(/sazonalidade pode influenciar/)).toBeTruthy();
    expect(screen.getByText(/Menos de 70%/)).toBeTruthy();
    expect(screen.getByText(/Calendário semelhante não garante/)).toBeTruthy();
  });

  it("requests real histogram bins and switches between A, B and Delta", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({
      analysisScaleM: 30, note: "Count", histograms: {
        A: [{ min: -1, count: 7.5 }, { min: 0, count: 12 }],
        B: [{ min: -1, count: 2 }, { min: 0, count: 17.5 }],
        Delta: [{ min: -2, count: 4 }, { min: 0, count: 15.5 }],
      },
    }) });
    render(<GeoTemporalAnalysisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular histogramas GEE" }));
    expect(await screen.findByRole("group", { name: "Seleccionar série" })).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock.mock.calls[0][0]).toBe("/geomoz-api/ai/temporal-histogram");
    const sent = JSON.parse(apiFetchMock.mock.calls[0][1].body);
    expect(sent.args).toBeUndefined();
    expect(sent.aoi).toEqual(replay.aoi);
    expect(sent.start_date_1).toBe("2020-05-01");
    fireEvent.click(screen.getByRole("button", { name: "Δ" }));
    expect(screen.getByRole("img", { name: "Delta · Calcular histogramas GEE" })).toBeTruthy();
  });

  it("warns on adjusted geotiff resolution and preserves signed link without auto-navigation", async () => {
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({
      downloadUrl: "https://earthengine.googleapis.com/download/temporary",
      dimensions: [600, 800], estimatedGridScaleM: 120, requestedScaleM: 30,
      resolutionAdjusted: true, bands: ["NDVI_A", "NDVI_B", "Delta_NDVI"], note: "bounded",
    }) });
    render(<GeoTemporalAnalysisPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar GeoTIFF A/B/Δ" }));
    const link = await screen.findByRole("link", { name: /Descarregar GeoTIFF/ });
    expect(link.getAttribute("href")).toContain("earthengine.googleapis.com");
    expect(screen.getByText(/30 m → 120 m/)).toBeTruthy();
  });
});
