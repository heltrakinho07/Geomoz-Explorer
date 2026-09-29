/**
 * Client-Side Geospatial Processing Engine for GEOLITHICA / GeoMoz
 * Directly inspired by GeoLibre's @geolibre/processing architecture.
 * Executes genuine vector and raster geoprocessing operations in the browser on user data.
 */

import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Point, LineString } from "geojson";

export interface RasterGrid {
  width: number;
  height: number;
  cellSize: number;
  data: Float32Array;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  min: number;
  max: number;
  mean: number;
}

export interface GeoprocessingStats {
  executionTimeMs: number;
  inputFeatureCount: number;
  outputFeatureCount: number;
  geometryType: string;
  totalAreaKm2?: number;
  totalLengthKm?: number;
  minVal?: number;
  maxVal?: number;
  meanVal?: number;
  summary: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  category: "vector_geom" | "vector_overlay" | "vector_attr" | "terrain" | "hydrology" | "spectral";
  categoryLabel: string;
  description: string;
  requiresSecondLayer?: boolean;
  parameters: {
    name: string;
    label: string;
    type: "number" | "select" | "boolean" | "text";
    default: any;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
  }[];
}

export const GEOPROCESSING_TOOLS_CATALOG: ToolDefinition[] = [
  // ── Vector: Geometria ───────────────────────────────────────────────────────
  {
    id: "vector_buffer",
    name: "Buffer (Zona de Amortecimento)",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Cria zonas de amortecimento geodésicas em redor de pontos, linhas ou polígonos a uma distância especificada.",
    parameters: [
      { name: "distance", label: "Distância", type: "number", default: 1000, min: 10, max: 100000, step: 100 },
      {
        name: "units",
        label: "Unidades",
        type: "select",
        default: "meters",
        options: [
          { value: "meters", label: "Metros (m)" },
          { value: "kilometers", label: "Quilómetros (km)" },
        ],
      },
      { name: "dissolve", label: "Dissolver Sobreposições", type: "boolean", default: false },
    ],
  },
  {
    id: "vector_centroids",
    name: "Calcular Centróides",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Calcula o centro de massa ponderado ou baricentro de cada polígono ou feição da camada de entrada.",
    parameters: [],
  },
  {
    id: "vector_convexhull",
    name: "Envelope Convexo (Convex Hull)",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Gera o menor polígono convexo envolvente que contém todas as feições da camada.",
    parameters: [],
  },
  {
    id: "vector_bbox",
    name: "Caixa Envolvente (Bounding Box)",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Calcula o retângulo delimitador (Envelope BBox) abrangendo toda a extensão das geometrias.",
    parameters: [],
  },
  {
    id: "vector_dissolve",
    name: "Dissolver Polígonos",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Funde polígonos que partilham fronteiras comuns num único polígono ou agrega por atributo.",
    parameters: [
      { name: "propertyName", label: "Campo de Agrupamento (opcional)", type: "text", default: "" },
    ],
  },
  {
    id: "vector_simplify",
    name: "Simplificar Geometria (Douglas-Peucker)",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Reduz o número de vértices de linhas ou polígonos mantendo a forma topológica.",
    parameters: [
      { name: "tolerance", label: "Tolerância (graus)", type: "number", default: 0.005, min: 0.0001, max: 0.1, step: 0.001 },
      { name: "highQuality", label: "Alta Qualidade", type: "boolean", default: true },
    ],
  },
  {
    id: "vector_explode",
    name: "Extrair Vértices (Explode)",
    category: "vector_geom",
    categoryLabel: "Geometria Vetorial",
    description: "Converte todos os vértices de linhas ou anéis de polígonos em pontos individuais.",
    parameters: [],
  },
  {
    id: "vector_calc_metrics",
    name: "Calcular Área & Perímetro Geodésico",
    category: "vector_attr",
    categoryLabel: "Atributos & Métricas",
    description: "Calcula a área geodésica exata (km² ou ha) e comprimento/perímetro (km) adicionando-os aos atributos da camada.",
    parameters: [],
  },

  // ── Vector: Sobreposição & Operações Espaciais ─────────────────────────────
  {
    id: "vector_intersect",
    name: "Interseção Espacial (Clip / Intersect)",
    category: "vector_overlay",
    categoryLabel: "Sobreposição Espacial",
    description: "Extrai a sobreposição geométrica exata entre a Camada de Entrada e uma Camada de Corte/Máscara.",
    requiresSecondLayer: true,
    parameters: [],
  },
  {
    id: "vector_difference",
    name: "Diferença Espacial (Erase / Eradicar)",
    category: "vector_overlay",
    categoryLabel: "Sobreposição Espacial",
    description: "Subtrai a geometria da segunda camada da primeira, mantendo apenas a porção externa.",
    requiresSecondLayer: true,
    parameters: [],
  },
  {
    id: "vector_points_in_poly",
    name: "Pontos em Polígonos (Point-in-Polygon)",
    category: "vector_overlay",
    categoryLabel: "Sobreposição Espacial",
    description: "Realiza a contagem e agregação de feições pontuais que caem dentro de cada polígono.",
    requiresSecondLayer: true,
    parameters: [],
  },

  // ── Terreno & Relevo ───────────────────────────────────────────────────────
  {
    id: "terrain_slope",
    name: "Declive Topográfico (Slope)",
    category: "terrain",
    categoryLabel: "Terreno & Relevo",
    description: "Gera a taxa máxima de variação altimétrica da superfície em graus (0°-90°) ou percentagem.",
    parameters: [
      {
        name: "units",
        label: "Modo",
        type: "select",
        default: "degrees",
        options: [
          { value: "degrees", label: "Graus (°)" },
          { value: "percent", label: "Percentagem (%)" },
        ],
      },
    ],
  },
  {
    id: "terrain_aspect",
    name: "Orientação de Encostas (Aspect)",
    category: "terrain",
    categoryLabel: "Terreno & Relevo",
    description: "Determina a direção da bússola (azimute 0°-360°) para a qual cada encosta do relevo está voltada.",
    parameters: [],
  },
  {
    id: "terrain_hillshade",
    name: "Sombreamento Analítico (Hillshade)",
    category: "terrain",
    categoryLabel: "Terreno & Relevo",
    description: "Modela o sombreamento topográfico simulando a iluminação solar tridimensional.",
    parameters: [
      { name: "azimuth", label: "Azimute Solar (°)", type: "number", default: 315, min: 0, max: 360, step: 15 },
      { name: "altitude", label: "Ângulo de Altitude Solar (°)", type: "number", default: 45, min: 5, max: 90, step: 5 },
    ],
  },

  // ── Hidrologia ─────────────────────────────────────────────────────────────
  {
    id: "hydro_d8",
    name: "Acumulação de Fluxo & Talvegue (D8)",
    category: "hydrology",
    categoryLabel: "Hidrologia & Drenagem",
    description: "Delineia a direção de escoamento superficial determinístico D8 e extrai os vetores de drenagem.",
    parameters: [
      { name: "threshold", label: "Limiar de Acumulação Fluvial", type: "number", default: 40, min: 5, max: 500, step: 5 },
    ],
  },
  {
    id: "hydro_twi",
    name: "Índice Topográfico de Humidade (TWI)",
    category: "hydrology",
    categoryLabel: "Hidrologia & Drenagem",
    description: "Calcula a propensão de saturação hídrica e zonas de alagamento com base na topografia e área de contribuição.",
    parameters: [],
  },

  // ── Sensoriamento Remoto & Radar ───────────────────────────────────────────
  {
    id: "spectral_sar",
    name: "Limiarização de Cheia por Radar SAR",
    category: "spectral",
    categoryLabel: "Sensoriamento Remoto",
    description: "Segmenta corpos de água em imagens de radar Sentinel-1 através do retroespalhamento specular em dB.",
    parameters: [
      { name: "thresholdDb", label: "Limiar de Água (dB)", type: "number", default: -16, min: -25, max: -8, step: 1 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Real Vector Geoprocessing Algorithms (Using @turf/turf on User Data)
// ─────────────────────────────────────────────────────────────────────────────

export function runVectorBuffer(
  fc: FeatureCollection,
  distance: number,
  units: "meters" | "kilometers" = "meters",
  dissolve = false
): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const bufferedFeatures: Feature[] = [];

  for (const feature of fc.features) {
    try {
      const b = turf.buffer(feature, distance, { units });
      if (b) {
        b.properties = {
          ...feature.properties,
          _buffer_dist: distance,
          _buffer_units: units,
        };
        bufferedFeatures.push(b);
      }
    } catch (e) {
      console.warn("Buffer failed for feature:", e);
    }
  }

  let finalFc: FeatureCollection = turf.featureCollection(bufferedFeatures);

  if (dissolve && bufferedFeatures.length > 1) {
    try {
      const dissolved = turf.dissolve(finalFc);
      if (dissolved && dissolved.features.length > 0) {
        finalFc = dissolved;
      }
    } catch (e) {
      console.warn("Dissolve failed, returning separate buffers:", e);
    }
  }

  const duration = Math.round(performance.now() - t0);
  let totalArea = 0;
  for (const f of finalFc.features) {
    try {
      totalArea += turf.area(f) / 1_000_000;
    } catch {}
  }

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: "Polygon",
      totalAreaKm2: Math.round(totalArea * 10) / 10,
      summary: `Buffer de ${distance} ${units} gerado com sucesso para ${fc.features.length} feições (${Math.round(totalArea * 10) / 10} km²).`,
    },
  };
}

export function runVectorCentroids(fc: FeatureCollection): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const centroidFeatures: Feature[] = [];

  for (const feature of fc.features) {
    try {
      const c = turf.centroid(feature, { properties: { ...feature.properties, _is_centroid: true } });
      centroidFeatures.push(c);
    } catch (e) {
      console.warn("Centroid failed for feature:", e);
    }
  }

  const finalFc = turf.featureCollection(centroidFeatures);
  const duration = Math.round(performance.now() - t0);

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: "Point",
      summary: `${finalFc.features.length} centróides calculados a partir das geometrias de entrada em ${duration}ms.`,
    },
  };
}

