import { apiFetch } from "./api";

/**
 * Small, reproducible test AOI in Maputo, not a claim about all of Mozambique.
 * The existing production /gee/index endpoint handles user-scoped Earth Engine
 * credentials, cloud masking, Sentinel-2 selection and actual NDVI processing.
 * Do not store or expose short-lived GEE tile URLs or OAuth tokens.
 */
export const MAPUTO_GEE_TEST_AOI = {
  type: "Polygon",
  coordinates: [[
    [32.565, -25.970],
    [32.605, -25.970],
    [32.605, -25.935],
    [32.565, -25.935],
    [32.565, -25.970],
  ]],
} as const;

export interface GeeNdviValidationResult {
  projectNote: string;
  sceneCount: number;
  dateRange: string;
  meanNdvi: number | null;
  message: string;
}

const TEST_REQUEST = {
  index: "ndvi",
  geometry: MAPUTO_GEE_TEST_AOI,
  start_date: "2025-05-01",
  end_date: "2025-09-01",
  cloud_pct: 65,
} as const;

export async function validateRealSentinel2Ndvi(): Promise<GeeNdviValidationResult> {
  // A fully live operation (count + pixel statistics + GEE map tiles) takes
  // longer than a /health check; bound the user-visible wait to 90 seconds.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await apiFetch("/geomoz-api/gee/index", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(TEST_REQUEST),
    });
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) {
      throw new Error("O servidor devolveu HTML em vez de um resultado JSON Earth Engine. Verifique o encaminhamento Firebase → Cloud Run.");
    }
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const detail = typeof data.detail === "string" ? data.detail : "O processamento NDVI falhou.";
      if (response.status === 401 || response.status === 403) {
        throw new Error(`É necessário ligar uma conta Earth Engine autorizada antes do teste. ${detail}`);
      }
      throw new Error(`Earth Engine respondeu HTTP ${response.status}: ${detail}`);
    }
    const scenes = Number(data.sceneCount);
    const tile = data.tileUrl || data.tile_url;
    if (!Number.isInteger(scenes) || scenes < 1 || typeof tile !== "string" || !tile.startsWith("https://")) {
      throw new Error("O processamento devolveu uma resposta incompleta: faltam cenas Sentinel-2 ou o mapa de NDVI.");
    }
    const stats = (data.stats && typeof data.stats === "object") ? data.stats as Record<string, unknown> : {};
    const value = stats.mean;
    const mean = typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1
      ? value : null;
    const range = typeof data.dateRange === "string" ? data.dateRange : "2025-05-01 → 2025-09-01";
    const note = "Maputo · Sentinel-2 SR Harmonized · NDVI B8/B4";
    return {
      projectNote: note,
      sceneCount: scenes,
      dateRange: range,
      meanNdvi: mean,
      message: mean === null
        ? `Processamento real concluído: ${scenes} cenas e mapa NDVI gerado. As estatísticas não ficaram disponíveis; valide-as no GIS Workspace.`
        : `Processamento real concluído: ${scenes} cenas Sentinel-2, média NDVI de ${mean.toFixed(3)} numa área de teste em Maputo.`,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("O teste NDVI excedeu 90 segundos. Verifique o Cloud Run, a quota Earth Engine ou tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
