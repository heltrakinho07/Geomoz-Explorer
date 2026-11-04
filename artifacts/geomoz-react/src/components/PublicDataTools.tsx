import { useState } from "react";

export type PublicAnalysisRequest = {
  tool: "list_public_datasets" | "calculate_zonal_statistics" | "detect_temporal_change" | "get_public_landcover" | "get_global_climate";
  args: Record<string, string | number>;
};

type Props = { disabled: boolean; onRun: (label: string, request: PublicAnalysisRequest) => void };
export function PublicDataTools({ disabled, onRun }: Props) {
  const [task, setTask] = useState<PublicAnalysisRequest["tool"]>("list_public_datasets");
  const [index, setIndex] = useState("ndvi");
  const [threshold, setThreshold] = useState(0.3);
  const [referenceStart, setReferenceStart] = useState(`${new Date().getFullYear() - 2}-01-01`);
  const [referenceEnd, setReferenceEnd] = useState(`${new Date().getFullYear() - 1}-01-01`);
  const [variable, setVariable] = useState("precipitation");
  const labels: Record<PublicAnalysisRequest["tool"], string> = {
    list_public_datasets: "Consultar fontes públicas mundiais",
    calculate_zonal_statistics: "Calcular estatísticas zonais Sentinel-2",
    detect_temporal_change: "Comparar dois períodos Sentinel-2",
    get_public_landcover: "Cobertura do solo WorldCover 2021",
    get_global_climate: "Clima terrestre ERA5-Land",
  };
  const spectral = task === "calculate_zonal_statistics" || task === "detect_temporal_change";
  const run = () => {
    const args: Record<string, string | number> = {};
    if (spectral) args.index = index;
    if (task === "calculate_zonal_statistics") {
      args.threshold = threshold;
      args.comparison = "gte";
    }
    if (task === "get_global_climate") args.variable = variable;
    // The parent supplies period B from the editable main analysis dates.
    if (task === "detect_temporal_change") {
      args.start_date_1 = referenceStart;
      args.end_date_1 = referenceEnd;
    }
    onRun(labels[task], { tool: task, args });
  };
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
      <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">Dados públicos · análises mundiais</summary>
      <div className="mt-2 space-y-2">
        <select aria-label="Análise de dados públicos" disabled={disabled} value={task} onChange={(event) => setTask(event.target.value as PublicAnalysisRequest["tool"])} className="w-full rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-900">
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {spectral && <label className="block">Índice
          <select aria-label="Índice da análise pública" disabled={disabled} value={index} onChange={(event) => setIndex(event.target.value)} className="ml-2 rounded border bg-transparent p-1 dark:border-slate-600">
            {["ndvi", "ndwi", "mndwi", "ndbi", "nbr"].map((code) => <option key={code} value={code}>{code.toUpperCase()}</option>)}
          </select>
        </label>}
        {task === "calculate_zonal_statistics" && <label className="block">Área com índice ≥
          <input aria-label="Limiar do índice" type="number" min={-1} max={1} step={0.05} value={threshold} disabled={disabled} onChange={(event) => setThreshold(Number(event.target.value))} className="ml-2 w-20 rounded border bg-transparent p-1 dark:border-slate-600" />
        </label>}
        {task === "detect_temporal_change" && <div className="space-y-1">
          <p>Período A de referência. O período B corresponde às datas da análise abaixo. Diferença B − A.</p>
          <div className="grid grid-cols-2 gap-2">
            <label>Início A<input aria-label="Início do período de referência" type="date" value={referenceStart} disabled={disabled} onChange={(event) => setReferenceStart(event.target.value)} className="block w-full rounded border bg-transparent p-1 dark:border-slate-600" /></label>
            <label>Fim A (exclusivo)<input aria-label="Fim do período de referência" type="date" value={referenceEnd} disabled={disabled} onChange={(event) => setReferenceEnd(event.target.value)} className="block w-full rounded border bg-transparent p-1 dark:border-slate-600" /></label>
          </div>
          <p className="text-[10px] text-slate-500">Compare épocas equivalentes. Mudança no índice não confirma desflorestação ou área ardida.</p>
        </div>}
        {task === "get_global_climate" && <select aria-label="Variável ERA5-Land" disabled={disabled} value={variable} onChange={(event) => setVariable(event.target.value)} className="w-full rounded border bg-transparent p-1 dark:border-slate-600">
          <option value="precipitation">Precipitação acumulada (mm no período)</option><option value="temperature">Temperatura média do ar (°C)</option>
        </select>}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Seleccione um país ou polígono. WorldCover refere-se a 2021; ERA5-Land é reanálise. O cálculo exige acesso Earth Engine autorizado.</p>
        <button type="button" disabled={disabled || (spectral && !Number.isFinite(threshold))} onClick={run} className="rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-40">{task === "list_public_datasets" ? "Consultar catálogo" : "Executar análise"}</button>
      </div>
    </details>
  );
}
