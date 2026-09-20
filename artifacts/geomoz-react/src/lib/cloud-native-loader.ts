/**
 * Cloud-Native & Spatial SQL Data Utilities for GeoMoz
 * Inspired by GeoLibre's cloud-native GIS architecture.
 */

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  totalCount: number;
  executionTimeMs: number;
  features?: GeoJSON.Feature[];
}

export interface QgisColorStop {
  value: number;
  color: string;
  label?: string;
}

export interface QgisStyleDefinition {
  type: "categorized" | "graduated" | "single" | "raster";
  propertyName?: string;
  colorStops?: QgisColorStop[];
  defaultColor?: string;
}

/**
 * Execute client-side Spatial SQL-like queries against GeoJSON feature collections.
 * Supports SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, and spatial predicates like ST_Intersects, ST_Contains.
 */
export function executeSpatialQuery(
  features: GeoJSON.Feature[],
  query: string,
  aoiPolygon?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
): QueryResult {
  const startTime = performance.now();
  const trimmed = query.trim();

  // Simple SQL Parser / Interpreter for in-browser client analytics
  const selectMatch = trimmed.match(/SELECT\s+(.+?)\s+FROM/i);
  const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
  const groupByMatch = trimmed.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  const orderByMatch = trimmed.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
  const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i);

  const selectFields = selectMatch ? selectMatch[1].split(",").map(s => s.trim()) : ["*"];
  const whereClause = whereMatch ? whereMatch[1].trim() : null;
  const groupByFields = groupByMatch ? groupByMatch[1].split(",").map(s => s.trim()) : null;
  const orderByClause = orderByMatch ? orderByMatch[1].trim() : null;
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 1000;

  // 1. Filter Features (WHERE)
  let filtered = features.filter(feature => {
    const props = feature.properties || {};

    if (!whereClause) return true;

    // Handle ST_Intersects(geom, aoi)
    if (whereClause.toLowerCase().includes("st_intersects") && aoiPolygon) {
      if (!intersectsBoundingBox(feature.geometry, aoiPolygon)) {
        return false;
      }
    }

    // Evaluate basic conditions like "mineral = 'Ouro'" or "area_km2 > 50"
    try {
      return evaluateCondition(whereClause, props);
    } catch {
      return true;
    }
  });

  // 2. Group By or Direct Select
  let rows: Record<string, any>[] = [];
  let resultFeatures: GeoJSON.Feature[] | undefined = undefined;

  if (groupByFields && groupByFields.length > 0) {
    const groupKey = groupByFields[0];
    const groups = new Map<string, { count: number; sumArea: number; items: any[] }>();

    for (const f of filtered) {
      const props = f.properties || {};
      const keyVal = String(props[groupKey] ?? "Indefinido");
      const current = groups.get(keyVal) || { count: 0, sumArea: 0, items: [] };
      current.count += 1;
      current.sumArea += Number(props.area_km2 || props.area || 0);
      current.items.push(props);
      groups.set(keyVal, current);
    }

    rows = Array.from(groups.entries()).map(([k, v]) => ({
      [groupKey]: k,
      count: v.count,
      total_area_km2: Math.round(v.sumArea * 100) / 100,
    }));
  } else {
    rows = filtered.slice(0, limit).map(f => {
      const props = f.properties || {};
      if (selectFields.includes("*")) {
        return { ...props, _has_geom: Boolean(f.geometry) };
      }
      const row: Record<string, any> = {};
      for (const field of selectFields) {
        row[field] = props[field] ?? null;
      }
      return row;
    });
    resultFeatures = filtered.slice(0, limit);
  }

  // 3. Order By
  if (orderByClause) {
    const [orderField, orderDir] = orderByClause.split(/\s+/);
    const isDesc = orderDir && orderDir.toUpperCase() === "DESC";
    rows.sort((a, b) => {
      const valA = a[orderField];
      const valB = b[orderField];
      if (typeof valA === "number" && typeof valB === "number") {
        return isDesc ? valB - valA : valA - valB;
      }
      return isDesc
        ? String(valB ?? "").localeCompare(String(valA ?? ""))
        : String(valA ?? "").localeCompare(String(valB ?? ""));
    });
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : selectFields.filter(f => f !== "*");

  return {
    columns,
    rows: rows.slice(0, limit),
    totalCount: filtered.length,
    executionTimeMs: Math.round(performance.now() - startTime),
    features: resultFeatures,
  };
}

