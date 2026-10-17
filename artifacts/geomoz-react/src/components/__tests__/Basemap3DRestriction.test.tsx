import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import BasemapSwitcher from "@/components/BasemapSwitcher";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

beforeEach(() => {
  window.localStorage.clear();
});

describe("3D is restricted to the main /mapa view", () => {
  it("hides globe controls, DEM 3D switch and Cesium on all other maps by default", () => {
    render(<BasemapSwitcher current="hybrid" onChange={vi.fn()} />);
    expect(screen.queryByText("3D Ativo")).toBeNull();
    expect(screen.queryByText("Globo 3D & Relevo")).toBeNull();
    fireEvent.click(screen.getByText("Camadas"));
    expect(screen.getByText("Tipo de Mapa")).toBeTruthy();
    expect(screen.queryByText("Cesium World")).toBeNull();
    expect(screen.queryByText("Globo 3D & Relevo")).toBeNull();
    // 2D terrain remains available as a conventional flat basemap.
    expect(screen.getByText("Relevo")).toBeTruthy();
  });

  it("preserves the 3D controls and Cesium only with explicit permission", () => {
    render(<BasemapSwitcher current="hybrid" onChange={vi.fn()} show3dToggle />);
    fireEvent.click(screen.getByText("Camadas"));
    expect(screen.getByText("Globo 3D & Relevo")).toBeTruthy();
    expect(screen.getByText("Cesium World")).toBeTruthy();
  });

  it("main map explicitly opts in, while standalone MapView defaults to 2D", () => {
    const explorer = read("src/pages/Explorer.tsx");
    const mainMap = read("src/components/MapView.tsx");
    const globe = read("src/components/MapLibre3DView.tsx");
    expect(explorer).toContain('enable3d={typeof window !== "undefined" && window.location.pathname === "/mapa"}');
    expect(mainMap).toContain("enable3d = false");
    expect(mainMap).toContain('enable3d ? (propViewMode ?? internalViewMode) : "2d"');
    expect(mainMap).toContain("show3dToggle={enable3d}");
    expect(globe).toContain("show3dToggle");
  });

  it("other map pages no longer expose view-mode wiring or misleading 3D titles", () => {
    for (const page of [
      "GeoAnalises",
      "GeoProcessamento",
      "Geoperigos",
      "AguaSubterranea",
      "HidroGeoMoz",
    ]) {
      const src = read(`src/pages/${page}.tsx`);
      expect(src).not.toContain("onViewModeChange");
      expect(src).not.toContain('viewMode?: "2d" | "3d"');
      expect(src).not.toContain("Globo 3D & Relevo");
    }
    expect(read("src/pages/GeoAnalises.tsx")).not.toContain("Perfil Topográfico 3D");
  });
});
