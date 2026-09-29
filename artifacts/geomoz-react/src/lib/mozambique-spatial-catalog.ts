/**
 * Mozambique Spatial Catalog & Cloud-Native Datasets
 * Curated layers for client-side GIS processing, PMTiles/COG inspection, and Spatial SQL.
 */

export interface CloudNativeDataset {
  id: string;
  title: string;
  category: "infraestruturas" | "hidrologia" | "conservacao" | "vias" | "relevo";
  format: "PMTiles" | "COG (Cloud-Optimized GeoTIFF)" | "GeoParquet" | "GeoJSON";
  sizeMb: number;
  featureCount: number;
  description: string;
  source: string;
  url: string;
  data: GeoJSON.FeatureCollection;
}

export const MOZAMBIQUE_HIGHWAYS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        codigo: "EN1",
        nome: "Estrada Nacional N° 1 (Espinha Dorsal)",
        tipo: "Primária",
        extensao_km: 2400,
        pavimentada: "Sim",
        estado: "Regular",
        troco: "Maputo - Beira - Nampula - Pemba",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [32.58, -25.96],
          [32.61, -25.02],
          [33.51, -24.68],
          [34.12, -23.86],
          [35.34, -21.98],
          [34.85, -19.83],
          [34.50, -18.20],
          [36.88, -17.87],
          [38.25, -15.12],
          [39.29, -15.11],
          [40.52, -12.97],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        codigo: "EN4",
        nome: "Autoestrada da Portagem EN4 (Corredor de Maputo)",
        tipo: "Autoestrada",
        extensao_km: 92,
        pavimentada: "Sim",
        estado: "Excelente",
        troco: "Maputo - Matola - Moamba - Ressano Garcia",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [32.57, -25.97],
          [32.46, -25.96],
          [32.24, -25.60],
          [31.99, -25.44],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        codigo: "EN6",
        nome: "Corredor da Beira EN6",
        tipo: "Primária",
        extensao_km: 288,
        pavimentada: "Sim",
        estado: "Bom",
        troco: "Porto da Beira - Dondo - Chimoio - Machipanda (Fronteira Zimbabué)",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [34.84, -19.84],
          [34.74, -19.61],
          [34.05, -19.34],
          [33.48, -19.12],
          [32.75, -18.94],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        codigo: "EN7",
        nome: "Corredor de Tete EN7",
        tipo: "Primária",
        extensao_km: 490,
        pavimentada: "Sim",
        estado: "Bom",
        troco: "Vanduzi - Catandica - Changara - Tete - Zóbuè (Maláui)",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [33.40, -19.00],
          [33.18, -18.06],
          [33.15, -16.55],
          [33.58, -16.15],
          [34.42, -15.60],
        ],
      },
    },
  ],
};

export const MOZAMBIQUE_FACILITIES: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "HCM01",
        nome: "Hospital Central de Maputo",
        tipo: "Hospital Central",
        provincia: "Maputo Cidade",
        distrito: "Kamphumo",
        leitos: 1500,
        risco_cheia: "Baixo",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [32.5892, -25.9747] },
    },
    {
      type: "Feature",
      properties: {
        id: "HCB02",
        nome: "Hospital Central da Beira",
        tipo: "Hospital Central",
        provincia: "Sofala",
        distrito: "Beira",
        leitos: 850,
        risco_cheia: "Alto",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [34.8431, -19.8322] },
    },
    {
      type: "Feature",
      properties: {
        id: "CSB03",
        nome: "Centro de Saúde de Búzi",
        tipo: "Centro de Saúde Urbano",
        provincia: "Sofala",
        distrito: "Búzi",
        leitos: 45,
        risco_cheia: "Crítico",
        status: "Vulnerável a Inundações",
      },
      geometry: { type: "Point", coordinates: [34.5985, -19.8804] },
    },
    {
      type: "Feature",
      properties: {
        id: "HGQ04",
        nome: "Hospital Geral de Quelimane",
        tipo: "Hospital Geral",
        provincia: "Zambézia",
        distrito: "Quelimane",
        leitos: 400,
        risco_cheia: "Alto",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [36.8856, -17.8786] },
    },
    {
      type: "Feature",
      properties: {
        id: "HCN05",
        nome: "Hospital Central de Nampula",
        tipo: "Hospital Central",
        provincia: "Nampula",
        distrito: "Nampula",
        leitos: 700,
        risco_cheia: "Baixo",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [39.2678, -15.1165] },
    },
    {
      type: "Feature",
      properties: {
        id: "HPT06",
        nome: "Hospital Provincial de Tete",
        tipo: "Hospital Provincial",
        provincia: "Tete",
        distrito: "Tete",
        leitos: 450,
        risco_cheia: "Médio",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [33.5861, -16.1623] },
    },
    {
      type: "Feature",
      properties: {
        id: "ESC01",
        nome: "Escola Secundária Josina Machel",
        tipo: "Escola Secundária",
        provincia: "Maputo Cidade",
        distrito: "Kamphumo",
        leitos: 0,
        alunos: 3800,
        risco_cheia: "Baixo",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [32.5765, -25.9682] },
    },
    {
      type: "Feature",
      properties: {
        id: "ESC02",
        nome: "Escola Secundária Samora Machel da Beira",
        tipo: "Escola Secundária",
        provincia: "Sofala",
        distrito: "Beira",
        leitos: 0,
        alunos: 2900,
        risco_cheia: "Alto",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [34.8512, -19.8398] },
    },
    {
      type: "Feature",
      properties: {
        id: "ESC03",
        nome: "Escola Secundária 25 de Junho - Quelimane",
        tipo: "Escola Secundária",
        provincia: "Zambézia",
        distrito: "Quelimane",
        leitos: 0,
        alunos: 2400,
        risco_cheia: "Alto",
        status: "Operacional",
      },
      geometry: { type: "Point", coordinates: [36.8791, -17.8690] },
    },
  ],
};

