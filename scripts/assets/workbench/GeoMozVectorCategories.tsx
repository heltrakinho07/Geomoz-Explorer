import { useState, type ReactNode } from "react";
import {
  styleValue, useAppStore, VECTOR_COLOR_RAMPS,
  type GeoLibreLayer, type VectorStyleStop,
} from "@geolibre/core";
import { getVectorLayerPropertyValues } from "@geolibre/plugins";
import { getAttributePropertyNames } from "../../lib/expression-inputs";
import {
  completeCategorizedValueCount, createDefaultStops,
} from "../panels/style-panel/classification-helpers";

/**
 * Vector symbology is keyed by attribute VALUES, not raster pixel intervals.
 * For large Add Vector Layer datasets, obtain only the requested property from
 * the existing DuckDB-backed layer and never materialize full geometry.
 */
export function GeoMozVectorCategories({
  layer, editable, onAdvanced, ui,
}: {
  layer: GeoLibreLayer;
  editable: boolean;
  onAdvanced?: () => void;
  ui: (pt: string) => string;
}) {
  const setLayerStyle = useAppStore(s => s.setLayerStyle);
  const attributes = getAttributePropertyNames(layer);
  const savedMode = styleValue(layer.style, "vectorStyleMode");
  const savedProperty = styleValue(layer.style, "vectorStyleProperty");
  const [mode, setMode] = useState<"single" | "categorized">(
    savedMode === "categorized" ? "categorized" : "single",
  );
  const [property, setProperty] = useState(savedProperty || attributes[0] || "");
  const [scheme, setScheme] = useState<"top-values" | "alphabetical" | "first-values">(
    ["top-values", "alphabetical", "first-values"].includes(
      styleValue(layer.style, "vectorStyleClassificationScheme"),
    ) ? styleValue(layer.style, "vectorStyleClassificationScheme") as
      "top-values" | "alphabetical" | "first-values" : "top-values",
  );
  const [ramp, setRamp] = useState(styleValue(layer.style, "vectorStyleColorRamp"));
  const [stops, setStops] = useState<VectorStyleStop[]>(
    savedMode === "categorized" ? styleValue(layer.style, "vectorStyleStops") : [],
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showCount, setShowCount] = useState(80);
  const [singleColor, setSingleColor] = useState(layer.style.fillColor || "#0284c7");

  async function classify() {
    if (!property || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      // The native style engine already knows the property name and class
      // semantics. Only the selected column is requested for tiled GeoParquet.
      const values: unknown[] | null = layer.geojson
        ? layer.geojson.features.map(feature => feature.properties?.[property] ?? null)
        : layer.metadata.sourceKind === "maplibre-gl-vector"
          ? await getVectorLayerPropertyValues(layer.id, property)
          : null;
      if (!values) {
        throw new Error(ui("Os valores completos deste atributo não estão disponíveis. Utilize o editor avançado."));
      }
      const classCount = completeCategorizedValueCount(layer, property, values);
      if (!classCount) {
        throw new Error(ui("O atributo não contém valores distintos válidos para categorizar."));
      }
      const generated = createDefaultStops(
        layer, "categorized", property, classCount, ramp, scheme, values,
      );
      if (!generated.length) throw new Error(ui("Não foi possível criar as categorias."));
      setStops(generated);
      setShowCount(80);
      setStatus(ui("Categorias preparadas: ") + generated.length +
        ui(". Aplique para actualizar a simbologia do mapa."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ui("Falha ao ler os valores da coluna."));
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!editable) return;
    if (mode === "single") {
      setLayerStyle(layer.id, {
        vectorStyleMode: "single",
        vectorStyleStops: [],
        fillColor: singleColor,
      });
      setStatus(ui("Símbolo único aplicado ao mapa."));
      return;
    }
    if (!property || stops.length === 0) {
      setError(ui("Seleccione um atributo e classifique os valores primeiro."));
      return;
    }
    setLayerStyle(layer.id, {
      vectorStyleMode: "categorized",
      vectorStyleProperty: property,
      vectorStyleClassCount: stops.length,
      vectorStyleColorRamp: ramp,
      vectorStyleClassificationScheme: scheme,
      vectorStyleStops: stops,
      vectorStyleExpression: "",
    });
    setError("");
    setStatus(ui("Simbologia categorizada aplicada: ") + stops.length + ui(" categorias."));
  }

  function field(label: string, children: ReactNode) {
    return <label className="gm-prop-field"><span>{ui(label)}</span>{children}</label>;
  }

  return <section className="gm-prop-vector" data-testid="geomoz-vector-symbology">
    <div className="gm-prop-intro">
      <h3>{ui("Simbologia vectorial")}</h3>
      <p>{ui("Categorizar significa atribuir uma cor a cada valor distinto de uma coluna. Não se definem intervalos de píxeis como num raster.")}</p>
    </div>
    {field("Tipo de renderização", <select aria-label={ui("Tipo de renderização vectorial")} value={mode}
      disabled={!editable || busy} onChange={event => { setMode(event.target.value as "single" | "categorized"); setError(""); }}>
      <option value="single">{ui("Símbolo único")}</option>
      <option value="categorized">{ui("Categorizado — valores únicos")}</option>
    </select>)}
    {mode === "single" ? field("Cor do símbolo", <input type="color" aria-label={ui("Cor do símbolo")}
      value={singleColor} disabled={!editable} onChange={event => setSingleColor(event.target.value)}/>) : <>
      {field("Coluna de atributos", <select aria-label={ui("Coluna de categorização")}
        value={property} disabled={busy || !editable || attributes.length === 0}
        onChange={event => {setProperty(event.target.value);setStops([]);setStatus("");setError("");}}>
        {!attributes.length && <option value="">{ui("Sem atributos disponíveis")}</option>}
        {attributes.map(name => <option key={name} value={name}>{name}</option>)}
      </select>)}
      <div className="gm-prop-form-grid">
        {field("Organização das categorias", <select aria-label={ui("Organização das categorias")}
          value={scheme} disabled={!editable || busy}
          onChange={event => {setScheme(event.target.value as typeof scheme);setStops([]);setStatus("");}}>
          <option value="top-values">{ui("Mais frequentes")}</option>
          <option value="alphabetical">{ui("Alfabética")}</option>
          <option value="first-values">{ui("Ordem dos dados")}</option>
        </select>)}
        {field("Mapa de cores", <select aria-label={ui("Mapa de cores das categorias")}
          value={ramp} disabled={!editable || busy}
          onChange={event => {setRamp(event.target.value);setStops([]);setStatus("");}}>
          {VECTOR_COLOR_RAMPS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>)}
      </div>
      <div className="gm-prop-classification-actions">
        <button type="button" disabled={!editable || !property || busy} onClick={() => void classify()}>
          {busy ? ui("A consultar os valores do atributo…") : ui("Classificar todos os valores distintos")}
        </button>
        <span>{ui("Sem limite fixo de 12 classes vectoriais; cada valor distinto gera uma categoria.")}</span>
      </div>
      {stops.length > 0 && <div className="gm-prop-category-table">
        <div className="gm-prop-category-heading"><strong>{ui("Valor do atributo")}</strong>
          <strong>{ui("Cor / Símbolo")}</strong><span>{stops.length} {ui("categorias")}</span></div>
        <div className="gm-prop-category-list" role="group" aria-label={ui("Categorias vectoriais")}>
          {stops.slice(0, showCount).map((stop, index) =>
            <div className="gm-prop-category-row" key={String(stop.value) + index}>
              <span title={String(stop.value)}>{String(stop.value)}</span>
              <input type="color" value={/^#[\da-f]{6}$/i.test(stop.color) ? stop.color : "#0284c7"}
                aria-label={ui("Cor da categoria ") + String(stop.value)} disabled={!editable}
                onChange={event => setStops(current => current.map((item, i) =>
                  i === index ? { ...item, color: event.target.value } : item))}/>
              <small>{index + 1}</small>
            </div>)}
        </div>
        {showCount < stops.length && <button className="gm-prop-show-more" type="button"
          onClick={() => setShowCount(n => n + 80)}>
          {ui("Mostrar mais categorias")} ({stops.length - showCount} {ui("restantes")})
        </button>}
        <p className="gm-prop-footnote">{ui("A apresentação está paginada; todas as categorias preparadas serão aplicadas ao mapa.")}</p>
      </div>}
    </>}
    {error && <p className="gm-prop-error" role="alert">{error}</p>}
    {status && <p className="gm-prop-success" role="status">{status}</p>}
    <div className="gm-prop-symbology-actions">
      <button type="button" className="gm-prop-primary" disabled={!editable || busy ||
        (mode === "categorized" && !stops.length)} onClick={apply}>{ui("Aplicar simbologia")}</button>
      {onAdvanced && <button type="button" onClick={onAdvanced}>
        {ui("Estilos vectoriais avançados — graduado, regras e expressões")}
      </button>}
    </div>
  </section>;
}
