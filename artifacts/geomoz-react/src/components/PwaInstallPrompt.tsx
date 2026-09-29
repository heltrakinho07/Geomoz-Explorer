import React, { useState, useEffect } from "react";
import { Download, X, Smartphone, WifiOff, RefreshCw, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwa } from "@/lib/pwa";

export default function PwaInstallPrompt() {
  const { canInstall, isStandalone, isOnline, isIos, updateAvailable, promptInstall } = usePwa();
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lastDismissed = localStorage.getItem("geomoz_pwa_dismissed");
    if (!lastDismissed) {
      // Don't show immediately on first millisecond — wait 4 seconds for page to settle
      const timer = setTimeout(() => setDismissed(false), 4000);
      return () => clearTimeout(timer);
    }
    const daysSince = (Date.now() - Number(lastDismissed)) / (1000 * 60 * 60 * 24);
    if (daysSince > 5) {
      const timer = setTimeout(() => setDismissed(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("geomoz_pwa_dismissed", String(Date.now()));
    }
  };

  const handleInstall = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    const success = await promptInstall();
    if (success) {
      setDismissed(true);
    }
  };

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  // 1. Offline Indicator (Always visible when connection is lost)
  if (!isOnline) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-3 duration-300">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-600 text-white shadow-lg text-xs font-semibold backdrop-blur-md">
          <WifiOff size={14} className="animate-pulse" />
          <span>Modo Offline — A utilizar dados e mapas em cache</span>
        </div>
      </div>
    );
  }

  // 2. Update Available Banner
  if (updateAvailable) {
    return (
      <div className="fixed bottom-20 md:bottom-6 right-4 z-[9999] max-w-sm w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-5 duration-300">
        <div className="p-3.5 rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 text-white border border-sky-500/40 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <RefreshCw size={16} className="animate-spin" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">Atualização Disponível</div>
              <div className="text-[10px] text-slate-400">Nova versão do GeoMoz pronta</div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleReload}
            className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold h-8 px-3 rounded-xl shrink-0"
          >
            Atualizar
          </Button>
        </div>
      </div>
    );
  }

  // If already running standalone or dismissed or can't install, don't show prompt
  if (isStandalone || dismissed || (!canInstall && !isIos)) {
    return null;
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 right-3 sm:right-6 z-[9998] max-w-sm w-[calc(100vw-1.5rem)] animate-in slide-in-from-bottom-5 duration-300">
      <div className="p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
              <Smartphone size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold leading-tight">Instalar GeoMoz Explorer</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Acesso rápido no ecrã principal e funcionamento offline.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors shrink-0"
            aria-label="Fechar banner de instalação"
          >
            <X size={15} />
          </button>
        </div>

        {showIosGuide ? (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-2">
            <p className="font-semibold text-sky-600 dark:text-sky-400">Instalação no iPhone / iPad:</p>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">1</span>
              <span>Toque no botão <strong>Partilhar</strong> <Share size={12} className="inline mx-1 text-sky-500" /> no Safari</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px]">2</span>
              <span>Selecione <strong>"Adicionar ao Ecrã Principal"</strong> <PlusSquare size={12} className="inline mx-1 text-sky-500" /></span>
            </div>
          </div>
        ) : (
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2.5 py-1.5"
            >
              Mais tarde
            </button>
            <Button
              size="sm"
              onClick={handleInstall}
              className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs h-8 px-3.5 rounded-xl shadow-md shadow-sky-600/20"
            >
              <Download size={13} className="mr-1.5" />
              Instalar App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
