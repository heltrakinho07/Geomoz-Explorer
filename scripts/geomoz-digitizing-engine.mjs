/** Source patches for GeoMoz digitizing integrated into pinned Geoman source. */
function once(source, from, to, label) {
  if (source.split(from).length !== 2) throw Error("GeoMoz digitizing source drift: " + label);
  return source.replace(from, to);
}
export function patchGeoMozDigitizingEngine(input) {
  let source=input;
  const bridge="\n/** Staged attributes remain private until the selected layer edit is saved. */\nconst geomozDigitizedAttributes = new Map<string, Record<string, string | number | null>>();\nlet geomozDigitizingListenersInstalled = false;\nlet geomozAppliedSnapKey = \"\";\nfunction geomozFeatureKey(feature: Feature): string {\n  const id = feature.properties?.__gm_id ?? feature.id;\n  return id == null ? \"\" : String(id);\n}\nfunction geomozClearDigitizingAttributes(layerId: string) {\n  for (const key of geomozDigitizedAttributes.keys()) {\n    if (key.startsWith(layerId + \"|\")) geomozDigitizedAttributes.delete(key);\n  }\n}\nfunction geomozSaveAttributeDraft(event: Event) {\n  const value = (event as CustomEvent<{\n    layerId: string; featureKey: string;\n    attributes: Record<string, string | number | null>;\n  }>).detail;\n  if (!editTargetLayerId || value?.layerId !== editTargetLayerId || !value.featureKey) return;\n  geomozDigitizedAttributes.set(value.layerId + \"|\" + value.featureKey, { ...value.attributes });\n}\nfunction geomozDrawOnSelectedLayer(event: Event) {\n  const value = (event as CustomEvent<{layerId: string; mode: string}>).detail;\n  if (!value || value.layerId !== editTargetLayerId || !geomanInstance) return;\n  const mode = value.mode;\n  if (mode !== \"marker\" && mode !== \"line\" && mode !== \"polygon\") return;\n  const layer = useAppStore.getState().layers.find(l => l.id === editTargetLayerId);\n  const expected = layer?.metadata.geomozGeometryType;\n  if (expected && ({ marker: \"Point\", line: \"LineString\", polygon: \"Polygon\" } as Record<string, string>)[mode] !== expected) return;\n  void geomanInstance.enableDraw(mode).catch(error => console.error(\"GeoMoz drawing tool failed\", error));\n}\nfunction geomozSetSnapping(event: Event) {\n  const value = (event as CustomEvent<{layerId: string; enabled: boolean; distance: number}>).detail;\n  if (!value || value.layerId !== editTargetLayerId || !geomanInstance) return;\n  const distance = Math.round(value.distance);\n  if (!Number.isFinite(distance) || distance < 2 || distance > 40) return;\n  const key = value.layerId + \"|\" + value.enabled + \"|\" + distance;\n  if (geomozAppliedSnapKey === key) return;\n  geomozAppliedSnapKey = key;\n  geomanInstance.options.settings.snapDistance = distance;\n  const mode = value.enabled ? geomanInstance.options.enableMode(\"helper\", \"snapping\") :\n    geomanInstance.options.disableMode(\"helper\", \"snapping\");\n  void Promise.resolve(mode).catch(error => console.warn(\"GeoMoz snapping settings failed\", error));\n}\nfunction geomozLeaveDigitizingTask(event: Event) {\n  const task=(event as CustomEvent<string>).detail;\n  if (task===\"map\" || !editTargetLayerId || !geomanInstance) return;\n  // Keep the unsaved layer session, but never keep a drawing gesture active\n  // after changing to Raster / Dados / Análise / Resultados.\n  void geomanInstance.disableDraw().catch(error => console.warn(\"GeoMoz: cannot suspend digitizing\",error));\n}\nfunction geomozBindDigitizingEvents() {\n  if (geomozDigitizingListenersInstalled) return;\n  window.addEventListener(\"geomoz:task\", geomozLeaveDigitizingTask);\n  window.addEventListener(\"geomoz:digitizing-start-draw\", geomozDrawOnSelectedLayer);\n  window.addEventListener(\"geomoz:digitizing-snap\", geomozSetSnapping);\n  window.addEventListener(\"geomoz:digitizing-attributes-save\", geomozSaveAttributeDraft);\n  geomozDigitizingListenersInstalled = true;\n}\nfunction geomozUnbindDigitizingEvents() {\n  if (!geomozDigitizingListenersInstalled) return;\n  window.removeEventListener(\"geomoz:task\", geomozLeaveDigitizingTask);\n  window.removeEventListener(\"geomoz:digitizing-start-draw\", geomozDrawOnSelectedLayer);\n  window.removeEventListener(\"geomoz:digitizing-snap\", geomozSetSnapping);\n  window.removeEventListener(\"geomoz:digitizing-attributes-save\", geomozSaveAttributeDraft);\n  geomozDigitizingListenersInstalled = false;\n  geomozDigitizedAttributes.clear();\n  geomozAppliedSnapKey = \"\";\n}\n";
  source=once(source, "export const maplibreGeoEditorPlugin: GeoLibrePlugin = {", bridge + "\nexport const maplibreGeoEditorPlugin: GeoLibrePlugin = {", "editor event bridge");
  source=once(source, "  pluginActive = true;\n  appApi = app;", "  pluginActive = true;\n  appApi = app;\n  geomozBindDigitizingEvents();", "bind events");
  source=once(source, "    unbindGeomanEditSync();", "    unbindGeomanEditSync();\n    geomozUnbindDigitizingEvents();", "unbind events");
  source=once(source,
    "        if (isGeometryEditSession || !GEOMOZ_ROLLOUT.advancedDrawing) geoEditorControl?.closeAttributeEditor();",
    [
      "        if (isGeometryEditSession || !GEOMOZ_ROLLOUT.advancedDrawing) geoEditorControl?.closeAttributeEditor();",
      "        if (isGeometryEditSession && editTargetLayerId && feature.geometry) {",
      "          const featureKey = geomozFeatureKey(feature);",
      "          if (featureKey) window.dispatchEvent(new CustomEvent(\"geomoz:digitizing-feature-created\", {",
      "            detail: { layerId: editTargetLayerId, featureKey, geometryType: feature.geometry.type },",
      "          }));",
      "        }",
    ].join("\n"),
    "open attribute form after each new feature");
  source=once(source,
    '  applySketchesMapDisplay();\n  notifyGeometryEdit();\n  return true;\n}',
    '  // Entering a selected-layer edit session must not retain a Sketches popup.\n  geoEditorControl?.closeAttributeEditor();\n  applySketchesMapDisplay();\n  notifyGeometryEdit();\n  return true;\n}',
    "clear stale native Sketches property editor before selected layer edit");
  source=once(source,
    "  // Flush sketches to the store, stash them out of the editor, and restore the",
    "  geomozClearDigitizingAttributes(layerId);\n\n  // Flush sketches to the store, stash them out of the editor, and restore the",
    "clear drafts at session start");
  source=once(source,
    '    await geoEditorControl.loadGeoJson(tagged, SKETCHES_SOURCE_PATH);\n    loaded = true;',
    '    // An empty newly-created QGIS-style layer has no features to import.\n    // The editor is already empty after clearing Sketches, so entering edit\n    // mode must not fail because Geoman rejects empty GeoJSON imports.\n    if (tagged.features.length) await geoEditorControl.loadGeoJson(tagged, SKETCHES_SOURCE_PATH);\n    loaded = true;',
    "allow edit sessions for newly created empty vector layers");
  source=once(source,
    "  pushingSketchesToStore = true;\n  try {\n    store.updateLayer(editTargetLayerId, {\n      geojson: edited,",
    [
      "  const withAttributes: FeatureCollection = {",
      "    ...edited,",
      "    features: edited.features.map((feature, index) => {",
      "      const key = geomozFeatureKey(tagged.features[index]);",
      "      const attributes = geomozDigitizedAttributes.get(editTargetLayerId + \"|\" + key);",
      "      return attributes ? { ...feature, properties: { ...(feature.properties ?? {}), ...attributes } } : feature;",
      "    }),",
      "  };",
      "  pushingSketchesToStore = true;",
      "  try {",
      "    store.updateLayer(editTargetLayerId, {",
      "      geojson: withAttributes,",
    ].join("\n"),
    "save attributes with original geometry and IDs");
  source=once(source, "  writeBackToVectorSource(layer, edited);",
    "  writeBackToVectorSource(layer, withAttributes);", "update native vector source");
  source=once(source,
    "    lastGeometryEditEnd = { layerId: targetId, saved };\n    editTargetLayerId = null;",
    "    lastGeometryEditEnd = { layerId: targetId, saved };\n    geomozClearDigitizingAttributes(targetId);\n    editTargetLayerId = null;",
    "clear saved/discarded drafts");
  return source;
}
