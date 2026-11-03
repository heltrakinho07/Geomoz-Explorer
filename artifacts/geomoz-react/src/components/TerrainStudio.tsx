import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";
import { Download, FileUp, Image as ImageIcon, Loader2, Mountain, RotateCcw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useTerrainSession } from "@/context/TerrainSessionContext";
import { useProject } from "@/context/ProjectContext";
import {
  createTerrainRenderer,
  type TerrainMeshData,
  type TerrainVisualStyle,
} from "@/lib/terrain-webgl";

interface TerrainStudioProps {
  open: boolean;
  onClose: () => void;
  geeEnabled?: boolean;
  geeRegion?: {
    province: string | null;
    district: string | null;
    geometry?: unknown;
  };
}

/**
 * An isolated modal, not a second map canvas over the GeoMoz workspace.
 * All DEM bytes stay in memory and are discarded when leaving the Studio.
 */
export default function TerrainStudio({ open, onClose, geeEnabled = false, geeRegion }: TerrainStudioProps) {
  const { terrain, setTerrain } = useTerrainSession();
  const { activeProject } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(2);
  const [style, setStyle] = useState<TerrainVisualStyle>("hypsometric");
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  useEffect(() => () => {
    if (textureUrl) URL.revokeObjectURL(textureUrl);
  }, [textureUrl]);

  useEffect(() => {
    if (!open || !terrain || !canvasRef.current) return;
    setRendererError(null);
    try {
      return createTerrainRenderer(canvasRef.current, terrain, {
        exaggeration, style, textureUrl,
      });
    } catch (cause) {
      setRendererError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  }, [open, terrain, exaggeration, style, textureUrl]);

  async function loadGeoTiff(file: File | undefined) {
    if (!file) return;
    setError(null);
    setTerrain(null);
    if (!/\.tiff?$/i.test(file.name)) {
      setError("Seleccione um ficheiro GeoTIFF (.tif ou .tiff).");
      return;
    }
    if (!file.size || file.size > 32 * 1024 * 1024) {
      setError("O ficheiro deve ter até 32 MB. Recorte ou reduza o DEM antes de importar.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await apiFetch("/geomoz-api/terrain/mesh", {
        method: "POST", body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof result?.detail === "string"
            ? result.detail : "Falha ao processar o DEM (HTTP " + response.status + ")."
        );
      }
      if (!result || !Array.isArray(result.heights) ||
          result.heights.length !== result.width * result.height ||
          !Array.isArray(result.boundsMeters)) {
        throw new Error("O serviço devolveu uma malha inválida.");
      }
      setTerrain(result as TerrainMeshData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o DEM.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadFromGEE() {
    if (!geeEnabled) {
      setError("Ligue a sua conta Google Earth Engine para obter o DEM Copernicus.");
      return;
    }
    setError(null);
    setTerrain(null);
    setBusy(true);
    try {
      const response = await apiFetch("/geomoz-api/terrain/gee-mesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geeRegion ?? {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof result?.detail === "string" ? result.detail
          : "Não foi possível obter o DEM Copernicus do Earth Engine.");
      }
      if (!result || !Array.isArray(result.heights) ||
          result.heights.length !== result.width * result.height ||
          !Array.isArray(result.boundsMeters)) {
        throw new Error("O Earth Engine devolveu uma grelha de elevação inválida.");
      }
      setTerrain(result as TerrainMeshData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro no processamento GEE.");
    } finally {
      setBusy(false);
    }
  }

  function loadTexture(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 16 * 1024 * 1024) {
      setError("A textura deve ser uma imagem PNG, JPG ou WebP até 16 MB.");
      return;
    }
    setError(null);
    setTextureUrl(URL.createObjectURL(file));
    setStyle("imagery");
  }

  function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas || !terrain || rendererError) return;
    canvas.toBlob(blob => {
      if (!blob) { setError("Não foi possível exportar a imagem."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "geomoz_terreno_3d.png"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function exportPdf() {
    const canvas = canvasRef.current;
    if (!canvas || !terrain || rendererError) return;
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(17);
      pdf.text("GeoMoz | Terreno 3D", 12, 15);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
      pdf.text("Fonte: " + terrain.name + " | " + terrain.sourceCrs, 12, 22);
      pdf.text("Elevação: " + terrain.minElevation.toFixed(1) + " a " +
        terrain.maxElevation.toFixed(1) + " m | Exagero vertical: " +
        exaggeration.toFixed(1) + "x", 12, 27);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 12, 32, 273, 157);
      pdf.setFontSize(8);
      pdf.text("Visualização em perspectiva; a escala gráfica não é constante. "
        + "Created with GeoMoz Explorer", 12, 198);
      pdf.save("geomoz_terreno_3d.pdf");
    } catch {
      setError("A exportação PDF falhou. Experimente exportar em PNG.");
    }
  }

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="GeoMoz 3D Terrain Studio"
      className="fixed inset-0 z-[3000] flex flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300"><Mountain size={20}/></div>
          <div>
            <h2 className="text-base font-semibold">GeoMoz 3D Terrain Studio</h2>
            <p className="text-[11px] text-slate-400">
              DEM científico · Malha WebGL · Visualização local interactiva
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!terrain || !!rendererError}
            onClick={downloadCanvas}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40">
            <Download size={13} className="mr-1 inline"/> PNG
          </button>
          <button type="button" disabled={!terrain || !!rendererError}
            onClick={exportPdf}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40">
            <Download size={13} className="mr-1 inline"/> PDF
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar Terrain Studio"
            className="rounded-lg border border-slate-600 p-2 hover:bg-slate-700">
            <X size={17}/>
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 w-full shrink-0 space-y-5 overflow-y-auto border-t border-slate-700 bg-slate-900 p-4 md:order-1 md:w-72 md:border-r md:border-t-0">
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-300" htmlFor="terrain-studio-dem">
              1. Modelo digital de elevação
            </label>
            {geeRegion && (
              <button type="button" disabled={busy || !geeEnabled}
                onClick={() => void loadFromGEE()}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin"/> : <Mountain size={15}/>}
                Gerar do DEM Copernicus (GEE)
              </button>
            )}
            <input ref={fileInputRef} id="terrain-studio-dem" type="file"
              accept=".tif,.tiff,image/tiff" className="sr-only"
              onChange={event => void loadGeoTiff(event.target.files?.[0])}/>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin"/> : <FileUp size={15}/>}
              {busy ? "A processar DEM..." : "Importar GeoTIFF / COG"}
            </button>
            {terrain && (
              <div className="mb-2 rounded-lg border border-emerald-600/40 bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-300">
                Modelo partilhado com o projecto{activeProject ? ": " + activeProject.name : ""}.
                Pode alternar entre GeoAnálises e GIS Workspace sem voltar a processá-lo.
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Até 32 MB. A malha é calculada na API GeoMoz e não fica guardada.
              Com o GEE conectado, é possível gerar directamente a pré-visualização
              da área seleccionada. A opção local aceita GeoTIFF do projecto.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="terrain-studio-style" className="block text-xs font-semibold text-slate-300">
              2. Estilo de superfície
            </label>
            <select id="terrain-studio-style" value={style}
              onChange={event => setStyle(event.target.value as TerrainVisualStyle)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-xs">
              <option value="hypsometric">Hipsometria e relevo sombreado</option>
              <option value="grayscale">Relevo em escala de cinzentos</option>
              <option value="imagery" disabled={!textureUrl}>Imagem de satélite / ortofoto</option>
            </select>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 p-2.5 text-xs text-slate-300 hover:bg-slate-800">
              <ImageIcon size={14}/> Carregar textura alinhada
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                onChange={event => loadTexture(event.target.files?.[0])}/>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-400">
              A textura deve ter a mesma extensão e orientação geográfica do DEM.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <label htmlFor="terrain-studio-exaggeration">3. Exagero vertical</label>
              <span className="text-amber-300">{exaggeration.toFixed(1)}×</span>
            </div>
            <input id="terrain-studio-exaggeration" type="range" min="1" max="15"
              step="0.5" value={exaggeration}
              onChange={event => setExaggeration(Number(event.target.value))}
              className="w-full accent-amber-400"/>
            <button type="button" onClick={() => {setExaggeration(2);setStyle("hypsometric");}}
              className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-white">
              <RotateCcw size={12}/> Restaurar estilo
            </button>
          </div>
          {terrain && (
            <section aria-label="Metadados de elevação" className="space-y-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-xs">
              <p className="truncate font-semibold" title={terrain.name}>{terrain.name}</p>
              <p className="text-slate-400">CRS de trabalho: {terrain.crs}</p>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="block text-slate-400">Mínima</span>{terrain.minElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-400">Máxima</span>{terrain.maxElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-400">Média</span>{terrain.meanElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-400">Válidas</span>{(terrain.validFraction*100).toFixed(1)}%</div>
              </div>
              <p className="text-[10px] text-slate-400">Amostragem de pré-visualização: {terrain.width} × {terrain.height} pixels. Não substitui o raster original.</p>
            </section>
          )}
          {error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
          {rendererError && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-xs text-rose-200">{rendererError}</p>}
        </aside>
        <section className="relative order-1 min-h-[260px] flex-1 overflow-hidden md:order-2"
          aria-label="Visualizador tridimensional do DEM">
          {terrain ? (
            <canvas ref={canvasRef} aria-label="Modelo tridimensional de elevação"
              className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"/>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <Mountain size={56} className="text-amber-400/60"/>
              <div>
                <h3 className="text-lg font-semibold">Transformar DEM em terreno 3D</h3>
                <p className="mt-2 max-w-md text-sm text-slate-400">
                  Importe um GeoTIFF de elevação com CRS definido. A superfície manterá
                  a escala horizontal métrica e os vazios NoData não serão preenchidos artificialmente.
                </p>
              </div>
            </div>
          )}
          {terrain && <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300 backdrop-blur">
            Arrastar para rodar · Roda do rato para aproximar · Elevação em metros
          </div>}
        </section>
      </main>
    </div>,
    document.body
  );
}
