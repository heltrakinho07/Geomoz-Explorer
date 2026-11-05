/** Collect server-verified map actions so that successful analyses never
 * silently disappear when an orchestrator omits the top-level action list.
 * The synthesis and audit dossier are not trusted sources of tile URLs.
 */
export type GeoAiMapAction = Record<string, unknown> & {
  type: string;
  id?: string;
  tileUrl?: string;
  name?: string;
};

function isAction(value: unknown): value is GeoAiMapAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (action.type === "ADD_LAYER") return typeof action.tileUrl === "string" && action.tileUrl.length > 0;
  if (action.type === "ADD_GEOJSON_LAYER") return action.id === "agent_geology";
  if (action.type === "SET_AOI") return typeof action.province === "string" && action.province.length > 0;
  return false;
}

export function collectGeoAiMapActions(payload: { map_actions?: unknown; runs?: unknown }): GeoAiMapAction[] {
  const actions: GeoAiMapAction[] = [];
  const seen = new Set<string>();
  const append = (value: unknown) => {
    if (!isAction(value)) return;
    const key = `${value.type}:${value.id ?? value.tileUrl ?? value.province ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    actions.push(value);
  };
  if (Array.isArray(payload.map_actions)) payload.map_actions.forEach(append);
  if (Array.isArray(payload.runs)) {
    for (const run of payload.runs) {
      if (!run || typeof run !== "object") continue;
      const output = (run as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const result = output as Record<string, unknown>;
      if (result.status !== "success" || result.error) continue;
      append(result.map_action);
    }
  }
  return actions;
}
