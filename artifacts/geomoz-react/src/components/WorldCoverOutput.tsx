import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import GeoMozPrintLayout from "./GeoMozPrintLayout";

type ExportResult = { downloadUrl: string; dimensions: number[]; estimatedGridScaleM: number; resolutionAdjusted: boolean };

export function WorldCoverOutput({ aoi, classes, projectName, printSourceId }: {
  aoi: Record<string, unknown>;
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
    title: "WorldCover 2021 — Cobertura do solo",
    source: "ESA WorldCover 2021 (v200) · Google Earth Engine · GeoMoz Explorer",
    legend: Array.isArray(classes) ? classes.filter(row => typeof row.name === "string" && /^#[0-9a-f]{6}$/i.test(row.color)) : [],
  }), [classes]);

  async function prepare() {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await apiFetch("/geomoz-api/ai/worldcover-geotiff", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aoi }),
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

  return (
    <section aria-label="Exportação WorldCover" className="space-y-2 rounded-lg border border-slate-300 p-3 text-xs dark:border-slate-700">
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} className="underline" onClick={() => void prepare()}>
          {busy ? "A preparar GeoTIFF…" : "Exportar GeoTIFF"}
        </button>
        <button type="button" className="underline" onClick={() => setLayout(true)}>Layout de impressão</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Descarregar .tif</a>
        <p>{result.dimensions.join(" × ")} pixels · EPSG:4326 · grelha aproximada de {result.estimatedGridScaleM} m.
          {result.resolutionAdjusted && " A resolução foi ajustada ao limite de download."} Código 0: sem dados.</p>
        <p>Para editar a simbologia ou compor o mapa no SIG, importe o TIFF como raster no <a href="/gis-workspace/" target="_blank" rel="noopener noreferrer" className="underline">GIS Workspace</a>.</p>
      </>}
      <GeoMozPrintLayout open={layout} onClose={() => setLayout(false)} moduleName="WorldCover 2021"
        printSourceId={printSourceId} projectName={projectName} defaults={defaults} />
    </section>
  );
}
