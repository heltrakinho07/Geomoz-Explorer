/** A GDAL -projwin rectangle uses the source raster's CRS and upper-left/lower-right order. */
export function parseRasterSourceExtent(values: readonly string[]): [number, number, number, number] {
  if (values.length !== 4) throw new Error("Indique as quatro coordenadas da extensão.");
  const parsed = values.map((v) => {
    const trimmed = v.trim();
    if (!trimmed) throw new Error("Todas as coordenadas são obrigatórias.");
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error("As coordenadas devem ser números finitos.");
    return n;
  });
  const [xmin, ymin, xmax, ymax] = parsed;
  if (xmin >= xmax || ymin >= ymax) {
    throw new Error("Extensão inválida: xmin < xmax e ymin < ymax.");
  }
  return [xmin, ymin, xmax, ymax];
}
