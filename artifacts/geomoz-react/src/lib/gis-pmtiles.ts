/**
 * PMTiles runtime for the GeoMoz GIS Workspace.
 *
 * Uses Protomaps' pmtiles protocol so remote archives are read with HTTP Range
 * instead of downloaded in full.
 */
import * as maplibregl from "maplibre-gl";
import { PMTiles, Protocol, TileType } from "pmtiles";

export interface GISPMTilesInfo {
  tileType: "vector" | "raster";
  encoding?: "mvt" | "mlt";
  sourceLayers: string[];
  bounds: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
}

const GLOBAL_PROTOCOL_KEY = "__geomozPmtilesProtocol";
const GLOBAL_ARCHIVE_KEY = "__geomozPmtilesArchives";

function sharedProtocol(): Protocol {
  const scope = globalThis as typeof globalThis & {
    [GLOBAL_PROTOCOL_KEY]?: Protocol;
  };
  if (!scope[GLOBAL_PROTOCOL_KEY]) {
    scope[GLOBAL_PROTOCOL_KEY] = new Protocol();
    maplibregl.addProtocol("pmtiles", scope[GLOBAL_PROTOCOL_KEY]!.tile);
  }
  return scope[GLOBAL_PROTOCOL_KEY]!;
}

function registeredArchives(): Set<string> {
  const scope = globalThis as typeof globalThis & {
    [GLOBAL_ARCHIVE_KEY]?: Set<string>;
  };
  if (!scope[GLOBAL_ARCHIVE_KEY]) scope[GLOBAL_ARCHIVE_KEY] = new Set<string>();
  return scope[GLOBAL_ARCHIVE_KEY]!;
}

export function normalizePMTilesUrl(url: string): string {
  return url.startsWith("pmtiles://") ? url : `pmtiles://${url}`;
}

export function stripPMTilesUrl(url: string): string {
  return url.startsWith("pmtiles://") ? url.slice("pmtiles://".length) : url;
}

export function ensureRemotePMTiles(url: string): void {
  const bare = stripPMTilesUrl(url);
  const protocol = sharedProtocol();
  const known = registeredArchives();
  if (!known.has(bare)) {
    protocol.add(new PMTiles(bare));
    known.add(bare);
  }
}

export async function inspectRemotePMTiles(
  urlValue: string
): Promise<GISPMTilesInfo> {
  const bare = stripPMTilesUrl(urlValue.trim());
  const url = new URL(bare);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("PMTiles remoto requer HTTP ou HTTPS.");
  }

  const archive = new PMTiles(url.toString());
  const header = await archive.getHeader();
  const tileType =
    header.tileType === TileType.Mvt || header.tileType === TileType.Mlt
      ? "vector"
      : "raster";
  let sourceLayers: string[] = [];
  if (tileType === "vector") {
    try {
      const metadata = (await archive.getMetadata()) as {
        vector_layers?: Array<{ id?: unknown }>;
      };
      sourceLayers = (metadata.vector_layers ?? [])
        .map((layer) => layer.id)
        .filter(
          (id): id is string => typeof id === "string" && id.length > 0
        );
    } catch {
      // Metadata is optional; UI can accept source layer names manually.
    }
  }

  ensureRemotePMTiles(url.toString());

  return {
    tileType,
    ...(header.tileType === TileType.Mlt ? { encoding: "mlt" as const } : {}),
    sourceLayers,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
  };
}
