import type { TerrainProduct, TerrainReport } from "./terrain-workflow";

export function downloadTerrainBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A cartographic plate using computed pixels, with UTM orientation and legend. */
export function terrainMapCanvas(product: TerrainProduct, report: TerrainReport): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 1300;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível criar a imagem do mapa.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a"; ctx.font = "bold 42px sans-serif"; ctx.fillText("GeoMoz | " + product.name, 60, 70);
  ctx.font = "22px sans-serif"; ctx.fillStyle = "#475569";
  const sourceName = report.source.name.length > 100 ? report.source.name.slice(0, 97) + "…" : report.source.name;
  ctx.fillText(sourceName, 60, 110);
  const image = document.createElement("canvas");
  image.width = product.preview.width; image.height = product.preview.height;
  const ic = image.getContext("2d")!;
  const pixels = ic.createImageData(image.width, image.height);
  const categorical = ["basins", "direction"].includes(product.id);
  function color(value: number): [number, number, number] {
    if (product.id === "streams") return [3, 105, 161];
    if (categorical) return [60 + ((value * 71) % 180), 60 + ((value * 137) % 180), 60 + ((value * 191) % 180)];
    const t = Math.max(0, Math.min(1, (value - (product.min ?? 0)) / ((product.max ?? 0) - (product.min ?? 0) || 1)));
    if (product.id === "hillshade") return [Math.round(t * 255), Math.round(t * 255), Math.round(t * 255)];
    return [Math.round(25 + t * 220), Math.round(55 + Math.sin(t * Math.PI) * 145), Math.round(140 - t * 100)];
  }
  for (let i = 0; i < product.preview.values.length; i++) {
    const value = product.preview.values[i];
    if (!Number.isFinite(value)) continue;
    const rgb = color(value);
    pixels.data.set([...rgb, 255], i * 4);
  }
  ic.putImageData(pixels, 0, 0);
  const scale = Math.min(1380 / image.width, 850 / image.height);
  const w = image.width * scale, h = image.height * scale;
  const x = (canvas.width - w) / 2, y = 155 + (850 - h) / 2;
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(x, y, w, h);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(image, x, y, w, h);
  ctx.strokeStyle = "#94a3b8"; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#0f172a"; ctx.font = "bold 22px sans-serif";
  ctx.fillText("N (grelha UTM)", 1270, 145);
  ctx.beginPath(); ctx.moveTo(1435, 200); ctx.lineTo(1435, 160); ctx.lineTo(1427, 172); ctx.moveTo(1435, 160); ctx.lineTo(1443, 172); ctx.strokeStyle = "#0f172a"; ctx.stroke();
  ctx.font = "22px sans-serif";
  const labels = categorical ? "Cores categóricas: cada código/identificador tem uma cor." : product.id === "streams" ? "Azul: canal potencial; sem cor: NoData / fora da rede." : `${product.min?.toFixed(2) ?? "—"} a ${product.max?.toFixed(2) ?? "—"} ${product.unit}`;
  ctx.fillText(labels, 60, 1060);
  if (!categorical && product.id !== "streams") {
    for (let i = 0; i < 350; i++) {
      const c = color((product.min ?? 0) + (i / 349) * ((product.max ?? 1) - (product.min ?? 0)));
      ctx.fillStyle = `rgb(${c.join(",")})`; ctx.fillRect(60 + i, 1075, 1, 20);
    }
  }
  ctx.fillStyle = "#475569";
  ctx.fillText(`EPSG:${report.grid.epsg} · célula ${report.grid.resolution} m · ${product.width} × ${product.height} células`, 60, 1130);
  ctx.fillText(`WGS84: ${product.bounds.map(v => v.toFixed(5)).join(", ")} (W, S, E, N)`, 60, 1165);
  ctx.fillText(`Fonte: ${report.source.name.slice(0, 80)} · ${report.engine}`, 60, 1200);
  ctx.font = "18px sans-serif";
  ctx.fillText("Pré-visualização reduzida. Use o GeoTIFF para análise e medição. Bacias e canais limitados à cobertura do DEM.", 60, 1250);
  return canvas;
}

export async function exportTerrainPng(product: TerrainProduct, report: TerrainReport): Promise<void> {
  const canvas = terrainMapCanvas(product, report);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Falha ao exportar PNG.")), "image/png"));
  downloadTerrainBlob(blob, product.fileName.replace(/\.tif$/, ".png"));
}

export async function exportTerrainPdf(products: TerrainProduct[], report: TerrainReport): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(20); doc.text("GeoMoz — Terreno e Hidrologia", 15, 22);
  doc.setFontSize(10);
  const text = [
    `Fonte: ${report.source.name}`, `Data: ${report.startedAt}`, `Motor: ${report.engine}`,
    `CRS: EPSG:${report.grid.epsg}; resolução: ${report.grid.resolution} m`,
    `Grelha: ${report.grid.width} x ${report.grid.height}; duração: ${(report.durationMs / 1000).toFixed(1)} s`,
    `Limiar de drenagem: ${report.options.streamAreaKm2} km2`,
    `SHA-256 da entrada: ${report.source.sha256}`, "", ...report.notes,
  ];
  let y = 34;
  for (const line of text) {
    const lines = doc.splitTextToSize(line, 178);
    doc.text(lines, 15, y); y += lines.length * 5 + 3;
  }
  for (const product of products) {
    doc.addPage();
    doc.addImage(terrainMapCanvas(product, report).toDataURL("image/png"), "PNG", 10, 15, 190, 154.4);
    doc.setFontSize(11);
    doc.text(`Células válidas: ${product.validCells}; mínimo: ${product.min?.toFixed(3) ?? "—"}; máximo: ${product.max?.toFixed(3) ?? "—"}`, 15, 185);
    doc.text(`Unidade: ${product.unit}`, 15, 192);
  }
  doc.save("GeoMoz_Terreno_Hidrologia.pdf");
}
