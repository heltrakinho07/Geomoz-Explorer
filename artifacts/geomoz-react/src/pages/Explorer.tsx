import { useRef, useState, useEffect } from "react";
import { Globe, Settings, Search, X, Loader2, MapPin, Satellite, Droplets, AlertTriangle, Droplet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import L from "leaflet";
import Sidebar, { LayerState } from "@/components/Sidebar";
import MapView from "@/components/MapView";
import StatsPanel from "@/components/StatsPanel";
import ExportPanel from "@/components/ExportPanel";
import GeoAnalises from "@/pages/GeoAnalises";
import HidroGeoMoz from "@/pages/HidroGeoMoz";
import Geoperigos from "@/pages/Geoperigos";
import AguaSubterranea from "@/pages/AguaSubterranea";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

type Tab = "Mapa" | "Análise" | "GeoAnálises" | "Bacias Hidrográficas" | "Água Subterrânea" | "Geoperigos" | "Exportar";

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "Mapa",                 icon: <Globe size={13} />,    label: "Mapa" },
  { id: "Análise",              icon: null,                   label: "Análise" },
  { id: "GeoAnálises",         icon: <Satellite size={13} />, label: "GeoAnálises" },
  { id: "Bacias Hidrográficas", icon: <Droplets size={13} />, label: "Bacias Hidrográficas" },
  { id: "Água Subterrânea",     icon: <Droplet size={13} />,  label: "Água Subterrânea" },
  { id: "Geoperigos",           icon: <AlertTriangle size={13} />, label: "Geoperigos" },
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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  function toggleLayer(key: keyof LayerState) {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
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

  async function runSearch(q: string) {
    if (!q.trim()) { setSearchResults([]); setShowResults(false); return; }
    setSearchLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=mz&limit=6`;
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

  function handleSearchKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch(searchQuery);
    if (e.key === "Escape") setShowResults(false);
  }

  function flyToResult(result: NominatimResult) {
    const [latMin, latMax, lonMin, lonMax] = result.boundingbox.map(Number);
    mapRef.current?.flyToBounds([[latMin, lonMin], [latMax, lonMax]], { padding: [30, 30], duration: 1.2 });
    setShowResults(false);
    setSearchQuery(result.display_name.split(",")[0]);
    setActiveTab("Mapa");
  }

  const sharedSidebar = (
    <Sidebar
      province={province}
      district={district}
      onProvinceChange={p => { setProvince(p); setDistrict(null); }}
      onDistrictChange={setDistrict}
      layers={layers}
      onLayerToggle={toggleLayer}
      colorBy={colorBy}
      onColorByChange={setColorBy}
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
      <header className="flex-none h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <Globe size={17} />
            </div>
            <span className="font-bold text-slate-900 tracking-tight text-base">GeoMoz Explorer</span>
            <Badge variant="outline" className="ml-1 text-xs font-normal border-slate-200 text-slate-400 bg-slate-50">
              Moçambique
            </Badge>
          </div>

          <nav className="hidden md:flex items-center gap-0.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
                  placeholder="Pesquisar localização em MZ…"
                  className="pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white focus:border-sky-300 w-60 transition-all"
                />
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
                  Nenhum resultado encontrado em Moçambique
                </div>
              )}
            </div>
          )}

          <div className="h-5 w-px bg-slate-200" />
          <button className="text-slate-400 hover:text-slate-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <Settings size={16} />
          </button>
          <Avatar className="h-8 w-8 cursor-pointer border-2 border-slate-100 shadow-sm">
            <AvatarFallback className="bg-sky-100 text-sky-700 text-xs font-bold">GM</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Body */}
      {activeTab === "Exportar" ? (
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
          <GeoAnalises
            province={province}
            district={district}
            onProvinceChange={p => { setProvince(p); setDistrict(null); }}
            onDistrictChange={setDistrict}
          />
        </div>
      ) : activeTab === "Bacias Hidrográficas" ? (
        <div className="flex flex-1 overflow-hidden">
          <HidroGeoMoz
            province={province}
            district={district}
            onProvinceChange={p => { setProvince(p); setDistrict(null); }}
            onDistrictChange={setDistrict}
          />
        </div>
      ) : activeTab === "Água Subterrânea" ? (
        <div className="flex flex-1 overflow-hidden">
          <AguaSubterranea
            province={province}
            district={district}
            onProvinceChange={p => { setProvince(p); setDistrict(null); }}
            onDistrictChange={setDistrict}
          />
        </div>
      ) : activeTab === "Geoperigos" ? (
        <div className="flex flex-1 overflow-hidden">
          <Geoperigos
            province={province}
            district={district}
            onProvinceChange={p => { setProvince(p); setDistrict(null); }}
            onDistrictChange={setDistrict}
          />
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
            mapRef={mapRef}
            onProvinceClick={name => { setProvince(name); setDistrict(null); }}
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
    </div>
  );
}
