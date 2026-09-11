/**
 * pdf-export.ts — Shared PDF export utilities for GeoMoz Explorer.
 *
 * Provides reusable helpers for generating professional A4 PDF reports with:
 *   - Map screenshot capture (html2canvas)
 *   - North arrow (compass rose)
 *   - Coordinate grid (lat/lon graticule)
 *   - Page footer with page numbers
 *   - Section headers with blue accent bar
 *   - Stat cards, tables, and progress bars
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { apiUrl, apiFetch } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

export const MARGIN = 14;
export const PAGE_W = 210; // A4 width in mm
export const PAGE_H = 297; // A4 height in mm
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const FOOTER_H = 12;

// ── Colour helpers ────────────────────────────────────────────────────────────

/** Parse a hex colour string into [r,g,b] tuple. */
export function hexToRgb(hex: string): [number, number, number] {
  try {
    const c = hex.replace("#", "").trim();
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [100, 116, 139];
    return [r, g, b];
  } catch {
    return [100, 116, 139];
  }
}

// ── Page management ───────────────────────────────────────────────────────────

export interface PDFContext {
  doc: jsPDF;
  pageNum: number;
  y: number;
  date: string;
  title: string;
}

export function createPDFContext(title: string): PDFContext {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const date = new Date().toLocaleDateString("pt-PT", {
    day: "2-digit", month: "long", year: "numeric",
  });
  return { doc, pageNum: 1, y: 0, date, title };
}

