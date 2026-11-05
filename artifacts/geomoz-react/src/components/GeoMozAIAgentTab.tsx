import { GAULAreaSelect, type LoadGAULUnits } from "./GAULAreaSelect";
import { WORLD_COUNTRIES } from "@/lib/world-countries";
import { PublicDataTools, type PublicAnalysisRequest } from "./PublicDataTools";
import { GeoIntelligenceDossier, type IntelligenceDossier } from "./GeoIntelligenceDossier";
import { useState, useRef, useEffect, useCallback } from "react";
import { useProject } from "../context/ProjectContext";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { specialistText, type SpecialistKey } from "@/i18n/specialist-ui";
import { apiFetch } from "@/lib/api";
import { aoiToAPI, mozambiqueAOI, countryAOI, GLOBAL_AOI, type AreaOfInterest } from "@/lib/aoi";
import { useProvinceNames, useDistrictNames } from "@/hooks/useGeoMoz";
import AreaSelect from "./AreaSelect";
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
  Square,
  Globe,
  RefreshCw,
} from "lucide-react";
import { GeoJSON, MapContainer, TileLayer, ScaleControl, useMap } from "react-leaflet";
import { GeoAgentMarkdown } from "./GeoAgentMarkdown";
import "leaflet/dist/leaflet.css";
import { GOOGLE_BASEMAPS } from "@/lib/basemaps";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type AgentGeologyGeoJSON = GeoJSON.FeatureCollection & {
  bbox?: number[]; source?: string; generalized?: boolean; originalFeatureCount?: number;
};
type AgentScope = { domain: "geology"; province?: string | null; district?: string | null; filter_str?: string | null; geometry?: GeoJSON.Geometry | null; };
const AGENT_MODELS: Record<string, { value: string; label: string }[]> = {
  auto: [{ value: "", label: "Escolha automática" }],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" }, { value: "gpt-4o-mini", label: "GPT-4o mini" },
    { value: "gpt-4.1", label: "GPT-4.1" }, { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "o3", label: "o3" }, { value: "o4-mini", label: "o4-mini" },
    { value: "gpt-5-mini", label: "GPT-5 mini" },
  ],
  gemini: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  ],
};

function ZoomToPublicAOI({ aoi }: { aoi: AreaOfInterest }) {
  const map = useMap();
  const boundsKey = JSON.stringify(aoi.bounds || null);
  useEffect(() => {
    if (aoi.source !== "mozambique" && aoi.bounds) {
      map.fitBounds(aoi.bounds, { padding: [24, 24], maxZoom: 11 });
    }
  }, [map, aoi.source, boundsKey]);
  return null;
}

function ZoomToGeology({ bounds }: { bounds?: number[] }) {
  const map = useMap();
  const boundsKey = bounds?.join(",") || "";
  useEffect(() => {
    if (!bounds || bounds.length !== 4 || !bounds.every(Number.isFinite)) return;
    const [west, south, east, north] = bounds;
    if (west >= east || south >= north) return;
    map.fitBounds([[south, west], [north, east]], { padding: [24, 24], maxZoom: 11 });
  }, [map, boundsKey]);
  return null;
}

function showGeologicalFeature(feature: GeoJSON.Feature, layer: any) {
  const props = feature.properties || {};
  const content = document.createElement("div");
  content.style.minWidth = "180px";
  const title = document.createElement("strong");
  title.textContent = String(props.unit || "Unidade sem identificação");
  content.appendChild(title);
  for (const [label, key] of [["Litologia", "lithology"], ["Era", "era"], ["Período", "period"]]) {
    if (!props[key] || props[key] === "None") continue;
    const line = document.createElement("div");
    line.textContent = label + ": " + String(props[key]);
    content.appendChild(line);
  }
  // DOM textContent prevents attributes supplied by the dataset becoming HTML.
  layer.bindPopup(content);
}

interface WorkflowStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  resultSummary?: string;
}

interface ChatMessage {
  intelligence?: IntelligenceDossier;
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  steps?: WorkflowStep[];
  runs?: any[];
  model?: string;
  provider?: string;
}

