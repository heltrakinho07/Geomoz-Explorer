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
    geeAccount,
    loading: geeLoading,
    error: geeError,
    connectGee,
    setProjectOnly,
    saveCredentials,
    disconnectGee,
    refreshStatus,
  } = useGeeAuth();
  const { projects } = useProject();

  const [activeTab, setActiveTab] = useState<SettingsTab>("gee");
  const [projectIdInput, setProjectIdInput] = useState(geeProject || "geoprocessamento-426809");
  const [accountInput, setAccountInput] = useState(geeAccount || "");
  const [saKeyInput, setSaKeyInput] = useState("");
  const [showSaInput, setShowSaInput] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingSa, setSavingSa] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Sync inputs with active context and user profile
  React.useEffect(() => {
    setProjectIdInput(geeProject || "geoprocessamento-426809");
    setAccountInput(geeAccount || (user?.email || ""));
  }, [geeProject, geeAccount, user]);

  // Basemap preference state
  const [preferredBasemap, setPreferredBasemap] = useState(() => {
    try {
      return localStorage.getItem("geomoz_preferred_basemap") || "hybrid";
    } catch {
      return "hybrid";
    }
  });

  const handleSaveProjectOnly = async () => {
    const proj = projectIdInput.trim() || geeProject || "geoprocessamento-426809";
    const acc = accountInput.trim() || geeAccount || "";
    setSavingProject(true);
    setTestResult(null);
    try {
      const res = await saveCredentials(proj, acc);
      setTestResult({
        connected: res.success,
        message: res.message,
      });
    } catch (err: any) {
      setTestResult({
        connected: false,
        message: err?.message || "Erro ao guardar projeto.",
      });
    } finally {
      setSavingProject(false);
    }
  };

  const handleSaveServiceAccount = async () => {
    const proj = projectIdInput.trim() || geeProject || "geoprocessamento-426809";
    const acc = accountInput.trim() || geeAccount || "";
    const sa = saKeyInput.trim() || undefined;
    setSavingSa(true);
    setTestResult(null);
    try {
      const res = await saveCredentials(proj, acc, sa);
      setTestResult({
        connected: res.success,
        message: res.message,
      });
      if (res.success && sa) {
        setSaKeyInput("");
        setShowSaInput(false);
      }
    } catch (err: any) {
      setTestResult({
        connected: false,
        message: err?.message || "Erro ao guardar chave de serviço.",
      });
    } finally {
      setSavingSa(false);
    }
  };

  const handleConnectGee = async () => {
    setConnectingGoogle(true);
    setTestResult(null);
    try {
      await connectGee(projectIdInput.trim() || undefined, accountInput.trim() || undefined);
      setTestResult({
        connected: true,
        message: "Conta Google autenticada com sucesso no Earth Engine!",
      });
    } catch (err: any) {
      console.error(err);
      setTestResult({
        connected: false,
        message: err?.message || "Erro ao autenticar com a conta Google.",
      });
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleCancelConnect = () => {
    setConnectingGoogle(false);
    setTestResult({
      connected: false,
      message: "Ligação cancelada pelo utilizador.",
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch("/geomoz-api/gee/status", {
        headers: {
          "X-GEE-Project": projectIdInput.trim() || geeProject || "geoprocessamento-426809",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (data.connected) {
        setTestResult({
          connected: true,
          message: `Conexão ativa! Projeto: ${data.project || "Padrão"} (${data.auth_type || "Cota Verificada"}). ${data.message || ""}`,
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
                      {geeConnected ? "Google Earth Engine Conectado (Ativo)" : "Credenciais GEE Pendentes / Não Ativas"}
                    </h4>
                    <p
                      className={`text-xs mt-0.5 ${
                        geeConnected ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {geeConnected
                        ? `Projeto vinculado: ${geeProject || "geoprocessamento-426809"} | Conta: ${geeAccount || "Quota Ativa"}`
                        : `Projeto selecionado: ${geeProject || "geoprocessamento-426809"}. Conecte a sua conta Google com 1 clique abaixo para processar imagens.`}
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
                    Desconectar
                  </Button>
                )}
              </div>

              {/* Main 1-Click Connect Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-sky-500" />
                      Acesso Pessoal ao Google Earth Engine
                    </h4>
                    {user ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-medium self-start sm:self-auto">
                        Perfil: {user.email || user.displayName || "Utilizador Registado"}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium self-start sm:self-auto">
                        Modo Convidado (Local)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Cada utilizador registado possui a sua própria conta e cota do Google Earth Engine. A sua sessão e quota ficam guardadas de forma segura e não interferem com outros utilizadores.
                  </p>
                </div>

                {/* 1-Click Google OAuth Button */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {geeConnected ? "Sessão Google Vinculada" : "Autenticação Automática em 1 Clique"}
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {geeConnected
                          ? `Conta ativa: ${geeAccount || user?.email || "Google Earth Engine"}. A sua conta já está ligada.`
                          : "Inicie sessão diretamente com a sua conta Google registada no Earth Engine."}
                      </p>
                    </div>
                    <a
                      href="https://code.earthengine.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-600 hover:text-sky-700 flex items-center gap-1 shrink-0"
                    >
                      Verificar GEE <ExternalLink size={10} />
                    </a>
                  </div>

                  {connectingGoogle ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button
                          disabled
                          className="flex-1 bg-indigo-600/80 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 text-xs"
                        >
                          <Loader2 size={15} className="animate-spin" />
                          <span>A autenticar com a Conta Google...</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelConnect}
                          className="text-xs py-3 px-3 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                          Cancelar
                        </Button>
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                        Aguardando a janela do Google. Se não apareceu, verifique se o navegador bloqueou o pop-up (ícone na barra de endereços) ou se está atrás desta janela.
                      </p>
                    </div>
                  ) : geeConnected ? (
                    <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                        <span>Conta Google ligada. Não precisa de reconectar a menos que queira trocar de conta.</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleConnectGee}
                        className="text-xs text-slate-600 hover:text-sky-600 h-7 shrink-0 ml-2"
                      >
                        Trocar Conta
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleConnectGee}
                      disabled={geeLoading}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-sm flex items-center justify-center gap-2.5 text-xs transition-all"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Ligar com a Conta Google (Earth Engine)</span>
                    </Button>
                  )}
                </div>

                {/* Project ID Settings */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      ID do Projeto Google Cloud (GCP)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={projectIdInput}
                        onChange={(e) => setProjectIdInput(e.target.value)}
                        placeholder="geoprocessamento-426809"
                        className="text-xs font-mono bg-white dark:bg-slate-900 flex-1"
                      />
                      <Button
                        onClick={handleSaveProjectOnly}
                        disabled={savingProject}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 rounded-xl shrink-0"
                      >
                        {savingProject ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          "Guardar Projeto"
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      ID do projeto GCP onde a API do Earth Engine está ativada (ex: <code>geoprocessamento-426809</code> ou o projeto indicado no <a href="https://code.earthengine.google.com" target="_blank" rel="noreferrer" className="text-sky-600 underline">Code Editor</a>).
                    </p>
                    <a
                      href={`https://console.cloud.google.com/apis/library/earthengine.googleapis.com?project=${projectIdInput.trim() || "geoprocessamento-426809"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-sky-600 hover:underline inline-flex items-center gap-1"
                    >
                      Ativar Earth Engine API neste projeto na Consola GCP <ExternalLink size={9} />
                    </a>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={testing}
                      className="text-xs rounded-xl"
                    >
                      {testing ? (
                        <Loader2 size={13} className="animate-spin mr-1.5" />
                      ) : (
                        <RefreshCw size={13} className="mr-1.5" />
                      )}
                      Testar Conexão em Tempo Real
                    </Button>
                  </div>
                </div>

                {/* Advanced Options (Collapsible for IT / Admins only) */}
                <details className="pt-2 border-t border-slate-200 dark:border-slate-700 group">
                  <summary className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer flex items-center justify-between py-1 select-none">
                    <span className="flex items-center gap-1.5">
                      <KeyRound size={13} className="text-amber-500" />
                      Opções Avançadas (Administradores / Chave de Serviço JSON)
                    </span>
                    <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>

                  <div className="pt-3 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                        E-mail da Conta de Serviço (Opcional)
                      </label>
                      <Input
                        type="text"
                        value={accountInput}
                        onChange={(e) => setAccountInput(e.target.value)}
                        placeholder="ex: geoanalises@geoprocessamento-426809.iam.gserviceaccount.com"
                        className="text-xs bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                        Conteúdo da Chave de Serviço (JSON)
                      </label>
                      <textarea
                        value={saKeyInput}
                        onChange={(e) => setSaKeyInput(e.target.value)}
                        placeholder={`{\n  "type": "service_account",\n  "project_id": "geoprocessamento-426809",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----...",\n  "client_email": "geoanalises@geoprocessamento-426809.iam.gserviceaccount.com"\n}`}
                        rows={4}
                        className="w-full text-[11px] font-mono p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                      <p className="text-[10px] text-slate-500">
                        Esta opção é reservada para ambientes de servidor ou contas de serviço dedicadas. Utilizadores normais devem utilizar o botão "Ligar com a Conta Google" acima.
                      </p>
                    </div>

                    <Button
                      onClick={handleSaveServiceAccount}
                      disabled={savingSa || !saKeyInput.trim()}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                    >
                      {savingSa ? (
                        <>
                          <Loader2 size={13} className="animate-spin mr-1.5" />
                          A guardar chave...
                        </>
                      ) : (
                        "Guardar Chave de Serviço"
                      )}
                    </Button>
                  </div>
                </details>

                {geeError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{geeError}</span>
                  </div>
                )}
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
