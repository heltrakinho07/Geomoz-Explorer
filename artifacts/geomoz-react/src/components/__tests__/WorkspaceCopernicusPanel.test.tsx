import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "firebase/auth";
import { afterEach, expect, it, vi } from "vitest";
import WorkspaceCopernicusPanel from "../WorkspaceCopernicusPanel";
import { apiFetch } from "@/lib/api";
import { useSubscription } from "@/hooks/useSubscription";
import { customAOI } from "@/lib/aoi";

vi.mock("@/components/ZoneSelect", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: vi.fn() }));

const geometry: GeoJSON.Polygon = {
  type: "Polygon", coordinates: [[[32.5, -26], [32.6, -26], [32.6, -25.9], [32.5, -26]]],
};
const props = {
  user: { uid: "workspace-user" } as User, aoi: customAOI(geometry, "Área de teste", "draw"),
  onAOIChange: vi.fn(), onDraw: vi.fn(), onPreview: vi.fn(), onRaster: vi.fn(), onOpenTerrain: vi.fn(),
};
function subscription(allowed: boolean) {
  vi.mocked(useSubscription).mockReturnValue({
    loading: false, error: null, can: () => allowed,
  } as ReturnType<typeof useSubscription>);
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("shows the paid-plan requirement before issuing GEE requests", () => {
  subscription(false);
  render(<WorkspaceCopernicusPanel {...props} />);
  expect(screen.getByText(/Disponível para planos/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gerar GeoTIFF" })).toBeNull();
  expect(apiFetch).not.toHaveBeenCalled();
});

it("validates coverage before export and invalidates the estimate on a scale change", async () => {
  subscription(true);
  vi.mocked(apiFetch).mockResolvedValue(Response.json({
    geometry, areaKm2: 25, rows: 150, columns: 200, estimatedBytes: 120000, coverage: 0.98, coverageScale: 90,
  }));
  render(<WorkspaceCopernicusPanel {...props} />);
  const generate = screen.getByRole("button", { name: "Gerar GeoTIFF" });
  expect(generate).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Validar área e cobertura" }));
  expect(await screen.findByText("98.0%")).toBeInTheDocument();
  expect(props.onPreview).toHaveBeenCalledWith(geometry);
  expect(generate).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Escala (m)"), { target: { value: 60 } });
  expect(generate).toBeDisabled();
});

it("sends stable GAUL hierarchy rather than a country bounding-box polygon", async () => {
  subscription(true);
  vi.mocked(apiFetch).mockResolvedValue(Response.json({
    geometry, areaKm2: 25, rows: 150, columns: 200, estimatedBytes: 120000, coverage: 0.98, coverageScale: 90,
  }));
  const aoi = {
    source: "country" as const, countryCode: "MOZ", countryName: "Moçambique",
    boundarySource: "gaul2025" as const, adminLevel: 2 as const,
    admin1Code: 123, admin1Name: "Sofala", admin2Code: 456, admin2Name: "Maringué",
    province: null, district: null, geometry: null, label: "Maringué, Sofala",
  };
  render(<WorkspaceCopernicusPanel {...props} aoi={aoi} />);
  fireEvent.click(screen.getByRole("button", { name: "Validar área e cobertura" }));
  expect(await screen.findByText("98.0%")).toBeInTheDocument();
  const [, options] = vi.mocked(apiFetch).mock.calls[0];
  const body = JSON.parse(String(options?.body));
  expect(body).toMatchObject({
    boundarySource: "gaul2025", countryCode: "MOZ", adminLevel: 2,
    admin1Code: 123, admin2Code: 456, geometry: null, province: null, district: null,
  });
});
