import {
  AlertTriangle,
  BrainCircuit,
  Droplet,
  FolderKanban,
  Satellite,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GeoMozWorkspaceTab } from "@/components/CommandCenter";
import GeoMozMark from "@/components/GeoMozMark";

interface WelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (tab: GeoMozWorkspaceTab) => void;
}

const WORKFLOWS: Array<{
  tab: GeoMozWorkspaceTab;
  title: string;
  description: string;
  icon: typeof Satellite;
  accent: string;
  badge: string;
}> = [
  {
    tab: "GeoMoz AI",
    title: "Pergunte ao território",
    description: "Descreva uma análise em linguagem natural e deixe o Ask GeoMoz escolher as ferramentas.",
    icon: BrainCircuit,
    accent: "from-violet-500 to-indigo-600",
    badge: "AI",
  },
  {
    tab: "GeoAnálises",
    title: "Observar mudanças",
    description: "Explore NDVI, índices espectrais, Sentinel/Landsat e targeting mineral.",
    icon: Satellite,
    accent: "from-emerald-500 to-teal-600",
    badge: "EO",
  },
  {
    tab: "Água Subterrânea",
    title: "Encontrar potencial hídrico",
    description: "Combine factores hidrogeológicos por AHP e visualize zonas prioritárias.",
    icon: Droplet,
    accent: "from-cyan-500 to-blue-600",
    badge: "AHP",
  },
  {
    tab: "Geoperigos",
    title: "Avaliar risco",
    description: "Analise cheias Sentinel-1, erosão RUSLE e outros indicadores territoriais.",
    icon: AlertTriangle,
    accent: "from-rose-500 to-orange-500",
    badge: "RISK",
  },
];

export default function WelcomeDialog({
  open,
  onOpenChange,
  onNavigate,
}: WelcomeDialogProps) {
  function choose(tab: GeoMozWorkspaceTab) {
    onOpenChange(false);
    window.setTimeout(() => onNavigate(tab), 0);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden border-0 bg-white p-0 shadow-2xl">
        <div className="relative overflow-hidden bg-slate-950 px-6 pb-6 pt-7 text-white">
          <div className="absolute -right-20 -top-28 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute -bottom-32 left-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative">
            <div className="mb-4 flex items-center gap-3">
              <GeoMozMark size={44} className="shrink-0 shadow-lg shadow-sky-950/30" />
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-white">
                  Bem-vindo ao GeoMoz
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-slate-400">
                  Inteligência geoespacial para transformar dados em decisões territoriais.
                </DialogDescription>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
              Não precisa começar por um módulo. Escolha o que pretende descobrir e o GeoMoz leva-o ao workflow certo.
              Use <strong className="text-white">Ctrl/Cmd + K</strong> em qualquer momento para abrir o Command Center.
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Começar por um objectivo</h3>
              <p className="mt-1 text-[11px] text-slate-400">Cada workflow usa o AOI e o projecto activos.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {WORKFLOWS.map(workflow => {
              const Icon = workflow.icon;
              return (
                <button
                  key={workflow.title}
                  type="button"
                  onClick={() => choose(workflow.tab)}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${workflow.accent} text-white shadow-sm`}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{workflow.title}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-slate-500">
                          {workflow.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {workflow.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <FolderKanban size={13} className="text-emerald-500" />
              <span>Para trabalho contínuo, crie um projecto e o GeoMoz guarda AOI, camadas e resultados.</span>
            </div>
            <button
              type="button"
              onClick={() => choose("Projetos")}
              className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-slate-800"
            >
              Abrir Projetos
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
