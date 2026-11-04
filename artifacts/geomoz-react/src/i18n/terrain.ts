/** Terrain UI localization; scientific identifiers and report metadata stay unchanged. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";

export const TERRAIN_MESSAGES = {
  "progress.fetchDem": ["A obter o DEM…","Fetching DEM…","Obteniendo el MDE…","Récupération du MNT…"],
  "error.needAoi": ["Seleccione um distrito/província ou desenhe uma área antes de obter o DEM.","Select a district/province or draw an area before fetching the DEM.","Seleccione un distrito/provincia o dibuje un área antes de obtener el MDE.","Sélectionnez un district/une province ou dessinez une zone avant de récupérer le MNT."],
  "error.fetchDem": ["Não foi possível obter o DEM. Verifique a ligação ao Earth Engine e reduza a área.","Could not fetch the DEM. Check the Earth Engine connection and reduce the area.","No se pudo obtener el MDE. Compruebe la conexión a Earth Engine y reduzca el área.","Impossible de récupérer le MNT. Vérifiez la connexion à Earth Engine et réduisez la zone."],
  "error.invalidUrl": ["O Earth Engine não devolveu um URL de download válido.","Earth Engine did not return a valid download URL.","Earth Engine no devolvió una URL de descarga válida.","Earth Engine n'a pas renvoyé d'URL de téléchargement valide."],
  "error.largeAoi": ["A área seleccionada é demasiado extensa. Desenhe uma área menor para o DEM.","The selected area is too large. Draw a smaller DEM area.","El área seleccionada es demasiado extensa. Dibuje un área menor para el MDE.","La zone sélectionnée est trop étendue. Dessinez une zone plus petite pour le MNT."],
  "note.resAdjusted": ["DEM obtido a {actual} m em vez de {requested} m para respeitar o limite de download. Use uma área menor para mais detalhe.","DEM retrieved at {actual} m rather than {requested} m to comply with download limits. Use a smaller area for more detail.","MDE obtenido a {actual} m en lugar de {requested} m por el límite de descarga. Use un área menor para más detalle.","MNT obtenu à {actual} m au lieu de {requested} m pour respecter la limite de téléchargement. Réduisez la zone pour davantage de détails."],
  "error.fileTooLarge": ["Use um DEM até 64 MiB.","Use a DEM no larger than 64 MiB.","Use un MDE de hasta 64 MiB.","Utilisez un MNT de 64 Mio maximum."],
  "error.noLayerUrl": ["A camada não tem um ficheiro acessível.","The layer has no accessible file.","La capa no tiene un archivo accesible.","La couche ne dispose d'aucun fichier accessible."],
  "error.chooseDem": ["Seleccione um GeoTIFF ou HGT de elevação.","Select an elevation GeoTIFF or HGT.","Seleccione un GeoTIFF o HGT de elevación.","Sélectionnez un GeoTIFF ou HGT d'altitude."],
  "note.analysisResolution": ["Análise concluída com grelha de {resolution} m. Consulte os parâmetros e a proveniência para a resolução efectiva.","Analysis completed with a {resolution} m grid. See parameters and provenance for effective resolution.","Análisis completado con una cuadrícula de {resolution} m. Consulte los parámetros y la procedencia.","Analyse terminée avec une grille de {resolution} m. Consultez les paramètres et la provenance."],
  "error.cancelled": ["Análise cancelada. Os resultados anteriores continuam disponíveis.","Analysis cancelled. Previous results remain available.","Análisis cancelado. Los resultados anteriores siguen disponibles.","Analyse annulée. Les résultats précédents restent disponibles."],
  "error.technical": ["Detalhe técnico","Technical detail","Detalle técnico","Détail technique"],
  "section.aria": ["Análise de terreno e hidrologia","Terrain and hydrology analysis","Análisis de terreno e hidrología","Analyse du terrain et hydrologie"],
  "title": ["Terreno e Hidrologia","Terrain and Hydrology","Terreno e Hidrología","Terrain et hydrologie"],
  "description": ["Transforme um DEM em mapas de relevo, drenagem potencial e bacias. Os resultados ficam nas camadas do projecto.","Turn a DEM into terrain, potential drainage and watershed maps. Results are added to project layers.","Convierta un MDE en mapas de relieve, drenaje potencial y cuencas. Los resultados se añaden al proyecto.","Transformez un MNT en cartes de relief, de drainage potentiel et de bassins versants. Les résultats sont ajoutés au projet."],
  "step.source": ["1. Escolher o DEM","1. Choose DEM","1. Elegir MDE","1. Choisir le MNT"],
  "source.label": ["Fonte","Source","Fuente","Source"],
  "source.file": ["GeoTIFF ou SRTM HGT do computador","GeoTIFF or SRTM HGT from computer","GeoTIFF o SRTM HGT del ordenador","GeoTIFF ou SRTM HGT depuis l'ordinateur"],
  "source.layer": ["Camada raster do projecto","Project raster layer","Capa ráster del proyecto","Couche raster du projet"],
  "source.gee": ["Copernicus DEM · Earth Engine","Copernicus DEM · Earth Engine","Copernicus DEM · Earth Engine","Copernicus DEM · Earth Engine"],
  "source.fileHint": ["GeoTIFF de elevação, uma banda, até 64 MiB; ou SRTM HGT (.hgt)","Single-band elevation GeoTIFF up to 64 MiB; or SRTM HGT (.hgt)","GeoTIFF de elevación de una banda, hasta 64 MiB; o SRTM HGT (.hgt)","GeoTIFF d'altitude à une bande, jusqu'à 64 Mio ; ou SRTM HGT (.hgt)"],
  "source.elevationLayer": ["Camada de elevação","Elevation layer","Capa de elevación","Couche d'altitude"],
  "source.emptyLayers": ["Carregue primeiro um raster no projecto","Load a raster into the project first","Cargue primero un ráster en el proyecto","Chargez d'abord un raster dans le projet"],
  "aoi.selected": ["Área seleccionada:","Selected area:","Área seleccionada:","Zone sélectionnée :"],
  "aoi.draw": ["Desenhar área no mapa","Draw area on map","Dibujar área en el mapa","Dessiner une zone sur la carte"],
  "gee.hint": ["Requer ligação ao Earth Engine nas definições. Áreas grandes podem exceder o limite de download; use um recorte menor ou uma resolução maior.","Requires an Earth Engine connection in Settings. Large areas may exceed download limits; reduce the area or use a coarser resolution.","Requiere conexión a Earth Engine en Ajustes. Las áreas grandes pueden superar el límite de descarga; reduzca el área o use una resolución más gruesa.","Nécessite une connexion à Earth Engine dans les paramètres. Les grandes zones peuvent dépasser la limite de téléchargement ; réduisez la zone ou utilisez une résolution plus grossière."],
  "clip": ["Recortar pela extensão rectangular desenhada","Clip to drawn rectangular extent","Recortar a la extensión rectangular dibujada","Découper selon l'emprise rectangulaire dessinée"],
  "units.label": ["Unidade das elevações","Elevation unit","Unidad de elevación","Unité d'altitude"],
  "units.metres": ["Metros","Metres","Metros","Mètres"],
  "units.feet": ["Pés (converter para metros)","Feet (convert to metres)","Pies (convertir a metros)","Pieds (convertir en mètres)"],
  "step.configure": ["2. Configurar a análise","2. Configure analysis","2. Configurar el análisis","2. Configurer l'analyse"],
  "resolution.label": ["Resolução da grelha (m)","Grid resolution (m)","Resolución de la cuadrícula (m)","Résolution de la grille (m)"],
  "resolution.hint": ["Grelha UTM automática, até 1 milhão de células. A resolução pode ser ajustada em áreas grandes. Uma célula menor não aumenta o detalhe da fonte.","Automatic UTM grid, up to 1 million cells. Resolution may be adjusted for large areas. Smaller cells do not increase source detail.","Cuadrícula UTM automática de hasta un millón de celdas. La resolución puede ajustarse en áreas grandes. Celdas menores no aumentan el detalle de la fuente.","Grille UTM automatique, jusqu'à un million de cellules. La résolution peut être ajustée pour les grandes zones. Des cellules plus petites n'améliorent pas le détail de la source."],
  "azimuth": ["Azimute solar (°)","Solar azimuth (°)","Acimut solar (°)","Azimut solaire (°)"],
  "altitude": ["Altura solar (°)","Solar altitude (°)","Altura solar (°)","Hauteur solaire (°)"],
  "hydro.enable": ["Incluir drenagem e bacias","Include drainage and watersheds","Incluir drenaje y cuencas","Inclure le drainage et les bassins versants"],
  "hydro.threshold": ["Área contribuinte mínima dos canais (km²)","Minimum contributing channel area (km²)","Área contribuyente mínima de canales (km²)","Surface contributive minimale des chenaux (km²)"],
  "hydro.hint": ["Bacias calculadas até às bordas do DEM. Use uma área com margem a montante; canais potenciais não representam uma previsão de inundação.","Watersheds are calculated to DEM edges. Include an upstream buffer; potential channels are not a flood forecast.","Las cuencas se calculan hasta los bordes del MDE. Incluya un margen aguas arriba; los canales potenciales no son una predicción de inundaciones.","Les bassins sont calculés jusqu'aux limites du MNT. Prévoyez une marge en amont ; les chenaux potentiels ne constituent pas une prévision d'inondation."],
  "action.processing": ["A analisar…","Analysing…","Analizando…","Analyse en cours…"],
  "action.run": ["Executar análise completa","Run complete analysis","Ejecutar análisis completo","Lancer l'analyse complète"],
  "action.cancel": ["Cancelar","Cancel","Cancelar","Annuler"],
  "result.title": ["3. Resultados","3. Results","3. Resultados","3. Résultats"],
  "result.empty": ["Nenhuma célula atingiu o limiar escolhido","No cells met the selected threshold","Ninguna celda alcanzó el umbral seleccionado","Aucune cellule n'a atteint le seuil sélectionné"],
  "result.show": ["Ver no mapa","Show on map","Ver en el mapa","Afficher sur la carte"],
  "result.pdf": ["Relatório PDF","PDF report","Informe PDF","Rapport PDF"],
  "result.provenance": ["Parâmetros e proveniência","Parameters and provenance","Parámetros y procedencia","Paramètres et provenance"],
  "result.hint": ["Os GeoTIFFs são guardados no projecto. Descarregue o relatório e os parâmetros para conservar o registo desta execução.","GeoTIFFs are saved in the project. Download the report and parameters to preserve a record of this run.","Los GeoTIFF se guardan en el proyecto. Descargue el informe y los parámetros para conservar un registro de esta ejecución.","Les GeoTIFF sont enregistrés dans le projet. Téléchargez le rapport et les paramètres pour conserver une trace de cette exécution."],
  "stage.load": ["A carregar o motor e validar o DEM…","Loading engine and validating DEM…","Cargando el motor y validando el MDE…","Chargement du moteur et validation du MNT…"],
  "stage.grid": ["A preparar a grelha UTM em metros…","Preparing UTM grid in metres…","Preparando la cuadrícula UTM en metros…","Préparation de la grille UTM en mètres…"],
  "stage.dem": ["DEM preparado","Prepared DEM","MDE preparado","MNT préparé"],
  "stage.slope": ["Declividade","Slope","Pendiente","Pente"],
  "stage.aspect": ["Orientação das encostas","Aspect","Orientación de laderas","Orientation des versants"],
  "stage.hillshade": ["Relevo sombreado","Hillshade","Relieve sombreado","Ombrage du relief"],
  "stage.filled": ["DEM hidrologicamente corrigido","Hydrologically corrected DEM","MDE corregido hidrológicamente","MNT corrigé hydrologiquement"],
  "stage.direction": ["Direcção de fluxo D8","D8 flow direction","Dirección de flujo D8","Direction d'écoulement D8"],
  "stage.accumulation": ["Acumulação de fluxo","Flow accumulation","Acumulación de flujo","Accumulation des écoulements"],
  "stage.streams": ["Drenagem potencial","Potential drainage","Drenaje potencial","Drainage potentiel"],
  "stage.basins": ["Bacias de drenagem nas bordas","Edge drainage basins","Cuencas de drenaje en los bordes","Bassins de drainage aux limites"],
  "stage.done": ["Análise concluída","Analysis complete","Análisis completado","Analyse terminée"],
} as const satisfies Record<string, readonly [string, string, string, string]>;

export type TerrainCopyKey = keyof typeof TERRAIN_MESSAGES;
const INDEX: Record<PortalCatalogLocale, 0 | 1 | 2 | 3> = { pt: 0, en: 1, es: 2, fr: 3 };
export function terrainText(language: string, key: TerrainCopyKey, params: Record<string, string | number> = {}): string {
  return TERRAIN_MESSAGES[key][INDEX[resolvedPortalLocale(language)]]
    .replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}
/** Translate presentation only; preserve source product IDs, units, metadata and reports. */
export const TERRAIN_STAGES: Record<string, TerrainCopyKey> = {
  "A carregar o motor e validar o DEM…": "stage.load",
  "A preparar a grelha UTM em metros…": "stage.grid",
  "DEM preparado": "stage.dem",
  "Declividade": "stage.slope",
  "Orientação das encostas": "stage.aspect",
  "Relevo sombreado": "stage.hillshade",
  "DEM hidrologicamente corrigido": "stage.filled",
  "Direcção de fluxo D8": "stage.direction",
  "Acumulação de fluxo": "stage.accumulation",
  "Drenagem potencial": "stage.streams",
  "Bacias de drenagem nas bordas": "stage.basins",
  "Análise concluída": "stage.done"
};
export function terrainStageText(language: string, rawLabel: string): string {
  const key = TERRAIN_STAGES[rawLabel];
  return key ? terrainText(language, key) : rawLabel;
}
