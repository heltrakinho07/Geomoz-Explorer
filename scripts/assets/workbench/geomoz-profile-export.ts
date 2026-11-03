import type { ProfileSample, ProfileStatistics } from "./geomoz-topographic-profile";
import type { ProfileCopyKey } from "./geomoz-profile-locales";

/** Rasterize the actual profile SVG (not the map tiles) with a report header.
 * The PDF embeds the exported high-resolution JPEG; no remote conversion API.
 */
const enc = new TextEncoder();
const encode = (text: string): Uint8Array => enc.encode(text);

export function pdfFromJpeg(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number): Blob {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      !Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) ||
      pixelWidth < 1 || pixelHeight < 1) throw Error("Imagem JPEG inválida para PDF.");
  const pageWidth = 842, pageHeight = 595, margin = 34;
  const ratio = Math.min((pageWidth - 2 * margin) / pixelWidth, (pageHeight - 2 * margin) / pixelHeight);
  const width = pixelWidth * ratio, height = pixelHeight * ratio;
  const left = (pageWidth - width) / 2, bottom = (pageHeight - height) / 2;
  const stream = `q\n${width.toFixed(3)} 0 0 ${height.toFixed(3)} ${left.toFixed(3)} ${bottom.toFixed(3)} cm\n/Im0 Do\nQ\n`;
  const entries: BlobPart[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const append = (data: string | Uint8Array) => {
    if (typeof data === "string") {
      entries.push(data);
      length += encode(data).length;
    } else {
      const bytes = new Uint8Array(data.length);
      bytes.set(data);
      entries.push(bytes.buffer);
      length += bytes.byteLength;
    }
  };
  append("%PDF-1.4\n");
  // All lengths and xref offsets are byte offsets, including the binary JPEG data.
  const object = (id: number, parts: (string | Uint8Array)[]) => {
    offsets[id] = length;
    append(`${id} 0 obj\n`);
    for (const part of parts) append(part);
    append("\nendobj\n");
  };
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  object(4, [`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  object(5, [`<< /Length ${encode(stream).length} >>\nstream\n${stream}endstream`]);
  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) append(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(entries, { type: "application/pdf" });
}

function saveFile(blob: Blob, filename: string) {
  const uri = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = uri; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(uri), 1000);
}

function safeSource(value: string) {
  // Prevent unreasonably long uploaded filenames from exhausting the report.
  return value.replace(/[\r\n\t]/g, " ").slice(0, 140);
}

async function renderProfileReport(
  element: SVGSVGElement, stats: ProfileStatistics,
  dem: string, locale: string, t: (key: ProfileCopyKey) => string,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1800; canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("O navegador não suporta a exportação gráfica.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a"; ctx.font = "bold 52px sans-serif";
  ctx.fillText("GeoMoz Explorer", 85, 96);
  ctx.font = "bold 40px sans-serif"; ctx.fillText(t("profile"), 85, 162);
  ctx.font = "24px sans-serif"; ctx.fillStyle = "#475569";
  ctx.fillText(`${t("source")}: ${safeSource(dem)}`, 85, 210, 1620);
  const fmt = (value: number, digits = 1) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits, minimumFractionDigits: digits,
  }).format(value);
  const summary = [
    [t("distance"), fmt(stats.totalDistanceM / 1000, 2) + " km"],
    [t("minimum"), fmt(stats.minElevM) + " m"],
    [t("maximum"), fmt(stats.maxElevM) + " m"],
    [t("mean"), fmt(stats.meanElevM) + " m"],
    [t("ascent"), "+" + fmt(stats.gainM) + " m"],
    [t("descent"), "−" + fmt(stats.lossM) + " m"],
  ];
  summary.forEach(([label, value], i) => {
    const x = 85 + i * 275;
    ctx.fillStyle = "#64748b"; ctx.font = "21px sans-serif"; ctx.fillText(label, x, 291);
    ctx.fillStyle = "#0f172a"; ctx.font = "bold 26px sans-serif"; ctx.fillText(value, x, 332);
  });
  const svg = element.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("tabindex");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "1600");
  svg.setAttribute("height", "568");
  // The chart uses currentColor for grid and axis labels. Supply a print-safe color.
  svg.setAttribute("color", "#334155");
  const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error("Não foi possível renderizar o gráfico para exportação."));
      img.src = objectUrl;
    });
    ctx.drawImage(img, 72, 358, 1656, 586);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  ctx.fillStyle = "#64748b"; ctx.font = "19px sans-serif";
  ctx.fillText(`${stats.validCount}/${stats.sampleCount} ${t("validSamples")} · ${t("realDEM")}`, 85, 974);
  return canvas;
}

export async function exportProfileFigure(
  format: "png" | "pdf", svg: SVGSVGElement | null,
  samples: ProfileSample[], stats: ProfileStatistics, dem: string,
  language: string, t: (key: ProfileCopyKey) => string,
): Promise<void> {
  if (!svg || !samples.length || !stats.validCount) throw Error("Não existe um gráfico válido para exportar.");
  const locale = ["pt", "en", "fr", "es"].includes(language) ? language : "en";
  const canvas = await renderProfileReport(svg, stats, dem, locale, t);
  if (format === "png") {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw Error("Não foi possível gerar o PNG.");
    saveFile(blob, "geomoz_perfil_topografico.png");
  } else {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.97);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    saveFile(pdfFromJpeg(bytes, canvas.width, canvas.height), "geomoz_perfil_topografico.pdf");
  }
}
