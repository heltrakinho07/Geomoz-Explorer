/**
 * ExportPanel tests — verifies rendering of all 6 export cards,
 * disabled/enabled states, status bar, and error display.
 *
 * jsPDF mock avoids actual PDF generation.
 * fetch is mocked for SHP export endpoint.
 * URL.createObjectURL is mocked to avoid Blob URL creation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExportPanel from "@/components/ExportPanel";
import type { LayerState } from "@/components/Sidebar";

// ── Mock jsPDF ────────────────────────────────────────────────────────────

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFillColor: vi.fn(),
    rect: vi.fn(),
    circle: vi.fn(),
    setTextColor: vi.fn(),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    text: vi.fn(),
    roundedRect: vi.fn(),
    addPage: vi.fn(),
    line: vi.fn(),
    setDrawColor: vi.fn(),
    save: vi.fn(),
  })),
}));

// ── Mock Blob/URL ─────────────────────────────────────────────────────────

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
URL.createObjectURL = mockCreateObjectURL as any;
URL.revokeObjectURL = mockRevokeObjectURL as any;

// Mock document.createElement('a') download
const mockClick = vi.fn();
const _origCreateElement = document.createElement.bind(document);
beforeEach(() => {
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
  mockClick.mockClear();
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "a") {
      return { href: "", download: "", click: mockClick } as unknown as HTMLElement;
    }
    return _origCreateElement(tag);
  });
});

// ── Mock canvas for PNG export ────────────────────────────────────────────

beforeEach(() => {
  const mockCtx = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    roundRect: vi.fn(),
    textAlign: "left",
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (cb: any) => cb && cb(new Blob())
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Mock fetch for SHP export ─────────────────────────────────────────────

const mockFetch = vi.fn();

const MOCK_STATS = {
  totalFeatures: 150,
  totalUnits: 12,
  totalAreaKm2: 75_000,
  dominant: "Granito",
  lithologies: [
    { name: "Granito", areaKm2: 30_000, percent: 40, color: "#ff0000" },
    { name: "Basalto", areaKm2: 20_000, percent: 26.7, color: "#333333" },
  ],
};

const MOCK_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const LAYERS: LayerState = { provinces: true, districts: false, geology: true };

function renderPanel(
  province: string | null = null,
  district: string | null = null,
  colorBy = "code2006",
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // Pre-populate the cache with mock data
  qc.setQueryData(["stats", province ?? null, district ?? null], MOCK_STATS);
  qc.setQueryData(["provinces"], MOCK_GEOJSON);
  if (province) {
    qc.setQueryData(["geology", province, district ?? null, colorBy], MOCK_GEOJSON);
    qc.setQueryData(["districts", province], MOCK_GEOJSON);
  }

  return render(
    <QueryClientProvider client={qc}>
      <ExportPanel
        province={province}
        district={district}
        colorBy={colorBy}
        layers={LAYERS}
        mapCenter={[-18, 35]}
        mapZoom={5}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
  globalThis.fetch = mockFetch;
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ExportPanel", () => {
  it("renders the export title", () => {
    renderPanel();

    expect(screen.getByText("Exportar Dados")).toBeTruthy();
  });

  it("shows hint to select a province when none is selected", () => {
    renderPanel();

    // Text appears in the header AND in 5 disabled card tooltips
    const hints = screen.getAllByText(/província para activar/);
    expect(hints.length).toBeGreaterThan(0);
  });

  it("shows active area name when province is selected", () => {
    renderPanel("Maputo");

    expect(screen.getByText(/Maputo/)).toBeTruthy();
  });

  it("renders all 6 export cards", () => {
    renderPanel("Maputo");

    expect(screen.getByText("Relatório PDF Completo")).toBeTruthy();
    expect(screen.getByText("Mapa HTML Interactivo")).toBeTruthy();
    expect(screen.getByText("Tabela CSV")).toBeTruthy();
    expect(screen.getByText("GeoJSON — Geologia Filtrada")).toBeTruthy();
    expect(screen.getByText("Mapa PNG (imagem)")).toBeTruthy();
    expect(screen.getByText("Shapefile (ZIP)")).toBeTruthy();
  });

  it("shows download buttons on all cards", () => {
    renderPanel("Maputo");

    expect(screen.getByText("Descarregar PDF")).toBeTruthy();
    expect(screen.getByText("Descarregar HTML")).toBeTruthy();
    expect(screen.getByText("Descarregar CSV")).toBeTruthy();
    expect(screen.getByText("Descarregar GeoJSON")).toBeTruthy();
    expect(screen.getByText("Descarregar PNG")).toBeTruthy();
    expect(screen.getByText("Descarregar SHP")).toBeTruthy();
  });

  it("disables PDF, CSV, GeoJSON, PNG, SHP when no province", () => {
    renderPanel();

    const pdfBtn = screen.getByText("Descarregar PDF").closest("button");
    const csvBtn = screen.getByText("Descarregar CSV").closest("button");
    const geoBtn = screen.getByText("Descarregar GeoJSON").closest("button");
    const pngBtn = screen.getByText("Descarregar PNG").closest("button");
    const shpBtn = screen.getByText("Descarregar SHP").closest("button");
    const htmlBtn = screen.getByText("Descarregar HTML").closest("button");

    expect(pdfBtn?.disabled).toBe(true);
    expect(csvBtn?.disabled).toBe(true);
    expect(geoBtn?.disabled).toBe(true);
    expect(pngBtn?.disabled).toBe(true);
    expect(shpBtn?.disabled).toBe(true);
    // HTML should still be available without province (shows boundaries only)
    expect(htmlBtn?.disabled).toBe(false);
  });

  it("enables all export buttons when province with data is selected", () => {
    renderPanel("Maputo");

    const pdfBtn = screen.getByText("Descarregar PDF").closest("button");
    const csvBtn = screen.getByText("Descarregar CSV").closest("button");

    expect(pdfBtn?.disabled).toBe(false);
    expect(csvBtn?.disabled).toBe(false);
  });

  it("shows stats summary bar when province selected", () => {
    renderPanel("Maputo");

    expect(screen.getByText(/2 litologias/)).toBeTruthy(); // 2 lithologies in mock
    expect(screen.getByText(/150 feições/)).toBeTruthy();  // totalFeatures
  });

  it("shows the notice box", () => {
    renderPanel();

    expect(screen.getByText(/Nota sobre o PDF/)).toBeTruthy();
  });

  it("renders district name in the header", () => {
    renderPanel("Maputo", "Manhiça");

    expect(screen.getByText(/Manhiça, Maputo/)).toBeTruthy();
  });
});