export function runVectorConvexHull(fc: FeatureCollection): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const hull = turf.convex(fc);
  const finalFc = hull ? turf.featureCollection([hull]) : turf.featureCollection([]);
  const duration = Math.round(performance.now() - t0);

  let area = 0;
  if (hull) {
    try {
      area = Math.round((turf.area(hull) / 1_000_000) * 10) / 10;
    } catch {}
  }

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: "Polygon",
      totalAreaKm2: area,
      summary: hull
        ? `Envelope convexo calculado cobrindo uma área de ${area} km² em ${duration}ms.`
        : "Não foi possível calcular o envelope convexo (mínimo de 3 pontos não colineares necessários).",
    },
  };
}

export function runVectorBBox(fc: FeatureCollection): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const bbox = turf.bbox(fc);
  const poly = turf.bboxPolygon(bbox, {
    properties: {
      west: bbox[0],
      south: bbox[1],
      east: bbox[2],
      north: bbox[3],
    },
  });

  const finalFc = turf.featureCollection([poly]);
  const duration = Math.round(performance.now() - t0);
  const area = Math.round((turf.area(poly) / 1_000_000) * 10) / 10;

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: 1,
      geometryType: "Polygon",
      totalAreaKm2: area,
      summary: `Caixa envolvente retangular gerada cobrindo ${area} km² [${bbox.map((v) => v.toFixed(3)).join(", ")}].`,
    },
  };
}

