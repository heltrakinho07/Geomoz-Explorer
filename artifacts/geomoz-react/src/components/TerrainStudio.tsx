import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Download, FileUp, Image as ImageIcon, Loader2, Mountain, RotateCcw, Map as MapIcon, Box, X } from "lucide-react";
import TerrainBasemap from "@/components/terrain/TerrainBasemap";
import { validTerrainGeography } from "@/lib/terrain-map-geo";
import { apiFetch } from "@/lib/api";
import { useTerrainSession } from "@/context/TerrainSessionContext";
import { useProject } from "@/context/ProjectContext";
import { computeGeoJSONBounds } from "@/lib/aoi";
import TerrainSciencePanel, {type TerrainPickedPoint} from "@/components/TerrainSciencePanel";
import { encodeTerrainGLB, imageToGLBTexture } from "@/lib/terrain-glb";
import {terrainToGeographic} from "@/lib/terrain-analysis";
import { decodeTerrainScene, encodeTerrainScene, MAX_TERRAIN_SCENE_BYTES } from "@/lib/terrain-scene";
import {
  createTerrainRenderer,
  type TerrainMeshData,
  type TerrainVisualStyle,
  type TerrainPick,
} from "@/lib/terrain-webgl";

interface TerrainStudioProps {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  geeEnabled?: boolean;
  geeRegion?: {
    province: string | null;
    district: string | null;
    geometry?: unknown;
  };
}

