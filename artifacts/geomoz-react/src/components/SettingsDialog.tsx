import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiUrl, apiFetch } from "@/lib/api";
import {
  Settings,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Info,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface GEEConfig {
  status: {
    connected: boolean;
    auth_type: string | null;
    project: string | null;
    message: string;
  };
  config: {
    hasServiceAccountKey: boolean;
    maskedServiceAccount: {
      client_email: string;
      project_id: string;
      key_prefix: string;
      has_private_key: boolean;
    } | null;
    envProjectId: string | null;
    envProjectSource: string | null;
  };
  endpoints: Record<string, unknown>;
}

interface GEEConfigureResponse {
  configured: boolean;
  connected: boolean;
  message: string;
  auth_type?: string;
  project?: string;
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

function useGEEConfig() {
  const [config, setConfig] = useState<GEEConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/config"));
      if (!res.ok) throw new Error(`Erro ${res.status}: ${res.statusText}`);
      const data: GEEConfig = await res.json();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}

/* ── Component ────────────────────────────────────────────────────────────── */

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { config, loading, error, refetch } = useGEEConfig();

  const [saKey, setSaKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) {
      setSaKey("");
      setProjectId("");
      setSaveResult(null);
      setTestResult(null);
      refetch();
    }
  }, [open, refetch]);

  async function handleSave() {
    if (!saKey.trim() && !projectId.trim()) {
      setSaveResult({
        type: "error",
        message: "Introduza a chave da service account e/ou o project ID.",
      });
      return;
    }

    setSaving(true);
    setSaveResult(null);
    try {
      const body: Record<string, string> = {};
      if (saKey.trim()) body.service_account_key = saKey.trim();
      if (projectId.trim()) body.project_id = projectId.trim();

      const res = await apiFetch("/geomoz-api/gee/configure"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: GEEConfigureResponse = await res.json();

      if (data.configured && data.connected) {
        setSaveResult({ type: "success", message: data.message });
        refetch();
      } else {
        setSaveResult({ type: "error", message: data.message });
      }
    } catch (err) {
      setSaveResult({
        type: "error",
        message: err instanceof Error ? err.message : "Erro de rede ao configurar GEE",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/status"));
      const data = await res.json();
      setTestResult({
        connected: data.connected,
        message: data.connected
          ? `Conectado via ${data.auth_type} (projeto: ${data.project || "n/a"})`
          : data.message,
      });
    } catch (err) {
      setTestResult({
        connected: false,
        message: err instanceof Error ? err.message : "Falha ao testar conexão",
      });
    } finally {
      setTesting(false);
    }
  }

  const isConnected = config?.status?.connected ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Settings size={20} className="text-slate-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">Configurações</DialogTitle>
              <DialogDescription>
                Configure as credenciais do Google Earth Engine
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* ── GEE Status Card ── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <Globe size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                Google Earth Engine
              </span>
              {loading ? (
                <Badge variant="outline" className="ml-auto text-xs gap-1.5">
                  <Loader2 size={10} className="animate-spin" />
                  A verificar…
                </Badge>
              ) : isConnected ? (
                <Badge className="ml-auto bg-emerald-500 hover:bg-emerald-500 text-white border-0 text-xs gap-1">
                  <CheckCircle2 size={10} />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive" className="ml-auto text-xs gap-1">
                  <XCircle size={10} />
                  Desconectado
                </Badge>
              )}
            </div>

            {error ? (
              <div className="p-4">
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">Erro de conexão</p>
                    <p className="text-xs text-red-500 mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            ) : config ? (
              <div className="p-4 space-y-3">
                {/* Connection details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Estado</p>
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isConnected ? "bg-emerald-500" : "bg-red-400"
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-700">
                        {isConnected ? "Conectado" : "Desconectado"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Tipo de Autenticação</p>
                    <p className="text-sm font-medium text-slate-700">
                      {config.status.auth_type === "service_account"
                        ? "Service Account"
                        : config.status.auth_type === "application_default"
                        ? "Credenciais Locais"
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Projeto</p>
                    <p className="text-sm font-medium text-slate-700 font-mono">
                      {config.config.envProjectId ||
                       config.config.maskedServiceAccount?.project_id ||
                       "—"}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Service Account</p>
                    <p className="text-sm font-medium text-slate-700 truncate" title={config.config.maskedServiceAccount?.client_email}>
                      {config.config.maskedServiceAccount?.client_email
                        ? config.config.maskedServiceAccount.client_email
                        : config.config.hasServiceAccountKey
                        ? "Configurada (local)"
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Test connection button */}
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {testing ? "A testar…" : "Testar Conexão"}
                </button>

                {testResult && (
                  <div
                    className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
                      testResult.connected
                        ? "bg-emerald-50 border border-emerald-100 text-emerald-700"
                        : "bg-red-50 border border-red-100 text-red-700"
                    }`}
                  >
                    {testResult.connected ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={16} className="mt-0.5 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-slate-300" />
              </div>
            )}
          </div>

          {/* ── Credentials Form ── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <KeyRound size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                Credenciais GEE
              </span>
              {config?.config?.hasServiceAccountKey && (
                <Badge variant="outline" className="text-xs gap-1 ml-auto">
                  <ShieldCheck size={10} className="text-emerald-500" />
                  Chave ativa (env)
                </Badge>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Info box */}
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <Info size={16} className="text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700">
                    Ambiente local: credenciais carregadas do sistema
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    As credenciais definidas nas variáveis de ambiente estão a ser usadas.
                    Para usar outras, preencha os campos abaixo.
                  </p>
                </div>
              </div>

              {/* Service Account Key */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  Chave da Service Account (JSON)
                </label>
                <div className="relative">
                  <Textarea
                    value={saKey}
                    onChange={(e) => setSaKey(e.target.value)}
                    placeholder={config?.config?.hasServiceAccountKey ? "Chave ativa do ambiente (substituir…)" : "Cole o JSON completo da service account…"}
                    className="min-h-[120px] font-mono text-xs resize-y"
                  />
                </div>
                <p className="text-xs text-slate-400">
                  JSON completo do ficheiro service-account-key.json
                </p>
              </div>

              {/* Project ID */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  Project ID (GCP)
                </label>
                <Input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder={config?.config?.envProjectId || "eengine-project"}
                  className="font-mono"
                />
                <p className="text-xs text-slate-400">
                  ID do projeto Google Cloud (ex: eengine-project)
                </p>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || (!saKey.trim() && !projectId.trim())}
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      A configurar…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      Aplicar Credenciais
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSaKey("");
                    setProjectId("");
                  }}
                  disabled={!saKey && !projectId}
                >
                  Limpar
                </Button>
              </div>

              {saveResult && (
                <div
                  className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
                    saveResult.type === "success"
                      ? "bg-emerald-50 border border-emerald-100 text-emerald-700"
                      : "bg-red-50 border border-red-100 text-red-700"
                  }`}
                >
                  {saveResult.type === "success" ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                  )}
                  <span>{saveResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Info & Links ── */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 space-y-2">
              <a
                href="https://code.earthengine.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <ExternalLink size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">
                    Google Earth Engine
                  </span>
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500" />
              </a>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">
                    Criar Service Account (GCP Console)
                  </span>
                </div>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500" />
              </a>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="text-center text-xs text-slate-400 pb-2">
            GeoMoz Explorer v2.1.0 · {config?.status?.project ? `Projeto: ${config.status.project}` : ""}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
