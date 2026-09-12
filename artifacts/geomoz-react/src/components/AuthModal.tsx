import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Globe,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

export type AuthMode = "login" | "register" | "forgot";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  onSuccess?: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  onSuccess,
}: AuthModalProps) {
  const [, setLocation] = useLocation();
  const {
    user,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    error: authError,
    clearError,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setLocalError(null);
      setResetSent(false);
      clearError();
    }
  }, [isOpen, initialMode]);

  // If user becomes logged in while modal is open, trigger success
  useEffect(() => {
    if (user && isOpen) {
      onSuccess?.();
      onClose();
    }
  }, [user, isOpen, onSuccess, onClose]);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || "Erro ao autenticar com a Google.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError("Por favor, introduza o seu endereço de e-mail.");
      return;
    }

    if (mode === "forgot") {
      setSubmitting(true);
      try {
        await resetPassword(email);
        setResetSent(true);
      } catch (err: any) {
        setLocalError(err?.message || "Erro ao enviar e-mail de recuperação.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) {
      setLocalError("Por favor, introduza a sua palavra-passe.");
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setLocalError("A palavra-passe deve conter pelo menos 6 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("As palavras-passe introduzidas não coincidem.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, name.trim() || undefined);
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setLocalError(err?.message || "Erro ao processar o formulário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestEntry = () => {
    onClose();
    setLocation("/app");
  };

  const displayError = localError || authError;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-2xl">
        {/* Header with gradient branding */}
        <DialogHeader className="px-6 pt-6 pb-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-2.5 mb-2 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Globe size={20} />
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-sky-400 block">
                GeoMoz Explorer
              </span>
              <DialogTitle className="text-lg font-bold text-white leading-tight">
                {mode === "login" && "Iniciar Sessão"}
                {mode === "register" && "Criar Conta Gratuita"}
                {mode === "forgot" && "Recuperar Palavra-passe"}
              </DialogTitle>
            </div>
          </div>

          <DialogDescription className="text-xs text-slate-300 relative z-10">
            {mode === "login" && "Aceda à sua área de análise de satélite, dados 3D e projetos."}
            {mode === "register" && "Junte-se à plataforma de inteligência geoespacial e modelação 3D."}
            {mode === "forgot" && "Introduza o seu e-mail para receber as instruções de recuperação."}
          </DialogDescription>

          {/* Mode Switcher Tabs */}
          {mode !== "forgot" && (
            <div className="flex gap-1 p-1 bg-white/10 rounded-xl mt-3 relative z-10">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setLocalError(null);
                  clearError();
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Iniciar Sessão
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setLocalError(null);
                  clearError();
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "register"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Criar Nova Conta
              </button>
            </div>
          )}
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* Error Message */}
          {displayError && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 animate-in fade-in duration-150">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-snug">
                <strong className="block font-semibold">Atenção:</strong>
                <p>{displayError}</p>
              </div>
            </div>
          )}

          {/* Reset password success notice */}
          {resetSent && (
            <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 animate-in fade-in duration-150">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">E-mail enviado!</strong>
                <p>Verifique a sua caixa de correio para redefinir a palavra-passe.</p>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 underline"
                >
                  Voltar ao início de sessão
                </button>
              </div>
            </div>
          )}

          {/* Google OAuth Quick Button */}
          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="w-full py-2.5 h-auto flex items-center justify-center gap-2.5 text-xs font-semibold border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl shadow-sm transition-all"
              >
                {/* Official Google Icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continuar com Google (Google Earth Engine)</span>
              </Button>

              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                <span className="uppercase font-medium tracking-wider">ou com e-mail</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

          {/* Email / Password Form */}
          {!resetSent && (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Full Name for Registration */}
              {mode === "register" && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <UserIcon size={12} className="text-slate-400" />
                    <span>Nome Completo</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Engenheiro(a) João Silva"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
              )}

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Mail size={12} className="text-slate-400" />
                  <span>Endereço de E-mail</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@instituicao.org ou gmail.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                />
              </div>

              {/* Password */}
              {mode !== "forgot" && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Lock size={12} className="text-slate-400" />
                      <span>Palavra-passe</span>
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setLocalError(null);
                        }}
                        className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        Esqueceu-se?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "register" ? "Mínimo de 6 caracteres" : "••••••••"}
                      className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirm Password for Registration */}
              {mode === "register" && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock size={12} className="text-slate-400" />
                    <span>Confirmar Palavra-passe</span>
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a palavra-passe"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-2.5 h-auto bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>A processar...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {mode === "login" && "Entrar na Conta"}
                      {mode === "register" && "Registar e Começar"}
                      {mode === "forgot" && "Enviar E-mail de Recuperação"}
                    </span>
                    <ArrowRight size={14} />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Quick Guest Access & Back to Login */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 text-center text-xs">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setLocalError(null);
                  setResetSent(false);
                }}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-medium"
              >
                ← Voltar ao Início de Sessão
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGuestEntry}
                className="inline-flex items-center justify-center gap-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 text-xs font-medium transition-colors"
              >
                <span>Continuar como Convidado (Explorar sem conta)</span>
                <ArrowRight size={12} />
              </button>
            )}

            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-1">
              <ShieldCheck size={12} className="text-emerald-500" />
              <span>Autenticação encriptada com Firebase Security & OAuth 2.0</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
