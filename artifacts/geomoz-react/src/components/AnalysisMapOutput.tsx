import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import GeoMozPrintLayout from "./GeoMozPrintLayout";

type ExportResult = { downloadUrl: string; dimensions: number[]; estimatedGridScaleM: number; resolutionAdjusted: boolean; noDataCode: number };

export function AnalysisMapOutput({ recipe, classes, projectName, printSourceId, title, source, vector, temporal }: {
  recipe?: Record<string, unknown>;
  vector?: GeoJSON.FeatureCollection | null;
  temporal: boolean;
  title: string;
  source?: string;
  classes?: { name: string; color: string }[];
  projectName?: string;
  printSourceId: string;
}) {
  const [layout, setLayout] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const defaults = useMemo(() => ({
    title,
    source: [source, "GeoMoz Explorer"].filter(Boolean).join(" · "),
    legend: Array.isArray(classes) ? classes.filter(row => typeof row.name === "string" && /^#[0-9a-f]{6}$/i.test(row.color)) : [],
  }), [classes, title, source]);

  async function prepare() {
    if (!recipe) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await apiFetch("/geomoz-api/ai/analysis-geotiff", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Não foi possível preparar o GeoTIFF.");
      if (new URL(data.downloadUrl).protocol !== "https:") throw new Error("Endereço de exportação inválido.");
      if (!controller.signal.aborted) setResult(data as ExportResult);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha na exportação.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function exportVector() {
    if (!vector) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(vector)], { type: "application/geo+json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "geomoz-analise.geojson";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-label="Exportação da análise" className="space-y-2 rounded-lg border border-slate-300 p-3 text-xs dark:border-slate-700">
      <div className="flex flex-wrap gap-3">
        {recipe && <button type="button" disabled={busy} className="underline" onClick={() => void prepare()}>
          {busy ? "A preparar GeoTIFF…" : "Exportar GeoTIFF"}
        </button>}
        {vector && <button type="button" className="underline" onClick={exportVector}>Exportar GeoJSON</button>}
        <button type="button" className="underline" onClick={() => setLayout(true)}>Layout de impressão</button>
      </div>
      {!recipe && !temporal && !vector && <p>Esta camada disponibiliza impressão. A exportação dos dados raster não está disponível.</p>}
      {vector && <p>Importe o GeoJSON no <a href="/gis-workspace/" target="_blank" rel="noopener noreferrer" className="underline">GIS Workspace</a> para editar ou compor o mapa.</p>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Descarregar .tif</a>
        <p>{result.dimensions.join(" × ")} pixels · EPSG:4326 · grelha aproximada de {result.estimatedGridScaleM} m.
          {result.resolutionAdjusted && " A resolução foi ajustada ao limite de download."} Código {result.noDataCode}: sem dados.</p>
        <p>Para editar a simbologia ou compor o mapa no SIG, importe o TIFF como raster no <a href="/gis-workspace/" target="_blank" rel="noopener noreferrer" className="underline">GIS Workspace</a>.</p>
      </>}
      <GeoMozPrintLayout open={layout} onClose={() => setLayout(false)} moduleName={title}
        printSourceId={printSourceId} projectName={projectName} defaults={defaults} />
    </section>
  );
}
