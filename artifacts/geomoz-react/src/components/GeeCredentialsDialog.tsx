import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGeeAuth } from "../hooks/useGeeAuth";
import { ShieldCheck, LogOut, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function GeeCredentialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const { geeConnected, loading, connectGee, disconnectGee } = useGeeAuth();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-slate-200/60 shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-slate-50/50 border-b border-slate-200/50">
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <ShieldCheck size={18} className="text-emerald-500" />
            Configuração do Google Earth Engine
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {!user ? (
            <div className="flex flex-col items-center justify-center p-6 bg-amber-50 rounded-lg border border-amber-100 text-center">
              <AlertTriangle size={32} className="text-amber-500 mb-3" />
              <h3 className="text-sm font-semibold text-amber-800 mb-1">Não autenticado</h3>
              <p className="text-xs text-amber-700">Faça login com a sua conta Google para ligar o Earth Engine.</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center p-6">A carregar...</div>
          ) : geeConnected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                <CheckCircle2 size={24} className="text-emerald-500" />
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800">Earth Engine Ligado</h3>
                  <p className="text-xs text-emerald-600">A usar o seu token Google OAuth2.</p>
                </div>
              </div>
              <Button variant="outline" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" onClick={disconnectGee}>
                <LogOut size={16} className="mr-2" /> Desligar Earth Engine
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <XCircle size={24} className="text-slate-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Earth Engine Desligado</h3>
                  <p className="text-xs text-slate-600">Ligue o Earth Engine para aceder às análises avançadas.</p>
                </div>
              </div>
              <Button onClick={() => connectGee()} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                Ligar ao GEE com a tua conta Google
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

