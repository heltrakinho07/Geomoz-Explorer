import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import ZoneSelect from "@/components/ZoneSelect";
import { useSubscription } from "@/hooks/useSubscription";
import { apiFetch } from "@/lib/api";
import { customAOI, type AreaOfInterest } from "@/lib/aoi";

interface Props {
  user: User | null;
  aoi: AreaOfInterest;
  onAOIChange: (aoi: AreaOfInterest) => void;
  onDraw: (shape: "polygon" | "rectangle") => void;
  onPreview: (geometry: GeoJSON.GeoJSON) => void;
  onRaster: (file: File, name: string) => void;
  onOpenTerrain: (file: File) => void;
}

interface Estimate {
  areaKm2: number;
  pixels: number;
  columns: number;
  rows: number;
  estimatedBytes: number;
  coverage: number | null;
  coverageScale: number;
  geometry: GeoJSON.GeoJSON;
}

const products = {
  elevation: "Elevação",
  slope: "Declive (°)",
  aspect: "Orientação (°)",
  hillshade: "Sombreado",
};

function polygonGeometry(value: GeoJSON.GeoJSON | null): GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined {
  if (!value) return;
  if (value.type === "Polygon" || value.type === "MultiPolygon") return value;
  if (value.type === "Feature") return polygonGeometry(value.geometry);
  if (value.type === "FeatureCollection") {
    const parts = value.features.map(feature => polygonGeometry(feature.geometry));
    if (parts.length && parts.every(part => part !== undefined)) {
      return {
        type: "MultiPolygon",
        coordinates: parts.flatMap(part => part.type === "Polygon" ? [part.coordinates] : part.coordinates),
      };
    }
  }
}

const action = "rounded border border-slate-300 px-2 py-1.5 disabled:opacity-50 dark:border-slate-600";

