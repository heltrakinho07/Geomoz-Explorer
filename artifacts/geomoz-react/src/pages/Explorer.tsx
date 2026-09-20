import React, { useRef, useState, useEffect, Suspense } from "react";
import { Link } from "wouter";
import {
  Globe,
  Settings,
  Search,
  X,
  Loader2,
  MapPin,
  Satellite,
  Droplets,
  AlertTriangle,
  Droplet,
  CheckCircle2,
  AlertCircle,
  XCircle,
  LayoutDashboard,
  BrainCircuit,
  Pen,
  Menu,
  Home,
  LogIn,
  FolderKanban,
  FileText,
  Layers,
  Database,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import Sidebar, { LayerState } from "@/components/Sidebar";
import MapView from "@/components/MapView";
import StatsPanel from "@/components/StatsPanel";
import ExportPanel from "@/components/ExportPanel";
import DashboardPanel from "@/components/DashboardPanel";
import StoryMapModal from "@/components/StoryMapModal";
import SpatialSqlModal from "@/components/SpatialSqlModal";
import {
  LazyGeoAnalises,
  LazyHidroGeoMoz,
  LazyGeoperigos,
  LazyAguaSubterranea,
  LazyGeoMozAI,
} from "@/lib/lazy-pages";
import { apiFetch } from "@/lib/api";
import SettingsDialog from "@/components/SettingsDialog";
import GeeCredentialsDialog from "@/components/GeeCredentialsDialog";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/hooks/useAuth";
import { useGeeAuth } from "@/hooks/useGeeAuth";
import { useProject } from "@/context/ProjectContext";
import ProjectWorkspaceModal from "@/components/ProjectWorkspaceModal";
import ZoneSelect from "@/components/ZoneSelect";
import type { AreaOfInterest } from "@/lib/aoi";
import { mozambiqueAOI, GLOBAL_AOI, customAOI } from "@/lib/aoi";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

type Tab =
  | "Dashboard"
  | "Mapa"
  | "Análise"
  | "GeoAnálises"
  | "Bacias Hidrográficas"
  | "Água Subterrânea"
  | "Geoperigos"
  | "GeoMoz AI"
  | "Exportar";

export default function Explorer() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { geeConnected, geeProject } = useGeeAuth();
  const { activeProject } = useProject();

  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState("code2006");
  const [layers, setLayers] = useState<LayerState>({
    provinces: true,
    districts: false,
    geology: false, // Security constraint: default false
  });

  const getInitialTab = (): Tab => {
    if (typeof window === "undefined") return "Dashboard";
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = new URLSearchParams(window.location.search);
    const tabParam = search.get("tab")?.toLowerCase();

    if (path.includes("analis") || hash.includes("analis") || tabParam?.includes("analis")) {
      return "GeoAnálises";
    }
    if (path.includes("hidro") || path.includes("bacia") || hash.includes("hidro") || tabParam?.includes("hidro")) {
      return "Bacias Hidrográficas";
    }
    if (path.includes("agua") || hash.includes("agua") || tabParam?.includes("agua")) {
      return "Água Subterrânea";
    }
    if (path.includes("perigo") || hash.includes("perigo") || tabParam?.includes("perigo")) {
      return "Geoperigos";
    }
    if (path.includes("ai") || hash.includes("ai") || tabParam?.includes("ai")) {
      return "GeoMoz AI";
    }
    if (path.includes("mapa") || hash.includes("mapa") || tabParam?.includes("mapa")) {
      return "Mapa";
    }
    if (path.includes("export") || hash.includes("export") || tabParam?.includes("export")) {
      return "Exportar";
    }
    return "Dashboard";
  };

  const [activeTab, setActiveTabState] = useState<Tab>(getInitialTab);

  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    try {
      const slugMap: Record<Tab, string> = {
        Dashboard: "dashboard",
        Mapa: "mapa",
        Análise: "estatisticas",
        GeoAnálises: "analises",
        "Bacias Hidrográficas": "hidrografia",
        "Água Subterrânea": "agua-subterranea",
        Geoperigos: "geoperigos",
        "GeoMoz AI": "geomoz-ai",
        Exportar: "exportar",
      };
      const slug = slugMap[tab];
      const newUrl = slug ? `/${slug}` : "/app";
      if (window.location.pathname !== newUrl && window.location.pathname !== "/") {
        window.history.replaceState({ tab }, "", newUrl);
      }
    } catch {}
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveTabState(getInitialTab());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [mapCenter, setMapCenter] = useState<[number, number]>([-18, 35]);
  const [mapZoom, setMapZoom] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geeDialogOpen, setGeeDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [storyMapOpen, setStoryMapOpen] = useState(false);
  const [spatialSqlOpen, setSpatialSqlOpen] = useState(false);

  // Sync AOI and map view when active project changes (keyed on id to prevent circular re-renders)
  const activeProjectId = activeProject?.id;
  useEffect(() => {
    if (activeProject?.aoi) {
      setAOI(activeProject.aoi);
      if (activeProject.aoi.source === "mozambique") {
        setProvince(activeProject.aoi.province);
        setDistrict(activeProject.aoi.district);
      } else {
        setProvince(null);
        setDistrict(null);
      }
      if (activeProject.aoi.bounds) {
        mapRef.current?.flyToBounds(activeProject.aoi.bounds, { padding: [30, 30], duration: 1.2 });
      }
    }
  }, [activeProjectId]);

  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [finishRequest, setFinishRequest] = useState(0);

  // AOI global — permite análises em qualquer parte do mundo
  const [aoi, setAOI] = useState<AreaOfInterest>(
    province ? mozambiqueAOI(province, district) : GLOBAL_AOI
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchWorldwide, setSearchWorldwide] = useState(true);
  const skipAutoSearchRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Global 2D / 3D mode state
  const [globalViewMode, setGlobalViewMode] = useState<"2d" | "3d">(() => {
    try {
      return (localStorage.getItem("geomoz_view_mode") as "2d" | "3d") || "3d";
    } catch {
      return "3d";
    }
  });

  const handleGlobalViewModeChange = (mode: "2d" | "3d") => {
    setGlobalViewMode(mode);
    try {
      localStorage.setItem("geomoz_view_mode", mode);
      window.dispatchEvent(new CustomEvent("geomoz_view_mode_changed", { detail: mode }));
    } catch {}
  };

  useEffect(() => {
    const handleCustom = (e: Event) => {
      const mode = (e as CustomEvent).detail as "2d" | "3d";
      if (mode && (mode === "2d" || mode === "3d")) {
        setGlobalViewMode(mode);
      }
    };
    window.addEventListener("geomoz_view_mode_changed", handleCustom);
    return () => {
      window.removeEventListener("geomoz_view_mode_changed", handleCustom);
    };
  }, []);

  // Mobile search state
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    if (province) {
      setAOI((prev) => {
        if (prev.source === "mozambique" && prev.province === province && prev.district === district) {
          return prev;
        }
        return mozambiqueAOI(province, district);
      });
    }
  }, [province, district]);

  function toggleLayer(key: keyof LayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function runSearch(q: string, worldwide = searchWorldwide) {
    if (!q.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearchLoading(true);
    try {
      const cc = worldwide ? "" : "&countrycodes=mz";
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json${cc}&limit=6`;
      const res = await fetch(url, { headers: { "Accept-Language": "pt" } });
      const data: NominatimResult[] = await res.json();
      setSearchResults(data);
      setShowResults(true);
    } catch (error) {
      console.error("Search error:", error);
      toast({
        variant: "destructive",
        title: "Erro na busca",
        description: "Não foi possível realizar a busca. Tente novamente.",
      });
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    if (skipAutoSearchRef.current) {
      skipAutoSearchRef.current = false;
      return;
    }
    if (searchQuery.trim().length < 3) return;
    const t = setTimeout(() => runSearch(searchQuery), 450);
    return () => clearTimeout(t);
  }, [searchQuery, searchWorldwide]);

  function handleSearchKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch(searchQuery);
    if (e.key === "Escape") setShowResults(false);
  }

  function LoadingSkeleton({ label }: { label: string }) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950 flex items-center justify-center">
            <Loader2 size={24} className="text-sky-500 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              A carregar {label}…
            </p>
            <p className="text-xs text-slate-400 mt-1">Módulo será ativado em segundos</p>
          </div>
        </div>
      </div>
    );
  }

  function flyToResult(result: NominatimResult) {
    const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
    mapRef.current?.flyToBounds(
      [
        [latMin, lonMin],
        [latMax, lonMax],
      ],
      { padding: [30, 30], duration: 1.2 }
    );
    setShowResults(false);
    setMobileSearchOpen(false);
    skipAutoSearchRef.current = true;
    setSearchQuery(result.display_name.split(",")[0]);
    setActiveTab("Mapa");
  }

  function handleAOIChange(newAOI: AreaOfInterest) {
    setDrawingEnabled(false);
    setAOI(newAOI);
    if (newAOI.source === "mozambique") {
      setProvince(newAOI.province);
      setDistrict(newAOI.district);
    }
  }

  function handleDrawComplete(geometry: GeoJSON.GeoJSON, label: string) {
    setDrawingEnabled(false);
    setAOI(customAOI(geometry, label, "draw"));
    setProvince(null);
    setDistrict(null);
    setActiveTab("Mapa");
  }

  function handleDrawCancel() {
    setDrawingEnabled(false);
  }

  function handleClearAOI() {
    setDrawingEnabled(false);
    setAOI(GLOBAL_AOI);
    setProvince(null);
    setDistrict(null);
  }

  const getTabMeta = (tab: Tab) => {
    switch (tab) {
      case "Dashboard":
        return {
          icon: <LayoutDashboard size={18} className="text-sky-500 shrink-0" />,
          title: "Dashboard",
          subtitle: "Centro de Comando & Gestão de Projetos",
        };
      case "Mapa":
        return {
          icon: <Globe size={18} className="text-sky-500 shrink-0" />,
          title: "Mapa Geoespacial",
          subtitle: "2D / 3D Hipsometria & Relevo",
        };
      case "GeoAnálises":
        return {
          icon: <Satellite size={18} className="text-indigo-500 shrink-0" />,
          title: "GeoAnálises Espectrais",
          subtitle: "Índices Biofísicos Sentinel-2 & Landsat",
        };
      case "Bacias Hidrográficas":
        return {
          icon: <Droplets size={18} className="text-cyan-500 shrink-0" />,
          title: "Bacias Hidrográficas",
          subtitle: "Delineação D8 & Rede de Drenagem",
        };
      case "Água Subterrânea":
        return {
          icon: <Droplet size={18} className="text-teal-500 shrink-0" />,
          title: "Água Subterrânea",
          subtitle: "Potencial Hidrogeológico AHP",
        };
      case "Geoperigos":
        return {
          icon: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
          title: "Geoperigos & Riscos",
          subtitle: "Deteção SAR de Cheias & Erosão",
        };
      case "GeoMoz AI":
        return {
          icon: <BrainCircuit size={18} className="text-purple-500 shrink-0" />,
          title: "GeoMoz AI Agent",
          subtitle: "Planeamento Geoespacial Inteligente",
        };
      case "Exportar":
        return {
          icon: <FileText size={18} className="text-emerald-500 shrink-0" />,
          title: "Dossiê do Estudo & Exportação",
          subtitle: "Relatórios Técnicos PDF, HTML & GeoTIFF",
        };
      case "Análise":
      default:
        return {
          icon: <LayoutDashboard size={18} className="text-sky-500 shrink-0" />,
          title: "GeoMoz Explorer",
          subtitle: "Plataforma de Estudos Geoespaciais",
        };
    }
  };

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem("geomoz_theme") as "light" | "dark") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const newTheme = (e as CustomEvent).detail as "light" | "dark";
      if (newTheme) setTheme(newTheme);
    };
    window.addEventListener("geomoz_theme_changed", handleThemeChange);
    return () => window.removeEventListener("geomoz_theme_changed", handleThemeChange);
  }, []);

  const currentTabMeta = getTabMeta(activeTab);

  return (
    <div
      className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-200 ${
        theme === "dark" ? "dark bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* 1. Desktop & Mobile Modern Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenProjectModal={() => setProjectModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* 2. Main Workspace (Clean Topbar + Active View) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white dark:bg-slate-950">
        {/* Decluttered Top Header */}
        <header className="flex-none h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 transition-all">
          {/* Left: Mobile Toggle & Current Module Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Abrir Menu de Navegação"
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              {currentTabMeta.icon}
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {currentTabMeta.title}
                </span>
                <span className="hidden sm:inline text-[10px] text-slate-400 truncate">
                  {currentTabMeta.subtitle}
                </span>
              </div>
            </div>

            {/* 2D / 3D Mode Switcher (on Mapa tab) */}
            {activeTab === "Mapa" && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 ml-2 shrink-0">
                <button
                  onClick={() => handleGlobalViewModeChange("2d")}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all ${
                    globalViewMode === "2d"
                      ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  2D
                </button>
                <button
                  onClick={() => handleGlobalViewModeChange("3d")}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all ${
                    globalViewMode === "3d"
                      ? "bg-sky-500 text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  3D
                </button>
              </div>
            )}
          </div>

          {/* Center: Contextual Search & AOI Tools (only on Mapa) */}
          {activeTab === "Mapa" && (
            <div className="hidden lg:flex items-center gap-2">
              {/* Geocoding Search Input */}
              <div className="relative" ref={searchRef}>
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKey}
                    onFocus={() => {
                      if (searchResults.length) setShowResults(true);
                    }}
                    placeholder={
                      searchWorldwide
                        ? "Pesquisar localização (mundo)…"
                        : "Pesquisar localização em MZ…"
                    }
                    className="pl-8 pr-16 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 w-56 xl:w-64 transition-all"
                  />
                  <button
                    onClick={() => setSearchWorldwide((w) => !w)}
                    title={
                      searchWorldwide
                        ? "Pesquisa global ativa — clique para filtrar por Moçambique"
                        : "Pesquisa em Moçambique ativa — clique para global"
                    }
                    className={`absolute right-7 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                      searchWorldwide
                        ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {searchWorldwide ? (
                      <Globe size={11} className="text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <span className="text-[10px] font-bold">MZ</span>
                    )}
                  </button>
                  {searchLoading ? (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
                  ) : searchQuery ? (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        setShowResults(false);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                </div>

                {showResults && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1.5 left-0 right-0 z-[1000] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
                    {searchResults.map((r) => (
                      <button
                        key={r.place_id}
                        onClick={() => flyToResult(r)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <MapPin size={13} className="text-sky-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {r.display_name.split(",")[0]}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {r.display_name.split(",").slice(1, 3).join(",").trim()}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* AOI Selector */}
              <ZoneSelect
                aoi={aoi}
                onAOIChange={handleAOIChange}
                onDrawingRequest={() => setDrawingEnabled(true)}
              />

              <button
                onClick={() => setDrawingEnabled(true)}
                title="Desenhar polígono de interesse"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-fuchsia-200 dark:border-fuchsia-800/60 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/40 transition-colors text-xs font-semibold"
              >
                <Pen size={12} />
                <span>Desenhar</span>
              </button>

              {aoi.source !== "global" && (
                <button
                  type="button"
                  onClick={handleClearAOI}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-colors"
                >
                  <X size={12} />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          )}

          {/* Right: Quick Controls (Active Study, GEE Badge, Settings, Profile) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Mobile search toggle on Mapa */}
            {activeTab === "Mapa" && (
              <button
                type="button"
                onClick={() => setMobileSearchOpen((v) => !v)}
                className={`lg:hidden p-1.5 rounded-lg border transition-colors ${
                  mobileSearchOpen
                    ? "bg-sky-50 border-sky-300 text-sky-600"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
                title="Pesquisar Localização"
              >
                <Search size={15} />
              </button>
            )}

            {/* StoryMap / Presentation Mode Button */}
            <button
              type="button"
              onClick={() => setStoryMapOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Iniciar Modo Apresentação Executivo (StoryMap)"
            >
              <Sparkles size={13} className="text-indigo-600 dark:text-indigo-400" />
              <span>Apresentação</span>
            </button>

            {/* Spatial SQL Console Button */}
            <button
              type="button"
              onClick={() => setSpatialSqlOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-400 text-xs font-semibold transition-all cursor-pointer"
              title="Abrir Console Spatial SQL (DuckDB)"
            >
              <Database size={13} className="text-sky-500" />
              <span>Spatial SQL</span>
            </button>

            {/* Active Study Pill */}
            <button
              onClick={() => setProjectModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-sky-400 transition-colors text-xs"
              title="Gerir Estudo Ativo"
            >
              <FolderKanban size={13} className="text-sky-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200 max-w-[130px] truncate">
                {activeProject ? activeProject.name : "Selecionar Estudo"}
              </span>
            </button>

            {/* GEE Quota Quick Status */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                geeConnected
                  ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              }`}
              title="Estado do Google Earth Engine (Clique para configurar Quota)"
            >
              {geeConnected ? (
                <CheckCircle2 size={12} className="text-emerald-500" />
              ) : (
                <AlertCircle size={12} className="text-amber-500" />
              )}
              <span className="hidden md:inline">
                {geeConnected ? geeProject || "GEE Ativo" : "GEE Offline"}
              </span>
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Definições do Sistema"
            >
              <Settings size={16} />
            </button>

            {/* User Profile / Login */}
            {user ? (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:border-sky-300 text-xs"
                title={`Sessão iniciada como ${user.email}`}
              >
                <Avatar className="h-6 w-6 border border-slate-200 dark:border-slate-700">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Utilizador"}
                      className="h-full w-full object-cover rounded-full"
                    />
                  ) : (
                    <AvatarFallback className="bg-sky-600 text-white text-[9px] font-bold">
                      {user.email ? user.email.slice(0, 2).toUpperCase() : "U"}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="hidden xl:inline font-semibold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
                  {user.displayName || user.email?.split("@")[0]}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-xs"
              >
                <LogIn size={13} />
                <span className="hidden sm:inline">Entrar</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Search Dropdown Bar on Mapa */}
        {mobileSearchOpen && activeTab === "Mapa" && (
          <div className="lg:hidden flex-none bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 z-20 shadow-md">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder={searchWorldwide ? "Pesquisar no mundo…" : "Pesquisar em MZ…"}
                className="w-full pl-8 pr-16 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                onClick={() => setSearchWorldwide((w) => !w)}
                className={`absolute right-7 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                  searchWorldwide
                    ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {searchWorldwide ? (
                  <Globe size={11} className="text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <span className="text-[9px] font-bold">MZ</span>
                )}
              </button>
              {searchLoading ? (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
              ) : searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowResults(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {showResults && searchResults.length > 0 && (
              <div className="mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.place_id}
                    onClick={() => flyToResult(r)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors text-left border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <MapPin size={13} className="text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {r.display_name.split(",")[0]}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {r.display_name.split(",").slice(1, 3).join(",").trim()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Main Content Views */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === "Dashboard" && (
            <DashboardPanel
              province={province}
              district={district}
              onTabChange={setActiveTab}
              onOpenProjectModal={() => setProjectModalOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}

          {activeTab === "Mapa" && (
            <MapView
              province={province}
              district={district}
              layers={layers}
              colorBy={colorBy}
              aoi={aoi}
              drawingEnabled={drawingEnabled}
              finishRequest={finishRequest}
              onDrawComplete={handleDrawComplete}
              onDrawCancel={handleDrawCancel}
              mapRef={mapRef}
              onProvinceClick={(name) => {
                setProvince(name);
                setDistrict(null);
              }}
              onMapState={(c, z) => {
                setMapCenter(c);
                setMapZoom(z);
              }}
              viewMode={globalViewMode}
              onViewModeChange={handleGlobalViewModeChange}
            />
          )}

          {activeTab === "GeoAnálises" && (
            <Suspense fallback={<LoadingSkeleton label="GeoAnálises" />}>
              <LazyGeoAnalises
                aoi={aoi}
                province={province}
                district={district}
                onProvinceChange={(p) => {
                  setProvince(p);
                  setDistrict(null);
                }}
                onDistrictChange={setDistrict}
                onAOIChange={handleAOIChange}
                viewMode={globalViewMode}
                onViewModeChange={handleGlobalViewModeChange}
              />
            </Suspense>
          )}

          {activeTab === "Bacias Hidrográficas" && (
            <Suspense fallback={<LoadingSkeleton label="Bacias Hidrográficas" />}>
              <LazyHidroGeoMoz
                aoi={aoi}
                province={province}
                district={district}
                onProvinceChange={(p) => {
                  setProvince(p);
                  setDistrict(null);
                }}
                onDistrictChange={setDistrict}
                onAOIChange={handleAOIChange}
                viewMode={globalViewMode}
                onViewModeChange={handleGlobalViewModeChange}
              />
            </Suspense>
          )}

          {activeTab === "Água Subterrânea" && (
            <Suspense fallback={<LoadingSkeleton label="Água Subterrânea" />}>
              <LazyAguaSubterranea
                aoi={aoi}
                province={province}
                district={district}
                onProvinceChange={(p) => {
                  setProvince(p);
                  setDistrict(null);
                }}
                onDistrictChange={setDistrict}
                onAOIChange={handleAOIChange}
                viewMode={globalViewMode}
                onViewModeChange={handleGlobalViewModeChange}
              />
            </Suspense>
          )}

          {activeTab === "Geoperigos" && (
            <Suspense fallback={<LoadingSkeleton label="Geoperigos" />}>
              <LazyGeoperigos
                aoi={aoi}
                province={province}
                district={district}
                onProvinceChange={(p) => {
                  setProvince(p);
                  setDistrict(null);
                }}
                onDistrictChange={setDistrict}
                onAOIChange={handleAOIChange}
                viewMode={globalViewMode}
                onViewModeChange={handleGlobalViewModeChange}
              />
            </Suspense>
          )}

          {activeTab === "GeoMoz AI" && (
            <Suspense fallback={<LoadingSkeleton label="GeoMoz AI" />}>
              <LazyGeoMozAI />
            </Suspense>
          )}

          {activeTab === "Exportar" && (
            <ExportPanel
              province={province}
              district={district}
              colorBy={colorBy}
              layers={layers}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
            />
          )}

          {activeTab === "Análise" && (
            <StatsPanel
              province={province}
              district={district}
              colorBy={colorBy}
              isExpanded
              onToggleExpand={() => setActiveTab("Mapa")}
            />
          )}
        </main>
      </div>

      {/* 4. Modals & Dialogs */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <GeeCredentialsDialog open={geeDialogOpen} onOpenChange={setGeeDialogOpen} />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* StoryMap / Presentation Mode Modal */}
      <StoryMapModal
        open={storyMapOpen}
        onOpenChange={setStoryMapOpen}
        onFlyTo={(lat, lng, zoom) => {
          if (activeTab !== "Mapa") setActiveTab("Mapa");
          mapRef.current?.flyTo([lat, lng], zoom, { duration: 1.5 });
        }}
      />

      {/* Spatial SQL Console Modal */}
      <SpatialSqlModal
        open={spatialSqlOpen}
        onOpenChange={setSpatialSqlOpen}
        aoiPolygon={aoi.geometry as any}
        onApplyFilterToMap={(features) => {
          setSpatialSqlOpen(false);
          if (activeTab !== "Mapa") setActiveTab("Mapa");
          toast({
            title: "Filtro Spatial SQL Aplicado",
            description: `${features.length} feições selecionadas e destacadas no mapa.`,
          });
        }}
      />

      {/* Project Workspace Modal */}
      <ProjectWorkspaceModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        currentPlatformAOI={aoi}
        onSelectProjectAOI={(projAOI) => {
          setAOI(projAOI);
          if (projAOI.source === "mozambique") {
            setProvince(projAOI.province);
            setDistrict(projAOI.district);
          } else {
            setProvince(null);
            setDistrict(null);
          }
          if (projAOI.bounds) {
            mapRef.current?.flyToBounds(projAOI.bounds, { padding: [30, 30], duration: 1.2 });
          }
        }}
      />
    </div>
  );
}
