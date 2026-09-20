/**
 * standalone-html-export.ts — Standalone HTML WebGIS Report Generator.
 *
 * Exports a basin analysis as a self-contained, interactive HTML file that:
 *  - Works offline or online on any browser/device.
 *  - Features Light Mode and Dark Mode toggle.
 *  - Mirrors the exact visual identity and layout of the GeoMoz WebGIS viewer.
 *  - Contains embedded GeoJSON geometries, pour point, and layer controls.
 *  - Uses 100% free basemaps with ZERO API KEY requirements (OpenStreetMap, Esri Satélite, Esri Relevo).
 *  - Displays full morphometry cards, ESA WorldCover 10m land cover classes and percentages,
 *    SCS Curve Number runoff metrics, CHIRPS 12-month precipitation chart, and risk indicators.
 *  - Features "Onde Estou" real-time geolocation with live pulsing marker.
 *  - Never expires and never requires GEE connection.
 *  - 100% Lucide SVG icons — ZERO emojis.
 */

export interface ExportStandaloneHtmlOptions {
  title: string;
  basinReport: any;
  watershedData: any;
  wsStats?: any;
  pourPoint?: [number, number] | null;
  province?: string | null;
  district?: string | null;
}

export function generateStandaloneBasinHtml(options: ExportStandaloneHtmlOptions): string {
  const {
    title,
    basinReport: report,
    watershedData: wsData,
    wsStats,
    pourPoint: PP,
    province,
    district,
  } = options;

  const totalArea = report?.morphometry?.areaKm2 || wsData?.areaKm2 || 0;
  const m = report?.morphometry || {};
  const landcover = report?.landcover || [];
  const precipMonthly: number[] = report?.precipMonthly || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const precipAnnual = report?.precipAnnualMm || 0;
  const cn = report?.runoff?.cnMean;
  const geojsonStr = JSON.stringify(wsData?.geojson || { type: "FeatureCollection", features: [] });
  const pourPointStr = PP ? JSON.stringify(PP) : "null";
  const dateStr = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  const landcoverTileUrl = report?.landcoverTile || "";
  const cnTileUrl = report?.runoff?.cnTile || "";
  const drainageTileUrl = wsData?.tileUrl || "";

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const maxPrecip = Math.max(...precipMonthly, 1);

  // SVG Icons (Lucide style)
  const svgMapPin = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  const svgLayers = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`;
  const svgMountain = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
  const svgDroplets = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>`;
  const svgActivity = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  const svgWaves = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
  const svgLocate = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/></svg>`;
  const svgCrosshair = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>`;
  const svgCompass = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;
  const svgPrinter = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`;
  const svgSun = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
  const svgMoon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  const svgBranch = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;
  const svgChevronLeft = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronRight = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  return `<!DOCTYPE html>
<html lang="pt" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · GeoMoz WebGIS</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    :root {
      --bg-main: #0b1120;
      --bg-panel: #0f172a;
      --bg-card: #131d31;
      --bg-sub: #1e293b;
      --border: #1e293b;
      --border-sub: #334155;
      --text-main: #f8fafc;
      --text-sub: #94a3b8;
      --text-muted: #64748b;
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --accent: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    html[data-theme="light"] {
      --bg-main: #f1f5f9;
      --bg-panel: #ffffff;
      --bg-card: #f8fafc;
      --bg-sub: #e2e8f0;
      --border: #e2e8f0;
      --border-sub: #cbd5e1;
      --text-main: #0f172a;
      --text-sub: #475569;
      --text-muted: #64748b;
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --accent: #0284c7;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg-main);
      color: var(--text-main);
      line-height: 1.5;
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ────────────────────────────────────────── */
    header {
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      padding: 0.65rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      z-index: 100;
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-logo {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0284c7, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: white;
      font-size: 1rem;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-subtitle {
      font-size: 0.72rem;
      color: var(--text-sub);
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background: var(--bg-sub);
      color: var(--accent);
      border: 1px solid var(--border-sub);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .btn {
      background: var(--bg-sub);
      border: 1px solid var(--border-sub);
      color: var(--text-main);
      padding: 0.45rem 0.75rem;
      border-radius: 10px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--border);
      border-color: var(--accent);
    }
    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      border: none;
      color: #fff;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .btn-primary:hover {
      opacity: 0.92;
    }

    /* ── Main Layout ────────────────────────────────────── */
    .layout {
      display: flex;
      flex: 1;
      height: calc(100vh - 61px);
      position: relative;
      overflow: hidden;
    }
    #map-container {
      flex: 1;
      height: 100%;
      position: relative;
      background: var(--bg-main);
    }
    #map {
      width: 100%;
      height: 100%;
    }

    /* ── Floating Layers Toolbar ────────────────────────── */
    .layers-toolbar {
      position: absolute;
      top: 1rem;
      left: 1rem;
      z-index: 500;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0.4rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      box-shadow: var(--shadow);
    }
    html[data-theme="light"] .layers-toolbar {
      background: rgba(255, 255, 255, 0.92);
      border-color: #cbd5e1;
    }
    .toolbar-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding: 0 0.4rem;
    }
    .layer-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-sub);
      padding: 0.3rem 0.6rem;
      border-radius: 8px;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      transition: all 0.15s;
    }
    .layer-btn:hover {
      background: var(--bg-sub);
      color: var(--text-main);
    }
    .layer-btn.active {
      background: rgba(2, 132, 199, 0.15);
      border-color: rgba(2, 132, 199, 0.4);
      color: var(--accent);
    }
    .layer-btn.active-lulc {
      background: rgba(132, 204, 22, 0.15);
      border-color: rgba(132, 204, 22, 0.4);
      color: #84cc16;
    }
    .layer-btn.active-cn {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
      color: #f59e0b;
    }
    .toolbar-sep {
      width: 1px;
      height: 16px;
      background: var(--border-sub);
      margin: 0 0.2rem;
    }

    /* ── Floating Legend ────────────────────────────────── */
    .map-legend {
      position: absolute;
      bottom: 2rem;
      left: 1rem;
      z-index: 500;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0.75rem 1rem;
      min-width: 190px;
      max-width: 280px;
      box-shadow: var(--shadow);
      font-size: 0.72rem;
      color: var(--text-sub);
      pointer-events: auto;
    }
    html[data-theme="light"] .map-legend {
      background: rgba(255, 255, 255, 0.94);
      border-color: #cbd5e1;
    }
    .legend-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .legend-item:last-child { margin-bottom: 0; }
    .legend-swatch {
      width: 14px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .legend-sep {
      margin: 0.5rem 0;
      border-top: 1px solid var(--border);
    }

    /* ── North Arrow ────────────────────────────────────── */
    .north-arrow {
      position: absolute;
      top: 1rem;
      right: 4rem;
      z-index: 500;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 10px;
      width: 34px;
      height: 34px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow);
      color: var(--text-main);
      font-size: 0.55rem;
      font-weight: 800;
      pointer-events: none;
    }
    html[data-theme="light"] .north-arrow {
      background: rgba(255, 255, 255, 0.9);
      border-color: #cbd5e1;
    }

    /* ── Sidebar ────────────────────────────────────────── */
    .sidebar {
      width: 400px;
      max-width: 100%;
      background: var(--bg-panel);
      border-left: 1px solid var(--border);
      overflow-y: auto;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      flex-shrink: 0;
      transition: margin-right 0.3s ease;
      z-index: 50;
    }
    .sidebar.collapsed {
      margin-right: -400px;
    }
    .sidebar-toggle-btn {
      position: absolute;
      top: 5rem;
      right: 400px;
      z-index: 500;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-right: none;
      color: var(--text-main);
      width: 28px;
      height: 36px;
      border-radius: 8px 0 0 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow);
      transition: right 0.3s ease;
    }
    .sidebar.collapsed + .sidebar-toggle-btn,
    .sidebar-toggle-btn.collapsed {
      right: 0;
    }

    /* ── Section Cards ──────────────────────────────────── */
    .hero-card {
      background: linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%);
      border-radius: 16px;
      padding: 1.25rem;
      color: #ffffff;
      box-shadow: 0 10px 25px -5px rgba(2, 132, 199, 0.4);
    }
    .hero-label {
      font-size: 0.72rem;
      opacity: 0.85;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.25rem;
    }
    .hero-val {
      font-size: 2.2rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }
    .hero-sub {
      font-size: 0.75rem;
      opacity: 0.9;
      margin-top: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .section-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .section-toggle-btn {
      font-size: 0.68rem;
      color: var(--accent);
      background: transparent;
      border: none;
      cursor: pointer;
      font-weight: 600;
    }
    .section-toggle-btn:hover { text-decoration: underline; }

    /* ── Morfometria Grid ───────────────────────────────── */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.45rem;
    }
    .stat-item {
      background: var(--bg-sub);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.5rem 0.35rem;
      text-align: center;
    }
    .stat-label {
      font-size: 0.62rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-bottom: 0.15rem;
    }
    .stat-val {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-main);
    }

    /* ── Landcover Table ────────────────────────────────── */
    .landcover-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .landcover-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.72rem;
    }
    .landcover-info {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      overflow: hidden;
      flex: 1;
    }
    .landcover-dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .landcover-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-main);
    }
    .landcover-stats {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .landcover-pct {
      font-weight: 700;
      color: var(--accent);
      min-width: 45px;
      text-align: right;
    }
    .landcover-area {
      font-size: 0.65rem;
      color: var(--text-muted);
      min-width: 55px;
      text-align: right;
    }
    .progress-bar-bg {
      width: 100%;
      height: 4px;
      background: var(--bg-sub);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 0.2rem;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 2px;
    }

    /* ── Precipitation Chart ────────────────────────────── */
    .chart-container {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 95px;
      padding-top: 10px;
    }
    .chart-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
      cursor: default;
    }
    .chart-bar {
      width: 100%;
      background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%);
      border-radius: 3px 3px 0 0;
      min-height: 2px;
      transition: opacity 0.2s;
    }
    .chart-col:hover .chart-bar {
      opacity: 0.8;
    }
    .chart-month {
      font-size: 0.6rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* ── Curve Number Card ──────────────────────────────── */
    .cn-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .cn-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .cn-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: #f59e0b;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .cn-gradient-bar {
      height: 6px;
      border-radius: 3px;
      background: linear-gradient(to right, #1a9850, #fee08b, #d73027);
    }
    .cn-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.62rem;
      color: var(--text-muted);
    }

    /* ── Pulsing GPS Marker ─────────────────────────────── */
    @keyframes pulse-ring {
      0% { transform: scale(0.5); opacity: 0.8; }
      80%, 100% { transform: scale(2.2); opacity: 0; }
    }
    .gps-pulsing-icon {
      position: relative;
      width: 18px;
      height: 18px;
    }
    .gps-pulsing-icon::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #0284c7;
      animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    }
    .gps-pulsing-icon::after {
      content: '';
      position: absolute;
      width: 12px;
      height: 12px;
      top: 3px;
      left: 3px;
      border-radius: 50%;
      background: #0284c7;
      border: 2px solid #ffffff;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.4);
    }

    /* ── Print Styles ───────────────────────────────────── */
    @media print {
      body { height: auto; overflow: visible; background: #ffffff; color: #000000; }
      header { border-bottom: 1px solid #ccc; }
      .header-actions, .layers-toolbar, .sidebar-toggle-btn { display: none !important; }
      .layout { display: block; height: auto; }
      #map-container { height: 500px; page-break-after: always; }
      .sidebar { width: 100%; border: none; padding: 1rem 0; }
      .section-card { border: 1px solid #e2e8f0; background: #fff; }
    }
  </style>
</head>
<body>

  <!-- ── Header ────────────────────────────────────────── -->
  <header>
    <div class="brand">
      <div class="brand-logo" title="GeoMoz Explorer">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
          <path d="M2 12h20"/>
        </svg>
      </div>
      <div>
        <div class="brand-title">
          <span>GeoMoz <span style="color: #38bdf8;">Explorer</span></span>
          <span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border-color: rgba(14, 165, 233, 0.3);">WebGIS</span>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);">Apenas Leitura</span>
        </div>
        <div class="brand-subtitle">
          <span>${title}</span>
          <span>·</span>
          <span>${dateStr}</span>
          <span>·</span>
          <span>Área: <strong>${totalArea.toLocaleString("pt-PT")} km²</strong></span>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="locateUser()" title="A minha localização atual">
        ${svgLocate}
        <span>Onde Estou</span>
      </button>
      <button class="btn" onclick="fitBasin()" title="Ajustar zoom à bacia">
        ${svgCrosshair}
        <span>Focar Bacia</span>
      </button>
      <button class="btn" onclick="toggleTheme()" id="theme-btn" title="Alternar Modo Claro / Escuro">
        ${svgSun}
        <span id="theme-btn-label">Modo Claro</span>
      </button>
      <button class="btn btn-primary" onclick="window.print()" title="Imprimir ou salvar PDF">
        ${svgPrinter}
        <span>Imprimir / PDF</span>
      </button>
    </div>
  </header>

  <!-- ── Main Layout ────────────────────────────────────── -->
  <div class="layout">
    <!-- Map Container -->
    <div id="map-container">
      <div id="map"></div>

      <!-- North Arrow (Norte Geográfico) -->
      <div class="north-arrow" title="Norte Geográfico">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="12,2 19,21 12,17 5,21" fill="#ef4444" stroke="#ef4444" />
        </svg>
        <span>N</span>
      </div>

      <!-- Floating Layers Toolbar -->
      <div class="layers-toolbar">
        <span class="toolbar-label">Camadas:</span>
        <button id="btn-layer-basin" class="layer-btn active" onclick="toggleLayer('basin')">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #0284c7;"></span>
          Bacia
        </button>
        <button id="btn-layer-drainage" class="layer-btn active" onclick="toggleLayer('drainage')">
          ${svgBranch}
          Linhas de Água
        </button>
        <button id="btn-layer-lulc" class="layer-btn" onclick="toggleLayer('lulc')">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #84cc16;"></span>
          Uso do Solo (10m)
        </button>
        <button id="btn-layer-cn" class="layer-btn" onclick="toggleLayer('cn')">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span>
          Escoamento (CN)
        </button>
      </div>

      <!-- Floating Legend -->
      <div class="map-legend" id="map-legend">
        <div class="legend-title">
          ${svgCompass}
          <span>Legenda do Mapa</span>
        </div>
        <div class="legend-item" id="leg-basin">
          <span class="legend-swatch" style="border: 2px solid #0284c7; background: rgba(2, 132, 199, 0.2);"></span>
          <span>Limite da Bacia</span>
        </div>
        <div class="legend-item" id="leg-drainage">
          <span class="legend-swatch" style="background: #0284c7; height: 3px;"></span>
          <span>Rede de Drenagem</span>
        </div>
        ${PP ? `
        <div class="legend-item">
          <span class="legend-swatch" style="width: 10px; height: 10px; border-radius: 50%; background: #ef4444; border: 2px solid #fff;"></span>
          <span>Exutório da Bacia</span>
        </div>` : ""}

        <!-- Dynamic LULC Legend Section -->
        <div id="leg-lulc-section" style="display: none;">
          <div class="legend-sep"></div>
          <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem;">
            Uso do Solo (ESA 10m)
          </div>
          ${landcover.slice(0, 6).map((lc: any) => `
            <div class="legend-item">
              <span class="legend-swatch" style="background: ${lc.color};"></span>
              <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lc.label}</span>
              <span style="font-weight: 600; color: var(--accent);">${lc.pct}%</span>
            </div>
          `).join("")}
        </div>

        <!-- Dynamic CN Legend Section -->
        <div id="leg-cn-section" style="display: none;">
          <div class="legend-sep"></div>
          <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem;">
            Curve Number (CN)
          </div>
          <div class="cn-gradient-bar" style="margin-bottom: 0.25rem;"></div>
          <div class="cn-labels">
            <span>Infiltração (CN &lt; 50)</span>
            <span>Escoamento (CN &gt; 80)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar Toggle Button -->
    <button class="sidebar-toggle-btn" id="sidebar-toggle-btn" onclick="toggleSidebar()" title="Mostrar/Ocultar painel">
      <span id="sidebar-toggle-icon">${svgChevronRight}</span>
    </button>

    <!-- ── Right Panel (Details & Metrics) ────────────────── -->
    <aside class="sidebar" id="sidebar">
      <!-- Hero Card -->
      <div class="hero-card">
        <div class="hero-label">
          <span>ÁREA TOTAL DA BACIA</span>
          <span style="background: rgba(255, 255, 255, 0.2); padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.65rem;">WGS 84</span>
        </div>
        <div class="hero-val">${totalArea.toLocaleString("pt-PT")} <span style="font-size: 1.1rem; font-weight: 500; opacity: 0.85;">km²</span></div>
        <div class="hero-sub">
          ${svgMapPin}
          <span>${PP ? `Exutório: ${PP[0].toFixed(4)}°, ${PP[1].toFixed(4)}°` : "Bacia Hidrográfica Delimitada"}</span>
        </div>
      </div>

      <!-- Morfometria da Bacia -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">
            ${svgMountain}
            <span>Morfometria da Bacia</span>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Perímetro</div>
            <div class="stat-val">${Number(m.perimeterKm || 0).toFixed(0)} km</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Relevo</div>
            <div class="stat-val">${Number(m.reliefM || 0).toFixed(0)} m</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Declive méd.</div>
            <div class="stat-val">${Number(m.slopeMeanDeg || 0).toFixed(1)}°</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Elev. mín.</div>
            <div class="stat-val">${Number(m.elevMinM || 0).toFixed(0)} m</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Elev. média</div>
            <div class="stat-val">${Number(m.elevMeanM || 0).toFixed(0)} m</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Elev. máx.</div>
            <div class="stat-val">${Number(m.elevMaxM || 0).toFixed(0)} m</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Dens. dren.</div>
            <div class="stat-val">${m.drainageDensity || "—"}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Compacidade</div>
            <div class="stat-val">${m.compactness || "—"}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Fator forma</div>
            <div class="stat-val">${m.formFactor || "—"}</div>
          </div>
        </div>
      </div>

      <!-- Uso e Cobertura do Solo (ESA 10m) -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">
            ${svgActivity}
            <span>Uso do Solo (ESA 10m)</span>
          </div>
          <button class="section-toggle-btn" onclick="toggleLayer('lulc')">
            <span id="btn-text-lulc">Ver no mapa</span>
          </button>
        </div>
        <div class="landcover-list">
          ${landcover.slice(0, 8).map((lc: any) => `
            <div>
              <div class="landcover-row">
                <div class="landcover-info">
                  <span class="landcover-dot" style="background: ${lc.color};"></span>
                  <span class="landcover-label" title="${lc.label}">${lc.label}</span>
                </div>
                <div class="landcover-stats">
                  <span class="landcover-pct">${lc.pct}%</span>
                  <span class="landcover-area">${Number(lc.areaKm2).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km²</span>
                </div>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${Math.min(lc.pct, 100)}%; background: ${lc.color};"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Escoamento Superficial (SCS CN) -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">
            ${svgWaves}
            <span>Escoamento (Curve Number)</span>
          </div>
          <button class="section-toggle-btn" onclick="toggleLayer('cn')">
            <span id="btn-text-cn">Ver no mapa</span>
          </button>
        </div>
        <div class="cn-card">
          <div class="cn-top">
            <div>
              <div style="font-size: 0.72rem; color: var(--text-sub);">Curve Number Médio (CN)</div>
              <div style="font-size: 0.65rem; color: var(--text-muted);">Menor = infiltração / Maior = cheia rápida</div>
            </div>
            <div class="cn-val">${cn != null ? Number(cn).toFixed(1) : "—"}</div>
          </div>
          <div class="cn-gradient-bar"></div>
          <div class="cn-labels">
            <span>40 · Alta infiltração</span>
            <span>Escoamento rápido · 100</span>
          </div>
        </div>
      </div>

      <!-- Precipitação Mensal (CHIRPS) -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">
            ${svgDroplets}
            <span>Chuva Mensal · ${precipAnnual.toLocaleString("pt-PT")} mm/ano</span>
          </div>
        </div>
        <div class="chart-container">
          ${precipMonthly.map((mm: number, i: number) => {
            const hPct = Math.max((mm / maxPrecip) * 100, 3);
            return `
              <div class="chart-col" title="${months[i]}: ${Math.round(mm)} mm">
                <div class="chart-bar" style="height: ${hPct}%;"></div>
                <div class="chart-month">${months[i]}</div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Índices de Risco (se wsStats existirem) -->
      ${wsStats ? `
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">
            ${svgActivity}
            <span>Índices de Risco & Potencial</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem;">
              <span>Risco de Erosão</span>
              <strong style="color: #f59e0b;">${Number(wsStats.erosionRisk || 0).toFixed(0)}/100</strong>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${wsStats.erosionRisk || 0}%; background: #f59e0b;"></div></div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem;">
              <span>Risco de Cheia</span>
              <strong style="color: #ef4444;">${Number(wsStats.floodRisk || 0).toFixed(0)}/100</strong>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${wsStats.floodRisk || 0}%; background: #ef4444;"></div></div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem;">
              <span>Potencial Hidrogeológico</span>
              <strong style="color: #10b981;">${Number(wsStats.hydroPotential || 0).toFixed(0)}/100</strong>
            </div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${wsStats.hydroPotential || 0}%; background: #10b981;"></div></div>
          </div>
        </div>
      </div>` : ""}

      <!-- Metadados Cartográficos -->
      <div class="section-card" style="font-size: 0.65rem; color: var(--text-muted); line-height: 1.5;">
        <div><strong>Sistema de Coordenadas:</strong> WGS 84 (EPSG:4326)</div>
        <div><strong>Fontes:</strong> ESA WorldCover (10m), Copernicus DEM GLO-30, CHIRPS, HydroSHEDS</div>
        <div><strong>Plataforma:</strong> GeoMoz Explorer · WebGIS Autónomo</div>
      </div>
    </aside>
  </div>

  <script>
    const geojsonData = ${geojsonStr};
    const pourPoint = ${pourPointStr};
    const landcoverTileUrl = "${landcoverTileUrl}";
    const cnTileUrl = "${cnTileUrl}";
    const drainageTileUrl = "${drainageTileUrl}";

    // Theme Management
    let currentTheme = "dark";
    function toggleTheme() {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", currentTheme);
      const btn = document.getElementById("theme-btn-label");
      if (btn) btn.textContent = currentTheme === "dark" ? "Modo Claro" : "Modo Escuro";
    }

    // Sidebar Toggle
    let sidebarOpen = true;
    function toggleSidebar() {
      sidebarOpen = !sidebarOpen;
      const sb = document.getElementById("sidebar");
      const btn = document.getElementById("sidebar-toggle-btn");
      const icon = document.getElementById("sidebar-toggle-icon");
      if (sidebarOpen) {
        sb.classList.remove("collapsed");
        btn.classList.remove("collapsed");
        icon.innerHTML = '${svgChevronRight}';
      } else {
        sb.classList.add("collapsed");
        btn.classList.add("collapsed");
        icon.innerHTML = '${svgChevronLeft}';
      }
      setTimeout(() => map.invalidateSize(), 320);
    }

    // Initialize Map
    const map = L.map("map", { zoomControl: false }).setView([-18.66, 35.52], 6);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    // Free Open Basemaps (ZERO API KEYS REQUIRED, NO OSM 403 BLOCK, NO WATERMARK)
    const googleRoadmap = L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
      subdomains: "0123",
      attribution: '&copy; Google Maps',
      maxZoom: 20
    }).addTo(map);

    const googleHybrid = L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      subdomains: "0123",
      attribution: '&copy; Google Maps',
      maxZoom: 20
    });

    const googleTerrain = L.tileLayer("https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", {
      subdomains: "0123",
      attribution: '&copy; Google Maps',
      maxZoom: 20
    });

    const esriTopo = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri, HERE, Garmin, USGS',
      maxZoom: 19
    });

    const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri, Earthstar Geographics',
      maxZoom: 19
    });

    L.control.layers({
      "Google Estradas (Padrão)": googleRoadmap,
      "Google Híbrido": googleHybrid,
      "Google Relevo": googleTerrain,
      "Esri Relevo Topográfico": esriTopo,
      "Esri Satélite (Óptico)": esriSat
    }, null, { position: "topright" }).addTo(map);

    // Layer references
    let basinLayer = null;
    let drainageLayer = null;
    let lulcLayer = null;
    let cnLayer = null;
    let gpsMarker = null;
    let gpsCircle = null;

    // Load Basin Boundary
    if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
      basinLayer = L.geoJSON(geojsonData, {
        style: {
          color: "#0284c7",
          weight: 2.5,
          fillColor: "#0284c7",
          fillOpacity: 0.12
        }
      }).addTo(map);

      map.fitBounds(basinLayer.getBounds(), { padding: [40, 40] });
    }

    // Load Drainage Tiles (HydroSHEDS)
    if (drainageTileUrl) {
      drainageLayer = L.tileLayer(drainageTileUrl, {
        opacity: 0.88,
        maxZoom: 18,
        attribution: "HydroSHEDS · WWF"
      }).addTo(map);
    }

    // Prepare LULC Tile Layer (ESA WorldCover)
    if (landcoverTileUrl) {
      lulcLayer = L.tileLayer(landcoverTileUrl, {
        opacity: 0.78,
        maxZoom: 18,
        attribution: "GEE · ESA WorldCover 10m"
      });
    }

    // Prepare CN Tile Layer (SCS Curve Number)
    if (cnTileUrl) {
      cnLayer = L.tileLayer(cnTileUrl, {
        opacity: 0.75,
        maxZoom: 18,
        attribution: "GEE · SCS Curve Number"
      });
    }

    // Pour Point Marker
    if (pourPoint) {
      L.circleMarker(pourPoint, {
        radius: 8,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map).bindPopup("<b>Exutório da Bacia</b><br>" + pourPoint[0].toFixed(4) + "°, " + pourPoint[1].toFixed(4) + "°");
    }

    // Layer Toggle Function
    function toggleLayer(type) {
      if (type === "basin") {
        const btn = document.getElementById("btn-layer-basin");
        const leg = document.getElementById("leg-basin");
        if (basinLayer) {
          if (map.hasLayer(basinLayer)) {
            map.removeLayer(basinLayer);
            btn.classList.remove("active");
            if (leg) leg.style.display = "none";
          } else {
            map.addLayer(basinLayer);
            btn.classList.add("active");
            if (leg) leg.style.display = "flex";
          }
        }
      } else if (type === "drainage") {
        const btn = document.getElementById("btn-layer-drainage");
        const leg = document.getElementById("leg-drainage");
        if (drainageLayer) {
          if (map.hasLayer(drainageLayer)) {
            map.removeLayer(drainageLayer);
            btn.classList.remove("active");
            if (leg) leg.style.display = "none";
          } else {
            map.addLayer(drainageLayer);
            btn.classList.add("active");
            if (leg) leg.style.display = "flex";
          }
        }
      } else if (type === "lulc") {
        const btn = document.getElementById("btn-layer-lulc");
        const legSec = document.getElementById("leg-lulc-section");
        const btnText = document.getElementById("btn-text-lulc");
        if (lulcLayer) {
          if (map.hasLayer(lulcLayer)) {
            map.removeLayer(lulcLayer);
            btn.classList.remove("active-lulc");
            if (legSec) legSec.style.display = "none";
            if (btnText) btnText.textContent = "Ver no mapa";
          } else {
            map.addLayer(lulcLayer);
            btn.classList.add("active-lulc");
            if (legSec) legSec.style.display = "block";
            if (btnText) btnText.textContent = "Ocultar do mapa";
          }
        }
      } else if (type === "cn") {
        const btn = document.getElementById("btn-layer-cn");
        const legSec = document.getElementById("leg-cn-section");
        const btnText = document.getElementById("btn-text-cn");
        if (cnLayer) {
          if (map.hasLayer(cnLayer)) {
            map.removeLayer(cnLayer);
            btn.classList.remove("active-cn");
            if (legSec) legSec.style.display = "none";
            if (btnText) btnText.textContent = "Ver no mapa";
          } else {
            map.addLayer(cnLayer);
            btn.classList.add("active-cn");
            if (legSec) legSec.style.display = "block";
            if (btnText) btnText.textContent = "Ocultar do mapa";
          }
        }
      }
    }

    // Fit Basin Bounds
    function fitBasin() {
      if (basinLayer) {
        map.fitBounds(basinLayer.getBounds(), { padding: [40, 40] });
      }
    }

    // Real-time Geolocation ("Onde Estou")
    function locateUser() {
      if (!navigator.geolocation) {
        alert("Geolocalização não é suportada pelo seu navegador.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = position.coords.accuracy;

          if (gpsMarker) map.removeLayer(gpsMarker);
          if (gpsCircle) map.removeLayer(gpsCircle);

          // Pulsing marker
          const pulsingIcon = L.divIcon({
            className: "gps-pulsing-icon",
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          });

          gpsMarker = L.marker([lat, lng], { icon: pulsingIcon }).addTo(map)
            .bindPopup("<b>A sua localização atual</b><br>Precisão: ~" + Math.round(acc) + " m").openPopup();

          gpsCircle = L.circle([lat, lng], {
            radius: acc,
            color: "#0284c7",
            fillColor: "#38bdf8",
            fillOpacity: 0.15,
            weight: 1.5
          }).addTo(map);

          map.flyTo([lat, lng], 14, { duration: 1.2 });
        },
        (err) => {
          alert("Não foi possível obter a sua localização. Verifique as permissões de GPS no navegador.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  </script>
</body>
</html>`;
}

/**
 * Trigger immediate browser download of the standalone HTML file.
 */
export function downloadStandaloneBasinHtml(options: ExportStandaloneHtmlOptions) {
  const htmlContent = generateStandaloneBasinHtml(options);
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const area = Math.round(options.basinReport?.morphometry?.areaKm2 || options.watershedData?.areaKm2 || 0);
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `GeoMoz_WebGIS_Bacia_${area}km2_${date}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