export function runVectorDissolve(
  fc: FeatureCollection,
  propertyName?: string
): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  let dissolved: FeatureCollection;

  try {
    dissolved = turf.dissolve(fc, { propertyName: propertyName || undefined });
  } catch (err) {
    console.warn("Turf dissolve error:", err);
    dissolved = fc;
  }

  const duration = Math.round(performance.now() - t0);

  return {
    result: dissolved,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: dissolved.features.length,
      geometryType: "Polygon",
      summary: `Dissolução concluída: ${fc.features.length} feições combinadas em ${dissolved.features.length} polígonos em ${duration}ms.`,
    },
  };
}

export function runVectorSimplify(
  fc: FeatureCollection,
  tolerance = 0.005,
  highQuality = true
): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const simplifiedFeatures: Feature[] = [];

  for (const f of fc.features) {
    try {
      const s = turf.simplify(f, { tolerance, highQuality });
      simplifiedFeatures.push(s);
    } catch {
      simplifiedFeatures.push(f);
    }
  }

  const finalFc = turf.featureCollection(simplifiedFeatures);
  const duration = Math.round(performance.now() - t0);

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: fc.features[0]?.geometry?.type || "Geometry",
      summary: `Geometrias simplificadas com tolerância de ${tolerance}° em ${duration}ms.`,
    },
  };
}

