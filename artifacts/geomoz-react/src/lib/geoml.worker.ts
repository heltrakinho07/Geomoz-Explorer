/**
 * GeoMoz ML WebWorker — runs K-Means clustering off the main thread
 * so the UI stays responsive during computation.
 *
 * Vite inlines this worker as a separate chunk (type: module).
 */

import { kmeans, normalize } from "./geoml";

interface WorkerInput {
  type: "kmeans";
  data: number[][];
  k: number;
  maxIter: number;
  seed: number;
}

interface WorkerOutput {
  type: "kmeans-result";
  labels: number[];
  centroids: number[][];
  inertia: number;
  iterations: number;
  silhouette: number;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { type, data, k, maxIter, seed } = e.data;

  if (type !== "kmeans") {
    self.postMessage({ type: "error", message: `Unknown command: ${type}` });
    return;
  }

  try {
    const { data: norm } = normalize(data);
    const result = kmeans(norm, k, maxIter, seed);

    const output: WorkerOutput = {
      type: "kmeans-result",
      labels: result.labels,
      centroids: result.centroids,
      inertia: result.inertia,
      iterations: result.iterations,
      silhouette: result.silhouette,
    };

    self.postMessage(output);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
