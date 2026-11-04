import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { PublicDataTools } from "../PublicDataTools";

afterEach(cleanup);
describe("PublicDataTools", () => {
  it("can query sources without asking for an AI provider", () => {
    const run = vi.fn();
    render(<PublicDataTools disabled={false} onRun={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar catálogo" }));
    expect(run).toHaveBeenCalledWith(expect.any(String), { tool: "list_public_datasets", args: {} });
  });
  it("sends the explicit index and threshold selected by the user", () => {
    const run = vi.fn();
    render(<PublicDataTools disabled={false} onRun={run} />);
    fireEvent.change(screen.getByLabelText("Análise de dados públicos"), { target: { value: "calculate_zonal_statistics" } });
    fireEvent.change(screen.getByLabelText("Índice da análise pública"), { target: { value: "ndwi" } });
    fireEvent.change(screen.getByLabelText("Limiar do índice"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Executar análise" }));
    expect(run).toHaveBeenCalledWith(expect.any(String), { tool: "calculate_zonal_statistics", args: { index: "ndwi", threshold: 0, comparison: "gte" } });
  });
  it("keeps explicit reference dates instead of inventing a comparison period", () => {
    const run = vi.fn();
    render(<PublicDataTools disabled={false} onRun={run} />);
    fireEvent.change(screen.getByLabelText("Análise de dados públicos"), { target: { value: "detect_temporal_change" } });
    fireEvent.change(screen.getByLabelText("Início do período de referência"), { target: { value: "2020-06-01" } });
    fireEvent.change(screen.getByLabelText("Fim do período de referência"), { target: { value: "2020-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Executar análise" }));
    expect(run).toHaveBeenCalledWith(expect.any(String), { tool: "detect_temporal_change", args: { index: "ndvi", start_date_1: "2020-06-01", end_date_1: "2020-09-01" } });
  });
  it("blocks repeated submission while an analysis runs", () => {
    const run = vi.fn();
    render(<PublicDataTools disabled onRun={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar catálogo" }));
    expect(run).not.toHaveBeenCalled();
  });
});