/** Draw the standard page footer. */
export function addPDFFooter(ctx: PDFContext) {
  const { doc, pageNum, date } = ctx;
  doc.setFillColor(241, 245, 249);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(0, PAGE_H - FOOTER_H, PAGE_W, PAGE_H - FOOTER_H);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("GeoMoz Explorer · geomoz library · Dados: GEE · DEM Copernicus GLO-30", MARGIN, PAGE_H - 4);
  doc.text(date, PAGE_W / 2, PAGE_H - 4, { align: "center" });
  doc.text(`Pág. ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 4, { align: "right" });
}

/** Start a new page and return the new Y position. */
export function newPDFPage(ctx: PDFContext): number {
  addPDFFooter(ctx);
  ctx.doc.addPage();
  ctx.pageNum++;
  // mini header on continuation pages
  ctx.doc.setFillColor(14, 165, 233);
  ctx.doc.rect(0, 0, PAGE_W, 10, "F");
  ctx.doc.setTextColor(255, 255, 255);
  ctx.doc.setFontSize(8);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.text("GeoMoz Explorer", MARGIN, 7);
  ctx.doc.text(ctx.title, PAGE_W - MARGIN, 7, { align: "right" });
  return 18;
}

/** Ensure there's enough space; start new page if needed. */
export function ensureSpace(ctx: PDFContext, needed: number) {
  if (ctx.y + needed > PAGE_H - FOOTER_H - 6) {
    ctx.y = newPDFPage(ctx);
  }
}

// ── Section header ────────────────────────────────────────────────────────────

/** Draw a section header with blue accent bar. Returns the new Y. */
export function sectionTitle(ctx: PDFContext, label: string): number {
  ensureSpace(ctx, 14);
  ctx.doc.setFillColor(248, 250, 252);
  ctx.doc.rect(MARGIN, ctx.y, CONTENT_W, 7, "F");
  ctx.doc.setDrawColor(226, 232, 240);
  ctx.doc.line(MARGIN, ctx.y, MARGIN + CONTENT_W, ctx.y);
  ctx.doc.line(MARGIN, ctx.y + 7, MARGIN + CONTENT_W, ctx.y + 7);
  ctx.doc.setFillColor(14, 165, 233);
  ctx.doc.rect(MARGIN, ctx.y, 3, 7, "F");
  ctx.doc.setTextColor(71, 85, 105);
  ctx.doc.setFontSize(8.5);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.text(label.toUpperCase(), MARGIN + 6, ctx.y + 5);
  ctx.y += 11;
  return ctx.y;
}

// ── Stat cards ────────────────────────────────────────────────────────────────

/** Draw a 2-column grid of stat cards. */
export function drawStatCards(
  ctx: PDFContext,
  cards: { label: string; value: string; color: [number, number, number] }[],
) {
  ensureSpace(ctx, 8 + Math.ceil(cards.length / 2) * 17);
  const gW = (CONTENT_W - 5) / 2;
  const gH = 14;
  cards.forEach((c, i) => {
    const cx = MARGIN + (i % 2) * (gW + 5);
    const cy = ctx.y + Math.floor(i / 2) * (gH + 4);
    ctx.doc.setFillColor(226, 232, 240);
    ctx.doc.roundedRect(cx + 0.5, cy + 0.5, gW, gH, 3, 3, "F");
    ctx.doc.setFillColor(...c.color);
    ctx.doc.roundedRect(cx, cy, gW, gH, 3, 3, "F");
    ctx.doc.setTextColor(255, 255, 255);
    ctx.doc.setFontSize(8);
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.text(c.label, cx + 6, cy + 5.5);
    ctx.doc.setFontSize(11);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.text(c.value, cx + 6, cy + 12);
  });
  ctx.y += Math.ceil(cards.length / 2) * (gH + 4) + 4;
}

// ── Table helpers ─────────────────────────────────────────────────────────────

/** Draw a simple table with header and rows. */
export function drawTable(
  ctx: PDFContext,
  headers: string[],
  rows: { cells: string[]; color?: string }[],
  colWidths?: number[],
) {
  const cw = colWidths ?? Array(headers.length).fill(CONTENT_W / headers.length);
  const rowH = 6.5;

  ensureSpace(ctx, rowH * (rows.length + 2) + 10);

  // Header
  ctx.doc.setFillColor(226, 232, 240);
  ctx.doc.rect(MARGIN, ctx.y, CONTENT_W, rowH, "F");
  ctx.doc.setTextColor(71, 85, 105);
  ctx.doc.setFontSize(7.5);
  ctx.doc.setFont("helvetica", "bold");
  let hx = MARGIN + 4;
  headers.forEach((h, i) => {
    ctx.doc.text(h, hx, ctx.y + 4.8);
    hx += cw[i] + (i < headers.length - 1 ? 4 : 2);
  });
  ctx.y += rowH;

  // Rows
  rows.forEach((row, ri) => {
    if (ctx.y + rowH > PAGE_H - FOOTER_H - 4) {
      ctx.y = newPDFPage(ctx);
      // Repeat header
      ctx.doc.setFillColor(226, 232, 240);
      ctx.doc.rect(MARGIN, ctx.y, CONTENT_W, rowH, "F");
      ctx.doc.setTextColor(71, 85, 105);
      ctx.doc.setFontSize(7.5);
      ctx.doc.setFont("helvetica", "bold");
      let rhx = MARGIN + 4;
      headers.forEach((h, i) => {
        ctx.doc.text(h, rhx, ctx.y + 4.8);
        rhx += cw[i] + (i < headers.length - 1 ? 4 : 2);
      });
      ctx.y += rowH;
    }
    if (ri % 2 === 0) {
      ctx.doc.setFillColor(250, 252, 255);
      ctx.doc.rect(MARGIN, ctx.y, CONTENT_W, rowH, "F");
    }
    // Color swatch
    if (row.color) {
      const [r, g, b] = hexToRgb(row.color);
      ctx.doc.setFillColor(r, g, b);
      ctx.doc.roundedRect(MARGIN + 2, ctx.y + 1.5, 4, 3.5, 0.6, 0.6, "F");
    }
    ctx.doc.setTextColor(30, 41, 59);
    ctx.doc.setFontSize(7.5);
    ctx.doc.setFont("helvetica", "normal");
    let rx = MARGIN + (row.color ? 10 : 4);
    row.cells.forEach((cell, i) => {
      ctx.doc.text(cell, rx, ctx.y + 4.5);
      rx += cw[i] + (i < row.cells.length - 1 ? 4 : 2);
    });
    ctx.y += rowH;
  });
  ctx.y += 4;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function drawProgressBar(
  ctx: PDFContext,
  label: string,
  value: number,   // 0–100
  color: [number, number, number] = [14, 165, 233],
  maxWidth = CONTENT_W,
) {
  ensureSpace(ctx, 12);
  ctx.doc.setTextColor(71, 85, 105);
  ctx.doc.setFontSize(7.5);
  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.text(label, MARGIN, ctx.y + 2.5);

  const barX = MARGIN + 50;
  const barW = Math.min(maxWidth - 50, 80);
  ctx.doc.setFillColor(226, 232, 240);
  ctx.doc.roundedRect(barX, ctx.y, barW, 4, 1.5, 1.5, "F");
  ctx.doc.setFillColor(...color);
  ctx.doc.roundedRect(barX, ctx.y, Math.max((Math.min(value, 100) / 100) * barW, 2), 4, 1.5, 1.5, "F");

  ctx.doc.setTextColor(...color);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.text(`${value.toFixed(0)}%`, barX + barW + 3, ctx.y + 3);

  ctx.doc.setFont("helvetica", "normal");
  ctx.y += 8;
}

// ── Map capture (html2canvas) — Legacy approach ────────────────────────────

/**
 * Capture a Leaflet map container element as a JPEG image suitable for PDF.
 * Returns a base64 data URL. The caller must ensure the element exists.
 *
 * @deprecated Use ``fetchMapImage()`` instead — it calls the backend Cartopy
 *             endpoint for higher quality, proper cartographic elements
 *             (north arrow, coordinate grid, scale bar) and avoids browser
 *             rendering limitations.
 */
export async function captureMapImage(mapElement: HTMLElement): Promise<string> {
  const canvas = await html2canvas(mapElement, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#f8fafc",
    scale: 1.5,
    logging: false,
    width: mapElement.clientWidth,
    height: mapElement.clientHeight,
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

// ── Map image via backend Cartopy API ───────────────────────────────────────

/**
 * Fetch a static map image from the Cartopy backend API.
 *
 * The backend generates a publication-quality PNG with:
 *   - CartoDB basemap (or GEE raster tile overlay)
 *   - Coordinate grid (lat/lon graticule with labels)
 *   - Scale bar
 *   - North arrow
 *   - Coastline / borders / lakes
 *   - Optional vector overlay (GeoJSON)
 *
 * Returns a base64 data URL suitable for ``ctx.doc.addImage()``.
 *
 * @example
 * ```ts
 * const imgData = await fetchMapImage({
 *   south: -26, north: -10, west: 30, east: 41,
 *   tileUrl: "https://earthengine.../{z}/{x}/{y}",
 *   title: "NDVI — 2023",
 * });
 * ctx.doc.addImage(imgData, "PNG", MARGIN, ctx.y, CONTENT_W, 90);
 * ```
 */
export async function fetchMapImage(
  bounds: { south: number; north: number; west: number; east: number },
  options?: {
    /** XYZ tile URL template (e.g. a GEE tile_fetcher.url_format). */
    tileUrl?: string;
    /** GeoJSON FeatureCollection to draw as vector overlay. */
    overlayGeojson?: any;
    /** Legend label for the vector overlay. */
    overlayLabel?: string;
    /** Legend items for classification maps: [{label, color}]. */
    legendItems?: { label: string; color: string }[];
    /** Desired map width in mm (default: 182 = A4 content width). */
    widthMm?: number;
    /** Desired map height in mm (default: 100). */
    heightMm?: number;
    /** Map title drawn at the top. */
    title?: string;
    /** Output DPI (default: 200). */
    dpi?: number;
  },
): Promise<string> {
  const resp = await apiFetch("/geomoz-api/gee/map-image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bounds,
      tile_url: options?.tileUrl ?? null,
      overlay_geojson: options?.overlayGeojson ?? null,
      overlay_label: options?.overlayLabel ?? null,
      legend_items: options?.legendItems ?? null,
      width_mm: options?.widthMm ?? 182,
      height_mm: options?.heightMm ?? 100,
      dpi: options?.dpi ?? 200,
      title: options?.title ?? null,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Map API error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Add a map image to the PDF, fitting it within the page.
 * Returns the Y position after the image.
 */
export function addMapImage(
  ctx: PDFContext,
  imgData: string,
  maxHeight?: number,
): number {
  const imgW = CONTENT_W;
  const imgH = maxHeight ?? Math.min(CONTENT_W * 0.7, PAGE_H - ctx.y - FOOTER_H - 20);
  ensureSpace(ctx, imgH + 4);
  ctx.doc.addImage(imgData, "JPEG", MARGIN, ctx.y, imgW, imgH);
  ctx.y += imgH + 4;
  return ctx.y;
}

// ── North arrow ───────────────────────────────────────────────────────────────

/**
 * Draw a north arrow (compass rose) on the PDF at the given position.
 * Default position: top-right of the map image area.
 */
export function drawNorthArrow(
  doc: jsPDF,
  x: number,      // right edge X
  y: number,      // top edge Y
  size: number = 8,
) {
  const cx = x - size - 2;
  const cy = y + size + 2;
  const tip = cy - size;
  const left = cx - size * 0.35;
  const right = cx + size * 0.35;
  const base = cy + size * 0.25;

  // White circle background
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.circle(cx, cy, size + 1.5, "F");
  doc.circle(cx, cy, size + 1.5, "S");

  // North pointing triangle (blue)
  doc.setFillColor(14, 165, 233);
  doc.triangle(cx, tip, left, base, cx, cy - size * 0.15, "F");

  // South pointing triangle (grey)
  doc.setFillColor(148, 163, 184);
  doc.triangle(cx, cy + size * 0.7, right, base, cx, cy + size * 0.15, "F");

  // "N" label
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.text("N", cx, tip + 4.5, { align: "center" });
}

// ── Coordinate grid ───────────────────────────────────────────────────────────

/**
 * Draw thin lat/lon graticule lines at the edges of a map image area.
 * Uses the map's geographic bounds (in degrees).
 *
 * @param doc       jsPDF instance
 * @param mapX      left edge of the map image (mm)
 * @param mapY      top edge of the map image (mm)
 * @param mapW      width of the map image (mm)
 * @param mapH      height of the map image (mm)
 * @param south     south latitude (decimal degrees)
 * @param north     north latitude
 * @param west      west longitude
 * @param east      east longitude
 * @param gridStep  spacing between grid lines in degrees (default 2)
 */
export function drawCoordinateGrid(
  doc: jsPDF,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  south: number,
  north: number,
  west: number,
  east: number,
  gridStep: number = 2,
) {
  if (Math.abs(north - south) < 0.01 || Math.abs(east - west) < 0.01) return;

  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(148, 163, 184);
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");

  // Horizontal grid lines (latitude)
  const latStart = Math.ceil(south / gridStep) * gridStep;
  for (let lat = latStart; lat <= north; lat += gridStep) {
    const frac = (lat - south) / (north - south);
    const ly = mapY + mapH - frac * mapH;
    doc.setDrawColor(203, 213, 225);
    doc.line(mapX, ly, mapX + mapW, ly);
    // Label
    const label = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "S" : "N"}`;
    doc.setTextColor(100, 116, 139);
    doc.text(label, mapX - 3, ly + 1.5, { align: "right" });
    doc.text(label, mapX + mapW + 2, ly + 1.5);
  }

  // Vertical grid lines (longitude)
  const lonStart = Math.ceil(west / gridStep) * gridStep;
  for (let lon = lonStart; lon <= east; lon += gridStep) {
    const frac = (lon - west) / (east - west);
    const lx = mapX + frac * mapW;
    doc.setDrawColor(203, 213, 225);
    doc.line(lx, mapY, lx, mapY + mapH);
    // Label
    const label = `${Math.abs(lon).toFixed(0)}°${lon >= 0 ? "E" : "W"}`;
    doc.setTextColor(100, 116, 139);
    doc.text(label, lx, mapY - 2, { align: "center" });
    doc.text(label, lx, mapY + mapH + 4, { align: "center" });
  }
}

