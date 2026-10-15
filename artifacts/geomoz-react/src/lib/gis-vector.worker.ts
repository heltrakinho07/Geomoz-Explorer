import { executeGISVectorCommand, type GISVectorParameters } from "./gis-vector-engine";
import type { FeatureCollection } from "geojson";

type Request = {
  id: string;
  tool: string;
  input: FeatureCollection;
  overlay?: FeatureCollection;
  parameters: GISVectorParameters;
};

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!request || typeof request.id !== "string") return;
  try {
    const response = executeGISVectorCommand(
      request.tool, request.input, request.parameters, request.overlay,
    );
    self.postMessage({ id: request.id, status: "success", response });
  } catch (cause) {
    self.postMessage({
      id: request.id, status: "error",
      error: cause instanceof Error ? cause.message : "Falha no processamento vectorial.",
    });
  }
};
