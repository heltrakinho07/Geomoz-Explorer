import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useProject } from "../context/ProjectContext";
import { useAuth } from "../hooks/useAuth";
import { PROJECT_CATEGORIES, ProjectCategory, GeoMozProject } from "../types/project";
import type { AreaOfInterest } from "../lib/aoi";
import { mozambiqueAOI, GLOBAL_AOI } from "../lib/aoi";
import {
  FolderKanban,
  Plus,
  CheckCircle2,
  Trash2,
  Calendar,
  MapPin,
  Sparkles,
  Loader2,
  Clock,
  Layers,
  ChevronRight,
  BarChart2,
  Info,
  Check,
  Sprout,
  Droplets,
  Building2,
  AlertTriangle,
  Leaf,
  Globe,
  Tag,
  FileSpreadsheet
} from "lucide-react";

interface ProjectWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlatformAOI: AreaOfInterest;
  onSelectProjectAOI?: (aoi: AreaOfInterest) => void;
}

export default function ProjectWorkspaceModal({
  open,
  onOpenChange,
  currentPlatformAOI,
  onSelectProjectAOI,
}: ProjectWorkspaceModalProps) {
  const { user } = useAuth();
  const {
    projects,
    activeProject,
    activeRuns,
    loading,
    runsLoading,
    setActiveProject,
    createProject,
    deleteProject,
    deleteRunFromActiveProject,
  } = useProject();

  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [selectedProjectIdForRuns, setSelectedProjectIdForRuns] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProjectCategory>("agricultura");
  const [aoiOption, setAoiOption] = useState<"current" | "mozambique" | "global">("current");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2024-12-31");
  const [formError, setFormError] = useState<string | null>(null);

  const getCategoryIcon = (catId: ProjectCategory) => {
    switch (catId) {
      case "agricultura":
        return <Sprout size={14} className="text-emerald-500 shrink-0" />;
      case "recursos_hidricos":
        return <Droplets size={14} className="text-cyan-500 shrink-0" />;
      case "ordenamento_territorial":
        return <Building2 size={14} className="text-indigo-500 shrink-0" />;
      case "geoperigos":
        return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
      case "conservacao_ambiental":
        return <Leaf size={14} className="text-teal-500 shrink-0" />;
      case "estudo_geral":
      default:
        return <Globe size={14} className="text-sky-500 shrink-0" />;
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Por favor, introduza um nome para o projeto.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      let selectedAOI: AreaOfInterest;
      if (aoiOption === "current") {
        selectedAOI = currentPlatformAOI;
      } else if (aoiOption === "mozambique") {
        selectedAOI = mozambiqueAOI();
      } else {
        selectedAOI = GLOBAL_AOI;
      }

      const newProj = await createProject({
        name: name.trim(),
        description: description.trim(),
        category,
        aoi: selectedAOI,
        period: {
          startDate,
          endDate,
        },
      });

      if (onSelectProjectAOI && newProj.aoi) {
        onSelectProjectAOI(newProj.aoi);
      }

      // Reset form & go back to list
      setName("");
      setDescription("");
      setActiveTab("list");
      setSelectedProjectIdForRuns(newProj.id);
    } catch (err: any) {
      setFormError(err.message || "Erro ao criar projeto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectProject = (project: GeoMozProject) => {
    setActiveProject(project);
    if (onSelectProjectAOI && project.aoi) {
      onSelectProjectAOI(project.aoi);
    }
  };

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja eliminar este projeto de estudo e todo o seu histórico de análises?")) {
      setDeletingId(projectId);
      try {
        await deleteProject(projectId);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (confirm("Deseja remover esta análise do projeto?")) {
      await deleteRunFromActiveProject(runId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                <FolderKanban size={20} />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  Project Workspace
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Estudos Persistentes
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Organize investigações geoespaciais completas: AOI delimitada, dados, execuções e dossiê técnico.
                </DialogDescription>
              </div>
            </div>

            {/* Tab switch buttons */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <button
                onClick={() => { setActiveTab("list"); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "list"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Meus Projetos ({projects.length})
              </button>
              <button
                onClick={() => { setActiveTab("create"); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "create"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Plus size={13} />
                Novo Projeto
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {!user ? (
            <div className="p-8 text-center space-y-3">
              <Info size={32} className="mx-auto text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Sessão Necessária para Gestão de Projetos
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Inicie sessão com a sua conta Google para salvar áreas de estudo, histórico de execuções de satélite e gerar relatórios.
              </p>
            </div>
          ) : activeTab === "list" ? (
            /* TAB 1: LIST OF PROJECTS */
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={28} className="text-sky-500 animate-spin" />
                  <span className="text-xs text-slate-500">A sincronizar projetos no Firestore…</span>
                </div>
              ) : projects.length === 0 ? (
                <div className="py-12 text-center space-y-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                  <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
                    <FolderKanban size={24} />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Nenhum projeto de estudo ativo
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Crie o seu primeiro estudo para delimitar uma área de interesse permanente, comparar séries temporais de satélite e guardar resultados analíticos.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("create")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <Plus size={14} /> Criar Primeiro Projeto
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {projects.map((p) => {
                    const isActive = activeProject?.id === p.id;
                    const catMeta = PROJECT_CATEGORIES.find((c) => c.id === p.category);

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProject(p)}
                        className={`group relative rounded-2xl border p-4 transition-all cursor-pointer flex flex-col justify-between ${
                          isActive
                            ? "bg-sky-50/50 dark:bg-sky-950/20 border-sky-400 ring-2 ring-sky-400/20 shadow-sm"
                            : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-sky-200 dark:hover:border-slate-600 hover:shadow-md"
                        }`}
                      >
                        <div>
                          {/* Top row: Category badge & Active status */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                                catMeta?.badgeBg || "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {getCategoryIcon(p.category)}
                              {catMeta?.labelPt || p.category}
                            </span>

                            {isActive ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-100/70 dark:bg-sky-900/50 px-2 py-0.5 rounded-md">
                                <CheckCircle2 size={11} /> ATIVO
                              </span>
                            ) : (
                              <button
                                onClick={(e) => handleDelete(p.id, e)}
                                disabled={deletingId === p.id}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Eliminar Projeto"
                              >
                                {deletingId === p.id ? (
                                  <Loader2 size={12} className="animate-spin text-red-500" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Project Name */}
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-1">
                            {p.name}
                          </h4>

                          {/* Description */}
                          {p.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {p.description}
                            </p>
                          )}

                          {/* Metadata Badges */}
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <MapPin size={12} className="text-slate-400 shrink-0" />
                              <span className="truncate font-medium">{p.aoi?.label || "Mundo Global"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar size={12} className="text-slate-400 shrink-0" />
                              <span>{p.period.startDate} até {p.period.endDate}</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer row */}
                        <div className="mt-4 pt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Layers size={12} />
                            <strong>{p.statsSummary?.totalRuns || 0}</strong> análises salvas
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProject(p);
                              setSelectedProjectIdForRuns(p.id);
                            }}
                            className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                          >
                            {isActive ? "Gerir Execuções" : "Ativar Estudo"}
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active Project Analysis History Drawer */}
              {activeProject && (
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={16} className="text-sky-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Histórico de Análises no Projeto Ativo ({activeRuns.length})
                      </h4>
                    </div>
                    {activeRuns.length > 0 && (
                      <span className="text-[11px] text-slate-500">
                        Estudo: <strong className="text-slate-700 dark:text-slate-200">{activeProject.name}</strong>
                      </span>
                    )}
                  </div>

                  {runsLoading ? (
                    <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                      <Loader2 size={16} className="animate-spin text-sky-500" />
                      <span>A carregar análises guardadas…</span>
                    </div>
                  ) : activeRuns.length === 0 ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-500">
                      Ainda não guardou nenhuma análise neste projeto. Execute um cálculo no separador{" "}
                      <strong>GeoAnálises</strong> ou <strong>Bacias</strong> e clique em{" "}
                      <strong>"Guardar no Projeto"</strong>.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {activeRuns.map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs hover:border-slate-300 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                              <Sparkles size={13} />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {run.name} ({run.sensor})
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>Datas: {run.dateRange.start} ~ {run.dateRange.end}</span>
                                {run.metrics?.mean !== undefined && (
                                  <span>• Média: <strong>{run.metrics.mean.toFixed(3)}</strong></span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">
                              {new Date(run.createdAt).toLocaleDateString("pt-PT")}
                            </span>
                            <button
                              onClick={() => handleDeleteRun(run.id)}
                              className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                              title="Remover análise"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: CREATE PROJECT WIZARD */
            <form onSubmit={handleCreateProject} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nome do Projeto de Estudo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Monitorização de Culturas no Regadio de Chókwè"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Domínio Temático do Estudo
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PROJECT_CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 ring-1 ring-sky-500"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {getCategoryIcon(cat.id)}
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                            {cat.labelPt.split("&")[0].trim()}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                          {cat.descriptionPt}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Area of Interest Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Delimitação da Área de Estudo (AOI)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAoiOption("current")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      aoiOption === "current"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 font-semibold text-sky-800 dark:text-sky-300 ring-1 ring-sky-500"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <MapPin size={13} className="text-sky-500" />
                      <span>AOI Atual</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal truncate block">
                      {currentPlatformAOI.label || "Área ativa no mapa"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAoiOption("mozambique")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      aoiOption === "mozambique"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 font-semibold text-sky-800 dark:text-sky-300 ring-1 ring-sky-500"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span>🇲🇿</span>
                      <span>Todo Moçambique</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal block">
                      Fronteiras nacionais
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAoiOption("global")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      aoiOption === "global"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 font-semibold text-sky-800 dark:text-sky-300 ring-1 ring-sky-500"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe size={13} className="text-indigo-500" />
                      <span>Global</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal block">
                      Sem restrição de corte
                    </span>
                  </button>
                </div>
              </div>

              {/* Temporal Range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Data de Início do Estudo
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Data de Término do Estudo
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Description / Notes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notas Metodológicas ou Objetivos (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Descreva o enquadramento, objetivos específicos ou metodologias aplicadas..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("list")}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>A criar projeto…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>Criar e Ativar Projeto</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
