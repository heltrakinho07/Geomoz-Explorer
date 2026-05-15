/**
 * GeoMoz ML Library — pure TypeScript geospatial machine learning utilities.
 * Designed for future expansion with WebWorker offloading.
 */

// ── Math utilities ─────────────────────────────────────────────────────────────

export function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, ai, i) => s + (ai - b[i]) ** 2, 0));
}

export function normalize(data: number[][]): { data: number[][]; mins: number[]; maxs: number[] } {
  if (!data.length) return { data: [], mins: [], maxs: [] };
  const d = data[0].length;
  const mins = Array(d).fill(Infinity);
  const maxs = Array(d).fill(-Infinity);
  data.forEach(row => row.forEach((v, j) => { mins[j] = Math.min(mins[j], v); maxs[j] = Math.max(maxs[j], v); }));
  const normalized = data.map(row =>
    row.map((v, j) => (maxs[j] === mins[j] ? 0 : (v - mins[j]) / (maxs[j] - mins[j])))
  );
  return { data: normalized, mins, maxs };
}

export function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ── K-Means Clustering ─────────────────────────────────────────────────────────

export interface KMeansResult {
  labels: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
  silhouette: number;
}

/** LCG-based seeded random — reproducible clustering */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

/**
 * K-Means++ clustering with seeded random initialization.
 * @param data     Normalized feature matrix (rows = samples, cols = features)
 * @param k        Number of clusters
 * @param maxIter  Max iterations (default 200)
 * @param seed     Reproducibility seed (default 42)
 */
export function kmeans(data: number[][], k: number, maxIter = 200, seed = 42): KMeansResult {
  const n = data.length;
  if (n === 0) return { labels: [], centroids: [], inertia: 0, iterations: 0, silhouette: 0 };
  k = Math.min(k, n);
  const rand = lcg(seed);

  // K-means++ initialization
  const centroids: number[][] = [];
  centroids.push([...data[Math.floor(rand() * n)]]);
  for (let ci = 1; ci < k; ci++) {
    const dists = data.map(p => Math.min(...centroids.map(c => euclidean(p, c))));
    const total = dists.reduce((s, d) => s + d, 0);
    let r = rand() * total;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) { r -= dists[i]; if (r <= 0) { idx = i; break; } }
    centroids.push([...data[idx]]);
  }

  let labels = new Array(n).fill(0);
  let iters = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iters++;
    const newLabels = data.map(point => {
      let min = Infinity, label = 0;
      centroids.forEach((c, j) => { const d = euclidean(point, c); if (d < min) { min = d; label = j; } });
      return label;
    });

    const converged = newLabels.every((l, i) => l === labels[i]);
    labels = newLabels;
    if (converged) break;

    for (let j = 0; j < k; j++) {
      const group = data.filter((_, i) => labels[i] === j);
      if (group.length === 0) continue;
      const dim = data[0].length;
      centroids[j] = Array(dim).fill(0).map((_, d) => group.reduce((s, r) => s + r[d], 0) / group.length);
    }
  }

  const inertia = data.reduce((s, p, i) => s + euclidean(p, centroids[labels[i]]) ** 2, 0);

  // Simplified silhouette score
  let silhouette = 0;
  if (k > 1) {
    const sil = data.map((p, i) => {
      const aGroup = data.filter((_, j) => labels[j] === labels[i] && j !== i);
      const a = aGroup.length ? mean(aGroup.map(q => euclidean(p, q))) : 0;
      const bs: number[] = [];
      for (let j = 0; j < k; j++) {
        if (j === labels[i]) continue;
        const bGroup = data.filter((_, idx) => labels[idx] === j);
        if (bGroup.length) bs.push(mean(bGroup.map(q => euclidean(p, q))));
      }
      const b = bs.length ? Math.min(...bs) : 0;
      return Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
    });
    silhouette = mean(sil);
  }

  return { labels, centroids, inertia, iterations: iters, silhouette };
}

// ── Spectral Index Simulation ──────────────────────────────────────────────────

/** FNV-1a deterministic hash */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type SpectralIndex = "ndvi" | "fe_oxide" | "clay" | "hydrothermal" | "bare_soil";

