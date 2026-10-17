/** Reproducible DEM workflow using the same GeoLibre Rust engine as RustGIS. */
export const TERRAIN_ENGINE = "geolibre-wasm@1.6.0";
export const MAX_DEM_BYTES = 64 * 1024 * 1024;
export const MAX_SOURCE_CELLS = 4_194_304;
export const MAX_ANALYSIS_CELLS = 1_048_576;
export type Bounds = [number, number, number, number];
export interface TerrainOptions {
  resolution: number;
  elevationUnit: "metres" | "feet";
  streamAreaKm2: number;
  hydrology: boolean;
  azimuth: number;
  altitude: number;
  bbox?: Bounds;
}
export const DEFAULT_TERRAIN_OPTIONS: TerrainOptions = {
  resolution: 30, elevationUnit: "metres", streamAreaKm2: 1,
  hydrology: true, azimuth: 315, altitude: 45,
};
export interface TerrainProduct {
  id: string;
  name: string;
  unit: string;
  fileName: string;
  bytes: Uint8Array;
  bounds: Bounds;
  width: number;
  height: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  validCells: number;
  preview: { width: number; height: number; values: Float32Array };
}
export interface TerrainReport {
  version: 1;
  engine: string;
  startedAt: string;
  durationMs: number;
  source: { name: string; sha256: string; epsg: number; width: number; height: number; geoTransform: number[] };
  options: TerrainOptions;
  grid: { epsg: number; resolution: number; bounds: Bounds; width: number; height: number };
  steps: Array<{ tool: string; args: string[]; durationMs: number; log: string[] }>;
  products: Array<Omit<TerrainProduct, "bytes" | "preview"> & { sha256: string }>;
  notes: string[];
}
export interface TerrainResult { products: TerrainProduct[]; report: TerrainReport }
export interface TerrainProgress { completed: number; total: number; label: string }

