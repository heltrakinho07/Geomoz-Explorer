/** GeoMoz hydrology results, archive and export UI. Scientific codes and saved payloads are unchanged. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";

export const HYDROLOGY_RESULT_MESSAGES = {
  "result.risk.low": ["Baixo","Low","Bajo","Faible"],
  "result.risk.moderate": ["Moderado","Moderate","Moderado","Modéré"],
  "result.risk.high": ["Alto","High","Alto","Élevé"],
  "result.risk.veryHigh": ["Muito alto","Very high","Muy alto","Très élevé"],
  "result.tabs.morphometry": [
    "Morfometria",
    "Morphometry",
    "Morfometría",
    "Morphométrie"
  ],
  "result.tabs.landcover": [
    "Uso do solo",
    "Land cover",
    "Uso del suelo",
    "Occupation du sol"
  ],
  "result.tabs.rain": [
    "Chuva e CN",
    "Rainfall and CN",
    "Lluvia y CN",
    "Pluie et CN"
  ],
  "result.tabs.actions": [
    "Acções",
    "Actions",
    "Acciones",
    "Actions"
  ],
  "result.source.level": [
    "nível",
    "level",
    "nivel",
    "niveau"
  ],
  "result.source.polygon": [
    "Delimitação por polígono / área de estudo",
    "Polygon / study area delineation",
    "Delimitación por polígono / área de estudio",
    "Délimitation par polygone / zone d'étude"
  ],
  "result.source.levelIgnored": [
    "nível solicitado não aplicado",
    "requested level not applied",
    "nivel solicitado no aplicado",
    "niveau demandé non appliqué"
  ],
  "result.streams": [
    "Linhas de água da bacia",
    "Basin streams",
    "Cursos de agua de la cuenca",
    "Cours d'eau du bassin"
  ],
  "result.visible": [
    "Visível",
    "Visible",
    "Visible",
    "Visible"
  ],
  "result.hidden": [
    "Oculto",
    "Hidden",
    "Oculto",
    "Masqué"
  ],
  "result.tracing": [
    "A traçar canais e afluentes no GEE…",
    "Tracing channels and tributaries in GEE…",
    "Trazando cauces y afluentes en GEE…",
    "Traçage des cours d'eau et affluents dans GEE…"
  ],
  "result.cancelStreams": [
    "Cancelar cálculo das linhas de água da bacia",
    "Cancel basin stream calculation",
    "Cancelar cálculo de cursos de agua de la cuenca",
    "Annuler le calcul des cours d'eau du bassin"
  ],
  "result.cancel": [
    "Cancelar",
    "Cancel",
    "Cancelar",
    "Annuler"
  ],
  "result.clippedStreams": [
    "Rede hidrográfica recortada ao interior da bacia (HydroSHEDS).",
    "Stream network clipped to the basin interior (HydroSHEDS).",
    "Red hidrográfica recortada al interior de la cuenca (HydroSHEDS).",
    "Réseau hydrographique découpé à l'intérieur du bassin (HydroSHEDS)."
  ],
  "result.density": [
    "Densidade:",
    "Density:",
    "Densidad:",
    "Densité :"
  ],
  "result.densityVeryHigh": [
    "Muito alta",
    "Very high",
    "Muy alta",
    "Très élevée"
  ],
  "result.densityHigh": [
    "Alta",
    "High",
    "Alta",
    "Élevée"
  ],
  "result.densityMedium": [
    "Média",
    "Medium",
    "Media",
    "Moyenne"
  ],
  "result.densityLow": [
    "Baixa",
    "Low",
    "Baja",
    "Faible"
  ],
  "result.recalculateStreams": [
    "Recalcular linhas de água",
    "Recalculate streams",
    "Recalcular cursos de agua",
    "Recalculer les cours d'eau"
  ],
  "result.generateStreams": [
    "Gerar linhas de água",
    "Generate streams",
    "Generar cursos de agua",
    "Générer les cours d'eau"
  ],
  "result.advancedMorphometry": [
    "Morfometria avançada",
    "Advanced morphometry",
    "Morfometría avanzada",
    "Morphométrie avancée"
  ],
  "result.relief": [
    "Relevo",
    "Relief",
    "Relieve",
    "Relief"
  ],
  "result.meanSlopeShort": [
    "Declive méd.",
    "Mean slope",
    "Pendiente med.",
    "Pente moy."
  ],
  "result.maxElevationShort": [
    "Elev. máx.",
    "Max elevation",
    "Elev. máx.",
    "Alt. max."
  ],
  "result.drainageDensityShort": [
    "Dens. dren.",
    "Drainage dens.",
    "Dens. dren.",
    "Dens. drainage"
  ],
  "result.compactness": [
    "Compacidade",
    "Compactness",
    "Compacidad",
    "Compacité"
  ],
  "result.formFactor": [
    "Factor de forma",
    "Form factor",
    "Factor de forma",
    "Facteur de forme"
  ],
  "result.elevationSlope": [
    "Altimetria e declive",
    "Elevation and slope",
    "Altimetría y pendiente",
    "Altimétrie et pente"
  ],
  "result.minElevation": [
    "Elev. mínima",
    "Min. elevation",
    "Elev. mínima",
    "Alt. min."
  ],
  "result.meanElevation": [
    "Elev. média",
    "Mean elevation",
    "Elev. media",
    "Alt. moy."
  ],
  "result.maxElevation": [
    "Elev. máxima",
    "Max. elevation",
    "Elev. máxima",
    "Alt. max."
  ],
  "result.meanSlope": [
    "Declive médio",
    "Mean slope",
    "Pendiente media",
    "Pente moyenne"
  ],
  "result.meanNdvi": [
    "NDVI médio",
    "Mean NDVI",
    "NDVI medio",
    "NDVI moyen"
  ],
  "result.precipitation": [
    "Precipitação",
    "Precipitation",
    "Precipitación",
    "Précipitations"
  ],
  "result.landcoverClasses": [
    "Classes de uso do solo (ESA 10 m)",
    "Land-cover classes (ESA 10 m)",
    "Clases de uso del suelo (ESA 10 m)",
    "Classes d'occupation du sol (ESA 10 m)"
  ],
  "result.hideLayer": [
    "Ocultar camada",
    "Hide layer",
    "Ocultar capa",
    "Masquer la couche"
  ],
  "result.showMap": [
    "Ver no mapa",
    "Show on map",
    "Ver en el mapa",
    "Afficher sur la carte"
  ],
  "result.recalculatingLandcover": [
    "A recalcular uso do solo…",
    "Recalculating land cover…",
    "Recalculando uso del suelo…",
    "Recalcul de l'occupation du sol…"
  ],
  "result.recalculateLandcover": [
    "Recalcular uso do solo",
    "Recalculate land cover",
    "Recalcular uso del suelo",
    "Recalculer l'occupation du sol"
  ],
  "result.landcoverMissing": [
    "Relatório de uso do solo ainda não calculado.",
    "Land-cover report has not yet been calculated.",
    "Todavía no se ha calculado el informe de uso del suelo.",
    "Le rapport d'occupation du sol n'a pas encore été calculé."
  ],
  "result.calculating": [
    "A calcular…",
    "Calculating…",
    "Calculando…",
    "Calcul en cours…"
  ],
  "result.calculateLandcover": [
    "Calcular uso do solo",
    "Calculate land cover",
    "Calcular uso del suelo",
    "Calculer l'occupation du sol"
  ],
  "result.analysisPeriod": [
    "Período de análise (CHIRPS)",
    "Analysis period (CHIRPS)",
    "Periodo de análisis (CHIRPS)",
    "Période d'analyse (CHIRPS)"
  ],
  "result.startYear": [
    "Ano inicial",
    "Start year",
    "Año inicial",
    "Année de début"
  ],
  "result.endYear": [
    "Ano final",
    "End year",
    "Año final",
    "Année de fin"
  ],
  "result.recalculatingPeriod": [
    "A recalcular período…",
    "Recalculating period…",
    "Recalculando periodo…",
    "Recalcul de la période…"
  ],
  "result.recalculateAnalysis": [
    "Recalcular análise",
    "Recalculate analysis",
    "Recalcular análisis",
    "Recalculer l'analyse"
  ],
  "result.monthlyRain": [
    "Chuva mensal",
    "Monthly rainfall",
    "Lluvia mensual",
    "Pluie mensuelle"
  ],
  "result.rain": [
    "Chuva",
    "Rainfall",
    "Lluvia",
    "Pluie"
  ],
  "result.mmYear": [
    "mm/ano",
    "mm/year",
    "mm/año",
    "mm/an"
  ],
  "result.runoff": [
    "Escoamento — CN médio",
    "Runoff — mean CN",
    "Escorrentía — CN medio",
    "Ruissellement — CN moyen"
  ],
  "result.infiltrate": [
    "infiltração",
    "infiltration",
    "infiltración",
    "infiltration"
  ],
  "result.runoffAction": [
    "escoamento",
    "runoff",
    "escorrentía",
    "ruissellement"
  ],
  "result.hideCn": [
    "Ocultar camada CN",
    "Hide CN layer",
    "Ocultar capa CN",
    "Masquer la couche CN"
  ],
  "result.showCn": [
    "Ver mapa de escoamento (CN)",
    "Show runoff map (CN)",
    "Ver mapa de escorrentía (CN)",
    "Afficher la carte du ruissellement (CN)"
  ],
  "result.riskPotential": [
    "Índices de risco e potencial",
    "Risk and potential indices",
    "Índices de riesgo y potencial",
    "Indices de risque et de potentiel"
  ],
  "result.erosion": [
    "Erosão",
    "Erosion",
    "Erosión",
    "Érosion"
  ],
  "result.flood": [
    "Cheia / inundação",
    "Flooding",
    "Crecida / inundación",
    "Crue / inondation"
  ],
  "result.hydroPotential": [
    "Potencial hidrogeológico",
    "Groundwater potential",
    "Potencial hidrogeológico",
    "Potentiel hydrogéologique"
  ],
  "result.processingGee": [
    "A processar no GEE… (~10 s)",
    "Processing in GEE… (~10 s)",
    "Procesando en GEE… (~10 s)",
    "Traitement dans GEE… (~10 s)"
  ],
  "result.recalculateFull": [
    "Recalcular análise completa",
    "Recalculate full analysis",
    "Recalcular análisis completo",
    "Recalculer l'analyse complète"
  ],
  "result.generateFull": [
    "Gerar relatório completo",
    "Generate full report",
    "Generar informe completo",
    "Générer le rapport complet"
  ],
  "result.save": [
    "Guardar no arquivo permanente",
    "Save to permanent archive",
    "Guardar en archivo permanente",
    "Enregistrer dans les archives permanentes"
  ],
  "result.share": [
    "Partilhar ligação",
    "Share link",
    "Compartir enlace",
    "Partager le lien"
  ],
  "result.exportHtmlHint": [
    "Exportar um ficheiro HTML autónomo que funciona sem ligação à Internet",
    "Export a standalone HTML file that works offline",
    "Exportar un archivo HTML autónomo que funciona sin conexión",
    "Exporter un fichier HTML autonome utilisable hors ligne"
  ],
  "result.exportHtml": [
    "Exportar HTML",
    "Export HTML",
    "Exportar HTML",
    "Exporter HTML"
  ],
  "result.exportPdf": [
    "Exportar relatório PDF (QGIS)",
    "Export PDF report (QGIS)",
    "Exportar informe PDF (QGIS)",
    "Exporter le rapport PDF (QGIS)"
  ],
  "result.csvStats": [
    "Estatísticas CSV",
    "CSV statistics",
    "Estadísticas CSV",
    "Statistiques CSV"
  ],
  "result.notePolygon": [
    "Métricas, rede de drenagem e bacias recortadas aos limites da área de estudo.",
    "Metrics, drainage network and basins are clipped to the study-area boundaries.",
    "Métricas, red de drenaje y cuencas recortadas a los límites del área de estudio.",
    "Mesures, réseau hydrographique et bassins découpés aux limites de la zone d'étude."
  ],
  "result.noteBasin": [
    "Sub-bacia HydroBASINS (limites WWF/HydroSHEDS). Recomenda-se validação no terreno para análises definitivas.",
    "HydroBASINS sub-basin (WWF/HydroSHEDS boundaries). Field validation is recommended for final analyses.",
    "Subcuenca HydroBASINS (límites WWF/HydroSHEDS). Se recomienda validación en campo para análisis definitivos.",
    "Sous-bassin HydroBASINS (limites WWF/HydroSHEDS). Une validation sur le terrain est recommandée pour les analyses définitives."
  ],
  "result.empty": [
    "Nenhum resultado. Verifique o ponto seleccionado.",
    "No results. Check the selected point.",
    "Sin resultados. Compruebe el punto seleccionado.",
    "Aucun résultat. Vérifiez le point sélectionné."
  ],
  "result.areaAnalysis": [
    "Análise da área",
    "Area analysis",
    "Análisis del área",
    "Analyse de la zone"
  ],
  "result.basin": [
    "Bacia",
    "Basin",
    "Cuenca",
    "Bassin"
  ],
  "result.basinMorphometry": [
    "Morfometria da bacia",
    "Basin morphometry",
    "Morfometría de la cuenca",
    "Morphométrie du bassin"
  ],
  "result.geeCalculating": [
    "A calcular via GEE…",
    "Calculating with GEE…",
    "Calculando mediante GEE…",
    "Calcul via GEE…"
  ],
  "result.basinArea": [
    "Área da bacia",
    "Basin area",
    "Área de la cuenca",
    "Surface du bassin"
  ],
  "result.perimeter": [
    "Perímetro",
    "Perimeter",
    "Perímetro",
    "Périmètre"
  ],
  "result.risk": [
    "Índices de risco",
    "Risk indices",
    "Índices de riesgo",
    "Indices de risque"
  ],
  "result.export": [
    "Exportar",
    "Export",
    "Exportar",
    "Exporter"
  ],
  "result.topLithologies": [
    "Litologias principais por área",
    "Top lithologies by area",
    "Litologías principales por área",
    "Principales lithologies par surface"
  ],
  "result.area": [
    "Área",
    "Area",
    "Área",
    "Surface"
  ],
  "result.geologicalUnits": [
    "Unidades geológicas",
    "Geological units",
    "Unidades geológicas",
    "Unités géologiques"
  ],
  "result.lithology": [
    "Litologia",
    "Lithology",
    "Litología",
    "Lithologie"
  ],
  "result.dominant": [
    "Dominante:",
    "Dominant:",
    "Dominante:",
    "Dominante :"
  ],
  "result.noArea": [
    "Seleccione uma área ou carregue as bacias para consultar a análise geocientífica.",
    "Select an area or load basins to view geoscientific analysis.",
    "Seleccione un área o cargue las cuencas para ver el análisis geocientífico.",
    "Sélectionnez une zone ou chargez les bassins pour afficher l'analyse géoscientifique."
  ],
  "share.title": [
    "Partilhar análise (WebGIS)",
    "Share analysis (WebGIS)",
    "Compartir análisis (WebGIS)",
    "Partager l'analyse (WebGIS)"
  ],
  "share.subtitle": [
    "Ligação pública interactiva para visualização (apenas leitura)",
    "Interactive public viewer link (read-only)",
    "Enlace público interactivo de visualización (solo lectura)",
    "Lien public de visualisation interactive (lecture seule)"
  ],
  "share.permission": [
    "Esta ligação permite visualizar o mapa da bacia, consultar métricas e transferir o PDF.",
    "This link allows anyone to view the basin map, inspect metrics and download the PDF.",
    "Este enlace permite visualizar el mapa de la cuenca, consultar métricas y descargar el PDF.",
    "Ce lien permet de consulter la carte du bassin, ses indicateurs et de télécharger le PDF."
  ],
  "share.noProcessing": [
    "Não permite processamentos adicionais nem consome a quota GEE do proprietário.",
    "It does not allow additional processing or consume the owner's GEE quota.",
    "No permite procesamiento adicional ni consume la cuota GEE del propietario.",
    "Il ne permet aucun traitement supplémentaire et ne consomme pas le quota GEE du propriétaire."
  ],
  "share.generating": [
    "A gerar ligação WebGIS…",
    "Generating WebGIS link…",
    "Generando enlace WebGIS…",
    "Génération du lien WebGIS…"
  ],
  "share.label": [
    "Ligação para partilhar:",
    "Share link:",
    "Enlace para compartir:",
    "Lien de partage :"
  ],
  "share.short": [
    "Curta (~45 caracteres)",
    "Short (~45 characters)",
    "Corta (~45 caracteres)",
    "Court (~45 caractères)"
  ],
  "share.offline": [
    "Autónoma (offline)",
    "Standalone (offline)",
    "Autónoma (sin conexión)",
    "Autonome (hors ligne)"
  ],
  "share.offlineHint": [
    "Ligação com dados incorporados para abrir sem servidor",
    "Link with embedded data, usable without a server",
    "Enlace con datos integrados para abrir sin servidor",
    "Lien avec données intégrées, utilisable sans serveur"
  ],
  "share.copied": [
    "Copiado!",
    "Copied!",
    "¡Copiado!",
    "Copié !"
  ],
  "share.copy": [
    "Copiar",
    "Copy",
    "Copiar",
    "Copier"
  ],
  "share.shortHint": [
    "Ligação curta para WhatsApp, correio electrónico ou redes sociais.",
    "Short link for WhatsApp, email or social media.",
    "Enlace corto para WhatsApp, correo electrónico o redes sociales.",
    "Lien court pour WhatsApp, courriel ou réseaux sociaux."
  ],
  "share.offlineExplanation": [
    "Ligação autónoma com dados compactados (#d=...) que abre mesmo sem servidor.",
    "Standalone link with compressed data (#d=...) that opens even without a server.",
    "Enlace autónomo con datos comprimidos (#d=...) que se abre incluso sin servidor.",
    "Lien autonome avec données compressées (#d=...), utilisable même sans serveur."
  ],
  "dialog.close": [
    "Fechar",
    "Close",
    "Cerrar",
    "Fermer"
  ],
  "share.openViewer": [
    "Abrir visualizador",
    "Open viewer",
    "Abrir visor",
    "Ouvrir la visionneuse"
  ],
  "pdf.title": [
    "Exportação cartográfica (estilo QGIS)",
    "Cartographic export (QGIS style)",
    "Exportación cartográfica (estilo QGIS)",
    "Export cartographique (style QGIS)"
  ],
  "pdf.subtitle": [
    "Seleccione os mapas e elementos a incluir no PDF",
    "Choose maps and elements to include in the PDF",
    "Seleccione los mapas y elementos que incluir en el PDF",
    "Sélectionnez les cartes et éléments à inclure dans le PDF"
  ],
  "pdf.composition": [
    "Composição do relatório PDF:",
    "PDF report composition:",
    "Composición del informe PDF:",
    "Composition du rapport PDF :"
  ],
  "pdf.bothTitle": [
    "Relatório completo (ambos os mapas)",
    "Full report (both maps)",
    "Informe completo (ambos mapas)",
    "Rapport complet (deux cartes)"
  ],
  "pdf.bothDescription": [
    "Pág. 1: métricas e clima · Pág. 2: uso do solo (10 m) · Pág. 3: escoamento (CN)",
    "Page 1: metrics and climate · Page 2: land cover (10 m) · Page 3: runoff (CN)",
    "Pág. 1: métricas y clima · Pág. 2: uso del suelo (10 m) · Pág. 3: escorrentía (CN)",
    "Page 1 : mesures et climat · Page 2 : occupation du sol (10 m) · Page 3 : ruissellement (CN)"
  ],
  "pdf.lulcTitle": [
    "Mapa de uso e cobertura do solo",
    "Land-use and land-cover map",
    "Mapa de uso y cobertura del suelo",
    "Carte d'occupation et d'utilisation du sol"
  ],
  "pdf.lulcDescription": [
    "Composição cartográfica com ESA WorldCover 10 m, hidrografia e legenda de classes.",
    "Map layout with ESA WorldCover 10 m, streams and class legend.",
    "Diseño cartográfico con ESA WorldCover 10 m, hidrografía y leyenda de clases.",
    "Mise en page avec ESA WorldCover 10 m, hydrographie et légende des classes."
  ],
  "pdf.cnTitle": [
    "Mapa de escoamento superficial (CN)",
    "Surface-runoff map (CN)",
    "Mapa de escorrentía superficial (CN)",
    "Carte du ruissellement de surface (CN)"
  ],
  "pdf.cnDescription": [
    "Composição cartográfica com Curve Number SCS, hidrografia e zonas de infiltração.",
    "Map layout with SCS Curve Number, streams and infiltration zones.",
    "Diseño cartográfico con Curve Number SCS, hidrografía y zonas de infiltración.",
    "Mise en page avec Curve Number SCS, cours d'eau et zones d'infiltration."
  ],
  "pdf.elements": [
    "Elementos cartográficos incluídos:",
    "Included map elements:",
    "Elementos cartográficos incluidos:",
    "Éléments cartographiques inclus :"
  ],
  "pdf.north": [
    "Rosa-dos-ventos",
    "Compass rose",
    "Rosa de los vientos",
    "Rose des vents"
  ],
  "pdf.scale": [
    "Barra de escala gráfica",
    "Graphic scale bar",
    "Barra de escala gráfica",
    "Barre d'échelle graphique"
  ],
  "pdf.grid": [
    "Graticulado latitude/longitude",
    "Latitude/longitude graticule",
    "Retícula de latitud/longitud",
    "Graticule latitude/longitude"
  ],
  "pdf.legend": [
    "Legenda temática",
    "Thematic legend",
    "Leyenda temática",
    "Légende thématique"
  ],
  "dialog.cancel": [
    "Cancelar",
    "Cancel",
    "Cancelar",
    "Annuler"
  ],
  "pdf.generating": [
    "A gerar PDF QGIS…",
    "Generating QGIS PDF…",
    "Generando PDF QGIS…",
    "Génération du PDF QGIS…"
  ],
  "pdf.generate": [
    "Gerar PDF A4",
    "Generate A4 PDF",
    "Generar PDF A4",
    "Générer le PDF A4"
  ],
  "archive.title": [
    "Arquivo permanente de análises",
    "Permanent analysis archive",
    "Archivo permanente de análisis",
    "Archives permanentes des analyses"
  ],
  "archive.subtitle": [
    "Bacias guardadas para consulta imediata sem utilizar o GEE",
    "Saved basins for instant viewing without GEE",
    "Cuencas guardadas para consulta inmediata sin usar GEE",
    "Bassins enregistrés pour consultation immédiate sans GEE"
  ],
  "archive.empty": [
    "Ainda não existem análises guardadas",
    "No saved analyses yet",
    "Todavía no hay análisis guardados",
    "Aucune analyse enregistrée pour le moment"
  ],
  "archive.emptyHint": [
    "Delimite uma bacia e utilize «Guardar no arquivo permanente» para a conservar.",
    "Delineate a basin and select “Save to permanent archive” to keep it.",
    "Delimite una cuenca y seleccione «Guardar en archivo permanente» para conservarla.",
    "Délimitez un bassin et sélectionnez «Enregistrer dans les archives permanentes» pour le conserver."
  ],
  "archive.savedAt": [
    "Guardada em",
    "Saved on",
    "Guardada el",
    "Enregistrée le"
  ],
  "archive.area": [
    "Área delimitada",
    "Delineated area",
    "Área delimitada",
    "Zone délimitée"
  ],
  "archive.delete": [
    "Eliminar do arquivo",
    "Delete from archive",
    "Eliminar del archivo",
    "Supprimer des archives"
  ],
  "archive.load": [
    "Carregar no mapa",
    "Load onto map",
    "Cargar en el mapa",
    "Charger sur la carte"
  ],
  "archive.download": [
    "Transferir ficheiro HTML autónomo offline",
    "Download standalone offline HTML file",
    "Descargar archivo HTML autónomo sin conexión",
    "Télécharger le fichier HTML autonome hors ligne"
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type HydrologyResultKey = keyof typeof HYDROLOGY_RESULT_MESSAGES;
const INDEX: Record<PortalCatalogLocale,0|1|2|3>={pt:0,en:1,es:2,fr:3};
export function hydrologyResultText(language:string,key:HydrologyResultKey):string{
  return HYDROLOGY_RESULT_MESSAGES[key][INDEX[resolvedPortalLocale(language)]];
}
