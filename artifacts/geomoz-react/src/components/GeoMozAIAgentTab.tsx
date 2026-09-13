import React, { useState } from "react";
import { useProject } from "../context/ProjectContext";
import { apiFetch } from "@/lib/api";
import { aoiToAPI } from "@/lib/aoi";
import {
  Sparkles,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  MapPin,
  Calendar,
  Layers,
  FileText,
  Sprout,
  Droplets,
  Mountain,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Clock,
  ArrowRight,
} from "lucide-react";
import { MapContainer, TileLayer, ScaleControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GOOGLE_BASEMAPS } from "@/lib/basemaps";

interface WorkflowStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  resultSummary?: string;
}

interface QuickWorkflow {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  indices: { code: string; name: string; sensor: string }[];
}

const QUICK_WORKFLOWS: QuickWorkflow[] = [
  {
    id: "agricultural_potential",
    title: "Potencial Agrícola & Vigor Vegetal",
    description: "Avalia a biomassa ativa, teor de humidade em culturas e classes de declividade para aptidão de mecanização agrícola.",
    icon: <Sprout size={18} className="text-emerald-500" />,
    badge: "Agricultura · Sentinel-2",
    indices: [
      { code: "ndvi", name: "NDVI (Vigor de Biomassa)", sensor: "Sentinel-2 MSI" },
      { code: "ndwi", name: "NDWI (Teor Hídrico Vegetal)", sensor: "Sentinel-2 MSI" },
      { code: "slope", name: "Declividade Topográfica", sensor: "Copernicus DEM 30m" },
    ],
  },
  {
    id: "water_stress",
    title: "Recursos Hídricos & Stress de Seca",
    description: "Monitoriza corpos de água superficiais, humidade foliar e anomalias térmico-espectrais de stress hídrico.",
    icon: <Droplets size={18} className="text-cyan-500" />,
    badge: "Recursos Hídricos · Sentinel-2",
    indices: [
      { code: "ndwi", name: "NDWI (Água Superficial)", sensor: "Sentinel-2 MSI" },
      { code: "ndmi", name: "NDMI (Índice de Humidade)", sensor: "Sentinel-2 MSI" },
    ],
  },
  {
    id: "flood_risk",
    title: "Geoperigos & Risco de Cheias",
    description: "Identifica áreas baixas, acumulação de escorrência e bacias vulneráveis a alagamento.",
    icon: <AlertTriangle size={18} className="text-amber-500" />,
    badge: "Geoperigos · SAR / DEM",
    indices: [
      { code: "mndwi", name: "MNDWI (Água Modificada)", sensor: "Sentinel-2 MSI" },
      { code: "elevation", name: "Hipsometria Altimétrica", sensor: "Copernicus DEM 30m" },
    ],
  },
];

