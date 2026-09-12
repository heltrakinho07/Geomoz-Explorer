import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Globe,
  Satellite,
  Mountain,
  Droplets,
  Droplet,
  AlertTriangle,
  BrainCircuit,
  Compass,
  Sun,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  MapPin,
  Activity,
  ChevronRight,
  BarChart3,
  Search,
  Sliders,
  LogIn,
  UserPlus,
  LogOut,
  Flame,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import AuthModal, { type AuthMode } from "@/components/AuthModal";

interface LandingPageProps {
  initialAuthMode?: AuthMode | null;
}

export default function LandingPage({ initialAuthMode = null }: LandingPageProps) {
  const [, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(Boolean(initialAuthMode));
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode || "login");
  const [activeFeatureTab, setActiveFeatureTab] = useState<number>(0);

  useEffect(() => {
    if (initialAuthMode) {
      setAuthMode(initialAuthMode);
      setAuthModalOpen(true);
    }
  }, [initialAuthMode]);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleLaunchApp = () => {
    setLocation("/app");
  };

  const FEATURE_TABS = [
    {
      title: "Relevo 3D & Simulação Solar",
      badge: "Motor Digital 30m",
      icon: <Mountain size={18} className="text-amber-500" />,
      desc: "Navegue pelo terreno com resolução de 30 metros derivada de dados Copernicus e SRTM. Ajuste a hora solar para projetar sombras orográficas dinâmicas e gere perfis topográficos instantâneos de corte A-B com cálculo contínuo de declives.",
      points: [
        "Sombras dinâmicas calculadas por azimute e elevação solar em tempo real",
        "Modelação de insolação para vertentes escarpadas e vales",
        "Perfis de elevação A-B com amostragem métrica precisa",
        "Exploração instantânea de marcos mundiais (Kilimanjaro, Evereste, Namúli, Fuji)",
      ],
      ctaTab: "Mapa",
      ctaLabel: "Experimentar Relevo 3D",
    },
    {
      title: "Deteção Remota por Satélite",
      badge: "Google Earth Engine",
      icon: <Satellite size={18} className="text-sky-500" />,
      desc: "Processe coleções multi-temporais das constelações Sentinel-2 e Landsat diretamente na infraestrutura da Google. Calcule índices de vegetação (NDVI), humidade (NDWI), urbanização (NDBI) e assinaturas de alteração hidrotermal mineral.",
      points: [
        "Composições coloridas de satélite com filtragem automática de nuvens",
        "Identificação de gossans, óxidos de ferro e argilas hidrotérmicas para mineração",
        "Séries temporais e comparação de índices biofísicos",
        "Delimitação universal em Moçambique ou qualquer país do globo",
      ],
      ctaTab: "GeoAnálises",
      ctaLabel: "Abrir GeoAnálises",
    },
    {
      title: "Hidrologia & Água Subterrânea",
      badge: "HidroGeoMoz & AHP",
      icon: <Droplets size={18} className="text-blue-500" />,
      desc: "Delineie bacias hidrográficas, ordens de drenagem e zonas de recarga aquífera. O modelo multicritério AHP combina geologia, declive, densidade de drenagem e TWI para mapear zonas de alto potencial de água subterrânea para furos sustentáveis.",
      points: [
        "Delimitação automática de redes de drenagem e sub-bacias",
        "Identificação multicritério de aquíferos e fraturas permeáveis",
        "Monitorização preditiva de cheias e inundações fluviais",
        "Exportação de dados para planeamento de abastecimento comunitário",
      ],
      ctaTab: "Água Subterrânea",
      ctaLabel: "Ver Módulo Hidrológico",
    },
    {
      title: "Inteligência Artificial & Machine Learning",
      badge: "GeoMoz AI",
      icon: <BrainCircuit size={18} className="text-purple-500" />,
      desc: "Modelos preditivos treinados para classificação de coberturas do solo, deteção de anomalias e prospeção guiada. Combine Random Forest, K-Means e algoritmos geoestatísticos para extrair inteligência automatizada dos píxeis espectrais.",
      points: [
        "Classificação assistida por IA de litologias e uso do solo",
        "Deteção de padrões e agrupamento de feições tectónicas",
        "Geração de relatórios executivos e diagnósticos ambientais",
        "Pipeline interativo executado diretamente no seu navegador",
      ],
      ctaTab: "GeoMoz AI",
      ctaLabel: "Explorar GeoMoz AI",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* Background Ambience Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-sky-600/20 via-indigo-600/15 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[35%] -left-48 w-[500px] h-[500px] bg-purple-600/10 blur-[130px] rounded-full" />
        <div className="absolute top-[65%] -right-48 w-[550px] h-[550px] bg-blue-600/10 blur-[140px] rounded-full" />
      </div>

      {/* ── 1. Floating Top Navigation Bar ──────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-slate-950/75 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/35 transition-all">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-sky-400">
                <Globe size={22} className="animate-spin-slow group-hover:text-white transition-colors" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                GeoMoz<span className="text-sky-400">Explorer</span>
                <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  3D
                </span>
              </span>
              <span className="text-[10px] text-slate-400 tracking-wider">
                Inteligência Geoespacial Planetária
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
            <a href="#recursos" className="hover:text-sky-400 transition-colors">
              Recursos
            </a>
            <a href="#3d-solar" className="hover:text-sky-400 transition-colors">
              Relevo & Solar
            </a>
            <a href="#detecao-remota" className="hover:text-sky-400 transition-colors">
              Deteção Remota
            </a>
            <a href="#hidrogeologia" className="hover:text-sky-400 transition-colors">
              Hidrogeologia
            </a>
            <a href="#casos-de-uso" className="hover:text-sky-400 transition-colors">
              Casos de Uso
            </a>
          </nav>

          {/* Auth / Action Buttons */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "Utilizador"}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold text-[10px] flex items-center justify-center">
                      {user.email?.slice(0, 2).toUpperCase() || "U"}
                    </div>
                  )}
                  <span className="text-slate-200 font-medium truncate max-w-[120px]">
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={handleLaunchApp}
                  className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold px-4 h-9 rounded-xl shadow-lg shadow-sky-500/25"
                >
                  <span>Abrir Mapa 3D</span>
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>

                <button
                  type="button"
                  onClick={() => signOut()}
                  title="Terminar Sessão"
                  className="w-9 h-9 rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAuth("login")}
                  className="text-slate-300 hover:text-white hover:bg-slate-900 text-xs font-semibold h-9 px-3 rounded-xl"
                >
                  <LogIn size={14} className="mr-1.5 text-slate-400" />
                  <span>Iniciar Sessão</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => openAuth("register")}
                  className="hidden sm:inline-flex bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold px-3 h-9 rounded-xl shadow-sm transition-all"
                >
                  <UserPlus size={14} className="mr-1.5 text-sky-400" />
                  <span>Criar Conta</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleLaunchApp}
                  className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold px-4 h-9 rounded-xl shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 transition-all"
                >
                  <span>Explorar</span>
                  <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Hero Section ──────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
          {/* Version badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 shadow-md mb-6 hover:border-sky-500/50 transition-colors animate-in fade-in slide-in-from-top-3 duration-500">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            <span className="text-xs font-medium text-slate-300">
              GeoMoz Explorer 3D • Copernicus DEM 30m & GEE Integrado
            </span>
            <span className="text-[10px] text-sky-400 font-bold bg-sky-950 px-2 py-0.5 rounded-full">
              NOVO
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-5xl leading-[1.15] mb-6">
            Inteligência Geoespacial, Deteção Remota e{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-purple-400">
              Modelação 3D Planetária
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-3xl leading-relaxed mb-8 font-normal">
            A plataforma analítica definitiva que une o poder do <strong>Google Earth Engine</strong>,
            terreno digital de 30m em tempo real, cartografia geológica e inteligência artificial preditiva.
            De <strong>Moçambique para qualquer coordenada do mundo</strong>, tudo sem necessidade de instalar software pesado.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 mb-12 w-full sm:w-auto">
            <Button
              size="lg"
              onClick={handleLaunchApp}
              className="w-full sm:w-auto px-7 py-3.5 h-auto text-sm font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl shadow-xl shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <span>Lançar Plataforma 3D</span>
              <ArrowRight size={17} />
            </Button>

            {!user && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => openAuth("register")}
                className="w-full sm:w-auto px-6 py-3.5 h-auto text-sm font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700 rounded-xl hover:border-slate-500 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={16} className="text-sky-400" />
                <span>Criar Conta Gratuita</span>
              </Button>
            )}

            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                const el = document.getElementById("demonstracao");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto text-slate-400 hover:text-white text-sm font-medium h-auto py-3 px-4"
            >
              <span>Ver Recursos</span>
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Live Floating Feature Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 max-w-4xl w-full mb-14">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-200 block">Earth Engine Cloud</span>
                <span className="text-[10px] text-slate-400">Processamento em segundos</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Sun size={16} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-200 block">Simulação Solar 3D</span>
                <span className="text-[10px] text-slate-400">Sombras dinâmicas do relevo</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <Satellite size={16} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-200 block">Sentinel-2 & Landsat</span>
                <span className="text-[10px] text-slate-400">10+ índices multiespectrais</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                <Globe size={16} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-200 block">Cobertura Planetária</span>
                <span className="text-[10px] text-slate-400">Moçambique e 190+ países</span>
              </div>
            </div>
          </div>

          {/* ── Hero Interactive Mockup Frame ────────────────────────────────────── */}
          <div
            id="demonstracao"
            className="w-full max-w-5xl rounded-2xl p-2 md:p-3 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border border-slate-700/80 shadow-2xl shadow-sky-950/40 relative overflow-hidden group"
          >
            {/* Window Header Bar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-xs text-slate-400 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-400">
                  GeoMoz 3D Core • Copernicus GLO-30 • Monte Namúli, Zambézia
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  WebGL 3D Ativo
                </span>
              </div>
            </div>

            {/* Mockup Canvas Screen */}
            <div className="relative rounded-xl overflow-hidden aspect-[16/9] md:aspect-[21/10] bg-slate-900 border border-slate-800 flex flex-col justify-between p-4 sm:p-6 text-left">
              {/* Simulated 3D Mountain Terrain Graphic */}
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-sky-950/40" />
              
              {/* Topographic Lines Decor */}
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px), radial-gradient(#6366f1 1px, transparent 1px)`,
                  backgroundSize: "32px 32px",
                  backgroundPosition: "0 0, 16px 16px",
                }}
              />

              {/* Glowing Mountain Profile Silhouette */}
              <svg
                className="absolute bottom-0 left-0 right-0 w-full h-4/5 text-sky-950/40 pointer-events-none opacity-60"
                viewBox="0 0 1200 400"
                fill="none"
              >
                <path
                  d="M0 400 L0 320 Q200 240, 350 290 T650 140 Q800 60, 920 180 T1200 110 L1200 400 Z"
                  fill="url(#terrain-gradient)"
                />
                <path
                  d="M0 320 Q200 240, 350 290 T650 140 Q800 60, 920 180 T1200 110"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
                <defs>
                  <linearGradient id="terrain-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Overlay HUD 1: Simulated Pixel Inspector HUD */}
              <div className="relative z-10 max-w-xs bg-slate-950/85 backdrop-blur-md p-3.5 rounded-xl border border-slate-700/80 shadow-xl space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-sky-400">
                    <Activity size={14} />
                    <span>Pixel Inspector HUD</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                    15.3667° S, 37.0333° E
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Elevação Real</span>
                    <span className="font-mono font-bold text-white text-sm">2.419 m</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Declive / Vertente</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">42.8° Escarpado</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Formação Geológica</span>
                    <span className="font-semibold text-slate-200 truncate">Granito Plutónico</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Sentinel-2 NDVI</span>
                    <span className="font-mono font-bold text-emerald-400">0.74 (Vigoroso)</span>
                  </div>
                </div>
              </div>

              {/* Overlay HUD 2: Simulated Solar Simulation Control Pill */}
              <div className="relative z-10 self-end flex items-center gap-3 bg-slate-950/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/80 shadow-xl text-xs">
                <div className="flex items-center gap-2">
                  <Sun size={16} className="text-amber-400 animate-spin-slow" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Hora Solar Simulada</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">17:15 (Golden Hour)</span>
                  </div>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div className="text-[10px] text-slate-300">
                  <span>Azimute: <strong>255° WSW</strong></span>
                  <span className="block text-slate-400">Sombras: <strong>Ativas (0.7x)</strong></span>
                </div>
              </div>

              {/* Hover prompt */}
              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none backdrop-blur-[2px]">
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="pointer-events-auto px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-2xl shadow-sky-500/50 flex items-center gap-2 transition-transform hover:scale-105"
                >
                  <span>Abrir no Mapa Interativo 3D</span>
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Strategic Metrics / Global Stats ──────────────────────────────────── */}
      <section className="py-12 border-y border-slate-800/80 bg-slate-900/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">
                30 Metros
              </span>
              <p className="text-xs sm:text-sm font-semibold text-slate-200 mt-1">
                Resolução Global de Terreno
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Copernicus DEM GLO-30 & SRTM sem lacunas
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                10+ Índices
              </span>
              <p className="text-xs sm:text-sm font-semibold text-slate-200 mt-1">
                Análises de Satélite Automatizadas
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                NDVI, NDWI, NDBI, Minérios e Lineamentos
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
                190+ Países
              </span>
              <p className="text-xs sm:text-sm font-semibold text-slate-200 mt-1">
                Enquadramento Global Imediato
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Selecione qualquer nação com auto-focus 3D
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500">
                0 Instalação
              </span>
              <p className="text-xs sm:text-sm font-semibold text-slate-200 mt-1">
                Aceleração Direta no Browser
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                WebGL 2.0 leve, rápido e responsivo
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. The 6 Core Technology Pillars ────────────────────────────────────── */}
      <section id="recursos" className="py-20 lg:py-28 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400 bg-sky-950/60 px-3 py-1 rounded-full border border-sky-800">
              Arquitetura de Inteligência Territorial
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-3 mb-4">
              Os 6 Pilares Tecnológicos do GeoMoz
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Desenvolvido para engenheiros geólogos, hidrólogos, analistas de SIG, investigadores e gestores
              públicos que exigem precisão científica com interface de alta produtividade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Pillar 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                  <Sun size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>Relevo 3D & Simulação Solar</span>
                  <span className="text-[9px] text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded">
                    Dinâmico
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Controlo contínuo da iluminação solar das 00:00 às 23:59 com projeção de sombras no modelo DEM
                  Copernicus 30m. Permite visualizar a insolação e gerar cortes de perfil topográfico A-B em qualquer ponto.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Azimute & Elevação solar</span>
                <span className="text-amber-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Ver em 3D →
                </span>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4 group-hover:scale-110 transition-transform">
                  <Satellite size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>Deteção Remota & Índices Espectrais</span>
                  <span className="text-[9px] text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded">
                    GEE Cloud
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Acesso instantâneo a Sentinel-2 e Landsat 8/9. Processamento de NDVI para vigor vegetal, NDWI para
                  recursos hídricos, NDBI para edificações e índices espectrais para alteração hidrotermal mineral.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Mosaicos sem nuvens</span>
                <span className="text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Calcular Índices →
                </span>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                  <Mountain size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>Geologia & Deteção de Lineamentos</span>
                  <span className="text-[9px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded">
                    Estrutural
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cartografia geológica detalhada de Moçambique sincronizada com o relevo 3D. Deteção automática
                  de lineamentos estruturais e falhas com filtros direcionais para prospeção mineral e tectónica.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Litologia & Falhas</span>
                <span className="text-emerald-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Ver Geologia →
                </span>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  <Droplets size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>HidroGeoMoz & Bacias Hidrográficas</span>
                  <span className="text-[9px] text-blue-400 bg-blue-950 px-1.5 py-0.5 rounded">
                    Hidrologia
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Delineação hidrológica de bacias e sub-bacias, rede de drenagem de Strahler, escoamento superficial
                  e monitorização de áreas vulneráveis a cheias com dados de precipitação em tempo real.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Drenagem & Bacias</span>
                <span className="text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Ver Bacias →
                </span>
              </div>
            </div>

            {/* Pillar 5 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                  <Droplet size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>Potencial de Água Subterrânea (AHP)</span>
                  <span className="text-[9px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded">
                    Aquíferos
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Modelo analítico multicritério AHP (Analytic Hierarchy Process) integrando declive, litologia,
                  solos, densidade de drenagem e TWI para mapear o potencial de água subterrânea e orientar furos.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Zonas de recarga aquífera</span>
                <span className="text-cyan-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Mapear Água →
                </span>
              </div>
            </div>

            {/* Pillar 6 */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-sky-500/50 transition-all hover:shadow-xl hover:shadow-sky-500/10 flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                  <BrainCircuit size={24} />
                </div>
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>GeoMoz AI & Machine Learning</span>
                  <span className="text-[9px] text-purple-400 bg-purple-950 px-1.5 py-0.5 rounded">
                    IA Preditiva
                  </span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Modelos de inteligência artificial geoespacial integrados para deteção de padrões, classificação de
                  terreno, previsão de geoperigos e geração automatizada de relatórios técnicos prontos a exportar.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Modelos Random Forest & K-Means</span>
                <span className="text-purple-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                  Explorar IA →
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Interactive Capabilities Tabs Spotlight ──────────────────────────── */}
      <section id="3d-solar" className="py-20 border-t border-slate-800/80 bg-slate-900/30 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Explore as Funcionalidades em Ação
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              Selecione um módulo para conhecer o conjunto de capacidades científicas e operacionais.
            </p>
          </div>

          {/* Tabs Selector */}
          <div className="flex justify-center gap-2 overflow-x-auto pb-4 mb-8 scrollbar-thin">
            {FEATURE_TABS.map((tab, idx) => (
              <button
                key={tab.title}
                type="button"
                onClick={() => setActiveFeatureTab(idx)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeFeatureTab === idx
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
                }`}
              >
                {tab.icon}
                <span>{tab.title}</span>
              </button>
            ))}
          </div>

          {/* Active Tab Showcase Card */}
          {(() => {
            const current = FEATURE_TABS[activeFeatureTab];
            return (
              <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-2xl max-w-4xl mx-auto flex flex-col md:flex-row gap-8 items-center">
                <div className="flex-1 space-y-4 text-left">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-950 border border-sky-800 text-[10px] font-bold text-sky-400">
                    <Sparkles size={11} />
                    <span>{current.badge}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    {current.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {current.desc}
                  </p>
                  <ul className="space-y-2 pt-2">
                    {current.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    <Button
                      onClick={handleLaunchApp}
                      className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl px-5 py-2.5 shadow-md shadow-sky-500/20 flex items-center gap-2"
                    >
                      <span>{current.ctaLabel}</span>
                      <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>

                <div className="w-full md:w-80 rounded-xl bg-slate-950 p-4 border border-slate-800/80 space-y-3 shrink-0">
                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-800">
                    <span className="font-bold text-slate-200">Capacidades Analíticas</span>
                    <span className="text-[10px] text-sky-400 font-mono">100% Nativo</span>
                  </div>
                  <div className="space-y-2 text-[11px] text-slate-400">
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span>Tempo de Renderização:</span>
                      <span className="font-mono text-emerald-400 font-semibold">&lt; 150 ms</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span>Projeções Suportadas:</span>
                      <span className="font-mono text-slate-200">Globo 3D & Mercator</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-900">
                      <span>Formato de Exportação:</span>
                      <span className="font-mono text-slate-200">GeoJSON, GeoTIFF, PDF</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Conexão OAuth:</span>
                      <span className="font-mono text-sky-400">Google Earth Engine</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── 6. Target Audiences / Use Cases ──────────────────────────────────────── */}
      <section id="casos-de-uso" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-800">
            Setores Estratégicos
          </span>
          <h2 className="text-3xl font-black text-white tracking-tight mt-3 mb-4">
            Construído para Profissionais e Instituições
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto mb-14">
            Descubra como diferentes organizações aceleram a tomada de decisão com o GeoMoz Explorer.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-3xl">⛏️</span>
              <h3 className="text-sm font-bold text-white">Mineração & Energia</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mapeamento preliminar de recursos minerais, identificação de anomalias espectrais de alteração, falhas
                e planeamento de perfurações de reconhecimento sem custo de deslocação física inicial.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-3xl">🏛️</span>
              <h3 className="text-sm font-bold text-white">Governos & Municípios</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ordenamento territorial, monitorização de expansão urbana, vigilância de bacias hidrográficas
                e gestão de emergência contra desastres climáticos (cheias, ciclones e secas).
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-3xl">🌾</span>
              <h3 className="text-sm font-bold text-white">Agricultura & Recursos Hídricos</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Vigilância de secas agrícolas por NDVI, cálculo de índices de humidade (NDWI), planeamento
                de sistemas de regadio e localização sustentável de furos artesianos comunitários.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-3xl">🎓</span>
              <h3 className="text-sm font-bold text-white">Academia & Investigação</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Laboratório digital de geociências para universidades. Ensino de geomorfologia, sensoriamento remoto
                e SIG com dados abertos da ESA, NASA e Instituto Nacional de Minas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Final Conversion CTA Banner ───────────────────────────────────────── */}
      <section className="py-16 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-r from-sky-900/60 via-indigo-950/80 to-purple-950/60 border border-sky-500/30 shadow-2xl relative overflow-hidden text-center flex flex-col items-center">
            <div className="absolute -right-20 -top-20 w-60 h-60 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 mb-4">
              <Globe size={24} />
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-3">
              Pronto para transformar a sua análise territorial?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mb-8 leading-relaxed">
              Junte-se à nova era da cartografia digital e deteção remota. Aceda instantaneamente
              a ferramentas profissionais de análise 3D diretamente no seu navegador.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Button
                size="lg"
                onClick={handleLaunchApp}
                className="w-full sm:w-auto px-8 py-3.5 h-auto text-sm font-bold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl shadow-xl shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                <span>Entrar na Plataforma 3D</span>
                <ArrowRight size={16} />
              </Button>

              {!user && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => openAuth("register")}
                  className="w-full sm:w-auto px-6 py-3.5 h-auto text-sm font-semibold bg-slate-900/90 text-white border-slate-700 hover:bg-slate-800 rounded-xl transition-all"
                >
                  <UserPlus size={16} className="mr-2 text-sky-400" />
                  <span>Criar Conta Gratuita</span>
                </Button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-5 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Sem custos de instalação • Suporte com credenciais do Google Earth Engine</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 8. Comprehensive Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-12 text-xs text-slate-400 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 text-left">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-600/30 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <Globe size={16} />
                </div>
                <span className="font-bold text-white text-sm">GeoMoz Explorer</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Plataforma de inteligência geoespacial, deteção remota e modelação 3D de terreno de alta resolução.
              </p>
              <p className="text-[10px] text-slate-400">
                Desenvolvido por Helder Traquinho & Equipa GeoMoz.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-slate-200 text-xs mb-3 uppercase tracking-wider">
                Módulos do Sistema
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <Link href="/mapa" className="hover:text-sky-400 transition-colors">
                    Mapa 3D & Relevo Mundial
                  </Link>
                </li>
                <li>
                  <Link href="/analises" className="hover:text-sky-400 transition-colors">
                    GeoAnálises & Satélite (Sentinel-2)
                  </Link>
                </li>
                <li>
                  <Link href="/hidrografia" className="hover:text-sky-400 transition-colors">
                    Bacias Hidrográficas
                  </Link>
                </li>
                <li>
                  <Link href="/agua-subterranea" className="hover:text-sky-400 transition-colors">
                    Água Subterrânea & Aquíferos
                  </Link>
                </li>
                <li>
                  <Link href="/geoperigos" className="hover:text-sky-400 transition-colors">
                    Geoperigos & Desastres Naturais
                  </Link>
                </li>
                <li>
                  <Link href="/geomoz-ai" className="hover:text-sky-400 transition-colors">
                    GeoMoz AI Preditivo
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-200 text-xs mb-3 uppercase tracking-wider">
                Fontes de Dados
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                <li>Copernicus DEM 30m (ESA)</li>
                <li>Google Earth Engine API</li>
                <li>Sentinel-2 MSI (Copernicus)</li>
                <li>Landsat 8-9 OLI (USGS / NASA)</li>
                <li>Instituto Nacional de Minas (INAMI)</li>
                <li>Direcção Nacional de Geologia de Moçambique</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-200 text-xs mb-3 uppercase tracking-wider">
                Acesso & Conta
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                {user ? (
                  <>
                    <li className="text-slate-300">
                      Sessão iniciada como: <strong className="text-white">{user.email}</strong>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="text-rose-400 hover:underline"
                      >
                        Terminar Sessão
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <button
                        type="button"
                        onClick={() => openAuth("login")}
                        className="hover:text-sky-400 transition-colors"
                      >
                        Iniciar Sessão (Login)
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => openAuth("register")}
                        className="hover:text-sky-400 transition-colors"
                      >
                        Criar Nova Conta
                      </button>
                    </li>
                  </>
                )}
                <li className="pt-2">
                  <button
                    type="button"
                    onClick={handleLaunchApp}
                    className="text-sky-400 font-semibold hover:underline"
                  >
                    Entrar na Plataforma →
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
            <p>© {new Date().getFullYear()} GeoMoz-Explorer. Todos os direitos reservados.</p>
            <p>Concebido para a soberania e excelência no conhecimento geoespacial.</p>
          </div>
        </div>
      </footer>

      {/* ── 9. Authentication Modal Dialog ───────────────────────────────────────── */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
        onSuccess={() => {
          setLocation("/app");
        }}
      />
    </div>
  );
}
