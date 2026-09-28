import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FolderKanban,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import type { AreaOfInterest } from "@/lib/aoi";
import type { LayerState } from "@/components/Sidebar";
import { useToast } from "@/hooks/use-toast";

export interface GeoMozProject {
  id: string;
  name: string;
  description: string;
  aoi: AreaOfInterest | null;
  map_state: {
    province?: string | null;
    district?: string | null;
    center?: [number, number];
    zoom?: number;
    layers?: LayerState;
    color_by?: string;
  };
  created_at: string;
  updated_at: string;
}

interface ProjectsResponse {
  projects: GeoMozProject[];
}

interface ProjectsPanelProps {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
  mapCenter: [number, number];
  mapZoom: number;
  layers: LayerState;
  colorBy: string;
  onOpenProject: (project: GeoMozProject) => void;
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
  onOpenProject,
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
    },
  }), [aoi, province, district, mapCenter, mapZoom, layers, colorBy]);

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
          ...snapshot,
        }),
      });
      if (!res.ok) throw new Error(await apiError(res));

      const project = await res.json() as GeoMozProject;
      setProjects(current => [project, ...current.filter(p => p.id !== project.id)]);
      setActiveProject({ id: project.id, name: project.name });
      setName("");
      setDescription("");
      setShowCreate(false);
      toast({
        title: "Projecto criado",
        description: `${project.name} passou a ser o projecto activo.`,
      });
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
              onClick={() => setShowCreate(value => !value)}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              <Plus size={14} /> Novo projecto
            </button>
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
              <h3 className="text-sm font-semibold text-slate-900">Criar projecto a partir do workspace actual</h3>
              <p className="mt-1 text-[11px] text-slate-500">
                O GeoMoz guardará a AOI, província/distrito, zoom, camadas e estilo do mapa.
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
                Criar
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
              Crie o primeiro projecto para começar a guardar o contexto das análises.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map(project => {
              const active = activeProject?.id === project.id;
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
