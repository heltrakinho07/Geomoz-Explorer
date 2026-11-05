/** Reviewed GeoMoz AI Agent UI copy, preserving request bodies and scientific identifiers. */
import { resolvedPortalLocale, type PortalCatalogLocale } from "./portal";
export const AI_AGENT_MESSAGES = {
  "settings.tooltip": [
    "Configurar chaves OpenAI e Gemini",
    "Configure OpenAI and Gemini keys",
    "Configurar claves de OpenAI y Gemini",
    "Configurer les clés OpenAI et Gemini"
  ],
  "export.tooltip": [
    "Exportar último resultado em PDF",
    "Export latest result as PDF",
    "Exportar último resultado en PDF",
    "Exporter le dernier résultat en PDF"
  ],
  "history.clear": [
    "Limpar histórico de mensagens",
    "Clear message history",
    "Borrar historial de mensajes",
    "Effacer l'historique des messages"
  ],
  "studyArea": [
    "Área de estudo:",
    "Study area:",
    "Área de estudio:",
    "Zone d'étude :"
  ],
  "studyArea.open": [
    "Alterar área",
    "Change area",
    "Cambiar área",
    "Changer de zone"
  ],
  "studyArea.close": [
    "Fechar selector",
    "Close selector",
    "Cerrar selector",
    "Fermer le sélecteur"
  ],
  "studyArea.default": [
    "Moçambique (geral)",
    "Mozambique (all)",
    "Mozambique (general)",
    "Mozambique (ensemble)"
  ],
  "project": [
    "Projecto:",
    "Project:",
    "Proyecto:",
    "Projet :"
  ],
  "studyArea.effective": [
    "Área efectiva da consulta:",
    "Effective query area:",
    "Área efectiva de consulta:",
    "Zone effective de la requête :"
  ],
  "studyArea.apply": [
    "Usar esta área no mapa",
    "Use this area on the map",
    "Usar esta área en el mapa",
    "Utiliser cette zone sur la carte"
  ],
  "studyArea.country": [
    "País para análise mundial",
    "Country for global analysis",
    "País para análisis mundial",
    "Pays pour l'analyse mondiale"
  ],
  "studyArea.countryChoose": [
    "Escolher país",
    "Choose country",
    "Elegir país",
    "Choisir un pays"
  ],
  "studyArea.bounds": [
    "Fonte dos limites administrativos",
    "Administrative boundary source",
    "Fuente de límites administrativos",
    "Source des limites administratives"
  ],
  "studyArea.allDistricts": [
    "Todos os distritos",
    "All districts",
    "Todos los distritos",
    "Tous les districts"
  ],
  "settings.heading": [
    "Configurar motores de inteligência artificial",
    "Configure AI engines",
    "Configurar motores de inteligencia artificial",
    "Configurer les moteurs d'intelligence artificielle"
  ],
  "settings.openai": [
    "Chave API OpenAI (sk-...)",
    "OpenAI API key (sk-...)",
    "Clave API OpenAI (sk-...)",
    "Clé API OpenAI (sk-...)"
  ],
  "settings.gemini": [
    "Chave API Gemini (Google AI Studio)",
    "Gemini API key (Google AI Studio)",
    "Clave API Gemini (Google AI Studio)",
    "Clé API Gemini (Google AI Studio)"
  ],
  "settings.provider": [
    "Fornecedor preferencial",
    "Preferred provider",
    "Proveedor preferido",
    "Fournisseur préféré"
  ],
  "settings.providerAuto": [
    "Automático (detecção)",
    "Automatic (detection)",
    "Automático (detección)",
    "Automatique (détection)"
  ],
  "settings.model": [
    "Modelo compatível",
    "Compatible model",
    "Modelo compatible",
    "Modèle compatible"
  ],
  "settings.modelsLoading": [
    "A consultar modelos…",
    "Checking models…",
    "Consultando modelos…",
    "Consultation des modèles…"
  ],
  "settings.modelsRefresh": [
    "Consultar modelos disponíveis na minha API",
    "Check models available through my API",
    "Consultar modelos disponibles en mi API",
    "Consulter les modèles disponibles via mon API"
  ],
  "settings.cancel": [
    "Cancelar",
    "Cancel",
    "Cancelar",
    "Annuler"
  ],
  "settings.save": [
    "Guardar definições",
    "Save settings",
    "Guardar ajustes",
    "Enregistrer les paramètres"
  ],
  "chat.log": [
    "Conversa com GeoMoz AI",
    "GeoMoz AI conversation",
    "Conversación con GeoMoz AI",
    "Conversation avec GeoMoz AI"
  ],
  "chat.heading": [
    "O que quer analisar?",
    "What would you like to analyse?",
    "¿Qué desea analizar?",
    "Que souhaitez-vous analyser ?"
  ],
  "chat.explanation": [
    "Escolha a área no cabeçalho e descreva a análise. Os resultados aparecem no mapa e cada resposta inclui fontes e limitações.",
    "Choose the area in the header and describe your analysis. Results appear on the map, and each response includes sources and limitations.",
    "Elija el área en el encabezado y describa el análisis. Los resultados aparecen en el mapa y cada respuesta incluye fuentes y limitaciones.",
    "Choisissez la zone dans l'en-tête et décrivez l'analyse. Les résultats apparaissent sur la carte et chaque réponse inclut les sources et les limites."
  ],
  "chat.tools": [
    "Ferramentas executadas:",
    "Tools executed:",
    "Herramientas ejecutadas:",
    "Outils exécutés :"
  ],
  "chat.running": [
    "A executar a análise…",
    "Running analysis…",
    "Ejecutando análisis…",
    "Exécution de l'analyse…"
  ],
  "chat.stopTooltip": [
    "Interromper a execução em curso",
    "Stop current execution",
    "Detener la ejecución actual",
    "Arrêter l'exécution en cours"
  ],
  "chat.cancel": [
    "Cancelar",
    "Cancel",
    "Cancelar",
    "Annuler"
  ],
  "chat.advanced": [
    "Período e ferramentas de análise",
    "Analysis period and tools",
    "Periodo y herramientas de análisis",
    "Période et outils d'analyse"
  ],
  "chat.start": [
    "Data inicial",
    "Start date",
    "Fecha de inicio",
    "Date de début"
  ],
  "chat.end": [
    "Data final (exclusiva)",
    "End date (exclusive)",
    "Fecha final (exclusiva)",
    "Date de fin (exclusive)"
  ],
  "chat.message": [
    "Mensagem para GeoMoz AI",
    "Message to GeoMoz AI",
    "Mensaje para GeoMoz AI",
    "Message pour GeoMoz AI"
  ],
  "chat.placeholder": [
    "Descreva a análise que pretende…",
    "Describe the analysis you want…",
    "Describa el análisis que desea…",
    "Décrivez l'analyse souhaitée…"
  ],
  "chat.send": [
    "Enviar mensagem",
    "Send message",
    "Enviar mensaje",
    "Envoyer le message"
  ],
  "chat.exampleNdvi": [
    "Calcular estatísticas zonais de NDVI entre 2025-05-01 e 2025-09-01",
    "Calculate zonal NDVI statistics from 2025-05-01 to 2025-09-01",
    "Calcular estadísticas zonales de NDVI entre 2025-05-01 y 2025-09-01",
    "Calculer les statistiques zonales du NDVI du 2025-05-01 au 2025-09-01"
  ],
  "chat.exampleLandcover": [
    "Mapear a cobertura do solo com WorldCover",
    "Map land cover using WorldCover",
    "Cartografiar la cobertura del suelo con WorldCover",
    "Cartographier l'occupation du sol avec WorldCover"
  ],
  "chat.exampleCompare": [
    "Comparar NDVI entre 2020 e 2025",
    "Compare NDVI between 2020 and 2025",
    "Comparar NDVI entre 2020 y 2025",
    "Comparer le NDVI entre 2020 et 2025"
  ],
  "chat.examplePrecip": [
    "Calcular a precipitação acumulada ERA5-Land em 2025",
    "Calculate cumulative ERA5-Land precipitation in 2025",
    "Calcular la precipitación acumulada ERA5-Land en 2025",
    "Calculer les précipitations cumulées ERA5-Land en 2025"
  ],
  "map.significant": ["Mudanças ≥ limiar", "Threshold changes", "Cambios ≥ umbral", "Changements ≥ seuil"],
  "map.continuous": ["Diferença contínua", "Continuous difference", "Diferencia continua", "Différence continue"],
  "map.swipe": ["Comparar A/B", "Swipe A/B", "Comparar A/B", "Comparer A/B"],
  "map.swipePosition": ["Separador da comparação A/B", "A/B comparison divider", "Divisor de comparación A/B", "Séparateur de comparaison A/B"],
  "map.before": ["Período A", "Period A", "Periodo A", "Période A"],
  "map.after": ["Período B", "Period B", "Periodo B", "Période B"],
  "map.swipeNote": ["Mova o separador para comparar os dois mosaicos de satélite com a mesma escala e pixels válidos comuns.", "Move the divider to compare both satellite mosaics on the same scale and common valid pixels.", "Mueva el divisor para comparar ambos mosaicos con la misma escala y píxeles válidos comunes.", "Déplacez le séparateur pour comparer les deux mosaïques à la même échelle et aux pixels valides communs."],
  "temporal.title": ["Análise temporal avançada","Advanced temporal analysis","Análisis temporal avanzado","Analyse temporelle avancée"],
  "temporal.quality": ["Qualidade da comparação","Comparison quality","Calidad de la comparación","Qualité de la comparaison"],
  "temporal.aligned": ["Épocas do calendário equivalentes","Comparable calendar windows","Ventanas del calendario equivalentes","Fenêtres calendaires comparables"],
  "temporal.review": ["Rever sazonalidade","Review seasonality","Revisar estacionalidad","Vérifier la saisonnalité"],
  "temporal.scenes": ["Cenas","Scenes","Escenas","Scènes"],
  "temporal.coverage": ["Cobertura comum válida","Common valid coverage","Cobertura válida común","Couverture valide commune"],
  "temporal.days": ["Dias","Days","Días","Jours"],
  "temporal.histograms": ["Calcular histogramas GEE","Compute GEE histograms","Calcular histogramas GEE","Calculer les histogrammes GEE"],
  "temporal.geotiff": ["Preparar GeoTIFF A/B/Δ","Prepare A/B/Δ GeoTIFF","Preparar GeoTIFF A/B/Δ","Préparer GeoTIFF A/B/Δ"],
  "temporal.png": ["Mapa PNG","PNG map","Mapa PNG","Carte PNG"],
  "temporal.pdf": ["Relatório PDF","PDF report","Informe PDF","Rapport PDF"],
  "temporal.selectSeries": ["Seleccionar série","Select series","Seleccionar serie","Choisir la série"],
  "temporal.noPixels": ["Sem pixels válidos nesta distribuição.","No valid pixels in this distribution.","Sin píxeles válidos en esta distribución.","Aucun pixel valide dans cette distribution."],
  "temporal.requestError": ["Erro na análise temporal.","Temporal analysis failed.","Error en el análisis temporal.","Erreur d'analyse temporelle."],
  "temporal.badHist": ["O Earth Engine devolveu histogramas inválidos.","Earth Engine returned invalid histograms.","Earth Engine devolvió histogramas no válidos.","Earth Engine a renvoyé des histogrammes invalides."],
  "temporal.badExport": ["O URL de exportação não é seguro.","The export URL is not secure.","La URL de exportación no es segura.","L'URL d'export n'est pas sécurisée."],
  "temporal.downloadReady": ["Descarregar GeoTIFF (URL temporário)","Download GeoTIFF (temporary URL)","Descargar GeoTIFF (URL temporal)","Télécharger GeoTIFF (URL temporaire)"],
  "temporal.adjusted": ["Resolução ajustada para respeitar o limite de download","Resolution adjusted to meet download limit","Resolución ajustada para respetar el límite de descarga","Résolution ajustée à la limite de téléchargement"],
  "temporal.noMap": ["Não existe mapa temporal para exportar.","No temporal map available to export.","No hay mapa temporal para exportar.","Aucune carte temporelle à exporter."],
  "temporal.pngError": ["Não foi possível capturar o mapa (verifique CORS ou tiles).","Could not capture the map (check CORS or tiles).","No fue posible capturar el mapa (compruebe CORS o mosaicos).","Impossible de capturer la carte (vérifier CORS ou les tuiles)."],
  "temporal.seasonWarning": ["As épocas dos dois períodos diferem; a sazonalidade pode influenciar ΔNDVI.","The periods cover different seasons; seasonality may affect ΔNDVI.","Los periodos abarcan estaciones distintas; la estacionalidad puede afectar ΔNDVI.","Les périodes couvrent des saisons différentes; la saisonnalité peut affecter ΔNDVI."],
  "temporal.sceneWarning": ["O número de cenas difere mais de duas vezes entre períodos.","The scene count differs by more than a factor of two.","El número de escenas difiere por más de un factor de dos.","Le nombre de scènes diffère d'un facteur supérieur à deux."],
  "temporal.coverageWarning": ["Menos de 70% da AOI tem dados válidos comuns.","Less than 70% of the AOI has common valid observations.","Menos del 70% del área tiene observaciones válidas comunes.","Moins de 70 % de la zone possède des observations valides communes."],
  "temporal.qualityNote": ["Calendário semelhante não garante fenologia ou condições meteorológicas equivalentes.","Matching calendar windows do not guarantee matched phenology or weather.","Ventanas del mismo calendario no garantizan la misma fenología ni meteorología.","Des périodes calendaires semblables ne garantissent pas la même phénologie ni météo."],
  "temporal.pixelCount": ["Contagens ponderadas de pixels; não representam áreas cadastrais.","Weighted pixel counts; not cadastral areas.","Conteos ponderados de píxeles; no son superficies catastrales.","Comptages de pixels pondérés ; pas des surfaces cadastrales."],
  "map.savedTitle": ["Comparações guardadas", "Saved comparisons", "Comparaciones guardadas", "Comparaisons enregistrées"],
  "map.replay": ["Reexecutar", "Run again", "Volver a ejecutar", "Relancer"],
  "map.saveError": ["A análise está no mapa, mas não foi possível guardá-la no projecto.", "Analysis is on the map but could not be saved to the project.", "El análisis está en el mapa, pero no se pudo guardar en el proyecto.", "L'analyse est sur la carte mais n'a pas pu être enregistrée dans le projet."],
  "map.pixelHeading": ["Consultar pixel", "Inspect pixel", "Consultar píxel", "Inspecter un pixel"],
  "map.pixelPrompt": ["Clique num ponto do mapa para consultar valores reais.", "Click a map location to read real values.", "Pulse un punto del mapa para consultar valores reales.", "Cliquez sur la carte pour lire les valeurs réelles."],
  "map.pixelClose": ["Fechar consulta de pixel", "Close pixel inspector", "Cerrar consulta de píxel", "Fermer l'inspection du pixel"],
  "map.pixelLoading": ["A consultar os valores do Earth Engine…", "Reading Earth Engine values…", "Consultando valores de Earth Engine…", "Lecture des valeurs Earth Engine…"],
  "map.pixelError": ["Falha na consulta do pixel.", "Pixel lookup failed.", "Error al consultar el píxel.", "Échec de la lecture du pixel."],
  "map.pixelNoData": ["Sem dados comuns válidos neste pixel.", "No common valid data at this pixel.", "Sin datos válidos comunes en este píxel.", "Aucune donnée valide commune pour ce pixel."],
  "map.pixelIncrease": ["Aumento acima do limiar", "Increase beyond threshold", "Aumento superior al umbral", "Augmentation au-delà du seuil"],
  "map.pixelDecrease": ["Diminuição abaixo do limiar", "Decrease beyond threshold", "Disminución por debajo del umbral", "Diminution au-delà du seuil"],
  "map.pixelStable": ["Alteração inferior ao limiar", "Change below threshold", "Cambio inferior al umbral", "Variation inférieure au seuil"],
  "map.noLayer": ["A análise terminou, mas não foi devolvida uma camada cartográfica válida. Repita a comparação.", "The analysis finished, but no valid map layer was returned. Run the comparison again.", "El análisis terminó, pero no se devolvió una capa cartográfica válida. Repita la comparación.", "L'analyse est terminée, mais aucune couche valide n'a été renvoyée. Relancez la comparaison."],
  "map.tileError": ["O mosaico não pôde ser carregado no mapa. Verifique a sessão Earth Engine e volte a executar a análise.", "The raster tile could not load. Check your Earth Engine session and rerun the analysis.", "No se pudo cargar el mosaico. Compruebe su sesión de Earth Engine y repita el análisis.", "La tuile raster n'a pas pu être chargée. Vérifiez votre session Earth Engine et relancez l'analyse."],
  "chat.exampleGeology": [
    "Quais são as principais litologias de Manica?",
    "What are the main lithologies in Manica?",
    "¿Cuáles son las principales litologías de Manica?",
    "Quelles sont les principales lithologies de Manica ?"
  ]
} as const satisfies Record<string, readonly [string,string,string,string]>;
export type AiAgentCopyKey = keyof typeof AI_AGENT_MESSAGES;
const INDICES: Record<PortalCatalogLocale,0|1|2|3> = {pt:0,en:1,es:2,fr:3};
export function aiAgentText(language:string,key:AiAgentCopyKey):string{
  return AI_AGENT_MESSAGES[key][INDICES[resolvedPortalLocale(language)]];
}