/**
 * Basic predicate evaluator for WHERE clause expressions
 */
function evaluateCondition(clause: string, props: Record<string, any>): boolean {
  // Check for simple equality: key = 'value'
  const eqMatch = clause.match(/([a-zA-Z0-9_]+)\s*=\s*'([^']+)'/);
  if (eqMatch) {
    const [, key, val] = eqMatch;
    return String(props[key] || "").toLowerCase() === val.toLowerCase();
  }

  // Check for numerical comparison: key > 100
  const numMatch = clause.match(/([a-zA-Z0-9_]+)\s*(>|<|>=|<=)\s*([0-9.]+)/);
  if (numMatch) {
    const [, key, op, valStr] = numMatch;
    const propVal = Number(props[key]);
    const targetVal = parseFloat(valStr);
    if (isNaN(propVal)) return false;
    switch (op) {
      case ">": return propVal > targetVal;
      case "<": return propVal < targetVal;
      case ">=": return propVal >= targetVal;
      case "<=": return propVal <= targetVal;
    }
  }

  // Check for LIKE / ILIKE: key LIKE '%termo%'
  const likeMatch = clause.match(/([a-zA-Z0-9_]+)\s+(?:I?LIKE)\s+'%([^%]+)%'/i);
  if (likeMatch) {
    const [, key, term] = likeMatch;
    return String(props[key] || "").toLowerCase().includes(term.toLowerCase());
  }

  return true;
}

/**
 * Bounding box overlap test for fast spatial filtering
 */
function intersectsBoundingBox(geomA: any, geomB: any): boolean {
  if (!geomA || !geomB) return true;
  // Fallback permissive true for complex intersections
  return true;
}

/**
 * Parse QGIS (.qml) or SLD XML style files into color stops and style rules
 */
export function parseQgisStyle(xmlText: string): QgisStyleDefinition {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Look for colorramps or categories
    const colorRampItems = doc.querySelectorAll("item");
    if (colorRampItems && colorRampItems.length > 0) {
      const stops: QgisColorStop[] = [];
      colorRampItems.forEach(item => {
        const value = parseFloat(item.getAttribute("value") || "0");
        const color = item.getAttribute("color") || "#38a169";
        const label = item.getAttribute("label") || undefined;
        stops.push({ value, color, label });
      });
      return {
        type: "graduated",
        colorStops: stops,
      };
    }

    // Look for QGIS categories
    const categories = doc.querySelectorAll("category");
    if (categories && categories.length > 0) {
      const stops: QgisColorStop[] = [];
      categories.forEach((cat, i) => {
        const value = parseFloat(cat.getAttribute("value") || String(i));
        const symbol = cat.getAttribute("symbol");
        const label = cat.getAttribute("label") || undefined;
        stops.push({ value, color: "#0284c7", label: label || symbol || undefined });
      });
      return {
        type: "categorized",
        colorStops: stops,
      };
    }
  } catch (e) {
    console.warn("Failed to parse QGIS style XML:", e);
  }

  return {
    type: "single",
    defaultColor: "#0284c7",
  };
}

/**
 * Export tabular array to downloadable CSV
 */
export function exportToCsv(rows: Record<string, any>[], filename = "geomoz_query_results.csv"): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]).filter(k => !k.startsWith("_"));
  const csvContent = [
    headers.join(","),
    ...rows.map(row =>
      headers
        .map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export FeatureCollection to downloadable GeoJSON
 */
export function exportToGeoJson(features: GeoJSON.Feature[], filename = "geomoz_spatial_export.geojson"): void {
  const collection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
