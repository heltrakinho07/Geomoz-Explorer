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
  Moon,
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
  Languages,
  Menu,
  X,
  Binary,
  Waves,
  Ruler,
  Building2,
  Sprout,
  GraduationCap,
  Gem,
  ArrowUpRight,
  Check,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import AuthModal, { type AuthMode } from "@/components/AuthModal";

interface LandingPageProps {
  initialAuthMode?: AuthMode | null;
}

type Lang = "pt" | "en";
type Theme = "light" | "dark";

export default function LandingPage({ initialAuthMode = null }: LandingPageProps) {
  const [, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(Boolean(initialAuthMode));
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode || "login");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Default theme is LIGHT (primary executive mode), secondary DARK
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("geomoz_theme");
      if (saved === "dark" || saved === "light") return saved;
    }
    return "light";
  });

  // Default language is Portuguese (PT), with English (EN) toggle
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("geomoz_lang");
      if (saved === "en" || saved === "pt") return saved;
    }
    return "pt";
  });

  const [activeAnalysisGroup, setActiveAnalysisGroup] = useState<string>("minerals");

  useEffect(() => {
    if (initialAuthMode) {
      setAuthMode(initialAuthMode);
      setAuthModalOpen(true);
    }
  }, [initialAuthMode]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("geomoz_theme", next);
  };

  const toggleLang = () => {
    const next = lang === "pt" ? "en" : "pt";
    setLang(next);
    localStorage.setItem("geomoz_lang", next);
  };

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleLaunchApp = () => {
    setLocation("/app");
  };

  const isDark = theme === "dark";

  // ── Dictionary / Textos Bilingues (PT & EN) ───────────────────────────────────
  const t = {
    pt: {
      nav: {
        recursos: "Recursos",
        relevo3d: "Relevo 3D",
        detecaoRemota: "Deteção Remota",
        hidrogeologia: "Hidrogeologia",
        casosDeUso: "Casos de Uso",
        login: "Iniciar Sessão",
        register: "Criar Conta",
        launch: "Lançar Plataforma 3D",
        logout: "Terminar Sessão",
        userBadge: "Conta Ativa",
      },
      hero: {
        badge: "Copernicus DEM 30m • Google Earth Engine • GeoMoz AI",
        badgeNew: "AVANÇADO",
        titlePre: "Inteligência Geoespacial, Deteção Remota e ",
        titleHighlight: "Morfometria Planetária 3D",
        subtitle:
          "A plataforma analítica definitiva que une o processamento em nuvem do Google Earth Engine, modelos de terreno Copernicus 30m em tempo real, hidrologia multicritério e inteligência artificial preditiva. De Moçambique para qualquer coordenada do globo, 100% no seu navegador.",
        ctaPrimary: "Lançar Plataforma 3D",
        ctaSecondary: "Criar Conta Gratuita",
        ctaExplore: "Ver Recursos Analíticos",
        hudBadge: "Motor Digital WebGL 3D • Copernicus GLO-30",
        hudLocation: "Monte Namúli, Zambézia • 15.3667° S, 37.0333° E",
        elevation: "Elevação Real",
        elevationVal: "2.419 m",
        slope: "Declive / Vertente",
        slopeVal: "42.8° Escarpado",
        lithology: "Litofácies Geológica",
        lithologyVal: "Granito Plutónico (Pré-Câmbrico)",
        spectral: "Sentinel-2 NDVI",
        spectralVal: "0.78 (Vigor Vegetal Alto)",
        alteration: "Alteração Hidrotermal",
        alterationVal: "0.64 (Anomalia Argilosa)",
        interactiveBanner: "Clique para carregar o modelo de terreno e espectrometria em 3D",
      },
      stats: {
        s1Value: "30 Metros",
        s1Title: "Resolução Global de Terreno",
        s1Desc: "Copernicus DEM GLO-30 & SRTM sem lacunas",
        s2Value: "40+ Índices",
        s2Title: "Análises de Satélite Automatizadas",
        s2Desc: "NDVI, NDWI, Óxidos de Ferro, Gossan e Argilas",
        s3Value: "190+ Países",
        s3Title: "Enquadramento Global Imediato",
        s3Desc: "Foco automático e limites administrativos mundiais",
        s4Value: "100% WebGL",
        s4Title: "Zero Instalação de Software",
        s4Desc: "Renderização acelerada por GPU diretamente no browser",
      },
      pillars: {
        tag: "Arquitetura Analítica Territorial",
        title: "Os 6 Pilares Tecnológicos do GeoMoz",
        desc: "Uma infraestrutura integrada para engenheiros geólogos, hidrólogos, peritos em SIG, investigadores e gestores públicos que exigem rigor científico e agilidade operacional.",
        p1Title: "Morfometria Topográfica & Relevo 3D",
        p1Badge: "Copernicus 30m",
        p1Desc: "Navegação tridimensional contínua com cálculo de perfis de elevação A-B em tempo real, gradientes de declive contínuos em graus e percentagem, curvas de nível dinâmicas e sombreamento hipsométrico analítico.",
        p1Sub: "Perfis de corte A-B e declives",
        p1Cta: "Explorar Relevo 3D →",

        p2Title: "Deteção Remota por Satélite (GEE)",
        p2Badge: "Sentinel-2 & Landsat",
        p2Desc: "Pipeline direto com a infraestrutura da Google. Mais de 40 índices biofísicos e espectrais para vigor vegetal, recursos hídricos, solos nus, mapeamento mineral de gossans e anomalias de alteração hidrotermal.",
        p2Sub: "Composições livres de nuvens",
        p2Cta: "Calcular Índices →",

        p3Title: "Geologia Estrutural & Lineamentos",
        p3Badge: "Mapeamento Tectónico",
        p3Desc: "Cartografia geológica vetorial de Moçambique sincronizada com o relevo. Deteção automática de lineamentos estruturais, fraturas e falhas usando filtragem direcional laplaciana e sobel para prospeção mineral.",
        p3Sub: "Litologia, falhas e fraturas",
        p3Cta: "Ver Geologia →",

        p4Title: "HidroGeoMoz & Bacias Hidrográficas",
        p4Badge: "D8 & Strahler",
        p4Desc: "Delineação hidrológica automática via modelo D8 HydroSHEDS, hierarquia HydroBASINS (níveis 4 a 8), rede de drenagem de Strahler (ordens 1 a 5) e cálculo morfométrico de áreas, perímetros e tempo de concentração.",
        p4Sub: "Redes fluviais e bacias",
        p4Cta: "Ver Bacias →",

        p5Title: "Potencial de Água Subterrânea (AHP)",
        p5Badge: "Aquíferos & Furos",
        p5Desc: "Modelação multicritério AHP (Analytic Hierarchy Process) cruzando declives, litologia, tipos de solos, densidade de drenagem, lineamentos e TWI para delimitar zonas ótimas de recarga e locação de furos artesianos.",
        p5Sub: "Zonas de recarga aquífera",
        p5Cta: "Mapear Água →",

        p6Title: "GeoMoz AI & Inteligência Planetária",
        p6Badge: "Machine Learning",
        p6Desc: "Algoritmos geoestatísticos e de inteligência artificial: K-Means geológico com offloading WebWorker, projeção PCA 2-componentes para separação litofaciológica e scoring de favorabilidade para minerais críticos.",
        p6Sub: "K-Means, PCA e Random Forest",
        p6Cta: "Explorar IA →",
      },
      reliefSection: {
        tag: "Morfometria & Terreno Digital",
        title: "Relevo 3D de Alta Resolução e Perfis Topográficos",
        desc: "Abandone modelos estáticos. O GeoMoz processa o modelo digital de elevação Copernicus GLO-30m para produzir análises morfométricas tridimensionais com precisão milimétrica em qualquer canto da Terra.",
        f1Title: "Perfis Topográficos de Corte A-B",
        f1Desc: "Desenhe uma linha em qualquer coordenada geográfica para gerar instantaneamente o perfil altimétrico, cálculo de desnível acumulado, cota máxima, cota mínima e rácio de declive.",
        f2Title: "Matriz Contínua de Declives e Vertentes",
        f2Desc: "Identifique vertentes escarpadas, vales aluvionares e planaltos com classificação automática de declividade em graus e percentagem para planeamento de engenharia civil e risco de deslizamento.",
        f3Title: "Hipsometria e Sombreamento de Relevo (Hillshade)",
        f3Desc: "Gere sombreamento analítico de relevo que ressalta falhas geológicas, escarpas de falha, canhões e diques de forma nítida sem ruído visual.",
        demoProfileTitle: "Corte Topográfico Transversal (Amostra A-B)",
        distance: "Distância Total",
        minElev: "Cota Mínima",
        maxElev: "Cota Máxima",
        reliefGain: "Desnível Total",
      },
      remoteSection: {
        tag: "Laboratório de Deteção Remota",
        title: "Mais de 40 Análises Espectrais e Biofísicas Integradas",
        desc: "Filtre por domínio de aplicação e explore o poder dos sensores multiespectrais Sentinel-2 (MSI) e Landsat 8/9 (OLI) processados na nuvem do Google Earth Engine.",
        tabMinerals: "Minerais & Geologia",
        tabVegetation: "Vegetação & Agricultura",
        tabWater: "Hidrologia & Recursos Hídricos",
        tabHazards: "Geoperigos & Desastres",
        tabAI: "Inteligência Artificial",
        ctaLaunchAnalyses: "Executar no Módulo GeoAnálises",
      },
      hydroSection: {
        tag: "Ciências Hidrológicas",
        title: "Hidrologia de Precisão e Prospeção de Água Subterrânea",
        desc: "Moçambique e o continente africano enfrentam desafios cruciais de segurança hídrica. O GeoMoz integra ferramentas completas de bacias e modelo AHP multicritério para orientação técnica de furos.",
        c1Title: "Delineação de Bacias HydroBASINS",
        c1Desc: "Navegação multinível por bacias e sub-bacias hidrográficas (Pfafstetter 4–8) com área, perímetro, coeficiente de compacidade de Gravelius e tempo de concentração de Kirpich.",
        c2Title: "Rede de Drenagem de Strahler",
        c2Desc: "Extração hierárquica automática de cursos de água de ordem 1 a 5, identificando o caminho de escoamento e concentração de caudal a partir do modelo de terreno.",
        c3Title: "Potencial de Aquíferos por AHP",
        c3Desc: "Ponderação multicritério combinando lineamentos estruturais, precipitação média CHIRPS, declividade, densidade de drenagem e TWI (Índice de Humidade Topográfica) para pontuar locais de furos de água.",
        c4Title: "Radar Sentinel-1 para Cheias",
        c4Desc: "Deteção de inundações por radar de abertura sintética (SAR) Sentinel-1, capaz de penetrar nuvens densas e chuvas torrenciais durante ciclones tropicais (Idai, Kenneth, Freddy).",
        ctaHydro: "Abrir Módulo de Hidrogeologia",
      },
      useCases: {
        tag: "Aplicações Práticas",
        title: "Construído para os Desafios Reais do Território",
        desc: "Capacite equipas multidisciplinares com uma plataforma unificada de dados geoespaciais e inteligência territorial.",
        u1Title: "Mineração & Recursos Minerais",
        u1Desc: "Identificação preliminar de alvos de prospeção (ouro, lítio, cobre, terras raras, grafite), mapeamento de óxidos de ferro, gossans, argilas hidrotérmicas e fraturas sem necessidade de deslocações preliminares de campo de alto custo.",
        u2Title: "Governo, Municípios & Gestão Territorial",
        u2Desc: "Ordenamento do uso do solo, cartografia de expansão urbana com NDBI, vigilância contínua de bacias hidrográficas e plano de contingência para eventos climáticos extremos e cheias fluviais.",
        u3Title: "Agricultura & Segurança Hídrica",
        u3Desc: "Monitorização da saúde das culturas e secas por NDVI, EVI e NDMI, planeamento de perímetros de regadio e locação geocientífica de furos artesianos com água potável para comunidades rurais.",
        u4Title: "Investigação & Universidades",
        u4Desc: "Laboratório virtual de geociências aberto para estudantes, docentes e investigadores. Análise de séries temporais, geomorfologia computacional e exportação de dados científicos em GeoJSON e PDF.",
      },
      ctaFinal: {
        title: "Pronto para elevar a sua análise geoespacial a outro nível?",
        subtitle:
          "Sem necessidade de downloads pesados ou configurações complexas de servidores SIG. Abra o GeoMoz Explorer 3D e processe inteligência planetária em segundos.",
        ctaLaunch: "Entrar na Plataforma 3D",
        ctaRegister: "Criar Conta Gratuita",
        disclaimer: "Aceleração WebGL 3D • Google Earth Engine API • Dados abertos da ESA e NASA",
      },
      footer: {
        desc: "Plataforma de inteligência geoespacial planetária, deteção remota multiespectral e modelação 3D de terreno em tempo real.",
        author: "Desenvolvido por Helder Traquinho & Equipa GeoMoz.",
        modules: "Módulos do Sistema",
        m1: "Mapa 3D & Relevo Mundial",
        m2: "GeoAnálises & Satélite (Sentinel-2)",
        m3: "Bacias Hidrográficas (HydroGeoMoz)",
        m4: "Água Subterrânea (Modelo AHP)",
        m5: "Geoperigos & Desastres (Radar SAR)",
        m6: "GeoMoz AI & Machine Learning",
        sources: "Fontes de Dados Científicas",
        s1: "Copernicus DEM GLO-30m (ESA)",
        s2: "Google Earth Engine Platform",
        s3: "Sentinel-2 MSI & Sentinel-1 SAR (Copernicus)",
        s4: "Landsat 8-9 OLI (USGS / NASA)",
        s5: "Instituto Nacional de Minas de Moçambique (INAMI)",
        s6: "HydroSHEDS & HydroBASINS (WWF / USGS)",
        account: "Acesso & Sessão",
        loggedInAs: "Sessão iniciada como:",
        logout: "Terminar Sessão",
        login: "Iniciar Sessão (Login)",
        register: "Criar Nova Conta",
        openPlatform: "Abrir Plataforma 3D →",
        rights: "GeoMoz-Explorer. Todos os direitos reservados.",
        mission: "Concebido para a excelência e soberania no conhecimento geocientífico.",
      },
    },
    en: {
      nav: {
        recursos: "Capabilities",
        relevo3d: "3D Relief",
        detecaoRemota: "Remote Sensing",
        hidrogeologia: "Hydrogeology",
        casosDeUso: "Use Cases",
        login: "Sign In",
        register: "Sign Up",
        launch: "Launch 3D Platform",
        logout: "Sign Out",
        userBadge: "Active Account",
      },
      hero: {
        badge: "Copernicus DEM 30m • Google Earth Engine • GeoMoz AI",
        badgeNew: "ADVANCED",
        titlePre: "Geospatial Intelligence, Remote Sensing & ",
        titleHighlight: "3D Planetary Morphometry",
        subtitle:
          "The definitive analytical platform merging Google Earth Engine cloud computation, real-time Copernicus 30m digital terrain models, multi-criteria hydrogeology, and predictive artificial intelligence. From Mozambique to any coordinate on the planet, 100% in your browser.",
        ctaPrimary: "Launch 3D Platform",
        ctaSecondary: "Create Free Account",
        ctaExplore: "View Analytical Features",
        hudBadge: "3D WebGL Digital Engine • Copernicus GLO-30",
        hudLocation: "Mount Namúli, Zambézia • 15.3667° S, 37.0333° E",
        elevation: "True Elevation",
        elevationVal: "2,419 m",
        slope: "Slope / Gradient",
        slopeVal: "42.8° Steep Escarpment",
        lithology: "Geological Lithofacies",
        lithologyVal: "Plutonic Granite (Precambrian)",
        spectral: "Sentinel-2 NDVI",
        spectralVal: "0.78 (High Vegetation Vigor)",
        alteration: "Hydrothermal Alteration",
        alterationVal: "0.64 (Clay Mineral Anomaly)",
        interactiveBanner: "Click to load real-time 3D terrain model & satellite spectrometry",
      },
      stats: {
        s1Value: "30 Meters",
        s1Title: "Global Terrain Resolution",
        s1Desc: "Copernicus DEM GLO-30 & SRTM seamless coverage",
        s2Value: "40+ Indices",
        s2Title: "Automated Satellite Analyses",
        s2Desc: "NDVI, NDWI, Iron Oxides, Gossan and Hydrothermal Clays",
        s3Value: "190+ Nations",
        s3Title: "Immediate Global Framing",
        s3Desc: "Automatic focus and worldwide administrative boundaries",
        s4Value: "100% WebGL",
        s4Title: "Zero Software Installation",
        s4Desc: "GPU-accelerated rendering directly inside modern web browsers",
      },
      pillars: {
        tag: "Territorial Intelligence Architecture",
        title: "The 6 Technological Pillars of GeoMoz",
        desc: "An integrated analytical infrastructure designed for geological engineers, hydrologists, GIS experts, researchers, and public decision-makers requiring scientific rigor with operational speed.",
        p1Title: "3D Morphometry & Digital Elevation",
        p1Badge: "Copernicus 30m",
        p1Desc: "Seamless 3D navigation with real-time A-B elevation cross-sections, continuous slope gradients in degrees and percentage, dynamic contour lines, and analytical hypsometric shading.",
        p1Sub: "Cross-section A-B profiles & slopes",
        p1Cta: "Explore 3D Relief →",

        p2Title: "Satellite Remote Sensing (GEE)",
        p2Badge: "Sentinel-2 & Landsat",
        p2Desc: "Direct pipeline into Google's cloud infrastructure. Over 40 biophysical and spectral indices for crop vigor, water resources, bare soil, gossan signatures, and hydrothermal mineral alteration.",
        p2Sub: "Cloud-free composite mosaics",
        p2Cta: "Calculate Indices →",

        p3Title: "Structural Geology & Lineaments",
        p3Badge: "Tectonic Mapping",
        p3Desc: "Vector geological cartography of Mozambique synchronized with 3D relief. Automated extraction of structural lineaments, fractures, and faults using directional laplacian and sobel filters.",
        p3Sub: "Lithology, faults and fractures",
        p3Cta: "View Geology →",

        p4Title: "HidroGeoMoz & River Basins",
        p4Badge: "D8 & Strahler",
        p4Desc: "Automated hydrological delineation via D8 HydroSHEDS DEM, HydroBASINS hierarchy (levels 4 to 8), Strahler stream network ordering (1–5), and morphometric calculations of area, perimeter, and time of concentration.",
        p4Sub: "Drainage networks and basins",
        p4Cta: "View Basins →",

        p5Title: "Groundwater Potential Modeling (AHP)",
        p5Badge: "Aquifers & Boreholes",
        p5Desc: "Multi-criteria AHP (Analytic Hierarchy Process) decision analysis combining slope, lithology, soil type, drainage density, lineaments, and TWI to pinpoint optimal recharge zones and sustainable borehole sites.",
        p5Sub: "Aquifer recharge zones",
        p5Cta: "Map Groundwater →",

        p6Title: "GeoMoz AI & Planetary Intelligence",
        p6Badge: "Machine Learning",
        p6Desc: "Geostatistical and AI algorithms: Geological K-Means clustering with WebWorker multi-threading, 2-component PCA projection for lithofacies segregation, and mineral favorability scoring for critical minerals.",
        p6Sub: "K-Means, PCA and Random Forest",
        p6Cta: "Explore AI →",
      },
      reliefSection: {
        tag: "Morphometry & Digital Terrain",
        title: "High-Resolution 3D Relief and Topographic Profiles",
        desc: "Move beyond flat, static maps. GeoMoz processes the Copernicus GLO-30m digital elevation model to deliver true 3D morphometric analyses with metric accuracy anywhere on Earth.",
        f1Title: "Topographic A-B Cross-Section Profiles",
        f1Desc: "Draw a line across any geographical coordinate to generate instant altimetric profiles, cumulative elevation gains, maximum peak elevations, minimum valley depths, and slope gradient ratios.",
        f2Title: "Continuous Slope & Gradient Matrix",
        f2Desc: "Detect steep cliffs, alluvial valleys, and plateaus with automated slope categorization in degrees and percentage for civil engineering, geotechnical risk, and landslide assessment.",
        f3Title: "Hypsometry & Analytical Hillshading",
        f3Desc: "Generate analytical terrain shading that sharply highlights tectonic faults, fault scarps, canyons, and igneous dykes without optical distortion or visual noise.",
        demoProfileTitle: "Topographic Cross-Section (Sample Transect A-B)",
        distance: "Total Distance",
        minElev: "Min Elevation",
        maxElev: "Max Elevation",
        reliefGain: "Total Relief Gain",
      },
      remoteSection: {
        tag: "Remote Sensing Laboratory",
        title: "Over 40 Integrated Spectral & Biophysical Analyses",
        desc: "Filter by application domain and explore the power of Sentinel-2 (MSI) and Landsat 8/9 (OLI) multispectral sensors processed on Google Earth Engine's massive cloud infrastructure.",
        tabMinerals: "Minerals & Geology",
        tabVegetation: "Vegetation & Agriculture",
        tabWater: "Hydrology & Water Resources",
        tabHazards: "Geohazards & Disasters",
        tabAI: "Artificial Intelligence",
        ctaLaunchAnalyses: "Run in GeoAnalyses Module",
      },
      hydroSection: {
        tag: "Hydrological Sciences",
        title: "Precision Hydrology & Groundwater Exploration",
        desc: "Mozambique and Southern Africa face critical water security challenges. GeoMoz integrates comprehensive basin delineation tools and AHP multi-criteria modeling for scientific borehole placement.",
        c1Title: "HydroBASINS Watershed Delineation",
        c1Desc: "Multi-level catchment and sub-basin navigation (Pfafstetter levels 4–8) with automated calculation of drainage area, perimeter, Gravelius compactness coefficient, and Kirpich concentration time.",
        c2Title: "Strahler Stream Ordering",
        c2Desc: "Automated hierarchical stream extraction (orders 1 through 5), tracking upstream runoff accumulation paths and main stem flow directly from digital elevation data.",
        c3Title: "AHP Groundwater Potential (GWPZ)",
        c3Desc: "Multi-criteria overlay combining structural lineaments, CHIRPS rainfall averages, topographic slope, drainage density, and TWI (Topographic Wetness Index) to score community borehole drilling success.",
        c4Title: "Sentinel-1 SAR Radar Flood Mapping",
        c4Desc: "Cloud-penetrating Synthetic Aperture Radar (SAR) flood mapping, capturing surface water changes even beneath dense cloud decks and cyclonic downpours (Cyclones Idai, Kenneth, Freddy).",
        ctaHydro: "Open Hydrogeology Module",
      },
      useCases: {
        tag: "Real-World Applications",
        title: "Engineered for Territorial Challenges",
        desc: "Empower multidisciplinary teams with a single source of truth for geospatial datasets and planetary intelligence.",
        u1Title: "Mining & Critical Minerals",
        u1Desc: "Preliminary target identification for gold, lithium, copper, rare earths, and graphite. Map iron oxides, gossans, hydrothermal clays, and structural fractures prior to costly field exploration programs.",
        u2Title: "Government & Territorial Governance",
        u2Desc: "Land use planning, urban expansion monitoring with NDBI, continuous river basin oversight, and proactive contingency planning against climate emergencies, floods, and cyclones.",
        u3Title: "Agriculture & Water Security",
        u3Desc: "Crop vigor and drought surveillance via NDVI, EVI, and NDMI, irrigation perimeter planning, and scientific placement of high-yield community drinking water boreholes.",
        u4Title: "Academia & Scientific Research",
        u4Desc: "An open virtual geosciences laboratory for university students, professors, and researchers. Multi-temporal time-series analysis, computational geomorphology, and direct export to GeoJSON and PDF.",
      },
      ctaFinal: {
        title: "Ready to elevate your territorial intelligence?",
        subtitle:
          "No bulky desktop GIS installations, no license hurdles. Open GeoMoz Explorer 3D and start processing planetary intelligence in seconds.",
        ctaLaunch: "Enter 3D Platform",
        ctaRegister: "Create Free Account",
        disclaimer: "3D WebGL Acceleration • Google Earth Engine API • Open datasets from ESA & NASA",
      },
      footer: {
        desc: "Planetary geospatial intelligence, multispectral satellite remote sensing, and real-time 3D terrain modeling.",
        author: "Engineered by Helder Traquinho & GeoMoz Team.",
        modules: "System Modules",
        m1: "3D Globe & World Relief",
        m2: "GeoAnalyses & Satellite (Sentinel-2)",
        m3: "River Basins (HidroGeoMoz)",
        m4: "Groundwater (AHP Model)",
        m5: "Geohazards & Disasters (SAR Radar)",
        m6: "GeoMoz AI & Machine Learning",
        sources: "Scientific Data Providers",
        s1: "Copernicus DEM GLO-30m (ESA)",
        s2: "Google Earth Engine Platform",
        s3: "Sentinel-2 MSI & Sentinel-1 SAR (Copernicus)",
        s4: "Landsat 8-9 OLI (USGS / NASA)",
        s5: "National Mining Institute of Mozambique (INAMI)",
        s6: "HydroSHEDS & HydroBASINS (WWF / USGS)",
        account: "Access & Account",
        loggedInAs: "Signed in as:",
        logout: "Sign Out",
        login: "Sign In (Login)",
        register: "Create New Account",
        openPlatform: "Open 3D Platform →",
        rights: "GeoMoz-Explorer. All rights reserved.",
        mission: "Designed for scientific sovereignty and excellence in earth intelligence.",
      },
    },
  }[lang];

  // ── Real Analyses Catalog ───────────────────────────────────────────────────
  const ANALYSIS_ITEMS = [
    {
      group: "minerals",
      code: "FeOx",
      name: lang === "pt" ? "Óxidos de Ferro (Hematite / Goethite)" : "Iron Oxides (Hematite / Goethite)",
      formula: "B4 / B2 (Sentinel-2)",
      sensor: "Sentinel-2 MSI / Landsat 8",
      desc:
        lang === "pt"
          ? "Rácio espectral sensível a minerais ferrosos e coberturas limoníticas, essencial para prospeção de depósitos de ferro e sulfuretos oxidados."
          : "Spectral ratio sensitive to ferrous minerals and limonitic caps, critical for iron and oxidized sulfide ore exploration.",
    },
    {
      group: "minerals",
      code: "Clay",
      name: lang === "pt" ? "Minerais de Argila & Al-OH" : "Clay Minerals & Al-OH",
      formula: "B11 / B12 (SWIR1 / SWIR2)",
      sensor: "Sentinel-2 MSI",
      desc:
        lang === "pt"
          ? "Deteta absorção profunda de alumínio-hidroxilo (Al-OH), identificando caulinite, ilite e zonas de alteração argílica filítica."
          : "Detects diagnostic aluminum-hydroxyl (Al-OH) absorption, identifying kaolinite, illite, and argillic alteration halos.",
    },
    {
      group: "minerals",
      code: "Gossan",
      name: lang === "pt" ? "Índice de Gossan / Chapéu de Ferro" : "Gossan / Iron Hat Index",
      formula: "B11 / B4",
      sensor: "Sentinel-2 MSI",
      desc:
        lang === "pt"
          ? "Destaca zonas de oxidação de sulfuretos maciços expostos à superfície com alta concentração de óxidos secundários."
          : "Highlights massive sulfide oxidation caps exposed at surface with high secondary iron concentrations.",
    },
    {
      group: "minerals",
      code: "Hydro",
      name: lang === "pt" ? "Alteração Hidrotermal Composta" : "Composite Hydrothermal Alteration",
      formula: "(B11 + B4) / (B8A + B3)",
      sensor: "Sentinel-2 MSI",
      desc:
        lang === "pt"
          ? "Combina simultaneamente absorção de argilas e reflexão de óxidos de ferro para mapear halos de pórfiro e veios epitermais."
          : "Simultaneously combines clay absorption and iron oxide reflectance to trace porphyry halos and epithermal veins.",
    },
    {
      group: "vegetation",
      code: "NDVI",
      name: lang === "pt" ? "Índice de Vegetação por Diferença Normalizada" : "Normalized Difference Vegetation Index",
      formula: "(NIR - Red) / (NIR + Red)",
      sensor: "Sentinel-2 B8/B4",
      desc:
        lang === "pt"
          ? "O padrão ouro para biomassa fotossinteticamente ativa, vigor foliar e monitorização contínua de ciclos fenológicos agrícolas."
          : "The gold standard for photosynthetically active biomass, canopy vigor, and agricultural crop cycle tracking.",
    },
    {
      group: "vegetation",
      code: "EVI",
      name: lang === "pt" ? "Índice de Vegetação Melhorado" : "Enhanced Vegetation Index",
      formula: "2.5 * ((NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1))",
      sensor: "Sentinel-2 / Landsat",
      desc:
        lang === "pt"
          ? "Otimizado para regiões de alta biomassa florestal com correção de efeitos de aerossóis atmosféricos e saturação de copa."
          : "Optimized for dense forest biomass, compensating for atmospheric aerosol scattering and canopy saturation.",
    },
    {
      group: "vegetation",
      code: "NDMI",
      name: lang === "pt" ? "Índice de Humidade da Vegetação" : "Normalized Difference Moisture Index",
      formula: "(NIR - SWIR1) / (NIR + SWIR1)",
      sensor: "Sentinel-2 B8/B11",
      desc:
        lang === "pt"
          ? "Sensível ao teor de água contido nas folhas das culturas e copas das árvores, atuando como alerta precoce de seca agrícola."
          : "Directly correlates with canopy liquid water content, acting as an early-warning metric for agricultural drought stress.",
    },
    {
      group: "water",
      code: "NDWI",
      name: lang === "pt" ? "Índice de Água por Diferença Normalizada" : "Normalized Difference Water Index (McFeeters)",
      formula: "(Green - NIR) / (Green + NIR)",
      sensor: "Sentinel-2 B3/B8",
      desc:
        lang === "pt"
          ? "Delineação nítida de massas de água superficiais, albufeiras, meandros fluviais e charcos sazonais com supressão de solos."
          : "Sharp delineation of open surface water bodies, reservoirs, river courses, and ephemeral wetlands with soil suppression.",
    },
    {
      group: "water",
      code: "AHP",
      name: lang === "pt" ? "Potencial de Água Subterrânea (GWPZ)" : "Groundwater Potential Zones (AHP)",
      formula: "Overlay(Declive, Litologia, Drenagem, TWI, Solos)",
      sensor: "Copernicus DEM + CHIRPS + Vetores",
      desc:
        lang === "pt"
          ? "Modelo analítico multicritério que pondera 6 camadas biofísicas para identificar zonas de infiltração aquífera para furos."
          : "Multi-criteria analytical model weighting 6 biophysical layers to locate high-yield aquifer infiltration zones for boreholes.",
    },
    {
      group: "hazards",
      code: "SAR",
      name: lang === "pt" ? "Inundações por Radar Sentinel-1 (C-Band)" : "Sentinel-1 C-Band SAR Flood Mapping",
      formula: "Backscatter VV/VH Change Detection",
      sensor: "Sentinel-1 SAR Radar",
      desc:
        lang === "pt"
          ? "Mapeia manchas de cheia mesmo com 100% de nebulosidade durante ciclones severos, comparando antes e depois do evento."
          : "Maps flood extent through 100% cloud cover during extreme cyclones by comparing pre- and post-event backscatter changes.",
    },
    {
      group: "hazards",
      code: "RUSLE",
      name: lang === "pt" ? "Perda de Solo e Erosão (RUSLE)" : "Soil Erosion Risk (RUSLE)",
      formula: "A = R * K * LS * C * P",
      sensor: "CHIRPS + DEM 30m + LULC",
      desc:
        lang === "pt"
          ? "Equação universal revisada de perda de solo que estima a erosão laminar em toneladas por hectare por ano."
          : "Revised Universal Soil Loss Equation estimating sheet and rill erosion in metric tons per hectare per year.",
    },
    {
      group: "ai",
      code: "ML-K",
      name: lang === "pt" ? "Clustering Geológico K-Means" : "Geological K-Means Clustering",
      formula: "WebWorker K-Means++ (TS Multithreaded)",
      sensor: "Sentinel-2 Multi-band + DEM",
      desc:
        lang === "pt"
          ? "Agrupamento não supervisionado de assinaturas litológicas executado diretamente no navegador através de WebWorkers."
          : "Unsupervised clustering of spectral-lithological signatures executed client-side via multithreaded WebWorkers.",
    },
  ];

  const filteredAnalyses =
    activeAnalysisGroup === "all"
      ? ANALYSIS_ITEMS
      : ANALYSIS_ITEMS.filter((item) => item.group === activeAnalysisGroup);

  return (
    <div
      className={`min-h-screen font-sans antialiased selection:bg-sky-500 selection:text-white transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100 dark" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* ── Background Glows & Spatial Grid ───────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-sky-600/20 via-indigo-600/15 to-transparent blur-[140px] rounded-full" />
            <div className="absolute top-[35%] -left-48 w-[500px] h-[500px] bg-purple-600/10 blur-[130px] rounded-full" />
            <div className="absolute top-[65%] -right-48 w-[550px] h-[550px] bg-blue-600/10 blur-[140px] rounded-full" />
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
                backgroundSize: "32px 32px",
              }}
            />
          </>
        ) : (
          <>
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-sky-200/50 via-blue-100/40 to-transparent blur-[120px] rounded-full" />
            <div className="absolute top-[35%] -left-48 w-[500px] h-[500px] bg-indigo-100/40 blur-[120px] rounded-full" />
            <div className="absolute top-[65%] -right-48 w-[550px] h-[550px] bg-sky-100/40 blur-[120px] rounded-full" />
            <div
              className="absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage: `linear-gradient(to right, #0284c7 1px, transparent 1px), linear-gradient(to bottom, #0284c7 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
              }}
            />
          </>
        )}
      </div>

      {/* ── 1. Fixed Header (Cabeçalho Fixo) ─────────────────────────────────── */}
      <header
        className={`sticky top-0 z-50 w-full backdrop-blur-xl border-b transition-colors duration-200 ${
          isDark
            ? "bg-slate-950/80 border-slate-800/80 shadow-lg shadow-black/20"
            : "bg-white/85 border-slate-200 shadow-sm"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <Link href="/" className="flex items-center gap-3 group cursor-pointer shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 p-0.5 shadow-md shadow-sky-500/20 group-hover:shadow-sky-500/35 transition-all">
              <div
                className={`w-full h-full rounded-[10px] flex items-center justify-center transition-colors ${
                  isDark ? "bg-slate-950 text-sky-400" : "bg-white text-sky-600"
                }`}
              >
                <Globe size={20} className="group-hover:rotate-45 transition-transform duration-500" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight flex items-center gap-1.5">
                GeoMoz<span className="text-sky-600 dark:text-sky-400">Explorer</span>
                <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                  3D
                </span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wider hidden sm:block">
                {lang === "pt" ? "Inteligência Geoespacial Planetária" : "Planetary Geospatial Intelligence"}
              </span>
            </div>
          </Link>

          {/* Desktop Anchor Navigation */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <a
              href="#recursos"
              className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t.nav.recursos}
            </a>
            <a
              href="#relevo-3d"
              className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t.nav.relevo3d}
            </a>
            <a
              href="#detecao-remota"
              className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t.nav.detecaoRemota}
            </a>
            <a
              href="#hidrogeologia"
              className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t.nav.hidrogeologia}
            </a>
            <a
              href="#casos-de-uso"
              className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              {t.nav.casosDeUso}
            </a>
          </nav>

          {/* Controls: Lang Toggle + Theme Toggle + Auth / Launch Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Language Switcher Button (PT / EN) */}
            <button
              type="button"
              onClick={toggleLang}
              title={lang === "pt" ? "Mudar para Inglês (EN)" : "Switch to Portuguese (PT)"}
              className={`h-9 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                  : "bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 shadow-sm"
              }`}
            >
              <Languages size={14} className="text-sky-500" />
              <span className="uppercase">{lang}</span>
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? "Ativar Modo Claro" : "Ativar Modo Noturno"}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-amber-400 hover:text-amber-300 hover:border-slate-700"
                  : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-sm"
              }`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Auth / Account Buttons */}
            {user ? (
              <div className="flex items-center gap-2">
                <div
                  className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-xl border text-xs ${
                    isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200 text-slate-800"
                  }`}
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || "User"}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 font-bold text-[10px] flex items-center justify-center">
                      {user.email?.slice(0, 2).toUpperCase() || "U"}
                    </div>
                  )}
                  <span className="font-semibold truncate max-w-[110px]">
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={handleLaunchApp}
                  className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold px-3.5 h-9 rounded-xl shadow-md shadow-sky-600/20"
                >
                  <span className="hidden sm:inline">{t.nav.launch}</span>
                  <span className="sm:hidden">3D</span>
                  <ArrowRight size={14} className="ml-1" />
                </Button>

                <button
                  type="button"
                  onClick={() => signOut()}
                  title={t.nav.logout}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                    isDark
                      ? "border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-rose-400"
                      : "border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-rose-600 shadow-sm"
                  }`}
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAuth("login")}
                  className={`text-xs font-semibold h-9 px-2.5 sm:px-3 rounded-xl ${
                    isDark
                      ? "text-slate-300 hover:text-white hover:bg-slate-900"
                      : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <LogIn size={14} className="mr-1 sm:mr-1.5 text-sky-500" />
                  <span className="hidden sm:inline">{t.nav.login}</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => openAuth("register")}
                  className={`hidden md:inline-flex text-xs font-semibold px-3 h-9 rounded-xl border shadow-sm transition-all ${
                    isDark
                      ? "bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700"
                      : "bg-white hover:bg-slate-50 text-slate-800 border-slate-200"
                  }`}
                >
                  <UserPlus size={14} className="mr-1.5 text-sky-500" />
                  <span>{t.nav.register}</span>
                </Button>

                <Button
                  size="sm"
                  onClick={handleLaunchApp}
                  className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 h-9 rounded-xl shadow-md shadow-sky-600/25"
                >
                  <span>{lang === "pt" ? "Explorar" : "Explore"}</span>
                  <ArrowRight size={14} className="ml-1" />
                </Button>
              </div>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`lg:hidden w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                isDark
                  ? "bg-slate-900 border-slate-800 text-slate-300"
                  : "bg-white border-slate-200 text-slate-700 shadow-sm"
              }`}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className={`lg:hidden border-t px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200 ${
              isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200 shadow-xl"
            }`}
          >
            <nav className="flex flex-col space-y-2 text-sm font-semibold">
              <a
                href="#recursos"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-sky-500/10 hover:text-sky-600 transition-colors"
              >
                {t.nav.recursos}
              </a>
              <a
                href="#relevo-3d"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-sky-500/10 hover:text-sky-600 transition-colors"
              >
                {t.nav.relevo3d}
              </a>
              <a
                href="#detecao-remota"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-sky-500/10 hover:text-sky-600 transition-colors"
              >
                {t.nav.detecaoRemota}
              </a>
              <a
                href="#hidrogeologia"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-sky-500/10 hover:text-sky-600 transition-colors"
              >
                {t.nav.hidrogeologia}
              </a>
              <a
                href="#casos-de-uso"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg hover:bg-sky-500/10 hover:text-sky-600 transition-colors"
              >
                {t.nav.casosDeUso}
              </a>
            </nav>

            {!user && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAuth("login")}
                  className="flex-1 text-xs"
                >
                  <LogIn size={14} className="mr-1.5" />
                  {t.nav.login}
                </Button>
                <Button
                  size="sm"
                  onClick={() => openAuth("register")}
                  className="flex-1 text-xs bg-sky-600 text-white"
                >
                  <UserPlus size={14} className="mr-1.5" />
                  {t.nav.register}
                </Button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── 2. Hero Section: Planetary Intelligence & 3D Morphometry ─────────────── */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
          {/* Scientific Telemetry Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border shadow-sm mb-6 transition-colors ${
              isDark
                ? "bg-slate-900/90 border-slate-800 text-slate-300"
                : "bg-white border-slate-200 text-slate-700 shadow-sm"
            }`}
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-600"></span>
            </span>
            <span className="text-xs font-semibold">{t.hero.badge}</span>
            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-extrabold bg-sky-50 dark:bg-sky-950 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
              {t.hero.badgeNew}
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight max-w-5xl leading-[1.15] mb-6">
            {t.hero.titlePre}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 dark:from-sky-400 dark:via-indigo-300 dark:to-purple-400">
              {t.hero.titleHighlight}
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className={`text-sm sm:text-base lg:text-lg max-w-3xl leading-relaxed mb-8 font-normal ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {t.hero.subtitle}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 mb-12 w-full sm:w-auto">
            <Button
              size="lg"
              onClick={handleLaunchApp}
              className="w-full sm:w-auto px-7 py-3.5 h-auto text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl shadow-xl shadow-sky-600/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <span>{t.hero.ctaPrimary}</span>
              <ArrowRight size={17} />
            </Button>

            {!user && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => openAuth("register")}
                className={`w-full sm:w-auto px-6 py-3.5 h-auto text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                  isDark
                    ? "bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-500"
                    : "bg-white hover:bg-slate-50 text-slate-800 border-slate-300 shadow-sm"
                }`}
              >
                <UserPlus size={16} className="text-sky-500" />
                <span>{t.hero.ctaSecondary}</span>
              </Button>
            )}

            <Button
              size="lg"
              variant="ghost"
              onClick={() => {
                const el = document.getElementById("recursos");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`w-full sm:w-auto text-sm font-semibold h-auto py-3 px-4 ${
                isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{t.hero.ctaExplore}</span>
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* ── Realistic Interactive 3D Terrain & Telemetry Canvas Frame ──────────── */}
          <div
            className={`w-full max-w-5xl rounded-2xl p-2 md:p-3 border shadow-2xl relative overflow-hidden group transition-colors ${
              isDark
                ? "bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border-slate-800 shadow-sky-950/40"
                : "bg-gradient-to-b from-slate-100 via-white to-slate-100 border-slate-300 shadow-slate-200/80"
            }`}
          >
            {/* Window Bar */}
            <div
              className={`flex items-center justify-between px-3 py-2 border-b text-xs mb-2 ${
                isDark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-600"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500/90" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/90" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/90" />
                </div>
                <span className="font-mono text-[11px] font-semibold text-sky-600 dark:text-sky-400 ml-2">
                  {t.hero.hudBadge}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Copernicus GLO-30 Active
                </span>
              </div>
            </div>

            {/* Screen Graphic Area */}
            <div
              className={`relative rounded-xl overflow-hidden aspect-[16/9] md:aspect-[21/10] border flex flex-col justify-between p-4 sm:p-6 text-left ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-slate-900 text-white border-slate-200"
              }`}
            >
              {/* Planetary Terrain Gradient Simulation */}
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-sky-950/60" />

              {/* Coordinate Grid Texture */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
                  backgroundSize: "28px 28px",
                }}
              />

              {/* Glowing High-Tech Topographic Profile Silhouette */}
              <svg
                className="absolute bottom-0 left-0 right-0 w-full h-4/5 pointer-events-none opacity-80"
                viewBox="0 0 1200 400"
                fill="none"
              >
                <path
                  d="M0 400 L0 310 Q180 260, 320 280 T620 120 Q750 40, 880 160 T1200 90 L1200 400 Z"
                  fill="url(#terrain-gradient-light)"
                />
                <path
                  d="M0 310 Q180 260, 320 280 T620 120 Q750 40, 880 160 T1200 90"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="6 3"
                />
                {/* Secondary profile cut B */}
                <path
                  d="M0 340 Q220 300, 420 290 T750 180 Q880 130, 1020 210 T1200 160"
                  stroke="#818cf8"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
                <defs>
                  <linearGradient id="terrain-gradient-light" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Overlay HUD 1: Simulated Pixel Inspector & Topographic Readout */}
              <div className="relative z-10 max-w-sm bg-slate-950/90 backdrop-blur-md p-4 rounded-xl border border-slate-700/80 shadow-2xl space-y-2.5 text-xs text-slate-100">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5 font-bold text-sky-400">
                    <Activity size={15} />
                    <span>Pixel & Terrain Inspector</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                    EPSG:4326 • WGS84
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                      {t.hero.elevation}
                    </span>
                    <span className="font-mono font-bold text-white text-sm">
                      {t.hero.elevationVal}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                      {t.hero.slope}
                    </span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {t.hero.slopeVal}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                      {t.hero.lithology}
                    </span>
                    <span className="font-semibold text-slate-200 truncate block">
                      {t.hero.lithologyVal}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                      {t.hero.spectral}
                    </span>
                    <span className="font-mono font-bold text-emerald-400 block">
                      {t.hero.spectralVal}
                    </span>
                  </div>
                </div>
              </div>

              {/* Overlay HUD 2: Morphometric A-B Transect Pill */}
              <div className="relative z-10 self-end flex items-center gap-3 bg-slate-950/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs text-slate-100">
                <div className="flex items-center gap-2">
                  <Ruler size={16} className="text-indigo-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">
                      {lang === "pt" ? "Corte Topográfico A-B" : "A-B Elevation Transect"}
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-sm">
                      ΔH: 1.840 m • 18.4 km
                    </span>
                  </div>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div className="text-[10px] text-slate-300">
                  <span>{lang === "pt" ? "Resolução:" : "Resolution:"} <strong>30 m (GLO-30)</strong></span>
                  <span className="block text-emerald-400 font-mono font-semibold">
                    {t.hero.alterationVal}
                  </span>
                </div>
              </div>

              {/* Hover Trigger Action Button */}
              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none backdrop-blur-[2px]">
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="pointer-events-auto px-6 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-2xl shadow-sky-500/50 flex items-center gap-2 transition-transform hover:scale-105"
                >
                  <span>{t.hero.ctaPrimary}</span>
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Strategic System Metrics ────────────────────────────────────────── */}
      <section
        className={`py-12 border-y relative z-10 transition-colors ${
          isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-white border-slate-200"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y sm:divide-y-0 sm:divide-x ${
              isDark ? "divide-slate-800" : "divide-slate-200"
            }`}
          >
            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-500">
                {t.stats.s1Value}
              </span>
              <p className="text-xs sm:text-sm font-bold mt-1">{t.stats.s1Title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t.stats.s1Desc}
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-500">
                {t.stats.s2Value}
              </span>
              <p className="text-xs sm:text-sm font-bold mt-1">{t.stats.s2Title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t.stats.s2Desc}
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-500">
                {t.stats.s3Value}
              </span>
              <p className="text-xs sm:text-sm font-bold mt-1">{t.stats.s3Title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t.stats.s3Desc}
              </p>
            </div>

            <div className="pt-4 sm:pt-0">
              <span className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-500">
                {t.stats.s4Value}
              </span>
              <p className="text-xs sm:text-sm font-bold mt-1">{t.stats.s4Title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t.stats.s4Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. #recursos — The 6 Core Pillars of GeoMoz ─────────────────────────── */}
      <section id="recursos" className="py-20 lg:py-28 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/80 px-3 py-1 rounded-full border border-sky-200 dark:border-sky-800">
              {t.pillars.tag}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">
              {t.pillars.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t.pillars.desc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Pillar 1: 3D Topographic Morphometry */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-sky-500/50 hover:shadow-sky-500/10"
                  : "bg-white border-slate-200 hover:border-sky-400 hover:shadow-sky-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 mb-4 group-hover:scale-110 transition-transform">
                  <Mountain size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p1Title}</span>
                  <span className="text-[9px] text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                    {t.pillars.p1Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p1Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p1Sub}</span>
                <a
                  href="#relevo-3d"
                  className="text-sky-600 dark:text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform"
                >
                  {t.pillars.p1Cta}
                </a>
              </div>
            </div>

            {/* Pillar 2: Remote Sensing & Spectrometry */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-sky-500/50 hover:shadow-sky-500/10"
                  : "bg-white border-slate-200 hover:border-sky-400 hover:shadow-sky-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
                  <Satellite size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p2Title}</span>
                  <span className="text-[9px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    {t.pillars.p2Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p2Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p2Sub}</span>
                <a
                  href="#detecao-remota"
                  className="text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform"
                >
                  {t.pillars.p2Cta}
                </a>
              </div>
            </div>

            {/* Pillar 3: Geology & Structural Lineaments */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-emerald-500/50 hover:shadow-emerald-500/10"
                  : "bg-white border-slate-200 hover:border-emerald-400 hover:shadow-emerald-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                  <Gem size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p3Title}</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    {t.pillars.p3Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p3Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p3Sub}</span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleLaunchApp}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold p-0 h-auto"
                >
                  {t.pillars.p3Cta}
                </Button>
              </div>
            </div>

            {/* Pillar 4: HidroGeoMoz River Basins */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-blue-500/50 hover:shadow-blue-500/10"
                  : "bg-white border-slate-200 hover:border-blue-400 hover:shadow-blue-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                  <Droplets size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p4Title}</span>
                  <span className="text-[9px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                    {t.pillars.p4Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p4Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p4Sub}</span>
                <a
                  href="#hidrogeologia"
                  className="text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform"
                >
                  {t.pillars.p4Cta}
                </a>
              </div>
            </div>

            {/* Pillar 5: Groundwater AHP Modeling */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-cyan-500/50 hover:shadow-cyan-500/10"
                  : "bg-white border-slate-200 hover:border-cyan-400 hover:shadow-cyan-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                  <Droplet size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p5Title}</span>
                  <span className="text-[9px] text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-800">
                    {t.pillars.p5Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p5Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p5Sub}</span>
                <a
                  href="#hidrogeologia"
                  className="text-cyan-600 dark:text-cyan-400 font-semibold group-hover:translate-x-0.5 transition-transform"
                >
                  {t.pillars.p5Cta}
                </a>
              </div>
            </div>

            {/* Pillar 6: GeoMoz AI & Machine Learning */}
            <div
              className={`p-6 rounded-2xl border transition-all hover:shadow-xl flex flex-col justify-between group ${
                isDark
                  ? "bg-slate-900/60 border-slate-800 hover:border-purple-500/50 hover:shadow-purple-500/10"
                  : "bg-white border-slate-200 hover:border-purple-400 hover:shadow-purple-100"
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                  <BrainCircuit size={24} />
                </div>
                <h3 className="text-base font-bold mb-2 flex items-center gap-2">
                  <span>{t.pillars.p6Title}</span>
                  <span className="text-[9px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    {t.pillars.p6Badge}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t.pillars.p6Desc}
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{t.pillars.p6Sub}</span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleLaunchApp}
                  className="text-purple-600 dark:text-purple-400 font-semibold p-0 h-auto"
                >
                  {t.pillars.p6Cta}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. #relevo-3d — 3D Topographic Morphometry (Zero Solar Focus) ────────── */}
      <section
        id="relevo-3d"
        className={`py-20 border-t relative z-10 transition-colors ${
          isDark ? "bg-slate-900/40 border-slate-800/80" : "bg-slate-100/70 border-slate-200"
        }`}
      >
        {/* Supporting alias anchor for links to #3d-solar */}
        <div id="3d-solar" className="sr-only" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12 text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950 px-3 py-1 rounded-full border border-sky-200 dark:border-sky-800">
              {t.reliefSection.tag}
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-3 mb-3">
              {t.reliefSection.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t.reliefSection.desc}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Morphometry feature items */}
            <div className="lg:col-span-6 space-y-6">
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Ruler size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-1">{t.reliefSection.f1Title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t.reliefSection.f1Desc}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-1">{t.reliefSection.f2Title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t.reliefSection.f2Desc}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold mb-1">{t.reliefSection.f3Title}</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {t.reliefSection.f3Desc}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleLaunchApp}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl px-5 py-3 shadow-md shadow-sky-600/20 flex items-center gap-2"
                >
                  <span>{lang === "pt" ? "Abrir Perfis Topográficos no Mapa" : "Open Topographic Profiles in Map"}</span>
                  <ArrowRight size={14} />
                </Button>
              </div>
            </div>

            {/* Interactive Profile Visualization Card */}
            <div className="lg:col-span-6">
              <div
                className={`p-6 rounded-2xl border shadow-xl ${
                  isDark
                    ? "bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800"
                    : "bg-white border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <Mountain size={18} className="text-sky-500" />
                    <span className="text-xs font-bold">{t.reliefSection.demoProfileTitle}</span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    Copernicus DEM 30m
                  </span>
                </div>

                {/* SVG Transect Diagram */}
                <div className="w-full h-44 bg-slate-950 rounded-xl p-3 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 z-10">
                    <span>Ponto A (Vale do Licungo: 340m)</span>
                    <span className="text-amber-400 font-bold">Pico Namúli (2.419m)</span>
                    <span>Ponto B (Gurúè: 620m)</span>
                  </div>

                  <svg viewBox="0 0 500 130" className="w-full h-28 my-auto overflow-visible">
                    {/* Grid lines */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
                    <line x1="0" y1="60" x2="500" y2="60" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
                    <line x1="0" y1="100" x2="500" y2="100" stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />

                    {/* Mountain Profile Path */}
                    <path
                      d="M0 115 Q80 110, 140 95 T260 15 Q340 70, 420 85 T500 105 L500 130 L0 130 Z"
                      fill="url(#profile-gradient-ab)"
                    />
                    <path
                      d="M0 115 Q80 110, 140 95 T260 15 Q340 70, 420 85 T500 105"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />

                    {/* Peak Marker Point */}
                    <circle cx="260" cy="15" r="4" fill="#f59e0b" />
                    <line x1="260" y1="15" x2="260" y2="120" stroke="#f59e0b" strokeDasharray="2 2" strokeWidth="1" />

                    <defs>
                      <linearGradient id="profile-gradient-ab" x1="0%" y1="0%" x2="0%" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                  </svg>

                  <div className="flex justify-between text-[9px] font-mono text-slate-500 z-10">
                    <span>0.0 km</span>
                    <span>12.5 km</span>
                    <span>24.8 km</span>
                  </div>
                </div>

                {/* Profile Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 text-center">
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 block">{t.reliefSection.distance}</span>
                    <span className="font-mono font-bold text-xs text-sky-600 dark:text-sky-400">
                      24.8 km
                    </span>
                  </div>

                  <div
                    className={`p-2.5 rounded-xl border ${
                      isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 block">{t.reliefSection.minElev}</span>
                    <span className="font-mono font-bold text-xs">340 m</span>
                  </div>

                  <div
                    className={`p-2.5 rounded-xl border ${
                      isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 block">{t.reliefSection.maxElev}</span>
                    <span className="font-mono font-bold text-xs text-amber-500">2.419 m</span>
                  </div>

                  <div
                    className={`p-2.5 rounded-xl border ${
                      isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 block">{t.reliefSection.reliefGain}</span>
                    <span className="font-mono font-bold text-emerald-500">+2.079 m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. #detecao-remota — Remote Sensing Catalog (System Sweep) ───────────── */}
      <section id="detecao-remota" className="py-20 lg:py-28 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
              {t.remoteSection.tag}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">
              {t.remoteSection.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t.remoteSection.desc}
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex justify-center gap-2 overflow-x-auto pb-4 mb-8 scrollbar-none">
            {[
              { id: "minerals", label: t.remoteSection.tabMinerals, icon: <Gem size={14} /> },
              { id: "vegetation", label: t.remoteSection.tabVegetation, icon: <Sprout size={14} /> },
              { id: "water", label: t.remoteSection.tabWater, icon: <Droplets size={14} /> },
              { id: "hazards", label: t.remoteSection.tabHazards, icon: <AlertTriangle size={14} /> },
              { id: "ai", label: t.remoteSection.tabAI, icon: <BrainCircuit size={14} /> },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveAnalysisGroup(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeAnalysisGroup === cat.id
                    ? "bg-sky-600 text-white shadow-md shadow-sky-600/25"
                    : isDark
                    ? "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 shadow-sm"
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Cards Grid of Real Analyses */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredAnalyses.map((item) => (
              <div
                key={item.name}
                className={`p-5 rounded-2xl border transition-all hover:shadow-lg flex flex-col justify-between ${
                  isDark
                    ? "bg-slate-900/60 border-slate-800 hover:border-sky-500/40"
                    : "bg-white border-slate-200 hover:border-sky-300 shadow-sm"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                      {item.code}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{item.sensor}</span>
                  </div>
                  <h4 className="text-sm font-bold leading-snug">{item.name}</h4>
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-[10px] text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-800 break-all">
                    {item.formula}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    {lang === "pt" ? "GEE Nativo" : "Native GEE"}
                  </span>
                  <button
                    type="button"
                    onClick={handleLaunchApp}
                    className="text-sky-600 dark:text-sky-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <span>{lang === "pt" ? "Calcular" : "Compute"}</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Button
              onClick={handleLaunchApp}
              className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl px-7 py-3 shadow-lg shadow-sky-600/20"
            >
              <span>{t.remoteSection.ctaLaunchAnalyses}</span>
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── 7. #hidrogeologia — Hydrogeology & Groundwater Potential ─────────────── */}
      <section
        id="hidrogeologia"
        className={`py-20 border-t relative z-10 transition-colors ${
          isDark ? "bg-slate-900/30 border-slate-800/80" : "bg-sky-50/50 border-slate-200"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800">
              {t.hydroSection.tag}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">
              {t.hydroSection.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t.hydroSection.desc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div
              className={`p-5 rounded-2xl border transition-all ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                <Droplets size={20} />
              </div>
              <h4 className="text-sm font-bold mb-1.5">{t.hydroSection.c1Title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.hydroSection.c1Desc}
              </p>
            </div>

            <div
              className={`p-5 rounded-2xl border transition-all ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-3">
                <Waves size={20} />
              </div>
              <h4 className="text-sm font-bold mb-1.5">{t.hydroSection.c2Title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.hydroSection.c2Desc}
              </p>
            </div>

            <div
              className={`p-5 rounded-2xl border transition-all ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
                <Droplet size={20} />
              </div>
              <h4 className="text-sm font-bold mb-1.5">{t.hydroSection.c3Title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.hydroSection.c3Desc}
              </p>
            </div>

            <div
              className={`p-5 rounded-2xl border transition-all ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                <AlertTriangle size={20} />
              </div>
              <h4 className="text-sm font-bold mb-1.5">{t.hydroSection.c4Title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.hydroSection.c4Desc}
              </p>
            </div>
          </div>

          <div className="text-center">
            <Button
              onClick={handleLaunchApp}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl px-7 py-3 shadow-md shadow-blue-600/20"
            >
              <span>{t.hydroSection.ctaHydro}</span>
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── 8. #casos-de-uso — Real-world Strategic Sectors (Strictly NO emojis) ── */}
      <section id="casos-de-uso" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
            {t.useCases.tag}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-3 mb-4">
            {t.useCases.title}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-14">
            {t.useCases.desc}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {/* Use Case 1: Mining & Minerals */}
            <div
              className={`p-6 rounded-2xl border space-y-3.5 transition-all hover:shadow-lg ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
                <Mountain size={24} />
              </div>
              <h3 className="text-sm font-bold">{t.useCases.u1Title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.useCases.u1Desc}
              </p>
            </div>

            {/* Use Case 2: Governments & Municipalities */}
            <div
              className={`p-6 rounded-2xl border space-y-3.5 transition-all hover:shadow-lg ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
                <Building2 size={24} />
              </div>
              <h3 className="text-sm font-bold">{t.useCases.u2Title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.useCases.u2Desc}
              </p>
            </div>

            {/* Use Case 3: Agriculture & Water Security */}
            <div
              className={`p-6 rounded-2xl border space-y-3.5 transition-all hover:shadow-lg ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                <Sprout size={24} />
              </div>
              <h3 className="text-sm font-bold">{t.useCases.u3Title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.useCases.u3Desc}
              </p>
            </div>

            {/* Use Case 4: Academia & Research */}
            <div
              className={`p-6 rounded-2xl border space-y-3.5 transition-all hover:shadow-lg ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-500">
                <GraduationCap size={24} />
              </div>
              <h3 className="text-sm font-bold">{t.useCases.u4Title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t.useCases.u4Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. Final Conversion CTA Banner ──────────────────────────────────────── */}
      <section className="py-16 relative z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`rounded-3xl p-8 sm:p-12 border shadow-2xl relative overflow-hidden text-center flex flex-col items-center ${
              isDark
                ? "bg-gradient-to-r from-sky-950 via-indigo-950 to-slate-950 border-sky-500/30"
                : "bg-gradient-to-r from-sky-600 via-indigo-600 to-slate-900 text-white border-sky-400/30"
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white mb-4">
              <Globe size={24} />
            </div>

            <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-3 text-white">
              {t.ctaFinal.title}
            </h2>
            <p className="text-xs sm:text-sm text-sky-100 max-w-xl mb-8 leading-relaxed">
              {t.ctaFinal.subtitle}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <Button
                size="lg"
                onClick={handleLaunchApp}
                className="w-full sm:w-auto px-8 py-3.5 h-auto text-sm font-bold bg-white text-slate-900 hover:bg-slate-100 rounded-xl shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
              >
                <span>{t.ctaFinal.ctaLaunch}</span>
                <ArrowRight size={16} />
              </Button>

              {!user && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => openAuth("register")}
                  className="w-full sm:w-auto px-6 py-3.5 h-auto text-sm font-semibold bg-white/10 hover:bg-white/20 text-white border-white/30 rounded-xl transition-all"
                >
                  <UserPlus size={16} className="mr-2" />
                  <span>{t.ctaFinal.ctaRegister}</span>
                </Button>
              )}
            </div>

            <p className="text-[11px] text-sky-200/80 mt-5 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>{t.ctaFinal.disclaimer}</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 10. Comprehensive Bilingual Footer ─────────────────────────────────── */}
      <footer
        className={`border-t py-12 text-xs relative z-10 transition-colors ${
          isDark
            ? "bg-slate-950 border-slate-800 text-slate-400"
            : "bg-white border-slate-200 text-slate-600"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 text-left">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                  <Globe size={16} />
                </div>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  GeoMoz Explorer 3D
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">{t.footer.desc}</p>
              <p className="text-[10px] text-slate-400">{t.footer.author}</p>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-200 text-xs mb-3 uppercase tracking-wider">
                {t.footer.modules}
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                <li>
                  <Link href="/mapa" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m1}
                  </Link>
                </li>
                <li>
                  <Link href="/analises" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m2}
                  </Link>
                </li>
                <li>
                  <Link href="/hidrografia" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m3}
                  </Link>
                </li>
                <li>
                  <Link href="/agua-subterranea" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m4}
                  </Link>
                </li>
                <li>
                  <Link href="/geoperigos" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m5}
                  </Link>
                </li>
                <li>
                  <Link href="/geomoz-ai" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    {t.footer.m6}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-200 text-xs mb-3 uppercase tracking-wider">
                {t.footer.sources}
              </h4>
              <ul className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <li>{t.footer.s1}</li>
                <li>{t.footer.s2}</li>
                <li>{t.footer.s3}</li>
                <li>{t.footer.s4}</li>
                <li>{t.footer.s5}</li>
                <li>{t.footer.s6}</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-200 text-xs mb-3 uppercase tracking-wider">
                {t.footer.account}
              </h4>
              <ul className="space-y-1.5 text-[11px]">
                {user ? (
                  <>
                    <li className="text-slate-700 dark:text-slate-300">
                      {t.footer.loggedInAs} <strong className="text-slate-900 dark:text-white">{user.email}</strong>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="text-rose-500 hover:underline"
                      >
                        {t.footer.logout}
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <button
                        type="button"
                        onClick={() => openAuth("login")}
                        className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      >
                        {t.footer.login}
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => openAuth("register")}
                        className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                      >
                        {t.footer.register}
                      </button>
                    </li>
                  </>
                )}
                <li className="pt-2">
                  <button
                    type="button"
                    onClick={handleLaunchApp}
                    className="text-sky-600 dark:text-sky-400 font-semibold hover:underline"
                  >
                    {t.footer.openPlatform}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div
            className={`pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] ${
              isDark ? "border-slate-900 text-slate-500" : "border-slate-200 text-slate-500"
            }`}
          >
            <p>© {new Date().getFullYear()} {t.footer.rights}</p>
            <p>{t.footer.mission}</p>
          </div>
        </div>
      </footer>

      {/* ── 11. Authentication Modal ───────────────────────────────────────────── */}
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
