import React, { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bbox } from "@turf/turf";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { GOOGLE_BASEMAPS, type BasemapType } from "@/lib/basemaps";
import {
  syncGISWorkspaceRasters,
  type GISWorkspaceRasterLayer,
  type GISWorkspaceRasterMetadata,
} from "@/lib/gis-raster";

export interface GISWorkspaceMapLayer {
  id: string;
  name: string;
  geojson: FeatureCollection;
  color: string;
  visible: boolean;
}

interface Props {
  layers: GISWorkspaceMapLayer[];
  rasterLayers?: GISWorkspaceRasterLayer[];
  activeLayerId?: string;
  basemap: BasemapType;
  aoiGeometry?: GeoJSON.GeoJSON | null;
  drawingEnabled?: boolean;
  onSelectLayer?: (layerId: string) => void;
  onDrawComplete?: (geometry: GeoJSON.GeoJSON, label: string) => void;
  onDrawCancel?: () => void;
  onRasterMetadata?: (metadata: GISWorkspaceRasterMetadata) => void;
  onRasterError?: (layerId: string, message: string) => void;
}

const AOI_SOURCE = "__geomoz_aoi";
const AOI_FILL = "__geomoz_aoi_fill";
const AOI_LINE = "__geomoz_aoi_line";
const DRAW_SOURCE = "__geomoz_draw";
const DRAW_FILL = "__geomoz_draw_fill";
const DRAW_LINE = "__geomoz_draw_line";

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function layerIds(layerId: string) {
  const base = `geomoz_${safeId(layerId)}`;
  return {
    source: `${base}_source`,
    fill: `${base}_fill`,
    outline: `${base}_outline`,
    line: `${base}_line`,
    point: `${base}_point`,
  };
}

function basemapStyle(basemap: BasemapType): StyleSpecification {
  const config = GOOGLE_BASEMAPS[basemap];
  const subdomain = config.subdomains?.[0] ?? "0";
  const tileUrl = config.url.replace("{s}", subdomain);
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution: config.attribution,
        maxzoom: config.maxZoom,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function appendTextRow(root: HTMLElement, key: string, value: unknown) {
  const row = document.createElement("div");
  row.style.fontSize = "11px";
  row.style.marginTop = "2px";
  const strong = document.createElement("strong");
  strong.textContent = `${key}: `;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(String(value ?? "—")));
  root.appendChild(row);
}

function polygonFeature(coords: [number, number][]): Feature<Polygon> | null {
  if (coords.length < 3) return null;
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
  };
}

