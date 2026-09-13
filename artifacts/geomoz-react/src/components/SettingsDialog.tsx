import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "../hooks/useAuth";
import { useGeeAuth } from "../hooks/useGeeAuth";
import { useProject } from "../context/ProjectContext";
import {
  Settings,
  Cpu,
  User,
  Sliders,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  LogOut,
  LogIn,
  KeyRound,
  Trash2,
  Globe,
  Layers,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsTab = "gee" | "profile" | "preferences" | "storage";

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, signOut } = useAuth();
  const {
    geeConnected,
    geeProject,
    loading: geeLoading,
    error: geeError,
    connectGee,
    setProjectOnly,
    disconnectGee,
    refreshStatus,
  } = useGeeAuth();
  const { projects } = useProject();

  const [activeTab, setActiveTab] = useState<SettingsTab>("gee");
  const [projectIdInput, setProjectIdInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Basemap preference state
  const [preferredBasemap, setPreferredBasemap] = useState(() => {
    try {
      return localStorage.getItem("geomoz_preferred_basemap") || "hybrid";
    } catch {
      return "hybrid";
    }
  });

  const handleSaveProjectOnly = async () => {
    const val = projectIdInput.trim();
    if (!val) return;
    setConnecting(true);
    setTestResult(null);
    try {
      await setProjectOnly(val);
      setTestResult({
        connected: true,
        message: `Projeto vinculado com sucesso: ${val}. As análises de satélite usarão esta quota.`,
      });
    } catch (err: any) {
      setTestResult({
        connected: false,
        message: err?.message || "Erro ao vincular projeto.",
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectGee = async () => {
    setConnecting(true);
    setTestResult(null);
    try {
      await connectGee(projectIdInput.trim() || undefined);
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/status");
      const data = await res.json().catch(() => ({}));
      if (data.connected) {
        setTestResult({
          connected: true,
          message: `Conexão ativa! Projeto: ${data.project || "Padrão"} (${data.auth_type || "Cota Servidor / ADC"}). ${data.message || ""}`,
        });
      } else {
        setTestResult({
          connected: false,
          message: data.message || "GEE não conectado ou credenciais pendentes.",
        });
      }
    } catch (e: any) {
      setTestResult({
        connected: false,
        message: e.message || "Erro de conexão ao servidor.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSavePreferences = () => {
    try {
      localStorage.setItem("geomoz_preferred_basemap", preferredBasemap);
      alert("Preferências guardadas com sucesso.");
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Settings size={20} />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Definições do Sistema
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300 mt-0.5">
                Configuração de credenciais Google Earth Engine, perfil de utilizador e preferências da plataforma.
              </DialogDescription>
            </div>
          </div>

          {/* Settings Tabs */}
          <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-800/80 overflow-x-auto">
            <button
              onClick={() => setActiveTab("gee")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                activeTab === "gee"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Cpu size={14} />
              <span>Google Earth Engine</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                activeTab === "profile"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <User size={14} />
              <span>Perfil & Conta</span>
            </button>

            <button
              onClick={() => setActiveTab("preferences")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                activeTab === "preferences"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sliders size={14} />
              <span>Preferências</span>
            </button>

            <button
              onClick={() => setActiveTab("storage")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                activeTab === "storage"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Database size={14} />
              <span>Armazenamento</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">
          {activeTab === "gee" && (
            <div className="space-y-4">
              {/* Status Card */}
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                  geeConnected
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {geeConnected ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertCircle size={20} className="text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h4
                      className={`text-sm font-bold ${
                        geeConnected ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"
                      }`}
                    >
                      {geeConnected ? "Google Earth Engine Conectado" : "Conexão GEE Pendente"}
                    </h4>
                    <p
                      className={`text-xs mt-0.5 ${
                        geeConnected ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {geeConnected
                        ? `A sua quota e projeto estão ativas para processamento de satélite. Projeto vinculado: ${
                            geeProject || "Padrão"
                          }.`
                        : "Autentique a sua conta Google com permissões Earth Engine para processamento individual de satélites."}
                    </p>
                  </div>
                </div>

                {geeConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnectGee}
                    className="border-red-200 text-red-600 hover:bg-red-50 text-xs shrink-0"
                  >
                    <Trash2 size={13} className="mr-1" />
                    Remover Projeto
                  </Button>
                )}
              </div>

              {/* OAuth Connection Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-sky-500" />
                    Autenticação via Terceiros (OAuth 2.0)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    A plataforma utiliza o protocolo OAuth 2.0 padrão da Google. Ao iniciar sessão, o token e o ID do projeto ficam guardados de forma segura na sua conta e não precisa de autenticar novamente a cada visita.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    ID do Projeto Google Cloud (Earth Engine)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={projectIdInput}
                      onChange={(e) => setProjectIdInput(e.target.value)}
                      placeholder={geeProject || "ex: meu-projeto-gee-123"}
                      className="text-xs font-mono bg-white dark:bg-slate-900 flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveProjectOnly}
                      disabled={connecting || !projectIdInput.trim()}
                      className="text-xs shrink-0 font-medium border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300"
                    >
                      Vincular Projeto
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    O identificador do projeto Google Cloud onde a Earth Engine API está ativa com a sua quota pessoal.
                  </p>
                </div>

                {geeError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{geeError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2.5 pt-2">
                  <Button
                    onClick={handleConnectGee}
                    disabled={connecting || geeLoading}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold py-2 rounded-xl"
                  >
                    {connecting ? (
                      <>
                        <Loader2 size={13} className="animate-spin mr-1.5" />
                        A autenticar via Google…
                      </>
                    ) : (
                      <>
                        <KeyRound size={13} className="mr-1.5" />
                        {geeConnected ? "Reautenticar com Google (OAuth 2.0)" : "Entrar com o Google (Earth Engine)"}
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="text-xs py-2 rounded-xl"
                  >
                    {testing ? (
                      <Loader2 size={13} className="animate-spin mr-1.5" />
                    ) : (
                      <RefreshCw size={13} className="mr-1.5" />
                    )}
                    Testar Conexão
                  </Button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      testResult.connected
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}
                  >
                    {testResult.connected ? (
                      <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle size={14} className="shrink-0 text-red-600" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Documentation links */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Recursos & Ativação de Quotas
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href="https://code.earthengine.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 underline"
                  >
                    <ExternalLink size={12} />
                    <span>Google Earth Engine Code Editor</span>
                  </a>
                  <a
                    href="https://console.cloud.google.com/apis/library/earthengine.googleapis.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 underline"
                  >
                    <ExternalLink size={12} />
                    <span>Google Cloud Console API</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className="space-y-4">
              {user ? (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-sky-500 text-white flex items-center justify-center font-bold text-base">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || "Utilizador"} className="w-full h-full object-cover" />
                      ) : (
                        user.email?.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {user.displayName || "Investigador GeoMoz"}
                      </h4>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      UID de Acesso: <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{user.uid}</span>
                    </div>
                    <div>
                      Estado: <span className="font-semibold text-emerald-600">Sessão Autenticada</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => signOut()}
                      className="text-xs"
                    >
                      <LogOut size={13} className="mr-1.5" />
                      Terminar Sessão
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <User size={32} className="mx-auto text-slate-400" />
                  <p className="text-xs text-slate-500">
                    Inicie sessão na plataforma para ativar armazenamento multi-tenant e gerir projetos de estudo permanentes.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Mapa Base Predefinido
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferredBasemap("hybrid")}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                      preferredBasemap === "hybrid"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    Google Híbrido (Satélite + Vias)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredBasemap("satellite")}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                      preferredBasemap === "satellite"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    Satélite Puro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredBasemap("terrain")}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                      preferredBasemap === "terrain"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    Google Terreno / Altimetria
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredBasemap("osm")}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                      preferredBasemap === "osm"
                        ? "border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    OpenStreetMap
                  </button>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                  <Button size="sm" onClick={handleSavePreferences} className="text-xs bg-sky-600 hover:bg-sky-700">
                    Guardar Preferências
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Resumo de Armazenamento no Firestore
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-400 text-[11px]">Projetos de Estudo</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">
                      {projects.length}
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-400 text-[11px]">Estado da Nuvem</div>
                    <div className="text-sm font-bold text-emerald-600 mt-0.5">Sincronizado</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