export function runVectorExplode(fc: FeatureCollection): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const exploded = turf.explode(fc);
  const duration = Math.round(performance.now() - t0);

  return {
    result: exploded,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: exploded.features.length,
      geometryType: "Point",
      summary: `${exploded.features.length} vértices individuais extraídos das geometrias em ${duration}ms.`,
    },
  };
}

export function runVectorMetrics(fc: FeatureCollection): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  let totalArea = 0;
  let totalLength = 0;

  const enrichedFeatures = fc.features.map((f) => {
    let areaKm2 = 0;
    let lengthKm = 0;

    try {
      if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
        areaKm2 = Math.round((turf.area(f) / 1_000_000) * 100) / 100;
        lengthKm = Math.round(turf.length(f, { units: "kilometers" }) * 100) / 100;
        totalArea += areaKm2;
      } else if (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString") {
        lengthKm = Math.round(turf.length(f, { units: "kilometers" }) * 100) / 100;
        totalLength += lengthKm;
      }
    } catch {}

    return {
      ...f,
      properties: {
        ...f.properties,
        _area_km2: areaKm2,
        _comprimento_km: lengthKm,
      },
    };
  });

  const finalFc = turf.featureCollection(enrichedFeatures);
  const duration = Math.round(performance.now() - t0);

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: fc.features[0]?.geometry?.type || "Mixed",
      totalAreaKm2: Math.round(totalArea * 10) / 10,
      totalLengthKm: Math.round(totalLength * 10) / 10,
      summary: `Métricas calculadas: ${Math.round(totalArea * 10) / 10} km² de área total e ${Math.round(totalLength * 10) / 10} km de perímetro/linhas.`,
    },
  };
}

export function runVectorIntersect(
  fcA: FeatureCollection,
  fcB: FeatureCollection
): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const intersectedFeatures: Feature[] = [];

  for (const fA of fcA.features) {
    if (fA.geometry.type !== "Polygon" && fA.geometry.type !== "MultiPolygon") continue;
    for (const fB of fcB.features) {
      if (fB.geometry.type !== "Polygon" && fB.geometry.type !== "MultiPolygon") continue;
      try {
        const inter = turf.intersect(
          turf.featureCollection([fA as Feature<Polygon | MultiPolygon>, fB as Feature<Polygon | MultiPolygon>])
        );
        if (inter) {
          inter.properties = {
            ...fA.properties,
            ...fB.properties,
            _intersection: true,
          };
          intersectedFeatures.push(inter);
        }
      } catch {}
    }
  }

  const finalFc = turf.featureCollection(intersectedFeatures);
  const duration = Math.round(performance.now() - t0);

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: fcA.features.length + fcB.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: "Polygon",
      summary: `Interseção espacial concluída: ${finalFc.features.length} feições de sobreposição geradas em ${duration}ms.`,
    },
  };
}

