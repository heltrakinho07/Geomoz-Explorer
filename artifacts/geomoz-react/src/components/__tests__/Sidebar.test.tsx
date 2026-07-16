import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import type { LayerState } from "@/components/Sidebar";

// ── Mock custom hooks ─────────────────────────────────────────────────────

const mockUseProvinceNames = vi.fn();
const mockUseDistrictNames = vi.fn();

vi.mock("@/hooks/useGeoMoz", () => ({
  useProvinceNames: (...args: any[]) => mockUseProvinceNames(...args),
  useDistrictNames: (...args: any[]) => mockUseDistrictNames(...args),
}));

const PROVINCE_NAMES = { names: ["Maputo", "Gaza", "Inhambane", "Sofala", "Nampula"], column: "Provincia" };
const DISTRICT_NAMES = { names: ["Manhiça", "Marracuene", "Matola", "Boane"], column: "Distrito" };

const LAYERS: LayerState = { provinces: true, districts: false, geology: true };

const PROPS = {
  province: null as string | null,
  district: null as string | null,
  onProvinceChange: vi.fn(),
  onDistrictChange: vi.fn(),
  layers: LAYERS,
  onLayerToggle: vi.fn(),
  colorBy: "code2006",
  onColorByChange: vi.fn(),
};

function renderSidebar(props?: Partial<typeof PROPS>) {
  const merged = { ...PROPS, ...props };
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Sidebar {...merged} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockUseProvinceNames.mockReset();
  mockUseDistrictNames.mockReset();
  Object.assign(PROPS, {
    province: null,
    district: null,
    onProvinceChange: vi.fn(),
    onDistrictChange: vi.fn(),
    onLayerToggle: vi.fn(),
    onColorByChange: vi.fn(),
    layers: LAYERS,
    colorBy: "code2006",
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Sidebar", () => {
  it("renders the filter area title", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    expect(screen.getByText("Filtrar Área")).toBeTruthy();
  });

  it("renders province selector with options", async () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText("Maputo")).toBeTruthy();
      expect(screen.getByText("Gaza")).toBeTruthy();
      expect(screen.getByText("Nampula")).toBeTruthy();
    });
  });

  it("renders district selector disabled when no province selected", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    // District selector shows placeholder when no province
    expect(screen.getByText("Selecione a Província")).toBeTruthy();
  });

  it("renders district selector enabled when province is selected", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ province: "Maputo" });

    expect(screen.getByText("Todos os Distritos")).toBeTruthy();
    expect(screen.getByText("Manhiça")).toBeTruthy();
  });

  it("calls onProvinceChange when province is selected", () => {
    const onProvinceChange = vi.fn();
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    const { container } = renderSidebar({ onProvinceChange });

    const selects = container.querySelectorAll("select");
    expect(selects.length).toBe(2);

    // First select is province, change to "Gaza"
    fireEvent.change(selects[0], { target: { value: "Gaza" } });
    expect(onProvinceChange).toHaveBeenCalledWith("Gaza");
  });

  it("calls onDistrictChange when district is selected", () => {
    const onDistrictChange = vi.fn();
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    const { container } = renderSidebar({ province: "Maputo", onDistrictChange });

    const selects = container.querySelectorAll("select");
    // Second select is district
    fireEvent.change(selects[1], { target: { value: "Manhiça" } });
    expect(onDistrictChange).toHaveBeenCalledWith("Manhiça");
  });

  it("renders layer toggles", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    expect(screen.getByText("Camadas")).toBeTruthy();
    expect(screen.getByText("Litologia/Geologia")).toBeTruthy();
    expect(screen.getByText("Províncias")).toBeTruthy();
    expect(screen.getByText("Distritos")).toBeTruthy();
  });

  it("calls onLayerToggle when a layer switch is clicked", () => {
    const onLayerToggle = vi.fn();
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ onLayerToggle });

    // Find all switch buttons (they are rendered by the Switch component)
    const switches = document.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(3);

    // Click the second switch (districts)
    fireEvent.click(switches[1]);
    expect(onLayerToggle).toHaveBeenCalledWith("provinces");
  });

  it("renders color by radio options", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    expect(screen.getByText("Colorir Por")).toBeTruthy();
    expect(screen.getByText("code2006")).toBeTruthy();
    expect(screen.getByText("Legend")).toBeTruthy();
    expect(screen.getByText("ERA")).toBeTruthy();
    expect(screen.getByText("PERIOD")).toBeTruthy();
  });

  it("highlights the active color option", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ colorBy: "ERA" });

    // The selected option should have a visible indicator
    // ERA should be active (checked)
    const radioInputs = document.querySelectorAll('input[type="radio"]');
    expect((radioInputs[2] as HTMLInputElement).checked).toBe(true); // ERA is 3rd option (index 2)
  });

  it("calls onColorByChange when a color option is clicked", () => {
    const onColorByChange = vi.fn();
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ onColorByChange });

    const radioInputs = document.querySelectorAll('input[type="radio"]');
    fireEvent.click(radioInputs[2]); // ERA
    expect(onColorByChange).toHaveBeenCalledWith("ERA");
  });

  it("shows active selection banner when province is selected", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ province: "Maputo" });

    expect(screen.getByText("Limpar")).toBeTruthy();
    // "Maputo" appears in the banner AND in the select options
    const maputos = screen.getAllByText("Maputo");
    expect(maputos.length).toBeGreaterThan(0);
  });

  it("shows province+district in selection banner", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ province: "Maputo", district: "Manhiça" });

    expect(screen.getByText("Manhiça, Maputo")).toBeTruthy();
  });

  it("calls clear handler when clear button is clicked", () => {
    const onProvinceChange = vi.fn();
    const onDistrictChange = vi.fn();
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ province: "Maputo", district: "Manhiça", onProvinceChange, onDistrictChange });

    const clearBtn = screen.getByText("Limpar");
    fireEvent.click(clearBtn);
    expect(onProvinceChange).toHaveBeenCalledWith(null);
    expect(onDistrictChange).toHaveBeenCalledWith(null);
  });

  it("shows 'Ver toda a província' when district is selected", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar({ province: "Maputo", district: "Manhiça" });

    expect(screen.getByText("Ver toda a província")).toBeTruthy();
  });

  it("renders the footer with data source info", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    renderSidebar();

    expect(screen.getByText(/geomoz library/)).toBeTruthy();
    expect(screen.getByText(/EPSG:32736/)).toBeTruthy();
  });

  it("shows loading state in province selector", () => {
    mockUseProvinceNames.mockReturnValue({ data: undefined, isLoading: true });
    mockUseDistrictNames.mockReturnValue({ data: DISTRICT_NAMES, isLoading: false });

    const { container } = renderSidebar();

    const selects = container.querySelectorAll("select");
    expect((selects[0] as HTMLSelectElement).disabled).toBe(true);
  });

  it("shows correct default option text", () => {
    mockUseProvinceNames.mockReturnValue({ data: PROVINCE_NAMES, isLoading: false });
    mockUseDistrictNames.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = renderSidebar();

    // The first <option> in province select is "Todas as Províncias"
    const selects = container.querySelectorAll("select");
    const firstOption = selects[0].querySelector("option");
    expect(firstOption?.textContent).toBe("Todas as Províncias");
  });
});
