import React, { useState } from "react";
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
  Cpu,
  Layers,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useGeeAuth } from "@/hooks/useGeeAuth";
import { useProject } from "@/context/ProjectContext";
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
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "Dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { id: "Mapa", label: "Mapa 2D / 3D", icon: <Globe size={17} /> },
  { id: "GeoAnálises", label: "GeoAnálises", icon: <Satellite size={17} /> },
  { id: "Bacias Hidrográficas", label: "Bacias Hidrográficas", icon: <Droplets size={17} /> },
  { id: "Água Subterrânea", label: "Água Subterrânea", icon: <Droplet size={17} /> },
  { id: "Geoperigos", label: "Geoperigos", icon: <AlertTriangle size={17} /> },
  { id: "GeoMoz AI", label: "GeoMoz AI Agent", icon: <BrainCircuit size={17} /> },
  { id: "Exportar", label: "Dossiê & Exportar", icon: <FileText size={17} /> },
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

  const getCategoryIcon = (cat?: ProjectCategory) => {
    switch (cat) {
      case "agricultura":
        return <Sprout size={13} className="text-emerald-500" />;
      case "recursos_hidricos":
        return <Droplets size={13} className="text-cyan-500" />;
      case "ordenamento_territorial":
        return <Building2 size={13} className="text-indigo-500" />;
      case "geoperigos":
        return <AlertTriangle size={13} className="text-amber-500" />;
      case "conservacao_ambiental":
        return <Leaf size={13} className="text-teal-500" />;
      case "estudo_geral":
      default:
        return <Globe size={13} className="text-sky-500" />;
    }
  };

  const handleNavClick = (tabId: string) => {
    onTabChange(tabId);
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 select-none border-r border-slate-800">
      {/* 1. Header: Brand Logo & Collapse Toggle */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-slate-800/80 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2.5 overflow-hidden hover:opacity-90 transition-opacity"
          title="GeoMoz Explorer — Início"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Globe size={17} />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-white tracking-tight text-sm whitespace-nowrap">
                GeoMoz <span className="text-sky-400">Explorer</span>
              </span>
              <span className="text-[9px] text-slate-400 font-medium tracking-wide">
                Estudos Geoespaciais
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={() => setCollapsed((v) => !v)}
          className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>

        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1 text-slate-400 hover:text-white"
            title="Fechar menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 2. Active Study / Project Card */}
      <div className="p-2.5 border-b border-slate-800/60 shrink-0">
        {activeProject ? (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className={`w-full text-left rounded-xl p-2.5 transition-all border ${
              collapsed
                ? "flex justify-center bg-slate-800/60 border-slate-700/60"
                : "bg-gradient-to-br from-slate-800/80 to-slate-850 border-slate-700/70 hover:border-sky-500/50 hover:bg-slate-800"
            }`}
            title={`Estudo Ativo: ${activeProject.name} (Clique para alternar ou gerir)`}
          >
            {collapsed ? (
              <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <FolderKanban size={14} />
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-sky-400 flex items-center gap-1">
                    <FolderKanban size={10} /> Estudo Ativo
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 font-medium">
                    {activeRuns.length} runs
                  </span>
                </div>
                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  {getCategoryIcon(activeProject.category)}
                  <span className="truncate">{activeProject.name}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {activeProject.aoi.label}
                </div>
              </div>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenProjectModal}
            className={`w-full text-left rounded-xl p-2 border border-dashed border-slate-700 hover:border-sky-400/60 text-slate-400 hover:text-sky-300 hover:bg-slate-800/50 transition-all ${
              collapsed ? "flex justify-center" : "flex items-center gap-2"
            }`}
            title="Clique para criar ou selecionar um Projeto de Estudo"
          >
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
              <Plus size={13} />
            </div>
            {!collapsed && (
              <div className="text-xs font-medium truncate">
                <span>Selecionar / Criar Estudo</span>
              </div>
            )}
          </button>
        )}
      </div>

      {/* 3. Main Navigation Links */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
              } ${collapsed ? "justify-center px-0" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <div
                className={`shrink-0 transition-transform group-hover:scale-105 ${
                  isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                }`}
              >
                {item.icon}
              </div>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* 4. Footer: GEE Status, Settings & User Profile */}
      <div className="p-2.5 border-t border-slate-800/80 space-y-1.5 shrink-0 bg-slate-950/40">
        {/* GEE Quota Button / Indicator */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2 p-2 rounded-xl text-xs transition-colors border ${
            geeConnected
              ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/40"
              : "bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-900/40"
          } ${collapsed ? "justify-center p-2" : ""}`}
          title={
            geeConnected
              ? `Google Earth Engine Conectado (Projeto: ${geeProject || "Padrão"})`
              : "Conectar Google Earth Engine (Clique para configurar)"
          }
        >
          <div className="shrink-0">
            {geeConnected ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : (
              <AlertCircle size={14} className="text-amber-400" />
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[11px] font-bold leading-tight truncate">
                {geeConnected ? "GEE Conectado" : "Conectar GEE"}
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                {geeConnected ? geeProject || "Quota Ativa" : "Requer autenticação"}
              </div>
            </div>
          )}
        </button>

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
            collapsed ? "justify-center px-0" : ""
          }`}
          title="Definições do Sistema"
        >
          <Settings size={16} className="shrink-0" />
          {!collapsed && <span>Definições</span>}
        </button>

        {/* User Account / Sign In */}
        <div className="pt-1.5 border-t border-slate-800/60">
          {user ? (
            <div
              className={`flex items-center justify-between p-1.5 rounded-xl bg-slate-800/40 ${
                collapsed ? "justify-center" : ""
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-7 w-7 border border-slate-700 shrink-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Utilizador"}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <AvatarFallback className="bg-sky-600 text-white text-[10px] font-bold">
                      {user.email ? user.email.slice(0, 2).toUpperCase() : "U"}
                    </AvatarFallback>
                  )}
                </Avatar>
                {!collapsed && (
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">
                      {user.displayName || user.email?.split("@")[0]}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                  </div>
                )}
              </div>
              {!collapsed && (
                <button
                  onClick={() => signOut()}
                  className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-750 transition-colors shrink-0"
                  title="Terminar Sessão"
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenSettings}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all ${
                collapsed ? "justify-center px-0" : ""
              }`}
              title="Iniciar Sessão"
            >
              <LogIn size={15} />
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
          collapsed ? "w-[68px]" : "w-60 xl:w-64"
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
          <div className="relative w-64 max-w-[80vw] h-full shadow-2xl animate-in slide-in-from-left duration-200 z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
