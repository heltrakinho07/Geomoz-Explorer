/**
 * Geoperigos — Módulo de Geoperigos / Geohazards
 *
 * Cheias: extensão de inundação por radar Sentinel-1 (vê através das nuvens
 *   durante ciclones) com deteção de mudança evento vs. linha de base.
 * Erosão: risco de perda de solo por RUSLE (A = R·K·LS·C·P), 5 classes.
 */

import { useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, ScaleControl, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  AlertTriangle, Waves, Mountain, Loader2, Play, ChevronDown, Info,
  CheckCircle2, Calendar, Droplets, Layers, FileDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, apiFetch } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import ZoneSelect from "@/components/ZoneSelect";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI } from "@/lib/aoi";
import {
  createPDFContext, drawCover, sectionTitle, addPDFFooter, MARGIN, CONTENT_W,
  drawStatCards, drawTable, addMapImage, fetchMapImage,
} from "@/lib/pdf-export";

type Tool = "flood" | "erosion";

interface FloodResult {
  floodTile: string; permWaterTile: string; areaKm2: number;
  scenesEvent: number; scenesBaseline: number; eventStart: string; eventEnd: string;
}
interface ErosionClass { id: number; label: string; color: string; range: string; areaKm2: number }
interface ErosionResult { tile: string; classes: ErosionClass[]; meanTPerHa: number | null; year: number }

// Known cyclone events (quick presets for flood mapping).
const FLOOD_PRESETS = [
  { label: "Idai (mar 2019)",     start: "2019-03-15", end: "2019-03-25", prov: "Sofala" },
  { label: "Kenneth (abr 2019)",  start: "2019-04-25", end: "2019-05-03", prov: "Cabo Delgado" },
  { label: "Eloise (jan 2021)",   start: "2021-01-22", end: "2021-01-30", prov: "Sofala" },
  { label: "Freddy (mar 2023)",   start: "2023-03-11", end: "2023-03-20", prov: "Zambézia" },
];

interface Props {
  aoi: AreaOfInterest;
  province: string | null; district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
}

