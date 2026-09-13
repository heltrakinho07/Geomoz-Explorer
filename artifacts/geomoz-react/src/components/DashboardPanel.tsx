/**
 * DashboardPanel — Centro de Comando Geoespacial e Gestão de Estudos GeoMoz.
 *
 * Funcionalidades:
 *  - Gestão de Projetos de Estudo (Ativação, listagem e criação)
 *  - Portais de Lançamento de Módulos (Mapa, GeoAnálises, Hidrologia, Água Subterrânea, Geoperigos, IA, Dossiê)
 *  - Visão geral das últimas análises e métricas zonais do estudo ativo
 *  - Estado e Quota BYO-GEE (Google Earth Engine via OAuth 2.0 / GCP Project ID)
 *  - Conformidade estrita: ícones SVG puros (Lucide React) e restrições de segurança geológica
 */

import React from "react";
import {
  Globe,
  Satellite,
  Droplets,
  Droplet,
  AlertTriangle,
  BrainCircuit,
  FileText,
  Plus,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
  Cpu,
  Settings,
  ShieldCheck,
  BarChart3,
  Sprout,
  Building2,
  Leaf,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGeeAuth } from "@/hooks/useGeeAuth";
import { useProject } from "@/context/ProjectContext";
import type { ProjectCategory } from "@/types/project";
import { Button } from "@/components/ui/button";

interface DashboardPanelProps {
  province?: string | null;
  district?: string | null;
  onTabChange?: (tab: string) => void;
  onOpenProjectModal?: () => void;
  onOpenSettings?: () => void;
}

interface ModuleLauncher {
  id: string;
  tab: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  badgeBgClass: string;
  accentBorder: string;
  tag: string;
}

const MODULE_LAUNCHERS: ModuleLauncher[] = [
  {
    id: "mapa",
    tab: "Mapa",
    title: "Mapa Geoespacial 2D / 3D",
    description: "Navegação cartográfica contínua com DEM Copernicus 30m, desenho vetorial de AOI e inspeção de terreno.",
    icon: <Globe size={22} />,
    colorClass: "text-sky-500",
    badgeBgClass: "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400",
    accentBorder: "hover:border-sky-500/40",
    tag: "Copernicus 30m",
  },
  {
    id: "geoanalises",
    tab: "GeoAnálises",
    title: "GeoAnálises Espectrais",
    description: "Mais de 40 índices biofísicos Sentinel-2 e Landsat (NDVI, NDMI, NDRE, EVI, BSI) sem nuvens.",
    icon: <Satellite size={22} />,
    colorClass: "text-indigo-500",
    badgeBgClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
    accentBorder: "hover:border-indigo-500/40",
    tag: "Sentinel-2 & Landsat",
  },
  {
    id: "bacias",
    tab: "Bacias Hidrográficas",
    title: "Bacias & Rede Hidrográfica",
    description: "Delineação hidrológica automática, direção D8, acumulação de fluxo e morfometria fluvial contínua.",
    icon: <Droplets size={22} />,
    colorClass: "text-cyan-500",
    badgeBgClass: "bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400",
    accentBorder: "hover:border-cyan-500/40",
    tag: "Modelação D8",
  },
  {
    id: "agua_subterranea",
    tab: "Água Subterrânea",
    title: "Potencial Hidrogeológico",
    description: "Modelação multicritério AHP para potencial hidrogeológico e vulnerabilidade aquífera DRASTIC.",
    icon: <Droplet size={22} />,
    colorClass: "text-teal-500",
    badgeBgClass: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400",
    accentBorder: "hover:border-teal-500/40",
    tag: "AHP & Aquíferos",
  },
  {
    id: "geoperigos",
    tab: "Geoperigos",
    title: "Geoperigos & Riscos Naturais",
    description: "Deteção de cheias via radar SAR Sentinel-1, suscetibilidade a deslizamentos e anomalias de relevo.",
    icon: <AlertTriangle size={22} />,
    colorClass: "text-amber-500",
    badgeBgClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400",
    accentBorder: "hover:border-amber-500/40",
    tag: "Sentinel-1 SAR",
  },
  {
    id: "geomoz_ai",
    tab: "GeoMoz AI",
    title: "GeoMoz AI Agent",
    description: "Agente geoespacial autónomo para transformar pedidos analíticos em sequências GIS/GEE completas.",
    icon: <BrainCircuit size={22} />,
    colorClass: "text-purple-500",
    badgeBgClass: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400",
    accentBorder: "hover:border-purple-500/40",
    tag: "Agente Inteligente",
  },
  {
    id: "exportar",
    tab: "Exportar",
    title: "Dossiê do Estudo & Exportar",
    description: "Geração de dossiê técnico estruturado em PDF institucional, HTML executivo e GeoTIFFs raster.",
    icon: <FileText size={22} />,
    colorClass: "text-emerald-500",
    badgeBgClass: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400",
    accentBorder: "hover:border-emerald-500/40",
    tag: "PDF, HTML & TIFF",
  },
];

