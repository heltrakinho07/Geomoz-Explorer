import {
  useEffect, useRef, useState, type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import { useAppStore, type GeoLibreLayer } from "@geolibre/core";
import { participantCanEditLayer } from "../../lib/collab-protocol";
import { useLayoutOptions } from "../../hooks/useLayoutOptions";
import { useLanguage } from "../../hooks/useLanguage";
import { geoMozSpecialistText } from "./geomoz-specialist-locale";
import { GeoMozLayerProperties } from "./GeoMozLayerProperties";
import { GeoMozVectorCategories } from "./GeoMozVectorCategories";
import { RasterSymbologySection } from "../panels/RasterSymbologySection";
import type { LayerPanel } from "../panels/LayerPanel";
import {
  Database, Eye, FileStack, Histogram, Info, Layers3, Palette,
  Settings2, SlidersHorizontal, Table2, X,
} from "lucide-react";

type Props = ComponentProps<typeof LayerPanel>;
type Section = "info" | "source" | "symbology" | "rendering" | "organization" | "attributes";

export function isGeoMozRasterLayer(layer: GeoLibreLayer): boolean {
  return layer.type === "raster" || layer.type === "cog" ||
    layer.metadata.sourceKind === "maplibre-gl-raster";
}
export function isGeoMozVectorLayer(layer: GeoLibreLayer): boolean {
  return layer.metadata.sourceKind === "maplibre-gl-vector" ||
    ["geojson", "geoparquet", "flatgeobuf", "duckdb-query",
      "vector-tiles", "pmtiles", "mbtiles"].includes(layer.type);
}

/**
 * QGIS-inspired layer properties. The navigation, identification and layer
 * organisation are common; vector CATEGORY styling and raster PIXEL/BAND
 * classification deliberately use separate editing engines.
 */
export function GeoMozLayerPropertiesDialog({
  layer, props, onClose,
}: {
  layer: GeoLibreLayer;
  props: Props;
  onClose: () => void;
}) {
  const { viewer } = useLayoutOptions();
  const { language } = useLanguage();
  const ui = (pt: string) => geoMozSpecialistText(language, pt);
  const [section, setSection] = useState<Section>("info");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const update = useAppStore(s => s.updateLayer);
  const visibility = useAppStore(s => s.setLayerVisibility);
  const opacity = useAppStore(s => s.setLayerOpacity);
  const select = useAppStore(s => s.selectLayer);
  const setAttributeTableOpen = useAppStore(s => s.setAttributeTableOpen);
  const deployment = useAppStore(s => s.deploymentCapabilities);
  const collaboration = useAppStore(s => s.collaboration);
  const raster = isGeoMozRasterLayer(layer);
  const vector = isGeoMozVectorLayer(layer) && !raster;
  const engineRaster = raster && (
    layer.metadata.sourceKind === "maplibre-gl-raster" || layer.type === "cog"
  );
  const editable = !viewer && deployment.has("project:edit") &&
    (props.collaborationApi?.canEditLayer?.(layer.id) ??
      (!collaboration.isActive ||
        (collaboration.participants.find(p => p.clientId === collaboration.clientId)
          ? participantCanEditLayer(
              collaboration.participants.find(p => p.clientId === collaboration.clientId)!,
              collaboration.mode, layer.id, collaboration.lockedLayerIds ?? [],
            )
          : collaboration.role === "host" ||
            (collaboration.mode === "co-edit" &&
              !(collaboration.lockedLayerIds ?? []).includes(layer.id)))));

  const sections: Array<{ key: Section; title: string; icon: typeof Info }> = [
    { key: "info", title: ui("Informações"), icon: Info },
    { key: "source", title: ui("Fonte"), icon: Database },
    { key: "symbology", title: ui("Simbologia"), icon: Palette },
    { key: "rendering", title: ui("Renderização"), icon: SlidersHorizontal },
    { key: "organization", title: ui("Organização"), icon: FileStack },
    { key: "attributes", title: vector ? ui("Atributos") : ui("Bandas e histograma"),
      icon: vector ? Table2 : Histogram },
  ];

  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled):not([hidden]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      origin?.focus();
    };
  }, []);

  function openAdvancedVector() {
    select(layer.id);
    closeRef.current();
    props.onOpenStylePanel?.();
  }

  function field(label: string, value: string | number) {
    return <div className="gm-prop-fact" key={label}><dt>{ui(label)}</dt><dd>{value}</dd></div>;
  }

  const source = typeof layer.source?.url === "string" ? layer.source.url : "";
  const metadata = layer.metadata;
  const rasterState = metadata.rasterState && typeof metadata.rasterState === "object" &&
    !Array.isArray(metadata.rasterState) ? metadata.rasterState as Record<string, unknown> : null;
  const bandCount = typeof metadata.bandCount === "number" ? metadata.bandCount : null;
  const bands = Array.isArray(rasterState?.bands) ? rasterState.bands.join(", ") : "—";
  const featureCount = layer.geojson?.features.length;

  return createPortal(
    <div className="gm-prop-backdrop" data-testid="geomoz-layer-properties-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) closeRef.current(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby="geomoz-layer-properties-title"
        aria-describedby="geomoz-layer-properties-subtitle"
        data-testid="geomoz-layer-properties-dialog" data-layer-kind={raster ? "raster" : vector ? "vector" : "service"}
        className="gm-prop-dialog">
        <header className="gm-prop-header">
          <span className="gm-prop-header-icon">{raster ? <Layers3 size={20}/> : <Database size={20}/>}</span>
          <div><small>GeoMoz GIS Workspace · {ui("Propriedades da camada")}</small>
            <h2 id="geomoz-layer-properties-title">{layer.name}</h2>
            <p id="geomoz-layer-properties-subtitle">
              {raster ? ui("Propriedades raster — bandas, píxeis e classes") :
                vector ? ui("Propriedades vectoriais — atributos e categorias") : ui("Propriedades do serviço cartográfico")}
            </p>
          </div>
          <button type="button" className="gm-prop-close" aria-label={ui("Fechar propriedades")}
            onClick={() => closeRef.current()}><X size={19}/></button>
        </header>
        <div className="gm-prop-layout">
          <nav className="gm-prop-nav" aria-label={ui("Secções das propriedades")}>
            {sections.map(item => <button type="button" key={item.key}
              aria-current={section === item.key ? "page" : undefined}
              data-active={section === item.key}
              onClick={() => setSection(item.key)}><item.icon size={16}/><span>{item.title}</span></button>)}
          </nav>
          <main className="gm-prop-content" data-testid="geomoz-layer-properties-content">
            {section === "info" && <>
              <h3>{ui("Informação geral da camada")}</h3>
              <div className="gm-prop-facts">
                {field("Nome da camada", layer.name)}
                {field("Tipo de dados", raster ? "Raster" : vector ? "Vector" : layer.type)}
                {field("Formato do motor", layer.type)}
                {field("Visibilidade", layer.visible ? ui("Visível") : ui("Oculta"))}
                {field("Opacidade", Math.round(layer.opacity * 100) + "%")}
                {vector && field("Número de feições", featureCount ?? ui("Fonte optimizada em mosaicos (DuckDB)"))}
                {raster && field("Número de bandas", bandCount ?? "—")}
              </div>
              <p className="gm-prop-explainer">{raster
                ? ui("Num raster, os valores pertencem aos píxeis. A renderização depende das bandas, intervalos, rampas e valores sem dados.")
                : vector
                  ? ui("Num vector, cada feição tem atributos. O renderizador categorizado atribui cores aos valores distintos de uma coluna.")
                  : ui("As opções disponíveis dependem do tipo de serviço e das capacidades do motor de mapas.")}</p>
            </>}
            {section === "source" && <>
              <h3>{ui("Fonte e metadados")}</h3>
              <dl className="gm-prop-facts">
                {field("Nome original", layer.name)}
                {field("Tipo de fonte", String(metadata.sourceKind ?? layer.type))}
                {field("Origem", source || ui("Ficheiro local ou dados incorporados no projecto"))}
                {raster && field("Bandas disponíveis", bandCount ?? ui("Desconhecido"))}
                {raster && field("Bandas utilizadas", bands)}
              </dl>
              <p className="gm-prop-explainer">{ui("O GeoMoz conserva o identificador e a origem da camada; algumas propriedades dependem dos metadados disponibilizados pelo ficheiro.")}</p>
            </>}
            {section === "symbology" && <>
              {vector
                ? <GeoMozVectorCategories key={layer.id} layer={layer} editable={editable}
                    onAdvanced={props.onOpenStylePanel ? openAdvancedVector : undefined} ui={ui}/>
                : raster ? <>
                    <h3>{ui("Renderização e simbologia raster")}</h3>
                    <p className="gm-prop-explainer">{ui("Ao contrário de um vector, as classes raster usam intervalos de píxeis ou códigos da tabela de atributos raster. Ajuste bandas, gradiente, limites mínimo/máximo e histograma no motor original.")}</p>
                    {engineRaster && editable
                      ? <div className="gm-prop-native-raster" data-testid="geomoz-raster-symbology">
                          <RasterSymbologySection layer={layer} mapControllerRef={props.mapControllerRef}/>
                        </div>
                      : <p className="gm-prop-explainer">{ui("Esta fonte não disponibiliza edição directa das bandas raster nesta sessão.")}</p>}
                    {!editable && <p className="gm-prop-explainer">{ui("A simbologia está disponível apenas para consulta nesta sessão.")}</p>}
                    {!engineRaster && props.onOpenRasterStylePanel && <button type="button"
                      onClick={() => {closeRef.current();props.onOpenRasterStylePanel();}}>
                      {ui("Abrir controlo raster")}
                    </button>}
                  </>
                : <><h3>{ui("Simbologia da camada")}</h3>
                    <p>{ui("A representação desta fonte é controlada pelo motor do serviço.")}</p>
                    {props.onOpenStylePanel && <button type="button" onClick={openAdvancedVector}>
                      {ui("Abrir editor de estilos")}</button>}</>}
            </>}
            {section === "rendering" && <>
              <h3>{ui("Renderização")}</h3>
              <label className="gm-prop-field gm-prop-check">
                <span>{ui("Camada visível")}</span>
                <input type="checkbox" checked={layer.visible} disabled={!editable}
                  onChange={event => visibility(layer.id, event.target.checked)}/>
              </label>
              <label className="gm-prop-field"><span>{ui("Opacidade da camada")} <output>{Math.round(layer.opacity * 100)}%</output></span>
                <input type="range" min={0} max={1} step={0.01} value={layer.opacity}
                  disabled={!editable} onChange={event => opacity(layer.id, Number(event.target.value))}/>
              </label>
              <p className="gm-prop-explainer">{raster
                ? ui("A opacidade afecta todo o raster. Para alterar o tratamento de píxeis, seleccione «Simbologia».")
                : ui("A visibilidade e a opacidade são partilhadas por camadas vectoriais e raster.")}</p>
            </>}
            {section === "organization" && <>
              <h3>{ui("Organização e gestão")}</h3>
              <GeoMozLayerProperties layer={layer} props={props} expanded/>
            </>}
            {section === "attributes" && (vector
              ? <><h3>{ui("Tabela de atributos vectoriais")}</h3>
                  <p className="gm-prop-explainer">{ui("Consulte os atributos das feições, filtre e inspeccione as colunas. Em grandes camadas, a leitura optimizada mantém as geometrias fora da memória principal.")}</p>
                  <button type="button" className="gm-prop-primary"
                    onClick={() => {select(layer.id);setAttributeTableOpen(true);closeRef.current();}}>
                    <Table2 size={16}/>{ui("Abrir tabela de atributos")}
                  </button>
                </>
              : raster ? <><h3>{ui("Bandas, histogramas e classes raster")}</h3>
                  <div className="gm-prop-facts">
                    {field("Bandas disponíveis", bandCount ?? "—")}
                    {field("Bandas utilizadas", bands)}
                    {field("Modo de renderização", String(rasterState?.mode ?? "single"))}
                    {field("Mapa de cores", String(rasterState?.colormap ?? "—"))}
                    {field("Valor NoData", String(rasterState?.nodata ?? "auto"))}
                  </div>
                  <p className="gm-prop-explainer">{ui("O histograma representa a distribuição dos valores dos píxeis, não o número de feições. Para alterar os limites e a classificação, abra «Simbologia».")}</p>
                  <button type="button" onClick={() => setSection("symbology")}>
                    <Histogram size={16}/>{ui("Editar bandas e classes raster")}
                  </button>
                </>
              : <><h3>{ui("Informações do serviço")}</h3><p>{ui("Esta camada não possui uma tabela de atributos raster ou vectorial local.")}</p></>)}
          </main>
        </div>
        <footer className="gm-prop-footer">
          <span><Eye size={15}/>{editable ? ui("As alterações aplicadas são reflectidas no mapa.") :
            ui("Modo de consulta: edição indisponível.")}</span>
          <button type="button" className="gm-prop-primary" onClick={() => closeRef.current()}>{ui("Fechar")}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
