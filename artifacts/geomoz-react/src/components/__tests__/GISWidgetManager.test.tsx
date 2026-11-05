import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GISWidgetManager, { GIS_WIDGET_SETTINGS_KEY, initialDisabled } from "../GISWidgetManager";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });
describe("GeoMoz widget manager", () => {
  it("opens the manager and persists inspector preferences", () => {
    const onDisabledChange = vi.fn();
    const view = render(<GISWidgetManager context={{mapId:"workspace",layerId:"geologia"}} disabled={[]} onDisabledChange={onDisabledChange} />);
    const open = screen.getByRole("button", {name:"Ferramentas GIS"});
    expect(open).toHaveAttribute("aria-expanded","false");
    fireEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded","true");
    const inspector = screen.getByRole("checkbox", {name:"Inspeccionar feição"});
    expect(inspector).toBeChecked();
    fireEvent.click(inspector);
    expect(onDisabledChange).toHaveBeenCalledWith(["feature-inspector"]);
    expect(initialDisabled()).toEqual(["feature-inspector"]);
    view.rerender(<GISWidgetManager context={{mapId:"workspace",layerId:"geologia"}} disabled={["feature-inspector"]} onDisabledChange={onDisabledChange} />);
    expect(screen.getByRole("checkbox", {name:"Inspeccionar feição"})).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", {name:"Inspeccionar feição"}));
    expect(onDisabledChange).toHaveBeenLastCalledWith([]);
    expect(initialDisabled()).toEqual([]);
  });
  it("handles malformed persisted settings and explains unavailable tools", () => {
    localStorage.setItem(GIS_WIDGET_SETTINGS_KEY, "not-json");
    expect(initialDisabled()).toEqual([]);
    localStorage.setItem(GIS_WIDGET_SETTINGS_KEY, JSON.stringify(["feature-inspector", 123, null]));
    expect(initialDisabled()).toEqual(["feature-inspector"]);
    render(<GISWidgetManager context={{mapId:"workspace"}} disabled={[]} onDisabledChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", {name:"Ferramentas GIS"}));
    expect(screen.getByText(/Disponível ao seleccionar uma camada vectorial/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Fechar gestor de widgets"}));
    expect(screen.queryByRole("checkbox", {name:"Inspeccionar feição"})).toBeNull();
  });
});