export const MOZAMBIQUE_CONSERVATION_AREAS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        nome: "Parque Nacional da Gorongosa",
        categoria: "Parque Nacional",
        provincia: "Sofala",
        area_km2: 4067,
        ano_criacao: 1960,
        fauna_dominante: "Elefantes, Leões, Hipopótamos, Aves",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [34.15, -18.70],
            [34.65, -18.65],
            [34.80, -19.10],
            [34.30, -19.30],
            [34.05, -18.95],
            [34.15, -18.70],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        nome: "Parque Nacional do Limpopo",
        categoria: "Parque Nacional",
        provincia: "Gaza",
        area_km2: 10000,
        ano_criacao: 2001,
        fauna_dominante: "Parque Transfronteiriço do Grande Limpopo",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [31.80, -22.40],
            [32.65, -23.20],
            [32.40, -24.20],
            [31.75, -23.80],
            [31.80, -22.40],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        nome: "Reserva Nacional do Niassa",
        categoria: "Reserva Especial",
        provincia: "Niassa / Cabo Delgado",
        area_km2: 42300,
        ano_criacao: 1960,
        fauna_dominante: "Maior refúgio contínuo de elefantes e cães selvagens",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [36.50, -11.50],
            [38.50, -11.50],
            [38.40, -12.90],
            [36.40, -12.80],
            [36.50, -11.50],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        nome: "Reserva Especial de Maputo (Parque Nacional de Maputo)",
        categoria: "Parque Nacional",
        provincia: "Maputo",
        area_km2: 1718,
        ano_criacao: 1932,
        fauna_dominante: "Elefantes costeiros, Tartarugas marinhas, Flamingos",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [32.65, -26.25],
            [32.95, -26.25],
            [32.92, -26.85],
            [32.60, -26.80],
            [32.65, -26.25],
          ],
        ],
      },
    },
  ],
};

export const MOZAMBIQUE_BASINS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        nome: "Bacia do Zambeze",
        ara: "ARA-Zambeze",
        area_km2: 1390000,
        area_nacional_km2: 140000,
        vazao_media_m3s: 3400,
        principais_afluentes: "Shire, Luenha, Revúbuè",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [32.50, -15.50],
            [34.80, -15.20],
            [36.50, -17.50],
            [36.10, -18.90],
            [33.80, -17.20],
            [32.50, -15.50],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        nome: "Bacia do Limpopo",
        ara: "ARA-Sul",
        area_km2: 412000,
        area_nacional_km2: 80000,
        vazao_media_m3s: 170,
        principais_afluentes: "Elefantes, Changane",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [31.80, -22.50],
            [33.80, -23.50],
            [33.70, -25.20],
            [32.50, -24.80],
            [31.80, -22.50],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        nome: "Bacia do Búzi e Púngoè",
        ara: "ARA-Centro",
        area_km2: 60200,
        area_nacional_km2: 46000,
        vazao_media_m3s: 290,
        principais_afluentes: "Revué, Lucite",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [33.00, -18.80],
            [34.90, -19.50],
            [34.60, -20.60],
            [33.10, -20.30],
            [33.00, -18.80],
          ],
        ],
      },
    },
  ],
};

