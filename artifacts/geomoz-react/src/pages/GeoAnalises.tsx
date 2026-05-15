/**
 * GeoAnálises — Sentinel-2 spectral analysis module.
 *
 * Architecture:
 *  - Tab 1 "Sentinel-2":  Real Sentinel-2 cloudless WMS from EOX (free, public).
 *  - Tabs 2–5:            Synthetic spectral index maps derived from geological
 *                         attributes (Legend / ERA / PERIOD).  Labelled clearly as
 *                         "Proxy geológico — sem dados de satélite real".
 *  - Each index tab shows: formula, colormap legend, map overlay, interpretation guide.
 *  - Structure is ready for real Sentinel Hub / STAC API integration.
 */

import { useState, useMemo } from "react";
import {
  MapContainer, TileLayer, GeoJSON, WMSTileLayer, ScaleControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Satellite, BarChart2, Layers, Info, ChevronDown,
  Cpu, FlaskConical, CloudSun, Droplets, Flame,
} from "lucide-react";

import { useGeologyGeoJSON, useProvincesGeoJSON, useProvinceNames } from "@/hooks/useGeoMoz";
import {
  computeSpectralValue, applyColormap, SpectralIndex,
} from "@/lib/geoml";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IndexDef {
  id: SpectralIndex;
  label: string;
  short: string;
  icon: React.ReactNode;
  formula: string;
  bands: string;
  interpretation: string;
  lowLabel: string;
  highLabel: string;
  geologicalBasis: string;
}

const INDEX_DEFS: IndexDef[] = [
  {
    id: "ndvi",
    label: "NDVI",
    short: "Vegetação",
    icon: <CloudSun size={14} />,
    formula: "NDVI = (B8 − B4) / (B8 + B4)",
    bands: "NIR (B8) e Vermelho (B4)",
    interpretation: "Valores altos (>0.5) indicam cobertura vegetal densa, geralmente sobre depósitos quaternários, aluviões e rochas sedimentares jovens. Valores negativos indicam rocha exposta, água ou superfícies impermeáveis.",
    lowLabel: "Rocha exposta / solo nu",
    highLabel: "Vegetação densa",
    geologicalBasis: "Calculado como proxy a partir da era geológica (Quaternário → alta vegetação) e tipo de rocha (intrusiva/metamórfica → baixa). Baseado em propriedades de reflectância conhecidas.",
  },
  {
    id: "fe_oxide",
    label: "Óxidos de Ferro",
    short: "Fe-Óxidos",
    icon: <Flame size={14} />,
    formula: "Fe-Oxide = B4 / B2",
    bands: "Vermelho (B4) e Azul (B2)",
    interpretation: "Identifica formações ferrosas: BIF (Banded Iron Formation), laterites, solos ferruginosos. Essencial para prospecção de ferro, minério de manganês e zonas de gossã sobre depósitos sulfuretos.",
    lowLabel: "Rochas frescas / pouco alteradas",
    highLabel: "BIF, laterite, gossã",
    geologicalBasis: "Derivado de propriedades espectrais de óxidos de ferro (hematite, goethite). Alto em BIF, laterite e basalto alterado; baixo em granito e quartzo.",
  },
  {
    id: "clay",
    label: "Argilas / SWIR",
    short: "Argilas",
    icon: <Droplets size={14} />,
    formula: "Clay = B11 / B8A",
    bands: "SWIR (B11) e Red-Edge (B8A)",
    interpretation: "Detecta minerais argilosos (caulinita, esmectite, illite) e zonas de alteração argílica. Útil para mapeamento de saprolite, zonas de intemperismo e horizontes de argila em perfis de solo.",
    lowLabel: "Rocha fresca / quartzo",
    highLabel: "Argilas, xistos, saprolite",
    geologicalBasis: "Alto em xistos, pelitos, saprolite e depósitos aluviais com argilas. Baixo em granito fresco, quartzite e rochas vulcânicas.",
  },
  {
    id: "hydrothermal",
    label: "Alteração Hidrotermal",
    short: "Hidrotermal",
    icon: <FlaskConical size={14} />,
    formula: "Hydro = (B11 + B4) / (B8A + B3)",
    bands: "SWIR (B11), Vermelho (B4), Red-Edge (B8A) e Verde (B3)",
    interpretation: "Mapeia zonas de alteração hidrotermal (silicificação, sericitização, argilização). Zona crítica para prospecção de ouro, prata, cobre e outros metais de alta temperatura.",
    lowLabel: "Sem alteração hidrotermal",
    highLabel: "Forte alteração / skarn / greisen",
    geologicalBasis: "Alto em rochas intrusivas (granito, sienite), pegmatitos e zonas de contato metamórfico (skarn, calc-silicate). Representa potencial de mineralização por fluidos hidrotermais.",
  },
  {
    id: "bare_soil",
    label: "Solo Exposto / BSI",
    short: "Solo Exposto",
    icon: <BarChart2 size={14} />,
    formula: "BSI = (B11 + B4 − B8 − B2) / (B11 + B4 + B8 + B2)",
    bands: "SWIR (B11), Vermelho (B4), NIR (B8) e Azul (B2)",
    interpretation: "Identifica zonas de solo exposto e erosão. Complementar ao NDVI. Usado em estudos de desertificação, mapeamento de áreas de mineração activa e monitorização de uso do solo.",
    lowLabel: "Vegetação / superfícies escuras",
    highLabel: "Solo / rocha exposta",
    geologicalBasis: "Inverso do NDVI proxy. Alto em rochas intrusivas expostas e quartenário sem cobertura vegetal.",
  },
];

