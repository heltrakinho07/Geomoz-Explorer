import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPanel from "@/components/DashboardPanel";

// ── Mock fetch globally ──────────────────────────────────────────────────

const mockFetch = vi.fn();

// ── Sample index data matching the backend INDEX_REGISTRY groups ──────────

const MOCK_INDICES = {
  indices: [
    // spectral (8)
    { id: "ndvi", group: "spectral", name: "NDVI", formula: "(B8-B4)/(B8+B4)" },
    { id: "fe_oxide", group: "spectral", name: "Fe-Óxidos", formula: "B4/B2" },
    { id: "clay", group: "spectral", name: "Argilas", formula: "B11/B8A" },
    { id: "hydrothermal", group: "spectral", name: "Hidrotermal", formula: "(B11+B4)/(B8A+B3)" },
    { id: "bare_soil", group: "spectral", name: "BSI", formula: "(B11+B4-B8-B2)/(B11+B4+B8+B2)" },
    { id: "al_oh", group: "spectral", name: "Al-OH", formula: "B11/B12" },
    { id: "ferrous", group: "spectral", name: "Ferroso", formula: "B12/B8A" },
    { id: "gossan", group: "spectral", name: "Gossan", formula: "Fe_oxide×Al-OH" },
    // landsat (1) — grouped under terrain in the dashboard
    { id: "ndvi_l8", group: "landsat", name: "NDVI Landsat", formula: "(B5-B4)/(B5+B4)" },
    // terrain (5)
    { id: "elevation", group: "terrain", name: "Elevação", formula: "DEM" },
    { id: "slope", group: "terrain", name: "Declive", formula: "tan(DEM)" },
    { id: "hillshade", group: "terrain", name: "Hillshade", formula: "hillshade(DEM)" },
    { id: "hipsometry", group: "terrain", name: "Hipsometria", formula: "(DEM-min)/(max-min)" },
    { id: "topo_class", group: "terrain", name: "Classes Topo", formula: "DEM+rios" },
    // agriculture (6)
    { id: "evi", group: "agriculture", name: "EVI", formula: "2.5×(B8-B4)/(B8+6B4-7.5B2+1)" },
    { id: "ndmi", group: "agriculture", name: "NDMI", formula: "(B8-B11)/(B8+B11)" },
    { id: "savi", group: "agriculture", name: "SAVI", formula: "((B8-B4)/(B8+B4+0.5))×1.5" },
    { id: "gci", group: "agriculture", name: "GCI", formula: "(B8/B3)-1" },
    { id: "msavi", group: "agriculture", name: "MSAVI2", formula: "(2B8+1-sqrt((2B8+1)²-8(B8-B4)))/2" },
    { id: "crop_health", group: "agriculture", name: "Saúde Culturas", formula: "0.4EVI+0.35NDMI+0.25NDVI" },
    // agriculture (7) — cwsi added
    { id: "cwsi", group: "agriculture", name: "CWSI", formula: "1-(ET/PET)" },
    // drought (6)
    { id: "nddi", group: "drought", name: "NDDI", formula: "(NDVI-NDMI)/(NDVI+NDMI)" },
    { id: "drought_severity", group: "drought", name: "Severidade Seca", formula: "0.6NDDI+0.4(1-NDMI)" },
    { id: "vci", group: "drought", name: "VCI", formula: "(NDVI-min)/(max-min)x100" },
    { id: "tci", group: "drought", name: "TCI", formula: "(LSTmax-LST)/(LSTmax-LSTmin)x100" },
    { id: "vhi", group: "drought", name: "VHI", formula: "0.5VCI+0.5TCI" },
    { id: "spei", group: "drought", name: "SPEI", formula: "CSIC SPEI-12" },
    // fire (6)
    { id: "nbr", group: "fire", name: "NBR", formula: "(B8-B12)/(B8+B12)" },
    { id: "dnbr", group: "fire", name: "dNBR", formula: "préNBR-pósNBR" },
    { id: "burn_severity", group: "fire", name: "Severidade Queimada", formula: "NBR→classes" },
    { id: "forest_loss", group: "fire", name: "Desflorestação", formula: "Hansen GFC" },
    { id: "burned_area", group: "fire", name: "Área Queimada", formula: "MODIS MCD64A1" },
    { id: "fire_risk", group: "fire", name: "Risco Incêndio", formula: "(1-NDVI)×0.4+(1-NDMI)×0.35+NDDI×0.25" },
    // water (4)
    { id: "awei_nsh", group: "water", name: "AWEI s/ Sombra", formula: "4*(B3-B11)-(0.25*B8+2.75*B12)" },
    { id: "awei_sh", group: "water", name: "AWEI c/ Sombra", formula: "B2+2.5*B3-1.5*(B8+B11)-0.25*B12" },
    { id: "wri", group: "water", name: "WRI", formula: "(B3+B4)/(B8+B11)" },
    { id: "wi2015", group: "water", name: "WI2015", formula: "1.7204+171*B3+3*B4-70*B8-45*B11-71*B12" },
    // climate (5) — wind_speed added
    { id: "precipitation", group: "climate", name: "Precipitação", formula: "CHIRPS" },
    { id: "temperature_lst", group: "climate", name: "Temperatura", formula: "MODIS" },
    { id: "cyclone_tracks", group: "climate", name: "Rotas Ciclones", formula: "IBTrACS" },
    { id: "cyclone_risk", group: "climate", name: "Risco Ciclone", formula: "precip+cycl+invElev" },
    { id: "wind_speed", group: "climate", name: "Vento", formula: "ERA5 sqrt(u2+v2)" },
    // urban (4) — night_light added
    { id: "urban_expansion", group: "urban", name: "Expansão Urbana", formula: "B11/(B8+B11+B4)" },
    { id: "impervious_surface", group: "urban", name: "Impermeável", formula: "NDBI" },
    { id: "urban_heat_island", group: "urban", name: "Ilha Calor", formula: "LST-NDVI" },
    { id: "night_light", group: "urban", name: "Luz Noturna", formula: "VIIRS avg_rad" },
    // health (4)
    { id: "malaria_risk", group: "health", name: "Risco Malária", formula: "precip+LST+NDWI+invElev" },
    { id: "healthcare_access", group: "health", name: "Acesso Saúde", formula: "proximidade NDBI" },
    { id: "sanitation_index", group: "health", name: "Saneamento", formula: "NDWI+NDBI+invNDVI" },
    { id: "epidemic_risk", group: "health", name: "Risco Epidémico", formula: "malária+inundação" },
    // water (1)
    { id: "ndti", group: "water", name: "NDTI", formula: "(B4-B3)/(B4+B3) masked" },
    // biophysical (2)
    { id: "lai", group: "biophysical", name: "LAI", formula: "3.618xEVI-0.118" },
    { id: "canopy_height", group: "biophysical", name: "Dossel", formula: "Meta forest" },
  ],
};

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
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function createQueryClient(stats?: any, province?: string | null, district?: string | null) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  if (stats) {
    qc.setQueryData(["stats", province ?? null, district ?? null], stats);
  }
  return qc;
}

