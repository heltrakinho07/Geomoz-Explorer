import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GAULAreaSelect, type GAULSelection, type GAULUnit, type LoadGAULUnits } from "../GAULAreaSelect";

afterEach(cleanup);
const empty: GAULSelection = { adminLevel: 0, admin1Code: null, admin1Name: null, admin2Code: null, admin2Name: null };
const unit = (code: number, name: string, level = 1, parentCode: number | null = null, countryCode = "MOZ"): GAULUnit => ({ code, name, level, parentCode, countryCode });

function Harness({ load, changed }: { load: LoadGAULUnits; changed: (selection: GAULSelection) => void }) {
  const [selection, setSelection] = useState(empty);
  return <GAULAreaSelect countryCode="MOZ" selection={selection} loadUnits={load} onChange={(next) => { setSelection(next); changed(next); }} />;
}

describe("GAULAreaSelect", () => {
  it("loads ADM1 for the country and ADM2 only after selecting the parent", async () => {
    const load = vi.fn<LoadGAULUnits>().mockImplementation(async (_country, level) => level === 1 ? [unit(100, "Manica")] : [unit(200, "Gondola", 2, 100)]);
    const changed = vi.fn();
    render(<Harness load={load} changed={changed} />);
    await screen.findByRole("option", { name: "Manica" });
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Unidade FAO GAUL ADM1"), { target: { value: "100" } });
    await screen.findByRole("option", { name: "Gondola" });
    expect(load).toHaveBeenLastCalledWith("MOZ", 2, 100, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText("Unidade FAO GAUL ADM2"), { target: { value: "200" } });
    expect(changed).toHaveBeenLastCalledWith({ adminLevel: 2, admin1Code: 100, admin1Name: "Manica", admin2Code: 200, admin2Name: "Gondola" });
  });
  it("clears the child code when the parent changes", async () => {
    const load = vi.fn<LoadGAULUnits>().mockImplementation(async (_country, level) => level === 1 ? [unit(100, "Manica"), unit(101, "Tete")] : [unit(200, "Gondola", 2, 100)]);
    const changed = vi.fn();
    render(<Harness load={load} changed={changed} />);
    await screen.findByRole("option", { name: "Manica" });
    fireEvent.change(screen.getByLabelText("Unidade FAO GAUL ADM1"), { target: { value: "100" } });
    await screen.findByRole("option", { name: "Gondola" });
    fireEvent.change(screen.getByLabelText("Unidade FAO GAUL ADM2"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Unidade FAO GAUL ADM1"), { target: { value: "101" } });
    expect(changed).toHaveBeenLastCalledWith({ adminLevel: 1, admin1Code: 101, admin1Name: "Tete", admin2Code: null, admin2Name: null });
  });
  it("ignores an old country's response after the country changes", async () => {
    let resolveOld!: (value: GAULUnit[]) => void;
    const load = vi.fn<LoadGAULUnits>().mockImplementation(async (country) => country === "MOZ" ? new Promise((resolve) => { resolveOld = resolve; }) : [unit(300, "Lisboa", 1, null, "PRT")]);
    const view = render(<GAULAreaSelect countryCode="MOZ" selection={empty} loadUnits={load} onChange={vi.fn()} />);
    const oldSignal = load.mock.calls[0][3];
    view.rerender(<GAULAreaSelect countryCode="PRT" selection={empty} loadUnits={load} onChange={vi.fn()} />);
    await screen.findByRole("option", { name: "Lisboa" });
    await act(async () => resolveOld([unit(100, "Manica")]));
    expect(oldSignal.aborted).toBe(true);
    expect(screen.queryByRole("option", { name: "Manica" })).toBeNull();
  });
  it("shows an actionable failure without substituting another source", async () => {
    const load = vi.fn<LoadGAULUnits>().mockRejectedValue(new Error("GEE não autorizado"));
    render(<GAULAreaSelect countryCode="MOZ" selection={empty} loadUnits={load} onChange={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("GEE não autorizado");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
