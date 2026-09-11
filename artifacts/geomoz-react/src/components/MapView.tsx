import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  ScaleControl,
} from "react-leaflet";
import type { Layer } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useGeologyGeoJSON, useProvincesGeoJSON, useDistrictsGeoJSON } from "@/hooks/useGeoMoz";
import type { LayerState } from "./Sidebar";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "./BasemapSwitcher";
import MapTools from "./MapTools";
import MapDraw from "./MapDraw";
import MapLibre3DView from "./MapLibre3DView";
import { Globe, Layers } from "lucide-react";
import type { AreaOfInterest } from "@/lib/aoi";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapViewProps {
  province: string | null;
  district: string | null;
  layers: LayerState;
  colorBy: string;
  aoi: AreaOfInterest;
  drawingEnabled: boolean;
  finishRequest?: number;
  initialViewMode?: "2d" | "3d";
  viewMode?: "2d" | "3d";
  onViewModeChange?: (mode: "2d" | "3d") => void;
  onDrawComplete: (geometry: GeoJSON.GeoJSON, label: string) => void;
  onDrawCancel: () => void;
  onProvinceClick?: (name: string) => void;
  onMapState?: (center: [number, number], zoom: number) => void;
  mapRef?: React.RefObject<L.Map | null>;
}

function FitBounds({ data, deps }: { data: GeoJSON.FeatureCollection | undefined; deps?: unknown[] }) {
  const map = useMap();
  const prevDeps = useRef<unknown[]>([]);
  useEffect(() => {
    if (!data) return;
    const changed = (deps ?? []).some((d, i) => d !== prevDeps.current[i]);
    if (!changed && prevDeps.current.length > 0) return;
    prevDeps.current = deps ?? [];
    try {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ...(deps ?? [])]);
  return null;
}

function GeoJSONLayer({ data, layerKey, style, onEachFeature }: {
  data: GeoJSON.FeatureCollection | undefined;
  layerKey: string;
  style?: (f: GeoJSON.Feature | undefined) => L.PathOptions;
  onEachFeature?: (f: GeoJSON.Feature, layer: Layer) => void;
}) {
  if (!data) return null;
  return <GeoJSON key={layerKey} data={data} style={style} onEachFeature={onEachFeature} />;
}

function MapStateTracker({ onMapState, mapRef }: {
  onMapState?: (center: [number, number], zoom: number) => void;
  mapRef?: React.RefObject<L.Map | null>;
}) {
  const map = useMap();
  useEffect(() => {
    if (mapRef) mapRef.current = map;
    return () => { if (mapRef) mapRef.current = null; };
  }, [map, mapRef]);
  useMapEvents({
    moveend(e) { const c = e.target.getCenter(); onMapState?.([c.lat, c.lng], e.target.getZoom()); },
    zoomend(e) { const c = e.target.getCenter(); onMapState?.([c.lat, c.lng], e.target.getZoom()); },
  });
  return null;
}

function CoordTracker({ onMove }: { onMove: (lat: number | null, lng: number | null) => void }) {
  useMapEvents({
    mousemove(e) { onMove(e.latlng.lat, e.latlng.lng); },
    mouseout() { onMove(null, null); },
  });
  return null;
}

function NorthArrow() {
  return (
    <div className="absolute z-[500] pointer-events-none" style={{ top: 80, right: 10 }} title="Norte geográfico">
      <div className="bg-white rounded-full shadow-md border border-slate-200 w-10 h-10 flex items-center justify-center">
        <svg viewBox="0 0 32 32" width="28" height="28">
          <polygon points="16,3 19,15 16,13 13,15" fill="#0ea5e9" />
          <polygon points="16,29 19,17 16,19 13,17" fill="#94a3b8" />
          <circle cx="16" cy="16" r="2" fill="#334155" />
          <text x="16" y="10.5" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#0ea5e9" fontFamily="system-ui,sans-serif">N</text>
        </svg>
      </div>
    </div>
  );
}

export default function MapView({
  province,
  district,
  layers,
  colorBy,
  aoi,
  drawingEnabled,
  finishRequest,
  initialViewMode,
  viewMode: propViewMode,
  onViewModeChange,
  onDrawComplete,
  onDrawCancel,
  onProvinceClick,
  onMapState,
  mapRef,
}: MapViewProps) {
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: districtGeoJSON } = useDistrictsGeoJSON(province);
  const { data: geologyGeoJSON, isFetching: loadingGeology } = useGeologyGeoJSON(province, district, colorBy, layers.geology);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [basemap, setBasemap] = useState<BasemapType>("hybrid");

  const isWebGL = typeof window !== "undefined" && Boolean(
    window.WebGLRenderingContext &&
    document.createElement("canvas").getContext("webgl")
  );

  const [internalViewMode, setInternalViewMode] = useState<"2d" | "3d">(() => {
    if (propViewMode) return propViewMode;
    if (initialViewMode) return initialViewMode;
    if (!isWebGL) return "2d";
    try {
      return (localStorage.getItem("geomoz_view_mode") as "2d" | "3d") || "3d";
    } catch {
      return "3d";
    }
  });

  const activeViewMode = propViewMode ?? internalViewMode;

  const handleViewModeChange = (mode: "2d" | "3d") => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
    try {
      localStorage.setItem("geomoz_view_mode", mode);
    } catch {}
  };

  const provinceStyle = (): L.PathOptions => ({
    color: "#64748b", weight: 1.5, fillColor: "#e2e8f0", fillOpacity: province ? 0.05 : 0.2,
  });
  const districtStyle = (): L.PathOptions => ({
    color: "#94a3b8", weight: 0.8, fillColor: "#f8fafc", fillOpacity: 0.05,
  });
  const geologyStyle = (feature: GeoJSON.Feature | undefined): L.PathOptions => ({
    color: "#ffffff", weight: 0.4,
    fillColor: (feature?.properties as Record<string, string>)?._color ?? "#64748b",
    fillOpacity: 0.82,
  });

  function onEachProvince(feature: GeoJSON.Feature, layer: Layer) {
    const p = feature.properties as Record<string, string>;
    const name = p?.Provincia || p?.PROVINCIA || p?.NAME_1 || p?.name || "Province";
    layer.bindTooltip(`<b>${name}</b><br/><span style="color:#64748b;font-size:11px">Clique para ver geologia</span>`, { sticky: true });
    layer.on("click", () => onProvinceClick?.(name));
    (layer as L.Path).on("mouseover", (e) => {
      (e.target as L.Path).setStyle({ fillOpacity: 0.35, weight: 2, fillColor: "#0ea5e9" });
    });
    (layer as L.Path).on("mouseout", (e) => {
      (e.target as L.Path).setStyle({ fillOpacity: province ? 0.05 : 0.2, weight: 1.5, fillColor: "#e2e8f0" });
    });
  }

  function onEachGeology(feature: GeoJSON.Feature, layer: Layer) {
    const p = feature.properties as Record<string, string>;
    const lines: string[] = [];
    if (p?.Legend || p?.LEGEND) lines.push(`<b>${p.Legend ?? p.LEGEND}</b>`);
    if (p?.code2006) lines.push(`Code: ${p.code2006}`);
    if (p?.ERA) lines.push(`Era: ${p.ERA}`);
    if (p?.PERIOD) lines.push(`Período: ${p.PERIOD}`);
    if (lines.length) layer.bindTooltip(lines.join("<br/>"), { sticky: true });
  }

  function onEachDistrict(feature: GeoJSON.Feature, layer: Layer) {
    const p = feature.properties as Record<string, string>;
    const name = p?.Distrito || p?.DISTRITO || p?.NAME_2 || p?.name || "District";
    layer.bindTooltip(name, { sticky: true });
  }

  const geologyKey = `geo-${province}-${district}-${colorBy}-${geologyGeoJSON?.features?.length ?? 0}`;
  const provKey = `prov-${provinceGeoJSON?.features?.length ?? 0}-${province}`;
  const distKey = `dist-${districtGeoJSON?.features?.length ?? 0}-${district}`;

  return (
    <main className="flex-1 relative overflow-hidden" id="geomoz-map-area">
      {/* 2D / 3D Mode Switcher Pill (Desktop & Tablet) */}
      <div className="hidden sm:flex absolute top-4 left-4 z-[650] items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => handleViewModeChange("2d")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeViewMode === "2d"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Layers size={14} />
          <span>2D Plano</span>
        </button>
        <button
          type="button"
          onClick={() => handleViewModeChange("3d")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeViewMode === "3d"
              ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Globe size={14} />
          <span>3D Globo</span>
          <span className="text-[9px] bg-amber-400 text-amber-950 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
            WebGL
          </span>
        </button>
      </div>

      {activeViewMode === "3d" ? (
        <MapLibre3DView
          province={province}
          district={district}
          colorBy={colorBy}
          layers={layers}
          aoi={aoi}
          basemap={basemap}
          viewMode={activeViewMode}
          onBasemapChange={setBasemap}
          onViewModeChange={handleViewModeChange}
          onProvinceClick={onProvinceClick}
        />
      ) : (
        <>
          {loadingGeology && province && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[600] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2 pointer-events-none">
              <svg className="animate-spin w-3.5 h-3.5 text-sky-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              A carregar geologia…
            </div>
          )}

          {!province && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-[600] bg-white/95 backdrop-blur-sm border border-sky-200 shadow-lg rounded-xl px-5 py-3 text-sm text-slate-700 flex items-center gap-2.5 pointer-events-none max-w-xs text-center">
              <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Clique numa <strong>&nbsp;Província&nbsp;</strong> no mapa ou no filtro para ver a geologia
            </div>
          )}

          {/* Coordinate display */}
          {coords && (
            <div className="absolute bottom-8 right-3 z-[600] bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm rounded-md px-2.5 py-1 text-xs font-mono text-slate-600 pointer-events-none select-none">
              {coords.lat >= 0 ? "+" : ""}{coords.lat.toFixed(5)}°,&nbsp;
              {coords.lng >= 0 ? "+" : ""}{coords.lng.toFixed(5)}°
            </div>
          )}

          {/* Google Maps Bottom-Left Layer Controller */}
          <BasemapSwitcher
            current={basemap}
            onChange={setBasemap}
            viewMode={activeViewMode}
            onViewModeChange={handleViewModeChange}
            className="absolute bottom-6 left-4 z-[600]"
            position="bottom-left"
          />
          <NorthArrow />

          <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl>
            <TileLayer
              key={basemap}
              crossOrigin="anonymous"
              url={GOOGLE_BASEMAPS[basemap].url}
              subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
              attribution={GOOGLE_BASEMAPS[basemap].attribution}
              maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
            />

            <ScaleControl position="bottomleft" imperial={false} />
            <MapStateTracker onMapState={onMapState} mapRef={mapRef} />
            <CoordTracker onMove={(lat, lng) => setCoords(lat !== null && lng !== null ? { lat, lng } : null)} />

            {layers.geology && province && geologyGeoJSON && (
              <>
                <FitBounds data={geologyGeoJSON} deps={[province, district]} />
                <GeoJSONLayer data={geologyGeoJSON} layerKey={geologyKey} style={geologyStyle} onEachFeature={onEachGeology} />
              </>
            )}

            {layers.provinces && provinceGeoJSON && (
              <>
                {!province && <FitBounds data={provinceGeoJSON} deps={[]} />}
                <GeoJSONLayer data={provinceGeoJSON} layerKey={provKey} style={provinceStyle} onEachFeature={onEachProvince} />
              </>
            )}

            {layers.districts && province && districtGeoJSON && (
              <GeoJSONLayer data={districtGeoJSON} layerKey={distKey} style={districtStyle} onEachFeature={onEachDistrict} />
            )}
            {drawingEnabled && (
              <MapDraw
                enabled={drawingEnabled}
                onDrawComplete={onDrawComplete}
                onCancel={onDrawCancel}
                hasDrawnAOI={aoi?.source === "draw"}
                onClearAOI={onDrawCancel}
                finishRequest={finishRequest}
              />
            )}
            {aoi?.source !== "global" && aoi?.geometry && (
              <GeoJSON data={aoi.geometry as GeoJSON.FeatureCollection | GeoJSON.Feature} style={{ color: "#f43f5e", weight: 2, dashArray: "6 4", fillOpacity: 0.05 }} />
            )}
            <MapTools />
          </MapContainer>
        </>
      )}
    </main>
  );
}
