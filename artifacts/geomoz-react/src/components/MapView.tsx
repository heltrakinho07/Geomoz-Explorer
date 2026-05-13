import { useEffect, useRef } from "react";
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
  onProvinceClick?: (name: string) => void;
  onMapState?: (center: [number, number], zoom: number) => void;
}

function FitBounds({
  data,
  deps,
}: {
  data: GeoJSON.FeatureCollection | undefined;
  deps?: unknown[];
}) {
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

function GeoJSONLayer({
  data,
  layerKey,
  style,
  onEachFeature,
}: {
  data: GeoJSON.FeatureCollection | undefined;
  layerKey: string;
  style?: (feature: GeoJSON.Feature | undefined) => L.PathOptions;
  onEachFeature?: (feature: GeoJSON.Feature, layer: Layer) => void;
}) {
  if (!data) return null;
  return <GeoJSON key={layerKey} data={data} style={style} onEachFeature={onEachFeature} />;
}

function MapStateTracker({ onMapState }: { onMapState?: (center: [number, number], zoom: number) => void }) {
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      onMapState?.([c.lat, c.lng], e.target.getZoom());
    },
    zoomend(e) {
      const c = e.target.getCenter();
      onMapState?.([c.lat, c.lng], e.target.getZoom());
    },
  });
  return null;
}

function NorthArrow() {
  return (
    <div
      className="absolute z-[400] pointer-events-none"
      style={{ top: 80, right: 10 }}
      title="Norte geográfico"
    >
      <div className="bg-white rounded-full shadow-md border border-slate-200 w-10 h-10 flex items-center justify-center">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-label="North arrow">
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
  onProvinceClick,
  onMapState,
}: MapViewProps) {
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: districtGeoJSON } = useDistrictsGeoJSON(province);
  const { data: geologyGeoJSON, isFetching: loadingGeology } = useGeologyGeoJSON(
    province, district, colorBy, layers.geology
  );

  const provinceStyle = (): L.PathOptions => ({
    color: "#64748b",
    weight: 1.5,
    fillColor: "#e2e8f0",
    fillOpacity: province ? 0.05 : 0.2,
  });

  const districtStyle = (): L.PathOptions => ({
    color: "#94a3b8",
    weight: 0.8,
    fillColor: "#f8fafc",
    fillOpacity: 0.05,
  });

  const geologyStyle = (feature: GeoJSON.Feature | undefined): L.PathOptions => ({
    color: "#ffffff",
    weight: 0.4,
    fillColor: (feature?.properties as Record<string, string>)?._color ?? "#64748b",
    fillOpacity: 0.82,
  });

  function onEachProvince(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const name = props?.Provincia || props?.PROVINCIA || props?.NAME_1 || props?.name || "Province";
    layer.bindTooltip(
      `<b>${name}</b><br/><span style="color:#64748b;font-size:11px">Clique para ver geologia</span>`,
      { sticky: true }
    );
    layer.on("click", () => onProvinceClick?.(name));
    (layer as L.Path).on("mouseover", (e) => {
      (e.target as L.Path).setStyle({ fillOpacity: 0.35, weight: 2, fillColor: "#0ea5e9" });
    });
    (layer as L.Path).on("mouseout", (e) => {
      (e.target as L.Path).setStyle({ fillOpacity: province ? 0.05 : 0.2, weight: 1.5, fillColor: "#e2e8f0" });
    });
  }

  function onEachGeology(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const lines: string[] = [];
    if (props?.Legend || props?.LEGEND) lines.push(`<b>${props.Legend ?? props.LEGEND}</b>`);
    if (props?.code2006) lines.push(`Code: ${props.code2006}`);
    if (props?.ERA) lines.push(`Era: ${props.ERA}`);
    if (props?.PERIOD) lines.push(`Período: ${props.PERIOD}`);
    if (lines.length) layer.bindTooltip(lines.join("<br/>"), { sticky: true });
  }

  function onEachDistrict(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const name = props?.Distrito || props?.DISTRITO || props?.NAME_2 || props?.name || "District";
    layer.bindTooltip(name, { sticky: true });
  }

  const geologyKey = `geo-${province}-${district}-${colorBy}-${geologyGeoJSON?.features?.length ?? 0}`;
  const provKey = `prov-${provinceGeoJSON?.features?.length ?? 0}-${province}`;
  const distKey = `dist-${districtGeoJSON?.features?.length ?? 0}-${district}`;

  return (
    <main className="flex-1 relative overflow-hidden" id="geomoz-map-area">
      {loadingGeology && province && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2 pointer-events-none">
          <svg className="animate-spin w-3.5 h-3.5 text-sky-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          A carregar geologia…
        </div>
      )}

      {!province && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[500] bg-white/90 backdrop-blur-sm border border-sky-200 shadow-lg rounded-xl px-5 py-3 text-sm text-slate-700 flex items-center gap-2.5 pointer-events-none max-w-xs text-center">
          <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Clique numa <strong>&nbsp;Província&nbsp;</strong> no mapa ou no filtro para ver a geologia
        </div>
      )}

      <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        <ScaleControl position="bottomleft" imperial={false} />
        <MapStateTracker onMapState={onMapState} />

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
      </MapContainer>

      <NorthArrow />
    </main>
  );
}
