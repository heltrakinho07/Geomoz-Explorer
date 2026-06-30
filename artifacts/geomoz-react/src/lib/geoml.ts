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

export type SpectralIndex =
  | "ndvi" | "fe_oxide" | "clay" | "hydrothermal" | "bare_soil"
  | "al_oh" | "ferrous" | "gossan"
  | "ndvi_l8"
  | "elevation" | "hipsometry" | "slope" | "hillshade" | "topo_class";

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
    // Terrain indices have no meaningful proxy — return neutral; UI will
    // require GEE mode for these.
    case "ndvi_l8":   return computeSpectralValue(legend, era, period, "ndvi");
    case "elevation": return 0.5 + noise;
    case "hipsometry": return 0.5 + noise;
    case "slope":     return 0.3 + noise;
    case "hillshade": return 0.5 + noise;
    case "topo_class":return 0.5 + noise;
    default:
      return 0.5 + noise;
  }
}

/** Indices that require real GEE (no meaningful proxy from geology attributes). */
export const GEE_ONLY_INDICES: SpectralIndex[] = [
  "al_oh", "ferrous", "gossan",
  "ndvi_l8", "elevation", "hipsometry", "slope", "hillshade", "topo_class",
];

/** Apply a scientific color ramp to a [0,1] value */
export function applyColormap(t: number, index: SpectralIndex): string {
  t = Math.max(0, Math.min(1, t));

  const ramps: Record<SpectralIndex, [number, number, number][]> = {
    ndvi:        [[139,90,43],[189,138,90],[240,220,130],[180,230,120],[60,180,60],[0,100,0]],
    fe_oxide:    [[255,255,240],[255,220,150],[255,160,50],[200,60,20],[120,0,0]],
    clay:        [[255,255,255],[200,225,255],[130,180,240],[50,120,200],[0,50,140]],
    hydrothermal:[[255,255,200],[255,220,100],[255,140,50],[200,40,160],[100,0,100]],
    bare_soil:   [[0,120,0],[130,200,100],[255,240,150],[230,130,60],[160,40,0]],
    al_oh:       [[43,8,63],[91,26,120],[142,47,175],[196,78,192],[240,107,168],[255,178,127],[255,227,158]],
    ferrous:     [[5,47,26],[10,107,58],[58,168,86],[143,209,122],[215,240,176],[255,255,224]],
    gossan:      [[255,255,255],[255,233,176],[255,192,77],[255,138,31],[232,82,15],[168,26,6],[92,0,0]],
    ndvi_l8:     [[255,255,255],[206,126,69],[252,209,99],[116,169,1],[6,98,1],[1,29,1]],
    elevation:   [[10,79,10],[247,247,200],[212,176,107],[141,85,36],[255,255,255]],
    hipsometry:  [[0,63,92],[70,88,129],[140,154,166],[181,192,200],[247,178,103],[228,87,46],[183,28,28]],
    slope:       [[26,152,80],[145,207,96],[217,239,139],[254,224,139],[252,141,89],[215,48,39]],
    hillshade:   [[0,0,0],[255,255,255]],
    topo_class:  [[208,240,255],[160,224,96],[255,255,102],[255,179,102],[255,102,102],[51,102,255]],
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

// Keywords use lowercase substrings matched against the union of lithology + era + period.
// Both English and Portuguese variants are listed because GTK / geomoz data is mixed.
const MINERAL_KEYWORDS: Record<MineralType, Record<string, number>> = {
  gold: {
    "greenstone": 0.95, "lode": 0.90, "shear zone": 0.85,
    "iron formation": 0.85, "bif": 0.82, "migmatite": 0.75,
    "archean": 0.70, "arcaico": 0.70,
    "gneiss": 0.55, "gnaisse": 0.55,
    "schist": 0.55, "xisto": 0.55,
    "quartzite": 0.60, "quartzito": 0.60,
    "amphibolite": 0.50, "anfibolito": 0.50,
    "granite": 0.45, "granito": 0.45,
    "proterozoic": 0.55, "proterozoico": 0.55, "proterozóico": 0.55,
  },
  gemstones: {
    "ruby": 0.99, "rubi": 0.99,
    "corundum": 0.95, "coríndon": 0.95,
    "pegmatite": 0.95, "pegmatito": 0.95,
    "tourmaline": 0.90, "turmalina": 0.90,
    "marble": 0.88, "mármore": 0.88, "marmore": 0.88,
    "skarn": 0.85, "calc-silicate": 0.82, "calcio-silicat": 0.82,
    "garnet": 0.72, "granada": 0.72,
    "migmatite": 0.65, "amphibolite": 0.60, "anfibolito": 0.60,
    "gneiss": 0.55, "gnaisse": 0.55,
    "precambrian": 0.55, "pré-cambric": 0.55, "pre-cambric": 0.55,
  },
  coal: {
    "coal": 0.99, "carvão": 0.99, "carvao": 0.99,
    "permo-carboniferous": 0.95, "karoo": 0.92, "carbonífer": 0.92, "carbonifer": 0.92,
    "gondwana": 0.85, "permian": 0.80, "permiano": 0.80,
    "lacustrine": 0.55, "lacustre": 0.55,
    "deltaic": 0.55, "delta": 0.50,
    "shale": 0.35, "argilito": 0.35, "folhelho": 0.35,
    "sandstone": 0.25, "arenito": 0.25,
  },
  graphite: {
    "graphite": 0.95, "grafite": 0.95, "grafita": 0.95,
    "granulite": 0.78, "granulito": 0.78,
    "gneiss": 0.72, "gnaisse": 0.72,
    "migmatite": 0.65, "schist": 0.62, "xisto": 0.62,
    "marble": 0.55, "mármore": 0.55, "marmore": 0.55,
    "metamorphic": 0.65, "metamórfic": 0.65, "metamorfic": 0.65,
    "archean": 0.60, "arcaico": 0.60,
    "precambrian": 0.55, "pré-cambric": 0.55, "pre-cambric": 0.55,
  },
  heavy_minerals: {
    "placer": 0.95, "beach": 0.95, "praia": 0.92,
    "alluvial": 0.92, "aluvial": 0.92, "aluvião": 0.92, "aluviao": 0.92,
    "coastal": 0.85, "costeir": 0.85,
    "quaternary": 0.85, "quaternári": 0.85, "quaternari": 0.85,
    "holocene": 0.80, "holocénic": 0.80, "holocenic": 0.80,
    "pleistocene": 0.72, "pleistocénic": 0.72, "pleistocenic": 0.72,
    "aeolian": 0.55, "eólic": 0.55, "eolic": 0.55,
    "sand": 0.45, "areia": 0.45, "duna": 0.55,
    "fluvial": 0.50, "marine": 0.55, "marinho": 0.55,
  },
  base_metals: {
    "ophiolite": 0.92, "ofiolito": 0.92,
    "ultramafic": 0.90, "ultramáfic": 0.90,
    "komatiite": 0.85, "komatiíto": 0.85,
    "peridotite": 0.82, "peridotito": 0.82,
    "serpentinite": 0.78, "serpentinito": 0.78,
    "norite": 0.75, "norito": 0.75,
    "gabbro": 0.72, "gabro": 0.72,
    "dunite": 0.70, "dunito": 0.70,
    "pyroxenite": 0.68, "piroxenito": 0.68,
    "mafic": 0.55, "máfic": 0.55,
    "basalt": 0.50, "basalto": 0.50,
    "dolerite": 0.55, "dolerito": 0.55,
  },
  hydrocarbons: {
    "jurassic": 0.82, "jurássic": 0.82,
    "cretaceous": 0.78, "cretácic": 0.78,
    "limestone": 0.72, "calcário": 0.72, "calcario": 0.72,
    "carbonate": 0.70, "carbonato": 0.70,
    "mesozoic": 0.65, "mesozóic": 0.65,
    "triassic": 0.62, "triásic": 0.62,
    "dolomite": 0.60, "dolomito": 0.60,
    "shale": 0.55, "folhelho": 0.55, "argilito": 0.55,
    "sandstone": 0.45, "arenito": 0.45,
    "evaporite": 0.50, "evaporito": 0.50,
    "sedimentary": 0.45, "sedimentar": 0.45,
  },
};

export interface FavorabilityResult {
  province: string;
  score: number;          // 0–1
  matchedKeywords: string[];
  classification: "Alta" | "Moderada" | "Baixa" | "Muito Baixa";
}

/**
 * Favorability score in [0,1] combining BOTH:
 *  - the strongest single piece of geological evidence (top weight)
 *  - the breadth of matched indicators (coverage)
 *
 * This avoids the old "mean weight" pitfall where matching two unrelated weak
 * keywords pulled the score down even though one strong keyword should have
 * boosted it.
 *
 *   topW         = max weight among matched keywords (signal strength)
 *   coverageW    = weighted sum of matches, asymptotically saturated
 *   score        = 0.55·topW + 0.45·(1 − exp(−coverageW))
 *
 * Duplicate keyword roots (English/Portuguese variants) are deduplicated by
 * keeping only the highest weight per root to avoid double-counting.
 */
export function scoreFavorability(
  province: string,
  lithologies: string[],
  eras: string[],
  periods: string[],
  mineralType: MineralType,
): FavorabilityResult {
  const keywords = MINERAL_KEYWORDS[mineralType] ?? {};
  const corpus = [...lithologies, ...eras, ...periods].join(" ").toLowerCase();

  // Match keywords; group by "root" (first 4 chars) so PT/EN duplicates collapse
  const matchedRaw: { kw: string; w: number }[] = [];
  for (const [kw, weight] of Object.entries(keywords)) {
    if (corpus.includes(kw.toLowerCase())) matchedRaw.push({ kw, w: weight });
  }
  const byRoot = new Map<string, { kw: string; w: number }>();
  for (const m of matchedRaw) {
    const root = m.kw.slice(0, 4).toLowerCase();
    const existing = byRoot.get(root);
    if (!existing || existing.w < m.w) byRoot.set(root, m);
  }
  const matched = Array.from(byRoot.values()).sort((a, b) => b.w - a.w);

  let score: number;
  if (matched.length === 0) {
    score = 0.02;
  } else {
    const topW = matched[0].w;
    const coverageW = matched.reduce((s, m) => s + m.w, 0);
    const coverageScore = 1 - Math.exp(-coverageW / 1.6); // saturates near 1 after ~3–4 strong matches
    score = Math.min(1, 0.55 * topW + 0.45 * coverageScore);
  }

  const classification: FavorabilityResult["classification"] =
    score >= 0.75 ? "Alta" : score >= 0.50 ? "Moderada" : score >= 0.25 ? "Baixa" : "Muito Baixa";

  return {
    province,
    score,
    matchedKeywords: matched.slice(0, 6).map(m => m.kw),
    classification,
  };
}

// ── Lithology Family Profiling (for clustering) ───────────────────────────────

/**
 * Group raw lithology / era strings into 6 broad geological families and return
 * a normalized [0,1] composition vector. These families separate provinces by
 * actual geological character — not just by size — and are the right input for
 * K-Means clustering.
 *
 * Returns an object with one fraction per family, summing to 1 (if any matches).
 */
export interface LithologyProfile {
  metamorphic:  number; // gneiss, schist, granulite, migmatite, amphibolite, marble
  felsicIgneous:number; // granite, granodiorite, syenite, monzonite, pegmatite
  maficIgneous: number; // basalt, gabbro, dolerite, mafic, ultramafic, peridotite
  sedimentary:  number; // sandstone, limestone, shale, dolomite, conglomerate
  quaternary:   number; // alluvial, beach, dune, holocene, pleistocene, sand
  volcanic:     number; // rhyolite, tuff, ignimbrite, andesite, volcanic
}

const FAMILY_PATTERNS: Record<keyof LithologyProfile, string[]> = {
  metamorphic:  ["gneiss","gnaisse","schist","xisto","migmatite","granulite","granulito",
                 "amphibolite","anfibolito","quartzite","quartzito","marble","mármore","marmore",
                 "metamorph","metamórfic","metamorfic"],
  felsicIgneous:["granite","granito","granodiorit","syenite","sienito","pegmatite","pegmatito",
                 "monzonit","tonalit","aplite","aplito","felsic","félsic"],
  maficIgneous: ["basalt","basalto","gabbro","gabro","dolerite","dolerito","mafic","máfic",
                 "ultramafic","ultramáfic","peridotite","peridotito","serpentinit","norite","norito",
                 "pyroxenit","piroxenit","komatiite","komatiit","dunite","dunito"],
  sedimentary:  ["sandstone","arenito","limestone","calcário","calcario","shale","folhelho",
                 "argilito","mudstone","dolomite","dolomito","conglomerate","conglomerado",
                 "marl","marga","sediment","evaporit","arkose","arcoz"],
  quaternary:   ["alluv","aluv","beach","praia","dune","duna","holoc","pleistoc","quaternár",
                 "quaternari","coastal","costeir","aeolian","eólic","eolic","fluvial","colluvi",
                 "regolith","saprolit"],
  volcanic:     ["rhyolite","riolito","andesit","tuff","tufo","ignimbrit","volcanic","vulcâni",
                 "vulcanic","trachyte","traquito","pyroclast","piroclást","lava"],
};

export function lithologyProfile(
  lithologies: string[], eras: string[], periods: string[]
): LithologyProfile {
  const corpus = [...lithologies, ...eras, ...periods].map(s => s.toLowerCase()).join(" | ");
  const raw: LithologyProfile = {
    metamorphic: 0, felsicIgneous: 0, maficIgneous: 0,
    sedimentary: 0, quaternary: 0, volcanic: 0,
  };
  for (const [family, patterns] of Object.entries(FAMILY_PATTERNS) as [keyof LithologyProfile, string[]][]) {
    for (const p of patterns) {
      // Count unique unit hits per pattern (avoid double-count of long strings)
      const occurrences = lithologies.filter(l => l.toLowerCase().includes(p)).length;
      raw[family] += occurrences;
    }
  }
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  if (total === 0) return raw;
  for (const k of Object.keys(raw) as (keyof LithologyProfile)[]) raw[k] = raw[k] / total;
  return raw;
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
