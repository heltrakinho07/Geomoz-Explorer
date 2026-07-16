/**
 * RasterVisPanel tests — verifies rendering, mode switching, band selection,
 * range inputs, stretch, opacity/gamma sliders, and Apply/Import/Close callbacks.
 *
 * Uses @testing-library/react — no QueryClient needed because this is a
 * pure UI component that doesn't use react-query.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RasterVisPanel from "@/components/RasterVisPanel";
import type { RasterVisParams } from "@/components/RasterVisPanel";

// ── Default test params ───────────────────────────────────────────────────

const DEFAULT_PARAMS: RasterVisParams = {
  mode: "grayscale",
  bands: ["B4"],
  min: 0,
  max: 1,
  stretch: 0.98,
  opacity: 1.0,
  gamma: 1.0,
};

const AVAILABLE_BANDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"];

// ── Helpers ───────────────────────────────────────────────────────────────

function renderPanel(
  overrides: {
    open?: boolean;
    onClose?: () => void;
    availableBands?: string[];
    currentParams?: RasterVisParams;
    onApply?: (params: RasterVisParams) => void;
    onImport?: (params: RasterVisParams) => void;
    applying?: boolean;
  } = {},
) {
  const {
    open = true,
    onClose = vi.fn(),
    availableBands = AVAILABLE_BANDS,
    currentParams = DEFAULT_PARAMS,
    onApply = vi.fn(),
    onImport = vi.fn(),
    applying = false,
  } = overrides;

  return {
    onClose,
    onApply,
    onImport,
    ...render(
      <RasterVisPanel
        open={open}
        onClose={onClose}
        availableBands={availableBands}
        currentParams={currentParams}
        onApply={onApply}
        onImport={onImport}
        applying={applying}
      />,
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("RasterVisPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic rendering ──────────────────────────────────────────────────

  it("returns null when closed", () => {
    const { container } = renderPanel({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders the panel title when open", () => {
    renderPanel();
    expect(screen.getByText("Visualização")).toBeTruthy();
  });

  it("renders all control sections", () => {
    renderPanel();

    // Mode section
    expect(screen.getByText("Modo")).toBeTruthy();
    expect(screen.getByText("1 Band (Grayscale)")).toBeTruthy();
    expect(screen.getByText("3 Bands (RGB)")).toBeTruthy();

    // Band selection
    expect(screen.getByText("Bandas")).toBeTruthy();

    // Range
    expect(screen.getByText("Range (Min–Max)")).toBeTruthy();

    // Stretch
    expect(screen.getByText("Stretch")).toBeTruthy();

    // Opacity
    expect(screen.getByText("Opacidade")).toBeTruthy();

    // Gamma
    expect(screen.getByText("Gamma")).toBeTruthy();

    // Action buttons
    expect(screen.getByText("Apply")).toBeTruthy();
    expect(screen.getByText("Import")).toBeTruthy();
    expect(screen.getByText("Close")).toBeTruthy();
  });

  // ── Mode switching ───────────────────────────────────────────────────

  it("shows a single band selector in grayscale mode", () => {
    renderPanel();
    // In grayscale mode, there's one BandSelect labeled "Banda"
    const selects = screen.getAllByRole("combobox");
    // One band select + one stretch select = 2 selects in grayscale
    expect(selects.length).toBe(2);
  });

  it("shows three band selectors (R, G, B) in RGB mode", () => {
    renderPanel();

    // Click "3 Bands (RGB)" button
    const rgbButton = screen.getByText("3 Bands (RGB)");
    fireEvent.click(rgbButton);

    const selects = screen.getAllByRole("combobox");
    // After switching to RGB: 3 band selects + 1 stretch select = 4 selects
    expect(selects.length).toBe(4);

    // Should show R, G, B labels
    expect(screen.getByText("R")).toBeTruthy();
    expect(screen.getByText("G")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("toggles back to grayscale from RGB", () => {
    renderPanel();

    // Switch to RGB first
    fireEvent.click(screen.getByText("3 Bands (RGB)"));
    expect(screen.getAllByRole("combobox").length).toBe(4);

    // Switch back to grayscale
    fireEvent.click(screen.getByText("1 Band (Grayscale)"));
    expect(screen.getAllByRole("combobox").length).toBe(2);
  });

  // ── Band selection ───────────────────────────────────────────────────

  it("shows available bands in the dropdown", () => {
    renderPanel();

    const bandSelect = screen.getAllByRole("combobox")[0];
    const options = Array.from(bandSelect.querySelectorAll("option"));

    // Should have the placeholder "—" plus all available bands
    expect(options.length).toBe(AVAILABLE_BANDS.length + 1);
    expect(options[1]?.textContent).toBe("B1");
    expect(options[options.length - 1]?.textContent).toBe("B8");
  });

  it("allows selecting a different band in grayscale mode", async () => {
    const user = userEvent.setup();
    renderPanel();

    const bandSelect = screen.getAllByRole("combobox")[0];
    await user.selectOptions(bandSelect, "B8");

    expect((bandSelect as HTMLSelectElement).value).toBe("B8");
  });

  // ── Range inputs ─────────────────────────────────────────────────────

  it("renders Min and Max inputs with correct values", () => {
    renderPanel({ currentParams: { ...DEFAULT_PARAMS, min: -0.5, max: 1.5 } });

    const minInput = screen.getByDisplayValue("-0.5");
    const maxInput = screen.getByDisplayValue("1.5");

    expect(minInput).toBeTruthy();
    expect(maxInput).toBeTruthy();
  });

  it("updates min value when changed", () => {
    renderPanel();

    // There are two number inputs: min and max. Get min as the first one.
    const numberInputs = screen.getAllByRole("spinbutton");
    const minInput = numberInputs[0];
    fireEvent.change(minInput, { target: { value: "-1" } });

    expect((minInput as HTMLInputElement).value).toBe("-1");
  });

  // ── Stretch ──────────────────────────────────────────────────────────

  it("renders stretch dropdown with all options", () => {
    renderPanel();

    // The last combobox is the stretch select
    const selects = screen.getAllByRole("combobox");
    const stretchSelect = selects[selects.length - 1];
    const options = Array.from(stretchSelect.querySelectorAll("option"));

    expect(options.length).toBe(5); // 90%, 95%, 98%, 99%, 100%
    expect(options[0]?.textContent).toBe("90%");
    expect(options[4]?.textContent).toBe("100% (sem corte)");
  });

  it("changes stretch value when a different option is selected", () => {
    renderPanel();

    const selects = screen.getAllByRole("combobox");
    const stretchSelect = selects[selects.length - 1];
    // The select elements have numeric values rendered as strings; "0.9" matches value={0.90}
    fireEvent.change(stretchSelect, { target: { value: "0.95" } });

    expect((stretchSelect as HTMLSelectElement).value).toBe("0.95");
  });

  // ── Opacity slider ──────────────────────────────────────────────────

  it("renders opacity slider with correct value", () => {
    renderPanel({ currentParams: { ...DEFAULT_PARAMS, opacity: 0.75 } });

    const opacitySlider = screen.getByDisplayValue("0.75");
    expect(opacitySlider).toBeTruthy();
    expect((opacitySlider as HTMLInputElement).type).toBe("range");
  });

  it("changes opacity when slider is moved", () => {
    renderPanel();

    // Use getAllByRole to find the first range slider (opacity)
    const rangeSliders = screen.getAllByRole("slider");
    const opacitySlider = rangeSliders[0];
    expect(opacitySlider).toBeTruthy();
    fireEvent.change(opacitySlider, { target: { value: "0.5" } });

    expect((opacitySlider as HTMLInputElement).value).toBe("0.5");
  });

  // ── Gamma slider ────────────────────────────────────────────────────

  it("renders gamma slider with correct value", () => {
    renderPanel({ currentParams: { ...DEFAULT_PARAMS, gamma: 1.5 } });

    const gammaSlider = screen.getByDisplayValue("1.5");
    expect(gammaSlider).toBeTruthy();
    expect((gammaSlider as HTMLInputElement).type).toBe("range");
  });

  // ── Apply callback ──────────────────────────────────────────────────

  it("calls onApply with correct params when Apply is clicked", () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0] as RasterVisParams;
    expect(result.mode).toBe("grayscale");
    expect(result.bands).toEqual(["B4"]);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
    expect(result.stretch).toBe(0.98);
    expect(result.opacity).toBe(1.0);
    expect(result.gamma).toBe(1.0);
  });

  it("passes updated values when Apply is clicked after changes", () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    // Change opacity — use getAllByRole to find the first range slider
    const rangeSliders = screen.getAllByRole("slider");
    const opacitySlider = rangeSliders[0];
    fireEvent.change(opacitySlider, { target: { value: "0.33" } });

    // Change gamma — second range slider
    const gammaSlider = rangeSliders[1];
    fireEvent.change(gammaSlider, { target: { value: "2" } });

    // Click Apply
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0] as RasterVisParams;
    expect(result.opacity).toBe(0.33);
    expect(result.gamma).toBe(2);
  });

  it("clamps values when Apply is clicked", () => {
    const onApply = vi.fn();
    renderPanel({ onApply, currentParams: { ...DEFAULT_PARAMS, opacity: -0.5, gamma: -1 } });

    // Wait for sync effect
    // Click Apply
    fireEvent.click(screen.getByText("Apply"));

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0] as RasterVisParams;
    expect(result.opacity).toBe(0); // Clamped to 0
    expect(result.gamma).toBe(0.1); // Clamped to 0.1
  });

  it("sends single band array in grayscale mode", () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByText("Apply"));

    const result = onApply.mock.calls[0][0] as RasterVisParams;
    expect(result.bands.length).toBe(1);
    expect(result.bands[0]).toBe("B4");
  });

  it("sends three bands in RGB mode", () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    // Switch to RGB
    fireEvent.click(screen.getByText("3 Bands (RGB)"));

    // Click Apply
    fireEvent.click(screen.getByText("Apply"));

    const result = onApply.mock.calls[0][0] as RasterVisParams;
    expect(result.mode).toBe("rgb");
    expect(result.bands.length).toBe(3);
  });

  // ── Applying state ──────────────────────────────────────────────────

  it("shows loading state when applying is true", () => {
    renderPanel({ applying: true });

    expect(screen.getByText("A aplicar…")).toBeTruthy();
    // Apply button should be disabled
    const applyBtn = screen.getByText("A aplicar…").closest("button");
    expect(applyBtn?.disabled).toBe(true);
  });

  it("disables Import button when applying", () => {
    renderPanel({ applying: true });

    const importBtn = screen.getByText("Import").closest("button");
    expect(importBtn?.disabled).toBe(true);
  });

  // ── Close callback ──────────────────────────────────────────────────

  it("calls onClose when Close button is clicked", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    // X button has title "Fechar"
    const closeBtn = screen.getByTitle("Fechar");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Import callback ─────────────────────────────────────────────────

  it("calls onImport when Import button is clicked", () => {
    const onImport = vi.fn();
    renderPanel({ onImport });

    fireEvent.click(screen.getByText("Import"));

    expect(onImport).toHaveBeenCalledTimes(1);
    const result = onImport.mock.calls[0][0] as RasterVisParams;
    expect(result.mode).toBe("grayscale");
  });

  it("does not call onImport if no handler is provided", () => {
    renderPanel({ onImport: undefined });

    // Should not throw
    fireEvent.click(screen.getByText("Import"));
  });

  // ── Sync from currentParams ─────────────────────────────────────────

  it("syncs internal state when currentParams change", () => {
    const { rerender } = render(
      <RasterVisPanel
        open={true}
        onClose={vi.fn()}
        availableBands={AVAILABLE_BANDS}
        currentParams={DEFAULT_PARAMS}
        onApply={vi.fn()}
      />,
    );

    const newParams: RasterVisParams = {
      ...DEFAULT_PARAMS,
      min: -0.5,
      max: 2.0,
      opacity: 0.5,
      gamma: 2.5,
    };

    rerender(
      <RasterVisPanel
        open={true}
        onClose={vi.fn()}
        availableBands={AVAILABLE_BANDS}
        currentParams={newParams}
        onApply={vi.fn()}
      />,
    );

    // After sync, the display values should update
    const minInput = screen.getByDisplayValue("-0.5");
    const maxInput = screen.getByDisplayValue("2");
    expect(minInput).toBeTruthy();
    expect(maxInput).toBeTruthy();
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it("handles empty available bands gracefully", () => {
    renderPanel({ availableBands: [] });

    const bandSelect = screen.getAllByRole("combobox")[0];
    const options = Array.from(bandSelect.querySelectorAll("option"));
    // Only the placeholder "—" should exist
    expect(options.length).toBe(1);
    expect(options[0]?.textContent).toBe("—");
  });

  it("uses defaults for missing bands in RGB mode", () => {
    renderPanel({ currentParams: { ...DEFAULT_PARAMS, bands: [] } });

    // Switch to RGB mode
    fireEvent.click(screen.getByText("3 Bands (RGB)"));

    // All three band selects should show empty values
    const selects = screen.getAllByRole("combobox");
    // The first 3 comboboxes should be the band selects
    for (let i = 0; i < 3 && i < selects.length; i++) {
      expect((selects[i] as HTMLSelectElement).value).toBe("");
    }
  });
});
