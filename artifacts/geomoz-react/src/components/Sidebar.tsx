import { Filter, Layers, ChevronDown } from "lucide-react";
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
}

const COLOR_OPTIONS = [
  { value: "code2006", label: "code2006 (Padrão)" },
  { value: "Legend", label: "Legend (Litologia)" },
  { value: "ERA", label: "ERA (Era Geológica)" },
  { value: "PERIOD", label: "PERIOD (Período)" },
];

const LAYER_DEFS: { key: keyof LayerState; label: string; color: string }[] = [
  { key: "geology", label: "Litologia/Geologia", color: "bg-sky-500" },
  { key: "provinces", label: "Províncias", color: "bg-slate-400" },
  { key: "districts", label: "Distritos", color: "bg-slate-300" },
];

export default function Sidebar({
  province,
  district,
  onProvinceChange,
  onDistrictChange,
  layers,
  onLayerToggle,
  colorBy,
  onColorByChange,
}: SidebarProps) {
  const { data: provinceData, isLoading: loadingProvinces } = useProvinceNames();
  const { data: districtData, isLoading: loadingDistricts } = useDistrictNames(province);

  return (
    <aside className="w-[260px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Filter area */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Filtrar Área</h3>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Província</label>
            <div className="relative">
              <select
                className="w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm"
                value={province ?? ""}
                onChange={(e) => {
                  onProvinceChange(e.target.value || null);
                  onDistrictChange(null);
                }}
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

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Distrito</label>
            <div className="relative">
              <select
                className={`w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm ${!province ? "opacity-50 cursor-not-allowed" : ""}`}
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
        </div>
      </div>

      {/* Layers */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Camadas</h3>
        </div>
        <div className="space-y-2">
          {LAYER_DEFS.map((l) => (
            <div
              key={l.key}
              className="flex items-center justify-between p-2 rounded-md hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-sm ${l.color} shadow-sm`} />
                <span className="text-sm text-slate-700 font-medium">{l.label}</span>
              </div>
              <Switch
                checked={layers[l.key]}
                onCheckedChange={() => onLayerToggle(l.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Color by */}
      <div className="p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Colorir por
        </h3>
        <div className="space-y-2.5">
          {COLOR_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="radio"
                  name="colorBy"
                  checked={colorBy === opt.value}
                  onChange={() => onColorByChange(opt.value)}
                  className="peer sr-only"
                />
                <div className="w-4 h-4 rounded-full border border-slate-300 peer-checked:border-sky-500 peer-checked:border-4 transition-all" />
              </div>
              <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
