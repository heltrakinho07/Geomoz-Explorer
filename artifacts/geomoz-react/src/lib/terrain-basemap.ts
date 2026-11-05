import { useEffect, useState } from "react";
import type { Map, StyleSpecification } from "maplibre-gl";

export type Basemap = "satellite" | "topographic" | "streets";
export const BASEMAPS: Record<Basemap, { label: string; url: string; attribution: string }> = {
  satellite: {
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
  topographic: {
    label: "Topográfico",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri and contributors",
  },
  streets: {
    label: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
};

export const TERRAIN_EXAGGERATION_PRESETS = [1, 2, 3, 5, 10] as const;

export function terrainBasemapStyle(active: Basemap): StyleSpecification {
  const keys = Object.keys(BASEMAPS) as Basemap[];
  return {
    version: 8,
    sources: Object.fromEntries(keys.map(key => [key, {
      type: "raster", tiles: [BASEMAPS[key].url], tileSize: 256,
      maxzoom: 19, attribution: BASEMAPS[key].attribution,
    }])),
    layers: keys.map(key => ({
      id: "terrain-base-" + key, type: "raster", source: key,
      layout: { visibility: key === active ? "visible" : "none" },
    })),
  };
}

export function selectTerrainBasemap(map: Map, active: Basemap) {
  for (const key of Object.keys(BASEMAPS)) {
    const id = "terrain-base-" + key;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", key === active ? "visible" : "none");
  }
}

export async function exportTerrainMap(
  map: Map, format: "png" | "pdf", title: string, details: string[], attribution: string,
) {
  const canvas = map.getCanvas();
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height + 82;
  const ctx = snapshot.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) throw new Error("Empty map");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, snapshot.width, snapshot.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(title, 10, canvas.height + 20, canvas.width - 20);
  ctx.font = "12px sans-serif";
  [...details, attribution].forEach((line, index) =>
    ctx.fillText(line, 10, canvas.height + 38 + index * 16, canvas.width - 20));
  if (format === "pdf") {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
    const scale = Math.min(273 / snapshot.width, 186 / snapshot.height);
    const width = snapshot.width * scale;
    const height = snapshot.height * scale;
    pdf.addImage(snapshot, "PNG", (297 - width) / 2, (210 - height) / 2, width, height);
    pdf.save("geomoz_mapa_3d.pdf");
    return;
  }
  const link = document.createElement("a");
  link.href = snapshot.toDataURL("image/png");
  link.download = "geomoz_mapa_3d.png";
  link.click();
}

export function satelliteTextureUrl(bounds: readonly number[], crs: string): string {
  const [left, bottom, right, top] = bounds;
  const aspect = (right - left) / (top - bottom);
  const width = Math.max(1, Math.round(Math.min(1024, 1024 * aspect)));
  const height = Math.max(1, Math.round(Math.min(1024, 1024 / aspect)));
  // Use identical input/output CRS and crop using the actual returned extent.
  const sr = crs.replace("EPSG:", "");
  const query = new URLSearchParams({
    bbox: bounds.join(","), bboxSR: sr, imageSR: sr,
    size: width + "," + height, format: "png32", f: "json",
  });
  return BASEMAPS.satellite.url.replace("/tile/{z}/{y}/{x}", "/export") + "?" + query;
}

export function useTerrainSatelliteTexture(url: string | null) {
  const [texture, setTexture] = useState<{ request: string; image: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setTexture(null);
    setFailed(null);
    void (async () => {
      const response = await fetch(url, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || typeof data.href !== "string" || !data.extent) throw new Error("Imagery unavailable");
      const bounds = new URL(url).searchParams.get("bbox")!.split(",").map(Number);
      const [left, bottom, right, top] = bounds;
      const { xmin, ymin, xmax, ymax } = data.extent;
      if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmax <= xmin || ymax <= ymin) {
        throw new Error("Invalid imagery extent");
      }
      const image = await fetch(data.href, { signal: controller.signal });
      if (!image.ok) throw new Error("Imagery unavailable");
      const bitmap = await createImageBitmap(await image.blob());
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const xScale = bitmap.width / (right - left);
        const yScale = bitmap.height / (top - bottom);
        context.drawImage(bitmap, (xmin - left) * xScale, (top - ymax) * yScale,
          (xmax - xmin) * xScale, (ymax - ymin) * yScale);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
        if (!blob) throw new Error("Imagery encoding failed");
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setTexture({ request: url, image: objectUrl });
        }
      } finally {
        bitmap.close();
      }
    })().catch(() => {
      if (!controller.signal.aborted) setFailed(url);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return { image: texture?.request === url ? texture?.image ?? null : null, failed: !!url && failed === url };
}