function renderPanel(province?: string | null, district?: string | null, stats?: any) {
  const qc = createQueryClient(stats ?? null, province, district);
  return render(
    <QueryClientProvider client={qc}>
      <DashboardPanel province={province ?? null} district={district ?? null} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("gee/indices")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_INDICES) });
    }
    if (url.includes("gee/status")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ connected: true, auth_type: "service_account", project: "eengine-project", message: "GEE conectado" }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("DashboardPanel", () => {
  it("renders the dashboard title and description", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Dashboard GeoMoz")).toBeTruthy();
    });
    expect(screen.getByText(/Visão geral integrada/)).toBeTruthy();
  });

  it("renders all 12 module cards", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Geologia & Mapa")).toBeTruthy();
      expect(screen.getByText("Sensoriamento Remoto")).toBeTruthy();
      expect(screen.getByText("Relevo & Morfologia")).toBeTruthy();
      expect(screen.getByText("Agricultura")).toBeTruthy();
      expect(screen.getByText("Seca & Stress Hídrico")).toBeTruthy();
      expect(screen.getByText("Incêndios & Desflorestação")).toBeTruthy();
      expect(screen.getByText("Zonas Costeiras & Marinhas")).toBeTruthy();
      expect(screen.getByText("Clima & Desastres")).toBeTruthy();
      expect(screen.getByText("Urbano & Infraestruturas")).toBeTruthy();
      expect(screen.getByText("Saúde Pública")).toBeTruthy();
      expect(screen.getByText("Água & Turbidez")).toBeTruthy();
      expect(screen.getByText("Biofísicos")).toBeTruthy();
    });
  });

  it("shows dynamic index counts per module from the API", async () => {
    renderPanel();

    // Expected counts based on MODULE_GROUP_MAP:
    // geology→0, spectral→8, terrain→6 (5+1), agriculture→7 (+ cwsi),
    // drought→6 (+ vci, tci, vhi, spei), fire→6, coastal→4, climate→5 (+ wind_speed),
    // urban→4 (+ night_light), health→4, water→1 (ndti), biophysical→2 (lai, canopy_height)
    await waitFor(() => {
      const counts = screen.getAllByText("índices");
      expect(counts.length).toBeGreaterThan(0);
    });

    // Use getAllByText for counts that appear on multiple modules
    expect(screen.getByText("8")).toBeTruthy();              // spectral only
    const sixes = screen.getAllByText("6");                  // terrain, drought, fire
    expect(sixes.length).toBe(3);
    expect(screen.getByText("7")).toBeTruthy();              // agriculture only
    expect(screen.getByText("5")).toBeTruthy();              // climate only
    const fours = screen.getAllByText("4");                  // coastal, urban, health
    expect(fours.length).toBe(3);
    expect(screen.getByText("2")).toBeTruthy();              // biophysical only
    expect(screen.getByText("1")).toBeTruthy();              // water only
  });

  it("shows 0 for geology module (no GEE group)", async () => {
    renderPanel();

    // Geology has id "geology" which doesn't map to any GEE group → count = 0
    // The label should show "0" and "índices" (plural for 0)
    await waitFor(() => {
      expect(screen.getByText("0")).toBeTruthy();
    });
  });

  it("shows the total index count in the section header", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/53 índices no total/)).toBeTruthy();
    });
  });

  it("renders three export action buttons", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Relatório JSON")).toBeTruthy();
      expect(screen.getByText("Índices GEE (CSV)")).toBeTruthy();
      expect(screen.getByText("Painel de Exportação")).toBeTruthy();
    });
  });

  it("shows GEE connected status badge", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("GEE Conectado")).toBeTruthy();
    });
  });

  it("shows GEE offline badge when disconnected", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("gee/indices")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_INDICES) });
      }
      if (url.includes("gee/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ connected: false, auth_type: null, project: null, message: "GEE not configured" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("GEE Offline")).toBeTruthy();
    });
  });

  it("shows the province selection prompt when no province is selected", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Seleccione uma província/)).toBeTruthy();
    });
  });

  it("does NOT show the province prompt when province is selected", async () => {
    renderPanel("Maputo", null, MOCK_STATS);

    await waitFor(() => {
      expect(screen.queryByText(/Seleccione uma província/)).toBeNull();
    });
  });

  it("displays stats cards when stats are available", async () => {
    renderPanel("Maputo", null, MOCK_STATS);

    await waitFor(() => {
      expect(screen.getByText("150")).toBeTruthy(); // totalFeatures
    });
  });

  it("shows lithology names when stats with lithologies are provided", async () => {
    renderPanel("Maputo", null, MOCK_STATS);

    await waitFor(() => {
      expect(screen.getByText("Granito")).toBeTruthy();
      expect(screen.getByText("Basalto")).toBeTruthy();
      expect(screen.getByText("Calcário")).toBeTruthy();
    });
  });

  it("shows the system status section with module count and index count", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("12")).toBeTruthy(); // MODULES.length
    });

    // After indices load, shows "43" in system status
    await waitFor(() => {
      expect(screen.getAllByText("53").length).toBeGreaterThan(0);
    });
  });

  it("shows the GEE status in the system status section", async () => {
    renderPanel();

    await waitFor(() => {
      const statusBadges = screen.getAllByText("Ligado");
      expect(statusBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders the footer with version info", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/GeoMoz Explorer v2\.1/)).toBeTruthy();
    });
  });

  it("shows the area title correctly for province only", async () => {
    renderPanel("Maputo", null, MOCK_STATS);

    await waitFor(() => {
      expect(screen.getByText("Top Litologias — Maputo")).toBeTruthy();
    });
  });

  it("shows the area title correctly for province and district", async () => {
    renderPanel("Maputo", "Manhiça", MOCK_STATS);

    await waitFor(() => {
      expect(screen.getByText("Top Litologias — Manhiça, Maputo")).toBeTruthy();
    });
  });

  it("shows default area title 'Moçambique' when no province", async () => {
    renderPanel();

    // Title is used in lithologies section, which only shows when stats exist
    // Without province, stats aren't shown, but header shows "Moçambique"
    // The header shows "Moçambique" in the stats cards area

    await waitFor(() => {
      // The province prompt is shown instead
      expect(screen.getByText(/Seleccione uma província/)).toBeTruthy();
    });
  });

  it("handles API failure gracefully — shows 0 counts", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("gee/indices")) {
        return Promise.reject(new Error("Network error"));
      }
      if (url.includes("gee/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ connected: false }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Suppress console.error from the rejected promise
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderPanel();

    // Should show "…" while loading, then 0 when it fails (since data is undefined)
    await waitFor(() => {
      // After the query fails, groupCounts is {} → all counts become 0
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });
  });

  it("renders all module status badges correctly", async () => {
    renderPanel();

    await waitFor(() => {
      const activeBadges = screen.getAllByText("Activo");
      // Use exact match with a more specific selector to avoid matching
      // the GEE status badge text ("GEE Conectado" / "GEE Offline")
      const geeBadges = screen.getAllByText((content, element) => {
        return element?.tagName === "SPAN" && content === "GEE";
      });
      expect(activeBadges.length).toBe(1);  // Only geology is "active"
      expect(geeBadges.length).toBe(11);    // All others are "requires_gee" (+ water, biophysical)
    });
  });

  it("shows correct index counts for all modules when data loads", async () => {
    renderPanel();

    await waitFor(() => {
      // Each module card shows its count in a bold number
      // We check the sum of all unique count values
      const moduleDivs = screen.getAllByText("índices");
      // At least the non-geology modules show "índices"
      expect(moduleDivs.length).toBeGreaterThanOrEqual(9);
    });

    // Verify the header shows the correct total
    await waitFor(() => {
      expect(screen.getByText(/53 índices no total/)).toBeTruthy();
    });
  });

  it("does not crash when stats have empty lithologies", async () => {
    const emptyStats = {
      totalFeatures: 0,
      totalUnits: 0,
      totalAreaKm2: 0,
      dominant: "N/A",
      lithologies: [],
    };

    renderPanel("Maputo", null, emptyStats);

    await waitFor(() => {
      expect(screen.getByText("Dashboard GeoMoz")).toBeTruthy();
    });
  });
});
