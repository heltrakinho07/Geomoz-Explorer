import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TimeLapsePlayer, { DEFAULT_ENVIRONMENTAL_MILESTONES } from "../TimeLapsePlayer";

describe("TimeLapsePlayer", () => {
  it("renders with title and current year highlighted", () => {
    const onYearChange = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2020"
        onYearChange={onYearChange}
        title="Test TimeLapse"
      />
    );

    expect(screen.getByText("Test TimeLapse")).toBeDefined();
    expect(screen.getAllByText("2020").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2016").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("2024").length).toBeGreaterThanOrEqual(1);
  });

  it("handles clicking previous and next year buttons", () => {
    const onYearChange = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2020"
        onYearChange={onYearChange}
        years={["2018", "2019", "2020", "2021", "2022"]}
      />
    );

    // Click next button
    const nextBtn = screen.getByTitle("Próximo Ano (Seta Direita)");
    fireEvent.click(nextBtn);
    expect(onYearChange).toHaveBeenCalledWith("2021");

    // Click previous button
    const prevBtn = screen.getByTitle("Ano Anterior (Seta Esquerda)");
    fireEvent.click(prevBtn);
    expect(onYearChange).toHaveBeenCalledWith("2019");
  });

  it("toggles play state when play/pause button is clicked", () => {
    const onPlayChange = vi.fn();
    const onYearChange = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2020"
        isPlaying={false}
        onPlayChange={onPlayChange}
        onYearChange={onYearChange}
      />
    );

    const playBtn = screen.getByTitle(/Iniciar Time-Lapse/i);
    fireEvent.click(playBtn);
    expect(onPlayChange).toHaveBeenCalledWith(true);
  });

  it("switches speed when speed button is clicked", () => {
    const onYearChange = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2020"
        onYearChange={onYearChange}
      />
    );

    const speedBtn = screen.getByTitle(/Velocidade:/i);
    expect(speedBtn.textContent).toContain("1x");
    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toContain("2x");
    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toContain("0.5x");
    fireEvent.click(speedBtn);
    expect(speedBtn.textContent).toContain("1x");
  });

  it("displays milestone info and calls onYearChange when a year dot is clicked", () => {
    const onYearChange = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2019"
        onYearChange={onYearChange}
        milestones={DEFAULT_ENVIRONMENTAL_MILESTONES}
      />
    );

    expect(screen.getByText(/Ciclones Idai & Kenneth/i)).toBeDefined();

    const year2023Btn = screen.getByTitle(/2023 · Ciclone Freddy/i);
    fireEvent.click(year2023Btn);
    expect(onYearChange).toHaveBeenCalledWith("2023");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <TimeLapsePlayer
        currentYear="2020"
        onYearChange={vi.fn()}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByTitle("Fechar Time-Lapse");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
