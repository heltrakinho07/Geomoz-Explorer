/** Localized AI diagnostic UI. Raw evidence and scientific data must remain immutable. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";

export const AI_DIAGNOSTIC_MESSAGES = {
  "error.generic": [
    "Não foi possível concluir o pedido. Tente novamente.",
    "The request could not be completed. Please try again.",
    "No se pudo completar la solicitud. Inténtelo de nuevo.",
    "La requête n'a pas pu aboutir. Veuillez réessayer."
  ],
  "error.unauthorized": [
    "Sessão não autorizada. Inicie sessão novamente.",
    "Your session is not authorized. Sign in again.",
    "La sesión no está autorizada. Vuelva a iniciar sesión.",
    "Votre session n'est pas autorisée. Reconnectez-vous."
  ],
  "error.forbidden": [
    "Não tem permissão para executar esta análise.",
    "You do not have permission to run this analysis.",
    "No tiene permiso para ejecutar este análisis.",
    "Vous n'êtes pas autorisé à exécuter cette analyse."
  ],
  "error.invalid": [
    "Os parâmetros da consulta não são válidos. Verifique a área e o período.",
    "The request parameters are invalid. Check the area and date range.",
    "Los parámetros no son válidos. Compruebe el área y las fechas.",
    "Les paramètres sont invalides. Vérifiez la zone et les dates."
  ],
  "error.unavailable": [
    "Serviço temporariamente indisponível. Volte a tentar mais tarde.",
    "Service temporarily unavailable. Try again later.",
    "Servicio temporalmente no disponible. Inténtelo más tarde.",
    "Service temporairement indisponible. Réessayez plus tard."
  ],
  "error.timeout": [
    "A consulta excedeu o tempo de espera. Reduza a área ou o período e tente novamente.",
    "The request timed out. Try a smaller area or date range.",
    "La solicitud agotó el tiempo de espera. Reduzca el área o el periodo.",
    "La requête a expiré. Réduisez la zone ou la période."
  ],
  "error.rateLimit": [
    "Limite de pedidos atingido. Aguarde antes de tentar novamente.",
    "Request limit reached. Wait before trying again.",
    "Se alcanzó el límite de solicitudes. Espere antes de volver a intentarlo.",
    "Limite de requêtes atteint. Patientez avant de réessayer."
  ],
  "error.geeReconnect": [
    "A ligação ao Google Earth Engine expirou. Volte a autenticar-se nas definições.",
    "The Google Earth Engine connection expired. Reconnect in Settings.",
    "La conexión a Google Earth Engine ha caducado. Vuelva a conectarse en Ajustes.",
    "La connexion Google Earth Engine a expiré. Reconnectez-vous dans les paramètres."
  ],
  "error.models": [
    "Não foi possível consultar os modelos.",
    "Could not retrieve the models.",
    "No se pudieron consultar los modelos.",
    "Impossible de consulter les modèles."
  ],
  "error.modelsEmpty": [
    "A chave não devolveu modelos compatíveis com texto e ferramentas.",
    "The key returned no compatible text-and-tool models.",
    "La clave no devolvió modelos compatibles con texto y herramientas.",
    "La clé n'a renvoyé aucun modèle compatible texte et outils."
  ],
  "error.modelsKey": [
    "Seleccione OpenAI ou Gemini e introduza a respectiva chave API.",
    "Select OpenAI or Gemini and enter the corresponding API key.",
    "Seleccione OpenAI o Gemini e introduzca su clave API.",
    "Sélectionnez OpenAI ou Gemini et saisissez la clé API correspondante."
  ],
  "error.modelsCount": [
    "modelos disponíveis nesta conta. A compatibilidade com ferramentas será verificada durante a execução.",
    "models available on this account. Tool support will be checked during execution.",
    "modelos disponibles en esta cuenta. La compatibilidad con herramientas se comprobará durante la ejecución.",
    "modèles disponibles sur ce compte. La prise en charge des outils sera vérifiée à l'exécution."
  ],
  "error.gaulfail": [
    "Não foi possível consultar as unidades administrativas FAO GAUL.",
    "Unable to retrieve FAO GAUL administrative units.",
    "No se pudieron consultar las unidades administrativas FAO GAUL.",
    "Impossible de consulter les unités administratives FAO GAUL."
  ],
  "error.gaulEmpty": [
    "Não foram devolvidas unidades administrativas FAO GAUL.",
    "No FAO GAUL administrative units were returned.",
    "No se devolvieron unidades administrativas FAO GAUL.",
    "Aucune unité administrative FAO GAUL n'a été renvoyée."
  ],
  "error.geology": [
    "Não foi possível obter a camada geológica.",
    "Unable to retrieve the geological layer.",
    "No se pudo obtener la capa geológica.",
    "Impossible de récupérer la couche géologique."
  ],
  "error.geologyInvalid": [
    "A camada geológica devolveu dados inválidos.",
    "The geological layer returned invalid data.",
    "La capa geológica devolvió datos no válidos.",
    "La couche géologique a renvoyé des données invalides."
  ],
  "error.geologyGeneralized": [
    "Camada geológica generalizada; as estatísticas foram calculadas nos polígonos originais.",
    "Generalized geology layer; statistics were calculated using the original polygons.",
    "Capa geológica generalizada; las estadísticas se calcularon con los polígonos originales.",
    "Couche géologique généralisée ; les statistiques ont été calculées sur les polygones d'origine."
  ],
  "error.visualization": [
    "Erro ao apresentar a camada no mapa.",
    "Unable to display the layer on the map.",
    "No se pudo mostrar la capa en el mapa.",
    "Impossible d'afficher la couche sur la carte."
  ],
  "error.runPrefix": [
    "Falha na execução do agente:",
    "Agent execution failed:",
    "Error al ejecutar el agente:",
    "Échec de l'exécution de l'agent :"
  ],
  "error.aborted": [
    "A operação foi interrompida ou excedeu 75 segundos. Reduza a área de estudo ou o período e tente novamente.",
    "The operation was stopped or exceeded 75 seconds. Try a smaller study area or date range.",
    "La operación se detuvo o superó los 75 segundos. Reduzca el área de estudio o el periodo.",
    "L'opération a été interrompue ou a dépassé 75 secondes. Réduisez la zone d'étude ou la période."
  ],
  "error.requestId": [
    "Código de diagnóstico:",
    "Diagnostic code:",
    "Código de diagnóstico:",
    "Code de diagnostic :"
  ],
  "agent.plan": [
    "Formulação do plano geoespacial",
    "Preparing geospatial analysis plan",
    "Preparando el plan de análisis geoespacial",
    "Préparation du plan d'analyse géospatiale"
  ],
  "agent.response": [
    "Resposta do agente",
    "Agent response",
    "Respuesta del agente",
    "Réponse de l'agent"
  ],
  "agent.completed": [
    "Concluído",
    "Completed",
    "Completado",
    "Terminé"
  ],
  "agent.dossier": [
    "Ver dossiê",
    "View dossier",
    "Ver expediente",
    "Voir le dossier"
  ],
  "agent.stopped": [
    "Interrompido pelo utilizador",
    "Stopped by user",
    "Detenido por el usuario",
    "Interrompu par l'utilisateur"
  ],
  "agent.noSummary": [
    "Não foi devolvida uma síntese. Consulte o dossiê de execução.",
    "No synthesis was returned. Check the execution dossier.",
    "No se devolvió una síntesis. Consulte el expediente de ejecución.",
    "Aucune synthèse n'a été renvoyée. Consultez le dossier d'exécution."
  ],
  "agent.mapWarning": [
    "Mapa geológico:",
    "Geological map:",
    "Mapa geológico:",
    "Carte géologique :"
  ],
  "agent.viewLayer": [
    "Ver camada",
    "View layer",
    "Ver capa",
    "Voir la couche"
  ],
  "agent.modelAuto": [
    "automático",
    "automatic",
    "automático",
    "automatique"
  ],
  "agent.offline": [
    "Heurística espacial (offline)",
    "Spatial heuristics (offline)",
    "Heurística espacial (sin conexión)",
    "Heuristique spatiale (hors ligne)"
  ],
  "agent.pdfTitle": [
    "GEOMOZ EXPLORER — RELATÓRIO DO AGENTE IA",
    "GEOMOZ EXPLORER — AI AGENT REPORT",
    "GEOMOZ EXPLORER — INFORME DEL AGENTE IA",
    "GEOMOZ EXPLORER — RAPPORT DE L'AGENT IA"
  ],
  "agent.pdfEngine": [
    "Motor IA:",
    "AI engine:",
    "Motor IA:",
    "Moteur IA :"
  ],
  "agent.pdfDate": [
    "Data:",
    "Date:",
    "Fecha:",
    "Date :"
  ],
  "agent.pdfArea": [
    "Área de estudo:",
    "Study area:",
    "Área de estudio:",
    "Zone d'étude :"
  ],
  "agent.pdfProject": [
    "Projecto:",
    "Project:",
    "Proyecto:",
    "Projet :"
  ],
  "agent.pdfUnassigned": [
    "Estudo independente",
    "Independent study",
    "Estudio independiente",
    "Étude indépendante"
  ],
  "agent.pdfLayers": [
    "Camadas geradas:",
    "Generated layers:",
    "Capas generadas:",
    "Couches générées :"
  ],
  "agent.pdfTrace": [
    "Rastreio da execução e ferramentas GIS:",
    "Execution trace and GIS tools:",
    "Seguimiento de ejecución y herramientas SIG:",
    "Traçabilité de l'exécution et outils SIG :"
  ],
  "agent.pdfSynthesis": [
    "Síntese técnica e diagnóstico geocientífico:",
    "Technical synthesis and geoscientific assessment:",
    "Síntesis técnica y diagnóstico geocientífico:",
    "Synthèse technique et diagnostic géoscientifique :"
  ],
  "agent.pdfFooter": [
    "GeoMoz AI Agent — documento gerado automaticamente para apoiar decisões técnicas.",
    "GeoMoz AI Agent — automatically generated document to support technical decisions.",
    "GeoMoz AI Agent — documento generado automáticamente para apoyar decisiones técnicas.",
    "GeoMoz AI Agent — document généré automatiquement pour appuyer les décisions techniques."
  ],
  "agent.pdfError": [
    "Não foi possível gerar o PDF.",
    "Could not generate the PDF.",
    "No se pudo generar el PDF.",
    "Impossible de générer le PDF."
  ],
  "dossier.title": [
    "Dossiê de geointeligência",
    "Geointelligence dossier",
    "Expediente de geointeligencia",
    "Dossier de géointelligence"
  ],
  "dossier.status.completed": [
    "Execução concluída",
    "Execution completed",
    "Ejecución completada",
    "Exécution terminée"
  ],
  "dossier.status.partial": [
    "Resultados parciais",
    "Partial results",
    "Resultados parciales",
    "Résultats partiels"
  ],
  "dossier.status.error": [
    "Execução com falhas",
    "Execution failed",
    "Ejecución con fallos",
    "Échec de l'exécution"
  ],
  "dossier.status.unverified": [
    "Resposta sem cálculo",
    "Response without computation",
    "Respuesta sin cálculo",
    "Réponse sans calcul"
  ],
  "dossier.status.needs_input": [
    "Faltam dados para analisar",
    "Missing input",
    "Faltan datos para analizar",
    "Données manquantes pour l'analyse"
  ],
  "dossier.status.reference": [
    "Consulta de fontes",
    "Source lookup",
    "Consulta de fuentes",
    "Consultation de sources"
  ],
  "dossier.noArea": [
    "Área não especificada",
    "Area not specified",
    "Área no especificada",
    "Zone non précisée"
  ],
  "dossier.completedTools": [
    "ferramentas analíticas concluídas",
    "analytical tools completed",
    "herramientas analíticas completadas",
    "outils analytiques terminés"
  ],
  "dossier.failedTools": [
    "falhas",
    "failures",
    "fallos",
    "échecs"
  ],
  "dossier.source": [
    "Fonte:",
    "Source:",
    "Fuente:",
    "Source :"
  ],
  "dossier.noSource": [
    "Não comunicada pela ferramenta",
    "Not provided by the tool",
    "No facilitada por la herramienta",
    "Non précisée par l'outil"
  ],
  "dossier.export": [
    "Exportar dossiê JSON",
    "Export JSON dossier",
    "Exportar expediente JSON",
    "Exporter le dossier JSON"
  ],
  "dossier.warning.incomplete": [
    "Há ferramentas sem resultado; a síntese não valida os indicadores em falta.",
    "Some tools returned no results; the synthesis does not validate missing indicators.",
    "Algunas herramientas no devolvieron resultados; la síntesis no valida los indicadores ausentes.",
    "Certains outils n'ont produit aucun résultat ; la synthèse ne valide pas les indicateurs manquants."
  ],
  "dossier.warning.unverified": [
    "Resposta sem execução de ferramentas analíticas; não constitui um resultado calculado.",
    "No analytical tools were executed; this is not a calculated result.",
    "No se ejecutaron herramientas analíticas; no es un resultado calculado.",
    "Aucun outil analytique n'a été exécuté ; ce n'est pas un résultat calculé."
  ],
  "dossier.warning.noSource": [
    "Algumas ferramentas não comunicam a fonte no resultado. Consulte a metodologia antes de reutilizar os valores.",
    "Some tools did not report sources. Check the methodology before reusing their values.",
    "Algunas herramientas no informaron de las fuentes. Revise la metodología antes de reutilizar los valores.",
    "Certains outils n'ont pas indiqué leurs sources. Consultez la méthode avant de réutiliser les valeurs."
  ],
  "dossier.warning.ahp": [
    "Favorabilidade é um modelo exploratório. A designação AHP exige matriz de comparação e razão de consistência verificadas.",
    "Favourability is exploratory; AHP requires a verified comparison matrix and consistency ratio.",
    "La favorabilidad es exploratoria; AHP requiere una matriz de comparación y una razón de consistencia verificadas.",
    "La favorabilité est exploratoire ; AHP nécessite une matrice de comparaison et un ratio de cohérence vérifiés."
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type AiDiagnosticKey = keyof typeof AI_DIAGNOSTIC_MESSAGES;
const INDICES: Record<PortalCatalogLocale,0|1|2|3> = {pt:0,en:1,es:2,fr:3};
export function aiDiagnosticText(language: string, key: AiDiagnosticKey): string {
  return AI_DIAGNOSTIC_MESSAGES[key][INDICES[resolvedPortalLocale(language)]];
}

const CODE_KEYS: Record<string, AiDiagnosticKey> = {
  gee_reconnect_required: "error.geeReconnect",
  invalid_area: "error.invalid",
  invalid_period: "error.invalid",
  rate_limit_exceeded: "error.rateLimit",
  quota_exceeded: "error.rateLimit",
  model_unavailable: "error.models",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Translate known machine-readable API failures; never expose arbitrary server error text or secrets. */