export default function DashboardPanel({
  onTabChange,
  onOpenProjectModal,
  onOpenSettings,
}: DashboardPanelProps) {
  const { user } = useAuth();
  const { geeConnected, geeProject } = useGeeAuth();
  const { projects, activeProject, activeRuns, setActiveProject, runsLoading } = useProject();

  const getCategoryIcon = (category?: ProjectCategory) => {
    switch (category) {
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

  const getCategoryLabel = (category?: ProjectCategory) => {
    switch (category) {
      case "agricultura":
        return "Agricultura & Segurança Alimentar";
      case "recursos_hidricos":
        return "Recursos Hídricos & Aquíferos";
      case "ordenamento_territorial":
        return "Ordenamento Territorial";
      case "geoperigos":
        return "Geoperigos & Riscos";
      case "conservacao_ambiental":
        return "Conservação Ambiental";
      case "estudo_geral":
      default:
        return "Estudo Geral";
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* 1. Header Banner & Quick Actions */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-slate-800">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-sky-500/10 to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-semibold">
                <ShieldCheck size={14} />
                <span>Centro de Comando Geoespacial</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                GeoMoz <span className="text-sky-400">Explorer</span>
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Plataforma profissional de estudos geoespaciais integrados. Conduza projetos desde a delimitação da área de estudo, processamento de satélite, modelação hidrológica até à emissão de dossiês técnicos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button
                onClick={onOpenProjectModal}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>Novo Projeto de Estudo</span>
              </Button>

              <Button
                onClick={onOpenSettings}
                variant="outline"
                className="bg-slate-800/80 hover:bg-slate-750 text-slate-200 border-slate-700 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
              >
                <Settings size={15} />
                <span>Definições</span>
              </Button>
            </div>
          </div>

          {/* Quick Info Strip */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-slate-300">
                <FolderKanban size={14} className="text-sky-400" />
                <span>Total de Projetos: <strong className="text-white font-bold">{projects.length}</strong></span>
              </div>
              <div className="h-3.5 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-slate-300">
                <BarChart3 size={14} className="text-emerald-400" />
                <span>Análises no Estudo Ativo: <strong className="text-white font-bold">{activeRuns.length}</strong></span>
              </div>
            </div>

            <button
              onClick={onOpenSettings}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                geeConnected
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-900/40"
                  : "bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900/40"
              }`}
            >
              {geeConnected ? (
                <>
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>Quota GEE Ativa ({geeProject || "Projeto Google Cloud"})</span>
                </>
              ) : (
                <>
                  <AlertCircle size={13} className="text-amber-400" />
                  <span>Conectar Quota Earth Engine</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Active Project Workspace (Estudo Ativo) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban size={18} className="text-sky-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Estudo Geoespacial em Curso
              </h2>
            </div>
            <button
              onClick={onOpenProjectModal}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Gerir Projetos & Histórico</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {activeProject ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-sky-500/40 transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {getCategoryIcon(activeProject.category)}
                      {getCategoryLabel(activeProject.category)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 size={11} /> Estudo Ativo
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {activeProject.name}
                  </h3>

                  {activeProject.description && (
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      {activeProject.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-sky-500 shrink-0" />
                      <span>Área de Estudo: <strong className="text-slate-700 dark:text-slate-200">{activeProject.aoi.label}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-indigo-500 shrink-0" />
                      <span>Criado em: {new Date(activeProject.createdAt).toLocaleDateString("pt-MZ")}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap lg:flex-col items-stretch gap-2 shrink-0">
                  <Button
                    onClick={() => onTabChange?.("Mapa")}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Globe size={14} />
                    <span>Ver no Mapa 3D</span>
                  </Button>

                  <Button
                    onClick={() => onTabChange?.("GeoAnálises")}
                    variant="outline"
                    className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Satellite size={14} className="text-indigo-500" />
                    <span>Calcular Índices</span>
                  </Button>

                  <Button
                    onClick={() => onTabChange?.("Exportar")}
                    variant="outline"
                    className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileText size={14} className="text-emerald-500" />
                    <span>Dossiê & Relatório</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center mx-auto">
                <FolderKanban size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Nenhum Estudo Selecionado
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Crie ou ative um projeto de estudo para vincular automaticamente as suas análises de satélite, dados de drenagem e relatórios exportáveis.
                </p>
              </div>
              <Button
                onClick={onOpenProjectModal}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Criar Primeiro Estudo</span>
              </Button>
            </div>
          )}

          {/* Quick Project Switcher (if user has multiple projects) */}
          {projects.length > 1 && (
            <div className="bg-slate-100/70 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200/80 dark:border-slate-800">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FolderKanban size={12} />
                <span>Outros Estudos Disponíveis</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {projects
                  .filter((p) => p.id !== activeProject?.id)
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProject(p)}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-sky-400 transition-all text-left cursor-pointer group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-sky-500">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {p.aoi.label}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 shrink-0">
                        Ativar →
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Module Portals (Portais de Lançamento) */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers size={18} className="text-indigo-500" />
              <span>Módulos de Investigação & Análise</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Selecione o módulo para iniciar processamento de satélite ou modelação territorial.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {MODULE_LAUNCHERS.map((mod) => (
              <div
                key={mod.id}
                onClick={() => onTabChange?.(mod.tab)}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all cursor-pointer group ${mod.accentBorder}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${mod.badgeBgClass} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}>
                      <span className={mod.colorClass}>{mod.icon}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {mod.tag}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-sky-500 transition-colors">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {mod.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-sky-500">
                  <span>Abrir Módulo</span>
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Recent Study Runs & Metrics Overview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-500" />
              <span>Resultados & Análises do Estudo Ativo</span>
            </h2>
            {activeRuns.length > 0 && (
              <button
                onClick={() => onTabChange?.("Exportar")}
                className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Exportar Dossiê Completo</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          {runsLoading ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Loader2 size={24} className="animate-spin text-sky-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">A carregar registos de análise…</p>
            </div>
          ) : activeRuns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeRuns.slice(0, 4).map((run) => (
                <div
                  key={run.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {run.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        Sensor: {run.sensor} · Código: {run.code}
                      </div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800 shrink-0">
                      {new Date(run.createdAt).toLocaleDateString("pt-MZ")}
                    </span>
                  </div>

                  {run.metrics && (
                    <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-center">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">Média</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.mean !== undefined ? run.metrics.mean.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">Mín</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.min !== undefined ? run.metrics.min.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">Máx</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.max !== undefined ? run.metrics.max.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">Desvio</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.stdDev !== undefined ? run.metrics.stdDev.toFixed(3) : "—"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="truncate">
                      Janela: {run.dateRange.start} a {run.dateRange.end}
                    </span>
                    <button
                      onClick={() => onTabChange?.("Exportar")}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-semibold shrink-0 cursor-pointer"
                    >
                      Dossiê →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-slate-500 space-y-2">
              <BarChart3 size={28} className="mx-auto text-slate-400" />
              <p className="text-xs font-medium">
                Ainda não foram guardadas análises para este projeto de estudo.
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Calcule um índice biofísico no módulo <strong>GeoAnálises</strong> ou use o <strong>GeoMoz AI</strong> para gerar os primeiros resultados.
              </p>
            </div>
          )}
        </div>

        {/* 5. Cloud Infrastructure & BYO-GEE Quota Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center shrink-0">
                <Cpu size={20} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Infraestrutura de Processamento (BYO-GEE)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modelo Bring-Your-Own-GEE com autenticação OAuth 2.0 Google Cloud.
                </p>
              </div>
            </div>

            <Button
              onClick={onOpenSettings}
              variant="outline"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Settings size={13} />
              <span>Gerir Credenciais</span>
            </Button>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed">
            <p>
              <strong>Isolamento Total de Quota:</strong> Cada utilizador autentica-se com a sua conta Google e define o seu próprio <em>Google Cloud Earth Engine Project ID</em>. O processamento de imagens de satélite e computação em nuvem é faturado diretamente à quota do seu projeto GCP, garantindo total privacidade e independência.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium">
              <span className="text-slate-500">Estado:</span>
              {geeConnected ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle2 size={12} /> Conectado ({geeProject || "Quota Ativa"})
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-bold">
                  <AlertCircle size={12} /> Pendente de Configuração
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 6. Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
          GeoMoz Explorer · Infraestrutura Geoespacial de Moçambique · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
