import React, { useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Database,
  Globe2,
  Layers3,
  Map,
  Mountain,
  Cpu,
  FileText,
  Search,
  ChevronRight,
  Code2,
  Cloud,
  ShieldCheck,
  Workflow,
} from "lucide-react";

type Status = "operational" | "conditional" | "planned";

interface Capability {
  name: string;
  status: Status;
  description: string;
  notes?: string;
}

const STATUS_META: Record<
  Status,
  { label: string; className: string; icon: React.ReactNode }
> = {
  operational: {
    label: "Operacional",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
    icon: <CheckCircle2 size={12} />,
  },
  conditional: {
    label: "Condicionado",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    icon: <AlertTriangle size={12} />,
  },
  planned: {
    label: "Planeado",
    className:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: <Clock3 size={12} />,
  },
};

const CAPABILITIES: Capability[] = [
  {
    name: "Mapa 2D / 3D",
    status: "operational",
    description: "Visualização territorial com navegação, camadas e modos 2D/3D.",
  },
  {
    name: "GIS Workspace com mapa próprio",
    status: "operational",
    description:
      "Ambiente GIS independente para dados do projeto, análise, SQL, tabelas e rasters.",
  },
  {
    name: "Importação vetorial",
    status: "operational",
    description:
      "GeoJSON/JSON, CSV com latitude-longitude, Shapefile, GeoPackage, GeoParquet/Parquet, FlatGeobuf, GML, KML, DXF e ZIP.",
    notes:
      "Alguns formatos são lidos por DuckDB Spatial e podem depender do conteúdo/estrutura do ficheiro.",
  },
  {
    name: "GeoTIFF / COG local",
    status: "operational",
    description:
      "Visualização raster, bandas, opacidade, simbologia, histograma, stretch, NoData e classificação.",
  },
  {
    name: "COG / GeoTIFF remoto",
    status: "conditional",
    description:
      "Leitura por URL HTTP/HTTPS no mapa e no workspace raster.",
    notes:
      "O servidor remoto deve permitir CORS; COG com HTTP Range oferece o melhor desempenho.",
  },
  {
    name: "WFS",
    status: "conditional",
    description:
      "GetCapabilities, seleção de FeatureType e importação de GeoJSON para análise local.",
    notes:
      "Depende de o servidor WFS disponibilizar GeoJSON e permitir pedidos do browser.",
  },
  {
    name: "Ferramentas vetoriais",
    status: "operational",
    description:
      "Buffer, centróides, envelope convexo, bounding box, dissolve, simplificação, vértices, métricas, interseção e pontos-em-polígono.",
  },
  {
    name: "Whitebox WASM",
    status: "operational",
    description:
      "Catálogo curado e validado em runtime para ferramentas raster/vetoriais selecionadas.",
    notes:
      "O GeoMoz mostra apenas ferramentas cuja parametrização está definida e cujo ID existe no runtime whitebox-wasm.",
  },
  {
    name: "Análise de terreno",
    status: "operational",
    description:
      "Declive, aspeto, hillshade e preenchimento de depressões através de Whitebox WASM.",
  },
  {
    name: "DuckDB-WASM Spatial SQL",
    status: "operational",
    description:
      "Consultas SQL sobre camadas vetoriais carregadas e criação de resultados espaciais.",
  },
  {
    name: "Model Builder",
    status: "operational",
    description:
      "Encadeamento sequencial das ferramentas vetoriais implementadas no motor local.",
    notes: "O builder atual é vetorial; pipelines raster avançados ainda não fazem parte deste fluxo.",
  },
  {
    name: "Persistência por projeto",
    status: "operational",
    description:
      "Snapshot local em IndexedDB com camadas, rasters, estados, simbologia, histórico e modelos.",
  },
  {
    name: "Sincronização cloud",
    status: "conditional",
    description:
      "Persistência autenticada em Firestore e Firebase Storage.",
    notes:
      "Requer sessão autenticada, projeto ativo e serviços Firebase acessíveis.",
  },
  {
    name: "Tabela de atributos",
    status: "operational",
    description:
      "Inspeção de atributos das camadas vetoriais dentro do GIS Workspace.",
  },
  {
    name: "Dashboard e histórico de processamento",
    status: "operational",
    description:
      "Indicadores, gráficos e registo das operações executadas no workspace.",
  },
  {
    name: "Cortina / Swipe",
    status: "planned",
    description:
      "Comparação por recorte real de duas camadas.",
    notes:
      "O protótipo anterior movia apenas o divisor visual e foi retirado da interface até existir clipping real.",
  },
  {
    name: "WMS / WMTS / XYZ",
    status: "planned",
    description:
      "Fontes remotas persistentes, sem copiar tiles para o projeto.",
  },
  {
    name: "PMTiles",
    status: "planned",
    description:
      "Streaming de tiles cloud-native para grandes datasets vetoriais/raster.",
  },
  {
    name: "STAC",
    status: "planned",
    description:
      "Pesquisa e adição de ativos de Observação da Terra, incluindo COGs.",
  },
];

