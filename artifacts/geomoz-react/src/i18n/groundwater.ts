/** Groundwater AHP interface translations. API classification IDs and factor keys remain stable. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";

export const GROUNDWATER_MESSAGES = {
  "title": [
    "Água Subterrânea",
    "Groundwater",
    "Agua subterránea",
    "Eaux souterraines"
  ],
  "subtitle": [
    "Potencial hídrico · AHP · GEE",
    "Groundwater potential · AHP · GEE",
    "Potencial hídrico · AHP · GEE",
    "Potentiel hydrique · AHP · GEE"
  ],
  "studyArea": [
    "Área de estudo",
    "Study area",
    "Área de estudio",
    "Zone d'étude"
  ],
  "description": [
    "Combina 6 factores hidrogeológicos através de ponderação AHP. As zonas verdes indicam maior potencial de água subterrânea.",
    "Combines 6 hydrogeological factors using AHP weighting. Green areas indicate higher groundwater potential.",
    "Combina 6 factores hidrogeológicos mediante ponderación AHP. Las zonas verdes indican mayor potencial de agua subterránea.",
    "Combine 6 facteurs hydrogéologiques par pondération AHP. Les zones vertes indiquent un potentiel en eaux souterraines plus élevé."
  ],
  "rainYear": [
    "Ano da precipitação",
    "Rainfall year",
    "Año de precipitación",
    "Année des précipitations"
  ],
  "calculate": [
    "Calcular potencial",
    "Calculate potential",
    "Calcular potencial",
    "Calculer le potentiel"
  ],
  "weights": [
    "Pesos AHP",
    "AHP weights",
    "Pesos AHP",
    "Pondérations AHP"
  ],
  "collapsePanel": [
    "Recolher painel",
    "Collapse panel",
    "Contraer panel",
    "Réduire le panneau"
  ],
  "expandPanel": [
    "Expandir painel",
    "Expand panel",
    "Expandir panel",
    "Déployer le panneau"
  ],
  "filters": [
    "Filtros",
    "Filters",
    "Filtros",
    "Filtres"
  ],
  "processing": [
    "A calcular o potencial hídrico (AHP, 6 factores)… pode demorar cerca de 1 minuto.",
    "Calculating groundwater potential (AHP, 6 factors)… this may take about 1 minute.",
    "Calculando el potencial hídrico (AHP, 6 factores)… puede tardar aproximadamente 1 minuto.",
    "Calcul du potentiel en eaux souterraines (AHP, 6 facteurs)… environ 1 minute peut être nécessaire."
  ],
  "potential": [
    "Potencial hídrico",
    "Groundwater potential",
    "Potencial hídrico",
    "Potentiel hydrique"
  ],
  "potentialFull": [
    "Potencial de água subterrânea",
    "Groundwater potential",
    "Potencial de agua subterránea",
    "Potentiel en eaux souterraines"
  ],
  "modelNotice": [
    "Modelo AHP indicativo: a litologia pode ser acrescentada como sétimo factor. Validar os resultados com furos de investigação.",
    "Indicative AHP model: lithology can be added as a seventh factor. Validate the results with exploratory boreholes.",
    "Modelo AHP indicativo: la litología puede añadirse como séptimo factor. Valide los resultados con perforaciones exploratorias.",
    "Modèle AHP indicatif : la lithologie peut être ajoutée comme septième facteur. Valider les résultats par des forages de reconnaissance."
  ],
  "exportPdf": [
    "Exportar relatório PDF",
    "Export PDF report",
    "Exportar informe PDF",
    "Exporter le rapport PDF"
  ],
  "error.title": [
    "Erro no potencial hídrico",
    "Groundwater potential error",
    "Error en el potencial hídrico",
    "Erreur de potentiel hydrique"
  ],
  "error.timeout": [
    "O cálculo AHP demorou demasiado. Seleccione uma província ou distrito em vez de todo o país.",
    "AHP calculation timed out. Select a province or district instead of the entire country.",
    "El cálculo AHP ha tardado demasiado. Seleccione una provincia o distrito en lugar de todo el país.",
    "Le calcul AHP a dépassé le délai. Sélectionnez une province ou un district au lieu du pays entier."
  ],
  "error.failed": [
    "Falha no processamento",
    "Processing failed",
    "Error de procesamiento",
    "Échec du traitement"
  ],
  "pdf.reportTitle": [
    "Relatório de potencial hídrico subterrâneo (AHP)",
    "Groundwater potential report (AHP)",
    "Informe de potencial hídrico subterráneo (AHP)",
    "Rapport sur le potentiel en eaux souterraines (AHP)"
  ],
  "pdf.year": [
    "Ano",
    "Year",
    "Año",
    "Année"
  ],
  "pdf.area": [
    "Área",
    "Area",
    "Área",
    "Zone"
  ],
  "pdf.province": [
    "Província",
    "Province",
    "Provincia",
    "Province"
  ],
  "pdf.mapTitle": [
    "Potencial hídrico",
    "Groundwater potential",
    "Potencial hídrico",
    "Potentiel hydrique"
  ],
  "pdf.classes": [
    "Classes de potencial hídrico",
    "Groundwater potential classes",
    "Clases de potencial hídrico",
    "Classes de potentiel hydrique"
  ],
  "pdf.class": [
    "Classe",
    "Class",
    "Clase",
    "Classe"
  ],
  "pdf.areaUnit": [
    "Área (km²)",
    "Area (km²)",
    "Área (km²)",
    "Surface (km²)"
  ],
  "pdf.factor": [
    "Factor",
    "Factor",
    "Factor",
    "Facteur"
  ],
  "pdf.weight": [
    "Peso",
    "Weight",
    "Peso",
    "Poids"
  ],
  "pdf.favors": [
    "Favorece",
    "Favours",
    "Favorece",
    "Favorise"
  ],
  "pdf.highPotential": [
    "Alto potencial",
    "High potential",
    "Alto potencial",
    "Potentiel élevé"
  ],
  "pdf.lowPotential": [
    "Baixo potencial",
    "Low potential",
    "Bajo potencial",
    "Faible potentiel"
  ],
  "pdf.analysis": [
    "Análise",
    "Analysis",
    "Análisis",
    "Analyse"
  ],
  "pdf.factors": [
    "Factores",
    "Factors",
    "Factores",
    "Facteurs"
  ],
  "pdf.resolution": [
    "Resolução",
    "Resolution",
    "Resolución",
    "Résolution"
  ],
  "pdf.totalArea": [
    "Área total",
    "Total area",
    "Área total",
    "Surface totale"
  ],
  "class.1": [
    "Muito baixo",
    "Very low",
    "Muy bajo",
    "Très faible"
  ],
  "class.2": [
    "Baixo",
    "Low",
    "Bajo",
    "Faible"
  ],
  "class.3": [
    "Moderado",
    "Moderate",
    "Moderado",
    "Modéré"
  ],
  "class.4": [
    "Alto",
    "High",
    "Alto",
    "Élevé"
  ],
  "class.5": [
    "Muito alto",
    "Very high",
    "Muy alto",
    "Très élevé"
  ],
  "factor.lineament": [
    "Densidade de lineamentos",
    "Lineament density",
    "Densidad de lineamientos",
    "Densité des linéaments"
  ],
  "factor.rainfall": [
    "Precipitação (CHIRPS)",
    "Precipitation (CHIRPS)",
    "Precipitación (CHIRPS)",
    "Précipitations (CHIRPS)"
  ],
  "factor.slope": [
    "Declive",
    "Slope",
    "Pendiente",
    "Pente"
  ],
  "factor.drainage": [
    "Densidade de drenagem",
    "Drainage density",
    "Densidad de drenaje",
    "Densité de drainage"
  ],
  "factor.twi": [
    "Índice de humidade (TWI)",
    "Topographic wetness index (TWI)",
    "Índice de humedad topográfica (TWI)",
    "Indice d'humidité topographique (TWI)"
  ],
  "factor.landcover": [
    "Uso/cobertura do solo",
    "Land use / land cover",
    "Uso/cobertura del suelo",
    "Occupation / couverture du sol"
  ]
} as const satisfies Record<string, readonly [string, string, string, string]>;

export type GroundwaterCopyKey = keyof typeof GROUNDWATER_MESSAGES;
const LOCALE_INDEX: Record<PortalCatalogLocale, 0 | 1 | 2 | 3> = { pt: 0, en: 1, es: 2, fr: 3 };

export function groundwaterText(language: string, key: GroundwaterCopyKey): string {
  return GROUNDWATER_MESSAGES[key][LOCALE_INDEX[resolvedPortalLocale(language)]];
}

// Only translate server-provided labels when their stable IDs and canonical
// Portuguese descriptions match our known, versioned GEE metadata.
const CLASS_ORIGINAL: Record<number, string> = {
  1: "Muito baixo", 2: "Baixo", 3: "Moderado", 4: "Alto", 5: "Muito alto",
};
const FACTOR_ORIGINAL: Record<string, string> = {
  lineament: "Densidade de lineamentos",
  rainfall: "Precipitação (CHIRPS)",
  slope: "Declive",
  drainage: "Densidade de drenagem",
  twi: "Índice de humidade (TWI)",
  landcover: "Uso/cobertura do solo",
};

export function groundwaterClassLabel(language: string, id: number, original: string): string {
  if (CLASS_ORIGINAL[id] !== original || !(("class." + id) in GROUNDWATER_MESSAGES)) return original;
  return groundwaterText(language, `class.${id}` as GroundwaterCopyKey);
}

export function groundwaterFactorLabel(language: string, key: string, original: string): string {
  if (FACTOR_ORIGINAL[key] !== original || !(("factor." + key) in GROUNDWATER_MESSAGES)) return original;
  return groundwaterText(language, `factor.${key}` as GroundwaterCopyKey);
}
