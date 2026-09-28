import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useGeeAuth } from "@/hooks/useGeeAuth";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const {
    geeConnected,
    geeProject,
    loading,
    error,
    connectGee,
    disconnectGee,
    refreshStatus,
  } = useGeeAuth();

  const [projectId, setProjectId] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(geeProject ?? "");
    setActionMessage(null);
    void refreshStatus();
  }, [open, geeProject, refreshStatus]);

  async function handleConnect() {
    const project = projectId.trim();
    if (!project) {
      setActionMessage(
        "Indique o Google Cloud Project ID que tem o Earth Engine habilitado.",
      );
      return;
    }

    setActionMessage(null);
    await connectGee(project);
    await refreshStatus();
  }

  async function handleDisconnect() {
    setActionMessage(null);
    await disconnectGee();
  }

  async function handleTest() {
    setActionMessage(null);
    await refreshStatus();
    setActionMessage(
      "Estado actualizado a partir de uma verificação real no Earth Engine.",
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[580px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Settings size={20} className="text-slate-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">Configurações</DialogTitle>
              <DialogDescription>
                Ligue a sua conta e o seu projecto Google Earth Engine ao GeoMoz.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-6">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <Globe size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                Google Earth Engine
              </span>

              {loading ? (
                <Badge variant="outline" className="ml-auto gap-1.5 text-xs">
                  <Loader2 size={10} className="animate-spin" />
                  A verificar…
                </Badge>
              ) : geeConnected ? (
                <Badge className="ml-auto gap-1 border-0 bg-emerald-500 text-xs text-white hover:bg-emerald-500">
                  <CheckCircle2 size={10} />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive" className="ml-auto gap-1 text-xs">
                  <XCircle size={10} />
                  Desconectado
                </Badge>
              )}
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1 text-xs text-slate-400">Estado</p>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={[
                        "h-2 w-2 rounded-full",
                        geeConnected ? "bg-emerald-500" : "bg-slate-300",
                      ].join(" ")}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {geeConnected ? "Operacional" : "Não conectado"}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1 text-xs text-slate-400">Projecto GCP</p>
                  <p className="truncate font-mono text-sm font-medium text-slate-700">
                    {geeProject || "—"}
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  <XCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {actionMessage && (
                <div className="flex items-start gap-2.5 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-700">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <span>{actionMessage}</span>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => void handleTest()}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Verificar ligação
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <KeyRound size={16} className="text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">
                O seu projecto Earth Engine
              </span>
              <Badge variant="outline" className="ml-auto gap-1 text-xs">
                <ShieldCheck size={10} className="text-emerald-500" />
                BYO-GEE
              </Badge>
            </div>

            <div className="space-y-4 p-4">
              <div className="flex items-start gap-3 rounded-lg border border-sky-100 bg-sky-50 p-3">
                <Info size={16} className="mt-0.5 shrink-0 text-sky-500" />
                <div>
                  <p className="text-sm font-medium text-sky-800">
                    As análises usam o seu próprio projecto Google Cloud
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-sky-700">
                    O GeoMoz solicita acesso ao Earth Engine por OAuth. Não cole
                    service-account JSON nem chaves privadas nesta interface.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gee-project-id"
                  className="text-sm font-medium text-slate-700"
                >
                  Google Cloud Project ID
                </label>
                <Input
                  id="gee-project-id"
                  value={projectId}
                  onChange={event => setProjectId(event.target.value)}
                  placeholder="ex.: meu-projecto-earth-engine"
                  className="font-mono"
                  disabled={loading}
                />
                <p className="text-xs leading-relaxed text-slate-400">
                  O projecto deve ter o Earth Engine habilitado e a sua conta
                  deve ter permissão para o utilizar.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => void handleConnect()}
                  disabled={loading || !projectId.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  {geeConnected ? "Reconectar / trocar projecto" : "Conectar com Google"}
                </Button>

                {geeConnected && (
                  <Button
                    variant="outline"
                    onClick={() => void handleDisconnect()}
                    disabled={loading}
                    className="text-slate-600"
                  >
                    <LogOut size={14} />
                    Desligar GEE
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="space-y-1 px-4 py-3">
              <a
                href="https://code.earthengine.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-2.5">
                  <ExternalLink size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">
                    Google Earth Engine
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-300 group-hover:text-slate-500"
                />
              </a>

              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-900">
                    Google Cloud Console
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-300 group-hover:text-slate-500"
                />
              </a>
            </div>
          </div>

          <div className="pb-2 text-center text-xs text-slate-400">
            GeoMoz Explorer · Earth Engine por utilizador
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
