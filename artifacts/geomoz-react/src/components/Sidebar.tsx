import { useState, useEffect } from "react";
import { Filter, Layers, ChevronDown, X, MapPin, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useProvinceNames, useDistrictNames } from "@/hooks/useGeoMoz";

export interface LayerState {
  provinces: boolean;
  districts: boolean;
  geology: boolean;
}

interface SidebarProps {
  province: string | null;
  district: string | null;
  onProvinceChange: (v: string | null) => void;
  onDistrictChange: (v: string | null) => void;
  layers: LayerState;
  onLayerToggle: (key: keyof LayerState) => void;
  colorBy: string;
  onColorByChange: (v: string) => void;
  drawingEnabled?: boolean;
  onFinishDrawing?: () => void;
}

const COLOR_OPTIONS = [
  { value: "code2006", label: "code2006", desc: "Código 2006 (Padrão)" },
  { value: "Legend", label: "Legend", desc: "Litologia" },
  { value: "ERA", label: "ERA", desc: "Era Geológica" },
  { value: "PERIOD", label: "PERIOD", desc: "Período" },
];

const LAYER_DEFS: { key: keyof LayerState; label: string; colorClass: string }[] = [
  { key: "geology", label: "Litologia/Geologia", colorClass: "bg-sky-500" },
  { key: "provinces", label: "Províncias", colorClass: "bg-slate-400" },
  { key: "districts", label: "Distritos", colorClass: "bg-slate-300" },
];

export default function Sidebar({
  province, district, onProvinceChange, onDistrictChange,
  layers, onLayerToggle, colorBy, onColorByChange,
  drawingEnabled, onFinishDrawing,
}: SidebarProps) {
  const [width, setWidth] = useState<number>(260);
  const [resizing, setResizing] = useState(false);
  // attach global mouse handlers when resizing
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizing) return;
      const newWidth = Math.max(200, Math.min(800, e.clientX));
      setWidth(newWidth);
    }
    function onUp() { setResizing(false); }
    if (resizing) {
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);
  const { data: provinceData, isLoading: loadingProvinces } = useProvinceNames();
  const { data: districtData, isLoading: loadingDistricts } = useDistrictNames(province);
  const [mobileOpen, setMobileOpen] = useState(false);

  const hasSelection = !!province || !!district;

  const content = (
    <>
      {/* Active selection banner */}
      {hasSelection && (
        <div className="flex items-center justify-between px-3 py-2 bg-sky-50 border-b border-sky-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin size={12} className="text-sky-500 shrink-0" />
            <span className="text-xs text-sky-800 font-medium truncate">
              {district ? `${district}, ${province}` : province}
            </span>
          </div>
          <button
            onClick={() => { onProvinceChange(null); onDistrictChange(null); }}
            className="ml-2 text-sky-400 hover:text-sky-700 shrink-0 flex items-center gap-1 text-xs font-medium hover:bg-sky-100 rounded px-1.5 py-0.5 transition-colors"
            title="Limpar seleção"
          >
            <X size={11} />
            Limpar
          </button>
        </div>
      )}

      {/* Filter area */}
      <div className="p-4 border-b border-slate-100">
        {drawingEnabled && (
          <div className="flex justify-end mb-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onFinishDrawing?.();
              }}
              title="Concluir desenho"
              className="text-xs bg-emerald-600 text-white px-2 py-1 rounded mr-1 hover:bg-emerald-700"
            >
              <CheckCircle2 size={14} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filtrar Área</h3>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Província</label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm transition-colors"
                value={province ?? ""}
                onChange={(e) => { onProvinceChange(e.target.value || null); onDistrictChange(null); }}
                disabled={loadingProvinces}
              >
                <option value="">Todas as Províncias</option>
                {provinceData?.names.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Distrito</label>
            <div className="relative">
              <select
                className={`w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm transition-colors ${!province ? "opacity-40 cursor-not-allowed bg-slate-50" : ""}`}
                value={district ?? ""}
                onChange={(e) => onDistrictChange(e.target.value || null)}
                disabled={!province || loadingDistricts}
              >
                <option value="">{province ? "Todos os Distritos" : "Selecione a Província"}</option>
                {districtData?.names.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Quick clear button when district selected */}
          {district && (
            <button
              onClick={() => onDistrictChange(null)}
              className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 py-1 hover:bg-slate-50 rounded transition-colors"
            >
              <X size={11} /> Ver toda a província
            </button>
          )}
        </div>
      </div>

      {/* Layers */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Camadas</h3>
        </div>
        <div className="space-y-1.5">
          {LAYER_DEFS.map((l) => (
            <div key={l.key} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-sm ${l.colorClass} shadow-sm`} />
                <span className="text-sm text-slate-700 font-medium">{l.label}</span>
              </div>
              <Switch checked={layers[l.key]} onCheckedChange={() => onLayerToggle(l.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Color by */}
      <div className="p-4 flex-1">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Colorir Por</h3>
        <div className="space-y-1">
          {COLOR_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                colorBy === opt.value ? "bg-sky-50 border border-sky-100" : "hover:bg-slate-50"
              }`}
            >
              <div className="relative flex items-center justify-center shrink-0">
                <input
                  type="radio"
                  name="colorBy"
                  checked={colorBy === opt.value}
                  onChange={() => onColorByChange(opt.value)}
                  className="peer sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 transition-all ${
                  colorBy === opt.value ? "border-sky-500 bg-sky-500 scale-90" : "border-slate-300"
                } flex items-center justify-center`}>
                  {colorBy === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
              <div>
                <div className={`text-sm font-medium ${colorBy === opt.value ? "text-sky-700" : "text-slate-700"}`}>
                  {opt.label}
                </div>
                <div className="text-xs text-slate-400">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          Dados: <span className="font-medium text-slate-500">geomoz library</span><br />
          Escala: EPSG:32736 (UTM 36S)
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        style={{ width: `${width}px` }}
        className="hidden lg:flex relative glass-panel border-r border-slate-200/50 flex-col shrink-0 overflow-y-auto"
      >
        {content}
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 -mr-2 cursor-col-resize z-50"
          onMouseDown={() => setResizing(true)}
          onTouchStart={() => setResizing(true)}
        />
      </aside>

      {/* Mobile Trigger Button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden absolute top-4 left-32 sm:left-40 z-[600] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all pointer-events-auto"
        title="Abrir Filtros e Camadas"
      >
        <Filter size={13} className="text-sky-600" />
        <span>Filtros</span>
        {hasSelection && (
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        )}
      </button>

      {/* Mobile Off-canvas Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[850] bg-black/40 backdrop-blur-xs flex animate-in fade-in duration-150 pointer-events-auto">
          <div className="w-[85vw] max-w-xs h-full bg-white dark:bg-slate-900 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200 overflow-y-auto">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Filter size={14} className="text-sky-600" />
                <span>Filtros & Geologia</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            {content}
          </div>
          <div className="flex-1" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  );
}
