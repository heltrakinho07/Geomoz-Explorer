import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GeologicalStudio from "../GeologicalStudio";
const state = vi.hoisted(() => ({
  configured: true,
  calls: [] as { url: string; options: RequestInit }[],
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "alice" } }),
}));
vi.mock("@/context/ProjectContext", () => ({
  useProject: () => ({
    activeProject: { id: "p", name: "Test" },
    projects: [{ id: "p", name: "Test" }],
    setActiveProjectId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useGeoMozPreferences", () => ({
  useGeoMozPreferences: () => ({ language: "pt" }),
}));
vi.mock("@/components/ProjectWorkspaceModal", () => ({ default: () => null }));
vi.mock("@/components/geology/GeologicalViewer", () => ({
  default: () => null,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, options: RequestInit = {}) => {
    state.calls.push({ url, options });
    let data: unknown = [];
    if (url.endsWith("capabilities"))
      data = {
        configured: state.configured,
        canCompute: state.configured,
        entitled: true,
        monthlyLimit: 40,
      };
    if (url.includes("examples/"))
      data = {
        schemaVersion: 1,
        name: "Test",
        crs: "LOCAL",
        extent: [0, 1000, 0, 1000, 0, 1000],
        resolution: 16,
        interfaces: [{ name: "Sand", color: "#abcdef", kind: "layer" }],
        contacts: [
          { x: 0, y: 0, z: 500, formation: "Sand" },
          { x: 1000, y: 0, z: 500, formation: "Sand" },
          { x: 0, y: 1000, z: 500, formation: "Sand" },
        ],
        orientations: [
          {
            x: 500,
            y: 500,
            z: 500,
            azimuth: 90,
            dip: 0,
            polarity: 1,
            formation: "Sand",
          },
        ],
      };
    if (options.method === "POST")
      data = {
        id: "a".repeat(32),
        projectId: "p",
        name: "Test",
        status: "queued",
        createdAt: new Date().toISOString(),
      };
    return { ok: true, json: async () => data };
  }),
}));
describe("Geological Studio", () => {
  beforeEach(() => {
    state.configured = true;
    state.calls = [];
  });
  it("submits a project-scoped idempotent calculation", async () => {
    render(<GeologicalStudio />);
    const button = await screen.findByRole("button", {
      name: "Guardar e calcular",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(state.calls.some((c) => c.options.method === "POST")).toBe(true),
    );
    const call = state.calls.find((c) => c.options.method === "POST")!;
    expect(call.url).toContain("project_id=p");
    expect(
      (call.options.headers as Record<string, string>)["Idempotency-Key"],
    ).toHaveLength(36);
    expect(JSON.parse(String(call.options.body)).crs).toBe("LOCAL");
  });
  it("keeps compute disabled until provisioned", async () => {
    state.configured = false;
    render(<GeologicalStudio />);
    expect(await screen.findByText(/O cálculo na nuvem ainda/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Guardar e calcular" }),
    ).toBeDisabled();
  });
  it("does not send malformed contacts to the worker", async () => {
    render(<GeologicalStudio />);
    const csv = await screen.findByRole("textbox", { name: "Contactos CSV" });
    fireEvent.change(csv, { target: { value: "x,y,z,formation\n,0,0,Sand" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar e calcular" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Linha 2");
    expect(state.calls.some((c) => c.options.method === "POST")).toBe(false);
  });
});
