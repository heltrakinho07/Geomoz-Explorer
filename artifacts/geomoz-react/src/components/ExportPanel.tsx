import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Globe, Download, Loader2, CheckCircle2 } from "lucide-react";
import jsPDF from "jspdf";
import type { Stats } from "@/hooks/useGeoMoz";
import type { LayerState } from "./Sidebar";

interface ExportPanelProps {
  province: string | null;
  district: string | null;
  colorBy: string;
  layers: LayerState;
  mapCenter: [number, number];
  mapZoom: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}

function buildHtmlMap(
  province: string | null,
  district: string | null,
  colorBy: string,
  layers: LayerState,
  center: [number, number],
  zoom: number,
  provinceGeoJSON: GeoJSON.FeatureCollection | undefined,
  geologyGeoJSON: GeoJSON.FeatureCollection | undefined,
  districtGeoJSON: GeoJSON.FeatureCollection | undefined,
): string {
  const title = district ? `${district}, ${province}` : province ?? "Moçambique";
  const date = new Date().toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
  const activeLayersLabel = [
    layers.geology && "Geologia",
    layers.provinces && "Províncias",
    layers.districts && "Distritos",
  ].filter(Boolean).join(", ");

  const geologyScript = geologyGeoJSON
    ? `L.geoJSON(${JSON.stringify(geologyGeoJSON)},{style:function(f){return{color:'#fff',weight:.4,fillColor:(f.properties&&f.properties._color)||'#64748b',fillOpacity:.82};},onEachFeature:function(f,l){var p=f.properties||{};var h='';if(p.Legend)h+='<b>'+p.Legend+'</b><br>';if(p.code2006)h+='Code: '+p.code2006+'<br>';if(p.ERA)h+='Era: '+p.ERA+'<br>';if(p.PERIOD)h+='Período: '+p.PERIOD;if(h)l.bindTooltip(h,{sticky:true});}}).addTo(map);`
    : "";

  const provinceScript = provinceGeoJSON && layers.provinces
    ? `L.geoJSON(${JSON.stringify(provinceGeoJSON)},{style:{color:'#64748b',weight:1.5,fillColor:'#e2e8f0',fillOpacity:.15},onEachFeature:function(f,l){var p=f.properties||{};var n=p.Provincia||p.PROVINCIA||p.NAME_1||p.name||'';if(n)l.bindTooltip('<b>'+n+'</b>',{sticky:true});}}).addTo(map);`
    : "";

  const districtScript = districtGeoJSON && layers.districts && province
    ? `L.geoJSON(${JSON.stringify(districtGeoJSON)},{style:{color:'#94a3b8',weight:.8,fillOpacity:.05},onEachFeature:function(f,l){var p=f.properties||{};var n=p.Distrito||p.DISTRITO||p.NAME_2||p.name||'';if(n)l.bindTooltip(n,{sticky:true});}}).addTo(map);`
    : "";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GeoMoz Explorer — ${title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;height:100vh;background:#f8fafc}
header{background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;z-index:10}
.logo{width:28px;height:28px;border-radius:6px;background:#0ea5e9;display:flex;align-items:center;justify-content:center}
header h1{font-size:15px;font-weight:700;color:#0f172a}
.badge{background:#f0f9ff;border:1px solid #bae6fd;border-radius:4px;padding:2px 8px;font-size:12px;color:#0369a1}
.meta{margin-left:auto;font-size:11px;color:#94a3b8}
#wrap{position:relative;flex:1;display:flex;min-height:0}
#map{flex:1}
.north{position:absolute;top:70px;right:10px;z-index:1000;background:#fff;border-radius:50%;width:40px;height:40px;box-shadow:0 1px 5px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;border:1px solid #e2e8f0}
footer{background:#fff;border-top:1px solid #e2e8f0;padding:6px 16px;font-size:11px;color:#94a3b8;flex-shrink:0;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
</style>
</head>
<body>
<header>
  <div class="logo">
    <svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>
  </div>
  <h1>GeoMoz Explorer</h1>
  <span class="badge">${title}</span>
  <span class="meta">Exportado em ${date}</span>
</header>
<div id="wrap">
  <div id="map"></div>
  <div class="north" title="Norte geográfico">
    <svg viewBox="0 0 32 32" width="26" height="26">
      <polygon points="16,3 19,15 16,13 13,15" fill="#0ea5e9"/>
      <polygon points="16,29 19,17 16,19 13,17" fill="#94a3b8"/>
      <circle cx="16" cy="16" r="2" fill="#334155"/>
      <text x="16" y="10.5" text-anchor="middle" font-size="5" font-weight="bold" fill="#0ea5e9" font-family="system-ui">N</text>
    </svg>
  </div>
</div>
<footer>
  <span>GeoMoz Explorer · Dados: geomoz library</span>
  <span>Camadas: ${activeLayersLabel} · Colorir por: ${colorBy}</span>
</footer>
<script>
var map=L.map('map').setView([${center[0]},${center[1]}],${zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OSM &copy; CARTO',maxZoom:19,subdomains:'abcd'}).addTo(map);
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
${geologyScript}
${provinceScript}
${districtScript}
</script>
</body>
</html>`;
}

export default function ExportPanel({
  province, district, colorBy, layers, mapCenter, mapZoom,
}: ExportPanelProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"pdf" | "html" | null>(null);
  const [done, setDone] = useState<"pdf" | "html" | null>(null);

  const title = district ? `${district}, ${province}` : province ?? "Moçambique";
  const hasData = !!province;

  function flashDone(key: "pdf" | "html") {
    setDone(key);
    setTimeout(() => setDone(null), 2500);
  }

  function handleHtml() {
    setBusy("html");
    try {
      const provinceGeoJSON = qc.getQueryData<GeoJSON.FeatureCollection>(["provinces"]);
      const geologyGeoJSON = province
        ? qc.getQueryData<GeoJSON.FeatureCollection>(["geology", province, district, colorBy])
        : undefined;
      const districtGeoJSON = province
        ? qc.getQueryData<GeoJSON.FeatureCollection>(["districts", province])
        : undefined;

      const html = buildHtmlMap(
        province, district, colorBy, layers,
        mapCenter, mapZoom,
        provinceGeoJSON, geologyGeoJSON, districtGeoJSON,
      );
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `geomoz-${province ?? "mozambique"}-${district ?? "all"}.html`;
      a.click();
      URL.revokeObjectURL(url);
      flashDone("html");
    } finally {
      setBusy(null);
    }
  }

  function handlePdf() {
    setBusy("pdf");
    try {
      const stats = qc.getQueryData<Stats>(["stats", province, district]);
      const date = new Date().toLocaleDateString("pt-PT");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      // Header bar
      doc.setFillColor(14, 165, 233);
      doc.rect(0, 0, W, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(17);
      doc.setFont("helvetica", "bold");
      doc.text("GeoMoz Explorer", 14, 13);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Relatório Geológico — ${title}`, 14, 20);

      // Sub-header meta
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.text(`Exportado em ${date}  ·  Colorir por: ${colorBy}`, 14, 32);

      let y = 42;

      if (stats) {
        // Section title
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Resumo Estatístico", 14, y);
        y += 8;

        const cards = [
          { label: "Feições totais", value: stats.totalFeatures.toLocaleString() },
          { label: "Unidades geológicas", value: stats.totalUnits.toLocaleString() },
          { label: "Área total (km²)", value: stats.totalAreaKm2.toLocaleString("pt-PT", { maximumFractionDigits: 0 }) },
          { label: "Litologia dominante", value: stats.dominant },
        ];
        const cW = (W - 28 - 9) / 2;
        cards.forEach((card, i) => {
          const cx = 14 + (i % 2) * (cW + 3);
          const cy = y + Math.floor(i / 2) * 18;
          doc.setFillColor(248, 250, 252);
          doc.roundedRect(cx, cy, cW, 14, 2, 2, "F");
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(card.label, cx + 4, cy + 5.5);
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          const val = card.value.length > 32 ? card.value.slice(0, 30) + "…" : card.value;
          doc.text(val, cx + 4, cy + 11);
        });
        y += 44;

        // Lithology table
        if (stats.lithologies.length > 0) {
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text("Composição Litológica", 14, y);
          y += 8;

          // Header row
          doc.setFillColor(241, 245, 249);
          doc.rect(14, y, W - 28, 7, "F");
          doc.setTextColor(100, 116, 139);
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.text("Litologia", 18, y + 5);
          doc.text("Área km²", W - 60, y + 5, { align: "right" });
          doc.text("%", W - 14, y + 5, { align: "right" });
          y += 7;

          // Data rows
          doc.setFont("helvetica", "normal");
          stats.lithologies.forEach((item, i) => {
            if (y > H - 18) {
              doc.addPage();
              y = 20;
            }
            if (i % 2 === 0) {
              doc.setFillColor(250, 252, 255);
              doc.rect(14, y, W - 28, 7, "F");
            }
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(8.5);
            const name = item.name.length > 58 ? item.name.slice(0, 56) + "…" : item.name;
            doc.text(name, 18, y + 5);
            doc.setTextColor(100, 116, 139);
            doc.text(fmt(item.areaKm2), W - 60, y + 5, { align: "right" });
            doc.setTextColor(14, 165, 233);
            doc.setFont("helvetica", "bold");
            doc.text(`${item.percent}%`, W - 14, y + 5, { align: "right" });
            doc.setFont("helvetica", "normal");
            y += 7;
          });
        }
      } else {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(10);
        doc.text("Nenhum dado disponível. Selecione uma província no mapa.", 14, y);
      }

      // Footer
      doc.setFillColor(241, 245, 249);
      doc.rect(0, H - 10, W, 10, "F");
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("GeoMoz Explorer · Dados: geomoz library", 14, H - 3.5);
      doc.text(`Pág. 1 de ${doc.getNumberOfPages()}`, W - 14, H - 3.5, { align: "right" });

      doc.save(`geomoz-${province ?? "mozambique"}-${district ?? "all"}.pdf`);
      flashDone("pdf");
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Exportar Dados</h2>
        <p className="text-sm text-slate-500 mb-8">
          Exporte os dados e o mapa atual para os formatos disponíveis.
          {province
            ? <> Área seleccionada: <strong className="text-slate-700">{title}</strong>.</>
            : " Selecione uma província no mapa para activar todas as opções."}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* HTML Map */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center">
              <Globe className="text-sky-500" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Mapa HTML Interactivo</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ficheiro HTML autónomo com mapa Leaflet interactivo, camadas e tooltips.
                Abre no browser sem internet (excepto tiles de fundo).
              </p>
            </div>
            <button
              onClick={handleHtml}
              disabled={!!busy}
              className="mt-auto flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-sky-200"
            >
              {busy === "html" ? (
                <><Loader2 className="animate-spin w-4 h-4" /> A gerar…</>
              ) : done === "html" ? (
                <><CheckCircle2 className="w-4 h-4" /> Descarregado!</>
              ) : (
                <><Download size={15} /> Descarregar HTML</>
              )}
            </button>
          </div>

          {/* PDF Report */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
              <FileText className="text-rose-500" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Relatório PDF</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Relatório A4 com estatísticas, tabela completa de litologias e área (km²) para a área seleccionada.
              </p>
            </div>
            <button
              onClick={handlePdf}
              disabled={!!busy || !hasData}
              className="mt-auto flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-rose-200"
            >
              {busy === "pdf" ? (
                <><Loader2 className="animate-spin w-4 h-4" /> A gerar…</>
              ) : done === "pdf" ? (
                <><CheckCircle2 className="w-4 h-4" /> Descarregado!</>
              ) : (
                <><Download size={15} /> Descarregar PDF</>
              )}
            </button>
            {!hasData && (
              <p className="text-xs text-slate-400 -mt-2">Selecione uma província para activar</p>
            )}
          </div>

          {/* CSV */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Download className="text-emerald-500" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Tabela CSV</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tabela de litologias com área e percentagem em formato CSV, compatível com Excel e GIS.
              </p>
            </div>
            <button
              onClick={() => {
                const stats = qc.getQueryData<Stats>(["stats", province, district]);
                if (!stats) return;
                const rows = [
                  ["Litologia", "Área km²", "%"],
                  ...stats.lithologies.map((l) => [l.name, l.areaKm2.toFixed(0), l.percent]),
                ];
                const csv = rows.map((r) => r.join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `geomoz-${province ?? "mozambique"}-${district ?? "all"}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              disabled={!hasData || !qc.getQueryData(["stats", province, district])}
              className="mt-auto flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-200"
            >
              <Download size={15} /> Descarregar CSV
            </button>
            {!hasData && (
              <p className="text-xs text-slate-400 -mt-2">Selecione uma província para activar</p>
            )}
          </div>
        </div>

        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
          <strong>Nota:</strong> O mapa HTML exportado inclui os dados GeoJSON carregados actualmente.
          Se a geologia não foi carregada (nenhuma província seleccionada), o HTML incluirá apenas as fronteiras das províncias.
          Para incluir a geologia, selecione primeiro uma província no mapa.
        </div>
      </div>
    </div>
  );
}
