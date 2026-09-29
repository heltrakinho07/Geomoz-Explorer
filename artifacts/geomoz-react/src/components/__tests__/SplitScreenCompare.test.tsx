import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SplitScreenCompare, { DEFAULT_COMPARE_PRESETS } from "../SplitScreenCompare";

describe("SplitScreenCompare", () => {
  it("renders with left and right selectors and Cenários toggle button", () => {
    const onSplitChange = vi.fn();
    const onLeftChange = vi.fn();
    const onRightChange = vi.fn();
    const onClose = vi.fn();

    render(
      <SplitScreenCompare
        splitPercent={50}
        onSplitChange={onSplitChange}
        leftValue="2018"
        rightValue="2024"
        onLeftChange={onLeftChange}
        onRightChange={onRightChange}
        onClose={onClose}
      />
    );

    expect(screen.getAllByText(/Antes/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Depois/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Cenários/i)).toBeDefined();
  });

  it("handles opening Cenários menu and clicking a comparison preset", () => {
    const onSplitChange = vi.fn();
    const onLeftChange = vi.fn();
    const onRightChange = vi.fn();

    render(
      <SplitScreenCompare
        splitPercent={50}
        onSplitChange={onSplitChange}
        leftValue="2016"
        rightValue="2024"
        onLeftChange={onLeftChange}
        onRightChange={onRightChange}
        presets={DEFAULT_COMPARE_PRESETS}
      />
    );

    // Open Cenários dropdown
    const cenarioBtn = screen.getByTitle("Cenários de Comparação Pré-definidos");
    fireEvent.click(cenarioBtn);

    const idaiPreset = screen.getByText("Ciclone Idai (Beira)");
    expect(idaiPreset).toBeDefined();
    fireEvent.click(idaiPreset);

    expect(onLeftChange).toHaveBeenCalledWith("2018");
    expect(onRightChange).toHaveBeenCalledWith("2019");
  });

  it("allows selecting left and right years via select dropdowns", () => {
    const onLeftChange = vi.fn();
    const onRightChange = vi.fn();

    render(
      <SplitScreenCompare
        splitPercent={50}
        onSplitChange={vi.fn()}
        leftValue="2018"
        rightValue="2024"
        onLeftChange={onLeftChange}
        onRightChange={onRightChange}
      />
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selects[0], { target: { value: "2017" } });
    expect(onLeftChange).toHaveBeenCalledWith("2017");

    fireEvent.change(selects[1], { target: { value: "2023" } });
    expect(onRightChange).toHaveBeenCalledWith("2023");
  });

  it("calls onSplitChange(50) when center reset button is clicked", () => {
    const onSplitChange = vi.fn();

    render(
      <SplitScreenCompare
        splitPercent={70}
        onSplitChange={onSplitChange}
        leftValue="2018"
        rightValue="2024"
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
      />
    );

    const centerBtn = screen.getByTitle("Centrar Divisor (50%)");
    fireEvent.click(centerBtn);
    expect(onSplitChange).toHaveBeenCalledWith(50);
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();

    render(
      <SplitScreenCompare
        splitPercent={50}
        onSplitChange={vi.fn()}
        leftValue="2018"
        rightValue="2024"
        onLeftChange={vi.fn()}
        onRightChange={vi.fn()}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByTitle("Sair do Modo Comparação");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