export function validateTerrainOptions(options: TerrainOptions): void {
  const { resolution, streamAreaKm2, azimuth, altitude } = options;
  if (!Number.isFinite(resolution) || resolution < 1 || resolution > 1000)
    throw new Error("A resolução deve estar entre 1 e 1000 metros.");
  if (!Number.isFinite(streamAreaKm2) || streamAreaKm2 <= 0)
    throw new Error("A área contribuinte mínima deve ser maior que zero.");
  if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth > 360 || !Number.isFinite(altitude) || altitude <= 0 || altitude > 90)
    throw new Error("Use azimute entre 0 e 360° e altura solar entre 1 e 90°.");
  if (!["metres", "feet"].includes(options.elevationUnit)) throw new Error("Unidade de elevação inválida.");
  if (options.bbox && (options.bbox.length !== 4 || !options.bbox.every(Number.isFinite) || options.bbox[0] >= options.bbox[2] || options.bbox[1] >= options.bbox[3]))
    throw new Error("A extensão da área de análise é inválida.");
}
export function utmForBounds(bounds: Bounds): number {
  const [west, south, east, north] = bounds;
  if (!bounds.every(Number.isFinite) || west < -180 || east > 180 || south < -80 || north > 84 || west >= east || south >= north || east - west > 6)
    throw new Error("Seleccione uma área local com menos de 6° de longitude, dentro da cobertura UTM.");
  const zone = Math.min(60, Math.max(1, Math.floor(((west + east) / 2 + 180) / 6) + 1));
  return ((south + north) / 2 < 0 ? 32700 : 32600) + zone;
}
export function intersectBounds(source: Bounds, requested?: Bounds): Bounds {
  if (!requested) return source;
  const result: Bounds = [Math.max(source[0], requested[0]), Math.max(source[1], requested[1]), Math.min(source[2], requested[2]), Math.min(source[3], requested[3])];
  if (result[0] >= result[2] || result[1] >= result[3]) throw new Error("O DEM não intersecta a área seleccionada.");
  return result;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Runs in a dedicated worker. No tool substitutes or fabricated outputs. */
export async function executeTerrainWorkflow(
  bytes: Uint8Array, name: string, options: TerrainOptions,
  progress: (event: TerrainProgress) => void = () => {},
): Promise<TerrainResult> {
  validateTerrainOptions(options);
  if (!bytes.length || bytes.length > MAX_DEM_BYTES) throw new Error("Use um GeoTIFF até 64 MiB.");
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const total = options.hydrology ? 10 : 5;
  let completed = 0;
  const notify = (label: string) => progress({ completed, total, label });
  notify("A carregar o motor e validar o DEM…");
  const lib = await import("geolibre-wasm");
  const tools = await import("geolibre-wasm/tools");
  await lib.default();
  const reader = new lib.GeoTiffReader(bytes);
  let source: TerrainReport["source"];
  let elevations: Float32Array;
  let sourceTransform: Float64Array;
  let bounds: Bounds;
  try {
    if (reader.bands !== 1) throw new Error("O DEM deve ter uma única banda de elevação.");
    // GeoLibre 1.6 reads scale/tiepoint georeferencing, but does not expose
    // ModelTransformationTag. Read that standard TIFF tag before validating.
    const { fromArrayBuffer } = await import("geotiff");
    const image = await (await fromArrayBuffer(new Uint8Array(bytes).buffer)).getImage();
    const keys = image.getGeoKeys();
    const sourceEpsg = reader.epsg && reader.epsg !== 32767 ? reader.epsg : Number(keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey);
    if (!sourceEpsg || sourceEpsg === 32767) throw new Error("O GeoTIFF deve declarar um CRS EPSG válido.");
    if (reader.width * reader.height > MAX_SOURCE_CELLS) throw new Error("O DEM excede 4 milhões de células. Recorte-o antes de importar.");
    const matrix = image.getFileDirectory().getValue("ModelTransformation");
    if (matrix && (matrix.length !== 16 || matrix[12] !== 0 || matrix[13] !== 0 || matrix[15] !== 1))
      throw new Error("A transformação do GeoTIFF não é uma grelha afim válida.");
    const gt = matrix ? new Float64Array([matrix[3], matrix[0], matrix[1], matrix[7], matrix[4], matrix[5]]) : reader.geo_transform();
    const determinant = gt[1] * gt[5] - gt[2] * gt[4];
    const pixelScale = Math.max(Math.abs(gt[1]), Math.abs(gt[2]), Math.abs(gt[4]), Math.abs(gt[5]));
    if (gt.length !== 6 || !Array.from(gt).every(Number.isFinite) || !pixelScale || Math.abs(determinant) <= Number.EPSILON * pixelScale ** 2 * 16)
      throw new Error("O GeoTIFF não tem uma transformação geográfica válida. Exporte-o com CRS e georreferenciação.");
    sourceTransform = gt;
    const corners = [[0, 0], [reader.width, 0], [0, reader.height], [reader.width, reader.height]]
      .map(([x, y]) => [gt[0] + x * gt[1] + y * gt[2], gt[3] + x * gt[4] + y * gt[5]]);
    const extent = new Float64Array([Math.min(...corners.map(c => c[0])), Math.min(...corners.map(c => c[1])),
      Math.max(...corners.map(c => c[0])), Math.max(...corners.map(c => c[1]))]);
    const lonlat = lib.transform_bbox_epsg(sourceEpsg, 4326, extent);
    if (lonlat.length !== 4) throw new Error("Não foi possível transformar a extensão do DEM para WGS84.");
    bounds = intersectBounds(Array.from(lonlat) as Bounds, options.bbox);
    source = { name, sha256: await sha256(bytes), epsg: sourceEpsg, width: reader.width, height: reader.height, geoTransform: Array.from(gt) };
    const values = reader.read_band_f64(0);
    const transform = reader.value_transform();
    const scale = transform.length === 2 ? transform[0] : 1;
    const offset = transform.length === 2 ? transform[1] : 0;
    const factor = options.elevationUnit === "feet" ? 0.3048 : 1;
    const converted = new Float32Array(values.length);
    let valid = 0;
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i]) || values[i] === reader.nodata) converted[i] = -32768;
      else {
        const value = (values[i] * scale + offset) * factor;
        if (!Number.isFinite(value) || value < -12000 || value > 10000)
          throw new Error("Elevações fora do intervalo -12000 a 10000 m. Confirme a banda, as unidades e o NoData.");
        converted[i] = value;
        valid++;
      }
    }
    if (!valid) throw new Error("O DEM só contém NoData.");
    elevations = converted;
  } finally { reader.free(); }
  completed++;
  notify("A preparar a grelha UTM em metros…");
  const epsg = utmForBounds(bounds!);
  const projected = lib.transform_bbox_epsg(4326, epsg, new Float64Array(bounds!));
  const expectedWidth = Math.ceil((projected[2] - projected[0]) / options.resolution);
  const expectedHeight = Math.ceil((projected[3] - projected[1]) / options.resolution);
  if (expectedWidth < 3 || expectedHeight < 3) throw new Error("A área tem menos de 3 × 3 células nesta resolução.");
  if (expectedWidth * expectedHeight > MAX_ANALYSIS_CELLS)
    throw new Error("A grelha excede 1 milhão de células. Reduza a área ou aumente a resolução em metros.");
  const preparationStart = performance.now();
  // Use a target-CRS extent with exact pixel multiples. The upstream extractor
  // otherwise fits pixels to the bbox and silently changes the requested size.
  const targetBounds: Bounds = [projected[0], projected[3] - expectedHeight * options.resolution,
    projected[0] + expectedWidth * options.resolution, projected[3]];
  // Invert the complete affine transform, including rotation, south-up and west-up
  // sources. GeoLibre's subset helper assumes a north-up input, so do not use it here.
  const gt = sourceTransform!;
  const determinant = gt[1] * gt[5] - gt[2] * gt[4];
  const output = new Float32Array(expectedWidth * expectedHeight).fill(-32768);
  for (let row0 = 0; row0 < expectedHeight; row0 += 32) {
    const row1 = Math.min(row0 + 32, expectedHeight);
    const xy = new Float64Array((row1 - row0) * expectedWidth * 2);
    let k = 0;
    for (let row = row0; row < row1; row++) for (let col = 0; col < expectedWidth; col++) {
      xy[k++] = targetBounds[0] + (col + 0.5) * options.resolution;
      xy[k++] = targetBounds[3] - (row + 0.5) * options.resolution;
    }
    const transformed = epsg === source!.epsg ? xy : lib.transform_points_epsg(epsg, source!.epsg, xy);
    k = 0;
    for (let row = row0; row < row1; row++) for (let col = 0; col < expectedWidth; col++) {
      const dx = transformed[k++] - gt[0], dy = transformed[k++] - gt[3];
      const x = Math.floor((gt[5] * dx - gt[2] * dy) / determinant);
      const y = Math.floor((-gt[4] * dx + gt[1] * dy) / determinant);
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < source!.width && y < source!.height)
        output[row * expectedWidth + col] = elevations![y * source!.width + x];
    }
  }
  const builder = new lib.CogBuilder(expectedWidth, expectedHeight, 1);
  let dem: Uint8Array;
  try {
    builder.set_epsg(epsg);
    builder.set_geo_transform(new Float64Array([targetBounds[0], options.resolution, 0, targetBounds[3], 0, -options.resolution]));
    builder.set_nodata(-32768); builder.set_compression("deflate");
    builder.set_overview_levels(new Uint32Array()); dem = builder.write_f32(output);
  } finally { builder.free(); }
  const report: TerrainReport = {
    version: 1, engine: TERRAIN_ENGINE, startedAt, durationMs: 0, source: source!, options: { ...options },
    grid: { epsg, resolution: options.resolution, bounds: bounds!, width: 0, height: 0 },
    steps: [{ tool: "affine_reproject_nearest", args: [`bbox=${targetBounds.join(",")}`, `bbox_crs=${epsg}`, `output_crs=${epsg}`, `resolution=${options.resolution}`, "nodata=-32768", "resampling=nearest", `source_transform=${Array.from(gt).join(",")}`], durationMs: Math.round(performance.now() - preparationStart), log: [] }],
    products: [],
    notes: [
      "Elevações convertidas para metros; grelha UTM, reamostragem por vizinho mais próximo. A resolução escolhida não aumenta o detalhe do DEM original.",
      "O recorte usa a extensão rectangular seleccionada; NoData do ficheiro de origem é preservado.",
      "Drenagem e bacias são modeladas pelo relevo disponível: os limites do DEM e zonas NoData truncam contribuições exteriores. Use um DEM com margem a montante.",
      "Bacias de saída nas bordas do DEM; não equivalem a bacias delimitadas por um exutório escolhido nem a uma previsão de inundação.",
      "A rede de drenagem é potencial e depende do limiar de área contribuinte; valide em campo e com cartografia de referência.",
    ],
  };
  const products: TerrainProduct[] = [];
  async function add(id: string, title: string, unit: string, data: Uint8Array) {
    const r = new lib.GeoTiffReader(data);
    try {
      if (r.width * r.height > MAX_ANALYSIS_CELLS || r.bands !== 1 || r.epsg !== epsg)
        throw new Error(`Grelha de saída inválida: ${title}.`);
      const values = r.read_band_f64(0);
      let min = Infinity, max = -Infinity, sum = 0, validCells = 0;
      for (const value of values) {
        if (!Number.isFinite(value) || value === r.nodata) continue;
        min = Math.min(min, value); max = Math.max(max, value); sum += value; validCells++;
      }
      if (!validCells && id !== "streams") throw new Error(`${title}: não existem células válidas na área seleccionada.`);
      const ratio = Math.min(1, 512 / Math.max(r.width, r.height));
      const width = Math.max(1, Math.round(r.width * ratio)), height = Math.max(1, Math.round(r.height * ratio));
      const preview = new Float32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const value = values[Math.min(r.height - 1, Math.floor(y / ratio)) * r.width + Math.min(r.width - 1, Math.floor(x / ratio))];
        preview[y * width + x] = value === r.nodata || !Number.isFinite(value) ? NaN : value;
      }
      const product: TerrainProduct = {
        id, name: title, unit, fileName: `geomoz_${id}.tif`, bytes: data, bounds: Array.from(r.bounds_lonlat()) as Bounds,
        width: r.width, height: r.height, min: validCells ? min : null, max: validCells ? max : null,
        mean: validCells ? sum / validCells : null, validCells, preview: { width, height, values: preview },
      };
      products.push(product);
      const { bytes: _bytes, preview: _preview, ...metadata } = product;
      report.products.push({ ...metadata, sha256: await sha256(data) });
      if (id === "dem") report.grid = { ...report.grid, width: r.width, height: r.height, bounds: product.bounds };
    } finally { r.free(); }
  }
  await add("dem", "DEM preparado", "m", dem);
  completed++;
  const available = new Set(await tools.listTools());
  async function run(tool: string, title: string, id: string, unit: string, input: Record<string, Uint8Array>, args: string[]) {
    if (!available.has(tool)) throw new Error(`Ferramenta indisponível no motor instalado: ${tool}.`);
    notify(title);
    const output = `${id}.tif`;
    const command = [...args, `--output=/work/${output}`];
    const start = performance.now();
    const result = await tools.runTool(tool, { args: command, input });
    if (result.exitCode !== 0 || !result.files[output]?.length)
      throw new Error(`${title}: ${result.stdout.join("\n").slice(-1600) || "o motor não produziu um GeoTIFF válido"}`);
    await add(id, title, unit, result.files[output]);
    report.steps.push({ tool, args: command, durationMs: Math.round(performance.now() - start), log: result.stdout });
    completed++;
    return result.files[output];
  }
  await run("slope", "Declividade", "slope", "graus", { "dem.tif": dem }, ["--input=/work/dem.tif", "--units=degrees", "--z_factor=1"]);
  await run("aspect", "Orientação das encostas", "aspect", "graus; -1 = plano", { "dem.tif": dem }, ["--input=/work/dem.tif", "--z_factor=1"]);
  await run("hillshade", "Relevo sombreado", "hillshade", "0–255", { "dem.tif": dem }, ["--input=/work/dem.tif", "--z_factor=1", `--azimuth=${options.azimuth}`, `--altitude=${options.altitude}`]);
  if (options.hydrology) {
    const filled = await run("fill_depressions", "DEM hidrologicamente corrigido", "filled", "m", { "dem.tif": dem }, ["--dem=/work/dem.tif", "--fix_flats=true", "--flat_increment=0.0001", "--flat_resolution=garbrecht_martz"]);
    const pointer = await run("d8_pointer", "Direcção de fluxo D8", "direction", "código Whitebox D8", { "filled.tif": filled }, ["--dem=/work/filled.tif", "--esri_pntr=false"]);
    const accumulation = await run("d8_flow_accum", "Acumulação de fluxo", "accumulation", "células", { "direction.tif": pointer }, ["--input=/work/direction.tif", "--input_is_pointer=true", "--esri_pntr=false", "--out_type=cells", "--log_transform=false"]);
    const threshold = Math.max(1, Math.ceil(options.streamAreaKm2 * 1_000_000 / (options.resolution ** 2)));
    await run("extract_streams", "Drenagem potencial", "streams", "1 = canal", { "accumulation.tif": accumulation }, ["--flow_accumulation=/work/accumulation.tif", `--threshold=${threshold}`, "--zero_background=false"]);
    await run("basins", "Bacias de drenagem nas bordas", "basins", "identificador", { "direction.tif": pointer }, ["--d8_pntr=/work/direction.tif", "--esri_pntr=false"]);
    if (!products.find(p => p.id === "streams")?.validCells) report.notes.push("Nenhum canal atingiu o limiar escolhido. Reduza a área contribuinte mínima para explorar a rede.");
  }
  report.durationMs = Math.round(performance.now() - started);
  notify("Análise concluída");
  return { products, report };
}
