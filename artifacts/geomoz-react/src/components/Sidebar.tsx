import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  LayoutDashboard,
  Globe,
  Satellite,
  Droplets,
  Droplet,
  AlertTriangle,
  BrainCircuit,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  LogOut,
  LogIn,
  Sprout,
  Building2,
  Leaf,
  Sun,
  Moon,
  X,
  Download,
  Cpu,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useGeeAuth } from "@/hooks/useGeeAuth";
import { useProject } from "@/context/ProjectContext";
import { usePwa } from "@/lib/pwa";
import type { ProjectCategory } from "@/types/project";

// Backward compatibility export
export interface LayerState {
  provinces: boolean;
  districts: boolean;
  geology: boolean;
}

export interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  onOpenProjectModal?: () => void;
  onOpenSettings?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "Dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "Mapa", label: "Mapa 2D / 3D", icon: <Globe size={20} /> },
  { id: "GeoAnálises", label: "GeoAnálises", icon: <Satellite size={20} /> },
  { id: "Bacias Hidrográficas", label: "Bacias Hidrográficas", icon: <Droplets size={20} /> },
  { id: "Água Subterrânea", label: "Água Subterrânea", icon: <Droplet size={20} /> },
  { id: "Geoperigos", label: "Geoperigos", icon: <AlertTriangle size={20} /> },
  { id: "GeoProcessamento", label: "GeoProcessamento", icon: <Cpu size={20} /> },
  { id: "GeoMoz AI", label: "GeoMoz AI Agent", icon: <BrainCircuit size={20} /> },
  { id: "Exportar", label: "Dossiê & Exportar", icon: <FileText size={20} /> },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  onOpenProjectModal,
  onOpenSettings,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const { geeConnected, geeProject } = useGeeAuth();
  const { activeProject, activeRuns } = useProject();
  const { canInstall, isStandalone, promptInstall } = usePwa();

  // Dark mode theme state synchronized with landing page & localStorage
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("geomoz_theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("geomoz_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("geomoz_theme", "light");
    }
    window.dispatchEvent(
      new CustomEvent("geomoz_theme_changed", { detail: isDark ? "dark" : "light" })
    );
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const getCategoryIcon = (cat?: ProjectCategory) => {
    switch (cat) {
      case "agricultura":
        return <Sprout size={15} className="text-emerald-500 shrink-0" />;
      case "recursos_hidricos":
        return <Droplets size={15} className="text-cyan-500 shrink-0" />;
      case "ordenamento_territorial":
        return <Building2 size={15} className="text-indigo-500 shrink-0" />;
      case "geoperigos":
        return <AlertTriangle size={15} className="text-amber-500 shrink-0" />;
      case "conservacao_ambiental":
        return <Leaf size={15} className="text-teal-500 shrink-0" />;
      case "estudo_geral":
      default:
        return <Globe size={15} className="text-sky-500 shrink-0" />;
    }
  };

  const handleNavClick = (tabId: string) => {
    onTabChange(tabId);
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none border-r border-slate-200/90 dark:border-slate-850 transition-colors duration-200">
      {/* 1. Header: Brand Logo & Collapse Toggle */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-850 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-3 overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
          title="GeoMoz Explorer — Início"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
            <Globe size={20} />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-slate-900 dark:text-white tracking-tight text-base whitespace-nowrap">
                GeoMoz <span className="text-sky-600 dark:text-sky-400">Explorer</span>
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-normal truncate">
                Estudos Geoespaciais
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
        >
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>

        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Fechar menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* 2. Active Study / Project Card */}
      <div className="p-3 border-b border-slate-200/80 dark:border-slate-850 shrink-0">
        {activeProject ? (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className={`w-full text-left rounded-xl p-3 transition-all border cursor-pointer ${
              collapsed
                ? "flex justify-center bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                : "bg-slate-50/80 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-sky-500/60 dark:hover:border-sky-500/60 hover:bg-sky-50/40 dark:hover:bg-slate-850 shadow-xs"
            }`}
            title={`Estudo Ativo: ${activeProject.name} (Clique para alternar ou gerir)`}
          >
            {collapsed ? (
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <FolderKanban size={17} />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <FolderKanban size={13} /> Estudo Ativo
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                    {activeRuns.length} runs
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
                  {getCategoryIcon(activeProject.category)}
                  <span className="truncate">{activeProject.name}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                  {activeProject.aoi.label}
                </div>
              </div>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className={`w-full text-left rounded-xl p-3 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-sky-500/60 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50/30 dark:hover:bg-slate-900/50 transition-all cursor-pointer ${
              collapsed ? "flex justify-center" : "flex items-center gap-2.5"
            }`}
            title="Clique para criar ou selecionar um Projeto de Estudo"
          >
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Plus size={16} />
            </div>
            {!collapsed && (
              <div className="text-sm font-semibold truncate">
                <span>Criar / Selecionar Estudo</span>
              </div>
            )}
          </button>
        )}
      </div>

      {/* 3. Main Navigation Links */}
      <nav className="flex-1 px-2.5 py-3.5 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all group cursor-pointer ${
                isActive
                  ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/90 dark:hover:bg-slate-900"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <div
                className={`shrink-0 transition-transform duration-200 group-hover:scale-105 ${
                  isActive ? "text-white" : "text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200"
                }`}
              >
                {item.icon}
              </div>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* 4. Footer: GEE Status, Dark/Light Mode, Settings & User Profile */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-850 space-y-2 shrink-0 bg-slate-50/70 dark:bg-slate-900/60">
        {/* GEE Quota Button / Indicator */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs transition-colors border cursor-pointer ${
            geeConnected
              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
          } ${collapsed ? "justify-center p-2" : ""}`}
          title={
            geeConnected
              ? `Google Earth Engine Conectado (Projeto: ${geeProject || "Padrão"})`
              : "Conectar Google Earth Engine (Clique para configurar)"
          }
        >
          <div className="shrink-0">
            {geeConnected ? (
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle size={16} className="text-amber-600 dark:text-amber-400" />
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-bold leading-tight truncate">
                {geeConnected ? "GEE Conectado" : "Conectar GEE"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {geeConnected ? geeProject || "Quota Ativa" : "Requer autenticação"}
              </div>
            </div>
          )}
        </button>

        {/* Theme (Day / Night) & Settings Row */}
        <div className="flex items-center gap-1.5">
          {/* Day / Night Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
              collapsed ? "w-full justify-center px-0" : "flex-1"
            } ${
              isDark
                ? "bg-slate-900 border-slate-800 text-amber-400 hover:text-amber-300 hover:border-slate-700"
                : "bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-xs"
            }`}
            title={isDark ? "Mudar para Modo Claro" : "Mudar para Modo Noturno"}
          >
            {isDark ? <Sun size={17} className="shrink-0" /> : <Moon size={17} className="shrink-0 text-slate-600" />}
            {!collapsed && (
              <span className="truncate text-xs font-bold">
                {isDark ? "Modo Claro" : "Modo Noturno"}
              </span>
            )}
          </button>

          {/* PWA Install button */}
          {!isStandalone && canInstall && (
            <button
              type="button"
              onClick={promptInstall}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-all cursor-pointer shadow-xs ${
                collapsed ? "w-full justify-center px-0 mt-1" : ""
              }`}
              title="Instalar GeoMoz Explorer como Aplicação"
            >
              <Download size={15} className="shrink-0 text-sky-500" />
              {!collapsed && <span>Instalar App</span>}
            </button>
          )}

          {/* Settings button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs ${
              collapsed ? "w-full justify-center px-0 mt-1" : ""
            }`}
            title="Definições do Sistema"
          >
            <Settings size={17} className="shrink-0" />
            {!collapsed && <span className="text-xs font-bold">Definições</span>}
          </button>
        </div>

        {/* User Account / Sign In */}
        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-850">
          {user ? (
            <div
              className={`flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-700 shrink-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Utilizador"}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <AvatarFallback className="bg-sky-600 text-white text-xs font-bold">
                      {user.email ? user.email.slice(0, 2).toUpperCase() : "U"}
                    </AvatarFallback>
                  )}
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                      {user.displayName || user.email?.split("@")[0]}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
                  </div>
                )}
              </div>
              {!collapsed && (
                <button
                  onClick={() => signOut()}
                  className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  title="Terminar Sessão"
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenSettings}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-sm font-bold transition-all shadow-md shadow-sky-600/20 cursor-pointer ${
                collapsed ? "justify-center px-0" : ""
              }`}
              title="Iniciar Sessão"
            >
              <LogIn size={17} />
              {!collapsed && <span>Entrar na Conta</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left) */}
      <aside
        className={`hidden md:flex flex-col shrink-0 transition-all duration-300 z-40 ${
          collapsed ? "w-[72px]" : "w-64 xl:w-72"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[1000] flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl animate-in slide-in-from-left duration-200 z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
