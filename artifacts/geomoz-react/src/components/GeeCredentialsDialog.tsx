import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGeeAuth } from "../hooks/useGeeAuth";
import { useAuth } from "../hooks/useAuth";
import { 
  ShieldCheck, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Globe2, 
  ExternalLink,
  Layers
} from "lucide-react";

export default function GeeCredentialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const { geeConnected, loading, error, connectGee, disconnectGee } = useGeeAuth();
  const [projectInput, setProjectInput] = useState("");

  const handleConnect = async () => {
    try {
      await connectGee(projectInput.trim() || undefined);
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-white shadow-2xl border border-slate-200">
        <DialogHeader className="px-6 py-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <Globe2 size={18} />
            </div>
            <DialogTitle className="text-base font-semibold text-white">
              Google Earth Engine OAuth
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-300">
            Execute análises geoespaciais com a sua própria conta Google do GEE
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="block font-semibold">Falha na ligação:</strong>
                <p className="leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Connected State */}
          {geeConnected ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={22} className="text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-emerald-900">Earth Engine Ligado</h4>
                  <p className="text-xs text-emerald-700 truncate max-w-[240px]">
                    {user?.email || "Quota & Projeto Ativos"}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Layers size={14} className="text-indigo-600" />
                  <span>Capacidades desbloqueadas:</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Curvas de nível, detecção de lineamentos, índices espectrais Sentinel-2 & Landsat em tempo real via GEE.
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 text-xs py-2 h-auto"
                onClick={disconnectGee}
                disabled={loading}
              >
                <LogOut size={14} className="mr-2" />
                Terminar Sessão / Desligar GEE
              </Button>
            </div>
          ) : (
            /* Not Connected State */
            <div className="space-y-4">
              <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-4 text-xs text-sky-900 space-y-2">
                <p className="leading-relaxed">
                  Para aceder a análises completas, inicie sessão com a sua <strong>conta Google que tenha acesso ao Google Earth Engine</strong>.
                </p>
                <a
                  href="https://code.earthengine.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-700 font-semibold hover:underline text-[11px]"
                >
                  Abrir GEE Code Editor para verificar conta <ExternalLink size={10} />
                </a>
              </div>

              {/* Optional Project ID Input */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-600">
                  GCP Project ID (opcional):
                </label>
                <input
                  type="text"
                  placeholder="ex: ee-meu-projeto ou deixe em branco"
                  value={projectInput}
                  onChange={(e) => setProjectInput(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              {/* Main Login / Connect Button */}
              <Button
                onClick={handleConnect}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 h-auto shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>A ligar ao Google...</span>
                  </>
                ) : (
                  <>
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
                    <span>Ligar com a Conta Google</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
