/** GeoMoz → isolated PyQGIS print worker job (local file, no secrets/network). */
export interface GeoMozPrintableLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  geojson?: unknown;
  style?: { fillColor?: string; strokeColor?: string };
}
export interface GeoMozQgisJob {
  schema: 1;
  title: string;
  subtitle: string;
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  dpi: 150 | 300 | 600;
  author: string;
  attribution: string;
  layers: Array<{
    name: string;
    color: string;
    geojson: { type: "FeatureCollection"; features: unknown[] };
  }>;
}

export function buildGeoMozQgisPrintJob(
  layers: readonly GeoMozPrintableLayer[],
  selectedIds: readonly string[],
  config: { title: string; paper: "A4" | "A3"; orientation: "landscape" | "portrait"; dpi: 150 | 300 | 600 },
): GeoMozQgisJob {
  const title = config.title.trim();
  if (!title || title.length > 150) throw Error("Introduza um título válido até 150 caracteres.");
  if (!["A4", "A3"].includes(config.paper) ||
      !["landscape", "portrait"].includes(config.orientation) ||
      ![150, 300, 600].includes(config.dpi)) {
    throw Error("Formato de impressão inválido.");
  }
  const ids = new Set(selectedIds);
  const chosen = layers.filter(layer => ids.has(layer.id) && layer.type === "geojson");
  if (!chosen.length || chosen.length > 12) throw Error("Seleccione entre 1 e 12 camadas vectoriais.");
  let count = 0;
  const converted = chosen.map(layer => {
    const fc = layer.geojson;
    if (!fc || typeof fc !== "object" || !("type" in fc) || fc.type !== "FeatureCollection" ||
        !("features" in fc) || !Array.isArray(fc.features)) {
      throw Error("Camada «" + layer.name + "» não contém GeoJSON válido.");
    }
    count += fc.features.length;
    if (count > 5000) throw Error("A impressão excede o limite de 5 000 feições.");
    const color = layer.style?.fillColor || layer.style?.strokeColor || "#0284c7";
    return {
      name: layer.name.slice(0, 100),
      color: /^#[a-f\d]{6}$/i.test(color) ? color : "#0284c7",
      geojson: { type: "FeatureCollection" as const, features: fc.features as unknown[] },
    };
  });
  const job: GeoMozQgisJob = {
    schema: 1, title, subtitle: "", paper: config.paper,
    orientation: config.orientation, dpi: config.dpi,
    author: "GeoMoz Explorer", attribution: "Created with GeoMoz Explorer",
    layers: converted,
  };
  if (new TextEncoder().encode(JSON.stringify(job)).byteLength > 4 * 1024 * 1024) {
    throw Error("O pacote cartográfico excede o limite de 4 MB.");
  }
  return job;
}
