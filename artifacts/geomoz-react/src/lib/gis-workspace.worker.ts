/**
 * GeoMoz processing worker. Follows GeoLibre's "protocol -> worker -> result"
 * isolation model and RustGIS's command-oriented, UI-independent engine.
 * No network access, no eval, no hidden server submission.
 */
import { executeWorkspaceOperation, type WorkspaceOperationId, type WorkspaceParameters } from "./gis-workspace-engine";
import type { FeatureCollection } from "geojson";

interface Request {
  id: string;
  command: WorkspaceOperationId;
  input: FeatureCollection;
  overlay?: FeatureCollection;
  parameters: WorkspaceParameters;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!request || typeof request.id !== "string") return;
  try {
    const result = executeWorkspaceOperation(
      request.command, request.input, request.overlay, request.parameters,
    );
    self.postMessage({ id: request.id, status: "success", result });
  } catch (cause) {
    self.postMessage({
      id: request.id,
      status: "error",
      error: cause instanceof Error ? cause.message : "Erro inesperado de geoprocessamento.",
    });
  }
};
