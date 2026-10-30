import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@geolibre/core";
import { Check, Database, Loader2, Search, X } from "lucide-react";
import {
  searchQmsBasemaps, getQmsTileSource, createQmsPreviewTile,
  type QmsServiceSummary, type QmsTileSource, type QmsSearchBounds, type QmsPreviewTile,
} from "../../lib/geomoz-qms-catalog";

/** GeoMoz-owned bridge from the public NextGIS QMS catalogue into GeoLibre's
 * native persisted XYZ/TMS raster layers. No QGIS plugin code is copied. */
export function GeoMozQmsCatalog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<"mozambique" | "africa" | "all">("all");
  const regionBounds: QmsSearchBounds | undefined = region === "mozambique"
    ? [30.0, -27, 42, -10] : region === "africa"
      ? [-19, -35.5, 52, 38] : undefined;
  const [results, setResults] = useState<QmsServiceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");
  const [preview, setPreview] = useState<{ name: string; tile: QmsPreviewTile | null; outsideMozambique: boolean } | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [previewError, setPreviewError] = useState("");
  const previewRequest = useRef(0);
  const addTileLayer = useAppStore((s) => s.addTileLayer);
  const canAdd = useAppStore((s) => s.deploymentCapabilities.has("data:add"));

  useEffect(() => {
    // Do not retain a preview for a different area or search query.
    ++previewRequest.current;
    setPreview(null);
    setPreviewError("");
    const term = query.trim();
    if (term.length < 2) {
      setLoading(false);
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setResults([]);
    setError("");
    const timeout = window.setTimeout(() => {
      void searchQmsBasemaps(term, controller.signal, regionBounds)
        .then((services) => { if (!controller.signal.aborted) setResults(services); })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : "O catálogo QMS não respondeu.");
          }
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, region]);

  const inspect = async (service: QmsServiceSummary) => {
    const request = ++previewRequest.current;
    setPreview(null);
    setPreviewError("");
    setPreviewStatus("loading");
    try {
      const source = await getQmsTileSource(service.id);
      if (request !== previewRequest.current) return;
      const tile = createQmsPreviewTile(source, regionBounds);
      const mozambique: QmsSearchBounds = [30, -27, 42, -10];
      const outsideMozambique = Boolean(source.extent &&
        !createQmsPreviewTile(source, mozambique));
      setPreview({ name: source.name, tile, outsideMozambique });
    } catch (cause) {
      if (request === previewRequest.current) {
        setPreviewError(cause instanceof Error ? cause.message : "Não foi possível inspeccionar o serviço.");
      }
    }
  };

  const add = async (service: QmsServiceSummary) => {
    if (!canAdd || addingId !== null) return;
    setAddingId(service.id);
    setError("");
    setAdded("");
    try {
      const source: QmsTileSource = await getQmsTileSource(service.id);
      // MapLibre accepts {x}/{y}/{z}, not Leaflet's {s}. Materialize subdomains
      // as separate URL templates so the service renders in the native GIS map.
      const tiles = source.url.includes("{s}")
        ? ["a", "b", "c"].map((subdomain) => source.url.replace(/\{s\}/g, subdomain))
        : [source.url];
      const id = addTileLayer(source.name, {
        type: "xyz",
        tiles,
        url: source.url,
        tileSize: 256,
        maxzoom: source.maxZoom,
        scheme: source.tms ? "tms" : "xyz",
        attribution: source.attribution,
        visible: true,
        // Keep the underlying map legible even when a remote tile is opaque/black.
        opacity: 0.72,
        metadata: {
          geomozProvider: "NextGIS QMS",
          geomozQmsId: source.id,
          geomozTermsUrl: source.termsUrl ?? null,
        },
      });
      if (!id) throw new Error("O motor SIG não confirmou a criação da camada.");
      setAdded(source.name);
      // Keep the native catalogue synchronized with the user's work.
      window.dispatchEvent(new CustomEvent("geomoz:task", { detail: "data" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar o serviço.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <section className="gm-qms-panel" aria-label="Catálogo GeoMoz de mapas-base" role="dialog">
      <header>
        <div>
          <strong><Database size={16} /> Catálogo de mapas-base</strong>
          <small>GeoMoz · serviços XYZ/TMS em EPSG:3857</small>
        </div>
        <button type="button" aria-label="Fechar catálogo de mapas-base" onClick={onClose}><X size={17} /></button>
      </header>
      <label className="gm-qms-search">
        <Search size={15} aria-hidden="true" />
        <input aria-label="Pesquisar mapas-base GeoMoz" type="search" value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar OpenStreetMap, relevo, satélite…" />
      </label>
      <label className="gm-qms-search gm-qms-region">
        <span className="text-xs">Cobertura geográfica</span>
        <select aria-label="Filtrar serviços por região" value={region}
          onChange={(event) => setRegion(event.target.value as typeof region)}
          className="w-full rounded border bg-background px-2 py-1 text-xs">
          <option value="mozambique">Moçambique (recomendado)</option>
          <option value="africa">África</option>
          <option value="all">Todas as regiões (inclui serviços globais)</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Escolha uma região para evitar ortofotos sem cobertura; a opção global mantém o catálogo completo.
        Serviços externos podem apresentar imagens vazias; ajuste a opacidade no catálogo de camadas.
      </p>
      {!canAdd && <p role="status">A sua sessão não permite adicionar camadas ao projecto.</p>}
      {loading && <p role="status"><Loader2 size={14} className="gm-qms-spinner" /> A pesquisar…</p>}
      {error && <p role="alert" className="gm-qms-error">{error}</p>}
      {added && <p role="status" className="gm-qms-success"><Check size={14}/> Camada «{added}» adicionada ao projecto com 72% de opacidade. Pode ajustá-la no catálogo.</p>}
      {!loading && query.trim().length >= 2 && !results.length && !error &&
        <p>Nenhum serviço XYZ/TMS compatível encontrado.</p>}
      <div className="gm-qms-results">
        {results.map((item) => (
          <div className="gm-qms-service-row" key={item.id} title={item.description || item.name}>
            <span><strong>{item.name}</strong><small>{item.description || "Serviço cartográfico remoto"}</small></span>
            <div className="gm-qms-service-actions">
              <button type="button" disabled={addingId !== null}
                aria-label={"Verificar mosaico de " + item.name} onClick={() => void inspect(item)}>Verificar</button>
              <button type="button" disabled={!canAdd || addingId !== null}
                aria-label={"Adicionar " + item.name} onClick={() => void add(item)}>
                {addingId === item.id ? <Loader2 size={16} className="gm-qms-spinner" /> : "Adicionar"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {previewError && <p role="alert" className="gm-qms-error">{previewError}</p>}
      {preview && <section className="gm-qms-preview" aria-label="Diagnóstico visual do serviço">
        <strong>Pré-visualização · {preview.name}</strong>
        {preview.outsideMozambique && <p role="alert">A cobertura declarada do fornecedor não inclui Moçambique.
          Navegue até à região do serviço antes de o utilizar no mapa.</p>}
        {!preview.tile ? <p role="alert">A cobertura declarada não intersecta a região seleccionada.
          Escolha outra região no filtro ou seleccione outro serviço.</p> : <>
          <img key={preview.tile.url} src={preview.tile.url} alt={"Mosaico de verificação: " + preview.name}
            width={256} height={256} onLoad={() => setPreviewStatus("loaded")}
            onError={() => setPreviewStatus("failed")} />
          {previewStatus === "loading" && <p role="status">A carregar um mosaico de amostra…</p>}
          {previewStatus === "loaded" && <p role="status">Mosaico recebido. Confirme visualmente se contém dados válidos;
            uma imagem preta pode indicar ausência de cobertura, mesmo sem erro de rede.</p>}
          {previewStatus === "failed" && <p role="alert">O mosaico de amostra falhou.
            Verifique a disponibilidade, cobertura, zoom e acesso à rede antes de adicionar a camada.</p>}
          <small>Nível {preview.tile.zoom} · localização de teste {preview.tile.latitude.toFixed(3)}°, {preview.tile.longitude.toFixed(3)}°.
            Este teste não garante que o serviço permita WebGL/CORS em todos os mosaicos.</small>
        </>}
      </section>}
      <footer>
        As fontes são externas e conservam os termos de utilização dos fornecedores.
        Antes de exportar mapas ou dados, confirme as respectivas licenças.
        <a href="https://qms.nextgis.com/" target="_blank" rel="noopener noreferrer"> NextGIS QMS</a>
      </footer>
    </section>
  );
}
