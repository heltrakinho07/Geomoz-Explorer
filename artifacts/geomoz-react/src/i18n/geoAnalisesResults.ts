/** Translated analysis results and cartographic export UI. Scientific IDs and server data remain unchanged. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";
export const GEOANALISES_RESULT_MESSAGES = {
  "overlay.showChart": ["Mostrar gráfico de correlação","Show correlation chart","Mostrar gráfico de correlación","Afficher le graphique de corrélation"],
  "pdf.title": [
    "Relatório de análise",
    "Analysis report",
    "Informe de análisis",
    "Rapport d'analyse"
  ],
  "pdf.analysis": [
    "Análise:",
    "Analysis:",
    "Análisis:",
    "Analyse :"
  ],
  "pdf.province": [
    "Província:",
    "Province:",
    "Provincia:",
    "Province :"
  ],
  "pdf.area": [
    "Área:",
    "Area:",
    "Área:",
    "Zone :"
  ],
  "pdf.mapTitle": [
    "Análise",
    "Analysis",
    "Análisis",
    "Analyse"
  ],
  "area.mozambique": [
    "Moçambique",
    "Mozambique",
    "Mozambique",
    "Mozambique"
  ],
  "analysis.panelTitle": [
    "Análise:",
    "Analysis:",
    "Análisis:",
    "Analyse :"
  ],
  "analysis.statsTitle": [
    "Métricas geoestatísticas",
    "Geostatistical metrics",
    "Métricas geoestadísticas",
    "Indicateurs géostatistiques"
  ],
  "analysis.zonalClip": [
    "Recorte zonal",
    "Zonal clipping",
    "Recorte zonal",
    "Découpage zonal"
  ],
  "analysis.clippedArea": [
    "Área recortada",
    "Clipped area",
    "Área recortada",
    "Zone découpée"
  ],
  "analysis.mean": [
    "Média (μ)",
    "Mean (μ)",
    "Media (μ)",
    "Moyenne (μ)"
  ],
  "analysis.median": [
    "Mediana (P50)",
    "Median (P50)",
    "Mediana (P50)",
    "Médiane (P50)"
  ],
  "analysis.stdDev": [
    "Desvio-padrão (σ)",
    "Standard deviation (σ)",
    "Desviación estándar (σ)",
    "Écart-type (σ)"
  ],
  "analysis.percentiles": [
    "Distribuição percentílica (P10 → P90)",
    "Percentile distribution (P10 → P90)",
    "Distribución percentil (P10 → P90)",
    "Distribution des percentiles (P10 → P90)"
  ],
  "analysis.awaiting": [
    "A aguardar cálculo zonal",
    "Awaiting zonal calculation",
    "Esperando cálculo zonal",
    "En attente du calcul zonal"
  ],
  "analysis.clickCalculate": [
    "Clique em Calcular",
    "Select Calculate",
    "Pulse Calcular",
    "Cliquez sur Calculer"
  ],
  "analysis.statsHint": [
    "nos filtros para gerar métricas geoestatísticas. O modo Rápido apresenta primeiro o mapa e dispensa estatísticas extensas.",
    "in the filters to generate geostatistical metrics. Fast mode displays the map first and skips extensive statistics.",
    "en los filtros para generar métricas geoestadísticas. El modo Rápido muestra primero el mapa y omite estadísticas extensas.",
    "dans les filtres pour produire les mesures géostatistiques. Le mode Rapide affiche d'abord la carte et évite les statistiques approfondies."
  ],
  "analysis.running": [
    "O Google Earth Engine está a processar dados reais. A duração depende da área, das datas e do modo de processamento seleccionado.",
    "Google Earth Engine is processing real data. Duration depends on the area, date range and processing mode.",
    "Google Earth Engine está procesando datos reales. La duración depende del área, las fechas y el modo de procesamiento.",
    "Google Earth Engine traite des données réelles. La durée dépend de la zone, des dates et du mode de traitement."
  ],
  "analysis.completed": [
    "Processamento GEE concluído",
    "GEE processing completed",
    "Procesamiento GEE completado",
    "Traitement GEE terminé"
  ],
  "analysis.active24h": [
    "Activo durante 24 h",
    "Active for 24 h",
    "Activo durante 24 h",
    "Actif pendant 24 h"
  ],
  "analysis.scenes": [
    "cenas ópticas no período principal",
    "optical scenes in the main period",
    "escenas ópticas en el periodo principal",
    "scènes optiques sur la période principale"
  ],
  "analysis.preFire": [
    "Pré-incêndio:",
    "Pre-fire:",
    "Antes del incendio:",
    "Avant incendie :"
  ],
  "analysis.detected": [
    "Área com detecção:",
    "Detected area:",
    "Área detectada:",
    "Surface détectée :"
  ],
  "analysis.period": [
    "Período:",
    "Period:",
    "Periodo:",
    "Période :"
  ],
  "analysis.compareTitle": [
    "Comparar este índice entre 2023 e o período recente",
    "Compare this index between 2023 and the recent period",
    "Comparar este índice entre 2023 y el periodo reciente",
    "Comparer cet indice entre 2023 et la période récente"
  ],
  "analysis.compare": [
    "Comparar",
    "Compare",
    "Comparar",
    "Comparer"
  ],
  "analysis.recent": [
    "recente",
    "recent",
    "reciente",
    "récente"
  ],
  "project.none": [
    "Nenhum projecto seleccionado",
    "No project selected",
    "Ningún proyecto seleccionado",
    "Aucun projet sélectionné"
  ],
  "project.choose": [
    "Seleccione ou crie um projecto no menu superior para guardar esta análise.",
    "Select or create a project in the top menu to save this analysis.",
    "Seleccione o cree un proyecto en el menú superior para guardar este análisis.",
    "Sélectionnez ou créez un projet dans le menu supérieur pour enregistrer cette analyse."
  ],
  "project.saved": [
    "Análise guardada com sucesso!",
    "Analysis saved successfully!",
    "¡Análisis guardado correctamente!",
    "Analyse enregistrée avec succès !"
  ],
  "project.added": [
    "Adicionada ao projecto",
    "Added to project",
    "Añadida al proyecto",
    "Ajoutée au projet"
  ],
  "project.error": [
    "Erro ao guardar a análise",
    "Failed to save analysis",
    "Error al guardar el análisis",
    "Erreur lors de l'enregistrement de l'analyse"
  ],
  "project.retry": [
    "Tente novamente.",
    "Try again.",
    "Inténtelo de nuevo.",
    "Réessayez."
  ],
  "project.label": [
    "Projecto:",
    "Project:",
    "Proyecto:",
    "Projet :"
  ],
  "project.inactive": [
    "Nenhum projecto activo",
    "No active project",
    "Ningún proyecto activo",
    "Aucun projet actif"
  ],
  "project.saving": [
    "A guardar no projecto…",
    "Saving to project…",
    "Guardando en el proyecto…",
    "Enregistrement dans le projet…"
  ],
  "project.savedButton": [
    "Guardado no projecto",
    "Saved to project",
    "Guardado en el proyecto",
    "Enregistré dans le projet"
  ],
  "project.save": [
    "Guardar análise no projecto activo",
    "Save analysis to active project",
    "Guardar análisis en el proyecto activo",
    "Enregistrer l'analyse dans le projet actif"
  ],
  "project.select": [
    "Seleccione um projecto no menu superior",
    "Select a project in the top menu",
    "Seleccione un proyecto en el menú superior",
    "Sélectionnez un projet dans le menu supérieur"
  ],
  "analysis.storymap": [
    "Apresentação executiva (StoryMap)",
    "Executive presentation (StoryMap)",
    "Presentación ejecutiva (StoryMap)",
    "Présentation exécutive (StoryMap)"
  ],
  "analysis.spectralScale": [
    "Escala espectral",
    "Spectral scale",
    "Escala espectral",
    "Échelle spectrale"
  ],
  "analysis.methodology": [
    "Interpretação geocientífica e fórmula",
    "Geoscientific interpretation and formula",
    "Interpretación geocientífica y fórmula",
    "Interprétation géoscientifique et formule"
  ],
  "analysis.interpretation": [
    "Interpretação geocientífica",
    "Geoscientific interpretation",
    "Interpretación geocientífica",
    "Interprétation géoscientifique"
  ],
  "analysis.formula": [
    "Fórmula matemática",
    "Mathematical formula",
    "Fórmula matemática",
    "Formule mathématique"
  ],
  "analysis.bands": [
    "Bandas:",
    "Bands:",
    "Bandas:",
    "Bandes :"
  ],
  "analysis.multiSensor": [
    "Multissensor",
    "Multi-sensor",
    "Multisensor",
    "Multicapteur"
  ],
  "landcover.title": [
    "Cobertura do solo",
    "Land cover",
    "Cobertura del suelo",
    "Occupation du sol"
  ],
  "landcover.details": [
    "Classificação ESA WorldCover 2021 a 10 m — 11 classes de uso e cobertura do solo, incluindo florestas, agricultura, água e mangais.",
    "ESA WorldCover 2021 classification at 10 m — 11 land-cover classes including forests, agriculture, water and mangroves.",
    "Clasificación ESA WorldCover 2021 a 10 m — 11 clases de cobertura del suelo, incluidos bosques, agricultura, agua y manglares.",
    "Classification ESA WorldCover 2021 à 10 m — 11 classes d'occupation du sol, dont forêts, agriculture, eau et mangroves."
  ],
  "landcover.clip": [
    "Área de recorte",
    "Clipping area",
    "Área de recorte",
    "Zone de découpage"
  ],
  "landcover.provinceAll": [
    "toda a província",
    "entire province",
    "toda la provincia",
    "province entière"
  ],
  "landcover.countryAll": [
    "Moçambique (todo o território)",
    "Mozambique (entire country)",
    "Mozambique (todo el país)",
    "Mozambique (tout le pays)"
  ],
  "landcover.running": [
    "A classificar a cobertura do solo…",
    "Classifying land cover…",
    "Clasificando la cobertura del suelo…",
    "Classification de l'occupation du sol…"
  ],
  "landcover.run": [
    "Calcular cobertura do solo",
    "Calculate land cover",
    "Calcular cobertura del suelo",
    "Calculer l'occupation du sol"
  ],
  "landcover.computing": [
    "A calcular as áreas por classe a partir do ESA WorldCover (10 m). Pode demorar alguns segundos.",
    "Calculating area by class from ESA WorldCover (10 m). This may take a few seconds.",
    "Calculando las áreas por clase a partir de ESA WorldCover (10 m). Puede tardar unos segundos.",
    "Calcul de la surface par classe à partir d'ESA WorldCover (10 m). Cela peut prendre quelques secondes."
  ],
  "landcover.completed": [
    "Cobertura calculada",
    "Land-cover calculation completed",
    "Cobertura calculada",
    "Couverture du sol calculée"
  ],
  "landcover.total": [
    "Área total:",
    "Total area:",
    "Área total:",
    "Surface totale :"
  ],
  "landcover.classes": [
    "classes presentes",
    "classes present",
    "clases presentes",
    "classes présentes"
  ],
  "landcover.areaAnalysis": [
    "Análise da área (km² · %)",
    "Area analysis (km² · %)",
    "Análisis de superficie (km² · %)",
    "Analyse de surface (km² · %)"
  ],
  "landcover.legend": [
    "Legenda (ESA WorldCover)",
    "Legend (ESA WorldCover)",
    "Leyenda (ESA WorldCover)",
    "Légende (ESA WorldCover)"
  ],
  "analysis.error": [
    "Erro:",
    "Error:",
    "Error:",
    "Erreur :"
  ],
  "overlay.openResults": [
    "Mostrar painel de resultados",
    "Show results panel",
    "Mostrar panel de resultados",
    "Afficher le panneau des résultats"
  ],
  "overlay.filters": [
    "Filtros",
    "Filters",
    "Filtros",
    "Filtres"
  ],
  "overlay.openFilters": [
    "Abrir filtros e parâmetros",
    "Open filters and parameters",
    "Abrir filtros y parámetros",
    "Ouvrir les filtres et paramètres"
  ],
  "overlay.results": [
    "Resultados",
    "Results",
    "Resultados",
    "Résultats"
  ],
  "overlay.topoProfile": [
    "Perfil topográfico",
    "Topographic profile",
    "Perfil topográfico",
    "Profil topographique"
  ],
  "overlay.close": [
    "Fechar",
    "Close",
    "Cerrar",
    "Fermer"
  ],
  "overlay.samples": [
    "amostras",
    "samples",
    "muestras",
    "échantillons"
  ],
  "overlay.reopen": [
    "Reabrir gráfico",
    "Reopen chart",
    "Reabrir gráfico",
    "Rouvrir le graphique"
  ],
  "overlay.drought": [
    "seca",
    "drought",
    "sequía",
    "sécheresse"
  ],
  "overlay.wet": [
    "húmido",
    "wet",
    "húmedo",
    "humide"
  ],
  "overlay.contours": [
    "Curvas de nível",
    "Contour lines",
    "Curvas de nivel",
    "Courbes de niveau"
  ],
  "overlay.elevation": [
    "Elevação:",
    "Elevation:",
    "Elevación:",
    "Altitude :"
  ],
  "overlay.curves": [
    "curvas",
    "contours",
    "curvas",
    "courbes"
  ],
  "overlay.indexContours": [
    "linhas-mestras a cada",
    "index contours every",
    "curvas maestras cada",
    "courbes maîtresses tous les"
  ],
  "overlay.topoClasses": [
    "Classes topográficas",
    "Topographic classes",
    "Clases topográficas",
    "Classes topographiques"
  ],
  "overlay.potential": [
    "Potencial:",
    "Potential:",
    "Potencial:",
    "Potentiel :"
  ],
  "overlay.meanScore": [
    "Pontuação média:",
    "Mean score:",
    "Puntuación media:",
    "Score moyen :"
  ],
  "overlay.favorable": [
    "Área favorável:",
    "Favorable area:",
    "Área favorable:",
    "Surface favorable :"
  ],
  "overlay.favorability": [
    "Favorabilidade (0–100)",
    "Favorability (0–100)",
    "Favorabilidad (0–100)",
    "Favorabilité (0–100)"
  ],
  "overlay.low": [
    "baixa",
    "low",
    "baja",
    "faible"
  ],
  "overlay.high": [
    "alta",
    "high",
    "alta",
    "élevée"
  ],
  "overlay.scenes": [
    "cenas",
    "scenes",
    "escenas",
    "scènes"
  ],
  "overlay.areas": [
    "zonas cruzadas",
    "intersected zones",
    "zonas intersectadas",
    "zones recoupées"
  ],
  "overlay.startTarget": [
    "escolha um mineral e execute",
    "choose a mineral and run",
    "seleccione un mineral y ejecute",
    "choisissez un minéral et lancez"
  ],
  "overlay.startSpi": [
    "escolha o ano e execute",
    "choose a year and run",
    "seleccione un año y ejecute",
    "choisissez une année et lancez"
  ],
  "overlay.requiredGee": [
    "GEE necessário",
    "GEE required",
    "Se necesita GEE",
    "GEE nécessaire"
  ],
  "overlay.realGee": [
    "GEE real",
    "Real GEE",
    "GEE real",
    "GEE réel"
  ],
  "overlay.inDevelopment": [
    "Em desenvolvimento",
    "In development",
    "En desarrollo",
    "En développement"
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type GeoAnalisesResultKey = keyof typeof GEOANALISES_RESULT_MESSAGES;
const INDICES:Record<PortalCatalogLocale,0|1|2|3>={pt:0,en:1,es:2,fr:3};
export function geoAnalisesResultText(language:string,key:GeoAnalisesResultKey):string{
  return GEOANALISES_RESULT_MESSAGES[key][INDICES[resolvedPortalLocale(language)]];
}