const SECTIONS = [
  { id: "inicio", label: "Visão geral" },
  { id: "estado", label: "Estado funcional" },
  { id: "workspace", label: "GIS Workspace" },
  { id: "formatos", label: "Formatos" },
  { id: "motores", label: "Motores" },
  { id: "limitacoes", label: "Limitações" },
  { id: "roadmap", label: "Roadmap" },
];

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default function Documentation() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CAPABILITIES.filter((item) => {
      const statusMatch = filter === "all" || item.status === filter;
      const searchMatch =
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.notes?.toLowerCase().includes(needle);
      return statusMatch && searchMatch;
    });
  }, [filter, query]);

  const counts = useMemo(
    () => ({
      operational: CAPABILITIES.filter((item) => item.status === "operational").length,
      conditional: CAPABILITIES.filter((item) => item.status === "conditional").length,
      planned: CAPABILITIES.filter((item) => item.status === "planned").length,
    }),
    []
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={18} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            Documentação
          </span>
        </div>
        <nav className="space-y-1">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#doc-${section.id}`}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
            >
              {section.label}
              <ChevronRight size={12} />
            </a>
          ))}
        </nav>
        <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] leading-relaxed text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
          Esta página descreve o comportamento implementado no GeoMoz. Funcionalidades futuras
          são identificadas explicitamente como planeadas.
        </div>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-6 lg:px-8">
          <section id="doc-inicio">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-indigo-50 px-5 py-6 dark:border-slate-800 dark:from-sky-950/30 dark:via-slate-900 dark:to-indigo-950/30">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:border-indigo-800 dark:bg-slate-900/80 dark:text-indigo-300">
                      <ShieldCheck size={12} />
                      GeoMoz Explorer
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                      Documentação do Sistema
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      Guia técnico e funcional do GeoMoz, com foco no que está disponível no
                      build atual, requisitos externos e limitações conhecidas.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["operational", "conditional", "planned"] as Status[]).map((status) => (
                      <div
                        key={status}
                        className="min-w-24 rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="text-xl font-black text-slate-900 dark:text-white">
                          {counts[status]}
                        </div>
                        <div className="mt-1 flex justify-center">
                          <StatusBadge status={status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [<Map size={17} />, "Mapa", "Visualização territorial 2D/3D"],
                  [<Database size={17} />, "GIS Workspace", "Análise sobre dados do projeto"],
                  [<Cpu size={17} />, "Processamento", "Turf, DuckDB e Whitebox WASM"],
                  [<Cloud size={17} />, "Projetos", "Persistência local e cloud"],
                ].map(([icon, title, body]) => (
                  <div
                    key={String(title)}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="mb-2 text-indigo-600 dark:text-indigo-400">{icon}</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{title}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{body}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="doc-estado">
            <SectionTitle
              icon={<CheckCircle2 size={18} />}
              title="Estado funcional"
              subtitle="Matriz de capacidades auditada no código do build atual."
            />

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Pesquisar capacidade…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {(["all", "operational", "conditional", "planned"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status)}
                    className={`whitespace-nowrap rounded-xl border px-3 py-2 text-[11px] font-bold transition-colors ${
                      filter === status
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {status === "all" ? "Todas" : STATUS_META[status].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((item) => (
                <article
                  key={item.name}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.name}
                    </h3>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {item.description}
                  </p>
                  {item.notes && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                      {item.notes}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section id="doc-workspace">
            <SectionTitle
              icon={<Layers3 size={18} />}
              title="GIS Workspace"
              subtitle="Ambiente separado do mapa geral, orientado à análise e ao projeto."
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: <Layers3 size={17} />,
                  title: "Dados e camadas",
                  lines: [
                    "Adicionar vetores e rasters",
                    "Visibilidade, opacidade e seleção",
                    "Tabela de atributos",
                    "WFS e COG por URL",
                  ],
                },
                {
                  icon: <Workflow size={17} />,
                  title: "Processamento",
                  lines: [
                    "Ferramentas vetoriais Turf.js",
                    "Whitebox WASM curado",
                    "Model Builder vetorial",
                    "Histórico e resultados",
                  ],
                },
                {
                  icon: <Database size={17} />,
                  title: "Análise",
                  lines: [
                    "DuckDB-WASM Spatial SQL",
                    "Dashboard de atributos",
                    "Simbologia raster",
                    "Classificação e histograma",
                  ],
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-3 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    {card.icon}
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {card.title}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {card.lines.map((line) => (
                      <li
                        key={line}
                        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <CheckCircle2 size={12} className="shrink-0 text-emerald-500" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section id="doc-formatos">
            <SectionTitle
              icon={<FileText size={18} />}
              title="Formatos de dados"
              subtitle="Formatos aceites pelos caminhos de importação do GIS Workspace."
            />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-[1fr_1.4fr] border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                <span>Grupo</span>
                <span>Formatos</span>
              </div>
              {[
                ["Vetores diretos", "GeoJSON / JSON · CSV lat/lon"],
                [
                  "Vetores via DuckDB Spatial",
                  "Shapefile · GeoPackage · GeoParquet / Parquet · FlatGeobuf · GML · KML · DXF · ZIP",
                ],
                ["Raster", "GeoTIFF / TIFF · COG local ou remoto"],
                ["Serviços", "WFS com saída GeoJSON"],
              ].map(([group, formats]) => (
                <div
                  key={group}
                  className="grid grid-cols-[1fr_1.4fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-b-0 dark:border-slate-800"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{group}</span>
                  <span className="text-slate-500 dark:text-slate-400">{formats}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="doc-motores">
            <SectionTitle
              icon={<Code2 size={18} />}
              title="Motores e responsabilidades"
              subtitle="Tecnologias independentes utilizadas diretamente pelo GeoMoz."
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["MapLibre GL", "Mapa próprio do GIS Workspace e renderização geoespacial."],
                ["Turf.js", "Operações vetoriais verificadas no browser."],
                ["DuckDB-WASM Spatial", "Leitura de formatos e SQL espacial client-side."],
                ["whitebox-wasm", "Ferramentas Whitebox WASM curadas e verificadas em runtime."],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{title}</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section id="doc-limitacoes">
            <SectionTitle
              icon={<AlertTriangle size={18} />}
              title="Limitações conhecidas"
              subtitle="Condições que podem alterar o comportamento apesar do build estar saudável."
            />
            <div className="space-y-2">
              {[
                "Serviços WFS e rasters remotos podem falhar quando o servidor externo bloqueia CORS.",
                "GeoTIFFs muito grandes continuam sujeitos ao limite de memória do browser/WebAssembly.",
                "A sincronização cloud exige utilizador autenticado e um projeto ativo.",
                "O Model Builder atual encadeia as ferramentas vetoriais implementadas; não é ainda um DAG raster completo.",
                "A Cortina/Swipe foi retirada da interface até existir recorte real das camadas.",
                "WMS, WMTS, XYZ, PMTiles e STAC não são apresentados como funcionais no build atual.",
              ].map((item) => (
                <div
                  key={item}
                  className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section id="doc-roadmap" className="pb-10">
            <SectionTitle
              icon={<Globe2 size={18} />}
              title="Roadmap técnico"
              subtitle="Próximos blocos sem os apresentar como funcionalidades existentes."
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {["WMS / WMTS / XYZ", "PMTiles", "STAC", "Cortina real", "Pipelines raster"].map(
                  (item, index) => (
                    <div
                      key={item}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="mb-2 text-[10px] font-black text-indigo-500">
                        0{index + 1}
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {item}
                      </div>
                      <div className="mt-2">
                        <StatusBadge status="planned" />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
