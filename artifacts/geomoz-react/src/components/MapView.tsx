import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
} from "react-leaflet";
import type { Layer, LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { useGeologyGeoJSON, useProvincesGeoJSON, useDistrictsGeoJSON } from "@/hooks/useGeoMoz";
import type { LayerState } from "./Sidebar";

// Fix leaflet default icon paths broken by bundlers
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
}

function FitBounds({ data }: { data: GeoJSON.FeatureCollection | undefined }) {
  const map = useMap();
  const hasZoomed = useRef(false);

  useEffect(() => {
    if (data && !hasZoomed.current) {
      try {
        const layer = L.geoJSON(data);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20] });
          hasZoomed.current = true;
        }
      } catch {}
    }
  }, [data, map]);

  return null;
}

function GeoJSONLayer({
  data,
  style,
  onEachFeature,
}: {
  data: GeoJSON.FeatureCollection | undefined;
  style?: (feature: GeoJSON.Feature | undefined) => L.PathOptions;
  onEachFeature?: (feature: GeoJSON.Feature, layer: Layer) => void;
}) {
  if (!data) return null;
  return <GeoJSON key={JSON.stringify(data.features?.length)} data={data} style={style} onEachFeature={onEachFeature} />;
}

export default function MapView({ province, district, layers, colorBy, onProvinceClick }: MapViewProps) {
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: districtGeoJSON } = useDistrictsGeoJSON(province);
  const { data: geologyGeoJSON, isFetching: loadingGeology } = useGeologyGeoJSON(province, district, colorBy);

  const provinceStyle = (): L.PathOptions => ({
    color: "#94a3b8",
    weight: 1.5,
    fillColor: "#f1f5f9",
    fillOpacity: 0.1,
  });

  const districtStyle = (): L.PathOptions => ({
    color: "#cbd5e1",
    weight: 0.8,
    fillColor: "#f8fafc",
    fillOpacity: 0.05,
  });

  const geologyStyle = (feature: GeoJSON.Feature | undefined): L.PathOptions => ({
    color: "#ffffff",
    weight: 0.5,
    fillColor: (feature?.properties as Record<string, string>)?._color ?? "#64748b",
    fillOpacity: 0.75,
  });

  function onEachProvince(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const name = props?.Provincia || props?.PROVINCIA || props?.NAME_1 || props?.name || "Province";
    layer.bindTooltip(name, { sticky: true, className: "text-xs font-medium" });
    layer.on("click", () => {
      if (onProvinceClick) onProvinceClick(name);
    });
    (layer as L.Path).on("mouseover", function () {
      (this as L.Path).setStyle({ fillOpacity: 0.3, weight: 2 });
    });
    (layer as L.Path).on("mouseout", function () {
      (this as L.Path).setStyle({ fillOpacity: 0.1, weight: 1.5 });
    });
  }

  function onEachGeology(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const code = props?.code2006 || props?.CODE2006 || "";
    const legend = props?.Legend || props?.LEGEND || "";
    const era = props?.ERA || props?.era || "";
    const period = props?.PERIOD || props?.Period || props?.period || "";
    const lines: string[] = [];
    if (legend) lines.push(`<b>${legend}</b>`);
    if (code) lines.push(`Code: ${code}`);
    if (era) lines.push(`Era: ${era}`);
    if (period) lines.push(`Period: ${period}`);
    layer.bindTooltip(lines.join("<br/>"), { sticky: true, className: "text-xs" });
  }

  function onEachDistrict(feature: GeoJSON.Feature, layer: Layer) {
    const props = feature.properties as Record<string, string>;
    const name = props?.Distrito || props?.DISTRITO || props?.NAME_2 || props?.name || "District";
    layer.bindTooltip(name, { sticky: true, className: "text-xs font-medium" });
  }

  return (
    <main className="flex-1 relative overflow-hidden">
      {loadingGeology && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2">
          <svg className="animate-spin w-3.5 h-3.5 text-sky-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          A carregar dados...
        </div>
      )}

      <MapContainer
        center={[-18, 35]}
        zoom={5}
        style={{ height: "100%", width: "100%" }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />

        {layers.geology && geologyGeoJSON && (
          <GeoJSONLayer data={geologyGeoJSON} style={geologyStyle} onEachFeature={onEachGeology} />
        )}

        {layers.provinces && provinceGeoJSON && (
          <>
            <FitBounds data={provinceGeoJSON} />
            <GeoJSONLayer data={provinceGeoJSON} style={provinceStyle} onEachFeature={onEachProvince} />
          </>
        )}

        {layers.districts && province && districtGeoJSON && (
          <GeoJSONLayer data={districtGeoJSON} style={districtStyle} onEachFeature={onEachDistrict} />
        )}
      </MapContainer>
    </main>
  );
}
