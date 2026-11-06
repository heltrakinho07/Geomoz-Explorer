import type { Feature } from "geojson";

export interface CategoricalSummary { value: string; count: number; percent: number }
export function categoricalFieldSummary(features: Feature[], field: string): CategoricalSummary[] {
  const counts = new Map<string, number>();
  for (const feature of features) {
    const raw = feature.properties?.[field];
    const key = raw == null || raw === "" ? "(sem dados)" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = features.length;
  return [...counts].map(([value, count]) => ({
    value, count, percent: total ? (100 * count) / total : 0,
  })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function filterAttributeRows<T extends {featureIndex:number;feature:Feature}>(
  rows:T[], selectedIndices:number[], onlySelected:boolean
):T[] {
  if (!onlySelected) return rows;
  const selected = new Set(selectedIndices);
  return rows.filter(row => selected.has(row.featureIndex));
}
export function toggleAttributeSelection(indices:number[], next:number, additive:boolean,max=500):number[] {
  if (!Number.isSafeInteger(next) || next<0) return indices;
  if (!additive) return [next];
  if (indices.includes(next)) return indices.filter(index=>index!==next);
  return indices.length>=max ? indices : [...indices,next];
}
