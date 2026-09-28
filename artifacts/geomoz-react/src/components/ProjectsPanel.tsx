import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Droplet,
  Droplets,
  FolderKanban,
  Gem,
  Layers,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Satellite,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import type { AreaOfInterest } from "@/lib/aoi";
import type { LayerState } from "@/components/Sidebar";
import type { WorkspaceResultLayer } from "@/hooks/useWorkspaceLayers";
import { useToast } from "@/hooks/use-toast";
import type { GeoMozWorkspaceTab } from "@/components/CommandCenter";

export interface GeoMozProject {
  id: string;
  name: string;
  description: string;
  solution_id?: string | null;
  aoi: AreaOfInterest | null;
  map_state: {
    province?: string | null;
    district?: string | null;
    center?: [number, number];
    zoom?: number;
    layers?: LayerState;
    color_by?: string;
    result_layers?: WorkspaceResultLayer[];
  };
  created_at: string;
  updated_at: string;
}

interface ProjectsResponse {
  projects: GeoMozProject[];
}

interface SolutionStarter {
  id: "groundwater" | "hazards" | "environment" | "minerals" | "watershed";
  label: string;
  shortLabel: string;
  description: string;
  defaultName: string;
  defaultDescription: string;
  targetTab: GeoMozWorkspaceTab;
  icon: typeof Satellite;
  iconClass: string;
  surfaceClass: string;
}

const SOLUTION_STARTERS: SolutionStarter[] = [
  {
    id: "groundwater",
    label: "Água Subterrânea",
    shortLabel: "Água",
    description: "Potencial hídrico, AHP e zonas prioritárias.",
    defaultName: "Estudo de Água Subterrânea",
    defaultDescription: "Workspace GeoMoz para avaliação de potencial de água subterrânea e priorização hidrogeológica.",
    targetTab: "Água Subterrânea",
    icon: Droplet,
    iconClass: "bg-cyan-100 text-cyan-700",
    surfaceClass: "border-cyan-100 hover:border-cyan-300 hover:bg-cyan-50/60",
  },
  {
    id: "hazards",
    label: "Cheias & Erosão",
    shortLabel: "Risco",
    description: "Sentinel-1, RUSLE e análise de geoperigos.",
    defaultName: "Estudo de Risco de Cheias e Erosão",
    defaultDescription: "Workspace GeoMoz para análise de inundações, erosão e risco territorial.",
    targetTab: "Geoperigos",
    icon: AlertTriangle,
    iconClass: "bg-rose-100 text-rose-700",
    surfaceClass: "border-rose-100 hover:border-rose-300 hover:bg-rose-50/60",
  },
  {
    id: "environment",
    label: "Monitoria Ambiental",
    shortLabel: "EO",
    description: "NDVI, stress, mudanças e Earth Observation.",
    defaultName: "Monitoria Ambiental",
    defaultDescription: "Workspace GeoMoz para monitoria por satélite, índices espectrais e análise de mudanças.",
    targetTab: "GeoAnálises",
    icon: Satellite,
    iconClass: "bg-emerald-100 text-emerald-700",
    surfaceClass: "border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/60",
  },
  {
    id: "minerals",
    label: "Exploração Mineral",
    shortLabel: "Mining",
    description: "Targeting, favorabilidade e evidências espectrais.",
    defaultName: "Exploração e Targeting Mineral",
    defaultDescription: "Workspace GeoMoz para targeting mineral, análise de favorabilidade e evidências de sensoriamento remoto.",
    targetTab: "GeoAnálises",
    icon: Gem,
    iconClass: "bg-amber-100 text-amber-700",
    surfaceClass: "border-amber-100 hover:border-amber-300 hover:bg-amber-50/60",
  },
  {
    id: "watershed",
    label: "Bacia Hidrográfica",
    shortLabel: "Bacia",
    description: "Delimitação, drenagem e estudo hidroambiental.",
    defaultName: "Estudo de Bacia Hidrográfica",
    defaultDescription: "Workspace GeoMoz para delimitação de bacias, drenagem, morfometria e análise hidroambiental.",
    targetTab: "Bacias Hidrográficas",
    icon: Droplets,
    iconClass: "bg-blue-100 text-blue-700",
    surfaceClass: "border-blue-100 hover:border-blue-300 hover:bg-blue-50/60",
  },
];

