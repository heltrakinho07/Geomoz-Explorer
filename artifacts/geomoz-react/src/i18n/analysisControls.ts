/** Reactive scientific analysis parameters; index IDs, Earth Engine request fields and numeric values remain stable. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";
export const ANALYSIS_CONTROL_MESSAGES = {
  "sidebar.collapse": [
    "Recolher painel lateral",
    "Collapse sidebar",
    "Contraer panel lateral",
    "Réduire le panneau latéral"
  ],
  "sidebar.expand": [
    "Expandir painel lateral",
    "Expand sidebar",
    "Expandir panel lateral",
    "Déployer le panneau latéral"
  ],
  "sidebar.parameters": [
    "Parâmetros da análise",
    "Analysis parameters",
    "Parámetros del análisis",
    "Paramètres de l'analyse"
  ],
  "sidebar.filters": [
    "Filtros e parâmetros",
    "Filters and parameters",
    "Filtros y parámetros",
    "Filtres et paramètres"
  ],
  "sidebar.closeFilters": [
    "Fechar filtros",
    "Close filters",
    "Cerrar filtros",
    "Fermer les filtres"
  ],
  "sidebar.studyArea": [
    "Área de estudo",
    "Study area",
    "Área de estudio",
    "Zone d'étude"
  ],
  "gee.parameters": [
    "Parâmetros GEE",
    "GEE parameters",
    "Parámetros GEE",
    "Paramètres GEE"
  ],
  "gee.start": [
    "Data inicial",
    "Start date",
    "Fecha inicial",
    "Date de début"
  ],
  "gee.end": [
    "Data final (exclusiva)",
    "End date (exclusive)",
    "Fecha final (exclusiva)",
    "Date de fin (exclusive)"
  ],
  "gee.fireStart": [
    "Pós-incêndio: início",
    "Post-fire: start",
    "Después del incendio: inicio",
    "Après incendie : début"
  ],
  "gee.fireEnd": [
    "Pós-incêndio: fim exclusivo",
    "Post-fire: exclusive end",
    "Después del incendio: fin exclusivo",
    "Après incendie : fin exclusive"
  ],
  "gee.cloud": [
    "Cobertura máxima de nuvens:",
    "Maximum cloud cover:",
    "Cobertura máxima de nubes:",
    "Couverture nuageuse maximale :"
  ],
  "gee.advanced": [
    "Opções avançadas de processamento",
    "Advanced processing options",
    "Opciones avanzadas de procesamiento",
    "Options avancées de traitement"
  ],
  "gee.depth": [
    "Profundidade da análise",
    "Analysis depth",
    "Profundidad del análisis",
    "Profondeur de l'analyse"
  ],
  "gee.mode.fast": [
    "Rápido — mapa primeiro",
    "Fast — map first",
    "Rápido — primero el mapa",
    "Rapide — carte d'abord"
  ],
  "gee.mode.balanced": [
    "Equilibrado — estatísticas básicas",
    "Balanced — basic statistics",
    "Equilibrado — estadísticas básicas",
    "Équilibré — statistiques de base"
  ],
  "gee.mode.detailed": [
    "Detalhado — percentis e análise completa",
    "Detailed — percentiles and full analysis",
    "Detallado — percentiles y análisis completo",
    "Détaillé — percentiles et analyse complète"
  ],
  "gee.mode.fastHint": [
    "Reduz consultas estatísticas; os píxeis e as cenas continuam reais.",
    "Reduces statistical requests; pixels and scenes remain real.",
    "Reduce las consultas estadísticas; los píxeles y las escenas siguen siendo reales.",
    "Réduit les requêtes statistiques ; les pixels et les scènes restent réels."
  ],
  "gee.mode.balancedHint": [
    "Calcula média e extremos a 250 m; não altera a resolução cartográfica.",
    "Computes mean and extremes at 250 m; map resolution remains unchanged.",
    "Calcula media y extremos a 250 m; no cambia la resolución cartográfica.",
    "Calcule moyenne et extrêmes à 250 m ; ne modifie pas la résolution de la carte."
  ],
  "gee.mode.detailedHint": [
    "Calcula percentis, dispersão e área. Pode demorar mais em regiões extensas.",
    "Calculates percentiles, dispersion and area. May take longer for large regions.",
    "Calcula percentiles, dispersión y área. Puede tardar más en regiones extensas.",
    "Calcule percentiles, dispersion et surface. Peut prendre plus de temps sur de grandes régions."
  ],
  "gee.mode.scope": [
    "Aplica-se a índices espectrais, não a ferramentas especializadas.",
    "Applies to spectral indices, not specialized tools.",
    "Se aplica a índices espectrales, no a herramientas especializadas.",
    "S'applique aux indices spectraux, pas aux outils spécialisés."
  ],
  "gee.timeout": [
    "Limite de espera",
    "Time limit",
    "Tiempo límite de espera",
    "Délai d'attente maximal"
  ],
  "gee.timeoutHint": [
    "Este limite interrompe a espera no navegador, mas não garante o cancelamento do processamento no servidor.",
    "This limit stops the browser from waiting but does not guarantee cancellation on the server.",
    "Este límite detiene la espera del navegador, pero no garantiza cancelar el procesamiento del servidor.",
    "Ce délai arrête l'attente du navigateur sans garantir l'annulation du traitement serveur."
  ],
  "gee.preFire": [
    "Período pré-incêndio",
    "Pre-fire period",
    "Periodo previo al incendio",
    "Période avant incendie"
  ],
  "run.development": [
    "Em desenvolvimento",
    "In development",
    "En desarrollo",
    "En développement"
  ],
  "run.processing": [
    "A processar no GEE…",
    "Processing in GEE…",
    "Procesando en GEE…",
    "Traitement GEE en cours…"
  ],
  "run.refresh": [
    "Actualizar análise",
    "Refresh analysis",
    "Actualizar análisis",
    "Actualiser l'analyse"
  ],
  "run.start": [
    "Executar análise",
    "Run analysis",
    "Ejecutar análisis",
    "Exécuter l'analyse"
  ],
  "run.waiting": [
    "A aguardar processamento GEE",
    "Waiting for GEE processing",
    "Esperando procesamiento GEE",
    "En attente du traitement GEE"
  ],
  "run.progressHint": [
    "Tempo decorrido real; o Earth Engine não fornece percentagem de progresso nesta operação.",
    "Actual elapsed time; Earth Engine does not report percent progress for this operation.",
    "Tiempo real transcurrido; Earth Engine no proporciona porcentaje de progreso para esta operación.",
    "Temps réellement écoulé ; Earth Engine ne fournit pas de pourcentage de progression pour cette opération."
  ],
  "run.cancelWait": [
    "Cancelar espera",
    "Stop waiting",
    "Cancelar espera",
    "Arrêter l'attente"
  ],
  "run.last": [
    "Último processamento:",
    "Last processing:",
    "Último procesamiento:",
    "Dernier traitement :"
  ],
  "run.active": [
    "Resultado activo",
    "Active result",
    "Resultado activo",
    "Résultat actif"
  ],
  "run.error": [
    "Erro:",
    "Error:",
    "Error:",
    "Erreur :"
  ],
  "legend": [
    "Legenda",
    "Legend",
    "Leyenda",
    "Légende"
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type AnalysisControlKey = keyof typeof ANALYSIS_CONTROL_MESSAGES;
const INDEX:Record<PortalCatalogLocale,0|1|2|3>={pt:0,en:1,es:2,fr:3};
export function analysisControlText(language:string,key:AnalysisControlKey):string{
  return ANALYSIS_CONTROL_MESSAGES[key][INDEX[resolvedPortalLocale(language)]];
}