/**
 * Compute a proxy spectral index value [0, 1] for a geological unit.
 * Based on known spectral reflectance properties of rock types.
 * Uses deterministic hashing for consistency — same geology = same value.
 */
export function computeSpectralValue(
  legend: string, era: string, period: string, index: SpectralIndex
): number {
  const l = legend.toLowerCase();
  const e = era.toLowerCase();
  const p = period.toLowerCase();
  // Deterministic noise (0–0.08) from geological attributes
  const noise = (hashStr(l + e + p) % 80) / 1000;

  switch (index) {
    case "ndvi": {
      // Younger = more vegetation cover
      if (e.includes("quaternary") || p.includes("holocene") || p.includes("pleistocene")) return Math.min(0.9, 0.62 + noise);
      if (l.includes("alluvial") || l.includes("colluvial") || l.includes("fluvial")) return Math.min(0.8, 0.52 + noise);
      if (l.includes("limestone") || l.includes("sandstone") || l.includes("shale") || l.includes("mudstone")) return 0.28 + noise;
      if (l.includes("granite") || l.includes("granodiorite") || l.includes("diorite") || l.includes("syenite")) return Math.max(0, 0.06 + noise);
      if (l.includes("gabbro") || l.includes("basalt") || l.includes("dolerite")) return 0.08 + noise;
      if (l.includes("gneiss") || l.includes("schist") || l.includes("migmatite")) return 0.18 + noise;
      if (e.includes("archean") || e.includes("archaean")) return 0.12 + noise;
      return 0.22 + noise;
    }
    case "fe_oxide": {
      // B4/B2 — high for iron-bearing units
      if (l.includes("bif") || l.includes("iron formation") || l.includes("ironstone") || l.includes("hematite")) return Math.min(1, 0.82 + noise);
      if (l.includes("laterite") || l.includes("duricrust") || l.includes("ferruginous") || l.includes("latosol")) return Math.min(1, 0.72 + noise);
      if (l.includes("mafic") || l.includes("basalt") || l.includes("gabbro") || l.includes("dolerite")) return 0.48 + noise;
      if (l.includes("ultramafic") || l.includes("peridotite") || l.includes("dunite") || l.includes("serpentinite")) return 0.42 + noise;
      if (l.includes("schist") || l.includes("amphibolite")) return 0.32 + noise;
      if (l.includes("sandstone") || l.includes("arkose") || l.includes("conglomerate")) return 0.28 + noise;
      return 0.15 + noise;
    }
    case "clay": {
      // SWIR clay absorption — high for weathered / sedimentary units
      if (l.includes("shale") || l.includes("mudstone") || l.includes("argillite") || l.includes("pelite")) return Math.min(1, 0.82 + noise);
      if (l.includes("weathered") || l.includes("saprolite") || l.includes("regolith") || l.includes("clay")) return Math.min(1, 0.74 + noise);
      if (l.includes("alluvial") || l.includes("colluvial") || l.includes("fluvial")) return 0.58 + noise;
      if (l.includes("limestone") || l.includes("dolomite") || l.includes("marl")) return 0.52 + noise;
      if (l.includes("sandstone") || l.includes("arkose")) return 0.38 + noise;
      if (l.includes("granite") || l.includes("gneiss")) return 0.22 + noise;
      return 0.28 + noise;
    }
    case "hydrothermal": {
      // (B11+B4)/(B8A+B3) — high at intrusive contacts and alteration zones
      if (l.includes("hydrotherm") || l.includes("alteration") || l.includes("silicified") || l.includes("altered")) return Math.min(1, 0.92 + noise);
      if (l.includes("skarn") || l.includes("calc-silicate") || l.includes("endoskarn")) return Math.min(1, 0.82 + noise);
      if (l.includes("pegmatite") || l.includes("aplite") || l.includes("greisen")) return 0.72 + noise;
      if (l.includes("granite") || l.includes("granodiorite") || l.includes("syenite")) return 0.52 + noise;
      if (l.includes("diorite") || l.includes("monzonite") || l.includes("tonalite")) return 0.45 + noise;
      if (l.includes("gneiss") || l.includes("migmatite") || l.includes("granulite")) return 0.35 + noise;
      return 0.12 + noise;
    }
    case "bare_soil": {
      // Inverse of NDVI — exposed bare rock/soil
      const ndviVal = computeSpectralValue(legend, era, period, "ndvi");
      return Math.max(0, Math.min(1, 1 - ndviVal + noise * 0.5));
    }
    default:
      return 0.5 + noise;
  }
}

