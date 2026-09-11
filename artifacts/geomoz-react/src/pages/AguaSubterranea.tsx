/**
 * Água Subterrânea — Potencial de água subterrânea por AHP.
 *
 * Sobreposição ponderada multicritério (Analytic Hierarchy Process) de 6 fatores
 * hidrogeológicos: lineamentos, chuva (CHIRPS), declive, densidade de drenagem,
 * TWI e cobertura do solo. Resultado classificado em 5 classes de potencial.
 */

import { useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, ScaleControl, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Droplets, Loader2, Play, ChevronDown, Info, Scale, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, apiFetch } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import { GOOGLE_BASEMAPS, BasemapType } from "@/lib/basemaps";
import BasemapSwitcher from "@/components/BasemapSwitcher";
import ZoneSelect from "@/components/ZoneSelect";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI } from "@/lib/aoi";
import {
  createPDFContext, drawCover, sectionTitle, addPDFFooter, MARGIN, CONTENT_W,
  drawStatCards, drawTable, addMapImage, fetchMapImage,
} from "@/lib/pdf-export";

interface GwpClass { id: number; label: string; color: string; areaKm2: number }
interface GwpWeight { key: string; label: string; weight: number; favours: string }
interface GwpResult { tile: string; classes: GwpClass[]; weights: GwpWeight[]; year: number }

interface Props {
  aoi: AreaOfInterest;
  province: string | null; district: string | null;
  onProvinceChange: (p: string | null) => void;
  onDistrictChange: (d: string | null) => void;
  onAOIChange: (aoi: AreaOfInterest) => void;
}