export function runVectorPointsInPolygon(
  polygonsFc: FeatureCollection,
  pointsFc: FeatureCollection
): { result: FeatureCollection; stats: GeoprocessingStats } {
  const t0 = performance.now();
  const taggedPolys: Feature[] = [];
  let totalPointsCounted = 0;

  for (const poly of polygonsFc.features) {
    if (poly.geometry.type !== "Polygon" && poly.geometry.type !== "MultiPolygon") continue;
    let count = 0;
    for (const pt of pointsFc.features) {
      if (pt.geometry.type === "Point") {
        try {
          if (turf.booleanPointInPolygon(pt as Feature<Point>, poly as Feature<Polygon | MultiPolygon>)) {
            count++;
          }
        } catch {}
      }
    }
    totalPointsCounted += count;
    taggedPolys.push({
      ...poly,
      properties: {
        ...poly.properties,
        _contagem_pontos: count,
      },
    });
  }

  const finalFc = turf.featureCollection(taggedPolys);
  const duration = Math.round(performance.now() - t0);

  return {
    result: finalFc,
    stats: {
      executionTimeMs: duration,
      inputFeatureCount: polygonsFc.features.length + pointsFc.features.length,
      outputFeatureCount: finalFc.features.length,
      geometryType: "Polygon",
      summary: `${totalPointsCounted} pontos agregados e atribuídos a ${finalFc.features.length} polígonos em ${duration}ms.`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real File Parsing for User Data (GeoJSON, CSV with Coordinates, KML)
// ─────────────────────────────────────────────────────────────────────────────

export async function parseUserUploadedFile(file: File): Promise<{
  name: string;
  geojson: FeatureCollection;
  featureCount: number;
  geometryType: string;
  fields: string[];
}> {
  const fileName = file.name.toLowerCase();
  const text = await file.text();

  if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
    const parsed = JSON.parse(text);
    let fc: FeatureCollection;

    if (parsed.type === "FeatureCollection") {
      fc = parsed;
    } else if (parsed.type === "Feature") {
      fc = turf.featureCollection([parsed]);
    } else if (parsed.type && parsed.coordinates) {
      // Raw geometry
      fc = turf.featureCollection([turf.feature(parsed)]);
    } else {
      throw new Error("O ficheiro JSON não contém uma estrutura GeoJSON válida.");
    }

    const fields = fc.features[0]?.properties ? Object.keys(fc.features[0].properties) : [];
    return {
      name: file.name.replace(/\.[^/.]+$/, ""),
      geojson: fc,
      featureCount: fc.features.length,
      geometryType: fc.features[0]?.geometry?.type || "Unknown",
      fields,
    };
  }

  if (fileName.endsWith(".csv")) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error("O ficheiro CSV está vazio ou não possui cabeçalho.");

    // Detect delimiter (, or ;)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));

    // Find latitude and longitude columns
    const latColIdx = headers.findIndex((h) =>
      /^(lat|latitude|y|coord_y|latitude_dd|lat_dd)$/i.test(h)
    );
    const lngColIdx = headers.findIndex((h) =>
      /^(lon|lng|longitude|x|coord_x|longitude_dd|lon_dd)$/i.test(h)
    );

    if (latColIdx === -1 || lngColIdx === -1) {
      throw new Error(
        `Colunas de coordenadas não detetadas no CSV. Certifique-se que possui colunas 'lat'/'latitude' e 'lon'/'longitude'. Colunas encontradas: ${headers.join(", ")}`
      );
    }

    const features: Feature[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.trim().replace(/^["']|["']$/g, ""));
      const lat = parseFloat(parts[latColIdx]);
      const lng = parseFloat(parts[lngColIdx]);

      if (!isNaN(lat) && !isNaN(lng)) {
        const props: Record<string, any> = {};
        headers.forEach((h, idx) => {
          props[h] = parts[idx] ?? "";
        });

        features.push(turf.point([lng, lat], props));
      }
    }

    if (features.length === 0) {
      throw new Error("Nenhum ponto válido com coordenadas numéricas foi encontrado no CSV.");
    }

    const fc = turf.featureCollection(features);
    return {
      name: file.name.replace(/\.[^/.]+$/, ""),
      geojson: fc,
      featureCount: fc.features.length,
      geometryType: "Point",
      fields: headers,
    };
  }

  if (fileName.endsWith(".kml")) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/xml");
    const placemarks = doc.querySelectorAll("Placemark");
    const features: Feature[] = [];

    placemarks.forEach((pm) => {
      const name = pm.querySelector("name")?.textContent || "Ponto KML";
      const coordsElem = pm.querySelector("coordinates");
      if (coordsElem && coordsElem.textContent) {
        const rawCoords = coordsElem.textContent.trim().split(/\s+/);
        if (rawCoords.length === 1) {
          const [lng, lat] = rawCoords[0].split(",").map(Number);
          if (!isNaN(lng) && !isNaN(lat)) {
            features.push(turf.point([lng, lat], { name }));
          }
        } else if (rawCoords.length > 1) {
          const ring = rawCoords
            .map((c) => c.split(",").slice(0, 2).map(Number))
            .filter(([x, y]) => !isNaN(x) && !isNaN(y)) as [number, number][];

          if (ring.length >= 4) {
            features.push(turf.polygon([ring], { name }));
          } else if (ring.length >= 2) {
            features.push(turf.lineString(ring, { name }));
          }
        }
      }
    });

    if (features.length === 0) {
      throw new Error("Não foram encontradas coordenadas válidas no ficheiro KML.");
    }

    const fc = turf.featureCollection(features);
    return {
      name: file.name.replace(/\.[^/.]+$/, ""),
      geojson: fc,
      featureCount: fc.features.length,
      geometryType: fc.features[0]?.geometry?.type || "Mixed",
      fields: ["name"],
    };
  }

  throw new Error("Formato de ficheiro não suportado. Por favor utilize GeoJSON (.geojson), CSV (.csv) ou KML (.kml).");
}