// ── Helper components ──────────────────────────────────────────────────────────

function ColormapLegend({ index }: { index: SpectralIndex }) {
  const def = INDEX_DEFS.find(d => d.id === index)!;
  const steps = 12;
  const stops = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return applyColormap(t, index);
  });
  const gradient = `linear-gradient(to right, ${stops.join(", ")})`;

  return (
    <div className="mt-3 px-4">
      <div className="h-4 w-full rounded" style={{ background: gradient }} />
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>{def.lowLabel}</span>
        <span>{def.highLabel}</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface GeoAnalisesProps {
  province: string | null;
  district: string | null;
  onProvinceChange: (p: string | null) => void;
}

export default function GeoAnalises({ province, district, onProvinceChange }: GeoAnalisesProps) {
  const [activeTab, setActiveTab] = useState<"s2" | SpectralIndex>("s2");
  const [opacity, setOpacity] = useState(0.82);
  const [showS2, setShowS2] = useState(false);
  const [selectedYear, setSelectedYear] = useState("2022");

  const { data: provinceNames } = useProvinceNames();
  const { data: provinceGeoJSON } = useProvincesGeoJSON();
  const { data: geologyGeoJSON, isFetching } = useGeologyGeoJSON(
    province, district, "code2006",
    activeTab !== "s2"
  );

  // Compute spectral-colored GeoJSON
  const spectralGeoJSON = useMemo(() => {
    if (!geologyGeoJSON || activeTab === "s2") return null;
    const index = activeTab as SpectralIndex;
    return {
      ...geologyGeoJSON,
      features: geologyGeoJSON.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          _spectralColor: applyColormap(
            computeSpectralValue(
              String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
              String(f.properties?.ERA ?? ""),
              String(f.properties?.PERIOD ?? ""),
              index
            ),
            index
          ),
          _spectralValue: computeSpectralValue(
            String(f.properties?.Legend ?? f.properties?.LEGEND ?? f.properties?.code2006 ?? ""),
            String(f.properties?.ERA ?? ""),
            String(f.properties?.PERIOD ?? ""),
            index
          ),
        },
      })),
    };
  }, [geologyGeoJSON, activeTab]);

  const activeDef = INDEX_DEFS.find(d => d.id === activeTab);
  const spectralKey = `spectral-${activeTab}-${province}-${district}-${geologyGeoJSON?.features?.length ?? 0}`;

  const tabs = [
    { id: "s2", label: "Sentinel-2", icon: <Satellite size={13} /> },
    ...INDEX_DEFS.map(d => ({ id: d.id, label: d.short, icon: d.icon })),
  ] as { id: string; label: string; icon: React.ReactNode }[];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Module header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Satellite size={17} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm leading-tight">GeoAnálises — Sensoriamento Remoto</h2>
            <p className="text-xs text-slate-400">Sentinel-2 · Índices espectrais · Análise litológica remota</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
            Modo Proxy Geológico
          </span>
          <span className="text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full font-medium">
            EOX Sentinel-2 disponível
          </span>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Controls sidebar */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Filtros</h4>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Província</label>
                <div className="relative">
                  <select
                    className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={province ?? ""}
                    onChange={e => onProvinceChange(e.target.value || null)}
                  >
                    <option value="">Todas</option>
                    {provinceNames?.names.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              {activeTab === "s2" && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Ano (mosaico cloudless)</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none text-sm bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      value={selectedYear}
                      onChange={e => setSelectedYear(e.target.value)}
                    >
                      {["2022", "2021", "2020"].map(y => <option key={y}>{y}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeTab !== "s2" && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Opacidade</h4>
              <input
                type="range" min={0.1} max={1} step={0.05}
                value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
              <div className="text-xs text-slate-400 text-right mt-0.5">{Math.round(opacity * 100)}%</div>
            </div>
          )}

          {activeTab === "s2" && (
            <div className="p-4 border-b border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Camadas Sentinel-2</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showS2}
                  onChange={e => setShowS2(e.target.checked)}
                  className="accent-sky-500"
                />
                <span className="text-sm text-slate-700">Activar Sentinel-2 WMS</span>
              </label>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Imagem cloudless {selectedYear} — EOX IT Services · Copernicus.
                Mosaic anual de cor verdadeira (RGB).
              </p>
            </div>
          )}

          {activeDef && (
            <div className="p-4 flex-1 space-y-4">
              {/* Formula */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Fórmula</h4>
                <code className="block bg-slate-900 text-emerald-300 text-xs rounded-lg p-2.5 font-mono leading-relaxed">
                  {activeDef.formula}
                </code>
                <p className="text-xs text-slate-400 mt-1.5">Bandas: {activeDef.bands}</p>
              </div>

              {/* Colormap */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Escala cromática</h4>
                <ColormapLegend index={activeDef.id} />
              </div>

              {/* Interpretation */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Interpretação</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{activeDef.interpretation}</p>
              </div>

              {/* Proxy basis */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Info size={12} className="text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Modo Proxy</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">{activeDef.geologicalBasis}</p>
              </div>
            </div>
          )}

          {activeTab === "s2" && (
            <div className="p-4 flex-1">
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Satellite size={12} className="text-sky-600" />
                  <span className="text-xs font-semibold text-sky-700">Dados EOX</span>
                </div>
                <p className="text-xs text-sky-700 leading-relaxed">
                  Sentinel-2 cloudless mosaics by{" "}
                  <a href="https://eox.at" target="_blank" rel="noopener noreferrer" className="underline">EOX IT Services GmbH</a>.
                  Contém dados Copernicus Sentinel modificados.
                </p>
              </div>
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <h5 className="text-xs font-semibold text-slate-600 mb-2">Sentinel Hub (API real)</h5>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Para análises com datas específicas e índices em tempo real, configure o Sentinel Hub API key.
                </p>
                <button className="mt-2 w-full text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-md transition-colors border border-slate-200">
                  + Configurar Sentinel Hub
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative overflow-hidden">
          {isFetching && activeTab !== "s2" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-white border border-slate-200 shadow-md rounded-full px-4 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-2 pointer-events-none">
              <Cpu size={13} className="text-sky-500 animate-spin" />
              A computar índice espectral…
            </div>
          )}

          {!province && activeTab !== "s2" && (
            <div className="absolute inset-0 z-[300] flex items-center justify-center pointer-events-none">
              <div className="bg-white/95 border border-sky-200 rounded-2xl px-6 py-4 shadow-lg text-center max-w-xs">
                <Layers size={22} className="text-sky-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">
                  Selecione uma <strong>província</strong> para calcular o índice espectral proxy sobre os dados geológicos.
                </p>
              </div>
            </div>
          )}

          <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
            {/* Base tiles */}
            {showS2 || activeTab === "s2" ? null : (
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="&copy; OSM &copy; CARTO"
                maxZoom={19}
              />
            )}

            {/* Sentinel-2 cloudless WMS (EOX, free public) */}
            {(showS2 || activeTab === "s2") && (
              <>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
                  attribution="&copy; OSM &copy; CARTO"
                  maxZoom={19}
                />
                <WMSTileLayer
                  url="https://tiles.maps.eox.at/wms"
                  layers={`s2cloudless-${selectedYear}`}
                  format="image/jpeg"
                  version="1.1.1"
                  attribution={`Sentinel-2 cloudless ${selectedYear} by EOX IT Services GmbH (Copernicus)`}
                  maxZoom={18}
                  opacity={activeTab === "s2" ? 1 : 0.6}
                />
                {/* Labels on top */}
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
                  attribution=""
                  maxZoom={19}
                  pane="shadowPane"
                />
              </>
            )}

            <ScaleControl position="bottomleft" imperial={false} />

            {/* Province boundaries always visible */}
            {provinceGeoJSON && (
              <GeoJSON
                key={`prov-${province}`}
                data={provinceGeoJSON}
                style={() => ({
                  color: activeTab === "s2" ? "#ffffff" : "#64748b",
                  weight: 1.2,
                  fillOpacity: 0,
                })}
                onEachFeature={(f, layer) => {
                  const p = f.properties as Record<string, string>;
                  const name = p?.Provincia || p?.NAME_1 || p?.name || "";
                  if (name) layer.bindTooltip(`<b>${name}</b>`, { sticky: true });
                  layer.on("click", () => {
                    const n = p?.Provincia || p?.NAME_1 || p?.name;
                    if (n) onProvinceChange(n);
                  });
                }}
              />
            )}

            {/* Spectral index overlay */}
            {activeTab !== "s2" && spectralGeoJSON && (
              <GeoJSON
                key={spectralKey}
                data={spectralGeoJSON as GeoJSON.FeatureCollection}
                style={(f) => ({
                  color: "rgba(255,255,255,0.2)",
                  weight: 0.3,
                  fillColor: (f?.properties as Record<string, string>)?._spectralColor ?? "#64748b",
                  fillOpacity: opacity,
                })}
                onEachFeature={(f, layer) => {
                  const p = f.properties as Record<string, string & number>;
                  const legend = p?.Legend ?? p?.LEGEND ?? p?.code2006 ?? "Unknown";
                  const val = Number(p._spectralValue ?? 0);
                  layer.bindTooltip(
                    `<b>${legend}</b><br/>` +
                    `${activeDef?.short}: <b>${(val * 100).toFixed(0)}%</b><br/>` +
                    `ERA: ${p?.ERA ?? "—"} · PERIOD: ${p?.PERIOD ?? "—"}`,
                    { sticky: true }
                  );
                }}
              />
            )}
          </MapContainer>

          {/* Index colormap overlay on map */}
          {activeTab !== "s2" && activeDef && (
            <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 w-56 pointer-events-none">
              <div className="text-xs font-semibold text-slate-700 mb-1.5">{activeDef.label}</div>
              <div className="h-3 w-full rounded" style={{
                background: `linear-gradient(to right, ${
                  Array.from({ length: 8 }, (_, i) => applyColormap(i / 7, activeDef.id)).join(", ")
                })`,
              }} />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0</span>
                <span>0.5</span>
                <span>1</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                <span>{activeDef.lowLabel.split(" ")[0]}</span>
                <span>{activeDef.highLabel.split(" ")[0]}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-4 text-xs text-slate-400">
        <span>
          {activeTab === "s2"
            ? `Sentinel-2 cloudless ${selectedYear} — EOX IT Services (CC BY 4.0)`
            : `Índice: ${activeDef?.formula ?? ""} · Proxy geológico (sem dados de satélite real)`}
        </span>
        {province && geologyGeoJSON && (
          <span className="ml-auto text-sky-500 font-medium">
            {geologyGeoJSON.features.length} feições · {province}{district ? ` / ${district}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
