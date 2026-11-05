/** Hydrological workflow copy. Hydrological class/order values and AOI geometries are never translated. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";
export const HYDROLOGY_MESSAGES = {
  "title": [
    "Bacias Hidrográficas",
    "Watersheds",
    "Cuencas hidrográficas",
    "Bassins versants"
  ],
  "collapse": [
    "Recolher",
    "Collapse",
    "Contraer",
    "Réduire"
  ],
  "expand": [
    "Expandir",
    "Expand",
    "Expandir",
    "Déployer"
  ],
  "closeMenu": [
    "Fechar menu",
    "Close menu",
    "Cerrar menú",
    "Fermer le menu"
  ],
  "geeConnected": [
    "GEE ligado",
    "GEE connected",
    "GEE conectado",
    "GEE connecté"
  ],
  "geeOffline": [
    "GEE desligado",
    "GEE disconnected",
    "GEE desconectado",
    "GEE déconnecté"
  ],
  "mode.delineate": [
    "Delimitar",
    "Delineate",
    "Delimitar",
    "Délimiter"
  ],
  "mode.explore": [
    "Explorar",
    "Explore",
    "Explorar",
    "Explorer"
  ],
  "saved": [
    "Análises guardadas",
    "Saved analyses",
    "Análisis guardados",
    "Analyses enregistrées"
  ],
  "studyArea": [
    "Área de estudo",
    "Study area",
    "Área de estudio",
    "Zone d'étude"
  ],
  "configuration": [
    "Configuração",
    "Configuration",
    "Configuración",
    "Configuration"
  ],
  "hydroNotice": [
    "As bacias pré-definidas (HydroBASINS) podem não estar disponíveis neste projecto. Se nada aparecer, utilize o modo Delimitar para traçar bacias a partir do DEM.",
    "Predefined HydroBASINS may not be available in this project. If none appear, use Delineate to trace basins from a DEM.",
    "Es posible que HydroBASINS no esté disponible en este proyecto. Si no aparecen cuencas, use Delimitar para trazarlas desde un MDE.",
    "Les bassins HydroBASINS prédéfinis peuvent être indisponibles dans ce projet. Dans ce cas, utilisez Délimiter à partir du MNT."
  ],
  "basins.level": [
    "Nível HydroBASINS (Pfafstetter)",
    "HydroBASINS level (Pfafstetter)",
    "Nivel HydroBASINS (Pfafstetter)",
    "Niveau HydroBASINS (Pfafstetter)"
  ],
  "basins.levelPoint": [
    "Nível da bacia no ponto (Pfafstetter)",
    "Basin level at point (Pfafstetter)",
    "Nivel de cuenca en el punto (Pfafstetter)",
    "Niveau du bassin au point (Pfafstetter)"
  ],
  "basins.levelName": [
    "Nível",
    "Level",
    "Nivel",
    "Niveau"
  ],
  "basins.mainPlural": [
    "bacias principais",
    "main basins",
    "cuencas principales",
    "bassins principaux"
  ],
  "basins.midPlural": [
    "sub-bacias intermédias",
    "intermediate sub-basins",
    "subcuencas intermedias",
    "sous-bassins intermédiaires"
  ],
  "basins.detailedPlural": [
    "sub-bacias detalhadas",
    "detailed sub-basins",
    "subcuencas detalladas",
    "sous-bassins détaillés"
  ],
  "basins.main": [
    "bacia principal",
    "main basin",
    "cuenca principal",
    "bassin principal"
  ],
  "basins.mid": [
    "sub-bacia intermédia",
    "intermediate sub-basin",
    "subcuenca intermedia",
    "sous-bassin intermédiaire"
  ],
  "basins.detailed": [
    "sub-bacia detalhada",
    "detailed sub-basin",
    "subcuenca detallada",
    "sous-bassin détaillé"
  ],
  "basins.macro": [
    "Macro-bacia",
    "Macro-basin",
    "Macrocuenca",
    "Macro-bassin"
  ],
  "basins.macroPlural": [
    "Macro-bacias",
    "Macro-basins",
    "Macrocuencas",
    "Macro-bassins"
  ],
  "basins.moreDetail": [
    "Maior detalhe",
    "Greater detail",
    "Mayor detalle",
    "Plus de détails"
  ],
  "basins.levelWarning": [
    "Nos níveis 9–12, escolha uma área menor para reduzir o tempo de processamento e o número de polígonos.",
    "For levels 9–12, choose a smaller area to reduce processing time and polygon count.",
    "Para los niveles 9–12, seleccione un área menor para reducir el tiempo de cálculo y el número de polígonos.",
    "Pour les niveaux 9–12, sélectionnez une zone plus petite pour réduire le temps de traitement et le nombre de polygones."
  ],
  "drainage": [
    "Rede de drenagem",
    "Drainage network",
    "Red de drenaje",
    "Réseau hydrographique"
  ],
  "drainage.threshold": [
    "Limiar de acumulação",
    "Accumulation threshold",
    "Umbral de acumulación",
    "Seuil d'accumulation"
  ],
  "drainage.headwaters": [
    "Cabeceiras",
    "Headwaters",
    "Cabeceras",
    "Têtes de bassin"
  ],
  "drainage.mainRivers": [
    "Rios principais",
    "Major rivers",
    "Ríos principales",
    "Cours d'eau principaux"
  ],
  "basins.loading": [
    "A carregar…",
    "Loading…",
    "Cargando…",
    "Chargement…"
  ],
  "basins.load": [
    "Carregar bacias",
    "Load basins",
    "Cargar cuencas",
    "Charger les bassins"
  ],
  "delineate.outlet": [
    "Ponto (exutório)",
    "Point (outlet)",
    "Punto (exutorio)",
    "Point (exutoire)"
  ],
  "delineate.polygon": [
    "Por polígono / AOI",
    "By polygon / AOI",
    "Por polígono / AOI",
    "Par polygone / zone d'étude"
  ],
  "delineate.pointHint": [
    "Clique num rio ou ponto do mapa para delimitar a sub-bacia a montante (HydroBASINS/D8).",
    "Click a river or map point to delineate its upstream sub-basin (HydroBASINS/D8).",
    "Haga clic en un río o punto del mapa para delimitar la subcuenca aguas arriba (HydroBASINS/D8).",
    "Cliquez sur un cours d'eau ou un point de la carte pour délimiter le sous-bassin en amont (HydroBASINS/D8)."
  ],
  "delineate.levelHint": [
    "Ao alterar o nível, clique novamente no mapa. Se não estiver disponível, o GeoMoz identifica a alternativa D8.",
    "After changing the level, click the map again. If unavailable, GeoMoz identifies the D8 alternative.",
    "Tras cambiar el nivel, vuelva a hacer clic en el mapa. Si no está disponible, GeoMoz identifica la alternativa D8.",
    "Après un changement de niveau, cliquez à nouveau sur la carte. Si indisponible, GeoMoz identifie l'alternative D8."
  ],
  "delineate.selectedPoint": [
    "Ponto seleccionado",
    "Selected point",
    "Punto seleccionado",
    "Point sélectionné"
  ],
  "delineate.polygonHint": [
    "Delimita e recorta as bacias e linhas de água estritamente aos limites do seu polígono ou área de estudo.",
    "Delineates and clips basins and streams strictly to the boundaries of your polygon or study area.",
    "Delimita y recorta cuencas y ríos estrictamente a los límites del polígono o área de estudio.",
    "Délimite et découpe les bassins et les cours d'eau aux limites du polygone ou de la zone d'étude."
  ],
  "delineate.activePolygon": [
    "Polígono / AOI activa:",
    "Polygon / active AOI:",
    "Polígono / AOI activa:",
    "Polygone / zone d'étude active :"
  ],
  "delineate.customArea": [
    "Área personalizada",
    "Custom area",
    "Área personalizada",
    "Zone personnalisée"
  ],
  "delineate.clipping": [
    "A recortar bacia…",
    "Clipping basin…",
    "Recortando cuenca…",
    "Découpage du bassin…"
  ],
  "delineate.runPolygon": [
    "Delimitar e recortar esta área",
    "Delineate and clip this area",
    "Delimitar y recortar esta área",
    "Délimiter et découper cette zone"
  ],
  "delineate.noPolygon": [
    "Nenhum polígono activo. Desenhe um polígono ou importe um ficheiro vectorial.",
    "No active polygon. Draw a polygon or import a vector file.",
    "No hay ningún polígono activo. Dibuje un polígono o importe un archivo vectorial.",
    "Aucun polygone actif. Dessinez un polygone ou importez un fichier vectoriel."
  ],
  "delineate.drawing": [
    "A desenhar no mapa…",
    "Drawing on map…",
    "Dibujando en el mapa…",
    "Dessin sur la carte…"
  ],
  "delineate.drawNew": [
    "Desenhar novo polígono",
    "Draw new polygon",
    "Dibujar nuevo polígono",
    "Dessiner un nouveau polygone"
  ],
  "rivers": [
    "Linhas de água",
    "Streams",
    "Cursos de agua",
    "Cours d'eau"
  ],
  "rivers.allOrders": [
    "Todas as ordens",
    "All stream orders",
    "Todos los órdenes",
    "Tous les ordres"
  ],
  "rivers.cancel": [
    "Cancelar geração de linhas de água",
    "Cancel stream generation",
    "Cancelar generación de cursos de agua",
    "Annuler la génération des cours d'eau"
  ],
  "cancel": [
    "Cancelar análise",
    "Cancel analysis",
    "Cancelar análisis",
    "Annuler l'analyse"
  ],
  "refresh": [
    "Actualizar",
    "Refresh",
    "Actualizar",
    "Actualiser"
  ],
  "rivers.generate": [
    "Gerar linhas de água",
    "Generate streams",
    "Generar cursos de agua",
    "Générer les cours d'eau"
  ],
  "basin.selected": [
    "Bacia delimitada",
    "Delineated basin",
    "Cuenca delimitada",
    "Bassin délimité"
  ],
  "panel.close": [
    "Fechar painel",
    "Close panel",
    "Cerrar panel",
    "Fermer le panneau"
  ],
  "basin.processing": [
    "A delimitar sub-bacia (HydroBASINS)…",
    "Delineating sub-basin (HydroBASINS)…",
    "Delimitando subcuenca (HydroBASINS)…",
    "Délimitation du sous-bassin (HydroBASINS)…"
  ],
  "basin.total": [
    "Área total da bacia",
    "Total basin area",
    "Área total de la cuenca",
    "Surface totale du bassin"
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type HydrologyCopyKey = keyof typeof HYDROLOGY_MESSAGES;
const INDEX: Record<PortalCatalogLocale,0|1|2|3> = {pt:0,en:1,es:2,fr:3};
export function hydrologyText(language:string,key:HydrologyCopyKey):string{
  return HYDROLOGY_MESSAGES[key][INDEX[resolvedPortalLocale(language)]];
}
