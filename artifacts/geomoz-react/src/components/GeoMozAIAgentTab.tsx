import React, { useState, useRef, useEffect } from "react";
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
  ShieldCheck,
  KeyRound,
  Check,
  X,
  BrainCircuit,
  Download,
  Trash2,
  Sliders,
  Send,
  HelpCircle,
  TrendingUp,
  Cpu,
  Flame,
} from "lucide-react";
import { MapContainer, TileLayer, ScaleControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GOOGLE_BASEMAPS } from "@/lib/basemaps";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface WorkflowStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  resultSummary?: string;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  steps?: WorkflowStep[];
  runs?: any[];
  model?: string;
  provider?: string;
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
    description: "Avalia biomassa ativa, humidade em culturas e classes de declividade para aptidão agrícola.",
    icon: <Sprout size={16} className="text-emerald-500" />,
    badge: "Agricultura · Sentinel-2",
    indices: [
      { code: "ndvi", name: "NDVI (Vigor de Biomassa)", sensor: "Sentinel-2 MSI" },
      { code: "ndwi", name: "NDWI (Teor Hídrico Vegetal)", sensor: "Sentinel-2 MSI" },
      { code: "slope", name: "Declividade Topográfica", sensor: "Copernicus DEM 30m" },
    ],
  },
  {
    id: "water_stress_smap",
    title: "Humidade do Solo & Seca (NASA SMAP)",
    description: "Mapeia a humidade na zona radicular (0-100cm) e à superfície via NASA-USDA SMAP 9km.",
    icon: <Droplets size={16} className="text-cyan-500" />,
    badge: "NASA SMAP · Radar Radiometer",
    indices: [
      { code: "smap_rootzone", name: "Humidade Radicular SMAP", sensor: "NASA SMAP 9km" },
      { code: "ndmi", name: "NDMI (Teor de Humidade)", sensor: "Sentinel-2 MSI" },
    ],
  },
  {
    id: "flood_risk",
    title: "Geoperigos & Risco de Cheias",
    description: "Identifica áreas de planície baixa, acumulação de fluxo e bacias com suscetibilidade a alagamento.",
    icon: <AlertTriangle size={16} className="text-amber-500" />,
    badge: "Geoperigos · DEM / Altimetria",
    indices: [
      { code: "mndwi", name: "MNDWI (Água Modificada)", sensor: "Sentinel-2 MSI" },
      { code: "elevation", name: "Hipsometria Altimétrica", sensor: "Copernicus DEM 30m" },
    ],
  },
  {
    id: "rusle_erosion",
    title: "Erosão Hídrica do Solo (RUSLE)",
    description: "Calcula a perda de solo (t/ha/ano) cruzando relevo DEM, chuva CHIRPS e cobertura vegetal.",
    icon: <Mountain size={16} className="text-orange-500" />,
    badge: "Solo · RUSLE / CHIRPS",
    indices: [
      { code: "erosion_rusle", name: "Perda de Solo RUSLE", sensor: "Modelo RUSLE" },
      { code: "slope", name: "Declividade Topográfica", sensor: "Copernicus DEM 30m" },
    ],
  },
  {
    id: "mineral_exploration",
    title: "Prospeção Mineral & Hidrotermal",
    description: "Mapeia anomalias de argilas, óxidos de ferro e halos de alteração hidrotermal via Landsat 8 / Sentinel-2.",
    icon: <Mountain size={16} className="text-amber-600" />,
    badge: "Geologia · Landsat 8 L2",
    indices: [
      { code: "clay_l8", name: "Argilas e Al-OH (B6/B7)", sensor: "Landsat 8 L2" },
      { code: "fe_oxide_l8", name: "Óxidos de Ferro (B4/B2)", sensor: "Landsat 8 L2" },
      { code: "hydrothermal_l8", name: "Alteração Hidrotermal Sabins", sensor: "Landsat 8 L2" },
    ],
  },
  {
    id: "alphaearth_foundation",
    title: "Anomalias de Superfície (AlphaEarth)",
    description: "Aplica os embeddings de 64 dimensões do modelo fundacional do Google DeepMind reduzidos para RGB.",
    icon: <Sparkles size={16} className="text-indigo-500" />,
    badge: "AlphaEarth · DeepMind",
    indices: [
      { code: "alphaearth_pca", name: "AlphaEarth 64-d PCA", sensor: "DeepMind Satellite Embedding" },
      { code: "slope", name: "Declividade Topográfica", sensor: "Copernicus DEM 30m" },
    ],
  },
];

