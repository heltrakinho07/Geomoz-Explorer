/** Catálogo visível do Centro de Administração.
 * Os seis módulos com interruptor têm suporte no registo server-side.
 * As restantes entradas são funcionalidades integradas: NÃO são flags independentes.
 */
export interface AdminModuleEntry {
  title: string;
  description: string;
  route: string;
  controlledBy?: string;
}
export interface AdminModuleGroup {
  title: string;
  entries: AdminModuleEntry[];
}
export const ADMIN_MODULE_GROUPS: AdminModuleGroup[] = [
  { title: "GIS e cartografia", entries: [
    { title: "GIS Workspace", description: "Ambiente de trabalho SIG", route: "/gis-workspace/", controlledBy: "gis_workspace" },
    { title: "Cartografia e impressão", description: "Layouts, legendas e exportação de mapas", route: "/exportar" },
    { title: "Serviços de mapas", description: "XYZ, WMS, WFS, WMTS e catálogos", route: "/gis-workspace/", controlledBy: "gis_workspace" },
    { title: "Mapa e camadas geológicas", description: "Exploração e consulta de informação geológica", route: "/mapa" },
  ] },
  { title: "Inteligência artificial e análise", entries: [
    { title: "GeoMoz AI Agent", description: "Assistente geoespacial e ferramentas de IA", route: "/geomoz-ai", controlledBy: "geo_ai" },
    { title: "GeoAnálises", description: "Processamento e análises territoriais", route: "/analises", controlledBy: "remote_sensing" },
    { title: "Detecção remota", description: "Imagens de satélite e processamento espectral", route: "/analises", controlledBy: "remote_sensing" },
    { title: "Índices e alterações temporais", description: "NDVI, NDWI, dNBR e comparações", route: "/analises", controlledBy: "remote_sensing" },
  ] },
  { title: "Terreno e geoprocessamento", entries: [
    { title: "Terrain Studio 3D", description: "Visualização e modelação tridimensional", route: "/terreno-3d", controlledBy: "terrain_3d" },
    { title: "Modelos digitais de elevação", description: "Relevo, perfis e derivados do DEM", route: "/geoprocessamento" },
    { title: "Geoprocessamento", description: "Operações e processamento espacial", route: "/geoprocessamento" },
  ] },
  { title: "Recursos hídricos e riscos", entries: [
    { title: "Hidrologia e bacias hidrográficas", description: "Drenagem e delimitação de bacias", route: "/hidrografia", controlledBy: "hydrology" },
    { title: "Água subterrânea", description: "Análise hidrogeológica", route: "/agua-subterranea", controlledBy: "hydrology" },
    { title: "Geoperigos", description: "Análise de perigos naturais", route: "/geoperigos" },
  ] },
  { title: "Sismologia e dados", entries: [
    { title: "Catálogos sísmicos", description: "Consulta de eventos e fontes sismológicas", route: "/dashboard", controlledBy: "seismic_catalogs" },
    { title: "Dados e exportação", description: "Gestão e exportação de resultados", route: "/exportar" },
    { title: "Documentação", description: "Guias e apoio à utilização", route: "/documentacao" },
  ] },
];