const SOLUTION_BY_ID = Object.fromEntries(
  SOLUTION_STARTERS.map(starter => [starter.id, starter]),
) as Record<string, SolutionStarter>;

interface ProjectsPanelProps {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
  mapCenter: [number, number];
  mapZoom: number;
  layers: LayerState;
  colorBy: string;
  resultLayers: WorkspaceResultLayer[];
  onOpenProject: (project: GeoMozProject) => void;
  onStartWorkflow: (tab: GeoMozWorkspaceTab) => void;
}

async function apiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.detail || data.message || `Erro HTTP ${res.status}`;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ProjectsPanel({
  aoi,
  province,
  district,
  mapCenter,
  mapZoom,
  layers,
  colorBy,
  resultLayers,
  onOpenProject,
  onStartWorkflow,
}: ProjectsPanelProps) {
  const { user } = useAuth();
  const { activeProject, setActiveProject, clearActiveProject } = useProject();
  const { toast } = useToast();

  const [projects, setProjects] = useState<GeoMozProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSolutionId, setSelectedSolutionId] = useState<SolutionStarter["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snapshot = useMemo(() => ({
    aoi,
    map_state: {
      province,
      district,
      center: mapCenter,
      zoom: mapZoom,
      layers,
      color_by: colorBy,
      result_layers: resultLayers,
    },
  }), [aoi, province, district, mapCenter, mapZoom, layers, colorBy, resultLayers]);

  const loadProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/geomoz-api/projects");
      if (!res.ok) throw new Error(await apiError(res));
      const data = await res.json() as ProjectsResponse;
      setProjects(data.projects ?? []);

      if (
        activeProject &&
        !(data.projects ?? []).some(project => project.id === activeProject.id)
      ) {
        clearActiveProject();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, activeProject?.id]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  function chooseStarter(starter: SolutionStarter) {
    setSelectedSolutionId(starter.id);
    setName(starter.defaultName);
    setDescription(starter.defaultDescription);
    setShowCreate(true);
    setError(null);
  }

  function toggleManualCreate() {
    if (showCreate && !selectedSolutionId) {
      setShowCreate(false);
      return;
    }
    setSelectedSolutionId(null);
    setName("");
    setDescription("");
    setShowCreate(true);
    setError(null);
  }

  async function createProject() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Indique um nome para o projecto.");
      return;
    }

    setSaving("create");
    setError(null);
    try {
      const res = await apiFetch("/geomoz-api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          solution_id: selectedSolutionId,
          ...snapshot,
        }),
      });
      if (!res.ok) throw new Error(await apiError(res));

      const project = await res.json() as GeoMozProject;
      setProjects(current => [project, ...current.filter(p => p.id !== project.id)]);
      setActiveProject({ id: project.id, name: project.name });
      const starter = project.solution_id ? SOLUTION_BY_ID[project.solution_id] : null;
      setName("");
      setDescription("");
      setSelectedSolutionId(null);
      setShowCreate(false);
      toast({
        title: "Projecto criado",
        description: starter
          ? `${project.name} está pronto. A abrir ${starter.label}.`
          : `${project.name} passou a ser o projecto activo.`,
      });
      if (starter) {
        window.setTimeout(() => onStartWorkflow(starter.targetTab), 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function saveWorkspace(projectId: string) {
    setSaving(projectId);
    setError(null);
    try {
      const res = await apiFetch(`/geomoz-api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(await apiError(res));

      const project = await res.json() as GeoMozProject;
      setProjects(current => current.map(item => item.id === project.id ? project : item));
      toast({
        title: "Projecto actualizado",
        description: "AOI e estado actual do mapa foram guardados.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function deleteProject(project: GeoMozProject) {
    if (!window.confirm(`Eliminar o projecto “${project.name}”? As análises históricas não são apagadas automaticamente.`)) {
      return;
    }

    setSaving(project.id);
    setError(null);
    try {
      const res = await apiFetch(`/geomoz-api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await apiError(res));

      setProjects(current => current.filter(item => item.id !== project.id));
      if (activeProject?.id === project.id) clearActiveProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  function openProject(project: GeoMozProject) {
    setActiveProject({ id: project.id, name: project.name });
    onOpenProject(project);
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <FolderKanban size={32} className="mx-auto text-sky-500" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">Projectos GeoMoz</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Inicie sessão para guardar AOIs, estado do mapa e análises num workspace persistente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban size={20} className="text-sky-600" />
              <h2 className="text-2xl font-bold text-slate-900">Projectos</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Workspaces persistentes para AOI, mapa, análises e resultados.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadProjects()}
              className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 hover:border-sky-200 hover:text-sky-600"
              title="Actualizar projectos"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={toggleManualCreate}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              <Plus size={14} /> Novo projecto
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-500" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Solution Starters
                </h3>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Comece pelo problema a resolver. O GeoMoz prepara o projecto e abre o workflow certo.
              </p>
            </div>
            <span className="hidden rounded-full bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-600 sm:inline">
              1 clique → workspace
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {SOLUTION_STARTERS.map(starter => {
              const Icon = starter.icon;
              const selected = selectedSolutionId === starter.id && showCreate;
              return (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => chooseStarter(starter)}
                  className={[
                    "group rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    starter.surfaceClass,
                    selected ? "ring-2 ring-violet-200" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${starter.iconClass}`}>
                      <Icon size={15} />
                    </div>
                    <ArrowRight size={12} className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </div>
                  <div className="mt-2.5 text-xs font-semibold text-slate-800">
                    {starter.label}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                    {starter.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {activeProject && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Projecto activo</div>
                <div className="truncate text-sm font-semibold text-emerald-900">{activeProject.name}</div>
              </div>
            </div>
            <button
              onClick={() => void saveWorkspace(activeProject.id)}
              disabled={saving === activeProject.id}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
            >
              {saving === activeProject.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar estado actual
            </button>
          </div>
        )}

        {showCreate && (
          <div className="mb-5 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedSolutionId
                    ? `Criar ${SOLUTION_BY_ID[selectedSolutionId].label}`
                    : "Criar projecto a partir do workspace actual"}
                </h3>
                {selectedSolutionId && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-semibold text-violet-600">
                    Solution Starter
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {selectedSolutionId
                  ? "O projecto usa a AOI actual e abre automaticamente o workflow recomendado."
                  : "O GeoMoz guardará a AOI, província/distrito, zoom, camadas e estilo do mapa."}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Nome do projecto"
                maxLength={120}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="Descrição breve (opcional)"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
              <button
                onClick={() => void createProject()}
                disabled={saving === "create"}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {saving === "create" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {selectedSolutionId ? "Criar e abrir" : "Criar"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> A carregar projectos…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FolderKanban size={30} className="mx-auto text-slate-300" />
            <div className="mt-3 text-sm font-semibold text-slate-700">Ainda não existem projectos</div>
            <p className="mt-1 text-xs text-slate-400">
              Escolha um Solution Starter acima ou crie um workspace manual a partir do mapa actual.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map(project => {
              const active = activeProject?.id === project.id;
              const solution = project.solution_id ? SOLUTION_BY_ID[project.solution_id] : null;
              return (
                <div
                  key={project.id}
                  className={[
                    "rounded-2xl border bg-white p-4 shadow-sm transition-all",
                    active ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200 hover:border-sky-200 hover:shadow-md",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      onClick={() => openProject(project)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban size={15} className={active ? "text-emerald-600" : "text-sky-500"} />
                        <span className="truncate text-sm font-semibold text-slate-900">{project.name}</span>
                        {solution && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                            {solution.shortLabel}
                          </span>
                        )}
                        {active && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                            activo
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-slate-500">
                        {project.description || "Sem descrição."}
                      </p>
                    </button>

                    <button
                      onClick={() => void deleteProject(project)}
                      disabled={saving === project.id}
                      className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      title="Eliminar projecto"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin size={9} />
                      {project.aoi?.label || project.map_state?.district || project.map_state?.province || "AOI global"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock3 size={9} /> {formatDate(project.updated_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={9} /> {project.map_state?.result_layers?.length ?? 0} resultados
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => openProject(project)}
                      className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                    >
                      Abrir projecto
                    </button>
                    <button
                      onClick={() => void saveWorkspace(project.id)}
                      disabled={saving === project.id}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      title="Substituir o estado guardado pelo workspace actual"
                    >
                      {saving === project.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
