import React from "react";
import { useProject } from "../context/ProjectContext";
import { PROJECT_CATEGORIES, ProjectCategory } from "../types/project";
import {
  FolderKanban,
  ChevronDown,
  Sparkles,
  Plus,
  Sprout,
  Droplets,
  Building2,
  AlertTriangle,
  Leaf,
  Globe,
  Layers,
} from "lucide-react";

interface ProjectSelectorButtonProps {
  onClick: () => void;
  className?: string;
}

export default function ProjectSelectorButton({
  onClick,
  className = "",
}: ProjectSelectorButtonProps) {
  const { activeProject, activeRuns, projects, loading } = useProject();

  const getCategoryIcon = (catId?: ProjectCategory) => {
    switch (catId) {
      case "agricultura":
        return <Sprout size={13} className="text-emerald-500 shrink-0" />;
      case "recursos_hidricos":
        return <Droplets size={13} className="text-cyan-500 shrink-0" />;
      case "ordenamento_territorial":
        return <Building2 size={13} className="text-indigo-500 shrink-0" />;
      case "geoperigos":
        return <AlertTriangle size={13} className="text-amber-500 shrink-0" />;
      case "conservacao_ambiental":
        return <Leaf size={13} className="text-teal-500 shrink-0" />;
      case "estudo_geral":
      default:
        return <Globe size={13} className="text-sky-500 shrink-0" />;
    }
  };

  if (!activeProject) {
    return (
      <button
        onClick={onClick}
        type="button"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-dashed border-sky-300 dark:border-sky-700/60 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-700 dark:text-sky-300 transition-all text-xs font-medium shadow-xs group ${className}`}
        title="Nenhum projeto ativo. Clique para selecionar ou criar um novo estudo de investigação."
      >
        <div className="w-5 h-5 rounded-md bg-sky-200/80 dark:bg-sky-800/80 flex items-center justify-center text-sky-700 dark:text-sky-200 group-hover:scale-105 transition-transform">
          <Plus size={12} />
        </div>
        <span className="hidden lg:inline font-semibold">Novo Estudo / Projeto</span>
        <span className="lg:hidden font-semibold">Projeto</span>
        <span className="text-[10px] opacity-70 bg-sky-200/60 dark:bg-sky-900/60 px-1.5 py-0.2 rounded-full ml-0.5">
          {projects.length}
        </span>
      </button>
    );
  }

  const runCount = activeRuns.length || activeProject.statsSummary?.totalRuns || 0;

  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-xs transition-all text-xs text-slate-800 dark:text-slate-200 group ${className}`}
      title={`Projeto ativo: "${activeProject.name}" (Clique para gerir ou alternar projetos)`}
    >
      <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
        {getCategoryIcon(activeProject.category)}
      </div>

      <div className="flex flex-col text-left max-w-[130px] xl:max-w-[170px]">
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider leading-none">
          Projeto Ativo
        </span>
        <span className="font-bold text-slate-800 dark:text-slate-100 truncate text-xs leading-tight">
          {activeProject.name}
        </span>
      </div>

      <div className="flex items-center gap-1 ml-0.5">
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium">
          <Layers size={10} className="text-slate-400" />
          {runCount}
        </span>
        <ChevronDown size={12} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
      </div>
    </button>
  );
}