// ── Cover page ────────────────────────────────────────────────────────────────

/** Draw a consistent cover page header. Returns Y after the header. */
export function drawCover(ctx: PDFContext, subtitle: string, infoParts: string[]) {
  const { doc } = ctx;

  // Sky gradient header
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, PAGE_W, 30, "F");
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 26, PAGE_W, 4, "F");

  // Logo circle
  doc.setFillColor(255, 255, 255);
  doc.circle(MARGIN + 8, 15, 8, "F");
  doc.setFillColor(14, 165, 233);
  doc.circle(MARGIN + 8, 15, 5.5, "F");
  doc.setFillColor(255, 255, 255);
  doc.circle(MARGIN + 8, 15, 2, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("GeoMoz Explorer", MARGIN + 20, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, MARGIN + 20, 23);

  // Info strip
  doc.setFillColor(240, 249, 255);
  doc.rect(0, 30, PAGE_W, 10, "F");
  doc.setTextColor(3, 105, 161);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(infoParts.join("   ·   "), MARGIN, 37);

  ctx.y = 46;
  return ctx.y;
}

// ── Risk colour helpers ──────────────────────────────────────────────────────

export function riskColor(v: number): string {
  if (v < 30) return "#22c55e";
  if (v < 55) return "#f59e0b";
  if (v < 75) return "#f97316";
  return "#ef4444";
}

export function riskRgb(v: number): [number, number, number] {
  if (v < 30) return [34, 197, 94];
  if (v < 55) return [245, 158, 11];
  if (v < 75) return [249, 115, 22];
  return [239, 68, 68];
}
