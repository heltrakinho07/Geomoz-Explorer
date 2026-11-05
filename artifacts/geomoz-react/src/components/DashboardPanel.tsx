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
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import type { PortalCopyKey } from "@/i18n/portal";
import "./dashboard-glass.css";
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
  titleKey: PortalCopyKey;
  descriptionKey: PortalCopyKey;
  icon: React.ReactNode;
  colorClass: string;
  badgeBgClass: string;
  accentBorder: string;
  tagKey: PortalCopyKey;
}

const MODULE_LAUNCHERS: ModuleLauncher[] = [
  {
    id: "mapa",
    tab: "Mapa",
    titleKey: "dashboard.module.map.title",
    descriptionKey: "dashboard.module.map.description",
    icon: <Globe size={22} />,
    colorClass: "text-sky-500",
    badgeBgClass: "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400",
    accentBorder: "hover:border-sky-500/40",
    tagKey: "dashboard.tag.copernicus",
  },
  {
    id: "geoanalises",
    tab: "GeoAnálises",
    titleKey: "dashboard.module.analyses.title",
    descriptionKey: "dashboard.module.analyses.description",
    icon: <Satellite size={22} />,
    colorClass: "text-indigo-500",
    badgeBgClass: "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
    accentBorder: "hover:border-indigo-500/40",
    tagKey: "dashboard.tag.sensors",
  },
  {
    id: "bacias",
    tab: "Bacias Hidrográficas",
    titleKey: "dashboard.module.watersheds.title",
    descriptionKey: "dashboard.module.watersheds.description",
    icon: <Droplets size={22} />,
    colorClass: "text-cyan-500",
    badgeBgClass: "bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400",
    accentBorder: "hover:border-cyan-500/40",
    tagKey: "dashboard.tag.d8",
  },
  {
    id: "agua_subterranea",
    tab: "Água Subterrânea",
    titleKey: "dashboard.module.groundwater.title",
    descriptionKey: "dashboard.module.groundwater.description",
    icon: <Droplet size={22} />,
    colorClass: "text-teal-500",
    badgeBgClass: "bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400",
    accentBorder: "hover:border-teal-500/40",
    tagKey: "dashboard.tag.aquifers",
  },
  {
    id: "geoperigos",
    tab: "Geoperigos",
    titleKey: "dashboard.module.hazards.title",
    descriptionKey: "dashboard.module.hazards.description",
    icon: <AlertTriangle size={22} />,
    colorClass: "text-amber-500",
    badgeBgClass: "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400",
    accentBorder: "hover:border-amber-500/40",
    tagKey: "dashboard.tag.sar",
  },
  {
    id: "geomoz_ai",
    tab: "GeoMoz AI",
    titleKey: "dashboard.module.ai.title",
    descriptionKey: "dashboard.module.ai.description",
    icon: <BrainCircuit size={22} />,
    colorClass: "text-purple-500",
    badgeBgClass: "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400",
    accentBorder: "hover:border-purple-500/40",
    tagKey: "dashboard.tag.ai",
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
  const { t, translatedLocale } = usePortalTranslation();
  const dateLocale = ({pt:"pt-MZ",en:"en-GB",es:"es-ES",fr:"fr-FR"} as const)[translatedLocale];

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
        return t("dashboard.category.agriculture");
      case "recursos_hidricos":
        return t("dashboard.category.water");
      case "ordenamento_territorial":
        return t("dashboard.category.planning");
      case "geoperigos":
        return t("dashboard.category.hazards");
      case "conservacao_ambiental":
        return t("dashboard.category.conservation");
      case "estudo_geral":
      default:
        return t("dashboard.category.general");
    }
  };

  return (
    <div className="gm-dashboard flex-1 overflow-y-auto p-4 text-slate-900 dark:text-slate-100 sm:p-6 md:p-8">
      <div className="gm-dashboard-content mx-auto max-w-6xl space-y-6 sm:space-y-8">
        {/* 1. Header Banner & Quick Actions */}
        <div className="gm-dashboard-hero relative overflow-hidden p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-radial from-sky-500/10 to-transparent" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-semibold">
                <ShieldCheck size={14} />
                <span>{t("dashboard.heroEyebrow")}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                GeoMoz <span className="text-sky-400">Explorer</span>
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                {t("dashboard.heroDescription")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button
                onClick={onOpenProjectModal}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>{t("dashboard.newStudy")}</span>
              </Button>

              <Button
                onClick={onOpenSettings}
                variant="outline"
                className="gm-dashboard-hero__action flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm"
              >
                <Settings size={15} />
                <span>{t("sidebar.settings")}</span>
              </Button>
            </div>
          </div>

          {/* Quick Info Strip */}
          <div className="gm-dashboard-hero__divider mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-slate-300">
                <FolderKanban size={14} className="text-sky-400" />
                <span>{t("dashboard.totalProjects")} <strong className="text-white font-bold">{projects.length}</strong></span>
              </div>
              <div className="h-3.5 w-px bg-slate-800" />
              <div className="flex items-center gap-1.5 text-slate-300">
                <BarChart3 size={14} className="text-emerald-400" />
                <span>{t("dashboard.activeAnalyses")} <strong className="text-white font-bold">{activeRuns.length}</strong></span>
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
                  <span>{t("dashboard.geeActive")} ({geeProject || t("dashboard.googleProject")})</span>
                </>
              ) : (
                <>
                  <AlertCircle size={13} className="text-amber-400" />
                  <span>{t("dashboard.connectQuota")}</span>
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
                {t("dashboard.currentStudy")}
              </h2>
            </div>
            <button
              onClick={onOpenProjectModal}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t("dashboard.manageStudies")}</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {activeProject ? (
            <div className="gm-dashboard-panel gm-dashboard-panel--active p-5 transition-all sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {getCategoryIcon(activeProject.category)}
                      {getCategoryLabel(activeProject.category)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 size={11} /> {t("dashboard.activeStudy")}
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
                      <span>{t("dashboard.aoiLabel")} <strong className="text-slate-700 dark:text-slate-200">{activeProject.aoi.label}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-indigo-500 shrink-0" />
                      <span>{t("dashboard.createdAt")} {new Date(activeProject.createdAt).toLocaleDateString(dateLocale)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap lg:flex-col items-stretch gap-2 shrink-0">
                  <Button
                    onClick={() => onTabChange?.("Mapa")}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Globe size={14} />
                    <span>{t("dashboard.viewMap")}</span>
                  </Button>

                  <Button
                    onClick={() => onTabChange?.("GeoAnálises")}
                    variant="outline"
                    className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Satellite size={14} className="text-indigo-500" />
                    <span>{t("dashboard.calculateIndices")}</span>
                  </Button>

                  <Button
                    onClick={() => onTabChange?.("Exportar")}
                    variant="outline"
                    className="border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileText size={14} className="text-emerald-500" />
                    <span>{t("dashboard.reportAction")}</span>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="gm-dashboard-panel gm-dashboard-panel--empty space-y-4 p-6 text-center sm:p-8">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center mx-auto">
                <FolderKanban size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {t("dashboard.noStudyTitle")}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {t("dashboard.noStudy")}
                </p>
              </div>
              <Button
                onClick={onOpenProjectModal}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs px-4 py-2 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>{t("dashboard.createFirstStudy")}</span>
              </Button>
            </div>
          )}

          {/* Quick Project Switcher (if user has multiple projects) */}
          {projects.length > 1 && (
            <div className="gm-dashboard-switcher p-3">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FolderKanban size={12} />
                <span>{t("dashboard.otherStudies")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {projects
                  .filter((p) => p.id !== activeProject?.id)
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProject(p)}
                      className="gm-dashboard-project-switch group flex cursor-pointer items-center justify-between p-2.5 text-left"
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
                        {t("dashboard.activate")} →
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
              <span>{t("dashboard.modulesHeading")}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("dashboard.modulesDescription")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
            {MODULE_LAUNCHERS.map((mod) => (
              <button
                type="button"
                key={mod.id}
                data-module={mod.id}
                aria-label={`${t("dashboard.openModule")}: ${t(mod.titleKey)}`}
                onClick={() => onTabChange?.(mod.tab)}
                className="gm-dashboard-module group flex flex-col justify-between gap-4 p-4 sm:p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`gm-dashboard-module__icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 ${mod.badgeBgClass}`}>
                      <span className={mod.colorClass}>{mod.icon}</span>
                    </div>
                    <span className="gm-dashboard-module__tag px-2.5 py-1 text-[10px] font-semibold">
                      {t(mod.tagKey)}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-sky-500 transition-colors">
                    {t(mod.titleKey)}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {t(mod.descriptionKey)}
                  </p>
                </div>

                <div className="gm-dashboard-module__footer flex items-center justify-between gap-3 border-t pt-3 text-xs font-bold">
                  <span>{t("dashboard.openModule")}</span>
                  <span className="gm-dashboard-module__arrow" aria-hidden="true"><ArrowRight size={14} /></span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Recent Study Runs & Metrics Overview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-500" />
              <span>{t("dashboard.resultsHeading")}</span>
            </h2>
            {activeRuns.length > 0 && (
              <button
                onClick={() => onTabChange?.("Exportar")}
                className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t("dashboard.exportReport")}</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          {runsLoading ? (
            <div className="gm-dashboard-panel p-8 text-center">
              <Loader2 size={24} className="animate-spin text-sky-500 mx-auto mb-2" />
              <p className="text-xs text-slate-400">{t("dashboard.loadingRuns")}</p>
            </div>
          ) : activeRuns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeRuns.slice(0, 4).map((run) => (
                <div
                  key={run.id}
                  className="gm-dashboard-run space-y-2.5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {run.name}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        {t("dashboard.sensor")} {run.sensor} · {t("dashboard.code")} {run.code}
                      </div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 font-semibold border border-sky-200 dark:border-sky-800 shrink-0">
                      {new Date(run.createdAt).toLocaleDateString(dateLocale)}
                    </span>
                  </div>

                  {run.metrics && (
                    <div className="gm-dashboard-metrics grid grid-cols-4 gap-1.5 rounded-lg p-2 text-center">
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">{t("dashboard.mean")}</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.mean !== undefined ? run.metrics.mean.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">{t("dashboard.min")}</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.min !== undefined ? run.metrics.min.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">{t("dashboard.max")}</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.max !== undefined ? run.metrics.max.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-400 uppercase font-medium">{t("dashboard.stdDev")}</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {run.metrics.stdDev !== undefined ? run.metrics.stdDev.toFixed(3) : "—"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span className="truncate">
                      {t("dashboard.window")} {run.dateRange.start} — {run.dateRange.end}
                    </span>
                    <button
                      onClick={() => onTabChange?.("Exportar")}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-semibold shrink-0 cursor-pointer"
                    >
                      {t("dashboard.shortReport")} →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="gm-dashboard-panel space-y-2 p-6 text-center text-slate-500">
              <BarChart3 size={28} className="mx-auto text-slate-400" />
              <p className="text-xs font-medium">
                {t("dashboard.noRuns")}
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                {t("dashboard.noRunsHint")}
              </p>
            </div>
          )}
        </div>

        {/* 5. Cloud Infrastructure & BYO-GEE Quota Card */}
        <div className="gm-dashboard-panel space-y-4 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center shrink-0">
                <Cpu size={20} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {t("dashboard.geeInfrastructure")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("dashboard.geeInfo")}
                </p>
              </div>
            </div>

            <Button
              onClick={onOpenSettings}
              variant="outline"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Settings size={13} />
              <span>{t("dashboard.manageCredentials")}</span>
            </Button>
          </div>

          <div className="gm-dashboard-infra-note space-y-1 rounded-xl p-3.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <p>
              <strong>{t("dashboard.quotaIsolationLabel")}</strong> {t("dashboard.quotaIsolationDescription")}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] font-medium">
              <span className="text-slate-500">{t("dashboard.status")}</span>
              {geeConnected ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle2 size={12} /> {t("dashboard.connected")} ({geeProject || t("sidebar.quotaActive")})
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-bold">
                  <AlertCircle size={12} /> {t("dashboard.pending")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 6. Footer */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
          GeoMoz Explorer · {t("dashboard.footer")} · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