const SUGGESTED_PROMPTS = [
  "Avaliar o stress hídrico e humidade do solo NASA SMAP",
  "Identificar anomalias de alteração hidrotermal Landsat 8 para ouro",
  "Mapear setores com risco de erosão hídrica do solo RUSLE",
  "Detetar falhas, fraturas e lineamentos estruturais no relevo",
  "Delimitar zonas baixas e planícies com suscetibilidade a cheias",
];

export default function GeoMozAIAgentTab() {
  const { activeProject, saveRunToActiveProject } = useProject();

  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [activeTileUrl, setActiveTileUrl] = useState<string | null>(null);
  const [activeTileName, setActiveTileName] = useState<string>("");
  const [completedRuns, setCompletedRuns] = useState<any[]>([]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [layerOpacity, setLayerOpacity] = useState<number>(0.85);

  // Chat conversation history
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // OpenAI & Gemini API configuration
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("geomoz_openai_api_key") || "";
    } catch {
      return "";
    }
  });

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("geomoz_gemini_api_key") || "";
    } catch {
      return "";
    }
  });

  const [provider, setProvider] = useState<string>(() => {
    try {
      return localStorage.getItem("geomoz_agent_provider") || "auto";
    } catch {
      return "auto";
    }
  });

  const [model, setModel] = useState<string>(() => {
    try {
      return localStorage.getItem("geomoz_agent_model") || "gpt-4o";
    } catch {
      return "gpt-4o";
    }
  });

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [tempOpenaiKey, setTempOpenaiKey] = useState<string>(openaiApiKey);
  const [tempGeminiKey, setTempGeminiKey] = useState<string>(geminiApiKey);
  const [tempProvider, setTempProvider] = useState<string>(provider);
  const [tempModel, setTempModel] = useState<string>(model);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, steps, isRunning]);

  const handleSaveConfig = () => {
    const oKey = tempOpenaiKey.trim();
    const gKey = tempGeminiKey.trim();
    setOpenaiApiKey(oKey);
    setGeminiApiKey(gKey);
    setProvider(tempProvider);
    setModel(tempModel);

    try {
      if (oKey) localStorage.setItem("geomoz_openai_api_key", oKey);
      else localStorage.removeItem("geomoz_openai_api_key");

      if (gKey) localStorage.setItem("geomoz_gemini_api_key", gKey);
      else localStorage.removeItem("geomoz_gemini_api_key");

      localStorage.setItem("geomoz_agent_provider", tempProvider);
      localStorage.setItem("geomoz_agent_model", tempModel);
    } catch {}

    setShowConfigModal(false);
  };

  const activeProviderLabel = (() => {
    if (provider === "openai" || (provider === "auto" && openaiApiKey.trim())) {
      return `OpenAI (${model || "GPT-4o"})`;
    }
    if (provider === "gemini" || (provider === "auto" && geminiApiKey.trim())) {
      return "Google Gemini (2.0 Flash)";
    }
    return "Heurístico Spatial (Offline)";
  })();

  const isAIActive = Boolean(openaiApiKey.trim() || geminiApiKey.trim());

  // Execute quick predefined workflow
  const runWorkflow = async (workflow: QuickWorkflow) => {
    const aoiLabel = activeProject?.aoi?.label || "Moçambique (Geral)";
    setIsRunning(true);
    setSynthesis(null);
    setCompletedRuns([]);
    setActiveTileUrl(null);

    const initialSteps: WorkflowStep[] = [
      { id: "aoi", name: `Delimitação da AOI: ${aoiLabel}`, status: "pending" },
      ...workflow.indices.map((idx) => ({
        id: idx.code,
        name: `Cálculo ${idx.name} (${idx.sensor})`,
        status: "pending" as const,
      })),
      { id: "synthesis", name: "Síntese Técnica & Diagnóstico AI", status: "pending" },
      { id: "save", name: `Persistência dos Resultados`, status: "pending" },
    ];
    setSteps(initialSteps);

    const aoiPayload = activeProject ? aoiToAPI(activeProject.aoi) : { province: null, district: null, geometry: null };
    const startDate = activeProject?.period?.startDate || "2024-01-01";
    const endDate = activeProject?.period?.endDate || "2024-12-31";

    const computedRuns: any[] = [];

    try {
      setSteps((prev) =>
        prev.map((s, i) => (i === 0 ? { ...s, status: "completed", resultSummary: "AOI validada" } : s))
      );

      for (let i = 0; i < workflow.indices.length; i++) {
        const stepIdx = i + 1;
        const targetIdx = workflow.indices[i];
        setSteps((prev) =>
          prev.map((s, idx) => (idx === stepIdx ? { ...s, status: "running" } : s))
        );

        try {
          let res: Response;
          if (targetIdx.code === "alphaearth_pca") {
            res = await apiFetch("/geomoz-api/gee/embedding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                year: Number(endDate.slice(0, 4)) || 2024,
                province: aoiPayload.province || null,
                district: aoiPayload.district || null,
                geometry: aoiPayload.geometry || null,
              }),
            });
          } else if (targetIdx.code === "smap_rootzone") {
            res = await apiFetch("/geomoz-api/gee/soil-moisture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                depth: "rootzone",
                start_date: startDate,
                end_date: endDate,
                province: aoiPayload.province || null,
                district: aoiPayload.district || null,
                geometry: aoiPayload.geometry || null,
              }),
            });
          } else if (targetIdx.code === "erosion_rusle") {
            res = await apiFetch("/geomoz-api/gee/erosion", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                year: Number(endDate.slice(0, 4)) || 2023,
                province: aoiPayload.province || null,
                district: aoiPayload.district || null,
                geometry: aoiPayload.geometry || null,
              }),
            });
          } else {
            res = await apiFetch("/geomoz-api/gee/index", {
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
          }

          if (!res.ok) throw new Error(`Erro GEE HTTP ${res.status}`);

          const data = await res.json();
          const meanVal = data.stats?.p50 ?? data.stats?.mean ?? data.stats?.meanSoilLossTha;
          const summaryStr = meanVal !== undefined ? `Média: ${Number(meanVal).toFixed(3)}` : "Processado";

          setSteps((prev) =>
            prev.map((s, idx) =>
              idx === stepIdx ? { ...s, status: "completed", resultSummary: summaryStr } : s
            )
          );

          const runObj = {
            name: targetIdx.name,
            type: "remote_sensing" as const,
            sensor: targetIdx.sensor,
            code: targetIdx.code,
            dateRange: { start: startDate, end: endDate },
            metrics: {
              min: data.stats?.p10 ?? data.stats?.min,
              max: data.stats?.p90 ?? data.stats?.max,
              mean: data.stats?.p50 ?? data.stats?.mean,
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

      // Synthesis step
      const synthStepIdx = workflow.indices.length + 1;
      setSteps((prev) =>
        prev.map((s, idx) => (idx === synthStepIdx ? { ...s, status: "running" } : s))
      );

      let finalDiag = `Diagnóstico executivo de ${workflow.title} concluído para ${aoiLabel}.`;
      try {
        const synthRes = await apiFetch("/geomoz-api/ai/synthesize-study", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: activeProject?.name || workflow.title,
            category: activeProject?.category || "estudo_geral",
            aoiLabel,
            period: activeProject?.period || { startDate, endDate },
            runs: computedRuns,
          }),
        });
        if (synthRes.ok) {
          const synthData = await synthRes.json();
          finalDiag = synthData.synthesis || finalDiag;
        }
      } catch {}

      setSynthesis(finalDiag);
      setSteps((prev) =>
        prev.map((s, idx) =>
          idx === synthStepIdx ? { ...s, status: "completed", resultSummary: "Diagnóstico gerado" } : s
        )
      );

      // Save to project if active
      if (activeProject) {
        for (const run of computedRuns) {
          await saveRunToActiveProject(run);
        }
      }

      setSteps((prev) =>
        prev.map((s, idx) =>
          idx === workflow.indices.length + 2
            ? { ...s, status: "completed", resultSummary: `${computedRuns.length} análises processadas` }
            : s
        )
      );

      // Append assistant message in chat
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          sender: "agent",
          text: finalDiag,
          timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
          steps: initialSteps,
          runs: computedRuns,
          provider: "workflow",
          model: workflow.badge,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Submit natural language prompt
  const handlePromptSubmit = async (customText?: string) => {
    const textToSend = customText ?? prompt.trim();
    if (!textToSend || isRunning) return;

    if (!customText) setPrompt("");
    setIsRunning(true);
    setSynthesis(null);

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);

    const initialRunningStep: WorkflowStep = {
      id: "planner",
      name: `Formulação do Plano Geoespacial (${activeProviderLabel})...`,
      status: "running",
    };
    setSteps([initialRunningStep]);

    try {
      const aoiPayload = activeProject ? aoiToAPI(activeProject.aoi) : {};
      const currentMapState = {
        aoi: {
          label: activeProject?.aoi?.label || "Moçambique",
          province: aoiPayload.province || null,
          district: aoiPayload.district || null,
          geometry: aoiPayload.geometry || null,
        },
        temporalWindow: activeProject?.period || { startDate: "2024-01-01", endDate: "2024-12-31" },
        gee_token: (typeof window !== "undefined" ? localStorage.getItem("geomoz_gee_token") : null) || undefined,
        gee_project: (typeof window !== "undefined" ? localStorage.getItem("geomoz_gee_project") : null) || "geoprocessamento-426809",
      };

      // Multi-turn message history conversion
      const historyPayload = messages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await apiFetch("/geomoz-api/ai/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          current_map_state: currentMapState,
          chat_history: historyPayload,
          openai_api_key: openaiApiKey.trim() || undefined,
          gemini_api_key: geminiApiKey.trim() || undefined,
          provider: provider || "auto",
          model: model || "gpt-4o",
        }),
      });

      if (!res.ok) {
        throw new Error(`Erro do Agente: HTTP ${res.status}`);
      }

      const data = await res.json();

      const finalSteps: WorkflowStep[] = data.steps && data.steps.length > 0 ? data.steps : [
        { id: "exec", name: "Análise ReAct Processada", status: "completed", resultSummary: "Concluído" },
      ];
      setSteps(finalSteps);

      const computedLayers: any[] = [];
      if (data.map_actions && data.map_actions.length > 0) {
        data.map_actions.forEach((act: any) => {
          if (act.type === "ADD_LAYER" && act.tileUrl) {
            computedLayers.push({
              name: act.name || "Camada Calculada",
              type: "remote_sensing",
              sensor: "GeoMoz AI",
              code: act.id,
              dateRange: activeProject?.period,
              metrics: {},
              tileUrl: act.tileUrl,
            });
          }
        });

        if (computedLayers.length > 0) {
          setCompletedRuns((prev) => [...prev, ...computedLayers]);
          setActiveTileUrl(computedLayers[0].tileUrl);
          setActiveTileName(computedLayers[0].name);

          if (activeProject) {
            for (const r of computedLayers) {
              await saveRunToActiveProject(r);
            }
          }
        }
      }

      const finalSynthesis = data.synthesis || "Análise geoespacial concluída.";
      setSynthesis(finalSynthesis);

      // Append Agent message to chat history
      const agentMsg: ChatMessage = {
        id: `agent_${Date.now()}`,
        sender: "agent",
        text: finalSynthesis,
        timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        steps: finalSteps,
        runs: computedLayers,
        provider: data.provider || provider,
        model: data.model || model,
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "agent",
        text: `Falha na execução do agente: ${err.message}`,
        timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsRunning(false);
    }
  };

  // Export Executive PDF Report
  const handleExportPDF = async () => {
    if (messages.length === 0 && !synthesis) return;
    setIsExportingPdf(true);

    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 14;
      const contentW = 210 - margin * 2;
      let y = 16;

      // Header Banner
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, contentW, 20, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("GEOMOZ EXPLORER — RELATÓRIO DO AGENTE AI", margin + 6, y + 9);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Motor IA: ${activeProviderLabel} | Data: ${new Date().toLocaleDateString("pt-PT")}`, margin + 6, y + 15);

      y += 26;

      // Study metadata
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentW, 16, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`Área de Estudo: ${activeProject?.aoi?.label || "Moçambique (Geral)"}`, margin + 5, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Projeto: ${activeProject?.name || "Estudo Avulso"} | Camadas Geradas: ${completedRuns.length}`, margin + 5, y + 11);

      y += 22;

      // Map Screenshot if available
      if (mapRef.current) {
        try {
          const canvas = await html2canvas(mapRef.current, { useCORS: true, logging: false });
          const imgData = canvas.toDataURL("image/jpeg", 0.85);
          const mapH = 65;
          doc.addImage(imgData, "JPEG", margin, y, contentW, mapH);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, y, contentW, mapH);
          y += mapH + 6;
        } catch {}
      }

      // Checklist of executed steps
      if (steps.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text("Rastreio de Execução ReAct / Ferramentas GIS:", margin, y);
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        steps.slice(0, 7).forEach((st) => {
          doc.text(`• ${st.name} ${st.resultSummary ? `[${st.resultSummary}]` : ""}`, margin + 3, y);
          y += 4.5;
        });
        y += 3;
      }

      // Technical diagnostic synthesis
      const lastText = synthesis || messages[messages.length - 1]?.text || "";
      if (lastText) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text("Parecer Técnico & Diagnóstico Geocientífico:", margin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        const splitText = doc.splitTextToSize(lastText, contentW);
        doc.text(splitText, margin, y);
      }

      // Footer
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("GeoMoz AI Agent — Documento gerado automaticamente para suporte à decisão técnica.", margin, 290);

      doc.save(`GeoMoz_Missao_${(activeProject?.aoi?.label || "Geral").replace(/\s+/g, "_")}.pdf`);
    } catch (e: any) {
      alert(`Falha ao gerar PDF: ${e.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Left Control / Chat Panel */}
      <div className="w-full md:w-[460px] xl:w-[500px] flex-none bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Top Agent Header */}
        <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800 flex-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1">
              <Sparkles size={11} /> GeoMoz AI Agent
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTempOpenaiKey(openaiApiKey);
                  setTempGeminiKey(geminiApiKey);
                  setTempProvider(provider);
                  setTempModel(model);
                  setShowConfigModal(true);
                }}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer ${
                  isAIActive
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
                    : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                }`}
                title="Configurar Chaves da OpenAI e Gemini"
              >
                <BrainCircuit size={11} />
                <span>{activeProviderLabel.split(" ")[0]}</span>
              </button>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setSteps([]);
                    setSynthesis(null);
                  }}
                  className="p-1 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  title="Limpar Histórico de Mensagens"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-1.5 truncate">
              <MapPin size={12} className="text-sky-400 shrink-0" />
              <span className="truncate">{activeProject?.aoi?.label || "Moçambique (Geral)"}</span>
            </div>
            {activeProject && (
              <span className="text-[10px] text-slate-400 truncate">
                Projeto: <strong className="text-slate-200">{activeProject.name}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Modal: Configure AI Providers */}
        {showConfigModal && (
          <div className="p-3.5 bg-slate-950 border-b border-violet-500/40 text-xs space-y-3 flex-none animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-slate-200">
              <span className="font-bold flex items-center gap-1.5 text-xs text-violet-300">
                <BrainCircuit size={13} />
                Configurar Motores de Inteligência Artificial
              </span>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1 mb-1">
                  Chave OpenAI API (sk-...)
                </label>
                <input
                  type="password"
                  value={tempOpenaiKey}
                  onChange={(e) => setTempOpenaiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase flex items-center gap-1 mb-1">
                  Chave Gemini API (Google AI Studio)
                </label>
                <input
                  type="password"
                  value={tempGeminiKey}
                  onChange={(e) => setTempGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Provedor Preferencial</label>
                  <select
                    value={tempProvider}
                    onChange={(e) => setTempProvider(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value="auto">Automático (Detecta Ativa)</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Modelo OpenAI</label>
                  <select
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value="gpt-4o">GPT-4o (Recomendado)</option>
                    <option value="gpt-4o-mini">GPT-4o mini (Económico)</option>
                    <option value="o3-mini">o3-mini (Raciocínio)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-2.5 py-1 text-slate-400 hover:text-white text-[11px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1"
              >
                <Check size={11} /> Guardar Definições
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Conversation Thread & Quick Actions */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4" ref={chatScrollRef}>
          {/* Welcome Card if no messages */}
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="p-3 bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-violet-800 dark:text-violet-300">
                  <Sparkles size={14} />
                  <span>Bem-vindo ao Copiloto Geoespacial GeoMoz</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Faça pedidos em linguagem natural sobre o território de Moçambique. O agente orquestra ferramentas de satélite (GEE), modelos hidrológicos e litologia oficial para devolver mapas e diagnósticos técnicos fundamentados.
                </p>
              </div>

              {/* Quick Workflows Catalog */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Workflows Automáticos Recomendados
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {QUICK_WORKFLOWS.map((wf) => (
                    <div
                      key={wf.id}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 bg-white dark:bg-slate-800/60 hover:shadow-2xs transition-all flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="p-1 rounded-lg bg-slate-100 dark:bg-slate-700 shrink-0">
                          {wf.icon}
                        </div>
                        <div className="truncate">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {wf.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 truncate block">{wf.badge}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => runWorkflow(wf)}
                        disabled={isRunning}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                      >
                        <span>Iniciar</span>
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages History List */}
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {msg.sender === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-violet-600 text-white rounded-2xl rounded-tr-xs p-3 text-xs leading-relaxed shadow-2xs">
                    <div className="font-medium">{msg.text}</div>
                    <div className="text-[9px] text-violet-200 text-right mt-1">{msg.timestamp}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3.5 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-xs shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
                        <Sparkles size={13} />
                        <span>GeoMoz AI</span>
                        {msg.model && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 font-mono text-violet-600 dark:text-violet-400">
                            {msg.model}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400">{msg.timestamp}</span>
                    </div>

                    {/* Step Checklist for this turn */}
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Ferramentas Executadas:
                        </div>
                        {msg.steps.map((st, idx) => (
                          <div key={st.id || idx} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate">
                              <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                              <span className="truncate">{st.name}</span>
                            </div>
                            {st.resultSummary && (
                              <span className="text-[9px] font-mono text-slate-400 shrink-0 ml-1">
                                {st.resultSummary}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Text Synthesis */}
                    <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </div>

                    {/* Layers generated buttons */}
                    {msg.runs && msg.runs.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap gap-1.5">
                        {msg.runs.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setActiveTileUrl(r.tileUrl);
                              setActiveTileName(r.name);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 hover:bg-violet-100 hover:text-violet-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Layers size={10} />
                            <span>Ver {r.name.split("(")[0].trim()}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Running Status Tracker */}
          {isRunning && (
            <div className="p-3 bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
                <Loader2 size={13} className="animate-spin" />
                <span>Orquestração em curso ({activeProviderLabel})…</span>
              </div>
              <div className="space-y-1">
                {steps.map((s, idx) => (
                  <div key={s.id || idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                    {s.status === "completed" ? (
                      <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                    ) : s.status === "running" ? (
                      <Loader2 size={11} className="animate-spin text-violet-600 shrink-0" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                    )}
                    <span className="truncate">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex-none space-y-2">
          {/* Quick prompt suggestion pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {SUGGESTED_PROMPTS.map((sp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePromptSubmit(sp)}
                disabled={isRunning}
                className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 hover:bg-violet-50 hover:text-violet-700 dark:bg-slate-800 dark:text-slate-300 text-slate-600 whitespace-nowrap transition-colors shrink-0 cursor-pointer disabled:opacity-40"
              >
                {sp}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePromptSubmit();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Instrua o agente (ex: Analisa a humidade do solo e risco de seca em Tete...)"
              disabled={isRunning}
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={isRunning || !prompt.trim()}
              className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </form>

          {/* Export PDF Button if results exist */}
          {(messages.length > 0 || completedRuns.length > 0) && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-400">
                {completedRuns.length} camada(s) disponível(eis) no mapa
              </span>
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExportingPdf}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-violet-600 bg-slate-100 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                {isExportingPdf ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                <span>Exportar Relatório PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Map Panel */}
      <div className="flex-1 flex flex-col relative overflow-hidden" ref={mapRef}>
        {/* Floating Layer Switcher & Opacity Controls */}
        {completedRuns.length > 0 && (
          <div className="absolute top-3 left-3 right-3 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <Layers size={13} className="text-violet-500" />
                Camadas:
              </span>
              <div className="flex items-center gap-1">
                {completedRuns.map((run, i) => (
                  <button
                    key={`${run.code}_${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedLayerIndex(i);
                      setActiveTileUrl(run.tileUrl);
                      setActiveTileName(run.name);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                      selectedLayerIndex === i
                        ? "bg-violet-600 text-white shadow-2xs"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {run.name.split("(")[0].trim()}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity slider */}
            <div className="flex items-center gap-2 shrink-0">
              <Sliders size={12} className="text-slate-400" />
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={layerOpacity}
                onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
                className="w-20 accent-violet-600 cursor-pointer"
                title="Opacidade da camada"
              />
              <span className="text-[10px] font-mono text-slate-500 w-7 text-right">
                {Math.round(layerOpacity * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Leaflet Map */}
        <div className="flex-1 relative">
          <MapContainer center={[-18.6, 35.5]} zoom={6} style={{ height: "100%", width: "100%" }}>
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
                opacity={layerOpacity}
              />
            )}
            <ScaleControl position="bottomleft" />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
