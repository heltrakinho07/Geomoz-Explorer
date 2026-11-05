import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProjectWorkspaceModal from "@/components/ProjectWorkspaceModal";
import type { AreaOfInterest } from "@/lib/aoi";

const projectMocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  setActiveProject: vi.fn(),
  deleteProject: vi.fn(),
  deleteRunFromActiveProject: vi.fn(),
  projects: [] as unknown[],
  activeProject: null as unknown,
  user: { uid: "demo-account" } as { uid: string } | null,
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: projectMocks.user }),
}));
vi.mock("../context/ProjectContext", () => ({
  useProject: () => ({
    projects: projectMocks.projects,
    activeProject: projectMocks.activeProject,
    activeRuns: [],
    loading: false,
    runsLoading: false,
    createProject: projectMocks.createProject,
    setActiveProject: projectMocks.setActiveProject,
    deleteProject: projectMocks.deleteProject,
    deleteRunFromActiveProject: projectMocks.deleteRunFromActiveProject,
  }),
}));

const localAOI: AreaOfInterest = {
  source: "mozambique",
  province: "Maputo",
  district: "Matola",
  geometry: null,
  label: "Matola, Maputo",
};

beforeEach(() => {
  vi.clearAllMocks();
  projectMocks.user = { uid: "demo-account" };
  projectMocks.projects = [];
  projectMocks.activeProject = null;
  projectMocks.createProject.mockImplementation(async ({ aoi }: { aoi: AreaOfInterest }) => ({
    id: "novo-projecto",
    aoi,
  }));
});
afterEach(() => cleanup());

describe("GeoMoz Project Workspace forms", () => {
  it("switches between project catalogue and creation without losing the AOI", () => {
    render(<ProjectWorkspaceModal open onOpenChange={vi.fn()} currentPlatformAOI={localAOI} />);
    expect(screen.getByTestId("geomoz-project-workspace-dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Meus Projetos/ })).toHaveAttribute(
      "aria-selected", "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Novo Projeto/ }));
    expect(screen.getByRole("tab", { name: /Novo Projeto/ })).toHaveAttribute(
      "aria-selected", "true",
    );
    expect(screen.getByLabelText(/Nome do Projeto de Estudo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data de Início do Estudo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data de Término do Estudo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /AOI Atual/ })).toHaveAttribute(
      "aria-pressed", "true",
    );
  });

  it("creates a persisted-project request using the selected AOI and date range", async () => {
    const onOpenChange = vi.fn();
    const onSelectAOI = vi.fn();
    render(
      <ProjectWorkspaceModal
        open
        onOpenChange={onOpenChange}
        currentPlatformAOI={localAOI}
        onSelectProjectAOI={onSelectAOI}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Novo Projeto/ }));
    fireEvent.change(screen.getByLabelText(/Nome do Projeto de Estudo/), {
      target: { value: "  Monitorização de solos  " },
    });
    fireEvent.change(screen.getByLabelText(/Notas Metodológicas/), {
      target: { value: "Classificação de solos por satélite" },
    });
    fireEvent.change(screen.getByLabelText(/Data de Início do Estudo/), {
      target: { value: "2025-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/Data de Término do Estudo/), {
      target: { value: "2025-12-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Criar e Ativar Projeto/ }));

    await waitFor(() => expect(projectMocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Monitorização de solos",
        description: "Classificação de solos por satélite",
        category: "agricultura",
        aoi: localAOI,
        period: { startDate: "2025-01-01", endDate: "2025-12-31" },
      }),
    ));
    expect(onSelectAOI).toHaveBeenCalledWith(localAOI);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses the global AOI when selected and displays a failed save", async () => {
    projectMocks.createProject.mockRejectedValue(new Error("Falha simulada no Firestore"));
    const onOpenChange = vi.fn();
    render(<ProjectWorkspaceModal open onOpenChange={onOpenChange} currentPlatformAOI={localAOI} />);
    fireEvent.click(screen.getByRole("tab", { name: /Novo Projeto/ }));
    fireEvent.change(screen.getByLabelText(/Nome do Projeto de Estudo/), {
      target: { value: "Estudo global" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Global/ }));
    expect(screen.getByRole("button", { name: /^Global/ })).toHaveAttribute(
      "aria-pressed", "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /Criar e Ativar Projeto/ }));

    await waitFor(() => {
      expect(projectMocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ aoi: expect.objectContaining({ source: "global" }) }),
      );
      expect(screen.getByText("Falha simulada no Firestore")).toBeInTheDocument();
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
