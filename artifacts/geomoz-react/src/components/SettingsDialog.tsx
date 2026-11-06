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
  CreditCard,
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
  BookOpen,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  Cloud,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { diagnoseGeeApi } from "@/lib/gee-connection-diagnostics";
import { validateRealSentinel2Ndvi } from "@/lib/gee-ndvi-validation";
import { useGeoMozTheme } from "@/hooks/useGeoMozTheme";
import { useGeoMozPreferences } from "@/hooks/useGeoMozPreferences";
import { usePortalTranslation } from "@/i18n/usePortalTranslation";
import { GEOLIBRE_LANGUAGE_OPTIONS, PORTAL_TRANSLATED_LANGUAGES } from "@/i18n/portal";
import GeoMozBrandIcon from "@/components/GeoMozBrandIcon";
import { Link } from "wouter";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
}

type SettingsTab = "gee" | "profile" | "preferences" | "storage" | "billing" | "documentation";

export default function SettingsDialog({ open, onOpenChange, embedded = false }: SettingsDialogProps) {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useGeoMozTheme();
  const { language: uiLanguage, setLanguage: setUiLanguage, reducedMotion, setReducedMotion } = useGeoMozPreferences();
  const { t, translatedLocale } = usePortalTranslation();
  const {
    geeConnected,
    oauthReady,
    geeProject,
    geeAccount,
    isPermanent,
    hasRefreshToken,
    loading: geeLoading,
    error:    geeError,
    connectGee,
    setProjectOnly,
    saveCredentials,
    disconnectGee,
    refreshStatus,
  } = useGeeAuth();
  const { projects } = useProject();
  const [adminAccess, setAdminAccess] = React.useState(false);
  React.useEffect(() => {
    if (!open || !user || user.uid === "guest_user") { setAdminAccess(false); return; }
    let active = true;
    apiFetch("/geomoz-api/admin/me")
      .then(response => { if (active) setAdminAccess(response.ok); })
      .catch(() => { if (active) setAdminAccess(false); });
    return () => { active = false; };
  }, [open, user?.uid]);

  const [activeTab, setActiveTab] = useState<SettingsTab>("gee");
  const uid = user?.uid;
  const [usageResult, setUsageResult] = useState<{
    uid: string;
    usage: {
      plan: string;
      periodEnd: string | null;
      projectsUsed: number;
      projectLimit: number | null;
      remainingCredits: number | null;
      creditLimit: number | null;
      creditsUsed: number;
      creditsReserved: number;
      creditResetAt: string;
    } | null;
  }>();
  const usage = usageResult?.uid === uid ? usageResult?.usage : undefined;
  React.useEffect(() => {
    if (!(open || embedded) || activeTab !== "billing" || !uid || uid.startsWith("guest_")) return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await apiFetch("/geomoz-api/billing/usage", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));
        const snapshot = await response.json();
        if (!controller.signal.aborted) setUsageResult({ uid, usage: snapshot });
      } catch {
        if (!controller.signal.aborted) setUsageResult({ uid, usage: null });
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [open, embedded, activeTab, uid, projects.length]);
  const [projectIdInput, setProjectIdInput] = useState(
    geeProject && geeProject !== "eengine-project" ? geeProject : "geoprocessamento-426809"
  );
  const [accountInput, setAccountInput] = useState(geeAccount || "");
  const [saKeyInput, setSaKeyInput] = useState("");
  const [showSaInput, setShowSaInput] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingSa, setSavingSa] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testingNdvi, setTestingNdvi] = useState(false);
  const [ndviResult, setNdviResult] = useState<{ success: boolean; message: string } | null>(null);
  const [checkingApi, setCheckingApi] = useState(false);
  const [apiCheckResult, setApiCheckResult] = useState<{ connected: boolean; message: string } | null>(null);

  // Sync inputs with active context and user profile
  React.useEffect(() => {
    setProjectIdInput(geeProject && geeProject !== "eengine-project" ? geeProject : "geoprocessamento-426809");
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
        message: err?.message || t("settings.feedback.saveProjectError"),
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
        message: err?.message || t("settings.feedback.saveKeyError"),
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
        message: t("settings.feedback.googleAuthorized"),
      });
    } catch (err: any) {
      console.error(err);
      setTestResult({
        connected: false,
        message: err?.message || t("settings.feedback.googleAuthError"),
      });
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleRetryApi = async () => {
    setCheckingApi(true);
    setApiCheckResult(null);
    try {
      const diagnostic = await diagnoseGeeApi();
      setApiCheckResult({
        connected: diagnostic.connected,
        message: diagnostic.message,
      });
      if (diagnostic.apiOnline) {
        await refreshStatus();
      }
    } catch (err) {
      setApiCheckResult({
        connected: false,
        message: err instanceof Error ? err.message : t("settings.feedback.apiDiagnosticError"),
      });
    } finally {
      setCheckingApi(false);
    }
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
      if (!res.ok) {
        throw new Error(data.detail || data.message || `${t("settings.feedback.httpError")} ${res.status}.`);
      }
      if (data.connected && data.user_connected) {
        setTestResult({
          connected: true,
          message: `${t("settings.feedback.connected")} ${t("settings.feedback.project")} ${data.project || t("settings.feedback.default")} (${data.auth_type || t("settings.feedback.verifiedQuota")}). ${data.message || ""}`,
        });
      } else {
        setTestResult({
          connected: false,
          message: data.message || t("settings.feedback.geePending"),
        });
      }
    } catch (e: any) {
      setTestResult({
        connected: false,
        message: e.message || t("settings.feedback.serverError"),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleValidateRealNdvi = async () => {
    setTestingNdvi(true);
    setNdviResult(null);
    try {
      const result = await validateRealSentinel2Ndvi();
      setNdviResult({
        success: true,
        message: `${result.message} ${t("settings.feedback.period")} ${result.dateRange}. ${t("settings.feedback.area")} ${result.projectNote}.`,
      });
    } catch (caught) {
      setNdviResult({
        success: false,
        message: caught instanceof Error ? caught.message : t("settings.feedback.ndviError"),
      });
    } finally {
      setTestingNdvi(false);
    }
  };

  const handleSavePreferences = () => {
    try {
      localStorage.setItem("geomoz_preferred_basemap", preferredBasemap);
      alert(t("settings.feedback.preferencesSaved"));
    } catch {}
  };


  const selectedLanguageName = GEOLIBRE_LANGUAGE_OPTIONS.find(option => option.code === uiLanguage)?.nativeName ?? uiLanguage;
  const localeBase = uiLanguage.toLowerCase().replace(/_/g, "-").split("-")[0];
  const isPortalReviewed = PORTAL_TRANSLATED_LANGUAGES.some(code => code === localeBase);

  const sections: { id: SettingsTab; label: string; subtitle: string; Icon: typeof Cpu }[] = [
    { id: "gee", label: "Google Earth Engine", subtitle: t("settings.section.geeSubtitle"), Icon: Cpu },
    { id: "profile", label: t("settings.accountTab"), subtitle: t("settings.section.profileSubtitle"), Icon: User },
    { id: "preferences", label: t("settings.preferencesTab"), subtitle: t("settings.section.preferencesSubtitle"), Icon: Sliders },
    { id: "storage", label: t("settings.storageTab"), subtitle: t("settings.section.storageSubtitle"), Icon: Database },
    { id: "billing", label: t("settings.billingTab"), subtitle: t("settings.section.billingSubtitle"), Icon: CreditCard },
    { id: "documentation", label: t("sidebar.nav.docs"), subtitle: t("settings.section.documentationSubtitle"), Icon: BookOpen },
  ];

  const settingsBody = (
        <div className="min-w-0 space-y-5">
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
                      {geeConnected
                        ? isPermanent
                          ? t("settings.gee.renewable")
                          : t("settings.gee.temporary")
                        : t("settings.gee.pending")}
                    </h4>
                    <p
                      className={`text-xs mt-0.5 ${
                        geeConnected ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {geeConnected
                        ? `${t("settings.gee.linkedProject")} ${geeProject || "geoprocessamento-426809"} | ${t("settings.gee.googleAccount")} ${geeAccount || t("settings.gee.authorized")}`
                        : `${t("settings.gee.selectedProject")} ${geeProject || "geoprocessamento-426809"}. ${t("settings.gee.connectPrompt")}`}
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
                    {t("settings.gee.disconnect")}
                  </Button>
                )}
              </div>

              {/* Main 1-Click Connect Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <div className="space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-sky-500" />
                      {t("settings.gee.personalAccess")}
                    </h4>
                    {user ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 font-medium self-start sm:self-auto">
                        {t("settings.gee.profile")} {user.email || user.displayName || t("settings.gee.registeredUser")}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium self-start sm:self-auto">
                        {t("settings.gee.guestMode")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t("settings.gee.personalAccessInfo")}
                  </p>
                </div>

                {/* 1-Click Google OAuth Button */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {geeConnected ? t("settings.gee.linkedAccount") : t("settings.gee.authorization")}
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {geeConnected
                          ? `${t("settings.gee.authorizedAccount")} ${geeAccount || "Google Earth Engine"}. ${isPermanent ? t("settings.gee.renewableConfigured") : t("settings.gee.temporaryInfo")}`
                          : t("settings.gee.signInInfo")}
                      </p>
                    </div>
                    <a
                      href="https://code.earthengine.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-sky-600 underline underline-offset-2 hover:bg-sky-50 hover:text-sky-800 dark:hover:bg-slate-800"
                    >
                      {t("settings.gee.verify")} <ExternalLink size={10} />
                    </a>
                  </div>

                  {connectingGoogle ? (
                    <div className="space-y-2.5 p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl">
                      <div className="flex items-center gap-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
                        <Loader2 size={15} className="animate-spin" />
                        {t("settings.gee.connecting")}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t("settings.gee.oauthPopupInfo")}
                      </p>
                    </div>
                  ) : geeConnected ? (
                    <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                      <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                        <span>{t("settings.gee.connectedHint")}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleConnectGee}
                        className="text-xs text-slate-600 hover:text-sky-600 h-7 shrink-0 ml-2"
                      >
                        {t("settings.gee.switchAccount")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
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
                        <span>{t("settings.gee.connectGoogle")}</span>
                      </Button>
                      {!oauthReady && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                          {t("settings.gee.serverUnconfirmed")}
                        </div>
                      )}
                      <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRetryApi}
                            disabled={checkingApi}
                            className="self-start min-h-9 border-sky-300 bg-white px-3 text-xs font-semibold text-sky-800 hover:bg-sky-50 dark:bg-slate-900 dark:text-sky-300"
                          >
                            {checkingApi ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
                            {checkingApi ? t("settings.gee.checkingApi") : t("settings.gee.retryApi")}
                          </Button>
                      {apiCheckResult && (
                        <div
                          role="status"
                          aria-live="polite"
                          className={`rounded-lg border p-3 text-xs leading-relaxed ${apiCheckResult.connected
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}
                        >
                          {apiCheckResult.message}
                        </div>
                      )}
                      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                        {t("settings.gee.popupInfo")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Project ID Settings */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      {t("settings.gee.projectId")}
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
                          t("settings.gee.saveProject")
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {t("settings.gee.projectIdHelp")} <code>geoprocessamento-426809</code> {t("settings.gee.projectIdHelpEnd")} <a href="https://code.earthengine.google.com" target="_blank" rel="noreferrer" className="text-sky-600 underline">Code Editor</a>).
                    </p>
                    <a
                      href={`https://console.cloud.google.com/apis/library/earthengine.googleapis.com?project=${projectIdInput.trim() && projectIdInput.trim() !== "eengine-project" ? projectIdInput.trim() : "geoprocessamento-426809"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-sky-600 hover:underline inline-flex items-center gap-1"
                    >
                      {t("settings.gee.enableApi")} <ExternalLink size={9} />
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
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
                      {t("settings.gee.testConnection")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleValidateRealNdvi}
                      disabled={testingNdvi || !geeConnected}
                      className="text-xs rounded-xl border-emerald-300 text-emerald-800 dark:text-emerald-300"
                      title={!geeConnected ? t("settings.gee.ndviRequiresLogin") : t("settings.gee.ndviTooltip")}
                    >
                      {testingNdvi ? (
                        <Loader2 size={13} className="animate-spin mr-1.5" />
                      ) : (
                        <Layers size={13} className="mr-1.5" />
                      )}
                      {testingNdvi ? t("settings.gee.processingS2") : t("settings.gee.testNdvi")}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t("settings.gee.ndviDescription")}
                    {!geeConnected && <> {t("settings.gee.connectFirst")}</>}
                  </p>
                  {ndviResult && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`rounded-xl border p-3 text-xs leading-relaxed ${ndviResult.success
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "border-red-200 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200"}`}
                    >
                      {ndviResult.message}
                    </div>
                  )}
                </div>

                {/* Advanced Options (Collapsible for IT / Admins only) */}
                <details className="pt-2 border-t border-slate-200 dark:border-slate-700 group">
                  <summary className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer flex items-center justify-between py-1 select-none">
                    <span className="flex items-center gap-1.5">
                      <KeyRound size={13} className="text-amber-500" />
                      {t("settings.gee.advanced")}
                    </span>
                    <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>

                  <div className="pt-3 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                        {t("settings.gee.serviceEmail")}
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
                        {t("settings.gee.serviceKey")}
                      </label>
                      <textarea
                        value={saKeyInput}
                        onChange={(e) => setSaKeyInput(e.target.value)}
                        placeholder={`{\n  "type": "service_account",\n  "project_id": "geoprocessamento-426809",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----...",\n  "client_email": "geoanalises@geoprocessamento-426809.iam.gserviceaccount.com"\n}`}
                        rows={4}
                        className="w-full text-[11px] font-mono p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t("settings.gee.serviceKeyHelp")}
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
                          {t("settings.gee.savingKey")}
                        </>
                      ) : (
                        t("settings.gee.saveKey")
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
                  {t("settings.gee.quotaResources")}
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
                        <img src={user.photoURL} alt={user.displayName || t("settings.account.user")} className="w-full h-full object-cover" />
                      ) : (
                        user.email?.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {user.displayName || t("settings.account.researcher")}
                      </h4>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <div>
                      {t("settings.account.accessUid")} <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200">{user.uid}</span>
                    </div>
                    <div>
                      {t("dashboard.status")} <span className="font-semibold text-emerald-600">{t("settings.account.authenticated")}</span>
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
                      {t("settings.account.signOut")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center space-y-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <User size={32} className="mx-auto text-slate-400" />
                  <p className="text-xs text-slate-500">
                    {t("settings.account.signInHint")}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="space-y-4">
              <section className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4" aria-label={t("settings.interfaceSection")}>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{t("settings.interfaceSection")}</h4>
                <label className="flex flex-col gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{t("settings.languageLabel")}</span>
                  <select data-testid="geomoz-portal-language" aria-label={t("settings.languageLabel")}
                    value={uiLanguage}
                    onChange={event=>setUiLanguage(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <optgroup label={t("settings.portalLanguages")}>
                      {GEOLIBRE_LANGUAGE_OPTIONS.filter(option =>
                        PORTAL_TRANSLATED_LANGUAGES.some(code => code === option.code)
                      ).map(option => <option key={option.code} value={option.code}>{option.nativeName}</option>)}
                    </optgroup>
                    <optgroup label={t("settings.nativeLanguages")}>
                      {GEOLIBRE_LANGUAGE_OPTIONS.filter(option =>
                        !PORTAL_TRANSLATED_LANGUAGES.some(code => code === option.code)
                      ).map(option => <option key={option.code} value={option.code}>{option.nativeName}</option>)}
                    </optgroup>
                  </select>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{t("settings.languageHint")}</span>
                  {isPortalReviewed ? (
                    <span data-testid="geomoz-language-reviewed-info" className="block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{t("settings.languageReviewedDescription")}</span>
                  ) : (
                    <span data-testid="geomoz-language-fallback" role="status" className="block rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      <strong className="mb-1 block">{t("settings.languagePartialTitle")}</strong>
                      <span>{t("settings.languagePartialDescription").replace("{name}", selectedLanguageName)}</span>
                    </span>
                  )}
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{t("settings.appearance")}</span>
                  <select aria-label={t("settings.appearanceAria")} value={theme} onChange={event=>setTheme(event.target.value as "light"|"dark")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <option value="light">{t("settings.light")}</option><option value="dark">{t("settings.dark")}</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">{t("settings.reduceMotion")}</span>
                  <input type="checkbox" data-testid="geomoz-portal-reduced-motion" checked={reducedMotion}
                    onChange={event=>setReducedMotion(event.target.checked)} className="h-4 w-4 accent-sky-600"/>
                </label>
                <a href="/gis-workspace/" className="inline-flex text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">
                  {t("settings.openWorkspace")}
                </a>
              </section>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  {t("settings.basemap")}
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
                    {t("settings.basemapHybrid")}
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
                    {t("settings.basemapSatellite")}
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
                    {t("settings.basemapTerrain")}
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
                    {t("settings.savePreferences")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "documentation" && (
            <section className="space-y-4" aria-label={t("settings.documentation.title")}>
              <div className="relative overflow-hidden rounded-2xl border border-sky-200/80 dark:border-sky-800/50 bg-gradient-to-br from-sky-50 via-white to-indigo-50 dark:from-sky-950/40 dark:via-slate-900 dark:to-indigo-950/30 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300">
                    <BookOpen size={22}/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{t("settings.documentation.title")}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {t("settings.documentation.description")}
                    </p>
                  </div>
                </div>
                <a
                  href="/documentacao"
                  onClick={() => onOpenChange(false)}
                  data-testid="settings-open-documentation"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-sky-500/15 transition hover:brightness-110 sm:w-auto"
                >
                  {t("settings.documentation.open")} <ArrowUpRight size={16}/>
                </a>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [t("settings.documentation.guides"), t("settings.documentation.guidesDescription")],
                  [t("settings.documentation.science"), t("settings.documentation.scienceDescription")],
                  [t("settings.documentation.data"), t("settings.documentation.dataDescription")],
                  [t("settings.documentation.roadmap"), t("settings.documentation.roadmapDescription")],
                ].map(([heading, description]) => (
                  <div key={heading} className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/75 dark:bg-slate-800/50 p-3.5">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{heading}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "billing" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-slate-50">{usage?.plan ? usage.plan[0].toUpperCase() + usage.plan.slice(1) : t("settings.billingTab")}</h4>
                  <p className="text-xs text-slate-500">{t("settings.billingDescription")}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div className="text-xs text-slate-500">{t("settings.projectQuota")}</div>
                    <div className="font-bold mt-1">{usage ? `${usage.projectsUsed} / ${usage.projectLimit ?? t("settings.unlimited")}` : "—"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                    <div className="text-xs text-slate-500">{t("settings.remainingCredits")}</div>
                    <div className="font-bold mt-1">{usage ? usage.remainingCredits ?? t("settings.custom") : "—"}</div>
                  </div>
                </div>
                {usage && (
                  <section aria-label="Consumo de créditos GeoMoz" className="rounded-xl border border-sky-200/60 bg-white/75 p-3.5 dark:border-sky-900/50 dark:bg-slate-900/70">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-700 dark:text-sky-300">Créditos GeoMoz · {new Date().toISOString().slice(0,7)}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {usage.creditsUsed} utilizado(s){usage.creditsReserved ? ` · ${usage.creditsReserved} em análise` : ""}
                      </span>
                    </div>
                    {usage.creditLimit !== null && (
                      <div role="progressbar" aria-label="Percentagem de créditos utilizados"
                        aria-valuemin={0} aria-valuenow={usage.creditsUsed} aria-valuemax={usage.creditLimit}
                        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-600"
                          style={{width: `${Math.min(100, usage.creditLimit > 0 ? 100*usage.creditsUsed/usage.creditLimit : 0)}%`}} />
                      </div>
                    )}
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      Os créditos GeoMoz são distintos das quotas do Google Earth Engine. O débito automático será aplicado gradualmente às ferramentas elegíveis.
                    </p>
                  </section>
                )}
                {usage?.periodEnd && (
                  <p className="text-xs text-slate-500">{t("settings.validUntil")} {new Date(usage.periodEnd).toLocaleDateString(translatedLocale === "pt" ? "pt-MZ" : translatedLocale)}. {t("settings.renewalHint")}</p>
                )}
                <p className="text-xs text-slate-500" role="status">
                  {!uid || uid.startsWith("guest_") ? t("settings.billingSignIn")
                    : usage === null ? t("settings.billingUnavailable")
                    : !usage ? t("settings.billingLoading")
                    : `${t("settings.creditReset")} ${new Date(usage.creditResetAt).toISOString().slice(0, 10)} (UTC)`}
                </p>
                <a href="/planos" className="inline-flex items-center gap-2 rounded-lg bg-sky-600 text-white px-4 py-2 text-sm font-semibold hover:bg-sky-700">
                  <CreditCard size={16} /> {t("settings.plansAndPayments")}
                </a>
                <p className="text-xs text-slate-500">{t("settings.cloudQuotaNote")}</p>
              </div>
            </div>
          )}

          {activeTab === "storage" && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  {t("settings.storageSummary")}
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-400 text-[11px]">{t("settings.projectQuota")}</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">
                      {projects.length}
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-slate-400 text-[11px]">{t("settings.cloudStatus")}</div>
                    <div className="text-sm font-bold text-emerald-600 mt-0.5">{t("settings.synced")}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
  );

  if (embedded) {
    const current = sections.find(section => section.id === activeTab) ?? sections[0];
    const CurrentIcon = current.Icon;
    return (
      <div data-testid="geomoz-settings-page" data-geomoz-system="settings"
        className={theme === "dark"
          ? "dark min-h-screen bg-slate-950 text-slate-100"
          : "min-h-screen bg-[#f5f8fd] text-slate-900"}>
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
              <GeoMozBrandIcon className="h-9 w-9 rounded-xl shadow-sm" width={36} height={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black tracking-tight">GeoMoz <span className="text-sky-600 dark:text-sky-400">Explorer</span></span>
                <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{t("settings.title")}</span>
              </span>
            </Link>
            <Link href="/dashboard" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>{t("settings.chrome.back")}</span>
            </Link>
          </div>
        </header>
        <main className="relative isolate overflow-hidden px-4 pb-14 pt-8 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-r from-sky-100/70 via-white to-indigo-100/70 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950/30" />
          <div className="mx-auto max-w-7xl space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-600/15">
                  <Settings size={25} aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t("settings.title")}</h1>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t("settings.subtitle")}</p>
                </div>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-sky-200 bg-white/85 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300 lg:flex">
                <ShieldCheck size={15} aria-hidden="true" /> {t("settings.chrome.accountPreferences")}
              </div>
            </div>
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
              <nav aria-label={t("settings.chrome.sectionNav")} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 lg:sticky lg:top-24">
                <h2 className="px-3 pb-3 pt-2 text-sm font-bold text-slate-900 dark:text-white">{t("sidebar.settings")}</h2>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
                  {sections.map(({id, label, subtitle, Icon}) => (
                    <button key={id} type="button" data-testid={`settings-section-${id}`}
                      onClick={() => setActiveTab(id)}
                      aria-current={activeTab === id ? "page" : undefined}
                      className={`group flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${activeTab === id
                        ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "text-slate-700 hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
                      <Icon size={19} className="shrink-0" aria-hidden="true"/>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold sm:text-sm">{label}</span>
                        <span className={`mt-0.5 hidden text-[11px] leading-snug lg:block ${activeTab === id ? "text-sky-100" : "text-slate-500 dark:text-slate-400"}`}>{subtitle}</span>
                      </span>
                    </button>
                  ))}
                  {adminAccess && <Link href="/administracao" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-slate-800"><ShieldCheck size={18}/>{t("settings.chrome.admin")}</Link>}
                </div>
              </nav>
              <section aria-labelledby="settings-current-section" className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 lg:p-7">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-slate-800 dark:text-sky-400 dark:ring-slate-700">
                      <CurrentIcon size={23} aria-hidden="true"/>
                    </div>
                    <div className="min-w-0">
                      <h2 id="settings-current-section" className="text-lg font-black tracking-tight sm:text-xl">{current.label}</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{current.subtitle}</p>
                    </div>
                  </div>
                  {activeTab === "gee" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
                      <Cloud size={14} aria-hidden="true" /> {t("settings.chrome.cloudProcessing")}
                    </span>
                  )}
                </div>
                {settingsBody}
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
                {t("settings.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300 mt-0.5">
                {t("settings.subtitle")}
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
              <span>{t("settings.accountTab")}</span>
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
              <span>{t("settings.preferencesTab")}</span>
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
              <span>{t("settings.storageTab")}</span>
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${activeTab === "billing" ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
            >
              <CreditCard size={14} />
              <span>{t("settings.billingTab")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("documentation")}
              className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 " +
                (activeTab === "documentation" ? "bg-sky-500 text-white shadow-sm" : "text-slate-400 hover:text-white")}
              data-testid="settings-documentation-tab"
            >
              <BookOpen size={14} />
              <span>{t("sidebar.nav.docs")}</span>
            </button>
            {adminAccess && <a href="/administracao" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-300 hover:bg-white/10 shrink-0">
              <ShieldCheck size={14} /> {t("settings.chrome.admin")}
            </a>}
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">{settingsBody}</div>
      </DialogContent>
    </Dialog>
  );
}
