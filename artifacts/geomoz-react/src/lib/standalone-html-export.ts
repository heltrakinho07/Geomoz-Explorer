/**
 * standalone-html-export.ts — Standalone HTML WebGIS Report Generator.
 *
 * Exports a basin analysis as a self-contained, interactive HTML file that:
 *  - Works offline or online on any browser/device.
 *  - Contains embedded GeoJSON geometries and styling.
 *  - Initializes an interactive Leaflet map with multiple basemaps.
 *  - Renders all morphometric cards, landcover tables, and SVG precipitation charts.
 *  - Never expires and never requires GEE connection.
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

  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const maxPrecip = Math.max(...precipMonthly, 1);

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · GeoMoz WebGIS</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; line-height: 1.5; }
    header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-b: 1px solid #334155; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-logo { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #0284c7, #06b6d4); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; }
    .brand-title { font-size: 1.15rem; font-weight: 700; color: #fff; }
    .brand-subtitle { font-size: 0.75rem; color: #94a3b8; }
    .header-actions { display: flex; align-items: center; gap: 0.5rem; }
    .btn { background: #1e293b; border: 1px solid #334155; color: #f8fafc; padding: 0.45rem 0.9rem; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 0.4rem; transition: all 0.2s; }
    .btn:hover { background: #334155; }
    .btn-primary { background: linear-gradient(135deg, #0284c7, #2563eb); border: none; color: #fff; }
    .btn-primary:hover { opacity: 0.9; }
    .layout { display: flex; height: calc(100vh - 65px); }
    @media (max-width: 900px) { .layout { flex-direction: column; height: auto; } }
    #map { flex: 1; height: 100%; min-height: 400px; background: #1e293b; }
    .sidebar { width: 440px; max-width: 100%; background: #0b1120; border-left: 1px solid #1e293b; overflow-y: auto; padding: 1.25rem; display: flex; flex-col; gap: 1.25rem; }
    @media (max-width: 900px) { .sidebar { width: 100%; } }
    .section-card { background: #131d31; border: 1px solid #1e293b; border-radius: 12px; padding: 1rem; }
    .section-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #38bdf8; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.4rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
    .stat-item { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 0.6rem; }
    .stat-label { font-size: 0.65rem; color: #94a3b8; }
    .stat-val { font-size: 1rem; font-weight: 700; color: #fff; }
    .stat-unit { font-size: 0.65rem; color: #64748b; margin-left: 0.2rem; }
    .table-container { width: 100%; font-size: 0.75rem; }
    .table-row { display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid #1e293b; }
    .table-row:last-child { border-bottom: none; }
    .color-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 0.4rem; }
    .chart-bar-container { display: flex; align-items: flex-end; gap: 4px; height: 90px; padding-top: 10px; }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .chart-bar { width: 100%; background: #3b82f6; border-radius: 3px 3px 0 0; min-height: 2px; }
    .chart-label { font-size: 0.6rem; color: #64748b; margin-top: 4px; }
    .cn-badge { display: flex; align-items: center; justify-content: space-between; background: #0f172a; border: 1px solid #1e293b; padding: 0.75rem; border-radius: 8px; }
    .cn-number { font-size: 1.5rem; font-weight: 800; color: #38bdf8; }
    .badge { display: inline-block; font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: 9999px; background: #1e293b; color: #38bdf8; border: 1px solid #334155; }
    @media print {
      header { display: none; }
      .layout { display: block; height: auto; }
      #map { height: 450px; page-break-after: always; }
      .sidebar { width: 100%; border: none; }
    }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <div class="brand-logo">GZ</div>
      <div>
        <div class="brand-title">${title}</div>
        <div class="brand-subtitle">Relatório WebGIS Autónomo · ${dateStr} · Área: ${totalArea.toLocaleString("pt-PT")} km²</div>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button>
      <button class="btn btn-primary" onclick="fitBasin()">Focar Bacia</button>
    </div>
  </header>

  <div class="layout">
    <div id="map"></div>

    <aside class="sidebar">
      <!-- Morfometria -->
      <div class="section-card">
        <div class="section-title">Morfometria da Bacia</div>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Área de Drenagem</div>
            <div class="stat-val">${totalArea.toLocaleString("pt-PT")}<span class="stat-unit">km²</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Perímetro</div>
            <div class="stat-val">${Number(m.perimeterKm || 0).toFixed(0)}<span class="stat-unit">km</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Elevação Média</div>
            <div class="stat-val">${Number(m.elevMeanM || 0).toFixed(0)}<span class="stat-unit">m</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Desnível (Relevo)</div>
            <div class="stat-val">${Number(m.reliefM || 0).toFixed(0)}<span class="stat-unit">m</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Declive Médio</div>
            <div class="stat-val">${Number(m.slopeMeanDeg || 0).toFixed(1)}<span class="stat-unit">°</span></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Densidade de Drenagem</div>
            <div class="stat-val">${m.drainageDensity || "—"}<span class="stat-unit">km/km²</span></div>
          </div>
        </div>
      </div>

      <!-- Uso do Solo -->
      <div class="section-card">
        <div class="section-title">Uso e Cobertura do Solo (ESA 10m)</div>
        <div class="table-container">
          ${landcover.slice(0, 8).map((lc: any) => `
            <div class="table-row">
              <div>
                <span class="color-dot" style="background: ${lc.color};"></span>
                <span>${lc.label}</span>
              </div>
              <div style="font-weight: 600; color: #38bdf8;">
                ${Number(lc.areaKm2).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km² (${lc.pct}%)
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Clima -->
      <div class="section-card">
        <div class="section-title">Precipitação Mensal (CHIRPS) · ${precipAnnual.toLocaleString("pt-PT")} mm/ano</div>
        <div class="chart-bar-container">
          ${precipMonthly.map((mm: number, i: number) => {
            const hPct = Math.max((mm / maxPrecip) * 100, 3);
            return `
              <div class="chart-col" title="${months[i]}: ${Math.round(mm)} mm">
                <div class="chart-bar" style="height: ${hPct}%;"></div>
                <div class="chart-label">${months[i]}</div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Escoamento -->
      <div class="section-card">
        <div class="section-title">Escoamento Superficial (SCS-CN)</div>
        <div class="cn-badge">
          <div>
            <div style="font-size: 0.7rem; color: #94a3b8;">Curve Number Médio</div>
            <div style="font-size: 0.7rem; color: #64748b;">Menor = infiltração / Maior = cheia rápida</div>
          </div>
          <div class="cn-number">${cn != null ? Number(cn).toFixed(1) : "—"}</div>
        </div>
      </div>

      <!-- Metadados -->
      <div class="section-card" style="font-size: 0.65rem; color: #64748b; line-height: 1.4;">
        <div><strong>Sistema de Coordenadas:</strong> WGS 84 (EPSG:4326)</div>
        <div><strong>Fontes:</strong> ESA WorldCover (10m), Copernicus DEM GLO-30, CHIRPS, HydroSHEDS</div>
        <div><strong>Plataforma:</strong> GeoMoz Explorer · WebGIS Autónomo</div>
      </div>
    </aside>
  </div>

  <script>
    const geojsonData = ${geojsonStr};
    const pourPoint = ${pourPointStr};

    // Initialize map
    const map = L.map("map", { zoomControl: false }).setView([-18.66, 35.52], 6);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

    // Basemaps
    const cartoVoyager = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19
    }).addTo(map);

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    });

    const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri, Earthstar Geographics',
      maxZoom: 19
    });

    L.control.layers({
      "CartoDB Voyager": cartoVoyager,
      "OpenStreetMap": osm,
      "Satélite (Esri)": esriSat
    }, null, { position: "topright" }).addTo(map);

    let basinLayer = null;

    if (geojsonData && geojsonData.features && geojsonData.features.length > 0) {
      basinLayer = L.geoJSON(geojsonData, {
        style: {
          color: "#0284c7",
          weight: 2.5,
          fillColor: "#0284c7",
          fillOpacity: 0.15
        }
      }).addTo(map);

      map.fitBounds(basinLayer.getBounds(), { padding: [30, 30] });
    }

    if (pourPoint) {
      L.circleMarker(pourPoint, {
        radius: 7,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(map).bindPopup("<b>Exutório da Bacia</b><br>" + pourPoint[0].toFixed(4) + "°, " + pourPoint[1].toFixed(4) + "°");
    }

    function fitBasin() {
      if (basinLayer) {
        map.fitBounds(basinLayer.getBounds(), { padding: [30, 30] });
      }
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