/** Native GeoMoz analysis module: same navigation, project context and design system. */
export default function TerrainStudio({ open, onClose, geeEnabled = false, geeRegion, embedded = false }: TerrainStudioProps) {
  const { terrain, setTerrain } = useTerrainSession();
  const { activeProject } = useProject();
  const [busy, setBusy] = useState(false);
  const [textureBusy, setTextureBusy] = useState(false);
  const [glbBusy, setGlbBusy] = useState(false);
  const [cloudLimit, setCloudLimit] = useState(35);
  const [textureDescription, setTextureDescription] = useState<string | null>(null);
  const textureRequestId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(2);
  const exaggerationPresets = [1,2,3,5,10] as const;
  const [viewMode, setViewMode] = useState<"map"|"model">("map");
  const [style, setStyle] = useState<TerrainVisualStyle>("hypsometric");
  const [detailLevel, setDetailLevel] = useState<"auto"|"full"|"medium"|"low">("auto");
  const [textureUrl, setTextureUrl] = useState<string | null>(null);
  const [pickTarget,setPickTarget]=useState<"A"|"B"|null>(null);
  const [picked,setPicked]=useState<Partial<Record<"A"|"B",TerrainPick>>>({});
  const [lastPick,setLastPick]=useState<TerrainPickedPoint|null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapCaptureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  useEffect(() => () => {
    if (textureUrl?.startsWith("blob:")) URL.revokeObjectURL(textureUrl);
  }, [textureUrl]);

  // Open georeferenced 3D terrain on the world basemap when the DEM permits.
  useEffect(() => {
    setViewMode(terrain && validTerrainGeography(terrain) ? "map" : "model");
  }, [terrain]);

  // Both the GIS Workspace and Explorer now use the same WebGL renderer.
  // There is no iframe handoff; a click resolves a genuine 3D triangle.
  useEffect(()=>{
    setPickTarget(null);setPicked({});setLastPick(null);
    textureRequestId.current += 1;
    setTextureBusy(false);
    setTextureUrl(null);
    setTextureDescription(null);
  },[terrain]);

  const selectTerrainPoint=(point:TerrainPick)=>{
    if(!pickTarget||!terrain)return;
    try {
      const [lon,lat]=terrainToGeographic(terrain,point.xMeters,point.yMeters);
      setPicked(previous=>({...previous,[pickTarget]:point}));
      setLastPick({target:pickTarget,lon,lat,elevationMeters:point.elevationMeters});
      setPickTarget(pickTarget==="A"?"B":null);
      setError(null);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Falha na consulta de elevação.");
    }
  };


  useEffect(() => {
    if (!open || !terrain || viewMode === "map" || !canvasRef.current) return;
    setRendererError(null);
    try {
      return createTerrainRenderer(canvasRef.current, terrain, {
        exaggeration, style, textureUrl, detailLevel,
        pickEnabled:!!pickTarget,onPick:selectTerrainPoint,
        profileOverlay:picked.A&&picked.B?{
          start:[picked.A.xMeters,picked.A.yMeters],
          end:[picked.B.xMeters,picked.B.yMeters]
        }:null,
      });
    } catch (cause) {
      setRendererError(cause instanceof Error ? cause.message : String(cause));
      return undefined;
    }
  }, [open, terrain, exaggeration, style, textureUrl, pickTarget, picked, detailLevel, viewMode]);

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

  async function loadScene(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".geomoz") ||
        file.size < 1 || file.size > MAX_TERRAIN_SCENE_BYTES) {
      setError("Seleccione uma cena .geomoz válida até 4 MB.");
      return;
    }
    try {
      const scene = decodeTerrainScene(await file.text());
      setTerrain(scene.terrain);
      setStyle(scene.style);
      setExaggeration(scene.exaggeration);
      setTextureUrl(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cena .geomoz inválida.");
    } finally {
      if (sceneInputRef.current) sceneInputRef.current.value = "";
    }
  }

  function saveScene() {
    if (!terrain) return;
    try {
      const payload = encodeTerrainScene(terrain, style, exaggeration);
      const url = URL.createObjectURL(new Blob([payload], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "geomoz_terreno_3d.geomoz";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível guardar a cena.");
    }
  }

  async function loadAlignedTexture(file: File | undefined) {
    if (!file || !terrain) return;
    setError(null);
    if (!/\.tiff?$/i.test(file.name) || file.size > 32 * 1024 * 1024) {
      setError("A textura precisa de ser um GeoTIFF RGB com até 32 MB.");
      return;
    }
    setTextureBusy(true);
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("crs", terrain.crs);
      body.append("bounds_meters", JSON.stringify(terrain.boundsMeters));
      body.append("width", String(terrain.width));
      body.append("height", String(terrain.height));
      const response = await apiFetch("/geomoz-api/terrain/rgb-texture", {
        method: "POST", body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof result?.detail === "string" ? result.detail
          : "Não foi possível alinhar o raster RGB com o DEM.");
      }
      if (typeof result?.imageDataUrl !== "string" ||
          !result.imageDataUrl.startsWith("data:image/png;base64,")) {
        throw new Error("Resposta inválida ao processar a textura RGB.");
      }
      setTextureUrl(result.imageDataUrl);
      setTextureDescription("RGB GeoTIFF · " + file.name);
      setStyle("imagery");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao alinhar a textura.");
    } finally {
      setTextureBusy(false);
    }
  }

  async function generateSentinelTexture() {
    if (!terrain || !geeEnabled || textureBusy) {
      setError("Conecte o Google Earth Engine e carregue um DEM para obter Sentinel-2.");
      return;
    }
    const requestId = ++textureRequestId.current;
    setTextureBusy(true);
    setError(null);
    try {
      const response = await apiFetch("/geomoz-api/terrain/gee-rgb-texture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crs: terrain.crs,
          bounds_meters: terrain.boundsMeters,
          width: terrain.width,
          height: terrain.height,
          cloud_pct: cloudLimit,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof result?.detail === "string" ? result.detail
          : "Falha na composição Sentinel-2 (HTTP " + response.status + ").");
      }
      if (typeof result?.imageDataUrl !== "string" ||
          !result.imageDataUrl.startsWith("data:image/png;base64,") ||
          !Number.isInteger(result.sceneCount) || result.sceneCount < 1 ||
          result.width !== terrain.width || result.height !== terrain.height ||
          result.targetCrs !== terrain.crs) {
        throw new Error("A textura Sentinel-2 não corresponde à grelha do DEM.");
      }
      // Do not apply late GEE results to a different DEM/project.
      if (textureRequestId.current !== requestId) return;
      setTextureUrl(result.imageDataUrl);
      setStyle("imagery");
      setTextureDescription(
        "Sentinel-2 SR · " + result.sceneCount + " cenas · nuvens ≤ " +
        result.cloudPercent + "% · " + result.startDate + " a " + result.endDate
      );
    } catch (cause) {
      if (textureRequestId.current === requestId) {
        setError(cause instanceof Error ? cause.message : "Erro na textura Sentinel-2.");
      }
    } finally {
      if (textureRequestId.current === requestId) setTextureBusy(false);
    }
  }

  async function exportGLB() {
    if (!terrain || glbBusy) return;
    setGlbBusy(true);
    setError(null);
    try {
      const texture = textureUrl && style === "imagery"
        ? await imageToGLBTexture(textureUrl) : undefined;
      const bytes = encodeTerrainGLB(terrain, exaggeration, style, texture);
      const blob = new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "geomoz_terreno_3d.glb"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao exportar modelo GLB.");
    } finally {
      setGlbBusy(false);
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
    setTextureDescription("Textura local · " + file.name);
    setStyle("imagery");
  }

  function downloadCanvas() {
    const canvas = viewMode === "map" ? mapCaptureRef.current?.() : canvasRef.current;
    if (!canvas || !terrain || (viewMode !== "map" && rendererError)) return;
    try { canvas.toBlob(blob => {
      if (!blob) { setError("Não foi possível exportar a imagem."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "geomoz_terreno_3d.png"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png"); }
    catch { setError("Não foi possível exportar o mapa; verifique as permissões CORS dos mosaicos."); }
  }

  function exportPdf() {
    const canvas = viewMode === "map" ? mapCaptureRef.current?.() : canvasRef.current;
    if (!canvas || !terrain || (viewMode !== "map" && rendererError)) return;
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(17);
      pdf.text("GeoMoz | Terreno 3D", 12, 15);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
      const projectName = (activeProject?.name ?? "Sessão local").slice(0, 65);
      pdf.text("Projecto: " + projectName, 12, 21);
      pdf.text("Fonte: " + terrain.name.slice(0, 70) + " | " + terrain.sourceCrs, 12, 26);
      pdf.text("Elevação: " + terrain.minElevation.toFixed(1) + " a " +
        terrain.maxElevation.toFixed(1) + " m | Exagero vertical: " +
        exaggeration.toFixed(1) + "x", 12, 31);

      // Preserve the exported view's aspect ratio; never stretch the map.
      const maxWidth = 273, maxHeight = 150;
      const aspect = Math.max(0.01, canvas.width / Math.max(1, canvas.height));
      const width = Math.min(maxWidth, maxHeight * aspect);
      const height = width / aspect;
      const x = 12 + (maxWidth - width) / 2;
      const y = 35 + (maxHeight - height) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, width, height);
      pdf.setDrawColor(160, 170, 180);
      pdf.rect(x, y, width, height);
      pdf.setFontSize(8);
      pdf.text(
        "Perspectiva tridimensional: a escala não é constante. " +
        "A malha é uma pré-visualização do DEM, não um raster analítico.",
        12, 192
      );
      if (viewMode === "map") pdf.text("Mapa-base: Esri / OpenStreetMap. Consulte a atribuição apresentada no mapa.", 12, 199);
      else pdf.text("Created with GeoMoz Explorer", 12, 199);
      pdf.save("geomoz_terreno_3d.pdf");
    } catch {
      setError("A exportação PDF falhou. Experimente exportar em PNG.");
    }
  }

  if (!open) return null;
  const mapReady = !!terrain && validTerrainGeography(terrain);
  const localCanvasReady = viewMode === "model" || !mapReady;
  const projectBounds=activeProject?.aoi.bounds ??
    (activeProject?.aoi.geometry?computeGeoJSONBounds(activeProject.aoi.geometry):null);
  const outOfProjectArea=!!(terrain && projectBounds &&
    (projectBounds[0][1]>terrain.bounds4326[2] ||
     projectBounds[1][1]<terrain.bounds4326[0] ||
     projectBounds[0][0]>terrain.bounds4326[3] ||
     projectBounds[1][0]<terrain.bounds4326[1]));
  return (
    <div data-testid="geomoz-terrain-module" role="region" aria-label="Terreno 3D"
      className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-2 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300"><Mountain size={20}/></div>
          <div>
            <h2 className="text-sm font-bold">Modelo Digital de Terreno · 3D</h2>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Relevo, altimetria e modelos digitais · projecto GeoMoz
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!terrain}
            onClick={saveScene}
            className="rounded-lg border border-sky-300 dark:border-sky-600 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            <Download size={13} className="mr-1 inline"/> .geomoz
          </button>
          <button type="button" disabled={!terrain || glbBusy}
            onClick={() => void exportGLB()}
            title="Exportar modelo glTF 2.0 em metros, com a textura actual incorporada"
            className="rounded-lg border border-sky-300 dark:border-sky-600 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            {glbBusy ? <Loader2 size={13} className="mr-1 inline animate-spin"/> : <Download size={13} className="mr-1 inline"/>}
            GLB 3D
          </button>
          <button type="button" disabled={!terrain || (viewMode !== "map" && !!rendererError)}
            onClick={downloadCanvas}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            <Download size={13} className="mr-1 inline"/> PNG
          </button>
          <button type="button" disabled={!terrain || (viewMode !== "map" && !!rendererError)}
            onClick={exportPdf}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40">
            <Download size={13} className="mr-1 inline"/> PDF
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar Terrain Studio"
            className="rounded-lg border border-slate-300 dark:border-slate-600 p-2 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={17}/>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="order-2 max-h-[42vh] w-full shrink-0 space-y-5 overflow-y-auto border-t border-slate-200 bg-white p-4 md:order-1 md:max-h-none md:w-72 md:border-r md:border-t-0 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="terrain-studio-dem">
              1. Modelo digital de elevação
            </label>
            {geeRegion && (
              <button type="button" disabled={busy || !geeEnabled}
                onClick={() => void loadFromGEE()}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/50 bg-sky-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin"/> : <Mountain size={15}/>}
                Gerar do DEM Copernicus (GEE)
              </button>
            )}
            <input ref={sceneInputRef} type="file" accept=".geomoz"
              className="sr-only" aria-label="Abrir cena 3D .geomoz"
              onChange={event => void loadScene(event.target.files?.[0])} />
            <button type="button" disabled={busy}
              onClick={() => sceneInputRef.current?.click()}
              className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:bg-sky-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              Reabrir cena 3D (.geomoz)
            </button>
            <input ref={fileInputRef} id="terrain-studio-dem" type="file"
              accept=".tif,.tiff,image/tiff" className="sr-only"
              onChange={event => void loadGeoTiff(event.target.files?.[0])}/>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin"/> : <FileUp size={15}/>}
              {busy ? "A processar DEM..." : "Importar GeoTIFF / COG"}
            </button>
            {terrain && (
              <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-600/40 dark:bg-emerald-950/25 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                {embedded
                  ? "DEM temporário do GIS Workspace. A camada raster original permanece no mapa; pode guardar esta vista como .geomoz."
                  : "Modelo partilhado na sessão GeoMoz" + (activeProject ? ": " + activeProject.name : "") + ". Pode alternar entre os módulos sem voltar a processá-lo."}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              Até 32 MB. A malha é calculada na API GeoMoz e não fica guardada.
              Com o GEE conectado, é possível gerar directamente a pré-visualização
              da área seleccionada. A opção local aceita GeoTIFF do projecto.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="terrain-studio-style" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              2. Estilo de superfície
            </label>
            <select id="terrain-studio-style" value={style}
              onChange={event => setStyle(event.target.value as TerrainVisualStyle)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 p-2 text-xs">
              <option value="hypsometric">Hipsometria e relevo sombreado</option>
              <option value="grayscale">Relevo em escala de cinzentos</option>
              <option value="imagery" disabled={!textureUrl}>Imagem de satélite / ortofoto</option>
            </select>
            <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5 dark:border-sky-800 dark:bg-slate-800/60">
              <label className="block text-xs font-semibold text-sky-900 dark:text-sky-200">
                Textura de satélite automática
              </label>
              <div className="flex items-center gap-2">
                <label htmlFor="terrain-cloud-filter" className="text-[11px]">Nuvens (%)</label>
                <select id="terrain-cloud-filter" value={cloudLimit}
                  disabled={textureBusy}
                  onChange={event => setCloudLimit(Number(event.target.value))}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                  {[10, 20, 35, 50, 70, 100].map(p=><option value={p} key={p}>{p}%</option>)}
                </select>
              </div>
              <button type="button" disabled={!terrain || !geeEnabled || textureBusy}
                data-testid="geomoz-terrain-sentinel-rgb"
                onClick={() => void generateSentinelTexture()}
                title="Sentinel-2 SR Harmonized: composição RGB mediana dos últimos 12 meses"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50">
                {textureBusy ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14}/>}
                {textureBusy ? "A processar imagens Sentinel-2…" : "Aplicar Sentinel-2 RGB ao terreno"}
              </button>
              <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                Composição mediana dos últimos 12 meses, com máscara de nuvens e
                reprojecção para o CRS do DEM. Requer GEE conectado; áreas até 300 km por lado.
              </p>
              {textureDescription && <p role="status" className="text-[10px] font-medium text-sky-800 dark:text-sky-300">
                {textureDescription}
              </p>}
            </div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Nível de detalhe (LOD)
              <select value={detailLevel} aria-label="Nível de detalhe do terreno 3D"
                onChange={event => setDetailLevel(event.target.value as typeof detailLevel)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                <option value="auto">Automático com o zoom</option>
                <option value="full">Detalhe máximo · grelha completa</option>
                <option value="medium">Desempenho equilibrado · LOD 2</option>
                <option value="low">Máximo desempenho · LOD 4</option>
              </select>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-300">
              O LOD ajusta os triângulos desenhados sem alterar o DEM original, os perfis
              científicos ou os pixels sem dados. DEM extensos ainda requerem recorte.
            </p>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-600/50 dark:bg-emerald-950/20 p-2.5 text-xs text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 ${!terrain || textureBusy ? "pointer-events-none opacity-50" : ""}`}>
              {textureBusy ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14}/>}
              {textureBusy ? "A alinhar textura RGB..." : "GeoTIFF RGB georreferenciado"}
              <input type="file" accept=".tif,.tiff,image/tiff" disabled={!terrain || textureBusy}
                className="sr-only" onChange={event => void loadAlignedTexture(event.target.files?.[0])}/>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
              A imagem RGB (bandas 1, 2 e 3) é automaticamente reprojetada e alinhada
              com a grelha métrica do DEM, preservando pixels sem dados.
            </p>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800">
              <ImageIcon size={14}/> Carregar textura alinhada
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                onChange={event => loadTexture(event.target.files?.[0])}/>
            </label>
            <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
              A textura deve ter a mesma extensão e orientação geográfica do DEM.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <label htmlFor="terrain-studio-exaggeration">3. Exagero vertical</label>
              <span className="text-sky-600 dark:text-sky-400">{exaggeration.toFixed(1)}×</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Valores rápidos de exagero vertical">
              {exaggerationPresets.map(value=><button key={value} type="button"
                aria-pressed={exaggeration===value} onClick={()=>setExaggeration(value)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${exaggeration===value
                  ?"border-sky-500 bg-sky-600 text-white":"border-slate-300 text-slate-700 hover:border-sky-400 dark:border-slate-600 dark:text-slate-200"}`}>
                {value}×</button>)}
            </div>
            <input id="terrain-studio-exaggeration" type="range" min="1" max="15"
              step="0.5" value={exaggeration}
              onChange={event => setExaggeration(Number(event.target.value))}
              className="w-full accent-sky-600"/>
            <button type="button" onClick={() => {setExaggeration(2);setStyle("hypsometric");}}
              className="flex items-center gap-2 text-[11px] text-slate-600 hover:text-sky-700 dark:text-slate-300 dark:hover:text-sky-300">
              <RotateCcw size={12}/> Restaurar estilo
            </button>
          </div>
          {terrain && (
            <section aria-label="Metadados de elevação" className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs">
              <p className="truncate font-semibold" title={terrain.name}>{terrain.name}</p>
              <p className="text-slate-600 dark:text-slate-300">CRS de trabalho: {terrain.crs}</p>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="block text-slate-600 dark:text-slate-300">Mínima</span>{terrain.minElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-600 dark:text-slate-300">Máxima</span>{terrain.maxElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-600 dark:text-slate-300">Média</span>{terrain.meanElevation.toFixed(1)} m</div>
                <div><span className="block text-slate-600 dark:text-slate-300">Válidas</span>{(terrain.validFraction*100).toFixed(1)}%</div>
              </div>
              <p className="text-[10px] text-slate-600 dark:text-slate-300">Amostragem de pré-visualização: {terrain.width} × {terrain.height} pixels. Não substitui o raster original.</p>
            </section>
          )}
          {terrain && <TerrainSciencePanel terrain={terrain} pickedPoint={lastPick}
            activePickTarget={pickTarget} onRequestPick={setPickTarget} />}
          {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">{error}</p>}
          {rendererError && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-xs text-rose-200">{rendererError}</p>}
        </aside>
        <section className="relative order-1 min-h-[220px] flex-1 overflow-hidden bg-slate-100 md:order-2 dark:bg-slate-950"
          aria-label="Visualizador tridimensional do DEM">
          {terrain && mapReady && (
            <div data-testid="terrain-studio-view-switch" role="group"
              aria-label="Modos de visualização do terreno 3D"
              className="absolute right-4 top-4 z-30 flex gap-1 rounded-xl border border-slate-500/40 bg-slate-950/90 p-1 text-xs font-semibold text-white shadow-xl backdrop-blur">
              <button type="button" data-testid="terrain-studio-map-mode"
                aria-pressed={viewMode==="map"} onClick={()=>setViewMode("map")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ${viewMode==="map"?"bg-sky-600 text-white":"text-slate-200 hover:bg-slate-700"}`}>
                <MapIcon size={14}/> Sobre mapa 3D
              </button>
              <button type="button" data-testid="terrain-studio-model-mode"
                aria-pressed={viewMode==="model"} onClick={()=>setViewMode("model")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 ${viewMode==="model"?"bg-sky-600 text-white":"text-slate-200 hover:bg-slate-700"}`}>
                <Box size={14}/> Modelo isolado
              </button>
            </div>
          )}
          {terrain ? (
            localCanvasReady
              ? <canvas ref={canvasRef} aria-label="Modelo tridimensional de elevação"
                  className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"/>
              : <TerrainBasemap terrain={terrain} exaggeration={exaggeration}
                  style={style} rasterTexture={textureUrl} captureRef={mapCaptureRef}/>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <Mountain size={56} className="text-sky-500/60"/>
              <div>
                <h3 className="text-lg font-semibold">Transformar DEM em terreno 3D</h3>
                <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
                  Importe um GeoTIFF de elevação com CRS definido. A superfície manterá
                  a escala horizontal métrica e os vazios NoData não serão preenchidos artificialmente.
                </p>
              </div>
            </div>
          )}
          {outOfProjectArea && <div role="status" className="absolute bottom-20 left-4 z-30 max-w-sm rounded-lg border border-amber-300 bg-amber-50/95 p-3 text-xs text-amber-900 shadow-sm">A extensão do DEM não intersecta a área de interesse definida no projecto activo. Confirme o ficheiro seleccionado.</div>}
          {terrain && !mapReady && <div role="status" className="absolute left-4 top-4 max-w-xs rounded-lg border border-amber-300 bg-amber-50/95 p-3 text-xs text-amber-900 shadow-sm">O mapa-base 3D requer um DEM com georreferenciação WGS84/UTM válida. O modelo isolado continua disponível.</div>}
          {terrain && localCanvasReady && <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 backdrop-blur">
            {pickTarget?"Clique sobre o relevo para marcar "+pickTarget:
              "Arrastar: rodar · Roda: aproximar · Seleccione A/B para consultar a elevação"}
          </div>}
        </section>
      </div>
    </div>
  );
}
