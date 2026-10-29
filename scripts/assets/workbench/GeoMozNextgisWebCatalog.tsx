import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@geolibre/core";
import { ArrowLeft, Database, ExternalLink, Folder, Layers3, Loader2, X } from "lucide-react";
import {
  normalizeNgwOrigin, listNgwResources, buildNgwTileDefinition, importNgwVector,
  type NgwResource,
} from "../../lib/geomoz-nextgis-web";

type FolderPath = { id: number; label: string };

/** Read-only public NextGIS Web resource browser. Selected styles are
 * imported as normal GeoLibre raster layers, stored with the project. */
export function GeoMozNextgisWebCatalog({ onClose }: { onClose: () => void }) {
  const [serverInput, setServerInput] = useState("");
  const [origin, setOrigin] = useState("");
  const [path, setPath] = useState<FolderPath[]>([{ id: 0, label: "Recursos" }]);
  const [items, setItems] = useState<NgwResource[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const addTileLayer = useAppStore(s => s.addTileLayer);
  const addGeoJsonLayer = useAppStore(s => s.addGeoJsonLayer);
  const updateLayer = useAppStore(s => s.updateLayer);
  const importRequest = useRef<AbortController | null>(null);
  const canAdd = useAppStore(s => s.deploymentCapabilities.has("data:add"));

  useEffect(() => () => { activeRequest.current?.abort(); importRequest.current?.abort(); }, []);

  const open = async (server: string, nextPath: FolderPath[]) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    setStatus("");
    setSearch("");
    try {
      const normalized = normalizeNgwOrigin(server);
      const folderId = nextPath[nextPath.length - 1]?.id ?? 0;
      const resources = await listNgwResources(normalized, folderId, controller.signal);
      if (controller.signal.aborted) return;
      setOrigin(normalized);
      setServerInput(normalized);
      setPath(nextPath);
      setItems(resources);
      if (!resources.length) setStatus("O grupo não contém estilos ou mapas públicos compatíveis.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof TypeError
          ? "Não foi possível consultar o servidor. Verifique a rede e se a API permite CORS nesta origem."
          : cause instanceof Error ? cause.message : "O servidor NextGIS Web não respondeu.",
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const add = async (resource: NgwResource) => {
    if (!canAdd || addingId !== null) return;
    setAddingId(resource.id);
    setError("");
    setStatus("");
    try {
      if (resource.kind === "vector") {
        importRequest.current?.abort();
        const controller = new AbortController();
        importRequest.current = controller;
        const geojson = await importNgwVector(origin, resource, controller.signal);
        if (controller.signal.aborted) return;
        const id = addGeoJsonLayer(resource.name, geojson);
        if (!id) throw new Error("O motor SIG não confirmou a importação vectorial.");
        const state = useAppStore.getState();
        const existing = state.layers.find(item => item.id === id);
        updateLayer(id, { metadata: {
          ...existing?.metadata,
          geomozProvider: "NextGIS Web",
          geomozNgwOrigin: origin,
          geomozNgwResourceId: resource.id,
          geomozNgwResourceClass: resource.className,
          geomozImportedAt: new Date().toISOString(),
        } });
        setStatus("«" + resource.name + "» importada: " + geojson.features.length + " feições vectoriais.");
        window.dispatchEvent(new CustomEvent("geomoz:task", { detail: "data" }));
        return;
      }
      const layer = buildNgwTileDefinition(origin, resource);
      const id = addTileLayer(layer.name, {
        type: "xyz",
        tiles: layer.tiles,
        url: layer.sourceUrl,
        tileSize: 256,
        scheme: "xyz",
        maxzoom: 22,
        visible: true,
        opacity: 1,
        attribution: layer.attribution,
        metadata: {
          geomozProvider: "NextGIS Web",
          geomozNgwOrigin: layer.instanceOrigin,
          geomozNgwResourceId: layer.resourceId,
          geomozNgwResourceClass: resource.className,
        },
      });
      if (!id) throw new Error("O motor SIG não confirmou a criação da camada.");
      setStatus("«" + resource.name + "» adicionada ao catálogo do projecto.");
      window.dispatchEvent(new CustomEvent("geomoz:task", { detail: "data" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a camada.");
    } finally {
      setAddingId(null);
    }
  };

  const needle = search.trim().toLocaleLowerCase("pt");
  const shown = items.filter(item => !needle || item.name.toLocaleLowerCase("pt").includes(needle));

  return (
    <section className="gm-ngw-panel" role="dialog" aria-label="NextGIS Web — recursos remotos">
      <header>
        <div>
          <strong><Database size={16} /> Servidor NextGIS Web</strong>
          <small>Recursos públicos · Importação como camadas SIG nativas</small>
        </div>
        <button type="button" aria-label="Fechar NextGIS Web" onClick={onClose}><X size={17}/></button>
      </header>

      <form className="gm-ngw-connect" onSubmit={event => {
        event.preventDefault();
        void open(serverInput, [{ id: 0, label: "Recursos" }]);
      }}>
        <label htmlFor="gm-ngw-host">Endereço do servidor</label>
        <div>
          <input id="gm-ngw-host" type="url" inputMode="url" autoComplete="url"
            value={serverInput} onChange={event => setServerInput(event.target.value)}
            placeholder="https://servidor.exemplo.org" required />
          <button type="submit" disabled={busy}>Ligar</button>
        </div>
      </form>

      {origin && (
        <>
          <nav className="gm-ngw-path" aria-label="Navegação de recursos">
            {path.length > 1 && (
              <button type="button" title="Voltar ao grupo anterior" aria-label="Voltar"
                disabled={busy} onClick={() => void open(origin, path.slice(0, -1))}>
                <ArrowLeft size={15} />
              </button>
            )}
            <span>{path.map(item => item.label).join(" / ")}</span>
          </nav>
          <label className="gm-ngw-filter">
            <span>Filtrar recursos do grupo</span>
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Nome do mapa, estilo ou pasta…" />
          </label>
        </>
      )}

      {busy && <p role="status"><Loader2 size={14} className="gm-ngw-spinner" /> A consultar catálogo…</p>}
      {error && <p role="alert" className="gm-ngw-error">{error}</p>}
      {status && <p role="status" className="gm-ngw-success">{status}</p>}
      {!canAdd && <p>Esta sessão não permite adicionar camadas; a consulta é de leitura.</p>}

      <div className="gm-ngw-results">
        {shown.map(resource => (
          <button type="button" key={resource.id} disabled={busy || (resource.kind !== "group" && (!canAdd || addingId !== null))}
            onClick={() => {
              if (resource.kind === "group") void open(origin, [...path, { id: resource.id, label: resource.name }]);
              else void add(resource);
            }}>
            {resource.kind === "group" ? <Folder size={16}/> : <Layers3 size={16}/>}
            <span><strong>{resource.name}</strong>
              <small>{resource.kind === "group" ? "Grupo de recursos" : resource.kind === "vector" ? "Camada vectorial · importação local" : resource.className.replace(/_/g, " ")}</small>
            </span>
            <span className="gm-ngw-action">{resource.kind === "group" ? "Abrir" : addingId === resource.id ? "A importar…" : resource.kind === "vector" ? "Importar" : "Adicionar"}</span>
          </button>
        ))}
      </div>
      {origin && <a href={origin} target="_blank" rel="noopener noreferrer" className="gm-ngw-source">
        Abrir servidor de origem <ExternalLink size={12}/>
      </a>}
      <footer>
        As camadas vectoriais são exportadas em EPSG:4326 (máximo 8 MB / 5 000 feições) e ficam disponíveis para análise local. A ligação utiliza apenas a API pública e não envia credenciais. Recursos
        privados precisam de autorização no próprio NextGIS Web. A disponibilidade,
        CORS e os direitos de reutilização dependem do servidor de origem.
      </footer>
    </section>
  );
}