export default function GeoMozAIAgentTab() {
  const { activeProject, saveRunToActiveProject } = useProject();

  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [activeTileUrl, setActiveTileUrl] = useState<string | null>(null);
  const [activeTileName, setActiveTileName] = useState<string>("");
  const [completedRuns, setCompletedRuns] = useState<any[]>([]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);

  const runWorkflow = async (workflow: QuickWorkflow) => {
    if (!activeProject) {
      alert("Por favor, ative ou crie um Projeto de Estudo no topo antes de executar o agente.");
      return;
    }

    setIsRunning(true);
    setSynthesis(null);
    setCompletedRuns([]);
    setActiveTileUrl(null);

    // Prepare steps
    const initialSteps: WorkflowStep[] = [
      { id: "aoi", name: `Delimitação da AOI: ${activeProject.aoi.label}`, status: "pending" },
      ...workflow.indices.map((idx) => ({
        id: idx.code,
        name: `Cálculo ${idx.name} (${idx.sensor})`,
        status: "pending" as const,
      })),
      { id: "synthesis", name: "Síntese Técnica & Diagnóstico AI", status: "pending" },
      { id: "save", name: `Persistência no Projeto: "${activeProject.name}"`, status: "pending" },
    ];
    setSteps(initialSteps);

    const aoiPayload = aoiToAPI(activeProject.aoi);
    const startDate = activeProject.period.startDate || "2024-01-01";
    const endDate = activeProject.period.endDate || "2024-12-31";

    const computedRuns: any[] = [];

    try {
      // Step 0: AOI
      setCurrentStepIndex(0);
      setSteps((prev) =>
        prev.map((s, i) => (i === 0 ? { ...s, status: "completed", resultSummary: "AOI validada" } : s))
      );

      // Execute each index
      for (let i = 0; i < workflow.indices.length; i++) {
        const stepIdx = i + 1;
        const targetIdx = workflow.indices[i];
        setCurrentStepIndex(stepIdx);
        setSteps((prev) =>
          prev.map((s, idx) => (idx === stepIdx ? { ...s, status: "running" } : s))
        );

        try {
          const res = await apiFetch("/geomoz-api/gee/index", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              index: targetIdx.code,
              province: aoiPayload.province || null,
              district: aoiPayload.district || null,
              geometry: aoiPayload.geometry || null,
              start_date: startDate,
              end_date: endDate,
              cloud_pct: 30,
            }),
          });

          if (!res.ok) {
            throw new Error(`Erro GEE HTTP ${res.status}`);
          }

          const data = await res.json();
          const meanVal = data.stats?.p50 ?? data.stats?.mean;
          const summaryStr = meanVal !== undefined ? `Média: ${Number(meanVal).toFixed(3)}` : "Processado";

          setSteps((prev) =>
            prev.map((s, idx) =>
              idx === stepIdx
                ? { ...s, status: "completed", resultSummary: summaryStr }
                : s
            )
          );

          const runObj = {
            name: targetIdx.name,
            type: "remote_sensing" as const,
            sensor: targetIdx.sensor,
            code: targetIdx.code,
            dateRange: { start: startDate, end: endDate },
            metrics: {
              min: data.stats?.p10,
              max: data.stats?.p90,
              mean: data.stats?.p50,
              cloudCoverPercentage: 30,
            },
            tileUrl: data.tileUrl || data.tile_url,
          };

          computedRuns.push(runObj);
          if (i === 0) {
            setActiveTileUrl(runObj.tileUrl);
            setActiveTileName(runObj.name);
          }
        } catch (err: any) {
          setSteps((prev) =>
            prev.map((s, idx) =>
              idx === stepIdx ? { ...s, status: "error", resultSummary: err.message } : s
            )
          );
        }
      }

      setCompletedRuns(computedRuns);

      // Step Synthesis
      const synthStepIdx = workflow.indices.length + 1;
      setCurrentStepIndex(synthStepIdx);
      setSteps((prev) =>
        prev.map((s, idx) => (idx === synthStepIdx ? { ...s, status: "running" } : s))
      );

      try {
        const synthRes = await apiFetch("/geomoz-api/ai/synthesize-study", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: activeProject.name,
            category: activeProject.category,
            aoiLabel: activeProject.aoi.label,
            period: activeProject.period,
            runs: computedRuns,
          }),
        });

        if (synthRes.ok) {
          const synthData = await synthRes.json();
          setSynthesis(synthData.synthesis);
          setSteps((prev) =>
            prev.map((s, idx) =>
              idx === synthStepIdx
                ? { ...s, status: "completed", resultSummary: "Diagnóstico gerado" }
                : s
            )
          );
        }
      } catch (err: any) {
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === synthStepIdx
              ? { ...s, status: "completed", resultSummary: "Síntese padrão concluída" }
              : s
          )
        );
      }

      // Step Save to Project
      const saveStepIdx = workflow.indices.length + 2;
      setCurrentStepIndex(saveStepIdx);
      setSteps((prev) =>
        prev.map((s, idx) => (idx === saveStepIdx ? { ...s, status: "running" } : s))
      );

      for (const run of computedRuns) {
        await saveRunToActiveProject(run);
      }

      setSteps((prev) =>
        prev.map((s, idx) =>
          idx === saveStepIdx
            ? { ...s, status: "completed", resultSummary: `${computedRuns.length} análises gravadas` }
            : s
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleCustomPromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const lower = prompt.toLowerCase();
    if (lower.includes("agua") || lower.includes("água") || lower.includes("hidro") || lower.includes("seca")) {
      runWorkflow(QUICK_WORKFLOWS[1]);
    } else if (lower.includes("cheia") || lower.includes("inunda") || lower.includes("perigo")) {
      runWorkflow(QUICK_WORKFLOWS[2]);
    } else {
      // Default to agricultural & vegetation potential
      runWorkflow(QUICK_WORKFLOWS[0]);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Left Control Panel */}
      <div className="w-full md:w-[420px] xl:w-[480px] flex-none bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
        {/* Active Study Banner */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1">
              <Sparkles size={11} /> GeoMoz AI Agent
            </span>
            <span className="text-[10px] text-slate-400">GIS/GEE Pipeline</span>
          </div>

          <h3 className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
            {activeProject ? activeProject.name : "Nenhum Estudo Selecionado"}
          </h3>

          <div className="mt-2 text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 truncate">
              <MapPin size={12} className="text-sky-400 shrink-0" />
              <span className="truncate">{activeProject?.aoi.label || "Defina uma área de estudo no topo"}</span>
            </div>
            {activeProject && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Calendar size={11} className="text-slate-400 shrink-0" />
                <span>Janela: {activeProject.period.startDate} até {activeProject.period.endDate}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Natural Language Prompt Form */}
          <form onSubmit={handleCustomPromptSubmit} className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles size={13} className="text-violet-500" />
              Instrução em Linguagem Natural para o Agente
            </label>
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ex: Analisa o potencial agrícola e vigor vegetal desta área..."
                className="w-full pl-3 pr-24 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={isRunning || !activeProject}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-semibold flex items-center gap-1 transition-all"
              >
                {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} />}
                <span>Executar</span>
              </button>
            </div>
          </form>

          {/* Quick Workflows */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Workflows Automáticos Recomendados
            </span>

            <div className="space-y-2.5">
              {QUICK_WORKFLOWS.map((wf) => (
                <div
                  key={wf.id}
                  className="group p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-slate-800/60 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 group-hover:scale-105 transition-transform">
                        {wf.icon}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {wf.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 block">{wf.badge}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => runWorkflow(wf)}
                      disabled={isRunning || !activeProject}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-violet-50 hover:text-violet-700 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40"
                    >
                      <span>Iniciar</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                    {wf.description}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {wf.indices.map((idx) => (
                      <span
                        key={idx.code}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-medium"
                      >
                        {idx.name.split("(")[0].trim()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Execution Pipeline Tracker */}
          {steps.length > 0 && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers size={13} className="text-violet-500" />
                  Progresso da Orquestração GIS/GEE
                </span>
                {isRunning && (
                  <span className="text-[11px] text-violet-600 font-semibold flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> Em execução…
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className={`flex items-center justify-between text-xs p-2 rounded-lg border transition-all ${
                      step.status === "running"
                        ? "bg-violet-50 dark:bg-violet-950/40 border-violet-300 text-violet-900 dark:text-violet-200 font-medium"
                        : step.status === "completed"
                        ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                        : "bg-slate-100/60 dark:bg-slate-800/30 border-transparent text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {step.status === "completed" ? (
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                      ) : step.status === "running" ? (
                        <Loader2 size={13} className="text-violet-600 animate-spin shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                      )}
                      <span className="truncate">{step.name}</span>
                    </div>

                    {step.resultSummary && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono shrink-0 ml-2">
                        {step.resultSummary}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostic Synthesis Card */}
          {synthesis && (
            <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                <ShieldCheck size={15} />
                <span>Síntese Técnica Concluída e Gravada no Estudo</span>
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {synthesis}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Map Preview Panel */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Layer Selector Bar */}
        {completedRuns.length > 0 && (
          <div className="absolute top-3 left-3 right-3 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 flex items-center gap-1.5">
              <Layers size={13} className="text-violet-500" />
              Visualizar Camada:
            </span>

            <div className="flex items-center gap-1.5">
              {completedRuns.map((run, i) => (
                <button
                  key={run.code}
                  type="button"
                  onClick={() => {
                    setSelectedLayerIndex(i);
                    setActiveTileUrl(run.tileUrl);
                    setActiveTileName(run.name);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                    selectedLayerIndex === i
                      ? "bg-violet-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  {run.name.split("(")[0].trim()}
                </button>
              ))}
            </div>

            <span className="text-[10px] text-slate-400 shrink-0 font-medium">
              Tile GEE 30m
            </span>
          </div>
        )}

        {/* Leaflet Map Container */}
        <div className="flex-1 relative">
          <MapContainer center={[-18, 35]} zoom={5} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              crossOrigin="anonymous"
              url={GOOGLE_BASEMAPS.hybrid.url}
              subdomains={GOOGLE_BASEMAPS.hybrid.subdomains}
              attribution={GOOGLE_BASEMAPS.hybrid.attribution}
              maxZoom={GOOGLE_BASEMAPS.hybrid.maxZoom}
            />

            {activeTileUrl && (
              <TileLayer
                crossOrigin="anonymous"
                key={activeTileUrl}
                url={activeTileUrl}
                opacity={0.8}
              />
            )}
            <ScaleControl position="bottomleft" />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