export default function GISWorkspaceMapLibre({
  layers,
  rasterLayers = [],
  activeLayerId,
  basemap,
  aoiGeometry,
  drawingEnabled = false,
  onSelectLayer,
  onDrawComplete,
  onDrawCancel,
  onRasterMetadata,
  onRasterError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layersRef = useRef(layers);
  const rasterLayersRef = useRef(rasterLayers);
  const drawingRef = useRef(drawingEnabled);
  const drawCoordsRef = useRef<[number, number][]>([]);
  const onSelectLayerRef = useRef(onSelectLayer);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const onDrawCancelRef = useRef(onDrawCancel);
  const onRasterMetadataRef = useRef(onRasterMetadata);
  const onRasterErrorRef = useRef(onRasterError);
  const renderedLayerLookupRef = useRef(new Map<string, string>());
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);

  layersRef.current = layers;
  rasterLayersRef.current = rasterLayers;
  drawingRef.current = drawingEnabled;
  onSelectLayerRef.current = onSelectLayer;
  onDrawCompleteRef.current = onDrawComplete;
  onDrawCancelRef.current = onDrawCancel;
  onRasterMetadataRef.current = onRasterMetadata;
  onRasterErrorRef.current = onRasterError;

  const visibleCount = useMemo(
    () =>
      layers.filter((layer) => layer.visible).length +
      rasterLayers.filter((layer) => layer.visible).length,
    [layers, rasterLayers]
  );

  const syncAoi = (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;
    const existing = map.getSource(AOI_SOURCE) as maplibregl.GeoJSONSource | undefined;
    const data =
      aoiGeometry && (aoiGeometry as any).type
        ? (aoiGeometry as any)
        : ({ type: "FeatureCollection", features: [] } as FeatureCollection);

    if (existing) {
      existing.setData(data);
      return;
    }

    map.addSource(AOI_SOURCE, { type: "geojson", data });
    map.addLayer({
      id: AOI_FILL,
      type: "fill",
      source: AOI_SOURCE,
      paint: { "fill-color": "#f43f5e", "fill-opacity": 0.06 },
    });
    map.addLayer({
      id: AOI_LINE,
      type: "line",
      source: AOI_SOURCE,
      paint: {
        "line-color": "#f43f5e",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    });
  };

  const syncDrawPreview = (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;
    const feature = polygonFeature(drawCoordsRef.current);
    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: feature ? [feature] : [],
    };
    const existing = map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(DRAW_SOURCE, { type: "geojson", data });
    map.addLayer({
      id: DRAW_FILL,
      type: "fill",
      source: DRAW_SOURCE,
      paint: { "fill-color": "#4f46e5", "fill-opacity": 0.14 },
    });
    map.addLayer({
      id: DRAW_LINE,
      type: "line",
      source: DRAW_SOURCE,
      paint: { "line-color": "#4f46e5", "line-width": 2.5 },
    });
  };

  const syncLayers = (map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return;
    const desiredSources = new Set<string>();
    const lookup = new Map<string, string>();

    for (const layer of layersRef.current) {
      const ids = layerIds(layer.id);
      desiredSources.add(ids.source);
      const source = map.getSource(ids.source) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(layer.geojson);
      } else {
        map.addSource(ids.source, {
          type: "geojson",
          data: layer.geojson,
          promoteId: undefined,
        });

        map.addLayer({
          id: ids.fill,
          type: "fill",
          source: ids.source,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": layer.color,
            "fill-opacity": 0.33,
          },
        });
        map.addLayer({
          id: ids.outline,
          type: "line",
          source: ids.source,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": layer.color,
            "line-width": 2,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: ids.line,
          type: "line",
          source: ids.source,
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": layer.color,
            "line-width": 3,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: ids.point,
          type: "circle",
          source: ids.source,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": layer.color,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });
      }

      const visibility = layer.visible ? "visible" : "none";
      [ids.fill, ids.outline, ids.line, ids.point].forEach((id) => {
        if (!map.getLayer(id)) return;
        map.setLayoutProperty(id, "visibility", visibility);
        lookup.set(id, layer.id);
      });
      if (map.getLayer(ids.fill)) map.setPaintProperty(ids.fill, "fill-color", layer.color);
      if (map.getLayer(ids.outline)) map.setPaintProperty(ids.outline, "line-color", layer.color);
      if (map.getLayer(ids.line)) map.setPaintProperty(ids.line, "line-color", layer.color);
      if (map.getLayer(ids.point)) map.setPaintProperty(ids.point, "circle-color", layer.color);
    }

    const style = map.getStyle();
    for (const sourceId of Object.keys(style.sources ?? {})) {
      if (!sourceId.startsWith("geomoz_") || desiredSources.has(sourceId)) continue;
      const base = sourceId.replace(/_source$/, "");
      [`${base}_fill`, `${base}_outline`, `${base}_line`, `${base}_point`].forEach(
        (layerId) => {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
      );
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    renderedLayerLookupRef.current = lookup;
    syncAoi(map);
    syncDrawPreview(map);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(basemap),
      center: [35.5, -18.5],
      zoom: 5.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("load", () => {
      syncLayers(map);
      void syncGISWorkspaceRasters(map, rasterLayersRef.current, {
        onMetadata: (metadata) => onRasterMetadataRef.current?.(metadata),
        onError: (layerId, message) => onRasterErrorRef.current?.(layerId, message),
      });
    });
    map.on("mousemove", (event: MapMouseEvent) => {
      setCoords({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });
    map.on("mouseout", () => setCoords(null));

    map.on("click", (event: MapMouseEvent) => {
      if (drawingRef.current) {
        drawCoordsRef.current = [
          ...drawCoordsRef.current,
          [event.lngLat.lng, event.lngLat.lat],
        ];
        syncDrawPreview(map);
        return;
      }

      const renderedIds = Array.from(renderedLayerLookupRef.current.keys()).filter((id) =>
        Boolean(map.getLayer(id))
      );
      if (!renderedIds.length) return;
      const features = map.queryRenderedFeatures(event.point, { layers: renderedIds });
      const hit = features[0];
      if (!hit) return;

      const ownerId = renderedLayerLookupRef.current.get(hit.layer.id);
      if (ownerId) onSelectLayerRef.current?.(ownerId);
      const owner = layersRef.current.find((layer) => layer.id === ownerId);

      const popup = document.createElement("div");
      popup.style.maxWidth = "280px";
      const title = document.createElement("strong");
      title.textContent = owner?.name ?? "Camada";
      popup.appendChild(title);
      Object.entries((hit.properties ?? {}) as Record<string, unknown>)
        .slice(0, 8)
        .forEach(([key, value]) => appendTextRow(popup, key, value));

      new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
        .setLngLat(event.lngLat)
        .setDOMContent(popup)
        .addTo(map);
    });

    map.on("dblclick", (event: MapMouseEvent) => {
      if (!drawingRef.current) return;
      event.preventDefault();
      const feature = polygonFeature(drawCoordsRef.current);
      if (!feature) return;
      drawCoordsRef.current = [];
      syncDrawPreview(map);
      onDrawCompleteRef.current?.(feature, "AOI desenhada no GIS Workspace");
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is intentionally created once. Basemap/data changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(basemapStyle(basemap));
    map.once("style.load", () => {
      syncLayers(map);
      void syncGISWorkspaceRasters(map, rasterLayersRef.current, {
        onMetadata: (metadata) => onRasterMetadataRef.current?.(metadata),
        onError: (layerId, message) => onRasterErrorRef.current?.(layerId, message),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncLayers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, aoiGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    void syncGISWorkspaceRasters(map, rasterLayers, {
      onMetadata: (metadata) => onRasterMetadataRef.current?.(metadata),
      onError: (layerId, message) => onRasterErrorRef.current?.(layerId, message),
    });
  }, [rasterLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeLayerId) return;
    const active = layers.find((layer) => layer.id === activeLayerId);
    if (!active?.geojson?.features?.length) return;
    try {
      const [minX, minY, maxX, maxY] = bbox(active.geojson);
      if ([minX, minY, maxX, maxY].some((value) => !Number.isFinite(value))) return;
      if (minX === maxX && minY === maxY) {
        map.easeTo({ center: [minX, minY], zoom: Math.max(map.getZoom(), 14) });
      } else {
        map.fitBounds(
          [
            [minX, minY],
            [maxX, maxY],
          ],
          { padding: 60, maxZoom: 16, duration: 650 }
        );
      }
    } catch {}
  }, [activeLayerId, layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    drawCoordsRef.current = [];
    if (drawingEnabled) {
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
      if (map.isStyleLoaded()) syncDrawPreview(map);
    }
  }, [drawingEnabled]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
        MapLibre GL · {visibleCount} camada(s) visível(is)
      </div>
      {drawingEnabled && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-xl border border-indigo-200 bg-white/95 px-3 py-2 text-xs font-semibold text-indigo-700 shadow-md dark:border-indigo-800 dark:bg-slate-900/95 dark:text-indigo-300">
          Clique para adicionar vértices · duplo clique para concluir
          <button
            type="button"
            onClick={() => {
              drawCoordsRef.current = [];
              if (mapRef.current?.isStyleLoaded()) syncDrawPreview(mapRef.current);
              onDrawCancelRef.current?.();
            }}
            className="ml-3 text-rose-600 hover:underline"
          >
            Cancelar
          </button>
        </div>
      )}
      {coords && (
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md bg-slate-950/80 px-2 py-1 font-mono text-[10px] text-white">
          {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}