/** Apply a scientific color ramp to a [0,1] value */
export function applyColormap(t: number, index: SpectralIndex): string {
  t = Math.max(0, Math.min(1, t));

  const ramps: Record<SpectralIndex, [number, number, number][]> = {
    ndvi: [[139,90,43],[189,138,90],[240,220,130],[180,230,120],[60,180,60],[0,100,0]],
    fe_oxide: [[255,255,240],[255,220,150],[255,160,50],[200,60,20],[120,0,0]],
    clay: [[255,255,255],[200,225,255],[130,180,240],[50,120,200],[0,50,140]],
    hydrothermal: [[255,255,200],[255,220,100],[255,140,50],[200,40,160],[100,0,100]],
    bare_soil: [[0,120,0],[130,200,100],[255,240,150],[230,130,60],[160,40,0]],
  };

  const ramp = ramps[index];
  const n = ramp.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const c1 = ramp[i], c2 = ramp[Math.min(i + 1, n)];
  const r = Math.round(c1[0] + f * (c2[0] - c1[0]));
  const g = Math.round(c1[1] + f * (c2[1] - c1[1]));
  const b = Math.round(c1[2] + f * (c2[2] - c1[2]));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Mineral Favorability Scoring ───────────────────────────────────────────────

export type MineralType = "gold" | "gemstones" | "coal" | "graphite" | "heavy_minerals" | "base_metals" | "hydrocarbons";

const MINERAL_KEYWORDS: Record<MineralType, Record<string, number>> = {
  gold: {
    "gneiss": 0.65, "schist": 0.65, "migmatite": 0.75, "greenstone": 0.92,
    "bif": 0.82, "iron formation": 0.85, "granite": 0.55, "quartzite": 0.60,
    "amphibolite": 0.50, "greenstone belt": 0.95, "archean": 0.70,
    "proterozoic": 0.60, "shear zone": 0.85, "lode": 0.90,
  },
  gemstones: {
    "marble": 0.88, "calc-silicate": 0.82, "pegmatite": 0.95, "gneiss": 0.62,
    "migmatite": 0.70, "amphibolite": 0.60, "skarn": 0.85, "tourmaline": 0.90,
    "ruby": 0.99, "corundum": 0.95, "garnet": 0.72, "precambrian": 0.55,
  },
  coal: {
    "permo-carboniferous": 0.95, "karoo": 0.92, "gondwana": 0.88,
    "carboniferous": 0.92, "coal": 0.99, "sandstone": 0.28, "shale": 0.38,
    "lacustrine": 0.60, "fluvial": 0.45, "deltaic": 0.55,
  },
  graphite: {
    "gneiss": 0.80, "schist": 0.72, "precambrian": 0.72, "marble": 0.62,
    "quartzite": 0.52, "migmatite": 0.62, "crystalline": 0.68,
    "metamorphic": 0.75, "archean": 0.70, "granulite": 0.65,
  },
  heavy_minerals: {
    "alluvial": 0.92, "quaternary": 0.88, "coastal": 0.92, "fluvial": 0.72,
    "beach": 0.95, "aeolian": 0.62, "marine": 0.72, "sand": 0.62,
    "placer": 0.95, "holocene": 0.85, "pleistocene": 0.78,
  },
  base_metals: {
    "mafic": 0.72, "ultramafic": 0.92, "basalt": 0.62, "gabbro": 0.72,
    "peridotite": 0.82, "serpentinite": 0.78, "dunite": 0.72, "ophiolite": 0.88,
    "komatiite": 0.85, "norite": 0.75, "pyroxenite": 0.68,
  },
  hydrocarbons: {
    "mesozoic": 0.72, "triassic": 0.68, "jurassic": 0.82, "cretaceous": 0.78,
    "limestone": 0.72, "sedimentary": 0.62, "dolomite": 0.62, "evaporite": 0.52,
    "shale": 0.65, "sandstone": 0.58, "carbonate": 0.70,
  },
};

export interface FavorabilityResult {
  province: string;
  score: number;          // 0–1
  matchedKeywords: string[];
  classification: "Alta" | "Moderada" | "Baixa" | "Muito Baixa";
}

export function scoreFavorability(
  province: string,
  lithologies: string[],
  eras: string[],
  periods: string[],
  mineralType: MineralType,
): FavorabilityResult {
  const keywords = MINERAL_KEYWORDS[mineralType] ?? {};
  const corpus = [...lithologies, ...eras, ...periods].join(" ").toLowerCase();

  const matched: { kw: string; w: number }[] = [];
  for (const [kw, weight] of Object.entries(keywords)) {
    if (corpus.includes(kw.toLowerCase())) matched.push({ kw, w: weight });
  }

  const score = matched.length === 0
    ? 0.04
    : Math.min(1, matched.reduce((s, m) => s + m.w, 0) / matched.length);

  const classification: FavorabilityResult["classification"] =
    score >= 0.75 ? "Alta" : score >= 0.50 ? "Moderada" : score >= 0.25 ? "Baixa" : "Muito Baixa";

  return {
    province,
    score,
    matchedKeywords: matched.map(m => m.kw),
    classification,
  };
}

// ── PCA (2-component) ──────────────────────────────────────────────────────────

export interface PCAResult {
  projected: [number, number][];  // 2D projection
  explained: [number, number];    // % variance for PC1, PC2
}

/** Simple 2-component PCA using power iteration */
export function pca2(data: number[][]): PCAResult {
  if (data.length < 2 || data[0].length < 2) {
    return { projected: data.map(() => [0, 0] as [number, number]), explained: [0, 0] };
  }
  const n = data.length;
  const d = data[0].length;

  // Center data
  const means = Array(d).fill(0).map((_, j) => mean(data.map(r => r[j])));
  const centered = data.map(row => row.map((v, j) => v - means[j]));

  // Covariance matrix (d×d)
  const cov: number[][] = Array(d).fill(null).map(() => Array(d).fill(0));
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
    cov[i][j] = centered.reduce((s, row) => s + row[i] * row[j], 0) / (n - 1);
  }

  // Power iteration for top 2 eigenvectors
  function powerIter(mat: number[][], exclude?: number[]): number[] {
    const rand = lcg(99);
    let v = Array(d).fill(0).map(() => rand() - 0.5);
    if (exclude) v = v.map((vi, i) => vi - exclude[i] * (vi * exclude[i] / exclude.reduce((s, e) => s + e * e, 0)));
    let norm = Math.sqrt(v.reduce((s, vi) => s + vi * vi, 0));
    v = v.map(vi => vi / (norm || 1));
    for (let iter = 0; iter < 100; iter++) {
      const nv = Array(d).fill(0).map((_, i) => mat[i].reduce((s, mij, j) => s + mij * v[j], 0));
      let len = Math.sqrt(nv.reduce((s, vi) => s + vi * vi, 0));
      if (len === 0) break;
      const prev = [...v];
      v = nv.map(vi => vi / len);
      if (v.reduce((s, vi, i) => s + Math.abs(vi - prev[i]), 0) < 1e-6) break;
    }
    return v;
  }

  const pc1 = powerIter(cov);
  const lam1 = pc1.reduce((s, vi, i) => s + vi * cov[i].reduce((ss, cij, j) => ss + cij * pc1[j], 0), 0);
  const pc2 = powerIter(cov, pc1);
  const lam2 = pc2.reduce((s, vi, i) => s + vi * cov[i].reduce((ss, cij, j) => ss + cij * pc2[j], 0), 0);

  const totalVar = cov.reduce((s, row, i) => s + row[i], 0);
  const projected: [number, number][] = centered.map(row => [
    row.reduce((s, v, j) => s + v * pc1[j], 0),
    row.reduce((s, v, j) => s + v * pc2[j], 0),
  ]);

  return {
    projected,
    explained: [
      +(totalVar > 0 ? (lam1 / totalVar) * 100 : 0).toFixed(1),
      +(totalVar > 0 ? (lam2 / totalVar) * 100 : 0).toFixed(1),
    ],
  };
}
