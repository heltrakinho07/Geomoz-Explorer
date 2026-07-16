/**
 * MapView tests — react-leaflet is heavily mocked because Leaflet requires
 * real DOM layout APIs (getBoundingClientRect, offsetParent) that jsdom
 * does not implement.
 *
 * These tests verify the component's logic, conditional rendering,
 * overlay messages, and hook integration rather than map rendering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MapView from "@/components/MapView";
import type { LayerState } from "@/components/Sidebar";
import type { AreaOfInterest } from "@/lib/aoi";

// ── Mock react-leaflet entirely ───────────────────────────────────────────

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, style }: any) => (
    <div data-testid="map-container" style={style}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: ({ data }: any) => <div data-testid="geojson-layer" data-features={data?.features?.length ?? 0} />,
  useMap: () => ({
    flyToBounds: vi.fn(),
    getCenter: () => ({ lat: -18, lng: 35 }),
    getZoom: () => 5,
    on: vi.fn(),
    off: vi.fn(),
    invalidateSize: vi.fn(),
  }),
  useMapEvents: () => null,
  ScaleControl: () => <div data-testid="scale-control" />,
  CircleMarker: () => <div data-testid="circle-marker" />,
  Circle: () => <div data-testid="circle" />,
}));

// ── Mock custom hooks ─────────────────────────────────────────────────────

const mockUseProvincesGeoJSON = vi.fn();
const mockUseDistrictsGeoJSON = vi.fn();
const mockUseGeologyGeoJSON = vi.fn();

vi.mock("@/hooks/useGeoMoz", () => ({
  useProvincesGeoJSON: (...args: any[]) => mockUseProvincesGeoJSON(...args),
  useDistrictsGeoJSON: (...args: any[]) => mockUseDistrictsGeoJSON(...args),
  useGeologyGeoJSON: (...args: any[]) => mockUseGeologyGeoJSON(...args),
}));

// ── Mock MapTools (uses useMap from react-leaflet) ─────────────────────────

vi.mock("@/components/MapTools", () => ({
  default: () => <div data-testid="map-tools" />,
}));

const MOCK_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      properties: { Provincia: "Maputo" },
    },
  ],
};

const LAYERS: LayerState = { provinces: true, districts: true, geology: true };

const DEFAULT_AOI: AreaOfInterest = {
  source: "global",
  geometry: null,
  label: "Moçambique",
};

function renderMapView(overrides?: {
  province?: string | null;
  district?: string | null;
  layers?: LayerState;
  colorBy?: string;
  aoi?: AreaOfInterest;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MapView
        province={overrides?.province ?? null}
        district={overrides?.district ?? null}
        layers={overrides?.layers ?? LAYERS}
        colorBy={overrides?.colorBy ?? "code2006"}
        aoi={overrides?.aoi ?? DEFAULT_AOI}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseProvincesGeoJSON.mockReset();
  mockUseDistrictsGeoJSON.mockReset();
  mockUseGeologyGeoJSON.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("MapView", () => {
  it("renders the map container", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    expect(screen.getByTestId("map-container")).toBeTruthy();
  });

  it("shows the no-province hint when no province is selected", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    expect(screen.getByText(/Clique numa/)).toBeTruthy();
    expect(screen.getByText(/Província/)).toBeTruthy();
  });

  it("hides the no-province hint when a province is selected", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION, isFetching: false });

    renderMapView({ province: "Maputo" });

    expect(screen.queryByText(/Clique numa/)).toBeNull();
  });

  it("shows geology loading overlay when geology is being fetched", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: true });

    renderMapView({ province: "Maputo" });

    expect(screen.getByText("A carregar geologia…")).toBeTruthy();
  });

  it("hides loading overlay when geology fetch completes", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION, isFetching: false });

    renderMapView({ province: "Maputo" });

    expect(screen.queryByText("A carregar geologia…")).toBeNull();
  });

  it("does NOT fetch geology when geology layer is disabled", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView({ province: "Maputo", layers: { ...LAYERS, geology: false } });

    // Geology hook should be called with layers.geology=false → enabled=false
    expect(mockUseGeologyGeoJSON).toHaveBeenCalledWith("Maputo", null, "code2006", false);
  });

  it("renders GeoJSON layers when data is available and layers are enabled", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION, isFetching: false });

    renderMapView({ province: "Maputo" });

    // Geology should show
    const layers = screen.getAllByTestId("geojson-layer");
    expect(layers.length).toBeGreaterThan(0);
  });

  it("renders provinces GeoJSON when provinces layer is enabled", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    // Without a province, provinces should render
    const layers = screen.getAllByTestId("geojson-layer");
    expect(layers.length).toBeGreaterThan(0);
  });

  it("renders MapTools component", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    expect(screen.getByTestId("map-tools")).toBeTruthy();
  });

  it("renders the north arrow", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    expect(screen.getByText("N")).toBeTruthy(); // North arrow text
  });

  it("renders the scale control", () => {
    mockUseProvincesGeoJSON.mockReturnValue({ data: MOCK_FEATURE_COLLECTION });
    mockUseDistrictsGeoJSON.mockReturnValue({ data: undefined });
    mockUseGeologyGeoJSON.mockReturnValue({ data: undefined, isFetching: false });

    renderMapView();

    expect(screen.getByTestId("scale-control")).toBeTruthy();
  });
});