export const CLOUD_NATIVE_CATALOG: CloudNativeDataset[] = [
  {
    id: "ds_roads_pmtiles",
    title: "Rede Rodoviária Primária e Secundária (ANE)",
    category: "vias",
    format: "PMTiles",
    sizeMb: 4.8,
    featureCount: 4,
    description: "Autoestradas e corredores de transporte de Moçambique com classificação e estado de conservação.",
    source: "Administração Nacional de Estradas (ANE) / OpenStreetMap",
    url: "https://assets.geolithica.com/pmtiles/moz_roads_primary.pmtiles",
    data: MOZAMBIQUE_HIGHWAYS,
  },
  {
    id: "ds_facilities_parquet",
    title: "Infraestruturas de Saúde e Educação Distritais",
    category: "infraestruturas",
    format: "GeoParquet",
    sizeMb: 2.1,
    featureCount: 9,
    description: "Hospitais centrais, centros de saúde e escolas com índice de vulnerabilidade a eventos climáticos extremos.",
    source: "Ministério da Saúde (MISAU) / MINEDH Moçambique",
    url: "https://assets.geolithica.com/geoparquet/moz_facilities_risk.parquet",
    data: MOZAMBIQUE_FACILITIES,
  },
  {
    id: "ds_conservation_pmtiles",
    title: "Áreas de Conservação e Parques Nacionais (ANAC)",
    category: "conservacao",
    format: "PMTiles",
    sizeMb: 3.4,
    featureCount: 4,
    description: "Parques nacionais e reservas com limites oficiais de gestão ambiental e espécies emblemáticas.",
    source: "Administração Nacional das Áreas de Conservação (ANAC)",
    url: "https://assets.geolithica.com/pmtiles/moz_conservation_anac.pmtiles",
    data: MOZAMBIQUE_CONSERVATION_AREAS,
  },
  {
    id: "ds_basins_geojson",
    title: "Principais Bacias Hidrográficas e ARA",
    category: "hidrologia",
    format: "GeoJSON",
    sizeMb: 1.8,
    featureCount: 3,
    description: "Polígonos de bacias com vazão média, área de drenagem e limites de jurisdição hidrológica.",
    source: "Direção Nacional de Gestão de Recursos Hídricos (DNGRH)",
    url: "https://assets.geolithica.com/geojson/moz_hydro_basins.geojson",
    data: MOZAMBIQUE_BASINS,
  },
];

export interface PredefinedSqlQuery {
  id: string;
  title: string;
  category: string;
  sql: string;
  datasetId: string;
  description: string;
}

export const PREDEFINED_SQL_QUERIES: PredefinedSqlQuery[] = [
  {
    id: "q_high_risk_facilities",
    title: "Infraestruturas Críticas em Risco Alto de Inundação",
    category: "Geoperigos & Vulnerabilidade",
    sql: "SELECT nome, tipo, provincia, distrito, risco_cheia FROM infraestruturas WHERE risco_cheia = 'Alto' OR risco_cheia = 'Crítico' ORDER BY provincia ASC",
    datasetId: "ds_facilities_parquet",
    description: "Filtra escolas e centros hospitalares situados em planícies aluviais sujeitas a cheias cíclicas.",
  },
  {
    id: "q_hospitals_capacity",
    title: "Hospitais com Capacidade > 400 Leitos",
    category: "Saúde Pública",
    sql: "SELECT nome, provincia, distrito, leitos, status FROM infraestruturas WHERE leitos >= 400 ORDER BY leitos DESC",
    datasetId: "ds_facilities_parquet",
    description: "Ordena os principais hospitais de referência de Moçambique por número de camas disponíveis.",
  },
  {
    id: "q_conservation_area",
    title: "Parques Nacionais com Área > 2.000 km²",
    category: "Conservação & Biodiversidade",
    sql: "SELECT nome, categoria, provincia, area_km2, ano_criacao FROM conservacao WHERE area_km2 > 2000 ORDER BY area_km2 DESC",
    datasetId: "ds_conservation_pmtiles",
    description: "Grandes reservas naturais para programas de conservação e créditos de carbono florestal.",
  },
  {
    id: "q_highways_good_condition",
    title: "Vias Primárias com Pavimento em Bom Estado",
    category: "Infraestrutura Viária",
    sql: "SELECT codigo, nome, extensao_km, estado, troco FROM estradas WHERE pavimentada = 'Sim' ORDER BY extensao_km DESC",
    datasetId: "ds_roads_pmtiles",
    description: "Mapeamento das principais rotas de transporte e corredores de escoamento agrícola.",
  },
];
