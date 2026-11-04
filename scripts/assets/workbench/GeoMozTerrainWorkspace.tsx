/**
 * GeoMoz-native terrain workspace over the pinned GeoLibre engine.
 *
 * The GIS map, layers and editing session remain mounted. Only the selected
 * GeoTIFF bytes travel through a same-origin, source-checked postMessage to a
 * protected GeoMoz Explorer view. Nothing is stored in localStorage/Firestore.
 */
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@geolibre/core";
import { terrainRasterLayerOptions } from "../../lib/terrain-raster-layer";
import { ArrowLeft, Layers3, Loader2, Mountain, X } from "lucide-react";
import "./geomoz-terrain-workspace.css";

const LIMIT = 32 * 1024 * 1024;

interface Props {
  open: boolean;
  onClose: () => void;
  preferredLayerId?: string | null;
}

async function fetchBoundedTerrain(source: string, name: string): Promise<File> {
  const url = new URL(source, window.location.href);
  if (!["blob:", "https:", "http:"].includes(url.protocol)) {
    throw new Error("A origem deste DEM não pode ser exportada como GeoTIFF.");
  }
  if (url.protocol === "http:" && window.location.protocol === "https:") {
    throw new Error("A fonte do raster deve ser HTTPS.");
  }
  const response = await fetch(url.href, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Não foi possível ler o GeoTIFF da camada seleccionada.");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > LIMIT) {
    await response.body?.cancel();
    throw new Error("Este DEM excede 32 MB. Recorte-o antes de abrir em 3D.");
  }
  if (!response.body) throw new Error("O raster não disponibiliza transferência binária.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT) throw new Error("Este DEM excede 32 MB. Recorte-o antes de abrir em 3D.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("A origem raster está vazia.");
  const base = name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim().slice(0, 96);
  const filename = /\.tiff?$/i.test(base) ? base : (base || "dem") + ".tif";
  return new File(chunks as BlobPart[], filename, { type: "image/tiff" });
}

export function GeoMozTerrainWorkspace({ open, onClose, preferredLayerId }: Props) {
  const layers = useAppStore(s => s.layers);
  const currentId = useAppStore(s => s.selectedLayerId);
  const projectName = useAppStore(s => s.projectName);
  const options = terrainRasterLayerOptions(layers);
  const [selected, setSelected] = useState("");
  const [frameReady, setFrameReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const pendingFile = useRef<File | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = [preferredLayerId, currentId, selected]
      .find(id => id && options.some(option => option.id === id));
    setSelected(next ?? options[0]?.id ?? "");
  }, [open, preferredLayerId, currentId, layers]);

  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const message = event.data as { type?: string } | null;
      if (message?.type === "geomoz:terrain:ready") {
        setFrameReady(true);
        if (pendingFile.current) {
          frame.current?.contentWindow?.postMessage(
            { type: "geomoz:terrain:import-file", file: pendingFile.current, projectName },
            window.location.origin
          );
          pendingFile.current = null;
        }
      }
      if (message?.type === "geomoz:terrain:close") onClose();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, projectName, onClose]);

  useEffect(() => {
    if (!open) {
      pendingFile.current = null;
      setFrameReady(false);
      setBusy(false);
      setError(null);
      setNotice("");
    }
  }, [open]);

  async function openSelectedDEM() {
    const layer = options.find(item => item.id === selected);
    if (!layer) {
      setError("Seleccione uma camada GeoTIFF / COG no catálogo do projecto.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice("A preparar o DEM " + layer.name + " para visualização 3D…");
    try {
      const file = await fetchBoundedTerrain(layer.source, layer.name);
      if (frameReady && frame.current?.contentWindow) {
        frame.current.contentWindow.postMessage(
          { type: "geomoz:terrain:import-file", file, projectName }, window.location.origin
        );
      } else {
        pendingFile.current = file;
      }
      setNotice("DEM enviado para a vista 3D: " + layer.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na transferência do raster.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <section className="gm-terrain-workspace" aria-label="Terreno 3D do GIS Workspace"
      data-testid="geomoz-workbench-terrain">
      <header className="gm-terrain-workspace-toolbar">
        <div className="gm-terrain-workspace-title">
          <Mountain size={19}/>
          <div><strong>Terreno 3D</strong><small>GIS Workspace · {projectName || "Projecto actual"}</small></div>
        </div>
        <label className="gm-terrain-workspace-selector">
          <Layers3 size={15}/>
          <span>DEM do projecto</span>
          <select aria-label="Seleccionar DEM do GIS Workspace" value={selected}
            onChange={event => setSelected(event.target.value)}>
            {!options.length && <option value="">Nenhuma camada GeoTIFF disponível</option>}
            {options.map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select>
        </label>
        <button type="button" className="gm-terrain-workspace-load"
          disabled={busy || !options.length}
          data-testid="geomoz-workbench-terrain-import"
          onClick={() => void openSelectedDEM()}>
          {busy ? <Loader2 size={15} className="gm-terrain-spin"/> : <Mountain size={15}/>}
          {busy ? "A preparar…" : "Visualizar camada em 3D"}
        </button>
        <button type="button" className="gm-terrain-workspace-close"
          onClick={onClose} aria-label="Voltar ao mapa GIS">
          <ArrowLeft size={15}/> Voltar ao mapa <X size={14}/>
        </button>
      </header>
      {error && <p className="gm-terrain-workspace-error" role="alert">{error}</p>}
      {!error && notice && <p className="gm-terrain-workspace-notice" role="status">{notice}</p>}
      <iframe ref={frame} title="GeoMoz Terreno 3D — modelo do projecto"
        className="gm-terrain-workspace-frame"
        src="/terreno-3d?embedded=1"/>
    </section>
  );
}
