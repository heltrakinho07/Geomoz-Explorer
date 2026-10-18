import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import GeoMozPrintLayout,{printPageDimensions} from "@/components/GeoMozPrintLayout";

const capture=vi.fn();
vi.mock("html2canvas",()=>({default:(...args:unknown[])=>capture(...args)}));

describe("GeoMoz unified print layout",()=>{
 beforeEach(()=>{
  vi.useRealTimers();
  capture.mockReset();
  capture.mockResolvedValue({width:1200,height:800,toDataURL:()=>"data:image/png;base64,"+"a".repeat(6000)});
  const source=document.createElement("main");
  source.id="print-test-module";
  source.textContent="Mapa real";
  document.body.appendChild(source);
 });
 afterEach(()=>{
  document.getElementById("print-test-module")?.remove();
  vi.restoreAllMocks();
 });
 it("calculates correct A4/A3 portrait and landscape page sizes",()=>{
  expect(printPageDimensions("a4","portrait")).toEqual({width:210,height:297});
  expect(printPageDimensions("a4","landscape")).toEqual({width:297,height:210});
  expect(printPageDimensions("a3","portrait")).toEqual({width:297,height:420});
  expect(printPageDimensions("a3","landscape")).toEqual({width:420,height:297});
 });
 it("captures the visible GeoMoz module without inventing map content",async()=>{
  render(<GeoMozPrintLayout open onClose={()=>{}} moduleName="Geoperigos" projectName="Estudo de Risco" printSourceId="print-test-module"/>);
  expect(screen.getByTestId("geomoz-print-portal")).toBeTruthy();
  expect(screen.getByLabelText("Título do mapa")).toHaveProperty("value","Geoperigos — GeoMoz");
  expect(screen.getByLabelText("Subtítulo")).toHaveProperty("value","Estudo de Risco");
  await waitFor(()=>expect(capture).toHaveBeenCalledTimes(1),{timeout:3000});
  const captured=capture.mock.calls[0][0] as HTMLElement;
  expect(captured.id).toBe("print-test-module");
  await waitFor(()=>expect(screen.getByAltText("Vista capturada do módulo Geoperigos")).toBeTruthy());
  const button=screen.getByRole("button",{name:/Imprimir \/ Guardar PDF/}) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Formato do papel"),{target:{value:"a3"}});
  const page=screen.getByTestId("geomoz-print-page");
  expect(page.getAttribute("style")).toContain("420mm");
  fireEvent.change(screen.getByLabelText("Orientação do papel"),{target:{value:"portrait"}});
  expect(page.getAttribute("style")).toContain("297mm");
 });
 it("disables print and reports capture failures rather than outputting fake cartography",async()=>{
  capture.mockRejectedValue(new Error("canvas CORS blocked"));
  render(<GeoMozPrintLayout open onClose={()=>{}} moduleName="Mapa" printSourceId="print-test-module"/>);
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toMatch(/CORS/),{timeout:3000});
  expect((screen.getByRole("button",{name:/Imprimir \/ Guardar PDF/}) as HTMLButtonElement).disabled).toBe(true);
 });
 it("keeps CRS and scale optional and north arrow off by default",()=>{
  render(<GeoMozPrintLayout open onClose={()=>{}} moduleName="Mapa" printSourceId="print-test-module"/>);
  expect((screen.getByLabelText("Sistema de coordenadas") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Escala") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText(/Mostrar seta do norte/) as HTMLInputElement).checked).toBe(false);
 });
});
