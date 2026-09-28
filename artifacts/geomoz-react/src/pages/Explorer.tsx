import { useRef, useState, useEffect, Suspense } from "react";
import { Globe, Settings, Search, X, Loader2, MapPin, Satellite, Droplets, AlertTriangle, Droplet, CheckCircle2, XCircle, LayoutDashboard, BrainCircuit, Pen, FolderKanban, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import Sidebar, { LayerState } from "@/components/Sidebar";
import MapView from "@/components/MapView";
import StatsPanel from "@/components/StatsPanel";
import ExportPanel from "@/components/ExportPanel";
import DashboardPanel from "@/components/DashboardPanel";
import ProjectsPanel, { type GeoMozProject } from "@/components/ProjectsPanel";
import { LazyGeoAnalises, LazyHidroGeoMoz, LazyGeoperigos, LazyAguaSubterranea, LazyGeoMozAI } from "@/lib/lazy-pages";
import { apiUrl, apiFetch } from "@/lib/api";
import SettingsDialog from "@/components/SettingsDialog";
import GeeCredentialsDialog from "@/components/GeeCredentialsDialog";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import { useWorkspaceLayers } from "@/hooks/useWorkspaceLayers";
import ZoneSelect from "@/components/ZoneSelect";
import type { AreaOfInterest } from "@/lib/aoi";
import { mozambiqueAOI, GLOBAL_AOI, customAOI } from "@/lib/aoi";
import CommandCenter, { type GeoMozWorkspaceTab } from "@/components/CommandCenter";
import WelcomeDialog from "@/components/WelcomeDialog";
import GeoMozMark from "@/components/GeoMozMark";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

type Tab = GeoMozWorkspaceTab;

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "Mapa",                 icon: <Globe size={13} />,    label: "Mapa" },
  { id: "Projetos",              icon: <FolderKanban size={13} />, label: "Projetos" },
  { id: "Análise",              icon: null,                   label: "Análise" },
  { id: "GeoAnálises",         icon: <Satellite size={13} />, label: "GeoAnálises" },
  { id: "Bacias Hidrográficas", icon: <Droplets size={13} />, label: "Bacias Hidrográficas" },
  { id: "Água Subterrânea",     icon: <Droplet size={13} />,  label: "Água Subterrânea" },
  { id: "Geoperigos",           icon: <AlertTriangle size={13} />, label: "Geoperigos" },
  { id: "GeoMoz AI",           icon: <BrainCircuit size={13} />, label: "GeoMoz AI" },
  { id: "Dashboard",            icon: <LayoutDashboard size={13} />, label: "Dashboard" },
  { id: "Exportar",             icon: null,                   label: "Exportar" },
];

export default function Explorer() {
  const { toast } = useToast();
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState("code2006");
  const [layers, setLayers] = useState<LayerState>({ provinces: true, districts: false, geology: true });
  const [activeTab, setActiveTab] = useState<Tab>("Mapa");
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-18, 35]);
  const [mapZoom, setMapZoom] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geeDialogOpen, setGeeDialogOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const { user } = useAuth();
  const { activeProject, clearActiveProject } = useProject();
  const { resultLayers, setResultLayers } = useWorkspaceLayers();
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
  const [searchWorldwide, setSearchWorldwide] = useState(false);
  const skipAutoSearchRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const restoredProjectRef = useRef<string | null>(null);
  const projectWorkspaceReadyRef = useRef(false);
  const projectAutosaveTimerRef = useRef<number | null>(null);

  function handleProvinceChange(nextProvince: string | null) {
    setProvince(nextProvince);
    setDistrict(null);
    setAOI(mozambiqueAOI(nextProvince, null));
  }

  function handleDistrictChange(nextDistrict: string | null) {
    setDistrict(nextDistrict);
    setAOI(mozambiqueAOI(province, nextDistrict));
  }

  function toggleLayer(key: keyof LayerState) {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Global command palette — available from any module.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(value => !value);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // Objective-first onboarding appears only once per browser, but remains
  // available later from the Command Center.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("geomoz.welcome.v1") !== "seen") {
        setWelcomeOpen(true);
      }
    } catch {
      // localStorage is a convenience only.
    }
  }, []);

  function handleWelcomeOpenChange(open: boolean) {
    setWelcomeOpen(open);
    if (!open) {
      try {
        window.localStorage.setItem("geomoz.welcome.v1", "seen");
      } catch {
        // Ignore storage restrictions.
      }
    }
  }

  function navigateWorkspace(tab: GeoMozWorkspaceTab) {
    setActiveTab(tab);
  }

  function startDrawingFromCommand() {
    setActiveTab("Mapa");
    setDrawingEnabled(true);
  }

  // Close search dropdown on outside click
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
    if (!q.trim()) { setSearchResults([]); setShowResults(false); return; }
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

  // Auto-search while typing (debounced, ≥3 chars) — Enter still forces a search
  useEffect(() => {
    if (skipAutoSearchRef.current) { skipAutoSearchRef.current = false; return; }
    if (searchQuery.trim().length < 3) return;
    const t = setTimeout(() => runSearch(searchQuery), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchWorldwide]);

  function handleSearchKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch(searchQuery);
    if (e.key === "Escape") setShowResults(false);
  }

  /** Suspense fallback — full-page skeleton while a lazy chunk is loading. */
