import { useState } from "react";
import { Globe, Settings, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Sidebar, { LayerState } from "@/components/Sidebar";
import MapView from "@/components/MapView";
import StatsPanel from "@/components/StatsPanel";
import ExportPanel from "@/components/ExportPanel";

export default function Explorer() {
  const [province, setProvince] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState("code2006");
  const [layers, setLayers] = useState<LayerState>({
    provinces: true,
    districts: false,
    geology: true,
  });
  const [activeTab, setActiveTab] = useState("Mapa");
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-18, 35]);
  const [mapZoom, setMapZoom] = useState(5);

  function toggleLayer(key: keyof LayerState) {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const tabs = ["Mapa", "Análise", "Exportar"];

  return (
    <div className="flex flex-col h-screen w-full bg-white text-slate-900 font-sans overflow-hidden">
      {/* Navbar */}
      <header className="flex-none h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <Globe size={18} />
            </div>
            <span className="font-semibold text-slate-900 tracking-tight text-lg">GeoMoz Explorer</span>
            <Badge variant="outline" className="ml-2 text-xs font-normal border-slate-200 text-slate-500 bg-slate-50">
              Mozambique
            </Badge>
          </div>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => setActiveTab(item)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === item
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar localização..."
              className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white w-56 transition-all"
            />
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <button className="text-slate-500 hover:text-slate-900 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <Settings size={18} />
          </button>
          <Avatar className="h-8 w-8 cursor-pointer border border-slate-200 shadow-sm">
            <AvatarFallback className="bg-sky-100 text-sky-700 text-xs font-medium">GM</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Body */}
      {activeTab === "Exportar" ? (
        /* Export tab: full-width panel */
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            province={province}
            district={district}
            onProvinceChange={setProvince}
            onDistrictChange={setDistrict}
            layers={layers}
            onLayerToggle={toggleLayer}
            colorBy={colorBy}
            onColorByChange={setColorBy}
          />
          <ExportPanel
            province={province}
            district={district}
            colorBy={colorBy}
            layers={layers}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
          />
        </div>
      ) : activeTab === "Análise" ? (
        /* Analysis tab: hide map, expand stats panel */
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            province={province}
            district={district}
            onProvinceChange={setProvince}
            onDistrictChange={setDistrict}
            layers={layers}
            onLayerToggle={toggleLayer}
            colorBy={colorBy}
            onColorByChange={setColorBy}
          />
          <StatsPanel
            province={province}
            district={district}
            colorBy={colorBy}
            isExpanded
            onToggleExpand={() => setActiveTab("Mapa")}
          />
        </div>
      ) : (
        /* Map tab: default layout */
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            province={province}
            district={district}
            onProvinceChange={setProvince}
            onDistrictChange={setDistrict}
            layers={layers}
            onLayerToggle={toggleLayer}
            colorBy={colorBy}
            onColorByChange={setColorBy}
          />
          <MapView
            province={province}
            district={district}
            layers={layers}
            colorBy={colorBy}
            onProvinceClick={(name) => {
              setProvince(name);
              setDistrict(null);
            }}
            onMapState={(center, zoom) => {
              setMapCenter(center);
              setMapZoom(zoom);
            }}
          />
          <StatsPanel
            province={province}
            district={district}
            colorBy={colorBy}
            isExpanded={isStatsExpanded}
            onToggleExpand={() => {
              if (isStatsExpanded) {
                setIsStatsExpanded(false);
              } else {
                setIsStatsExpanded(true);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
