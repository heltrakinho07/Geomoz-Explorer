import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Globe, Download, Loader2, CheckCircle2, Info, Map, Image as ImageIcon, FolderArchive } from "lucide-react";
import jsPDF from "jspdf";
import type { Stats } from "@/hooks/useGeoMoz";
import type { LayerState } from "./Sidebar";
import { apiUrl } from "@/lib/api";

interface ExportPanelProps {
  province: string | null;
  district: string | null;
  colorBy: string;
  layers: LayerState;
  mapCenter: [number, number];
  mapZoom: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function hexToRgb(hex: string): [number, number, number] {
  try {
    const c = hex.replace("#", "").trim();
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return [100, 116, 139];
    return [r, g, b];
  } catch { return [100, 116, 139]; }
}

const MZ_AREA = 801_590;

// ─── HTML MAP EXPORT ──────────────────────────────────────────────────────────
function buildHtmlMap(
  province: string | null, district: string | null, colorBy: string, layers: LayerState,
  center: [number, number], zoom: number,
  provinceGJ: GeoJSON.FeatureCollection | undefined,
  geologyGJ: GeoJSON.FeatureCollection | undefined,
  districtGJ: GeoJSON.FeatureCollection | undefined,
  stats: Stats | undefined,
): string {
  const title = district ? `${district}, ${province}` : province ?? "Moçambique";
  const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  const layersLabel = [layers.geology && "Geologia", layers.provinces && "Províncias", layers.districts && "Distritos"].filter(Boolean).join(", ");

  const geoScript = geologyGJ
    ? `var geo=L.geoJSON(${JSON.stringify(geologyGJ)},{style:function(f){return{color:'#fff',weight:.4,fillColor:(f.properties&&f.properties._color)||'#64748b',fillOpacity:.82};},onEachFeature:function(f,l){var p=f.properties||{};var h='';if(p.Legend)h+='<b>'+p.Legend+'</b><br>';if(p.code2006)h+='Code: '+p.code2006+'<br>';if(p.ERA)h+='Era: '+p.ERA+'<br>';if(p.PERIOD)h+='Período: '+p.PERIOD;if(h)l.bindTooltip(h,{sticky:true});}}).addTo(map);`
    : "";
  const provScript = provinceGJ && layers.provinces
    ? `L.geoJSON(${JSON.stringify(provinceGJ)},{style:{color:'#64748b',weight:1.5,fillColor:'#e2e8f0',fillOpacity:.15},onEachFeature:function(f,l){var p=f.properties||{};var n=p.Provincia||p.PROVINCIA||p.NAME_1||p.name||'';if(n)l.bindTooltip('<b>'+n+'</b>',{sticky:true});}}).addTo(map);`
    : "";
  const distScript = districtGJ && layers.districts && province
    ? `L.geoJSON(${JSON.stringify(districtGJ)},{style:{color:'#94a3b8',weight:.8,fillOpacity:.05},onEachFeature:function(f,l){var p=f.properties||{};var n=p.Distrito||p.DISTRITO||p.NAME_2||p.name||'';if(n)l.bindTooltip(n,{sticky:true});}}).addTo(map);`
    : "";

  const statsHtml = stats ? `
<div class="stats-grid">
  <div class="scard sky"><div class="slabel">Feições</div><div class="sval">${fmt(stats.totalFeatures)}</div></div>
  <div class="scard violet"><div class="slabel">Unidades</div><div class="sval">${fmt(stats.totalUnits)}</div></div>
  <div class="scard amber"><div class="slabel">Área (km²)</div><div class="sval">${fmt(stats.totalAreaKm2)}</div></div>
  <div class="scard teal"><div class="slabel">Cobertura MZ</div><div class="sval">${((stats.totalAreaKm2 / MZ_AREA) * 100).toFixed(1)}%</div></div>
</div>
<div class="litho-list">
  <div class="litho-header">Top Litologias</div>
  ${stats.lithologies.slice(0, 10).map(l => `
  <div class="litho-row">
    <div class="litho-dot" style="background:${l.color}"></div>
    <div class="litho-name" title="${l.name}">${l.name.length > 28 ? l.name.slice(0, 26) + "…" : l.name}</div>
    <div class="litho-pct">${l.percent}%</div>
  </div>
  <div class="litho-bar-wrap"><div class="litho-bar" style="width:${l.percent}%;background:${l.color}"></div></div>
  `).join("")}
</div>` : "<p style='color:#94a3b8;font-size:12px;padding:12px'>Sem dados estatísticos</p>";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GeoMoz Explorer — ${title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;height:100vh;background:#f8fafc}
header{background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}
.logo{width:28px;height:28px;border-radius:6px;background:#0ea5e9;display:flex;align-items:center;justify-content:center}
header h1{font-size:15px;font-weight:700;color:#0f172a}
.badge{background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2px 8px;font-size:12px;color:#0369a1}
.meta{margin-left:auto;font-size:11px;color:#94a3b8}
#body{display:flex;flex:1;min-height:0}
#map{flex:1}
#panel{width:240px;background:#fff;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0}
.panel-head{padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#0f172a;display:flex;align-items:center;gap:6px}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;border-bottom:1px solid #f1f5f9}
.scard{border-radius:10px;padding:8px 10px;color:#fff}
.scard.sky{background:linear-gradient(135deg,#0ea5e9,#2563eb)}
.scard.violet{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}
.scard.amber{background:linear-gradient(135deg,#f59e0b,#ea580c)}
.scard.teal{background:linear-gradient(135deg,#14b8a6,#059669)}
.slabel{font-size:10px;opacity:.8;margin-bottom:2px}
.sval{font-size:16px;font-weight:700}
.litho-list{padding:10px 14px}
.litho-header{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.litho-row{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.litho-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.litho-name{font-size:10px;color:#374151;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.litho-pct{font-size:10px;color:#94a3b8;flex-shrink:0;font-variant-numeric:tabular-nums}
.litho-bar-wrap{height:3px;background:#f1f5f9;border-radius:2px;margin-bottom:7px;overflow:hidden}
.litho-bar{height:100%;border-radius:2px;transition:width .5s}
.north{position:absolute;top:70px;right:248px;z-index:1000;background:#fff;border-radius:50%;width:36px;height:36px;box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0}
footer{background:#fff;border-top:1px solid #e2e8f0;padding:5px 16px;font-size:10px;color:#94a3b8;flex-shrink:0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
</style>
</head>
<body>
<header>
  <div class="logo"><svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg></div>
  <h1>GeoMoz Explorer</h1>
  <span class="badge">${title}</span>
  <span class="meta">Exportado em ${date}</span>
</header>
<div id="body">
  <div style="position:relative;flex:1;display:flex">
    <div id="map"></div>
    <div class="north">
      <svg viewBox="0 0 32 32" width="24" height="24">
        <polygon points="16,3 19,15 16,13 13,15" fill="#0ea5e9"/>
        <polygon points="16,29 19,17 16,19 13,17" fill="#94a3b8"/>
        <circle cx="16" cy="16" r="2" fill="#334155"/>
        <text x="16" y="10.5" text-anchor="middle" font-size="5" font-weight="bold" fill="#0ea5e9" font-family="system-ui">N</text>
      </svg>
    </div>
  </div>
  <div id="panel">
    <div class="panel-head">
      <svg width="12" height="12" fill="none" stroke="#0ea5e9" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      ${title}
    </div>
    ${statsHtml}
  </div>
</div>
<footer>
  <span>GeoMoz Explorer · Dados: geomoz library</span>
  <span>Camadas: ${layersLabel} · Campo: ${colorBy}</span>
</footer>
<script>
var map=L.map('map').setView([${center[0]},${center[1]}],${zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{crossOrigin: 'anonymous', attribution:'&copy; OSM &copy; CARTO',maxZoom:19,subdomains:'abcd'}).addTo(map);
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
${geoScript}
${provScript}
${distScript}
</script>
</body>
</html>`;
}

// ─── PNG MAP EXPORT (offscreen canvas, no extra deps) ─────────────────────────

/** Web-Mercator: lon/lat → world pixel coordinates at a given zoom. */
function lonLatToWorldPx(lon: number, lat: number, zoom: number): [number, number] {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return [x, y];
}

function loadTile(z: number, x: number, y: number, sub: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `https://${sub}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
  });
}

/**
 * Render the current map view (base tiles + geology + boundaries) plus title,
 * legend and scale bar onto an offscreen canvas and return it as a PNG blob.
 */
async function renderMapPng(
  center: [number, number], zoom: number,
  title: string, colorBy: string,
  geologyGJ: GeoJSON.FeatureCollection | undefined,
  provinceGJ: GeoJSON.FeatureCollection | undefined,
  stats: Stats | undefined,
): Promise<Blob> {
  const W = 1600, H = 1100, HEADER = 64, FOOTER = 30;
  const MAP_H = H - HEADER - FOOTER;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não suportado neste browser");

  // ── base tiles ──
  const [cx, cy] = lonLatToWorldPx(center[1], center[0], zoom);
  const tlx = cx - W / 2, tly = cy - MAP_H / 2;
  const maxTile = Math.pow(2, zoom);
  const t0x = Math.floor(tlx / 256), t0y = Math.max(0, Math.floor(tly / 256));
  const t1x = Math.floor((tlx + W) / 256), t1y = Math.min(maxTile - 1, Math.floor((tly + MAP_H) / 256));
  const subs = ["a", "b", "c", "d"];

  ctx.fillStyle = "#e8ecf0";
  ctx.fillRect(0, HEADER, W, MAP_H);

  const jobs: Promise<void>[] = [];
  for (let tx = t0x; tx <= t1x; tx++) {
    for (let ty = t0y; ty <= t1y; ty++) {
      const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
      const sub = subs[(tx + ty) % subs.length];
      jobs.push(loadTile(zoom, wrappedX, ty, sub).then(img => {
        if (img) ctx.drawImage(img, Math.round(tx * 256 - tlx), Math.round(HEADER + ty * 256 - tly));
      }));
    }
  }
  await Promise.all(jobs);

  const project = (lon: number, lat: number): [number, number] => {
    const [px, py] = lonLatToWorldPx(lon, lat, zoom);
    return [px - tlx, HEADER + (py - tly)];
  };

  const drawRings = (rings: number[][][], fill: string | null, stroke: string, width: number, fillAlpha: number) => {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = project(lon, lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    if (fill) {
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = fill;
      ctx.fill("evenodd");
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  const eachPolygon = (fc: GeoJSON.FeatureCollection, cb: (rings: number[][][], props: Record<string, unknown>) => void) => {
    for (const f of fc.features) {
      const g = f.geometry;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      if (!g) continue;
      if (g.type === "Polygon") cb(g.coordinates as number[][][], props);
      else if (g.type === "MultiPolygon") {
        for (const poly of g.coordinates as number[][][][]) cb(poly, props);
      }
    }
  };

  // ── geology + province boundaries ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HEADER, W, MAP_H);
  ctx.clip();
  if (geologyGJ) {
    eachPolygon(geologyGJ, (rings, props) =>
      drawRings(rings, String(props._color ?? "#64748b"), "rgba(255,255,255,0.7)", 0.5, 0.72));
  }
  if (provinceGJ) {
    eachPolygon(provinceGJ, (rings) => drawRings(rings, null, "#475569", 1.4, 0));
  }
  ctx.restore();

  // ── header ──
  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(0, 0, W, HEADER);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillText("GeoMoz Explorer", 24, 40);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`Mapa Geológico — ${title}`, 260, 40);
  const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  ctx.textAlign = "right";
  ctx.fillText(`${date} · campo: ${colorBy}`, W - 24, 40);
  ctx.textAlign = "left";

  // ── legend (top lithologies) ──
  const lith = stats?.lithologies.slice(0, 8) ?? [];
  if (lith.length > 0) {
    const LG_W = 340, ROW = 24, LG_H = 40 + lith.length * ROW;
    const lx = W - LG_W - 16, ly = HEADER + 16;
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.roundRect(lx, ly, LG_W, LG_H, 10);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#475569";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText("TOP LITOLOGIAS", lx + 14, ly + 24);
    ctx.font = "12px system-ui, sans-serif";
    lith.forEach((l, i) => {
      const ry = ly + 40 + i * ROW;
      ctx.fillStyle = l.color;
      ctx.fillRect(lx + 14, ry, 14, 14);
      ctx.fillStyle = "#334155";
      const name = l.name.length > 34 ? l.name.slice(0, 32) + "…" : l.name;
      ctx.fillText(name, lx + 36, ry + 11);
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(`${l.percent}%`, lx + LG_W - 14, ry + 11);
      ctx.textAlign = "left";
    });
  }

  // ── scale bar ──
  const mPerPx = (156543.03392 * Math.cos((center[0] * Math.PI) / 180)) / Math.pow(2, zoom);
  const niceSteps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  const targetM = mPerPx * 140;
  const stepM = niceSteps.reduce((a, b) => (Math.abs(b - targetM) < Math.abs(a - targetM) ? b : a));
  const barPx = stepM / mPerPx;
  const sx = 24, sy = H - FOOTER - 26;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(sx - 8, sy - 20, barPx + 60, 36);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(sx, sy, barPx, 5);
  ctx.fillRect(sx, sy - 4, 2, 13);
  ctx.fillRect(sx + barPx - 2, sy - 4, 2, 13);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(stepM >= 1000 ? `${stepM / 1000} km` : `${stepM} m`, sx + barPx + 8, sy + 6);

  // ── north arrow ──
  const nx = W - 46, ny = H - FOOTER - 52;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(nx, ny, 24, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#cbd5e1"; ctx.stroke();
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath(); ctx.moveTo(nx, ny - 16); ctx.lineTo(nx + 6, ny + 4); ctx.lineTo(nx, ny); ctx.lineTo(nx - 6, ny + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#334155";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", nx, ny + 16);
  ctx.textAlign = "left";

  // ── footer ──
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, H - FOOTER, W, FOOTER);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("GeoMoz Explorer · Dados: geomoz library · Base: © OSM © CARTO", 24, H - 11);

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))), "image/png");
  });
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
function generatePdf(
  province: string | null, district: string | null, colorBy: string,
  stats: Stats | undefined,
  date: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  const FOOTER_H = 12;
  const title = district ? district : province ?? "Moçambique";
  const subtitle = district ? (province ?? "") : "";
  let pageNum = 1;

  // ── helpers ──
  function addFooter() {
    doc.setFillColor(241, 245, 249);
    doc.rect(0, H - FOOTER_H, W, FOOTER_H, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(0, H - FOOTER_H, W, H - FOOTER_H);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text("GeoMoz Explorer · geomoz library · Dados geológicos de Moçambique", MARGIN, H - 4);
    doc.text(date, W / 2, H - 4, { align: "center" });
    doc.text(`Pág. ${pageNum}`, W - MARGIN, H - 4, { align: "right" });
  }

  function newPage() {
    addFooter();
    doc.addPage();
    pageNum++;
    // mini header on continuation pages
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, W, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("GeoMoz Explorer", MARGIN, 7);
    doc.setFont("helvetica", "normal");
    doc.text(`Relatório — ${title}`, W - MARGIN, 7, { align: "right" });
    return 18;
  }

  function sectionLabel(label: string, y: number): number {
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y, CONTENT_W, 7, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
    doc.setFillColor(14, 165, 233);
    doc.rect(MARGIN, y, 3, 7, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), MARGIN + 6, y + 5);
    return y + 11;
  }

  // ── PAGE 1: COVER HEADER ──
  // Sky gradient (2 rects)
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 26, W, 4, "F");

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
  doc.text("GeoMoz Explorer", MARGIN + 20, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Relatório de Análise Geológica", MARGIN + 20, 21);

  // Area + date right
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, W - MARGIN, 12, { align: "right" });
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, W - MARGIN, 20, { align: "right" });
  }

  // Info strip
  doc.setFillColor(240, 249, 255);
  doc.rect(0, 30, W, 10, "F");
  doc.setTextColor(3, 105, 161);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const infoItems = [
    province ? `Província: ${province}` : "Área: Moçambique",
    district ? `Distrito: ${district}` : null,
    `Campo de cor: ${colorBy}`,
    `Data: ${date}`,
  ].filter(Boolean) as string[];
  doc.text(infoItems.join("   ·   "), MARGIN, 37);

  let y = 46;

  // ── STAT CARDS ──
  y = sectionLabel("Resumo Estatístico", y);

  if (stats) {
    const gW = (CONTENT_W - 5) / 2;
    const gH = 20;
    const cardDefs = [
      { color: [14, 165, 233] as [number, number, number], label: "Feições Totais", val: stats.totalFeatures.toLocaleString() },
      { color: [139, 92, 246] as [number, number, number], label: "Unidades Geológicas", val: stats.totalUnits.toLocaleString() },
      { color: [245, 158, 11] as [number, number, number], label: "Área Total (km²)", val: stats.totalAreaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 0 }) },
      { color: [20, 184, 166] as [number, number, number], label: "Litologia Dominante", val: stats.dominant.length > 28 ? stats.dominant.slice(0, 26) + "…" : stats.dominant },
    ];
    cardDefs.forEach((c, i) => {
      const cx = MARGIN + (i % 2) * (gW + 5);
      const cy = y + Math.floor(i / 2) * (gH + 4);
      // shadow
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(cx + 0.5, cy + 0.5, gW, gH, 3, 3, "F");
      // card
      doc.setFillColor(...c.color);
      doc.roundedRect(cx, cy, gW, gH, 3, 3, "F");
      // label
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(c.label, cx + 6, cy + 7.5);
      // value
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(c.val, cx + 6, cy + 15.5);
    });
    y += (gH + 4) * 2 + 4;

    // Extra metrics
    const metricsRow = [
      { label: "Cobertura Moçambique", val: `${((stats.totalAreaKm2 / MZ_AREA) * 100).toFixed(2)}%` },
      { label: "Área média / unidade", val: `${(stats.totalAreaKm2 / Math.max(stats.totalUnits, 1)).toFixed(0)} km²` },
      { label: "Polígonos / unidade", val: `${(stats.totalFeatures / Math.max(stats.totalUnits, 1)).toFixed(1)}` },
    ];
    const mW = (CONTENT_W - 8) / 3;
    metricsRow.forEach((m, i) => {
      const mx = MARGIN + i * (mW + 4);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(mx, y, mW, 12, 2, 2, "F");
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(mx, y, mW, 12, 2, 2, "S");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(m.label, mx + 4, y + 5.5);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(m.val, mx + 4, y + 10.5);
    });
    y += 16;

    // ── BAR CHART (top 12) ──
    y = sectionLabel("Distribuição Litológica — Gráfico de Barras (Top 12)", y);

    const chartItems = stats.lithologies.slice(0, 12);
    const maxPct = chartItems[0]?.percent ?? 1;
    const LABEL_W = 68;
    const BAR_W = CONTENT_W - LABEL_W - 18;
    const ROW_H = 9.5;

    chartItems.forEach((item, i) => {
      if (y + ROW_H > H - FOOTER_H - 4) { y = newPage(); }
      const ry = y + i * ROW_H;
      // alternating bg
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(MARGIN, ry, CONTENT_W, ROW_H, "F");
      }
      // color dot
      doc.setFillColor(...hexToRgb(item.color));
      doc.circle(MARGIN + 3, ry + ROW_H / 2, 2.2, "F");
      // label
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const name = item.name.length > 40 ? item.name.slice(0, 38) + "…" : item.name;
      doc.text(name, MARGIN + 7, ry + 6.2);
      // bar bg
      const barX = MARGIN + LABEL_W;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, ry + 2, BAR_W, ROW_H - 4, 1, 1, "F");
      // bar fill
      const bW = Math.max((item.percent / maxPct) * BAR_W, 1);
      doc.setFillColor(...hexToRgb(item.color));
      doc.roundedRect(barX, ry + 2, bW, ROW_H - 4, 1, 1, "F");
      // percent label
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7.5);
      doc.text(`${item.percent}%`, barX + BAR_W + 2, ry + 6.2);
    });
    y += chartItems.length * ROW_H + 6;

    // ── COMPLETE TABLE ──
    if (y + 24 > H - FOOTER_H - 4) { y = newPage(); }
    y = sectionLabel(`Tabela Litológica Completa — ${stats.lithologies.length} Unidades`, y);

    // Table header
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, CONTENT_W, 8, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Cor", MARGIN + 4, y + 5.5);
    doc.text("Litologia", MARGIN + 14, y + 5.5);
    doc.text("km²", W - MARGIN - 22, y + 5.5, { align: "right" });
    doc.text("%", W - MARGIN, y + 5.5, { align: "right" });
    y += 8;

    stats.lithologies.forEach((item, i) => {
      if (y > H - FOOTER_H - 10) {
        y = newPage();
        // Repeat header
        doc.setFillColor(226, 232, 240);
        doc.rect(MARGIN, y, CONTENT_W, 7, "F");
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("Cor", MARGIN + 4, y + 5);
        doc.text("Litologia", MARGIN + 14, y + 5);
        doc.text("km²", W - MARGIN - 22, y + 5, { align: "right" });
        doc.text("%", W - MARGIN, y + 5, { align: "right" });
        y += 7;
      }

      const ROW = 7;
      if (i % 2 === 0) {
        doc.setFillColor(250, 252, 255);
        doc.rect(MARGIN, y, CONTENT_W, ROW, "F");
      }
      // Color swatch
      doc.setFillColor(...hexToRgb(item.color));
      doc.roundedRect(MARGIN + 2.5, y + 1.5, 6, 4, 0.8, 0.8, "F");
      // Name
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      const name = item.name.length > 60 ? item.name.slice(0, 58) + "…" : item.name;
      doc.text(name, MARGIN + 14, y + 5);
      // Area
      doc.setTextColor(100, 116, 139);
      doc.text(fmt(item.areaKm2), W - MARGIN - 22, y + 5, { align: "right" });
      // Percent
      doc.setFillColor(14, 165, 233);
      const pBarW = Math.max((item.percent / maxPct) * 18, 0.5);
      doc.rect(W - MARGIN - 21, y + 2.5, pBarW, 2, "F");
      doc.setTextColor(14, 165, 233);
      doc.setFont("helvetica", "bold");
      doc.text(`${item.percent}%`, W - MARGIN, y + 5, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += ROW;
    });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);
    doc.text("Nenhum dado disponível. Selecione uma província no mapa.", MARGIN, y + 10);
    y += 20;
  }

  addFooter();
  return doc;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
type ExportKind = "pdf" | "html" | "csv" | "geojson" | "png" | "shp";

export default function ExportPanel({ province, district, colorBy, layers, mapCenter, mapZoom }: ExportPanelProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [done, setDone] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const title = district ? `${district}, ${province}` : province ?? "Moçambique";
  const hasData = !!province;

  function flash(k: ExportKind) { setDone(k); setTimeout(() => setDone(null), 2500); }

  function getStats() { return qc.getQueryData<Stats>(["stats", province, district]); }
  function getProvinces() { return qc.getQueryData<GeoJSON.FeatureCollection>(["provinces"]); }
  function getGeology() { return province ? qc.getQueryData<GeoJSON.FeatureCollection>(["geology", province, district, colorBy]) : undefined; }
  function getDistricts() { return province ? qc.getQueryData<GeoJSON.FeatureCollection>(["districts", province]) : undefined; }

  function handlePdf() {
    setBusy("pdf");
    try {
      const stats = getStats();
      const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
      const doc = generatePdf(province, district, colorBy, stats, date);
      doc.save(`GeoMoz_Relatorio_${province ?? "Mocambique"}_${district ?? "completo"}_${new Date().toISOString().slice(0, 10)}.pdf`);
      flash("pdf");
    } catch (e) {
      console.error("PDF error", e);
    } finally {
      setBusy(null);
    }
  }

  function handleHtml() {
    setBusy("html");
    try {
      const html = buildHtmlMap(
        province, district, colorBy, layers, mapCenter, mapZoom,
        getProvinces(), getGeology(), getDistricts(), getStats(),
      );
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Mapa_${province ?? "Mocambique"}_${district ?? "completo"}.html`;
      a.click();
      URL.revokeObjectURL(url);
      flash("html");
    } finally {
      setBusy(null);
    }
  }

  function handleCsv() {
    setBusy("csv");
    try {
      const stats = getStats();
      if (!stats) return;
      const rows = [
        ["#", "Litologia", "Cor_Hex", "Area_km2", "Percentagem"],
        ...stats.lithologies.map((l, i) => [i + 1, `"${l.name}"`, l.color, l.areaKm2.toFixed(4), l.percent]),
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_CSV_${province ?? "Mocambique"}_${district ?? "completo"}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash("csv");
    } finally {
      setBusy(null);
    }
  }

  async function handlePng() {
    setBusy("png"); setExportError(null);
    try {
      const blob = await renderMapPng(
        mapCenter, mapZoom, title, colorBy,
        layers.geology ? getGeology() : undefined,
        layers.provinces ? getProvinces() : undefined,
        getStats(),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Mapa_${province ?? "Mocambique"}_${district ?? "completo"}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      flash("png");
    } catch (e) {
      console.error("PNG error", e);
      setExportError(`PNG: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleShp() {
    setBusy("shp"); setExportError(null);
    try {
      const params = new URLSearchParams({ layer: "geology" });
      if (province) params.set("province", province);
      if (district) params.set("district", district);
      const res = await fetch(apiUrl(`/geomoz-api/export/shapefile?${params}`));
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Erro no servidor");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_SHP_${province ?? "Mocambique"}_${district ?? "completo"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      flash("shp");
    } catch (e) {
      console.error("SHP error", e);
      setExportError(`Shapefile: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  function handleGeoJson() {
    setBusy("geojson");
    try {
      const geoJSON = qc.getQueryData<GeoJSON.FeatureCollection>(["geology", province, district, colorBy]);
      if (!geoJSON) {
        alert("GeoJSON não disponível em cache. Certifique-se de que a geologia da área seleccionada foi carregada no mapa.");
        return;
      }
      const blob = new Blob([JSON.stringify(geoJSON, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Geologia_${province ?? "Mocambique"}${district ? `_${district}` : ""}_${colorBy}_${new Date().toISOString().slice(0, 10)}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      flash("geojson");
    } finally {
      setBusy(null);
    }
  }

  const CARD_BG: Record<ExportKind, string> = {
    pdf: "#fff1f2", html: "#f0f9ff", csv: "#f0fdf4", geojson: "#f5f3ff", png: "#fff7ed", shp: "#ecfeff",
  };

  const ExportCard = ({
    id, icon, title: cardTitle, desc, btnLabel, btnClass, onClick, disabled, disabledMsg,
  }: {
    id: ExportKind; icon: React.ReactNode; title: string; desc: string;
    btnLabel: string; btnClass: string; onClick: () => void; disabled?: boolean; disabledMsg?: string;
  }) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: CARD_BG[id] }}>
        {icon}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900 mb-1">{cardTitle}</h3>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
      <div>
        <button
          onClick={onClick}
          disabled={!!busy || disabled}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 text-white text-sm font-medium rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${btnClass}`}
        >
          {busy === id ? (
            <><Loader2 className="animate-spin w-4 h-4" /> A gerar…</>
          ) : done === id ? (
            <><CheckCircle2 className="w-4 h-4" /> Descarregado!</>
          ) : (
            <><Download size={14} /> {btnLabel}</>
          )}
        </button>
        {disabled && disabledMsg && (
          <p className="text-xs text-slate-400 mt-1.5 text-center">{disabledMsg}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-white">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Exportar Dados</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Exporte os resultados actuais em diferentes formatos para análise externa ou partilha.
            {province
              ? <> Área activa: <strong className="text-sky-600">{title}</strong>.</>
              : " Selecione uma província para activar todas as opções."}
          </p>
        </div>

        {/* Status bar */}
        {province && getStats() && (
          <div className="mb-6 bg-sky-50 border border-sky-100 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
              <Info size={16} className="text-sky-600" />
            </div>
            <div className="text-xs text-sky-800 leading-relaxed">
              <strong>{getStats()?.lithologies.length} litologias</strong> · {" "}
              <strong>{getStats()?.totalFeatures.toLocaleString()} feições</strong> · {" "}
              Área: <strong>{getStats()?.totalAreaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} km²</strong>
              {" "}— Todos os dados incluídos nos formatos abaixo.
            </div>
          </div>
        )}

        {/* Export cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <ExportCard
            id="pdf"
            icon={<FileText className="text-rose-500" size={22} />}
            title="Relatório PDF Completo"
            desc="PDF A4 profissional com cards de métricas, gráfico de barras vectorial das top litologias, e tabela paginada com todas as unidades geológicas — incluindo cor e área em km²."
            btnLabel="Descarregar PDF"
            btnClass="bg-rose-500 hover:bg-rose-600 shadow-rose-200"
            onClick={handlePdf}
            disabled={!hasData}
            disabledMsg="Selecione uma província para activar"
          />
          <ExportCard
            id="html"
            icon={<Globe className="text-sky-500" size={22} />}
            title="Mapa HTML Interactivo"
            desc="Ficheiro HTML autónomo com mapa Leaflet, painel lateral de estatísticas, legenda de cores, escala e bússola. Abre directamente no browser, sem servidor."
            btnLabel="Descarregar HTML"
            btnClass="bg-sky-500 hover:bg-sky-600 shadow-sky-200"
            onClick={handleHtml}
          />
          <ExportCard
            id="csv"
            icon={<Download className="text-emerald-500" size={22} />}
            title="Tabela CSV"
            desc="Tabela de litologias com índice, nome completo, código de cor hexadecimal, área em km² (4 decimais) e percentagem — compatível com Excel, QGIS e Python."
            btnLabel="Descarregar CSV"
            btnClass="bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200"
            onClick={handleCsv}
            disabled={!hasData || !getStats()}
            disabledMsg="Selecione uma província para activar"
          />
          <ExportCard
            id="geojson"
            icon={<Map className="text-violet-500" size={22} />}
            title="GeoJSON — Geologia Filtrada"
            desc="GeoJSON da camada de geologia actualmente filtrada (província / distrito), com todas as propriedades originais e a cor _color calculada. Compatível com QGIS, ArcGIS, Mapbox, Python/GeoPandas."
            btnLabel="Descarregar GeoJSON"
            btnClass="bg-violet-500 hover:bg-violet-600 shadow-violet-200"
            onClick={handleGeoJson}
            disabled={!hasData}
            disabledMsg="Selecione uma província para activar"
          />
          <ExportCard
            id="png"
            icon={<ImageIcon className="text-orange-500" size={22} />}
            title="Mapa PNG (imagem)"
            desc="Imagem PNG 1600×1100 da vista actual do mapa: base cartográfica, geologia colorida, fronteiras, legenda das top litologias, barra de escala e seta de norte. Pronta para relatórios e apresentações."
            btnLabel="Descarregar PNG"
            btnClass="bg-orange-500 hover:bg-orange-600 shadow-orange-200"
            onClick={handlePng}
            disabled={!hasData || !getGeology()}
            disabledMsg="Carregue a geologia no mapa primeiro"
          />
          <ExportCard
            id="shp"
            icon={<FolderArchive className="text-cyan-600" size={22} />}
            title="Shapefile (ZIP)"
            desc="ESRI Shapefile da geologia filtrada, gerado no servidor com GeoPandas e comprimido em ZIP (.shp/.shx/.dbf/.prj). Formato padrão para QGIS, ArcGIS e software SIG clássico."
            btnLabel="Descarregar SHP"
            btnClass="bg-cyan-600 hover:bg-cyan-700 shadow-cyan-200"
            onClick={handleShp}
            disabled={!hasData}
            disabledMsg="Selecione uma província para activar"
          />
        </div>

        {exportError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-700">
            <strong>Erro na exportação:</strong> {exportError}
          </div>
        )}

        {/* Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
          <strong>Nota sobre o PDF:</strong> O relatório inclui todos os dados actualmente carregados.
          Para o gráfico e tabela completa, certifique-se de que os dados de geologia foram carregados (selecione uma
          província e aguarde o carregamento antes de exportar). O HTML exportado inclui
          os dados GeoJSON em linha — se a geologia não tiver sido carregada, apenas as fronteiras de províncias serão incluídas.
        </div>
      </div>
    </div>
  );
}
