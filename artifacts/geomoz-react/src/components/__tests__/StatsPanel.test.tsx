import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StatsPanel from "@/components/StatsPanel";

// ── Mock custom hooks ─────────────────────────────────────────────────────

const mockUseStats = vi.fn();
const mockUseGeologyColors = vi.fn();

vi.mock("@/hooks/useGeoMoz", () => ({
  useStats: (...args: any[]) => mockUseStats(...args),
  useGeologyColors: (...args: any[]) => mockUseGeologyColors(...args),
}));

const MOCK_STATS = {
  totalFeatures: 150,
  totalUnits: 12,
  totalAreaKm2: 75_000,
  dominant: "Granito",
  lithologies: [
    { name: "Granito", areaKm2: 30_000, percent: 40, color: "#ff0000" },
    { name: "Basalto", areaKm2: 20_000, percent: 26.7, color: "#333333" },
    { name: "Calcário", areaKm2: 15_000, percent: 20, color: "#cccccc" },
    { name: "Arenito", areaKm2: 10_000, percent: 13.3, color: "#ddbb99" },
    { name: "Mármore", areaKm2: 5_000, percent: 6.7, color: "#ffffff" },
    { name: "Quartzito", areaKm2: 3_000, percent: 4, color: "#aaaaff" },
    { name: "Xisto", areaKm2: 2_000, percent: 2.7, color: "#556677" },
    { name: "Dolomito", areaKm2: 1_500, percent: 2, color: "#99aacc" },
  ],
};

const MOCK_COLORS = {
  column: "code2006",
  items: [
    { value: "Granito", color: "#ff0000" },
    { value: "Basalto", color: "#333333" },
    { value: "Calcário", color: "#cccccc" },
  ],
};

function renderPanel(
  province: string | null = null,
  district: string | null = null,
  colorBy = "code2006",
  isExpanded = false,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <StatsPanel
        province={province}
        district={district}
        colorBy={colorBy}
        isExpanded={isExpanded}
        onToggleExpand={vi.fn()}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseStats.mockReset();
  mockUseGeologyColors.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("StatsPanel", () => {
  it("shows province prompt when no province is selected", () => {
    mockUseStats.mockReturnValue({ data: undefined, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: undefined });

    renderPanel();

    // The prompt appears in the stats cards area
    expect(screen.getByText(/ver as métricas de geologia/)).toBeTruthy();
  });

  it("shows loading spinner when data is loading", () => {
    mockUseStats.mockReturnValue({ data: undefined, isLoading: true });
    mockUseGeologyColors.mockReturnValue({ data: undefined, isLoading: true });

    renderPanel("Maputo");

    // The loader component renders with class animate-spin
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  it("renders stats cards when data is available", async () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    await waitFor(() => {
      expect(screen.getByText("150")).toBeTruthy(); // totalFeatures
      expect(screen.getByText("12")).toBeTruthy();  // totalUnits
      const granitos = screen.getAllByText("Granito"); // dominant + lithology
      expect(granitos.length).toBeGreaterThan(0);
    });
  });

  it("rendes the area title", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    expect(screen.getByText("Maputo")).toBeTruthy();
  });

  it("shows province+district title", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo", "Manhiça");

    // StatsPanel uses `district ?? province ?? "Moçambique"` so just "Manhiça"
    expect(screen.getByText("Manhiça")).toBeTruthy();
  });

  it("shows coverage percentage", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    // 75000 / 801590 * 100 ≈ 9.4%
    expect(screen.getByText("9.4%")).toBeTruthy();
  });

  it("renders lithology bars with names and percentages", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    // Use getAllByText for names that appear multiple times
    const granitos = screen.getAllByText("Granito");
    expect(granitos.length).toBeGreaterThan(0);
    const pcts = screen.getAllByText("40%");  // bar + table columns
    expect(pcts.length).toBeGreaterThan(0);
    const basaltos = screen.getAllByText("Basalto");  // bar + table
    expect(basaltos.length).toBeGreaterThan(0);
    const vinteSetes = screen.getAllByText("26.7%");  // bar + table
    expect(vinteSetes.length).toBeGreaterThan(0);
  });

  it("renders the detailed analysis table", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    expect(screen.getByText("Análise Detalhada")).toBeTruthy();
    expect(screen.getByText("km²")).toBeTruthy();
  });

  it("renders export CSV button and it is enabled with data", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    const btn = screen.getByText("Exportar CSV");
    expect(btn).toBeTruthy();
    expect(btn.closest("button")).not.toBeDisabled();
  });

  it("export CSV button is disabled without province", () => {
    mockUseStats.mockReturnValue({ data: undefined, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: undefined });

    renderPanel();

    const btn = screen.getByText("Exportar CSV");
    expect(btn.closest("button")).toBeDisabled();
  });

  it("shows the legend section with colors", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    // The legend heading contains "Legenda — code2006"
    expect(screen.getByText(/Legenda/)).toBeTruthy();
    expect(screen.getByText(/Legenda — code2006/)).toBeTruthy();
  });

  it("renders extra metrics row (coverage, avg area, polygons/unit)", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    expect(screen.getByText("Cobertura MZ")).toBeTruthy();
    expect(screen.getByText("Área/unidade")).toBeTruthy();
    expect(screen.getByText("Polígonos/unidade")).toBeTruthy();
  });

  it("shows top lithologies header with total count", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    expect(screen.getByText(/8 total/)).toBeTruthy(); // 8 lithologies
  });

  it("calls onToggleExpand when expand button is clicked", async () => {
    const onToggle = vi.fn();
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <StatsPanel province="Maputo" district={null} colorBy="code2006" isExpanded={false} onToggleExpand={onToggle} />
      </QueryClientProvider>
    );

    const toggleBtn = document.querySelector("button[title]");
    expect(toggleBtn).toBeTruthy();
    if (toggleBtn) fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when stats have no lithologies", () => {
    mockUseStats.mockReturnValue({
      data: { totalFeatures: 0, totalUnits: 0, totalAreaKm2: 0, dominant: "N/A", lithologies: [] },
      isLoading: false,
    });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo");

    expect(screen.getByText("N/A")).toBeTruthy();
    expect(screen.getByText("Sem dados")).toBeTruthy();
  });

  it("shows full screen when expanded", () => {
    mockUseStats.mockReturnValue({ data: MOCK_STATS, isLoading: false });
    mockUseGeologyColors.mockReturnValue({ data: MOCK_COLORS });

    renderPanel("Maputo", null, "code2006", true);

    // Expanded mode shows legend side-by-side
    const legend = screen.getByText(/Legenda/);
    expect(legend).toBeTruthy();
  });
});
