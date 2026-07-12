/**
 * Água Subterrânea — Potencial de água subterrânea por AHP.
 *
 * Sobreposição ponderada multicritério (Analytic Hierarchy Process) de 6 fatores
 * hidrogeológicos: lineamentos, chuva (CHIRPS), declive, densidade de drenagem,
 * TWI e cobertura do solo. Resultado classificado em 5 classes de potencial.
 */

import { useState, useCallback } from "react";
import { MapContainer, TileLayer, ScaleControl, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Droplets, Loader2, Play, ChevronDown, Info, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import MapTools from "@/components/MapTools";
import AreaSelect from "@/components/AreaSelect";
import ZoneSelect from "@/components/ZoneSelect";
import MapDraw from "@/components/MapDraw";
import type { AreaOfInterest } from "@/lib/aoi";
import { aoiToAPI, customAOI, GLOBAL_AOI } from "@/lib/aoi";

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
  const [year, setYear] = useState(2023);
  const [result, setResult] = useState<GwpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(false);

  const run = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 240_000);
    try {
      const r = await fetch(apiUrl("/geomoz-api/gee/groundwater"), {
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
      <div className="flex-1 relative">
        <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap, © CARTO" />
          <ScaleControl position="bottomleft" imperial={false} />
          <ZoomControl position="topright" />
          <AreaSelect
            province={province} district={district}
            onProvinceChange={p => { onProvinceChange(p); onDistrictChange(null); }}
            onDistrictChange={onDistrictChange}
            accent="#0891b2"
          />
          {result && <TileLayer key={`gwp-${result.tile}`} url={result.tile} opacity={0.75} maxZoom={18} />}
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
          </div>
        </div>
      )}
    </div>
  );
}
