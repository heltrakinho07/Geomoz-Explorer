import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { aoiToAPI, type AreaOfInterest } from "@/lib/aoi";
import { useAuth } from "@/hooks/useAuth";
import { useProject } from "@/hooks/useProject";
import {
  useAnalysisJob,
  type AnalysisJob,
} from "@/hooks/useAnalysisJob";
import AnalysisJobProgress from "@/components/AnalysisJobProgress";

interface GeoMozAIAgentTabProps {
  aoi: AreaOfInterest;
  province: string | null;
  district: string | null;
}

interface AgentStatus {
  agent: {
    configured: boolean;
    provider: string | null;
    model: string;
    execution_model: string;
    max_tool_calls_per_turn: number;
    arbitrary_code_execution: boolean;
  };
  registry: {
    count: number;
    categories: string[];
  };
}

interface AgentResponse {
  mode: "message" | "tool_call";
  message: string;
  tool?: {
    id: string;
    name: string;
    category?: string | null;
  };
  arguments?: Record<string, unknown>;
  job?: AnalysisJob<unknown>;
}

interface ConversationEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolName?: string;
}

const STARTERS = [
  "Calcula NDVI nesta área para 2024",
  "Analisa o potencial de água subterrânea nesta AOI",
  "Calcula o risco de erosão para esta área",
  "Detecta uma inundação com Sentinel-1",
];

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body?.detail === "string") return body.detail;
  if (typeof body?.message === "string") return body.message;
  return `Erro HTTP ${res.status}`;
}

export default function GeoMozAIAgentTab({
  aoi,
  province,
  district,
}: GeoMozAIAgentTabProps) {
  const { user } = useAuth();
  const { activeProject } = useProject();
  const {
    job,
    adoptJob,
    cancel,
    retry,
    running,
    error: jobError,
  } = useAnalysisJob<unknown>();

  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);

  const spatial = useMemo(() => aoiToAPI(aoi), [aoi]);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    setStatusLoading(true);

    void apiFetch("/geomoz-api/ai/status")
      .then(async res => {
        if (!res.ok) throw new Error(await parseError(res));
        return res.json() as Promise<AgentStatus>;
      })
      .then(data => {
        if (!cancelled) setStatus(data);
      })
      .catch(err => {
        if (!cancelled) {
          setRequestError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    setExplanation(null);
  }, [job?.id]);

  async function explainCurrentJob() {
    if (!job?.id || job.status !== "completed" || explaining) return;

    setExplaining(true);
    setRequestError(null);
    try {
      const res = await apiFetch(`/geomoz-api/ai/jobs/${job.id}/explain`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await parseError(res));
      const data = await res.json() as { explanation: string };
      setExplanation(data.explanation);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      setExplaining(false);
    }
  }

  async function sendPrompt(text = prompt) {
    const clean = text.trim();
    if (!clean || submitting || running) return;

    if (!user) {
      setRequestError("Inicie sessão para usar o GeoMoz Agent.");
      return;
    }

    setPrompt("");
    setRequestError(null);
    setSubmitting(true);
    setConversation(current => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: clean,
      },
    ]);

    try {
      const res = await apiFetch("/geomoz-api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          project_id: activeProject?.id ?? null,
          context: {
            province: spatial.province ?? province,
            district: spatial.district ?? district,
            geometry: spatial.geometry ?? null,
            aoi_label: aoi.label,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(await parseError(res));
      }

      const data = await res.json() as AgentResponse;

      setConversation(current => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.message,
          toolName: data.tool?.name,
        },
      ]);

      if (data.job) {
        adoptJob(data.job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRequestError(message);
      setConversation(current => [
        ...current,
        {
          id: `a-error-${Date.now()}`,
          role: "assistant",
          text: message,
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-violet-100 bg-white p-7 text-center shadow-sm">
          <BrainCircuit size={30} className="mx-auto text-violet-500" />
          <h3 className="mt-3 text-base font-bold text-slate-900">Ask GeoMoz</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Inicie sessão para usar o agente geoespacial e executar análises com o seu projecto Earth Engine.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-slate-50">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-500" />
                <h3 className="text-sm font-bold text-slate-900">Ask GeoMoz</h3>
                {status?.agent.configured && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 size={10} /> Agent online
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Descreva a análise. O agente selecciona uma ferramenta GeoMoz validada e acompanha a execução.
              </p>
            </div>

            <div className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
              <MapPin size={11} className="shrink-0 text-sky-500" />
              <span className="truncate">{aoi.label}</span>
              {activeProject && (
                <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-emerald-700">
                  {activeProject.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!statusLoading && status && !status.agent.configured && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
              O planner de linguagem natural ainda não está configurado no servidor.
              As ferramentas GeoMoz continuam disponíveis normalmente; para activar o Agent,
              configure <code className="rounded bg-white/70 px-1">OPENAI_API_KEY</code> no Cloud Run.
            </div>
          )}

          {conversation.length === 0 ? (
            <div className="mx-auto max-w-2xl py-8">
              <div className="mb-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
                  <BrainCircuit size={27} className="text-violet-600" />
                </div>
                <h4 className="mt-4 text-lg font-bold text-slate-900">
                  Converse com o território
                </h4>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                  O GeoMoz usa a AOI e o projecto activos como contexto. A IA planeia;
                  o motor geoespacial executa e valida os resultados.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map(item => (
                  <button
                    key={item}
                    onClick={() => void sendPrompt(item)}
                    disabled={!status?.agent.configured || submitting || running}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-medium leading-relaxed text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {conversation.map(entry => (
                <div
                  key={entry.id}
                  className={[
                    "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                    entry.role === "user"
                      ? "ml-auto bg-slate-900 text-white"
                      : "mr-auto border border-slate-200 bg-white text-slate-700",
                  ].join(" ")}
                >
                  {entry.toolName && (
                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-violet-500">
                      <Wrench size={10} /> {entry.toolName}
                    </div>
                  )}
                  {entry.text}
                </div>
              ))}

              {(submitting || statusLoading) && (
                <div className="mr-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
                  <Loader2 size={13} className="animate-spin text-violet-500" />
                  GeoMoz está a planear…
                </div>
              )}

              {job && (
                <div className="space-y-2 pt-2">
                  <AnalysisJobProgress
                    job={job}
                    title="GeoMoz Agent · Execução"
                    onCancel={cancel}
                    onRetry={retry}
                  />

                  {job.status === "completed" && status?.agent.configured && (
                    <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-500">
                            Interpretação AI
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Explicação baseada nos parâmetros e resultados reais deste job.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void explainCurrentJob()}
                          disabled={explaining}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-violet-700 disabled:bg-slate-300"
                        >
                          {explaining ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Sparkles size={11} />
                          )}
                          {explanation ? "Actualizar" : "Explicar resultado"}
                        </button>
                      </div>

                      {explanation && (
                        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-violet-50/60 px-3 py-3 text-xs leading-relaxed text-slate-700">
                          {explanation}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          {(requestError || jobError) && (
            <div className="mx-auto mb-2 max-w-3xl rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {requestError || jobError}
            </div>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              rows={2}
              maxLength={4000}
              placeholder="Ex.: Analisa o potencial de água subterrânea nesta área…"
              className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void sendPrompt()}
              disabled={!prompt.trim() || submitting || running || !status?.agent.configured}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              title="Enviar para GeoMoz Agent"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
          <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between text-[9px] text-slate-400">
            <span>
              {status?.registry.count ?? 0} ferramentas validadas · sem execução arbitrária de código
            </span>
            <span>Enter envia · Shift+Enter nova linha</span>
          </div>
        </div>
      </div>
    </div>
  );
}