export default function WorkspaceCopernicusPanel({ user, aoi, onAOIChange, onDraw, onPreview, onRaster, onOpenTerrain }: Props) {
  const subscription = useSubscription();
  const [demFile, setDemFile] = useState<File>();
  const [scale, setScale] = useState(30);
  const [crs, setCrs] = useState("EPSG:4326");
  const [product, setProduct] = useState<keyof typeof products>("elevation");
  const [clip, setClip] = useState(true);
  const [preview, setPreview] = useState<{ key: string; data: Estimate }>();
  const [busy, setBusy] = useState<"preview" | "generate">();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [vertex, setVertex] = useState(0);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), [user]);

  const geometry = polygonGeometry(aoi.geometry);
  const payload = JSON.stringify({ geometry, province: aoi.province, district: aoi.district, scale, crs, clip, product });
  useEffect(() => () => request.current?.abort(), [payload]);
  const estimate = preview?.key === payload ? preview.data : undefined;
  const hasArea = Boolean(geometry || aoi.province || aoi.district);
  const exterior = geometry?.type === "Polygon" ? geometry.coordinates[0] : undefined;
  const point = exterior?.[vertex];

  async function run(mode: "preview" | "generate") {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(mode);
    setError("");
    setMessage("");
    try {
      const endpoint = mode === "preview" ? "preview" : "geotiff";
      const response = await apiFetch(`/geomoz-api/terrain/gee-workspace-dem/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null))?.detail;
        throw new Error(typeof detail === "string" ? detail : `Pedido recusado (HTTP ${response.status}). Verifique a área e as opções.`);
      }
      if (mode === "preview") {
        const data: Estimate = await response.json();
        if (!controller.signal.aborted) {
          setPreview({ key: payload, data });
          onPreview(data.geometry);
        }
      } else {
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const file = new File([blob], `copernicus-glo30-${product}-${scale}m.tif`, { type: "image/tiff" });
        if (product === "elevation") setDemFile(file);
        onRaster(file, `Copernicus GLO-30 · ${products[product]}`);
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setMessage("GeoTIFF descarregado e adicionado ao mapa 3D e às camadas do Workspace.");
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Falha no processamento.");
    } finally {
      request.current = null;
      setBusy(undefined);
    }
  }

  function updateVertex(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (geometry?.type !== "Polygon" || !exterior || !point) return;
    const data = new FormData(event.currentTarget);
    const replacement = [Number(data.get("lon")), Number(data.get("lat"))];
    const ring = exterior.map((position, index) =>
      index === vertex || (vertex === 0 && index === exterior.length - 1) ? replacement : position,
    );
    onAOIChange(customAOI({ ...geometry, coordinates: [ring, ...geometry.coordinates.slice(1)] }, aoi.label, "draw"));
  }

  return (
    <section className="mx-3 mt-3 space-y-3 rounded-xl border border-teal-500/40 p-3 text-xs">
      <h3 className="text-sm font-bold">Copernicus GLO-30 <span className="text-teal-700 dark:text-teal-300">· Pro</span></h3>
      {!user || user.uid === "guest_user" ? <p>Inicie sessão com uma conta GeoMoz Pro.</p> : subscription.loading ? (
        <p role="status">A verificar acesso Pro…</p>
      ) : subscription.error ? <p role="alert">Não foi possível verificar o plano. Reabra o Workspace para tentar novamente.</p>
        : !subscription.can("gee_terrain_pro") ? <p>Disponível para planos Pro, Teams e Enterprise.</p> : <>
        <p>Modelo digital de superfície Copernicus, com resolução nativa aproximada de 30 m. Ligue o seu Google Earth Engine nas Definições.</p>
        <fieldset disabled={Boolean(busy)} className="space-y-3">
          <ZoneSelect aoi={aoi} onAOIChange={next => { setVertex(0); onAOIChange(next); }} onDrawingRequest={() => onDraw("polygon")} />
          <p><strong>Área de estudo</strong> · {aoi.label}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={action} onClick={() => { setVertex(0); onDraw("polygon"); }}>Desenhar polígono</button>
            <button type="button" className={action} onClick={() => { setVertex(0); onDraw("rectangle"); }}>Desenhar rectângulo</button>
          </div>
          {point && exterior && exterior.length > 3 && (
            <details>
              <summary className="cursor-pointer">Editar vértices do contorno</summary>
              <form key={`${vertex}-${point.join(",")}`} onSubmit={updateVertex} className="mt-2 grid grid-cols-2 gap-2">
                <label>Vértice <input className="w-full bg-transparent" type="number" min={1} max={exterior.length - 1} value={vertex + 1}
                  onChange={event => setVertex(Math.max(0, Math.min(exterior.length - 2, Number(event.target.value) - 1)))} /></label>
                <label>Longitude <input className="w-full bg-transparent" required type="number" name="lon" step="any" min={-180} max={180} defaultValue={point[0]} /></label>
                <label>Latitude <input className="w-full bg-transparent" required type="number" name="lat" step="any" min={-89.9999} max={89.9999} defaultValue={point[1]} /></label>
                <button className={action}>Aplicar ao mapa</button>
              </form>
            </details>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label>Escala (m)<input className="block w-full rounded border bg-transparent p-1" type="number" min={30} max={500} step={1} value={scale} onChange={event => setScale(Number(event.target.value))} /></label>
            <label>CRS<select className="block w-full rounded border bg-transparent p-1" value={crs} onChange={event => setCrs(event.target.value)}>
              <option value="EPSG:4326">WGS84</option><option value="EPSG:32736">UTM 36S</option><option value="EPSG:32737">UTM 37S</option>
            </select></label>
            <label>Produto<select className="block w-full rounded border bg-transparent p-1" value={product} onChange={event => setProduct(event.target.value as keyof typeof products)}>
              {Object.entries(products).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={clip} onChange={event => setClip(event.target.checked)} /> Recortar pelo contorno</label>
          </div>
          <p className="text-slate-500 dark:text-slate-400">Limite por exportação de 3 milhões de píxeis e 9 900 por eixo. Sem recorte, exporta a caixa envolvente.</p>
          {estimate && <dl className="grid grid-cols-2 gap-1">
            <dt>Área</dt><dd>{estimate.areaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 3 })} km²</dd>
            <dt>Grelha estimada</dt><dd>{estimate.columns} × {estimate.rows} píxeis</dd>
            <dt>Volume bruto estimado</dt><dd>{(estimate.estimatedBytes / 1e6).toFixed(2)} MB</dd>
            <dt>Cobertura DEM a {estimate.coverageScale} m</dt><dd>{estimate.coverage === null ? "Sem amostras" : `${(estimate.coverage * 100).toFixed(1)}%`}</dd>
          </dl>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={action} disabled={!hasArea || !Number.isInteger(scale) || scale < 30 || scale > 500}
              onClick={() => void run("preview")}>Validar área e cobertura</button>
            <button type="button" className="rounded bg-teal-700 px-2 py-1.5 text-white disabled:opacity-50"
              disabled={!estimate || estimate.coverage === 0} onClick={() => void run("generate")}>Gerar GeoTIFF</button>
          </div>
        </fieldset>
        {busy && <div role="status" className="flex items-center gap-2">
          {busy === "preview" ? "A verificar cobertura no GEE…" : "A processar e descarregar o GeoTIFF…"}
          <button className={action} onClick={() => { request.current?.abort(); setMessage("Pedido cancelado no navegador."); }}>Cancelar pedido</button>
        </div>}
        {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
        {message && <p role="status">{message}</p>}
        {demFile && <button type="button" className={action} disabled={Boolean(busy)} onClick={() => onOpenTerrain(demFile)}>
          Abrir DEM gerado como relevo no Terrain Studio
        </button>}
      </>}
    </section>
  );
}
