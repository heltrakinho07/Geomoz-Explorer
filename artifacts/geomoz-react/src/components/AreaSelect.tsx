import { useEffect, useRef } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import L, { Layer } from "leaflet";
import { useProvincesGeoJSON, useDistrictsGeoJSON } from "@/hooks/useGeoMoz";

/**
 * Reusable study-area selector + boundary display, shared by every analysis map.
 *
 *  • Draws province outlines (and the selected province's districts) on the map.
 *  • Clicking a province/district selects it (drives the page's province/district).
 *  • Highlights the current selection and auto-fits the map to it, so a district-
 *    clipped analysis is actually visible instead of a tiny speck in the country view.
 *
 * Rendered as a child of <MapContainer>. Replaces the static province outline the
 * pages used to draw themselves.
 */

const provName = (p: Record<string, unknown> = {}) =>
  String(p.Provincia || p.PROVINCIA || p.NAME_1 || p.name || "");
const distName = (p: Record<string, unknown> = {}) =>
  String(p.Distrito || p.DISTRITO || p.NAME_2 || p.name || "");

function FitToSelection({
  provinces, districts, province, district,
}: {
  provinces?: GeoJSON.FeatureCollection;
  districts?: GeoJSON.FeatureCollection;
  province: string | null;
  district: string | null;
}) {
  const map = useMap();
  const lastKey = useRef<string>("");
  useEffect(() => {
    const key = `${province ?? ""}|${district ?? ""}`;
    if (key === lastKey.current) return;

    let fc: GeoJSON.FeatureCollection | undefined;
    let feat: GeoJSON.Feature | undefined;
    if (district && districts) {
      feat = districts.features.find(f => distName(f.properties as Record<string, unknown>) === district);
    } else if (province && provinces) {
      feat = provinces.features.find(f => provName(f.properties as Record<string, unknown>) === province);
    } else {
      fc = provinces;
    }
    try {
      const layer = feat ? L.geoJSON(feat) : fc ? L.geoJSON(fc) : null;
      if (!layer) return;
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: district ? 11 : 9 });
        lastKey.current = key;
      }
    } catch { /* ignore */ }
  }, [map, provinces, districts, province, district]);
  return null;
}

interface Props {
  province: string | null;
  district: string | null;
  onProvinceChange?: (p: string | null) => void;
  onDistrictChange?: (d: string | null) => void;
  selectable?: boolean;     // click to select (default true)
  fit?: boolean;            // auto-fit to selection (default true)
  accent?: string;          // highlight colour (default blue)
}

export default function AreaSelect({
  province, district, onProvinceChange, onDistrictChange,
  selectable = true, fit = true, accent = "#1a73e8",
}: Props) {
  const { data: provinces } = useProvincesGeoJSON();
  const { data: districts } = useDistrictsGeoJSON(province);

  const provinceStyle = (f?: GeoJSON.Feature): L.PathOptions => {
    const sel = !!province && provName(f?.properties as Record<string, unknown>) === province;
    return {
      color: sel ? accent : "#64748b",
      weight: sel && !district ? 2.5 : 1.2,
      fillColor: accent,
      fillOpacity: sel && !district ? 0.06 : 0,
      opacity: province && !sel ? 0.25 : 0.6,
    };
  };
  const districtStyle = (f?: GeoJSON.Feature): L.PathOptions => {
    const sel = !!district && distName(f?.properties as Record<string, unknown>) === district;
    return {
      color: sel ? accent : "#94a3b8",
      weight: sel ? 2.5 : 0.9,
      fillColor: accent,
      fillOpacity: sel ? 0.1 : 0,
      opacity: district && !sel ? 0.3 : 0.7,
    };
  };

  return (
    <>
      {provinces && (
        <GeoJSON
          key={`area-provinces-${selectable}`}
          data={provinces as GeoJSON.GeoJsonObject}
          interactive={selectable}
          style={provinceStyle as L.StyleFunction}
          onEachFeature={(feat: GeoJSON.Feature, layer: Layer) => {
            const name = provName(feat.properties as Record<string, unknown>);
            if (selectable) {
              layer.bindTooltip(`<b>${name}</b><br/><span style="font-size:10px;color:#64748b">Clique para selecionar</span>`, { sticky: true });
              layer.on("click", () => { onProvinceChange?.(name); onDistrictChange?.(null); });
            }
          }}
        />
      )}
      {province && districts && (
        <GeoJSON
          key={`area-districts-${province}-${selectable}`}
          data={districts as GeoJSON.GeoJsonObject}
          interactive={selectable}
          style={districtStyle as L.StyleFunction}
          onEachFeature={(feat: GeoJSON.Feature, layer: Layer) => {
            const name = distName(feat.properties as Record<string, unknown>);
            if (selectable) {
              layer.bindTooltip(`<b>${name}</b><br/><span style="font-size:10px;color:#64748b">Clique para selecionar distrito</span>`, { sticky: true });
              layer.on("click", () => onDistrictChange?.(name));
            }
          }}
        />
      )}
      {fit && (
        <FitToSelection provinces={provinces} districts={districts} province={province} district={district} />
      )}
    </>
  );
}
