import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Globe,
  Download,
  Loader2,
  CheckCircle2,
  Info,
  Map,
  Image as ImageIcon,
  FolderArchive,
  FolderKanban,
  Layers,
  Calendar,
  MapPin,
  Sparkles,
  FileSpreadsheet,
  Satellite,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import jsPDF from "jspdf";
import type { Stats } from "@/hooks/useGeoMoz";
import type { LayerState } from "./Sidebar";
import { apiUrl, apiFetch } from "@/lib/api";
import { useProject } from "../context/ProjectContext";
import type { GeoMozProject, StudyRun } from "../types/project";
import { aoiToAPI } from "@/lib/aoi";

interface ExportPanelProps {
  province: string | null;
  district: string | null;
  colorBy: string;
  layers: LayerState;
  mapCenter: [number, number];
  mapZoom: number;
}

// ─── DOSSIÊ DO PROJETO: PDF INSTITUCIONAL ─────────────────────────────────────

function generateProjectStudyPdf(
  project: GeoMozProject,
  runs: StudyRun[],
  date: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  const FOOTER_H = 12;
  let pageNum = 1;

  function addFooter() {
    doc.setFillColor(241, 245, 249);
    doc.rect(0, H - FOOTER_H, W, FOOTER_H, "F");
    doc.setDrawColor(226, 232, 240);
    doc.line(0, H - FOOTER_H, W, H - FOOTER_H);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      `GeoMoz Explorer · Dossiê Técnico · Ref: GEOMOZ-ESTUDO-${project.id.slice(0, 8).toUpperCase()}`,
      MARGIN,
      H - 4
    );
    doc.text(date, W / 2, H - 4, { align: "center" });
    doc.text(`Pág. ${pageNum}`, W - MARGIN, H - 4, { align: "right" });
  }

  // Cover header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, W, 32, "F");
  doc.setFillColor(14, 165, 233); // sky-500
  doc.rect(0, 28, W, 4, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("GeoMoz Explorer", MARGIN, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(186, 230, 253);
  doc.text("Dossiê Técnico de Estudo Geoespacial", MARGIN, 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Ref: GEOMOZ-ESTUDO-${project.id.slice(0, 8).toUpperCase()}`, W - MARGIN, 13, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(186, 230, 253);
  doc.text(date, W - MARGIN, 20, { align: "right" });

  let y = 42;

  // 1. IDENTIFICAÇÃO DO ESTUDO
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
  doc.setFillColor(14, 165, 233);
  doc.rect(MARGIN, y, 3, 7, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("1. IDENTIFICAÇÃO DO PROJETO & ENQUADRAMENTO GEOGRÁFICO", MARGIN + 6, y + 5);
  y += 12;

  // Project details box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.rect(MARGIN, y, CONTENT_W, 26);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(project.name, MARGIN + 4, y + 6.5);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Domínio Temático: ${project.category.replace("_", " ").toUpperCase()}`,
    MARGIN + 4,
    y + 13
  );
  doc.text(`Área de Estudo (AOI): ${project.aoi.label}`, MARGIN + 4, y + 18.5);
  doc.text(
    `Período de Monitorização: ${project.period.startDate} até ${project.period.endDate}`,
    MARGIN + 4,
    y + 24
  );
  y += 34;

  // 2. QUADRO DE ANÁLISES & ESTATÍSTICAS ZONAIS
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
  doc.setFillColor(14, 165, 233);
  doc.rect(MARGIN, y, 3, 7, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(
    `2. QUADRO CONSOLIDADO DE EXECUÇÕES (${runs.length} ANÁLISES COMPUTADAS)`,
    MARGIN + 6,
    y + 5
  );
  y += 12;

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(MARGIN, y, CONTENT_W, 6, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("ÍNDICE / ANÁLISE", MARGIN + 3, y + 4.2);
  doc.text("SENSOR / SATÉLITE", MARGIN + 65, y + 4.2);
  doc.text("INTERVALO", MARGIN + 115, y + 4.2);
  doc.text("MÉDIA", MARGIN + 155, y + 4.2);
  doc.text("MIN / MAX", W - MARGIN - 3, y + 4.2, { align: "right" });
  y += 7;

  // Table rows
  if (runs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Sem execuções quantitativas gravadas.", MARGIN + 3, y + 5);
    y += 10;
  } else {
    runs.forEach((r, idx) => {
      if (y > H - 35) {
        addFooter();
        doc.addPage();
        pageNum++;
        y = 20;
      }
      const bg = idx % 2 === 0 ? 255 : 250;
      doc.setFillColor(bg, bg, bg);
      doc.rect(MARGIN, y, CONTENT_W, 6, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);

      const nameTrunc = r.name.length > 34 ? r.name.slice(0, 32) + "…" : r.name;
      doc.text(nameTrunc, MARGIN + 3, y + 4.2);
      doc.text(r.sensor || "Sentinel-2", MARGIN + 65, y + 4.2);
      doc.text(
        `${r.dateRange.start.slice(0, 7)}~${r.dateRange.end.slice(0, 7)}`,
        MARGIN + 115,
        y + 4.2
      );

      const meanStr =
        r.metrics?.mean !== undefined ? Number(r.metrics.mean).toFixed(3) : "—";
      doc.setFont("helvetica", "bold");
      doc.text(meanStr, MARGIN + 155, y + 4.2);
      doc.setFont("helvetica", "normal");

      const minMaxStr =
        r.metrics?.min !== undefined && r.metrics?.max !== undefined
          ? `${Number(r.metrics.min).toFixed(2)} / ${Number(r.metrics.max).toFixed(2)}`
          : "—";
      doc.text(minMaxStr, W - MARGIN - 3, y + 4.2, { align: "right" });
      y += 6.5;
    });
  }

  y += 8;

  // 3. PARECER & SÍNTESE METODOLÓGICA
  if (y > H - 50) {
    addFooter();
    doc.addPage();
    pageNum++;
    y = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
  doc.setFillColor(14, 165, 233);
  doc.rect(MARGIN, y, 3, 7, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("3. NOTAS METODOLÓGICAS & CONCLUSÃO TÉCNICA", MARGIN + 6, y + 5);
  y += 12;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const notesText =
    project.description ||
    "Os indicadores espectrais e topográficos foram computados com dados do programa espacial Copernicus (constelação Sentinel-2 MSI e modelo de elevação GLO-30m) integrados via Google Earth Engine. A metodologia aplicada garante repetibilidade e consistência estatística zonal para monitorização territorial.";

  const splitNotes = doc.splitTextToSize(notesText, CONTENT_W - 8);
  doc.text(splitNotes, MARGIN + 4, y);

  addFooter();
  return doc;
}

// ─── DOSSIÊ DO PROJETO: HTML AUTÓNOMO INTERATIVO ─────────────────────────────

function buildProjectHtml(project: GeoMozProject, runs: StudyRun[]): string {
  const date = new Date().toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const rows = runs
    .map(
      (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${r.name}</strong></td>
      <td>${r.sensor}</td>
      <td>${r.dateRange.start} até ${r.dateRange.end}</td>
      <td><span class="badge">${r.metrics?.mean !== undefined ? Number(r.metrics.mean).toFixed(3) : "—"}</span></td>
      <td>${r.metrics?.min !== undefined ? Number(r.metrics.min).toFixed(3) : "—"}</td>
      <td>${r.metrics?.max !== undefined ? Number(r.metrics.max).toFixed(3) : "—"}</td>
    </tr>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <title>Dossiê do Estudo — ${project.name} | GeoMoz Explorer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.5; }
    header { background: #0f172a; color: #fff; padding: 24px; border-bottom: 4px solid #0ea5e9; }
    .header-content { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .title { font-size: 20px; font-weight: bold; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .container { max-width: 1100px; margin: 30px auto; padding: 0 20px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .card h2 { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 16px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .meta-item label { display: block; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; }
    .meta-item value { display: block; font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; color: #475569; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge { background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; font-weight: bold; }
    footer { text-align: center; padding: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <div>
        <div class="title">GeoMoz Explorer · Dossiê Técnico do Estudo</div>
        <div class="subtitle">Ref: GEOMOZ-ESTUDO-${project.id.slice(0, 8).toUpperCase()} · Emitido em ${date}</div>
      </div>
      <div>
        <span style="background:#0284c7;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:bold;">
          ${project.category.toUpperCase()}
        </span>
      </div>
    </div>
  </header>
  <div class="container">
    <div class="card">
      <h2>1. Identificação do Projeto</h2>
      <div class="meta-grid">
        <div class="meta-item"><label>Nome do Projeto</label><value>${project.name}</value></div>
        <div class="meta-item"><label>Área de Estudo (AOI)</label><value>${project.aoi.label}</value></div>
        <div class="meta-item"><label>Período Temporal</label><value>${project.period.startDate} até ${project.period.endDate}</value></div>
        <div class="meta-item"><label>Total de Análises</label><value>${runs.length} execuções persistidas</value></div>
      </div>
      ${project.description ? `<p style="font-size:13px;color:#475569;margin-top:10px;background:#f8fafc;padding:12px;border-radius:8px;">${project.description}</p>` : ""}
    </div>

    <div class="card">
      <h2>2. Quadro de Indicadores & Estatísticas Zonais</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Indicador Espectral</th>
            <th>Sensor / Satélite</th>
            <th>Período Temporal</th>
            <th>Média Zonal</th>
            <th>P10 (Min)</th>
            <th>P90 (Max)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Nenhuma análise guardada neste projeto de estudo.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>3. Metodologia & Rastreabilidade Científica</h2>
      <p style="font-size:13px;color:#475569;line-height:1.6;">
        Este estudo foi estruturado sobre a infraestrutura em nuvem do GeoMoz Explorer, integrando coleções de reflectância de superfície Copernicus Sentinel-2 MSI (L2A) e o modelo altimétrico digital Copernicus GLO-30m processados no Google Earth Engine. A integridade dos dados é validada por recorte vetorial exato da Área de Interesse (AOI).
      </p>
    </div>
  </div>
  <footer>
    GeoMoz Explorer · Plataforma de Estudos Geoespaciais de Moçambique · Relatório Autónomo Standalone
  </footer>
</body>
</html>`;
}

// ─── COMPONENTE PRINCIPAL DE EXPORTAÇÃO ────────────────────────────────────────

export default function ExportPanel({
  province,
  district,
  colorBy,
  layers,
  mapCenter,
  mapZoom,
}: ExportPanelProps) {
  const { activeProject, activeRuns } = useProject();

  const [activeTab, setActiveTab] = useState<"dossier" | "general">("dossier");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedGeoTiffRun, setSelectedGeoTiffRun] = useState<string>("");

  function flash(k: string) {
    setDone(k);
    setTimeout(() => setDone(null), 3000);
  }

  // 1. Export PDF Dossier
  const handleExportProjectPdf = () => {
    if (!activeProject) return;
    setBusy("project-pdf");
    try {
      const date = new Date().toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const doc = generateProjectStudyPdf(activeProject, activeRuns, date);
      doc.save(`GeoMoz_Dossie_${activeProject.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
      flash("project-pdf");
    } catch (e: any) {
      setExportError(e.message || "Erro ao gerar PDF.");
    } finally {
      setBusy(null);
    }
  };

  // 2. Export HTML Dossier
  const handleExportProjectHtml = () => {
    if (!activeProject) return;
    setBusy("project-html");
    try {
      const html = buildProjectHtml(activeProject, activeRuns);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Dossie_${activeProject.name.replace(/\s+/g, "_")}.html`;
      a.click();
      URL.revokeObjectURL(url);
      flash("project-html");
    } finally {
      setBusy(null);
    }
  };

  // 3. Export CSV Metrics
  const handleExportProjectCsv = () => {
    if (!activeProject) return;
    setBusy("project-csv");
    try {
      const rows = [
        [
          "Projeto",
          "Categoria",
          "AOI",
          "Analise",
          "Sensor",
          "Codigo",
          "DataInicio",
          "DataFim",
          "Media",
          "Min",
          "Max",
          "Nuvens_Pct",
          "DataExecucao",
        ],
        ...activeRuns.map((r) => [
          `"${activeProject.name}"`,
          `"${activeProject.category}"`,
          `"${activeProject.aoi.label}"`,
          `"${r.name}"`,
          `"${r.sensor}"`,
          `"${r.code}"`,
          r.dateRange.start,
          r.dateRange.end,
          r.metrics?.mean !== undefined ? Number(r.metrics.mean).toFixed(4) : "",
          r.metrics?.min !== undefined ? Number(r.metrics.min).toFixed(4) : "",
          r.metrics?.max !== undefined ? Number(r.metrics.max).toFixed(4) : "",
          r.metrics?.cloudCoverPercentage ?? "",
          r.createdAt,
        ]),
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_Metricas_${activeProject.name.replace(/\s+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash("project-csv");
    } finally {
      setBusy(null);
    }
  };

  // 4. Export GeoJSON Study Boundary & Runs
  const handleExportProjectGeoJSON = () => {
    if (!activeProject) return;
    setBusy("project-geojson");
    try {
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: (activeProject.aoi.geometry as any) || {
              type: "Point",
              coordinates: [35.0, -18.0],
            },
            properties: {
              projectId: activeProject.id,
              name: activeProject.name,
              category: activeProject.category,
              aoiLabel: activeProject.aoi.label,
              period: activeProject.period,
              runsCount: activeRuns.length,
              runs: activeRuns.map((r) => ({
                code: r.code,
                name: r.name,
                mean: r.metrics?.mean,
              })),
            },
          },
        ],
      };

      const blob = new Blob([JSON.stringify(fc, null, 2)], {
        type: "application/geo+json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GeoMoz_AOI_${activeProject.name.replace(/\s+/g, "_")}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      flash("project-geojson");
    } finally {
      setBusy(null);
    }
  };

  // 5. Download GeoTIFF directly from GEE
  const handleDownloadGeoTIFF = async () => {
    if (!activeProject || activeRuns.length === 0) return;
    const run = activeRuns.find((r) => r.code === selectedGeoTiffRun) || activeRuns[0];
    if (!run) return;

    setBusy("project-geotiff");
    setExportError(null);
    try {
      const aoiPayload = aoiToAPI(activeProject.aoi);
      const res = await apiFetch("/geomoz-api/gee/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: run.code,
          province: aoiPayload.province || null,
          district: aoiPayload.district || null,
          geometry: aoiPayload.geometry || null,
          start_date: run.dateRange.start,
          end_date: run.dateRange.end,
          cloud_pct: run.metrics?.cloudCoverPercentage || 30,
          scale: 30,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Falha ao gerar GeoTIFF no GEE.");
      }

      const data = await res.json();
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
        flash("project-geotiff");
      }
    } catch (err: any) {
      setExportError(err.message || "Erro ao solicitar GeoTIFF.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderKanban size={20} className="text-sky-500" />
              Dossiê Técnico & Exportações Profissionais
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Consolide todos os dados e análises num relatório técnico oficial com formatos abertos e rastreabilidade científica.
            </p>
          </div>
        </div>

        {/* Active Study Banner */}
        {activeProject ? (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 shadow-lg border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1.5">
                <Sparkles size={11} /> Estudo Ativo
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Ref: GEOMOZ-ESTUDO-{activeProject.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mb-2">{activeProject.name}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300 pt-3 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-sky-400 shrink-0" />
                <span className="truncate">{activeProject.aoi.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-sky-400 shrink-0" />
                <span>{activeProject.period.startDate} até {activeProject.period.endDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-sky-400 shrink-0" />
                <span>{activeRuns.length} análises computadas</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2 bg-white dark:bg-slate-800">
            <FolderKanban size={32} className="mx-auto text-slate-400" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhum Estudo Selecionado
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Abra o seletor de projetos no topo da página para ativar ou criar um estudo e gerar o dossiê consolidado.
            </p>
          </div>
        )}

        {exportError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
            {exportError}
          </div>
        )}

        {/* Consolidated Runs Table */}
        {activeProject && (
          <div className="mb-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers size={14} className="text-sky-500" />
                Quadro de Execuções e Métricas do Estudo ({activeRuns.length})
              </h3>
              {activeRuns.length > 0 && (
                <span className="text-[11px] text-slate-400">Copernicus Sentinel-2 & DEM 30m</span>
              )}
            </div>

            {activeRuns.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                Ainda não foram guardadas análises para este projeto. Utilize os módulos <strong>GeoAnálises</strong> ou <strong>GeoMoz AI</strong> e clique em <em>"Guardar no Estudo"</em>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 text-[11px]">
                      <th className="pb-2 font-medium">Índice / Análise</th>
                      <th className="pb-2 font-medium">Sensor</th>
                      <th className="pb-2 font-medium">Período</th>
                      <th className="pb-2 font-medium">Média Zonal</th>
                      <th className="pb-2 font-medium">Min / Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {activeRuns.map((r) => (
                      <tr key={r.id} className="text-slate-800 dark:text-slate-200">
                        <td className="py-2.5 font-semibold pr-2">{r.name}</td>
                        <td className="py-2.5 text-slate-500 pr-2">{r.sensor}</td>
                        <td className="py-2.5 text-slate-500 pr-2">
                          {r.dateRange.start} ~ {r.dateRange.end}
                        </td>
                        <td className="py-2.5 pr-2">
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold font-mono">
                            {r.metrics?.mean !== undefined ? Number(r.metrics.mean).toFixed(3) : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono">
                          {r.metrics?.min !== undefined && r.metrics?.max !== undefined
                            ? `${Number(r.metrics.min).toFixed(2)} / ${Number(r.metrics.max).toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Export Formats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: PDF Dossier */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:border-sky-300 transition-all">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Dossiê Técnico em PDF Institucional
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Relatório A4 formal com cabeçalho institucional, enquadramento geográfico, tabela analítica de métricas zonais e notas metodológicas.
              </p>
            </div>
            <button
              onClick={handleExportProjectPdf}
              disabled={!activeProject || busy === "project-pdf"}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {busy === "project-pdf" ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> A gerar PDF…
                </>
              ) : done === "project-pdf" ? (
                <>
                  <CheckCircle2 size={14} /> PDF Descarregado!
                </>
              ) : (
                <>
                  <Download size={14} /> Descarregar Dossiê PDF
                </>
              )}
            </button>
          </div>

          {/* Card 2: Interactive HTML Report */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:border-sky-300 transition-all">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <Globe size={20} />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Dossiê Interativo HTML Autónomo
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Arquivo HTML único navegável que abre diretamente no browser sem internet, contendo metadados, tabela responsiva e rastreabilidade.
              </p>
            </div>
            <button
              onClick={handleExportProjectHtml}
              disabled={!activeProject || busy === "project-html"}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {busy === "project-html" ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> A gerar HTML…
                </>
              ) : done === "project-html" ? (
                <>
                  <CheckCircle2 size={14} /> HTML Descarregado!
                </>
              ) : (
                <>
                  <Download size={14} /> Descarregar Relatório HTML
                </>
              )}
            </button>
          </div>

          {/* Card 3: CSV Spreadsheet */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:border-sky-300 transition-all">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <FileSpreadsheet size={20} />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Planilha de Métricas Zonais (CSV)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Dados estruturados de todas as análises computadas com médias, desvio padrão, percentis e datas para análise estatística em Excel ou R.
              </p>
            </div>
            <button
              onClick={handleExportProjectCsv}
              disabled={!activeProject || busy === "project-csv"}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {busy === "project-csv" ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> A exportar CSV…
                </>
              ) : done === "project-csv" ? (
                <>
                  <CheckCircle2 size={14} /> CSV Descarregado!
                </>
              ) : (
                <>
                  <Download size={14} /> Descarregar Métricas CSV
                </>
              )}
            </button>
          </div>

          {/* Card 4: SIG GeoPackage / GeoJSON */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:border-sky-300 transition-all">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Map size={20} />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Camada Vetorial SIG (GeoJSON)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Delimitação geográfica da AOI com tabela de atributos de todas as execuções do estudo, pronto para abrir no QGIS ou ArcGIS Pro.
              </p>
            </div>
            <button
              onClick={handleExportProjectGeoJSON}
              disabled={!activeProject || busy === "project-geojson"}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {busy === "project-geojson" ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> A exportar…
                </>
              ) : done === "project-geojson" ? (
                <>
                  <CheckCircle2 size={14} /> GeoJSON Descarregado!
                </>
              ) : (
                <>
                  <Download size={14} /> Descarregar Camada SIG
                </>
              )}
            </button>
          </div>

          {/* Card 5: GeoTIFF 30m Full Raster */}
          <div className="md:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-xs hover:border-sky-300 transition-all">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                  <Satellite size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Exportação de Raster GeoTIFF (30m) via Google Earth Engine
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gera e transfere diretamente o raster geoespacial multiespectral recortado pela AOI.
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-auto flex items-center gap-2">
                {activeRuns.length > 0 ? (
                  <select
                    value={selectedGeoTiffRun || (activeRuns[0]?.code ?? "")}
                    onChange={(e) => setSelectedGeoTiffRun(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    {activeRuns.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400">Sem análises para exportar</span>
                )}

                <button
                  type="button"
                  onClick={handleDownloadGeoTIFF}
                  disabled={!activeProject || activeRuns.length === 0 || busy === "project-geotiff"}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
                >
                  {busy === "project-geotiff" ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>A gerar no GEE…</span>
                    </>
                  ) : done === "project-geotiff" ? (
                    <>
                      <CheckCircle2 size={13} />
                      <span>Transferido</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>Baixar GeoTIFF</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