function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
            <Loader2 size={24} className="text-sky-500 animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">A carregar {label}…</p>
          <p className="text-xs text-slate-400 mt-1">Módulo será activado em segundos</p>
        </div>
      </div>
    </div>
  );
}

function flyToResult(result: NominatimResult) {
    const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
    mapRef.current?.flyToBounds([[latMin, lonMin], [latMax, lonMax]], { padding: [30, 30], duration: 1.2 });
    setShowResults(false);
    skipAutoSearchRef.current = true;
    setSearchQuery(result.display_name.split(",")[0]);
    setActiveTab("Mapa");
  }

  /** Handle AOI change — sync province/district for mozambique mode */
  function handleAOIChange(newAOI: AreaOfInterest) {
    setDrawingEnabled(false);
    setAOI(newAOI);
    if (newAOI.source === "mozambique") {
      setProvince(newAOI.province);
      setDistrict(newAOI.district);
    } else {
      setProvince(null);
      setDistrict(null);
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

  function applyProjectWorkspace(project: GeoMozProject, notify = true) {
    const state = project.map_state ?? {};

    projectWorkspaceReadyRef.current = false;

    setAOI(project.aoi ?? GLOBAL_AOI);
    setProvince(state.province ?? project.aoi?.province ?? null);
    setDistrict(state.district ?? project.aoi?.district ?? null);

    if (state.center && state.center.length === 2) {
      setMapCenter(state.center);
    } else {
      setMapCenter([-18, 35]);
    }
    setMapZoom(typeof state.zoom === "number" ? state.zoom : 5);

    if (state.layers) {
      setLayers(state.layers);
    }
    if (state.color_by) {
      setColorBy(state.color_by);
    }
    setResultLayers(state.result_layers ?? []);

    restoredProjectRef.current = project.id;
    window.setTimeout(() => {
      projectWorkspaceReadyRef.current = true;
    }, 0);

    setActiveTab("Mapa");
    if (notify) {
      toast({
        title: "Projecto aberto",
        description: `${project.name}: AOI e estado do mapa restaurados.`,
      });
    }
  }

  function handleOpenProject(project: GeoMozProject) {
    applyProjectWorkspace(project, true);
  }


  // Restore the persisted workspace when the app reloads with an active project.
  useEffect(() => {
    if (!user || !activeProject?.id) {
      restoredProjectRef.current = null;
      projectWorkspaceReadyRef.current = false;
      return;
    }
    if (restoredProjectRef.current === activeProject.id) return;

    let cancelled = false;
    projectWorkspaceReadyRef.current = false;

    void apiFetch(`/geomoz-api/projects/${activeProject.id}`)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Não foi possível carregar o projecto (HTTP ${response.status}).`);
        }
        return response.json() as Promise<GeoMozProject>;
      })
      .then(project => {
        if (!cancelled) applyProjectWorkspace(project, false);
      })
      .catch(error => {
        if (cancelled) return;
        projectWorkspaceReadyRef.current = false;
        restoredProjectRef.current = null;
        clearActiveProject();
        console.error("Failed to restore project workspace:", error);
        toast({
          variant: "destructive",
          title: "Projecto não restaurado",
          description: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  // applyProjectWorkspace is intentionally driven by activeProject identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeProject?.id]);

  // Autosave the active workspace after user changes settle. This intentionally
  // waits until the server snapshot has been restored so defaults never replace
  // a saved project during application startup.
  useEffect(() => {
    if (!user || !activeProject?.id || !projectWorkspaceReadyRef.current) return;

    if (projectAutosaveTimerRef.current !== null) {
      window.clearTimeout(projectAutosaveTimerRef.current);
    }

    projectAutosaveTimerRef.current = window.setTimeout(() => {
      const payload = {
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
      };

      void apiFetch(`/geomoz-api/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Autosave do projecto falhou (HTTP ${response.status}).`);
          }
        })
        .catch(error => {
          console.error("Project autosave failed:", error);
        });
    }, 1800);

    return () => {
      if (projectAutosaveTimerRef.current !== null) {
        window.clearTimeout(projectAutosaveTimerRef.current);
        projectAutosaveTimerRef.current = null;
      }
    };
  }, [
    user?.uid,
    activeProject?.id,
    aoi,
    province,
    district,
    mapCenter,
    mapZoom,
    layers,
    colorBy,
    resultLayers,
  ]);

  const sharedSidebar = (
    <Sidebar
      province={province}
      district={district}
      onProvinceChange={handleProvinceChange}
      onDistrictChange={handleDistrictChange}
      layers={layers}
      onLayerToggle={toggleLayer}
      colorBy={colorBy}
      onColorByChange={setColorBy}
      drawingEnabled={drawingEnabled}
      onFinishDrawing={() => setFinishRequest(v => v + 1)}
    />
  );

  // Tab accent colours
  const tabAccent: Partial<Record<Tab, string>> = {
    "GeoAnálises":          "bg-indigo-500 shadow-indigo-200",
    "Bacias Hidrográficas": "bg-blue-600 shadow-blue-200",
    "Geoperigos":           "bg-rose-600 shadow-rose-200",
    "Água Subterrânea":     "bg-cyan-600 shadow-cyan-200",
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white text-slate-900 font-sans overflow-hidden">
      {/* Navbar */}
      <header className="flex-none h-14 border-b border-slate-200/50 glass-panel px-4 flex items-center justify-between shrink-0 z-30 transition-all">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <GeoMozMark size={32} className="shrink-0 shadow-sm" />
            <div className="hidden sm:block leading-none">
              <div className="text-sm font-bold tracking-tight text-slate-900">
                GeoMoz <span className="font-medium text-slate-400">Explorer</span>
              </div>
              <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-sky-600">
                Earth Intelligence
              </div>
            </div>
            <Badge variant="outline" className="ml-1 hidden text-xs font-normal border-slate-200 text-slate-400 bg-slate-50 xl:inline-flex">
              Moçambique
            </Badge>
          </div>

          <nav className="hidden 2xl:flex items-center gap-0.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                data-tab={tab.id}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? `${tabAccent[tab.id] ?? "bg-sky-500 shadow-sky-200"} text-white shadow-sm`
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Geocoding search (visible on Mapa tab) */}
          {activeTab === "Mapa" && (
            <div className="relative hidden md:block" ref={searchRef}>
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKey}
                  onFocus={() => { if (searchResults.length) setShowResults(true); }}
                  placeholder={searchWorldwide ? "Pesquisar localização (mundo)…" : "Pesquisar localização em MZ…"}
                  className="pl-8 pr-20 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white focus:border-sky-300 w-64 transition-all"
                />
                <button
                  onClick={() => setSearchWorldwide(w => !w)}
                  title={searchWorldwide ? "A pesquisar no mundo inteiro — clique para limitar a Moçambique" : "A pesquisar só em Moçambique — clique para pesquisar no mundo"}
                  className={`absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                    searchWorldwide ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {searchWorldwide ? "🌍" : "MZ"}
                </button>
                {searchLoading ? (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
                ) : searchQuery ? (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchResults([]); setShowResults(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>

              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 right-0 z-[1000] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  {searchResults.map(r => (
                    <button
                      key={r.place_id}
                      onClick={() => flyToResult(r)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-sky-50 transition-colors text-left border-b border-slate-50 last:border-0"
                    >
                      <MapPin size={13} className="text-sky-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{r.display_name.split(",")[0]}</div>
                        <div className="text-xs text-slate-400 truncate">{r.display_name.split(",").slice(1, 3).join(",").trim()}</div>
                      </div>
                    </button>
                  ))}
                  <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50">© Nominatim / OpenStreetMap</div>
                </div>
              )}

              {showResults && !searchLoading && searchResults.length === 0 && searchQuery && (
                <div className="absolute top-full mt-1.5 left-0 right-0 z-[1000] bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm text-slate-400 text-center">
                  Nenhum resultado encontrado{searchWorldwide ? "" : " em Moçambique"}
                </div>
              )}
            </div>
          )}

          {/* AOI selector on Mapa tab for custom drawing/upload or Mozambique selection */}
          {activeTab === "Mapa" && (
            <div className="hidden md:flex items-center gap-2 mr-1">
              <ZoneSelect
                aoi={aoi}
                onAOIChange={handleAOIChange}
                onDrawingRequest={() => setDrawingEnabled(true)}
              />
              <button
                onClick={() => setDrawingEnabled(true)}
                title="Desenhar uma área"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors text-sm font-medium"
              >
                <Pen size={14} />
                Desenhar
              </button>
            </div>
          )}
          {activeTab === "Mapa" && aoi.source !== "global" && (
            <button
              type="button"
              onClick={handleClearAOI}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <X size={12} /> Limpar AOI
            </button>
          )}

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            title="Abrir GeoMoz Command Center"
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/70 px-2 py-1.5 text-[11px] font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 sm:px-2.5"
          >
            <Sparkles size={12} />
            <span className="hidden xl:inline">Command</span>
            <kbd className="hidden rounded border border-violet-200 bg-white px-1 py-0.5 font-mono text-[9px] font-medium text-violet-500 lg:inline">
              Ctrl K
            </kbd>
          </button>

          {activeProject && (
            <button
              onClick={() => setActiveTab("Projetos")}
              className="hidden lg:flex max-w-[180px] items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
              title="Abrir projectos"
            >
              <FolderKanban size={11} />
              <span className="truncate">{activeProject.name}</span>
            </button>
          )}

          {/* GEE status indicator */}
          <button
            onClick={() => setGeeDialogOpen(true)}
            className="hover:opacity-80 transition-opacity"
            title="Estado do Google Earth Engine (clique para configurar)"
          >
            <GEEStatusDot />
          </button>

          <div className="h-5 w-px bg-slate-200" />
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-slate-400 hover:text-slate-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            title="Configurações"
          >
            <Settings size={16} />
          </button>

          {/* User Account / GEE login button */}
          <button
            onClick={() => setGeeDialogOpen(true)}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 transition-all text-xs"
            title={user ? `Sessão iniciada como ${user.email}` : "Ligar ao Google Earth Engine"}
          >
            <Avatar className="h-7 w-7 border border-slate-200 shadow-xs">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "Utilizador"} className="h-full w-full object-cover rounded-full" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-sky-600 text-white text-[10px] font-bold">
                  {user?.email ? user.email.slice(0, 2).toUpperCase() : "GEE"}
                </AvatarFallback>
              )}
            </Avatar>
            <span className="hidden sm:inline font-medium text-slate-700 max-w-[120px] truncate">
              {user ? (user.displayName || user.email?.split("@")[0]) : "Ligar GEE"}
            </span>
          </button>
        </div>
      </header>

      {/* Body */}
      {activeTab === "Projetos" ? (
        <div className="flex flex-1 overflow-hidden">
          <ProjectsPanel
            aoi={aoi}
            province={province}
            district={district}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            layers={layers}
            colorBy={colorBy}
            resultLayers={resultLayers}
            onOpenProject={handleOpenProject}
            onStartWorkflow={navigateWorkspace}
          />
        </div>
      ) : activeTab === "Dashboard" ? (
        <div className="flex flex-1 overflow-hidden">
          {sharedSidebar}
          <DashboardPanel province={province} district={district} />
        </div>
      ) : activeTab === "Exportar" ? (
        <div className="flex flex-1 overflow-hidden">
          {sharedSidebar}
          <ExportPanel province={province} district={district} colorBy={colorBy} layers={layers} mapCenter={mapCenter} mapZoom={mapZoom} />
        </div>
      ) : activeTab === "Análise" ? (
        <div className="flex flex-1 overflow-hidden">
          {sharedSidebar}
          <StatsPanel province={province} district={district} colorBy={colorBy} isExpanded onToggleExpand={() => setActiveTab("Mapa")} />
        </div>
      ) : activeTab === "GeoAnálises" ? (
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSkeleton label="GeoAnálises" />}>
            <LazyGeoAnalises
              aoi={aoi}
              province={province}
              district={district}
              onProvinceChange={p => { setProvince(p); setDistrict(null); }}
              onDistrictChange={handleDistrictChange}
              onAOIChange={handleAOIChange}
            />
          </Suspense>
        </div>
      ) : activeTab === "Bacias Hidrográficas" ? (
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSkeleton label="Bacias Hidrográficas" />}>
            <LazyHidroGeoMoz
              aoi={aoi}
              province={province}
              district={district}
              onProvinceChange={p => { setProvince(p); setDistrict(null); }}
              onDistrictChange={handleDistrictChange}
              onAOIChange={handleAOIChange}
            />
          </Suspense>
        </div>
      ) : activeTab === "Água Subterrânea" ? (
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSkeleton label="Água Subterrânea" />}>
            <LazyAguaSubterranea
              aoi={aoi}
              province={province}
              district={district}
              onProvinceChange={p => { setProvince(p); setDistrict(null); }}
              onDistrictChange={handleDistrictChange}
              onAOIChange={handleAOIChange}
            />
          </Suspense>
        </div>
      ) : activeTab === "Geoperigos" ? (
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSkeleton label="Geoperigos" />}>
            <LazyGeoperigos
              aoi={aoi}
              province={province}
              district={district}
              onProvinceChange={p => { setProvince(p); setDistrict(null); }}
              onDistrictChange={handleDistrictChange}
              onAOIChange={handleAOIChange}
            />
          </Suspense>
        </div>
      ) : activeTab === "GeoMoz AI" ? (
        <div className="flex flex-1 overflow-hidden">
          <Suspense fallback={<LoadingSkeleton label="GeoMoz AI" />}>
            <LazyGeoMozAI
              aoi={aoi}
              province={province}
              district={district}
            />
          </Suspense>
        </div>
      ) : (
        /* Default: Mapa */
        <div className="flex flex-1 overflow-hidden">
          {sharedSidebar}
          <MapView
            province={province}
            district={district}
            layers={layers}
            colorBy={colorBy}
            aoi={aoi}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            drawingEnabled={drawingEnabled}
            finishRequest={finishRequest}
            onDrawComplete={handleDrawComplete}
            onDrawCancel={handleDrawCancel}
            mapRef={mapRef}
            onProvinceClick={handleProvinceChange}
            onMapState={(c, z) => { setMapCenter(c); setMapZoom(z); }}
          />
          <StatsPanel
            province={province}
            district={district}
            colorBy={colorBy}
            isExpanded={isStatsExpanded}
            onToggleExpand={() => setIsStatsExpanded(v => !v)}
          />
        </div>
      )}

      <CommandCenter
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={navigateWorkspace}
        onDrawAOI={startDrawingFromCommand}
        onOpenGee={() => setGeeDialogOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenWelcome={() => setWelcomeOpen(true)}
        aoiLabel={aoi.label}
        projectName={activeProject?.name}
      />

      <WelcomeDialog
        open={welcomeOpen}
        onOpenChange={handleWelcomeOpenChange}
        onNavigate={navigateWorkspace}
      />

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <GeeCredentialsDialog open={geeDialogOpen} onOpenChange={setGeeDialogOpen} />
    </div>
  );
}

/** Small GEE connection indicator shown in the top-right navbar. */
function GEEStatusDot() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/geomoz-api/gee/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setStatus(d.connected ? "connected" : "disconnected");
      })
      .catch(() => {
        if (!cancelled) setStatus("disconnected");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex items-center gap-1.5" title={
      status === "connected"
        ? "GEE Conectado"
        : status === "disconnected"
        ? "GEE Desconectado"
        : "A verificar GEE…"
    }>
      {status === "loading" ? (
        <Loader2 size={10} className="text-slate-300 animate-spin" />
      ) : status === "connected" ? (
        <CheckCircle2 size={10} className="text-emerald-500" />
      ) : (
        <XCircle size={10} className="text-red-400" />
      )}
      <span className={`text-[10px] font-medium ${
        status === "connected" ? "text-emerald-600" :
        status === "disconnected" ? "text-red-400" :
        "text-slate-300"
      }`}>
        GEE
      </span>
    </div>
  );
}