export default function AguaSubterranea({ aoi, province, district, onProvinceChange, onDistrictChange, onAOIChange }: Props) {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [year, setYear] = useState(2023);
  const [result, setResult] = useState<GwpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [basemap, setBasemap] = useState<BasemapType>("terrain");

  const run = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const r = await apiFetch("/geomoz-api/gee/groundwater", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
        body: JSON.stringify({ ...aoiToAPI(aoi), year }),
      });
      if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText);
      setResult(await r.json());
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const msg = aborted ? "O cálculo AHP demorou demasiado. Escolha uma província/distrito em vez de todo o país." : String(e instanceof Error ? e.message : e);
      setError(msg);
      toast({ variant: "destructive", title: "Erro no potencial hídrico", description: msg });
    } finally { clearTimeout(timer); setLoading(false); }
  }, [province, district, year]);

  const total = result ? result.classes.reduce((s, c) => s + c.areaKm2, 0) || 1 : 1;

  // ── PDF Export ──────────────────────────────────────────────────────────────
  async function exportGroundwaterPdf() {
    if (!mapContainerRef.current) return;
    const ctx = createPDFContext(
      `Água Subterrânea — ${province ?? "Moçambique"}`,
    );
    drawCover(ctx, "Relatório de Potencial Hídrico Subterrâneo (AHP)", [
      `Ano: ${year}`,
      `${province ? `Província: ${province}` : "Área: Moçambique"}`,
      ctx.date,
    ]);

    // Map — fetch from backend Cartopy API
    try {
      const legendItems = result?.classes?.map(c => ({ label: c.label, color: c.color }));
      const imgData = await fetchMapImage(
        { south: -26.9, north: -10.4, west: 30.2, east: 41 },
        { tileUrl: result?.tile,
          legendItems,
          title: `Potencial Hídrico — ${province ?? "Moçambique"}`, dpi: 200 },
      );
      addMapImage(ctx, imgData, 100);
    } catch (e) {
      console.warn("Map fetch failed:", e);
    }

    if (result) {
      sectionTitle(ctx, "Classes de Potencial Hídrico");
      drawTable(
        ctx,
        ["Classe", "Área (km²)", "%"],
        result.classes.map(c => ({
          cells: [
            c.label,
            c.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 1 }),
            ((c.areaKm2 / total) * 100).toFixed(1),
          ],
          color: c.color,
        })),
        [CONTENT_W * 0.4, CONTENT_W * 0.3, CONTENT_W * 0.3],
      );

      sectionTitle(ctx, "Pesos AHP");
      drawTable(
        ctx,
        ["Fator", "Peso", "Favorece"],
        result.weights.map(w => ({
          cells: [w.label, `${(w.weight * 100).toFixed(0)}%`, w.favours === "alto" ? "Alto potencial" : "Baixo potencial"],
        })),
        [CONTENT_W * 0.45, CONTENT_W * 0.2, CONTENT_W * 0.35],
      );

      drawStatCards(ctx, [
        { label: "Análise", value: `AHP · ${year}`, color: [8, 145, 178] },
        { label: "Fatores", value: `${result.weights.length}`, color: [14, 165, 233] },
        { label: "Resolução", value: "~500 m", color: [100, 116, 139] },
        { label: "Área total", value: `${total.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} km²`, color: [16, 185, 129] },
      ]);
    }

    addPDFFooter(ctx);
    ctx.doc.save(`GeoMoz_AguaSubterranea_${province ?? "MZ"}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-72 flex flex-col bg-white border-r border-slate-200 overflow-y-auto shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
              <Droplets size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Água Subterrânea</h2>
              <p className="text-[10px] text-slate-400">Potencial hídrico · AHP · GEE</p>
            </div>
          </div>
        </div>

        {/* Área de estudo — AOI global */}
        <div className="p-3 border-b border-slate-100">
          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Área de Estudo</h4>
          <ZoneSelect aoi={aoi} onAOIChange={onAOIChange} onDrawingRequest={() => setDrawingEnabled(true)} />
        </div>

        {/* Config */}
        <div className="p-3 space-y-3 border-b border-slate-100">
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-2.5 text-[11px] text-cyan-800 flex items-start gap-2">
            <Info size={12} className="mt-0.5 shrink-0 text-cyan-500" />
            <span>Combina 6 fatores hidrogeológicos por pesos AHP. Zonas verdes = maior potencial de água subterrânea.</span>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Ano (chuva) — <strong className="text-slate-700">{year}</strong></label>
            <input type="range" min={2018} max={2024} step={1} value={year} onChange={e => setYear(+e.target.value)} className="w-full accent-cyan-500" />
            <div className="flex justify-between text-[10px] text-slate-400"><span>2018</span><span>2024</span></div>
          </div>
          <button onClick={run} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Calcular potencial
          </button>
        </div>

        {/* Weights */}
        {result && (
          <div className="p-3 border-b border-slate-100">
            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Scale size={10} /> Pesos AHP</h4>
            <div className="space-y-1">
              {result.weights.map(w => (
                <div key={w.key} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">{w.label}</span>
                  <span className="font-mono text-slate-800">{(w.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="m-3 bg-red-50 border border-red-200 rounded-xl p-2.5 text-[11px] text-red-700">{error}</div>}
      </div>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative" ref={mapContainerRef}>
        <BasemapSwitcher current={basemap} onChange={setBasemap} className="absolute top-3 right-14 z-[600]" />
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer
            key={basemap}
            crossOrigin="anonymous"
            url={GOOGLE_BASEMAPS[basemap].url}
            subdomains={GOOGLE_BASEMAPS[basemap].subdomains}
            attribution={GOOGLE_BASEMAPS[basemap].attribution}
            maxZoom={GOOGLE_BASEMAPS[basemap].maxZoom}
          />
          <ScaleControl position="bottomleft" imperial={false} />
          <ZoomControl position="topright" />
          <AreaSelect
            province={province} district={district}
            onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
            onDistrictChange={onDistrictChange}
            accent="#0891b2"
          />
          {result && <TileLayer crossOrigin="anonymous" key={`gwp-${result.tile}`} url={result.tile} opacity={0.75} maxZoom={18} />}
          <MapTools />
          <MapDraw
            enabled={drawingEnabled}
            hasDrawnAOI={aoi.source === "draw"}
            onClearAOI={() => onAOIChange(GLOBAL_AOI)}
            onDrawComplete={(geom, label) => { setDrawingEnabled(false); onAOIChange(customAOI(geom, label, "draw")); }}
            onCancel={() => setDrawingEnabled(false)}
          />
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 z-[600] bg-white/55 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 px-7 py-5 flex items-center gap-3 max-w-xs">
              <Loader2 size={20} className="text-cyan-500 animate-spin shrink-0" />
              <span className="text-sm text-slate-700 font-medium">A calcular potencial hídrico (AHP, 6 fatores)… pode levar ~1 min.</span>
            </div>
          </div>
        )}

        {result && (
          <div className="absolute bottom-8 left-4 z-[500] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-cyan-100 p-3 text-[11px] min-w-[150px]">
            <div className="font-semibold text-cyan-800 mb-2 flex items-center gap-1"><Droplets size={11} /> Potencial hídrico</div>
            {result.classes.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 mb-1">
                <span className="inline-block w-4 h-3 rounded" style={{ background: c.color }} />
                <span className="text-slate-600">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      {result && (
        <div className="w-80 flex flex-col bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2"><Droplets size={15} className="text-cyan-600" /><span className="text-sm font-semibold text-slate-900">Potencial de Água Subterrânea</span></div>
            <div className="space-y-1.5">
              {result.classes.map(c => {
                const pct = (c.areaKm2 / total) * 100;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />{c.label}</span>
                      <span className="font-medium text-slate-800">{c.areaKm2.toLocaleString("pt-PT")} km² · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-[11px] text-cyan-800 flex items-start gap-2">
              <Info size={12} className="mt-0.5 shrink-0" /> Modelo AHP de favorabilidade (indicativo). A litologia pode ser adicionada como 7º fator. Confirmar com furos de teste.
            </div>
            <button onClick={exportGroundwaterPdf}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm">
              <FileDown size={13} /> Exportar Relatório PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
