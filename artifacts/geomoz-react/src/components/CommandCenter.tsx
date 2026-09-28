import {
  AlertTriangle,
  BarChart2,
  BrainCircuit,
  Droplet,
  Droplets,
  FolderKanban,
  Globe,
  HelpCircle,
  LayoutDashboard,
  MapPin,
  Pen,
  Satellite,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export type GeoMozWorkspaceTab =
  | "Mapa"
  | "Projetos"
  | "Análise"
  | "GeoAnálises"
  | "Bacias Hidrográficas"
  | "Água Subterrânea"
  | "Geoperigos"
  | "GeoMoz AI"
  | "Dashboard"
  | "Exportar";

interface CommandCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (tab: GeoMozWorkspaceTab) => void;
  onDrawAOI: () => void;
  onOpenGee: () => void;
  onOpenSettings: () => void;
  onOpenWelcome: () => void;
  aoiLabel: string;
  projectName?: string | null;
}

const NAV_ITEMS: Array<{
  tab: GeoMozWorkspaceTab;
  label: string;
  description: string;
  icon: typeof Globe;
  keywords: string;
}> = [
  { tab: "Mapa", label: "Mapa", description: "Cartografia, geologia e AOI", icon: Globe, keywords: "mapa geologia cartografia" },
  { tab: "Projetos", label: "Projetos", description: "Workspaces persistentes", icon: FolderKanban, keywords: "projeto workspace guardar" },
  { tab: "GeoAnálises", label: "GeoAnálises", description: "Índices, satélite e targeting", icon: Satellite, keywords: "ndvi sentinel landsat indices satelite" },
  { tab: "Bacias Hidrográficas", label: "Bacias Hidrográficas", description: "Watershed, drenagem e hidrologia", icon: Droplets, keywords: "bacia hidro hidrologia watershed drenagem" },
  { tab: "Água Subterrânea", label: "Água Subterrânea", description: "Potencial hídrico e AHP", icon: Droplet, keywords: "agua groundwater ahp furo borehole" },
  { tab: "Geoperigos", label: "Geoperigos", description: "Cheias, erosão e risco", icon: AlertTriangle, keywords: "cheia inundacao erosao risco rusle flood" },
  { tab: "GeoMoz AI", label: "GeoMoz AI", description: "Ask GeoMoz e análises inteligentes", icon: BrainCircuit, keywords: "ai ia agente ask geomoz inteligencia" },
  { tab: "Dashboard", label: "Dashboard", description: "Estado, jobs e planos recentes", icon: LayoutDashboard, keywords: "dashboard jobs planos estado" },
  { tab: "Análise", label: "Estatísticas", description: "Resumo e métricas geológicas", icon: BarChart2, keywords: "estatisticas analise metricas" },
  { tab: "Exportar", label: "Exportar", description: "PDF, PNG, CSV, GeoJSON e mais", icon: Upload, keywords: "exportar pdf png csv geojson shapefile" },
];

export default function CommandCenter({
  open,
  onOpenChange,
  onNavigate,
  onDrawAOI,
  onOpenGee,
  onOpenSettings,
  onOpenWelcome,
  aoiLabel,
  projectName,
}: CommandCenterProps) {
  function run(action: () => void) {
    onOpenChange(false);
    window.setTimeout(action, 0);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-sky-950 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 ring-1 ring-sky-400/30">
            <Sparkles size={15} className="text-sky-300" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold">GeoMoz Command Center</div>
            <div className="truncate text-[10px] text-slate-400">
              {projectName ? `${projectName} · ` : ""}{aoiLabel}
            </div>
          </div>
          <div className="ml-auto rounded border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-400">
            ESC fecha
          </div>
        </div>
      </div>

      <CommandInput placeholder="Pesquisar módulo, análise ou ação…" />
      <CommandList className="max-h-[430px]">
        <CommandEmpty>
          <div className="py-3">
            <div className="text-sm font-medium text-slate-600">Nada encontrado</div>
            <div className="mt-1 text-xs text-slate-400">Tente “NDVI”, “cheias”, “água” ou “projeto”.</div>
          </div>
        </CommandEmpty>

        <CommandGroup heading="Começar por um objectivo">
          <CommandItem
            value="ask geomoz analisar area inteligencia ai"
            onSelect={() => run(() => onNavigate("GeoMoz AI"))}
            className="group rounded-lg py-2.5"
          >
            <BrainCircuit className="text-violet-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Perguntar ao GeoMoz AI</div>
              <div className="text-[10px] text-slate-400">Descreva o objectivo em linguagem natural.</div>
            </div>
            <CommandShortcut>AI</CommandShortcut>
          </CommandItem>

          <CommandItem
            value="vegetacao ndvi sentinel analisar agricultura"
            onSelect={() => run(() => onNavigate("GeoAnálises"))}
            className="group rounded-lg py-2.5"
          >
            <Satellite className="text-emerald-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Analisar vegetação / NDVI</div>
              <div className="text-[10px] text-slate-400">Abrir índices de observação da Terra.</div>
            </div>
          </CommandItem>

          <CommandItem
            value="agua subterranea groundwater ahp potencial furacao furo"
            onSelect={() => run(() => onNavigate("Água Subterrânea"))}
            className="group rounded-lg py-2.5"
          >
            <Droplet className="text-cyan-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Avaliar potencial de água subterrânea</div>
              <div className="text-[10px] text-slate-400">Abrir análise hidrogeológica AHP.</div>
            </div>
          </CommandItem>

          <CommandItem
            value="cheia inundacao flood sentinel risco desastre geoperigos"
            onSelect={() => run(() => onNavigate("Geoperigos"))}
            className="group rounded-lg py-2.5"
          >
            <AlertTriangle className="text-rose-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Mapear cheias e geoperigos</div>
              <div className="text-[10px] text-slate-400">Sentinel-1, RUSLE e análises de risco.</div>
            </div>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegar">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.tab}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => run(() => onNavigate(item.tab))}
                className="rounded-lg"
              >
                <Icon className="text-slate-500" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="ml-2 text-[10px] text-slate-400">{item.description}</span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações rápidas">
          <CommandItem
            value="desenhar aoi area polygon poligono mapa"
            onSelect={() => run(onDrawAOI)}
            className="rounded-lg"
          >
            <Pen className="text-fuchsia-500" />
            <span>Desenhar uma AOI no mapa</span>
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="earth engine gee ligar conectar quota projecto google"
            onSelect={() => run(onOpenGee)}
            className="rounded-lg"
          >
            <SlidersHorizontal className="text-emerald-500" />
            <span>Ligação Google Earth Engine</span>
          </CommandItem>
          <CommandItem
            value="configuracoes settings preferencias"
            onSelect={() => run(onOpenSettings)}
            className="rounded-lg"
          >
            <Settings className="text-slate-500" />
            <span>Configurações</span>
          </CommandItem>
          <CommandItem
            value="ajuda guia onboarding começar tutorial"
            onSelect={() => run(onOpenWelcome)}
            className="rounded-lg"
          >
            <HelpCircle className="text-sky-500" />
            <span>Abrir guia rápido</span>
          </CommandItem>
          <CommandItem
            value="localizacao aoi area actual contexto"
            disabled
            className="rounded-lg opacity-60"
          >
            <MapPin className="text-sky-500" />
            <span className="truncate">AOI: {aoiLabel}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-[9px] text-slate-400">
        <span>↑ ↓ navegar · Enter executar</span>
        <span>GeoMoz Earth Intelligence</span>
      </div>
    </CommandDialog>
  );
}
