/**
 * Analysis-specific controls for the GeoAnálises sidebar.
 *
 * A scene cloud filter is meaningful for optical acquisitions, not for a DEM,
 * a climate reanalysis, an externally prepared mosaic or a fixed land-cover map.
 * These settings only govern presentation: server-side validation remains in place.
 */
export interface AnalysisSidebarConfig {
  title: string;
  source: string;
  description: string;
  showDateRange: boolean;
  showCloudFilter: boolean;
  showProcessingOptions: boolean;
  requiresGee: boolean;
  /** Dedicated module owns the run button and its domain-specific parameters. */
  useSpecializedPanel: boolean;
}

type SidebarOverrides = Partial<AnalysisSidebarConfig>;

const OPTICAL: AnalysisSidebarConfig = {
  title: "Parâmetros da imagem",
  source: "Sentinel-2 / Landsat",
  description: "Seleccione o período de aquisição e o limite de nebulosidade das cenas. A máscara de píxeis inválidos é aplicada no processamento.",
  showDateRange: true,
  showCloudFilter: true,
  showProcessingOptions: true,
  requiresGee: true,
  useSpecializedPanel: false,
};

const DATA_PRODUCTS: Record<string, SidebarOverrides> = {
  s2: {
    title: "Mosaico anual",
    source: "EOX / S-2",
    description: "Escolha o ano e a comparação no painel de resultados. O mosaico anual já foi preparado; datas e filtro de nuvens não se aplicam.",
    showDateRange: false, showCloudFilter: false,
    showProcessingOptions: false, requiresGee: false,
    useSpecializedPanel: true
  },
  elevation: {
    title: "Modelo digital de elevação",
    source: "GLO-30",
    description: "O DEM Copernicus representa a topografia; não depende de intervalo temporal nem de cobertura de nuvens.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: true,
  },
  hipsometry: {
    title: "Hipsometria",
    source: "GLO-30",
    description: "A classificação altimétrica é calculada a partir do DEM da área seleccionada; não usa filtros de cenas ópticas.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: true,
  },
  topo_class: {
    title: "Classes morfológicas",
    source: "GLO-30",
    description: "As classes são derivadas da elevação; a sua legenda é categórica e não uma escala espectral contínua.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: true,
  },
  topo_custom: {
    title: "Classificação topográfica",
    source: "GLO-30",
    description: "Configure limites, cores e água no painel de resultados. Não são necessários datas ou filtros de nuvens.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  profile: {
    title: "Perfil topográfico A–B",
    source: "GLO-30",
    description: "Marque os pontos A e B e ajuste a amostragem no painel de resultados. A análise utiliza elevação, não imagens multitemporais.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  contours: {
    title: "Curvas de nível",
    source: "GLO-30",
    description: "Defina a equidistância no painel de resultados. As curvas derivam do DEM e não dependem de datas ou nuvens.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  lineaments: {
    title: "Estruturas e lineamentos",
    source: "DEM",
    description: "Filtros de direcção e densidade estrutural não usam nebulosidade. Funcionalidade sujeita ao estado de desenvolvimento.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  landcover: {
    title: "Cobertura terrestre de referência",
    source: "WorldCover 2021",
    description: "Produto categórico ESA WorldCover de 2021. Alterar datas ou nuvens não gera um novo mapa de uso do solo.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  targeting: {
    title: "Prospectividade mineral",
    source: "Modelo multicritério",
    description: "Configure o mineral e os pesos das variáveis no painel de resultados. Não confunda o índice de favorabilidade com uma banda espectral.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  spi_ndvi: {
    title: "Seca meteorológica × vegetação",
    source: "CHIRPS / MODIS",
    description: "Configure o ano e a correlação SPI × NDVI no painel de resultados. O filtro de nuvens de cenas Sentinel-2 não se aplica.",
    showDateRange: false, showCloudFilter: false, showProcessingOptions: false,
    useSpecializedPanel: true
  },
  burned_area: {
    title: "Áreas queimadas observadas",
    source: "MODIS",
    description: "Seleccione o período de referência do produto MODIS. O filtro de nuvens de cenas ópticas não controla este produto.",
    showCloudFilter: false,
  },
  forest_loss: {
    title: "Perda de cobertura arbórea",
    source: "Hansen",
    description: "Produto anual de perda florestal; a classificação não usa nebulosidade de cenas Sentinel-2.",
    showDateRange: false, showCloudFilter: false,
  },
  precipitation: {
    title: "Precipitação",
    source: "CHIRPS",
    description: "Defina o período de acumulação da precipitação; não se aplica o filtro de nuvens de imagens ópticas.",
    showCloudFilter: false,
  },
  temperature_lst: {
    title: "Temperatura da superfície",
    source: "MODIS LST",
    description: "Defina o período de observação térmica; a filtragem atmosférica é específica do produto, não da cobertura de nuvens Sentinel-2.",
    showCloudFilter: false,
  },
  spei: {
    title: "Índice de seca SPEI",
    source: "SPEIbase",
    description: "Seleccione o período de referência da série climatológica. Não se aplica um filtro de nuvens de cenas ópticas.",
    showCloudFilter: false,
  },
  cyclone_tracks: {
    title: "Trajectórias de ciclones",
    source: "Catálogo de ciclones",
    description: "As trajectórias são registos históricos, não cenas ópticas; a selecção temporal é independente da nebulosidade.",
    showCloudFilter: false,
  },
  cyclone_risk: {
    title: "Exposição a ciclones",
    source: "Catálogo histórico",
    description: "O risco é derivado de trajectórias históricas, não de uma composição óptica filtrada por nuvens.",
    showCloudFilter: false,
  },
  urban_heat_island: {
    title: "Ilha de calor urbano",
    source: "LST / urbano",
    description: "A interpretação depende da temperatura superficial e do contraste urbano; o filtro de nebulosidade Sentinel-2 não é aplicado ao produto térmico.",
    showCloudFilter: false,
  },
  vci: { title: "Condição da vegetação", source: "Série temporal", showCloudFilter: false },
  tci: { title: "Condição térmica", source: "Série térmica", showCloudFilter: false },
  vhi: { title: "Saúde da vegetação", source: "Série temporal", showCloudFilter: false },
};

export function getAnalysisSidebarConfig(tab: string, group?: string): AnalysisSidebarConfig {
  const category: SidebarOverrides =
    group === "terrain" ? DATA_PRODUCTS.elevation :
    group === "climate" ? {
      title: "Série climatológica", source: "Clima / tempo",
      description: "Escolha o período pertinente para a série. A nebulosidade das cenas Sentinel-2 não se aplica.",
      showCloudFilter: false,
    } :
    group === "minerals" ? {
      title: "Assinatura mineral", source: "Landsat-8 / ASTER",
      description: "Seleccione o período para a composição espectral; os resultados são indicadores de alteração, não identificação mineral definitiva.",
    } :
    group === "water" ? {
      title: "Índices de água", source: "Sentinel-2",
      description: "Configure o período e as nuvens para os índices ópticos de água e humidade. O limiar de água depende do índice.",
    } :
    group === "fire" ? {
      title: "Índices de incêndio", source: "Sentinel-2",
      description: "Use períodos comparáveis para análises de alteração pré/pós-incêndio; verifique a mascaragem de nuvens.",
    } :
    group === "urban" ? {
      title: "Análise urbana", source: "Satélite / urbano",
      description: "Escolha o período da composição para os índices espectrais de superfícies urbanas.",
    } : {};

  return { ...OPTICAL, ...category, ...(DATA_PRODUCTS[tab] || {}) };
}