export default function GeoMozAIAgentTab() {
  const { translatedLocale } = usePortalTranslation();
  const ui = (key: SpecialistKey) => specialistText(translatedLocale, key);
  const { activeProject, updateProject, saveRunToActiveProject } = useProject();

  const loadGAULUnits = useCallback<LoadGAULUnits>(async (countryCode, level, parentCode, signal) => {
    const response = await apiFetch("/geomoz-api/ai/agent-chat", {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Listar unidades FAO GAUL ADM${level}`,
        current_map_state: {
          publicAnalysis: { tool: "list_administrative_units", args: {
            country_code: countryCode, level, ...(parentCode !== null ? { parent_code: parentCode } : {}),
          } },
        },
      }),
    });
    if (!response.ok) throw new Error(`Não foi possível consultar FAO GAUL (HTTP ${response.status}).`);
    const data = await response.json();
    const output = data.runs?.[0]?.output;
    if (output?.status !== "success" || !Array.isArray(output.units)) {
      throw new Error(output?.message || data.synthesis || "Sem unidades FAO GAUL disponíveis.");
    }
    return output.units;
  }, []);

  // Area of Interest (AOI) state
  const [selectedProvince, setSelectedProvince] = useState<string | null>(() => {
    if (activeProject?.aoi?.source === "mozambique") {
      return activeProject.aoi.province || null;
    }
    return null;
  });

  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(() => {
    if (activeProject?.aoi?.source === "mozambique") {
      return activeProject.aoi.district || null;
    }
    return null;
  });

  const [currentAoi, setCurrentAoi] = useState<AreaOfInterest>(() => {
    return activeProject?.aoi || mozambiqueAOI(null, null);
  });

  const [showAoiSelector, setShowAoiSelector] = useState(false);

  // Province and District data hooks
  const { data: provData } = useProvinceNames();
  const provinceList = provData?.names || [];
  const { data: distData } = useDistrictNames(selectedProvince);
  const districtList = distData?.names || [];

  // Sync AOI if activeProject changes externally
  useEffect(() => {
    if (activeProject?.aoi) {
      setCurrentAoi(activeProject.aoi);
      if (activeProject.aoi.source === "mozambique") {
        setSelectedProvince(activeProject.aoi.province || null);
        setSelectedDistrict(activeProject.aoi.district || null);
      } else if (activeProject.aoi.source === "global") {
        setSelectedProvince(null);
        setSelectedDistrict(null);
      }
    }
  }, [activeProject?.aoi]);

  const handleProvinceChange = async (prov: string | null) => {
    setSelectedProvince(prov);
    setSelectedDistrict(null);
    const newAoi = prov ? mozambiqueAOI(prov, null) : mozambiqueAOI(null, null);
    setCurrentAoi(newAoi);
    if (activeProject) {
      try {
        await updateProject(activeProject.id, { aoi: newAoi });
      } catch {}
    }
  };

  const handleDistrictChange = async (dist: string | null) => {
    setSelectedDistrict(dist);
    const newAoi = mozambiqueAOI(selectedProvince, dist);
    setCurrentAoi(newAoi);
    if (activeProject) {
      try {
        await updateProject(activeProject.id, { aoi: newAoi });
      } catch {}
    }
  };

  const handleSelectGlobal = async () => {
    setSelectedProvince(null);
    setSelectedDistrict(null);
    setCurrentAoi(GLOBAL_AOI);
    if (activeProject) {
      try {
        await updateProject(activeProject.id, { aoi: GLOBAL_AOI });
      } catch {}
    }
  };

  const handleSelectMozambiqueFull = async () => {
    handleProvinceChange(null);
  };

  const projectId = activeProject?.id;
  const projectStart = activeProject?.period?.startDate;
  const projectEnd = activeProject?.period?.endDate;
  const [analysisPeriod, setAnalysisPeriod] = useState(() => activeProject?.period || {
    startDate: `${new Date().getFullYear() - 1}-01-01`,
    endDate: `${new Date().getFullYear()}-01-01`,
  });
  useEffect(() => {
    if (projectStart && projectEnd) setAnalysisPeriod({ startDate: projectStart, endDate: projectEnd });
  }, [projectId, projectStart, projectEnd]);
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [activeTileUrl, setActiveTileUrl] = useState<string | null>(null);
  const [activeGeology, setActiveGeology] = useState<AgentGeologyGeoJSON | null>(null);
  const [geologyNotice, setGeologyNotice] = useState<string | null>(null);
  const [agentContext, setAgentContext] = useState<AgentScope | null>(null);
  const [activeTileName, setActiveTileName] = useState<string>("");
  const [completedRuns, setCompletedRuns] = useState<any[]>([]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [layerOpacity, setLayerOpacity] = useState<number>(0.85);

  // Abort controller reference for cancelling runs
  const abortRef = useRef<AbortController | null>(null);

  const handleCancelRunning = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsRunning(false);
    setSteps((prev) =>
      prev.map((s) => (s.status === "running" ? { ...s, status: "error", resultSummary: "Interrompido pelo utilizador" } : s))
    );
  };

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
      return localStorage.getItem("geomoz_agent_model") || "";
    } catch {
      return "";
    }
  });

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [tempOpenaiKey, setTempOpenaiKey] = useState<string>(openaiApiKey);
  const [tempGeminiKey, setTempGeminiKey] = useState<string>(geminiApiKey);
  const [tempProvider, setTempProvider] = useState<string>(provider);
  const [tempModel, setTempModel] = useState<string>(model);
  const [verifiedModels, setVerifiedModels] = useState<{ provider: string; entries: { value: string; label: string }[] } | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsMessage, setModelsMessage] = useState("");
  const modelOptions = verifiedModels?.provider === tempProvider
    ? verifiedModels.entries
    : (AGENT_MODELS[tempProvider] || AGENT_MODELS.auto);

  const refreshModels = async () => {
    const apiKey = (tempProvider === "openai" ? tempOpenaiKey : tempGeminiKey).trim();
    if (tempProvider === "auto" || !apiKey) {
      setModelsMessage("Seleccione OpenAI ou Gemini e forneça a respectiva chave API.");
      return;
    }
    setModelsBusy(true);
    setModelsMessage("");
    try {
      const response = await apiFetch("/geomoz-api/ai/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tempProvider, api_key: apiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Falha na consulta de modelos.");
      const entries = (data.models || []).map((entry: { id: string; label: string }) => ({
        value: entry.id, label: entry.label,
      }));
      if (!entries.length) throw new Error("A chave não devolveu modelos compatíveis com consultas de texto e ferramentas.");
      setVerifiedModels({ provider: tempProvider, entries });
      setTempModel(entries[0].value);
      setModelsMessage(`${entries.length} modelos visíveis nesta conta. O suporte a ferramentas será confirmado durante a execução.`);
    } catch (e) {
      setModelsMessage(e instanceof Error ? e.message : "Não foi possível consultar os modelos.");
    } finally {
      setModelsBusy(false);
    }
  };

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
    const validModel = modelOptions.some(x => x.value === tempModel) ? tempModel : "";
    setModel(validModel);

    try {
      if (oKey) localStorage.setItem("geomoz_openai_api_key", oKey);
      else localStorage.removeItem("geomoz_openai_api_key");

      if (gKey) localStorage.setItem("geomoz_gemini_api_key", gKey);
      else localStorage.removeItem("geomoz_gemini_api_key");

      localStorage.setItem("geomoz_agent_provider", tempProvider);
      localStorage.setItem("geomoz_agent_model", validModel);
    } catch {}

    setShowConfigModal(false);
  };

  const activeProviderLabel = (() => {
    if (provider === "openai" || (provider === "auto" && openaiApiKey.trim())) {
      return `OpenAI (${model || "automático"})`;
    }
    if (provider === "gemini" || (provider === "auto" && geminiApiKey.trim())) {
      return `Google Gemini (${model || "automático"})`;
    }
    return "Heurístico Spatial (Offline)";
  })();

  const isAIActive = Boolean(openaiApiKey.trim() || geminiApiKey.trim());

  // Submit natural language prompt
  const handlePromptSubmit = async (customText?: string, publicRequest?: PublicAnalysisRequest) => {
    const textToSend = customText ?? prompt.trim();
    if (!textToSend || isRunning) return;

    if (!customText) setPrompt("");
    setIsRunning(true);
    setSynthesis(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 75000);

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
      const aoiPayload = aoiToAPI(currentAoi);
      const currentMapState = {
        aoi: {
          source: currentAoi.source,
          countryCode: currentAoi.countryCode,
          countryName: currentAoi.countryName,
          boundarySource: currentAoi.boundarySource,
          adminLevel: currentAoi.adminLevel,
          admin1Code: currentAoi.admin1Code,
          admin2Code: currentAoi.admin2Code,
          label: currentAoi.label || "Moçambique",
          province: aoiPayload.province || null,
          district: aoiPayload.district || null,
          geometry: aoiPayload.geometry || null,
        },
        temporalWindow: analysisPeriod,
        agentContext,
        publicAnalysis: publicRequest ? {
          ...publicRequest,
          args: publicRequest.tool === "detect_temporal_change" ? {
            ...publicRequest.args,
            start_date_2: analysisPeriod.startDate,
            end_date_2: analysisPeriod.endDate,
          } : publicRequest.args,
        } : undefined,
      };

      // Multi-turn message history conversion
      const historyPayload = messages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const res = await apiFetch("/geomoz-api/ai/agent-chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          current_map_state: currentMapState,
          chat_history: historyPayload,
          openai_api_key: openaiApiKey.trim() || undefined,
          gemini_api_key: geminiApiKey.trim() || undefined,
          provider: provider || "auto",
          model: model || undefined,
        }),
      });

      if (!res.ok) {
        // Show a useful diagnostic instead of discarding the API error body.
        // The backend returns a safe request_id for unexpected 500 errors.
        const payload: unknown = await res.json().catch(() => null);
        const response = payload && typeof payload === "object"
          ? payload as Record<string, unknown>
          : null;
        const detail = response?.detail;
        const message = typeof detail === "string"
          ? detail
          : detail && typeof detail === "object" && "message" in detail
            ? String((detail as Record<string, unknown>).message)
            : "Não foi possível processar a consulta.";
        const requestId = detail && typeof detail === "object" && "request_id" in detail
          ? String((detail as Record<string, unknown>).request_id)
          : res.headers.get("X-Request-ID");
        const safeMessage = message.slice(0, 350);
        throw new Error(`HTTP ${res.status}: ${safeMessage}${requestId ? ` (código: ${requestId})` : ""}`);
      }

      const data = await res.json();
      if (data.agent_context?.domain === "geology") {
        setAgentContext(data.agent_context as AgentScope);
      } else if (data.status === "completed") {
        setAgentContext(null);
      }

      const finalSteps: WorkflowStep[] = data.steps && data.steps.length > 0 ? data.steps : [
        { id: "exec", name: "Resposta do agente", status: data.status === "completed" ? "completed" : "error", resultSummary: data.status === "completed" ? "Concluído" : "Ver dossiê" },
      ];
      setSteps(finalSteps);

      const resultPeriod = data.intelligence?.period as IntelligenceDossier["period"] | undefined;
      const layerPeriod = resultPeriod?.startDate && resultPeriod.endDate
        ? { startDate: resultPeriod.startDate, endDate: resultPeriod.endDate }
        : analysisPeriod;
      const computedLayers: any[] = [];
      const vectorWarnings: string[] = [];
      for (const act of data.map_actions || []) {
        if (act.type === "SET_AOI" && act.province) {
          setSelectedProvince(act.province);
          setSelectedDistrict(act.district || null);
          setCurrentAoi(mozambiqueAOI(act.province, act.district || null));
        }
        if (act.type === "ADD_LAYER" && act.tileUrl) {
          computedLayers.push({
            name: act.name || "Camada Calculada",
            type: "remote_sensing",
            sensor: "GeoMoz AI",
            code: act.id,
            dateRange: layerPeriod,
            metrics: {},
            tileUrl: act.tileUrl,
          });
        }
        if (act.type === "ADD_GEOJSON_LAYER" && act.id === "agent_geology") {
          try {
            const geoResponse = await apiFetch("/geomoz-api/ai/geology-features", {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                province: act.province || null,
                district: act.district || null,
                geometry: act.geometry || null,
                filter_str: act.filter_str || null,
              }),
            });
            if (!geoResponse.ok) {
              const problem = await geoResponse.json().catch(() => ({}));
              throw new Error(problem.detail || "Não foi possível obter os polígonos.");
            }
            const geojson = (await geoResponse.json()) as AgentGeologyGeoJSON;
            if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
              throw new Error("A camada geológica devolveu dados inválidos.");
            }
            computedLayers.push({
              name: act.name || "Geologia de Moçambique",
              code: act.id,
              type: "geology",
              sensor: geojson.source || "GeoMoz",
              geojson,
            });
          } catch (error) {
            if (controller.signal.aborted) throw error;
            const message = error instanceof Error ? error.message : "Erro de visualização.";
            vectorWarnings.push(message);
          }
        }
      }

      if (computedLayers.length > 0) {
        setSelectedLayerIndex(completedRuns.length);
        setCompletedRuns((prev) => [...prev, ...computedLayers]);
        const firstLayer = computedLayers[0];
        setActiveTileUrl(firstLayer.tileUrl || null);
        setActiveGeology(firstLayer.geojson || null);
        setActiveTileName(firstLayer.name);
        if (activeProject) {
          for (const resultLayer of computedLayers) {
            // Do not persist large inline GeoJSON as a project run.
            if (resultLayer.tileUrl) await saveRunToActiveProject(resultLayer);
          }
        }
      }
      const generalized = computedLayers.some((layer) => layer.geojson?.generalized);
      setGeologyNotice(vectorWarnings.join(" ") || (generalized
        ? "Camada geológica generalizada; estatísticas calculadas nos polígonos originais."
        : null));

      const answer = data.synthesis || "Não foi devolvida uma síntese. Consulte o dossiê de execução.";
      const finalSynthesis = vectorWarnings.length
        ? answer + "\n\n**Mapa geológico:** " + vectorWarnings.join("; ")
        : answer;
      setSynthesis(finalSynthesis);

      // Append Agent message to chat history
      const agentMsg: ChatMessage = {
        id: `agent_${Date.now()}`,
        sender: "agent",
        text: finalSynthesis,
        timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        steps: finalSteps,
        runs: computedLayers,
        intelligence: data.intelligence,
        provider: data.provider || provider,
        model: data.model || (data.provider === "deterministic-geology" ? "Catálogo GeoMoz" : model),
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      const isAborted = controller.signal.aborted;
      const errorText = isAborted
        ? "A operação foi interrompida ou atingiu o tempo limite (75 s). Dica: selecione uma província ou distrito específico na Área de Estudo para acelerar o processamento das cenas de satélite."
        : `Falha na execução do agente: ${err.message}`;

      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        sender: "agent",
        text: errorText,
        timestamp: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setIsRunning(false);
    }
  };

  // Export Executive PDF Report
  const handleExportPDF = async () => {
    if (messages.length === 0 && !synthesis) return;
    const lastResponse = [...messages].reverse().find((message) => message.sender === "agent");
    if (!lastResponse) return;
    const reportArea = lastResponse.intelligence?.scope.label || currentAoi.label || "Moçambique (Geral)";
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
      doc.text(`Área de Estudo: ${reportArea}`, margin + 5, y + 6);
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
      const lastText = lastResponse.text;
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

      doc.save(`GeoMoz_Missao_${reportArea.replace(/\s+/g, "_")}.pdf`);
    } catch (e: any) {
      alert(`Falha ao gerar PDF: ${e.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] overflow-hidden bg-slate-50 md:grid-cols-[minmax(320px,42%)_minmax(0,1fr)] md:grid-rows-1 dark:bg-slate-900">
      {/* Left Control / Chat Panel */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-slate-200 bg-white md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900">
        {/* Top Agent Header */}
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-slate-800 bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-3 text-white">
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
                title={ui("agent.settings")}
              >
                <BrainCircuit size={11} />
                <span>{activeProviderLabel.split(" ")[0]}</span>
              </button>

              {messages.some((message) => message.sender === "agent") && (
                <button type="button" onClick={handleExportPDF} disabled={isExportingPdf || isRunning} title={ui("agent.exportPdf")} aria-label={ui("agent.exportPdf")} className="rounded-lg p-2 text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                </button>
              )}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setSteps([]);
                    setSynthesis(null);
                    setAgentContext(null);
                  }}
                  className="p-1 rounded-full text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  title={ui("agent.clear")}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Dedicated AOI Selector Section */}
          <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <MapPin size={11} className="text-sky-400" /> {ui("agent.studyArea")}
              </span>
              <button
                type="button"
                onClick={() => setShowAoiSelector(!showAoiSelector)}
                className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/40 font-semibold cursor-pointer transition-colors"
              >
                {showAoiSelector ? "Fechar Seletor" : "Alterar Área"}
              </button>
            </div>

            {/* Active AOI Summary Pill */}
            <div className="flex items-center justify-between text-xs bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-200 font-medium truncate">
                {currentAoi.label || "Moçambique (Geral)"}
              </span>
              {activeProject && (
                <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                  Proj: <strong className="text-slate-300">{activeProject.name}</strong>
                </span>
              )}
            </div>

            {agentContext?.domain === "geology" && agentContext.province && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-2 text-[11px] text-sky-100" role="status">
                <span><strong>Área efectiva da consulta:</strong> {agentContext.district ? agentContext.district + ", " : ""}{agentContext.province}</span>
                <button type="button" className="rounded border border-sky-400/40 px-2 py-1 font-semibold hover:bg-sky-500/20"
                  onClick={() => {
                    const prov = agentContext.province || null;
                    const dist = agentContext.district || null;
                    setSelectedProvince(prov);
                    setSelectedDistrict(dist);
                    const next = mozambiqueAOI(prov, dist);
                    setCurrentAoi(next);
                    if (activeProject) void updateProject(activeProject.id, { aoi: next });
                  }}>Usar esta área no mapa</button>
              </div>
            )}

            {/* If AOI is Global, show a helpful warning banner */}
            {(currentAoi.source === "global" || currentAoi.label === "Mundo (Global)") && (
              <div className="p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg space-y-1 text-[10px] text-amber-200">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-tight">
                    A área está como <strong>Mundo (Global)</strong>. Para evitar lentidão e bloqueios no cálculo dos satélites, seleccione um país no selector de área, uma província ou um polígono:
                  </p>
                </div>
                <div className="flex gap-1.5 pt-0.5 pl-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleProvinceChange("Gaza")}
                    className="px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[9px] font-semibold"
                  >
                    Gaza
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProvinceChange("Tete")}
                    className="px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[9px] font-semibold"
                  >
                    Tete
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProvinceChange("Cabo Delgado")}
                    className="px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[9px] font-semibold"
                  >
                    Cabo Delgado
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectMozambiqueFull}
                    className="px-1.5 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[9px] font-semibold"
                  >
                    Nacional
                  </button>
                </div>
              </div>
            )}

            {/* Expanded AOI Selector Dropdowns */}
            {showAoiSelector && (
              <div className="p-2.5 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2 mt-1 shadow-lg">
                <label className="block text-[10px] font-semibold text-slate-400">País — análises públicas mundiais
                  <select aria-label="País para análise mundial" disabled={isRunning} value={currentAoi.source === "country" ? currentAoi.countryCode || "" : ""}
                    onChange={(event) => {
                      const country = WORLD_COUNTRIES.find((item) => item.code === event.target.value);
                      if (!country) return;
                      const next: AreaOfInterest = { ...countryAOI(country), boundarySource: "gaul2025", adminLevel: 0 };
                      setCurrentAoi(next); setSelectedProvince(null); setSelectedDistrict(null); setAgentContext(null);
                      if (activeProject) void updateProject(activeProject.id, { aoi: next });
                    }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-200">
                    <option value="">Escolher país</option>
                    {WORLD_COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}
                  </select>
                </label>
                {currentAoi.source === "country" && currentAoi.countryCode && <>
                  <label className="block text-[10px] font-semibold text-slate-400">Fonte dos limites
                    <select aria-label="Fonte dos limites administrativos" disabled={isRunning} value={currentAoi.boundarySource || "geoboundaries"}
                      onChange={(event) => {
                        const next: AreaOfInterest = { ...currentAoi, boundarySource: event.target.value as "gaul2025" | "geoboundaries",
                          adminLevel: 0, admin1Code: null, admin1Name: null, admin2Code: null, admin2Name: null,
                          label: currentAoi.countryName || currentAoi.label };
                        setCurrentAoi(next);
                        if (activeProject) void updateProject(activeProject.id, { aoi: next });
                      }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-xs text-slate-200">
                      <option value="gaul2025">FAO GAUL 2025 — país / ADM1 / ADM2</option>
                      <option value="geoboundaries">geoBoundaries v6 — país</option>
                    </select>
                  </label>
                  {currentAoi.boundarySource === "gaul2025" && <GAULAreaSelect countryCode={currentAoi.countryCode} disabled={isRunning} loadUnits={loadGAULUnits}
                    selection={{ adminLevel: currentAoi.adminLevel ?? 0, admin1Code: currentAoi.admin1Code ?? null,
                      admin1Name: currentAoi.admin1Name ?? null, admin2Code: currentAoi.admin2Code ?? null, admin2Name: currentAoi.admin2Name ?? null }}
                    onChange={(selection) => {
                      const next: AreaOfInterest = { ...currentAoi, ...selection,
                        label: [selection.admin2Name, selection.admin1Name, currentAoi.countryName].filter(Boolean).join(", ") };
                      setCurrentAoi(next); setAgentContext(null);
                      if (activeProject) void updateProject(activeProject.id, { aoi: next });
                    }} />}
                </>}
                <p className="text-[10px] text-slate-400">Os novos motores públicos usam a geometria da fonte seleccionada. Países grandes podem exigir uma unidade ADM1/ADM2 menor.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                      Província
                    </label>
                    <select
                      value={selectedProvince || ""}
                      onChange={(e) => handleProvinceChange(e.target.value || null)}
                      className="w-full px-2 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                    >
                      <option value="">Moçambique (Geral)</option>
                      {provinceList.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                      Distrito
                    </label>
                    <select
                      value={selectedDistrict || ""}
                      disabled={!selectedProvince}
                      onChange={(e) => handleDistrictChange(e.target.value || null)}
                      className="w-full px-2 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-40 cursor-pointer"
                    >
                      <option value="">Todos os Distritos</option>
                      {districtList.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleSelectGlobal}
                    className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Repor Global
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAoiSelector(false)}
                    className="px-2.5 py-0.5 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-semibold rounded cursor-pointer"
                  >
                    Concluído
                  </button>
                </div>
              </div>
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
                    onChange={(e) => {
                        setTempProvider(e.target.value);
                        setVerifiedModels(null);
                        setModelsMessage("");
                        setTempModel(AGENT_MODELS[e.target.value]?.[0]?.value || "");
                      }}
                    className="w-full px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value="auto">Automático (Detecta Ativa)</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">Modelo compatível</label>
                  <select
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    {modelOptions.map((entry) => (
                       <option key={entry.value} value={entry.value}>{entry.label}</option>
                     ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={modelsBusy || tempProvider === "auto"}
                  onClick={() => void refreshModels()}
                  className="rounded-md border border-violet-500/40 px-2.5 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">
                  {modelsBusy ? "A consultar modelos..." : "Consultar modelos disponíveis na minha API"}
                </button>
                {modelsMessage && <span role="status" className="text-[10px] text-slate-300">{modelsMessage}</span>}
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
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 dark:bg-slate-950/30" role="log" aria-label={ui("agent.chat")} ref={chatScrollRef}>
          {messages.length === 0 && !isRunning && (
            <div className="space-y-5 px-1 py-4 sm:px-3">
              <div className="space-y-2">
                <Sparkles size={22} className="text-violet-500" aria-hidden="true" />
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{ui("agent.heading")}</h2>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {ui("agent.description")}
                </p>
              </div>
              <div className="grid gap-2">
                {([
                  "agent.example.ndvi",
                  "agent.example.worldcover",
                  "agent.example.compare",
                  "agent.example.rain",
                  "agent.example.lithology",
                ] as const).map((key) => {
                  const example = ui(key);
                  return (
                  <button key={example} type="button" onClick={() => { setPrompt(example); promptRef.current?.focus(); }}
                    className="rounded-xl border border-slate-200 p-3 text-left text-sm text-slate-700 hover:border-violet-400 hover:bg-violet-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-violet-950/40">
                    {example}
                  </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Messages History List */}
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {msg.sender === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-violet-600 text-white rounded-2xl rounded-tr-xs p-3 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs">
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
                    {!msg.intelligence && msg.steps && msg.steps.length > 0 && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {ui("agent.executedTools")}
                        </div>
                        {msg.steps.map((st, idx) => (
                          <div key={st.id || idx} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 truncate">
                              {st.status === "completed"
                                ? <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                                : <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
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
                    <GeoAgentMarkdown text={msg.text} />

                    {msg.intelligence && <GeoIntelligenceDossier dossier={msg.intelligence} />}

                    {/* Layers generated buttons */}
                    {msg.runs && msg.runs.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap gap-1.5">
                        {msg.runs.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setActiveTileUrl(r.tileUrl || null);
                              setActiveGeology(r.geojson || null);
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
              <div className="flex items-center justify-between text-xs font-semibold text-violet-700 dark:text-violet-300">
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" />
                  <span>A executar a análise…</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelRunning}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Interromper execução em curso"
                >
                  <Square size={9} fill="currentColor" />
                  <span>Cancelar</span>
                </button>
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
          <details className="rounded-lg text-xs text-slate-600 dark:text-slate-300">
            <summary className="cursor-pointer py-1 font-medium">{ui("agent.periodTools")}</summary>
            <div className="max-h-36 space-y-2 overflow-y-auto pt-1">
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <label>{ui("agent.startDate")}
                  <input type="date" aria-label={ui("agent.startDate")} disabled={isRunning} value={analysisPeriod.startDate} onChange={(e) => setAnalysisPeriod((p) => ({ ...p, startDate: e.target.value }))} className="block w-full rounded border border-slate-200 bg-transparent p-1 dark:border-slate-700" />
                </label>
                <label>{ui("agent.endDate")}
                  <input type="date" aria-label={ui("agent.endDate")} disabled={isRunning} value={analysisPeriod.endDate} min={analysisPeriod.startDate} onChange={(e) => setAnalysisPeriod((p) => ({ ...p, endDate: e.target.value }))} className="block w-full rounded border border-slate-200 bg-transparent p-1 dark:border-slate-700" />
                </label>
              </div>
              <PublicDataTools disabled={isRunning} onRun={(label, request) => { void handlePromptSubmit(label, request); }} />
            </div>
          </details>
          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handlePromptSubmit();
            }}
            className="flex items-center gap-1.5"
          >
            <textarea
              ref={promptRef}
              rows={2}
              aria-label={ui("agent.promptAria")}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handlePromptSubmit();
                }
              }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={ui("agent.placeholder")}
              disabled={isRunning}
              className="min-w-0 flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
            />
            <button
              type="submit"
              aria-label={ui("agent.send")}
              disabled={isRunning || !prompt.trim()}
              className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </form>

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
                      setActiveTileUrl(run.tileUrl || null);
                      setActiveGeology(run.geojson || null);
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

        {geologyNotice && (
          <div role="status" className="px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20">
            Camada geológica: {geologyNotice}
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

            {/* Interactive Province & District boundary visualization & selection */}
            {currentAoi.source === "mozambique" && <AreaSelect
              province={selectedProvince}
              district={selectedDistrict}
              onProvinceChange={handleProvinceChange}
              onDistrictChange={handleDistrictChange}
              selectable={true}
              fit={true}
              accent="#8b5cf6"
            />}
            <ZoomToPublicAOI aoi={currentAoi} />

            {activeTileUrl && (
              <TileLayer
                crossOrigin="anonymous"
                key={activeTileUrl}
                url={activeTileUrl}
                opacity={layerOpacity}
              />
            )}
            {activeGeology && (
              <>
                <GeoJSON
                  key={activeTileName + "-" + selectedLayerIndex}
                  data={activeGeology}
                  style={(feature) => ({
                    color: "#475569",
                    weight: 0.8,
                    fillColor: String(feature?.properties?._color || "#7c8ca3"),
                    fillOpacity: 0.7 * layerOpacity,
                  })}
                  onEachFeature={showGeologicalFeature}
                />
                <ZoomToGeology bounds={activeGeology.bbox} />
              </>
            )}
            <ScaleControl position="bottomleft" />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}



