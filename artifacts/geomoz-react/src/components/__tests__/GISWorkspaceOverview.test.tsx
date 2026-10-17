import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import GISWorkspaceOverview from "../GISWorkspaceOverview";
import type {GISWorkspaceRasterLayer} from "@/lib/gis-raster";
afterEach(cleanup);
const props = {raster:null,layerCount:0,results:0,busy:false,error:null,onImport:vi.fn(),onDraw:vi.fn(),onTerrain:vi.fn(),onLayers:vi.fn()};
it("guides an empty workspace to area selection and import", () => {
  render(<GISWorkspaceOverview {...props}/>);
  expect(screen.getByText("Nenhum DEM seleccionado")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Desenhar no mapa"));
  expect(props.onDraw).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("Importar DEM"));
  expect(props.onImport).toHaveBeenCalledOnce();
});
it("warns when the known DEM grid is too coarse for local work", () => {
  const raster = {name:"DEM Global · 611 m · z7",bandCount:1,sizeBytes:1024} as GISWorkspaceRasterLayer;
  render(<GISWorkspaceOverview {...props} raster={raster}/>);
  expect(screen.getByText(/Detalhe regional/)).toBeInTheDocument();
  expect(screen.getByText(/aproximadamente 611 m/)).toBeInTheDocument();
});
it("keeps the real execution error visible", () => {
  render(<GISWorkspaceOverview {...props} error="DEM sem CRS"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("DEM sem CRS");
});