export default function Geoperigos({ aoi, province, district, onProvinceChange, onDistrictChange, onAOIChange }: Props) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("flood");

  // Flood params
  const [eventStart, setEventStart] = useState("2019-03-15");
  const [eventEnd,   setEventEnd]   = useState("2019-03-25");
  const [showPerm,   setShowPerm]   = useState(true);
  const [flood, setFlood] = useState<FloodResult | null>(null);

  // Erosion params
  const [year, setYear] = useState(2023);
  const [erosion, setErosion] = useState<ErosionResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  const runFlood = useCallback(async () => {
    setLoading(true); setError(null); setFlood(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180_000);
    try {
      const r = await apiFetch("/geomoz-api/gee/flood"), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ ...aoiToAPI(aoi), event_start: eventStart, event_end: eventEnd }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setFlood(await r.json());
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? "A análise de radar demorou demasiado. Reduza a área (escolha uma província)." : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: "Erro nas cheias", description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [province, district, eventStart, eventEnd]);

  const runErosion = useCallback(async () => {
    setLoading(true); setError(null); setErosion(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const r = await apiFetch("/geomoz-api/gee/erosion"), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ ...aoiToAPI(aoi), year }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setErosion(await r.json());
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? "O cálculo RUSLE demorou demasiado. Escolha uma província em vez de todo o país." : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: "Erro na erosão", description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [province, district, year]);

  const erosionTotal = erosion ? erosion.classes.reduce((s, c) => s + c.areaKm2, 0) || 1 : 1;

  // ── PDF Export ──────────────────────────────────────────────────────────────
  async function exportGeoperigosPdf() {
    if (!mapContainerRef.current) return;
    const ctx = createPDFContext(
      `${tool === "flood" ? "Cheias SAR" : "Erosão RUSLE"} — ${province ?? "Moçambique"}`,
    );
    drawCover(ctx, `Relatório de Geoperigos — ${tool === "flood" ? "Cheias (Sentinel-1)" : "Erosão (RUSLE)"}`, [
      `Ferramenta: ${tool === "flood" ? "Cheias" : "Erosão"}`,
      `${province ? `Província: ${province}` : "Área: Moçambique"}`,
      ctx.date,
    ]);

    // Map — fetch from backend Cartopy API with analysis tile overlay
    const analysisTile = tool === "flood" ? flood?.floodTile : erosion?.tile;
    const legendItems = tool === "erosion" ? erosion?.classes?.map(c => ({ label: c.label, color: c.color })) : undefined;
    try {
      const imgData = await fetchMapImage(
        { south: -26.9, north: -10.4, west: 30.2, east: 41 },
        { tileUrl: analysisTile,
          legendItems,
          title: `${tool === "flood" ? "Cheias SAR" : "Erosão RUSLE"} — ${province ?? "Moçambique"}`,
          dpi: 200 },
      );
      addMapImage(ctx, imgData, 100);
    } catch (e) {
      console.warn("Map fetch failed:", e);
    }

    if (tool === "flood" && flood) {
      sectionTitle(ctx, "Extensão da Cheia");
      drawStatCards(ctx, [
        { label: "Área Inundada", value: `${flood.areaKm2.toLocaleString("pt-PT")} km²`, color: [225, 29, 72] },
        { label: "Cenas do Evento", value: `${flood.scenesEvent}`, color: [239, 68, 68] },
        { label: "Cenas da Base", value: `${flood.scenesBaseline}`, color: [100, 116, 139] },
        { label: "Período", value: `${flood.eventStart}→${flood.eventEnd}`, color: [14, 165, 233] },
      ]);
      sectionTitle(ctx, "Metodologia");
      ctx.doc.setFontSize(7.5);
      ctx.doc.setTextColor(100, 116, 139);
      ctx.doc.text("Deteção de cheias por radar Sentinel-1 (banda C, VV) usando o método UN-SPIDER de", MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text("detecção de mudança: compara a mediana do período do evento com os 60 dias anteriores.", MARGIN, ctx.y);
      ctx.y += 4;
      ctx.doc.text("Filtros: inclinação < 5° (exclui encostas), conectividade ≥ 8 pixels, água permanente JRC removida.", MARGIN, ctx.y);
      ctx.y += 8;
    }

    if (tool === "erosion" && erosion) {
      sectionTitle(ctx, "Risco de Erosão (RUSLE)");
      drawStatCards(ctx, [
        { label: "Perda Média", value: `${erosion.meanTPerHa?.toFixed(1) ?? "—"} t/ha/ano`, color: [245, 158, 11] },
        { label: "Ano", value: `${erosion.year}`, color: [249, 115, 22] },
        { label: "Classes", value: `${erosion.classes.length}`, color: [14, 165, 233] },
        { label: "Fonte", value: "CHIRPS+DEM+MODIS", color: [100, 116, 139] },
      ]);

      sectionTitle(ctx, "Distribuição por Classe");
      drawTable(
        ctx,
        ["Classe", "Área (km²)", "%", "Perda"],
        erosion.classes.map(c => ({
          cells: [
            c.label,
            c.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 }),
            ((c.areaKm2 / erosionTotal) * 100).toFixed(1),
            c.range,
          ],
          color: c.color,
        })),
        [CONTENT_W * 0.28, CONTENT_W * 0.24, CONTENT_W * 0.14, CONTENT_W * 0.34],
      );
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_Geoperigos_${tool}_${province ?? "MZ"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
              <AlertTriangle size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Geoperigos</h2>
              <p className="text-[10px] text-slate-400">Cheias SAR · Erosão RUSLE · GEE</p>
            </div>
          </div>
        </div>

        {/* Tool toggle */}
        <div className="p-3 border-b border-slate-100">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1">
            {([["flood", "Cheias", Waves], ["erosion", "Erosão", Mountain]] as const).map(([t, label, Icon]) => (
              <button key={t} onClick={() => { setTool(t); setError(null); }}
                className={`flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-all ${tool === t ? "bg-white text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Área de estudo — AOI global */}
        <div className="p-3 border-b border-slate-100">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Área de Estudo</h4>
          <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
        </div>

        {/* Flood config */}
        {tool === "flood" && (
          <div className="p-3 space-y-3 border-b border-slate-100">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-800 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-blue-500" />
              <span>Radar Sentinel-1 vê <strong>através das nuvens</strong>. Compara o evento com os 60 dias anteriores para isolar a água nova.</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Eventos conhecidos</label>
              <div className="grid grid-cols-2 gap-1">
                {FLOOD_PRESETS.map(p => (
                  <button key={p.label} onClick={() => { setEventStart(p.start); setEventEnd(p.end); onProvinceChange(p.prov); onDistrictChange(null); }}
                    className="text-[10px] py-1 px-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-rose-50 hover:border-rose-200 transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block flex items-center gap-1"><Calendar size={9} /> Início</label>
                <input type="date" value={eventStart} onChange={e => setEventStart(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block flex items-center gap-1"><Calendar size={9} /> Fim</label>
                <input type="date" value={eventEnd} onChange={e => setEventEnd(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
            </div>
            <label className="flex items-center justify-between text-[11px] text-slate-600">
              Mostrar água permanente <input type="checkbox" checked={showPerm} onChange={e => setShowPerm(e.target.checked)} className="accent-blue-600" />
            </label>
            <button onClick={runFlood} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Mapear cheia
            </button>
          </div>
        )}

        {/* Erosion config */}
        {tool === "erosion" && (
          <div className="p-3 space-y-3 border-b border-slate-100">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0 text-amber-500" />
              <span>RUSLE: <strong>A = R·K·LS·C·P</strong> — chuva (CHIRPS) × solo × declive (DEM) × cobertura (NDVI). Resultado em t/ha/ano.</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Ano — <strong className="text-slate-700">{year}</strong></label>
              <input type="range" min={2018} max={2024} step={1} value={year} onChange={e => setYear(+e.target.value)} className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-slate-400"><span>2018</span><span>2024</span></div>
            </div>
            <button onClick={runErosion} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Calcular erosão
            </button>
          </div>
        )}

        {error && (
          <div className="m-3 bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-700">{error}</div>
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative" ref={mapContainerRef}>
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer crossOrigin="anonymous" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap, © CARTO" />
          <ScaleControl position="bottomleft" imperial={false} />
          <ZoomControl position="topright" />
          <AreaSelect
            province={province} district={district}
            onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
            onDistrictChange={onDistrictChange}
            accent="#e11d48"
          />
          {tool === "flood" && flood && showPerm && (
            <TileLayer crossOrigin="anonymous" key={`perm-${flood.permWaterTile}`} url={flood.permWaterTile} opacity={0.6} maxZoom={18} />
          )}
          {tool === "flood" && flood && (
            <TileLayer crossOrigin="anonymous" key={`flood-${flood.floodTile}`} url={flood.floodTile} opacity={0.85} maxZoom={18} />
          )}
          {tool === "erosion" && erosion && (
            <TileLayer crossOrigin="anonymous" key={`ero-${erosion.tile}`} url={erosion.tile} opacity={0.75} maxZoom={18} />
          )}
          <MapTools />
          <MapDraw
            enabled={drawingEnabled}
            hasDrawnAOI={aoi.source === "draw"}
            onClearAOI={() => onAOIChange(GLOBAL_AOI)}
            onDrawComplete={(geom, label) => { setDrawingEnabled(false); onAOIChange(customAOI(geom, label, "draw")); }}
            onCancel={() => setDrawingEnabled(false)}
          />
        </MapContainer>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-[600] bg-white/55 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-7 py-5 flex items-center gap-3 max-w-xs">
              <Loader2 size={20} className="text-rose-500 animate-spin shrink-0" />
              <span className="text-sm text-slate-700 font-medium">
                {tool === "flood" ? "A processar radar Sentinel-1… (pode levar ~1 min)" : "A calcular RUSLE… (pode levar ~1–2 min)"}
              </span>
            </div>
          </div>
        )}

        {/* Legend */}
        {tool === "erosion" && erosion && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-amber-100 p-3 text-[11px] min-w-[150px]">
            <div className="font-semibold text-amber-800 mb-2 flex items-center gap-1"><Mountain size={11} /> Erosão (t/ha/ano)</div>
            {erosion.classes.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 mb-1">
                <span className="inline-block w-4 h-3 rounded" style={{ background: c.color }} />
                <span className="text-slate-600">{c.label}</span>
              </div>
            ))}
          </div>
        )}
        {tool === "flood" && flood && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-rose-100 p-3 text-[11px] min-w-[140px]">
            <div className="font-semibold text-rose-800 mb-2 flex items-center gap-1"><Waves size={11} /> Cheia</div>
            <div className="flex items-center gap-1.5 mb-1"><span className="inline-block w-4 h-3 rounded bg-[#d50000]" /><span className="text-slate-600">Inundação</span></div>
            {showPerm && <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded bg-[#1565c0]" /><span className="text-slate-600">Água permanente</span></div>}
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      {((tool === "flood" && flood) || (tool === "erosion" && erosion)) && (
        <div className="w-80 flex flex-col bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          {tool === "flood" && flood && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Waves size={15} className="text-rose-600" /><span className="text-sm font-semibold text-slate-900">Extensão da Cheia</span></div>
              <div className="bg-gradient-to-r from-rose-600 to-orange-600 rounded-2xl p-4 text-white">
                <div className="text-xs opacity-75 mb-1">Área inundada</div>
                <div className="text-3xl font-bold">{flood.areaKm2.toLocaleString("pt-PT")}</div>
                <div className="text-xs opacity-75">km²</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-[12px] text-slate-600">
                <div className="flex justify-between"><span>Período</span><span className="font-medium text-slate-800">{flood.eventStart} → {flood.eventEnd}</span></div>
                <div className="flex justify-between"><span>Cenas evento</span><span className="font-medium text-slate-800">{flood.scenesEvent}</span></div>
                <div className="flex justify-between"><span>Cenas base</span><span className="font-medium text-slate-800">{flood.scenesBaseline}</span></div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px] text-blue-800 flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> Deteção por radar (UN-SPIDER). Validar com dados de campo / ótico quando disponível.
              </div>
              <button onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
                <FileDown size={13} /> Exportar Relatório PDF
              </button>
            </div>
          )}
          {tool === "erosion" && erosion && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2"><Mountain size={15} className="text-amber-600" /><span className="text-sm font-semibold text-slate-900">Risco de Erosão (RUSLE)</span></div>
              {erosion.meanTPerHa != null && (
                <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-4 text-white">
                  <div className="text-xs opacity-75 mb-1">Perda de solo média · {erosion.year}</div>
                  <div className="text-3xl font-bold">{erosion.meanTPerHa.toLocaleString("pt-PT")}</div>
                  <div className="text-xs opacity-75">t/ha/ano</div>
                </div>
              )}
              <div className="space-y-1.5">
                {erosion.classes.map(c => {
                  const pct = (c.areaKm2 / erosionTotal) * 100;
                  return (
                    <div key={c.id}>
                      <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />{c.label}</span>
                        <span className="font-medium text-slate-800">{c.areaKm2.toLocaleString("pt-PT")} km²</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <Info size={12} className="mt-0.5 shrink-0" /> K (solo) usa constante moderada; refinável com SoilGrids. Modelo de suscetibilidade, não medição.
              </div>
              <button onClick={exportGeoperigosPdf}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
                <FileDown size={13} /> Exportar Relatório PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