export function agentHttpError(language: string, status: number, detail: unknown, headerRequestId?: string | null): string {
  const response = record(detail);
  const code = typeof response?.code === "string" ? response.code : "";
  const statusKey: AiDiagnosticKey = CODE_KEYS[code] ??
    (status === 401 ? "error.unauthorized"
      : status === 403 ? "error.forbidden"
      : status === 400 || status === 422 ? "error.invalid"
      : status === 408 || status === 504 ? "error.timeout"
      : status === 429 ? "error.rateLimit"
      : status === 503 || status >= 500 ? "error.unavailable"
      : "error.generic");
  const rawRequestId = response?.request_id ?? headerRequestId;
  const requestId = typeof rawRequestId === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(rawRequestId)
    ? rawRequestId : null;
  const prefix = aiDiagnosticText(language, statusKey);
  return `HTTP ${status}: ${prefix}${requestId ? ` (${aiDiagnosticText(language, "error.requestId")} ${requestId})` : ""}`;
}

const WARNING_KEYS: Record<string, AiDiagnosticKey> = {
  "Há ferramentas sem resultado; a síntese não valida os indicadores em falta.": "dossier.warning.incomplete",
  "Resposta sem execução de ferramentas analíticas; não constitui um resultado calculado.": "dossier.warning.unverified",
  "Algumas ferramentas não comunicam a fonte no resultado. Consulte a metodologia antes de reutilizar os valores.": "dossier.warning.noSource",
  "Favorabilidade é um modelo exploratório. A designação AHP exige matriz de comparação e razão de consistência verificadas.": "dossier.warning.ahp",
};
/** Only translate known UI-level warnings. Unknown warnings, calculations and evidence remain verbatim. */
export function localizedAgentWarning(language: string, warning: string): string {
  const key = WARNING_KEYS[warning];
  return key ? aiDiagnosticText(language, key) : warning;
}
